import * as pdfParseModule from 'pdf-parse';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { supabase } from '../db/supabase.js';
import { generateEmbedding, generateQuestionsFromTextbook, analyzeStudentPaper } from './openrouterService.js';
import { performOcr } from './ocrService.js';

export interface Question {
  id: string;
  text: string;
  options?: string[];
  correctAnswer?: string;
  rubricKey?: string;
}

export interface EvaluationResult {
  ocrText: string;
  score: number;
  excelledAreas: string[];
  knowledgeGaps: string[];
  feedback: string;
  socraticHint: string;
}

// In-memory cache for uploaded textbook text
let cachedTextbookText: Record<string, string> = {};

/**
 * Helper: Smart paragraph-based semantic chunker
 * Groups sentences into high-quality paragraph blocks of target length (~600-800 chars)
 * Caps maximum chunks to maxChunks (e.g. 350) so huge textbooks process blazingly fast without memory/socket spikes
 */
function createSemanticParagraphChunks(rawText: string, targetLength = 700, maxChunks = 350): string[] {
  if (!rawText) return [];

  console.log(`\n===============================================================`);
  console.log(`📌 [STAGE 3/4] STARTING SEMANTIC PARAGRAPH CHUNKING`);
  console.log(`===============================================================`);

  const clean = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const rawParagraphs = clean.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of rawParagraphs) {
    if ((currentChunk.length + para.length) < targetLength) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk.length > 30) {
        chunks.push(currentChunk);
      }
      currentChunk = para;
    }

    if (chunks.length >= maxChunks) break;
  }

  if (currentChunk.length > 30 && chunks.length < maxChunks) {
    chunks.push(currentChunk);
  }

  // Fallback to sentence splitting if paragraphs were too few
  if (chunks.length < 5) {
    const sentences = clean.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 15);
    let buf = '';
    for (const sentence of sentences) {
      if ((buf.length + sentence.length) < targetLength) {
        buf += (buf ? ' ' : '') + sentence;
      } else {
        if (buf.length > 20) chunks.push(buf);
        buf = sentence;
      }
      if (chunks.length >= maxChunks) break;
    }
    if (buf.length > 20 && chunks.length < maxChunks) chunks.push(buf);
  }

  console.log(`✂️ [STAGE 3 RESULT] Created ${chunks.length} semantic chunks from ${rawText.length} characters of raw text.`);
  if (chunks.length > 0) {
    console.log(`   └─ Chunk #1 Preview (${chunks[0].length} chars): "${chunks[0].substring(0, 100).replace(/\n/g, ' ')}..."`);
    if (chunks.length > 1) {
      console.log(`   └─ Chunk #2 Preview (${chunks[1].length} chars): "${chunks[1].substring(0, 100).replace(/\n/g, ' ')}..."`);
    }
  }

  return chunks;
}

/**
 * Universal PDF Text Parser (Supports both pdf-parse v2 PDFParse class and v1 function)
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) return '';

  // 1. Try v2 PDFParse class
  try {
    const PDFParseClass = (pdfParseModule as any).PDFParse || (pdfParseModule as any).default?.PDFParse;
    if (typeof PDFParseClass === 'function') {
      const instance = new PDFParseClass({ data: buffer });
      const textRes = await instance.getText();
      const text = textRes?.text || '';
      try { await instance.destroy(); } catch (e) {}
      if (text && text.trim().length > 10) {
        return text;
      }
    }
  } catch (e) {
    // Fallback to legacy function
  }

  // 2. Try v1 pdf-parse function fallback
  try {
    const parseFn = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule as any).default;
    if (typeof parseFn === 'function') {
      const res = await parseFn(buffer);
      if (res && res.text && res.text.trim().length > 10) {
        return res.text;
      }
    }
  } catch (e) {
    // Ignore error
  }

  return '';
}

/**
 * 1. Ingest PDF/Text/ZIP/Local Directory Document into Supabase Knowledge Base with Vector Embeddings
 */
export async function ingestPdfDocument(
  filesInput: any,
  className: string,
  chapterTitle: string,
  fileName?: string
): Promise<{ text: string; chunksCount: number }> {
  // Normalize input into an array of file objects
  let rawFiles: Array<{ buffer: Buffer; originalname?: string }> = [];

  if (Array.isArray(filesInput)) {
    rawFiles = filesInput.map(f => ({
      buffer: f.buffer || f,
      originalname: f.originalname || f.name || 'document'
    }));
  } else if (filesInput && (filesInput.buffer || Buffer.isBuffer(filesInput))) {
    rawFiles = [{
      buffer: filesInput.buffer || filesInput,
      originalname: fileName || filesInput.originalname || 'document'
    }];
  }

  console.log(`\n===============================================================`);
  console.log(`🚀 [STAGE 1/4] KNOWLEDGE BASE INGESTION DISPATCHED`);
  console.log(`   Class Name: "${className}"`);
  console.log(`   Chapter/Topic: "${chapterTitle}"`);
  console.log(`   Files Attached: ${rawFiles.length > 0 ? `${rawFiles.length} file(s)` : 'None'}`);
  console.log(`===============================================================\n`);

  let extractedTextParts: string[] = [];

  for (const fileObj of rawFiles) {
    const fBuffer = fileObj.buffer;
    const fName = fileObj.originalname || 'document';
    if (!fBuffer || fBuffer.length === 0) continue;

    const lowerName = fName.toLowerCase();
    const isZip = lowerName.endsWith('.zip') ||
      (fBuffer.length > 4 && fBuffer[0] === 0x50 && fBuffer[1] === 0x4b && fBuffer[2] === 0x03 && fBuffer[3] === 0x04);

    if (isZip) {
      console.log(`📦 Archive detected: Unzipping Knowledge Base archive (${fName})...`);
      try {
        const zip = new AdmZip(fBuffer);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
          if (entry.isDirectory) continue;
          const entryName = entry.entryName;
          if (entryName.startsWith('__MACOSX/') || entryName.startsWith('.') || entryName.includes('/.')) continue;

          try {
            const entryData = entry.getData();
            const lowerEntry = entryName.toLowerCase();
            let textContent = '';

            if (lowerEntry.endsWith('.pdf')) {
              textContent = await parsePdfBuffer(entryData);
            } else if (/\.(jpg|jpeg|png|webp|bmp)$/i.test(lowerEntry)) {
              console.log(`  🖼️ [ZIP Extract] Performing Vision OCR on image: ${entryName}...`);
              const ocrRes = await performOcr(entryData, 'English');
              textContent = ocrRes.ocrText;
            } else if (/\.(txt|md|json|csv|rtf|tsv|html|htm|xml|text)$/i.test(lowerEntry)) {
              textContent = entryData.toString('utf-8');
            }

            textContent = textContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, ' ').trim();

            if (textContent && textContent.length > 20) {
              extractedTextParts.push(`--- CHAPTER FILE: ${entryName} ---\n${textContent}`);
              console.log(`     └─ Extracted ${textContent.length} characters from ${entryName}`);
            }
          } catch (entryErr) {
            console.warn(`⚠️ Warning extracting ${entryName} from zip:`, entryErr);
          }
        }
      } catch (zipErr) {
        console.error('❌ Error reading ZIP file:', zipErr);
      }
    } else {
      // Standalone File (PDF, Image, Text)
      try {
        let textContent = '';
        if (lowerName.endsWith('.pdf') || fBuffer[0] === 0x25) {
          textContent = await parsePdfBuffer(fBuffer);
        } else if (/\.(jpg|jpeg|png|webp|bmp)$/i.test(lowerName)) {
          console.log(`  🖼️ Performing Vision OCR on uploaded chapter image: ${fName}...`);
          const ocrRes = await performOcr(fBuffer, 'English');
          textContent = ocrRes.ocrText;
        } else if (/\.(txt|md|json|csv|rtf|tsv|html|htm|xml|text)$/i.test(lowerName)) {
          textContent = fBuffer.toString('utf-8');
        }

        textContent = textContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, ' ').trim();
        if (textContent && textContent.length > 10) {
          extractedTextParts.push(`--- CHAPTER FILE: ${fName} ---\n${textContent}`);
          console.log(`✅ Extracted ${textContent.length} characters from ${fName}`);
        }
      } catch (err) {
        console.warn(`⚠️ File parse notice for ${fName}:`, err);
      }
    }
  }

  let extractedText = extractedTextParts.join('\n\n');

  // Fallback text ONLY if no user files were provided and no text was extracted
  if (!extractedText || extractedText.trim().length < 10) {
    console.warn(`⚠️ [STAGE 2 NOTICE] No custom document text extracted. Using general curriculum context for ${className}.`);
    extractedText = `CHAPTER: ${chapterTitle || 'General Assessment'} (Course / Class: ${className}).
Core Subject Overview: Comprehensive study material for ${className} covering key concepts, foundational principles, theoretical frameworks, definitions, and practical applications in ${chapterTitle || 'the curriculum'}.
Key Learning Objectives: Master core terminology, understand foundational theories, analyze key principles, and synthesize subject knowledge for ${className}.`;
  }

  cachedTextbookText[className] = extractedText;

  // Split PDF text into semantic paragraph chunks (caps at max 350 chunks, ~700 chars per chunk)
  const chunks = createSemanticParagraphChunks(extractedText, 700, 350);

  console.log(`\n===============================================================`);
  console.log(`🧠 [STAGE 4/4] GENERATING VECTOR EMBEDDINGS & STORING IN DATABASE`);
  console.log(`   Total Chunks to Vectorize: ${chunks.length}`);
  console.log(`===============================================================`);

  // Generate vector float array embeddings for each chunk in throttled batches to avoid network socket flooding
  try {
    const records: Array<{ class_name: string; chapter_title: string; content_chunk: string; embedding: number[] }> = [];
    const batchSize = 15;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const chunkBatch = chunks.slice(i, i + batchSize);
      const batchRecords = await Promise.all(
        chunkBatch.map(async chunk => {
          const embeddingVector = await generateEmbedding(chunk);
          return {
            class_name: className,
            chapter_title: chapterTitle || 'General Chapter',
            content_chunk: chunk,
            embedding: embeddingVector
          };
        })
      );
      records.push(...batchRecords);
      console.log(`  ⚡ [STAGE 4 PROGRESS] Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${records.length}/${chunks.length} chunks vectorized)`);
      // Small 50ms pause between batches to keep network sockets completely healthy
      if (i + batchSize < chunks.length) {
        await new Promise(res => setTimeout(res, 50));
      }
    }

    if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
      console.log(`💾 Inserting ${records.length} records into Supabase textbook_embeddings table in batches...`);
      // Clear existing chunks for this class
      await supabase.from('textbook_embeddings').delete().eq('class_name', className);
      
      // Batch DB inserts in groups of 40 records to avoid Supabase statement timeouts
      const dbBatchSize = 40;
      let totalInserted = 0;
      for (let i = 0; i < records.length; i += dbBatchSize) {
        const slice = records.slice(i, i + dbBatchSize);
        const { error: insErr } = await supabase.from('textbook_embeddings').insert(slice);
        if (insErr) {
          console.warn(`⚠️ Supabase DB insert notice (batch ${Math.floor(i / dbBatchSize) + 1}):`, insErr.message);
        } else {
          totalInserted += slice.length;
        }
      }
      console.log(`✅ [STAGE 4 SUCCESS] Successfully inserted ${totalInserted}/${records.length} vector embedding records into Supabase textbook_embeddings table!`);
    }
  } catch (err) {
    console.warn('Embedding store exception notice:', err);
  }

  return { text: extractedText, chunksCount: chunks.length };
}

/**
 * 2. Generate Question Pool directly from Indexed Textbook Content via OpenRouter AI with Sub-Topic Scope
 */
export async function generateRagQuestions(
  topic: string,
  className: string,
  language: string = 'English',
  subTopicScope: string = ''
): Promise<Question[]> {
  console.log(`\n===============================================================`);
  console.log(`🎯 [RAG QUESTION GENERATOR] RETRIEVING TEXTBOOK CONTEXT FOR: "${topic}" (${className})`);
  console.log(`===============================================================`);

  let textbookContent = cachedTextbookText[className] || '';

  // If cachedTextbookText is empty for className, attempt to pull chunks from Supabase pgvector
  if (!textbookContent && process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
    try {
      const { data: storedChunks } = await supabase
        .from('textbook_embeddings')
        .select('content_chunk')
        .eq('class_name', className)
        .limit(20);

      if (storedChunks && storedChunks.length > 0) {
        textbookContent = storedChunks.map(r => r.content_chunk).join('\n---\n');
        console.log(`📥 Retrieved ${storedChunks.length} indexed vector chunks from database for ${className}.`);
      }
    } catch (dbErr) {
      console.warn('Database chunk retrieval notice:', dbErr);
    }
  }

  // Vector Similarity Filter for specific topic / subTopicScope if provided
  const queryToSearch = subTopicScope || topic || className;
  try {
    const scopeVector = await generateEmbedding(queryToSearch);
    const { data: scopeChunks } = await supabase.rpc('match_textbook_chunks', {
      query_embedding: scopeVector,
      match_threshold: 0.15,
      match_count: 8,
      filter_class_name: className
    });

    if (scopeChunks && scopeChunks.length > 0) {
      textbookContent = scopeChunks.map((r: any) => r.content_chunk).join('\n---\n');
      console.log(`🎯 Vector similarity match found ${scopeChunks.length} relevant chunks matching query "${queryToSearch}".`);
    }
  } catch (e) {
    console.warn('SubTopic Vector Scope Filter Notice:', e);
  }

  if (!textbookContent) {
    textbookContent = `Topic: ${topic}. Class: ${className}. Core principles and chapter concepts.`;
  }

  console.log(`📝 Sending ${textbookContent.length} characters of actual textbook context to Gemini LLM for question generation...`);
  return generateQuestionsFromTextbook(topic, className, textbookContent, subTopicScope);
}


export const MODEL_THRESHOLDS = {
  VECTOR_MATCH_THRESHOLD: parseFloat(process.env.VECTOR_MATCH_THRESHOLD || '0.30'),
  VECTOR_MATCH_COUNT: parseInt(process.env.VECTOR_MATCH_COUNT || '5', 10),
  MIN_OCR_LENGTH: parseInt(process.env.MIN_OCR_LENGTH || '15', 10),
  SCORE_AUTO_APPROVE: parseInt(process.env.SCORE_AUTO_APPROVE || '90', 10),
  SCORE_ATTENTION_REQUIRED: parseInt(process.env.SCORE_ATTENTION_REQUIRED || '50', 10)
};

/**
 * 3. Direct Google Gemini Vision LLM & Vector RAG Student Answer Evaluation
 */
export async function evaluateStudentAnswerAgainstPdf(
  ocrText: string,
  className: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType?: string,
  assignedQuestions?: Question[]
): Promise<EvaluationResult & { questionEvaluations?: any[] }> {
  let pdfChunks: string[] = [];

  // 1. Vector Cosine Similarity Search & Context Retrieval
  try {
    if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
      
      // Generate 1536-dimensional vector embedding for the student OCR text / query
      const queryEmbedding = await generateEmbedding(ocrText || className);

      // Perform Cosine Similarity Vector Search in Supabase pgvector using configured threshold
      const { data: vectorMatchData, error: rpcError } = await supabase.rpc('match_textbook_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: MODEL_THRESHOLDS.VECTOR_MATCH_THRESHOLD,
        match_count: MODEL_THRESHOLDS.VECTOR_MATCH_COUNT,
        filter_class_name: className
      });

      if (!rpcError && vectorMatchData && vectorMatchData.length > 0) {
        console.log(`🎯 Vector Cosine Similarity match returned ${vectorMatchData.length} relevant chunks.`);
        pdfChunks = vectorMatchData.map((r: any) => r.content_chunk);
      } else {
        // Fallback: Fetch indexed textbook chunks by class_name metadata
        const { data, error } = await supabase
          .from('textbook_embeddings')
          .select('content_chunk')
          .eq('class_name', className);

        if (!error && data && data.length > 0) {
          pdfChunks = data.map(r => r.content_chunk);
        }
      }
    }
  } catch (err) {
    console.warn('Error performing vector search:', err);
  }


  // Use OpenRouter Vision LLM to perform OCR transcription and contextual RAG evaluation with assigned questions
  const visionRes = await analyzeStudentPaper(imageInput || null, mimeType || 'image/jpeg', pdfChunks, assignedQuestions || []);

  return {
    ocrText: visionRes.ocrText || ocrText,
    score: visionRes.score,
    excelledAreas: visionRes.excelledAreas,
    knowledgeGaps: visionRes.knowledgeGaps,
    feedback: visionRes.feedback,
    socraticHint: visionRes.socraticHint,
    questionEvaluations: visionRes.questionEvaluations
  };
}


import * as pdfParseModule from 'pdf-parse';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { supabase } from '../db/supabase.js';
import { 
  generateEmbedding, 
  generateQuestionsFromTextbook, 
  analyzeStudentPaper, 
  getConfiguredGeminiModel,
  extractSyllabusStructureWithAI,
  generateTopicQuestionsByType,
  SyllabusTopicItem,
  TopicQuestionCounts,
  extractChapterMetadataWithAI,
  generateExamQuestionsUnified,
  ChapterMetadata,
  UnifiedExamParams,
  ChapterBlueprintItem
} from './aiService.js';
import { performOcr } from './ocrService.js';
import { pruneTextbookChunks } from './aiGateway/index.js';

export interface Question {
  id: string;
  text: string;
  marks?: number;
  section?: string;
  options?: string[];
  correctAnswer?: string;
  rubricKey?: string;
  type?: string;
  number?: string;
  partLabel?: string;
  questionNo?: string;
  stem?: string;
  hasVisual?: boolean;
  stimulus?: { page?: number; caption?: string; url?: string }[];
}

export interface EvaluationResult {
  ocrText: string;
  score: number;
  maxScore: number;
  excelledAreas: string[];
  knowledgeGaps: string[];
  feedback: string;
  socraticHint: string;
  evaluationProvider: 'sarvam' | string | 'manual';
  evaluationStatus: 'completed' | 'fallback_completed' | 'manual_review';
  fallbackReason?: string;
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
              const ocrRes = await performOcr(entryData, 'English', 'image/jpeg', className);
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
          const ocrRes = await performOcr(fBuffer, 'English', 'image/jpeg', className);
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
 * Fetch indexed curriculum topics for a class/subject
 */
export async function getCurriculumTopics(className: string): Promise<any[]> {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    return [];
  }
  try {
    const { data, error } = await supabase
      .from('curriculum_topics')
      .select('*')
      .eq('class_name', className)
      .order('unit_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('⚠️ Supabase getCurriculumTopics notice:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('⚠️ getCurriculumTopics exception:', err);
    return [];
  }
}

/**
 * Save / Update curriculum topics for a class/subject
 */
export async function saveCurriculumTopics(className: string, topics: any[]): Promise<any[]> {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    return topics;
  }
  try {
    // Clear old topics for this class
    await supabase.from('curriculum_topics').delete().eq('class_name', className);

    if (!Array.isArray(topics) || topics.length === 0) return [];

    const records = topics.map((t, idx) => ({
      class_name: className,
      unit_number: typeof t.unit_number === 'number' ? t.unit_number : (typeof t.unitNumber === 'number' ? t.unitNumber : idx + 1),
      unit_name: t.unit_name || t.unitName || `Unit ${idx + 1}`,
      topic_name: t.topic_name || t.topicName || `Topic ${idx + 1}`,
      subtopics: Array.isArray(t.subtopics) ? t.subtopics : [],
      prescribed_weightage: typeof t.prescribed_weightage === 'number' ? t.prescribed_weightage : (typeof t.prescribedWeightage === 'number' ? t.prescribedWeightage : 5),
      page_start: t.page_start || t.pageStart || null,
      page_end: t.page_end || t.pageEnd || null
    }));

    const { data, error } = await supabase.from('curriculum_topics').insert(records).select('*');
    if (error) {
      console.warn('⚠️ Supabase saveCurriculumTopics notice:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('⚠️ saveCurriculumTopics exception:', err);
    return [];
  }
}

/**
 * Delete a single curriculum topic by ID
 */
export async function deleteCurriculumTopic(id: string): Promise<boolean> {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    return true;
  }
  try {
    const { error } = await supabase.from('curriculum_topics').delete().eq('id', id);
    if (error) {
      console.warn('⚠️ Supabase deleteCurriculumTopic notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('⚠️ deleteCurriculumTopic exception:', err);
    return false;
  }
}

/**
 * Delete all curriculum topics for a class/subject
 */
export async function deleteAllCurriculumTopics(className: string): Promise<boolean> {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    return true;
  }
  try {
    const { error } = await supabase.from('curriculum_topics').delete().eq('class_name', className);
    if (error) {
      console.warn('⚠️ Supabase deleteAllCurriculumTopics notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('⚠️ deleteAllCurriculumTopics exception:', err);
    return false;
  }
}

export interface CurriculumChapterRecord {
  id?: string;
  class_name: string;
  subject_name: string;
  chapter_number: number;
  chapter_title: string;
  subtopics: string[];
  pdf_url?: string;
  chunk_count?: number;
  created_at?: string;
}

/**
 * Chapter-Wise PDF Ingestion Pipeline
 * 1. Extracts readable text from uploaded chapter PDF.
 * 2. Uses Gemini to determine/confirm Chapter Number, Chapter Title, and Core Subtopics.
 * 3. Saves chapter record into curriculum_chapters.
 * 4. Chunks document with chapter metadata.
 * 5. Safely deletes ONLY previous chunks for this specific chapter.
 * 6. Vectorizes chunks into textbook_embeddings table in Supabase.
 */
export async function ingestChapterDocument(
  filesInput: any,
  className: string,
  subjectName: string,
  chapterTitle?: string,
  chapterNumber?: number
): Promise<{ success: boolean; chapter: CurriculumChapterRecord; chunksCount: number; message: string }> {
  let rawFiles: Array<{ buffer: Buffer; originalname?: string }> = [];

  if (Array.isArray(filesInput)) {
    rawFiles = filesInput.map(f => ({
      buffer: f.buffer || f,
      originalname: f.originalname || f.name || 'document.pdf'
    }));
  } else if (filesInput && (filesInput.buffer || Buffer.isBuffer(filesInput))) {
    rawFiles = [{
      buffer: filesInput.buffer || filesInput,
      originalname: filesInput.originalname || 'document.pdf'
    }];
  }

  if (rawFiles.length === 0) {
    throw new Error('No chapter PDF document provided for ingestion.');
  }

  console.log(`\n===============================================================`);
  console.log(`📚 [CHAPTER-WISE INGESTION DISPATCHED]`);
  console.log(`   Class / Grade  : "${className}"`);
  console.log(`   Subject        : "${subjectName}"`);
  console.log(`   Chapter Title  : "${chapterTitle || 'Auto-detect'}"`);
  console.log(`   Chapter Number : ${chapterNumber || 'Auto-detect'}`);
  console.log(`   File(s)        : ${rawFiles.length}`);
  console.log(`===============================================================\n`);

  let extractedTextParts: string[] = [];

  for (const fileObj of rawFiles) {
    const fBuffer = fileObj.buffer;
    const fName = fileObj.originalname || 'document.pdf';
    if (!fBuffer || fBuffer.length === 0) continue;

    const lowerName = fName.toLowerCase();
    if (lowerName.endsWith('.pdf') || fBuffer[0] === 0x25) {
      const text = await parsePdfBuffer(fBuffer);
      if (text && text.trim().length > 10) {
        extractedTextParts.push(text.trim());
      }
    } else if (/\.(txt|md|json|csv|rtf|tsv)$/i.test(lowerName)) {
      extractedTextParts.push(fBuffer.toString('utf-8'));
    }
  }

  const fullChapterText = extractedTextParts.join('\n\n').trim();
  if (!fullChapterText || fullChapterText.length < 20) {
    throw new Error('Could not extract readable text from the uploaded chapter document. Ensure it is not an empty or password-protected PDF.');
  }

  // Auto-extract metadata and subtopics using AI
  const fileName = rawFiles[0]?.originalname || 'Chapter.pdf';
  const metadata = await extractChapterMetadataWithAI(
    fullChapterText,
    fileName,
    chapterTitle,
    chapterNumber
  );

  const finalChapterNumber = chapterNumber || metadata.chapterNumber || 1;
  const finalChapterTitle = chapterTitle?.trim() || metadata.chapterTitle || `Chapter ${finalChapterNumber}`;
  const finalSubtopics = metadata.subtopics.length > 0 ? metadata.subtopics : [`Key Concepts of ${finalChapterTitle}`];

  console.log(`📝 [CHAPTER METADATA RESOLVED]`);
  console.log(`   ├─ Chapter Number : ${finalChapterNumber}`);
  console.log(`   ├─ Chapter Title  : "${finalChapterTitle}"`);
  console.log(`   └─ Subtopics (${finalSubtopics.length}): ${finalSubtopics.join(', ')}`);

  // Save to curriculum_chapters table in Supabase
  let savedChapterId: string | undefined = undefined;
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
    try {
      const payload: any = {
        class_name: className,
        subject_name: subjectName,
        chapter_number: finalChapterNumber,
        chapter_title: finalChapterTitle,
        subtopics: finalSubtopics
      };

      const { data: upsertData, error: upsertErr } = await supabase
        .from('curriculum_chapters')
        .upsert(payload, { onConflict: 'class_name,subject_name,chapter_number' })
        .select('*')
        .single();

      if (upsertErr) {
        console.warn('⚠️ curriculum_chapters upsert notice (table may need creation):', upsertErr.message);
      } else if (upsertData) {
        savedChapterId = upsertData.id;
      }
    } catch (dbErr: any) {
      console.warn('⚠️ curriculum_chapters DB notice:', dbErr?.message || dbErr);
    }
  }

  // Create semantic chunks
  const chunks = createSemanticParagraphChunks(fullChapterText, 700, 250);
  console.log(`✂️ Created ${chunks.length} semantic chunks for Chapter ${finalChapterNumber}: "${finalChapterTitle}".`);

  // Vectorize and insert into Supabase pgvector
  let totalInserted = 0;
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
    try {
      // SAFE DELETE: Delete ONLY existing chunks for this specific chapter! Never wipe other chapters!
      await supabase
        .from('textbook_embeddings')
        .delete()
        .eq('class_name', className)
        .eq('chapter_title', finalChapterTitle);

      const recordsToInsert = chunks.map((chunkText) => {
        const taggedChunk = `[CHAPTER ${finalChapterNumber}: ${finalChapterTitle} | SUBJECT: ${subjectName} | CLASS: ${className}]\n${chunkText}`;
        return {
          class_name: className,
          chapter_title: finalChapterTitle,
          topic_name: finalChapterTitle,
          unit_name: `Chapter ${finalChapterNumber}`,
          content_chunk: taggedChunk
        };
      });

      const batchSize = 15;
      for (let i = 0; i < recordsToInsert.length; i += batchSize) {
        const slice = recordsToInsert.slice(i, i + batchSize);
        const embeddedSlice = await Promise.all(
          slice.map(async item => {
            const embeddingVector = await generateEmbedding(item.content_chunk);
            return {
              ...item,
              embedding: embeddingVector
            };
          })
        );

        const { error: insErr } = await supabase.from('textbook_embeddings').insert(embeddedSlice);
        if (insErr) {
          console.warn(`⚠️ Vector insert notice (batch ${Math.floor(i / batchSize) + 1}):`, insErr.message);
        } else {
          totalInserted += embeddedSlice.length;
        }

        if (i + batchSize < recordsToInsert.length) {
          await new Promise(r => setTimeout(r, 60));
        }
      }

      // Update chunk_count on curriculum_chapters
      if (savedChapterId) {
        await supabase
          .from('curriculum_chapters')
          .update({ chunk_count: totalInserted })
          .eq('id', savedChapterId);
      }
      console.log(`✅ [CHAPTER INGESTION SUCCESS] Indexed ${totalInserted} vector chunks for Chapter ${finalChapterNumber}: "${finalChapterTitle}".`);
    } catch (embErr: any) {
      console.warn('⚠️ Vector store exception notice:', embErr?.message || embErr);
    }
  }

  // Update in-memory cache
  cachedTextbookText[`${className}:::${subjectName}:::${finalChapterTitle}`] = fullChapterText;
  cachedTextbookText[className] = (cachedTextbookText[className] ? cachedTextbookText[className] + '\n\n' : '') + fullChapterText;

  const resultChapter: CurriculumChapterRecord = {
    id: savedChapterId,
    class_name: className,
    subject_name: subjectName,
    chapter_number: finalChapterNumber,
    chapter_title: finalChapterTitle,
    subtopics: finalSubtopics,
    chunk_count: totalInserted || chunks.length
  };

  return {
    success: true,
    chapter: resultChapter,
    chunksCount: totalInserted || chunks.length,
    message: `Successfully ingested Chapter ${finalChapterNumber}: "${finalChapterTitle}" (${totalInserted || chunks.length} chunks indexed into knowledge base).`
  };
}

/**
 * Fetch all ingested chapters & subtopics for a subject/class
 */
export async function getSubjectChapters(className: string, subjectName?: string): Promise<CurriculumChapterRecord[]> {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    return [];
  }
  try {
    let query = supabase
      .from('curriculum_chapters')
      .select('*')
      .eq('class_name', className)
      .order('chapter_number', { ascending: true });

    if (subjectName) {
      query = query.eq('subject_name', subjectName);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }

    // Fallback: If curriculum_chapters is empty or not yet created, discover chapters from textbook_embeddings!
    const { data: embData } = await supabase
      .from('textbook_embeddings')
      .select('chapter_title, unit_name, topic_name')
      .eq('class_name', className);

    if (embData && embData.length > 0) {
      const distinctTitles = Array.from(new Set(embData.map(d => d.chapter_title).filter(Boolean)));
      return distinctTitles.map((title, idx) => ({
        class_name: className,
        subject_name: subjectName || 'General',
        chapter_number: idx + 1,
        chapter_title: title,
        subtopics: [],
        chunk_count: embData.filter(d => d.chapter_title === title).length
      }));
    }

    return [];
  } catch (err: any) {
    console.warn('⚠️ getSubjectChapters exception:', err?.message || err);
    return [];
  }
}

/**
 * Delete a single chapter and its vector chunks (never touches other chapters)
 */
export async function deleteSubjectChapter(chapterIdOrTitle: string, className?: string): Promise<boolean> {
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    return true;
  }
  try {
    let chapterRecord: any = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterIdOrTitle);
    if (isUuid) {
      const { data } = await supabase.from('curriculum_chapters').select('*').eq('id', chapterIdOrTitle).single();
      chapterRecord = data;
    }
    if (!chapterRecord && className) {
      const { data } = await supabase
        .from('curriculum_chapters')
        .select('*')
        .eq('class_name', className)
        .eq('chapter_title', chapterIdOrTitle)
        .single();
      chapterRecord = data;
    }

    const chapterTitleToDelete = chapterRecord?.chapter_title || chapterIdOrTitle;
    const targetClass = chapterRecord?.class_name || className;

    // Delete embeddings for this specific chapter
    if (targetClass && chapterTitleToDelete) {
      await supabase
        .from('textbook_embeddings')
        .delete()
        .eq('class_name', targetClass)
        .eq('chapter_title', chapterTitleToDelete);
    }

    // Delete from curriculum_chapters
    if (isUuid) {
      await supabase.from('curriculum_chapters').delete().eq('id', chapterIdOrTitle);
    } else if (targetClass) {
      await supabase
        .from('curriculum_chapters')
        .delete()
        .eq('class_name', targetClass)
        .eq('chapter_title', chapterTitleToDelete);
    }

    console.log(`🗑️ Successfully deleted chapter "${chapterTitleToDelete}" and its vector embeddings.`);
    return true;
  } catch (err: any) {
    console.warn('⚠️ deleteSubjectChapter notice:', err?.message || err);
    return false;
  }
}

/**
 * Generate Unified Exam Paper strictly matching teacher's requested question breakdown and selected subtopics
 */
export async function generateUnifiedExamPaper(params: {
  examTitle: string;
  targetMarks: number;
  className: string;
  subjectName: string;
  chapterTitles?: string[];
  subtopics?: string[];
  questionCounts: {
    mcqCount: number;         // 1m
    veryShortCount: number;   // 2m
    shortCount: number;       // 3m
    descriptiveCount: number; // 5m
  };
  blueprint?: ChapterBlueprintItem[];
  language?: string;
  difficulty?: string;
}): Promise<any> {
  const {
    examTitle,
    targetMarks,
    className,
    subjectName,
    chapterTitles = [],
    subtopics = [],
    questionCounts,
    blueprint = [],
    language = 'English',
    difficulty = 'Standard'
  } = params;

  // If blueprint provided, derive effective questionCounts, chapters, and subtopics
  let effectiveQuestionCounts = questionCounts;
  let effectiveChapterTitles = chapterTitles;
  let effectiveSubtopics = subtopics;

  if (blueprint && blueprint.length > 0) {
    // Normalize blueprint items in case alias keys (topic, mcq, vsa, sa, long) were sent
    blueprint.forEach((b: any) => {
      b.chapterTitle = b.chapterTitle || b.topic || 'Chapter';
      b.mcqCount = Number(b.mcqCount ?? b.mcq) || 0;
      b.veryShortCount = Number(b.veryShortCount ?? b.vsa) || 0;
      b.shortCount = Number(b.shortCount ?? b.sa) || 0;
      b.descriptiveCount = Number(b.descriptiveCount ?? b.long) || 0;
    });

    const derivedCounts = blueprint.reduce((acc, item: any) => ({
      mcqCount: acc.mcqCount + (Number(item.mcqCount) || 0),
      veryShortCount: acc.veryShortCount + (Number(item.veryShortCount) || 0),
      shortCount: acc.shortCount + (Number(item.shortCount) || 0),
      descriptiveCount: acc.descriptiveCount + (Number(item.descriptiveCount) || 0)
    }), { mcqCount: 0, veryShortCount: 0, shortCount: 0, descriptiveCount: 0 });

    if (derivedCounts.mcqCount > 0 || derivedCounts.veryShortCount > 0 || derivedCounts.shortCount > 0 || derivedCounts.descriptiveCount > 0) {
      effectiveQuestionCounts = derivedCounts;
    }

    if (effectiveChapterTitles.length === 0) {
      effectiveChapterTitles = blueprint.map((b: any) => b.chapterTitle);
    }

    const blueprintSubs = blueprint.flatMap((b: any) => b.subtopics || []);
    if (blueprintSubs.length > 0) {
      effectiveSubtopics = Array.from(new Set([...effectiveSubtopics, ...blueprintSubs]));
    }
  }

  console.log(`\n===============================================================`);
  console.log(`🎯 [RAG UNIFIED EXAM PIPELINE] Initiating Paper Generation`);
  console.log(`   ├─ Exam Title   : "${examTitle}" | Target Marks: ${targetMarks}`);
  console.log(`   ├─ Class / Cohort: ${className} | Subject: ${subjectName}`);
  console.log(`   ├─ Chapters (${effectiveChapterTitles.length}): ${effectiveChapterTitles.length > 0 ? effectiveChapterTitles.join(', ') : 'All available'}`);
  console.log(`   ├─ Subtopics (${effectiveSubtopics.length}): ${effectiveSubtopics.length > 0 ? effectiveSubtopics.slice(0, 5).join(', ') + (effectiveSubtopics.length > 5 ? ` (+${effectiveSubtopics.length - 5} more)` : '') : 'All available'}`);
  if (blueprint && blueprint.length > 0) {
    console.log(`   └─ Blueprint Items : ${blueprint.length} chapter allocations active`);
  }
  console.log(`===============================================================`);

  let gatheredChunks: string[] = [];

  if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
    try {
      console.log(`\n📚 [RAG VECTOR RETRIEVAL] Querying Supabase 'textbook_embeddings' for ${className}...`);
      let query = supabase
        .from('textbook_embeddings')
        .select('content_chunk, chapter_title, topic_name')
        .eq('class_name', className);

      if (chapterTitles.length > 0) {
        query = query.in('chapter_title', chapterTitles);
      }

      const { data: chunksData, error: chunkErr } = await query.limit(40);
      if (!chunkErr && Array.isArray(chunksData) && chunksData.length > 0) {
        gatheredChunks = chunksData.map(c => c.content_chunk);
        const totalChars = gatheredChunks.reduce((acc, c) => acc + c.length, 0);
        console.log(`   └─ Fetched ${gatheredChunks.length} scoped chunks from database (${(totalChars / 1024).toFixed(1)} KB text).`);
      } else if (chunkErr) {
        console.warn(`   ⚠️ Database chunk query warning:`, chunkErr.message);
      }
    } catch (dbErr: any) {
      console.warn('   ⚠️ Chunk retrieval notice:', dbErr?.message || dbErr);
    }
  }

  // Fallback to cache if database yielded nothing
  if (gatheredChunks.length === 0) {
    if (cachedTextbookText[className]) {
      console.log(`📚 [RAG CACHE] Utilizing cached textbook material for "${className}" (${(cachedTextbookText[className].length / 1024).toFixed(1)} KB).`);
      gatheredChunks.push(cachedTextbookText[className]);
    } else {
      console.log(`📚 [RAG NOTICE] No specific textbook chunks found for "${className}". Utilizing standard curriculum principles.`);
    }
  }

  // Semantic Context Pruning (Token Reduction Engine)
  const optimization = pruneTextbookChunks(gatheredChunks, subtopics, 8500, 3, 8);
  if (optimization.reductionPercent > 0) {
    console.log(`\n✂️ [TOKEN OPTIMIZER] Context Pruning:`);
    console.log(`   ├─ Raw Chunks    : ${optimization.totalChunksCount} (${optimization.originalChars} chars)`);
    console.log(`   ├─ Scoped Chunks : ${optimization.selectedChunksCount} (${optimization.optimizedChars} chars)`);
    console.log(`   └─ Token Savings : ${optimization.reductionPercent}% tokens slashed (~${Math.round((optimization.originalChars - optimization.optimizedChars) / 4)} tokens pruned)`);
  }
  const combinedContext = optimization.context;

  // Call AI Generator with unified question types and topic blueprint
  const questions = await generateExamQuestionsUnified({
    examTitle,
    className,
    subjectName,
    targetMarks,
    language,
    difficulty,
    selectedChapters: effectiveChapterTitles,
    selectedSubtopics: effectiveSubtopics,
    questionCounts: effectiveQuestionCounts,
    blueprint,
    textbookContext: combinedContext
  });

  // Partition by Section
  const sectionA = questions.filter(q => q.section === 'Section A' || q.type === 'mcq' || q.marks === 1);
  const sectionB = questions.filter(q => q.section === 'Section B' || q.type === 'vsa' || q.marks === 2);
  const sectionC = questions.filter(q => q.section === 'Section C' || q.type === 'sa' || q.marks === 3);
  const sectionD = questions.filter(q => q.section === 'Section D' || q.type === 'descriptive' || (q.marks || 0) >= 4);

  // Sequential numbering
  let qNum = 1;
  const renumber = (list: Question[], sectionLabel: string) => {
    return list.map(q => {
      const numStr = String(qNum++);
      return {
        ...q,
        number: numStr,
        questionNo: numStr,
        section: sectionLabel
      };
    });
  };

  const finalSectionA = renumber(sectionA, 'Section A (Multiple Choice Questions - 1 Mark each)');
  const finalSectionB = renumber(sectionB, 'Section B (Very Short Answer Questions - 2 Marks each)');
  const finalSectionC = renumber(sectionC, 'Section C (Short Answer Questions - 3 Marks each)');
  const finalSectionD = renumber(sectionD, 'Section D (Long Answer / Descriptive Questions - 5 Marks each)');

  const finalQuestions = [...finalSectionA, ...finalSectionB, ...finalSectionC, ...finalSectionD];
  const calculatedTotalMarks = finalQuestions.reduce((acc, q) => acc + (q.marks || 0), 0);

  console.log(`\n===============================================================`);
  console.log(`📋 [QUESTION PAPER ASSEMBLED] "${examTitle}"`);
  console.log(`   ├─ Section A (MCQs 1m) : ${finalSectionA.length} questions = ${finalSectionA.length * 1} Marks`);
  console.log(`   ├─ Section B (VSA 2m)  : ${finalSectionB.length} questions = ${finalSectionB.length * 2} Marks`);
  console.log(`   ├─ Section C (SA 3m)   : ${finalSectionC.length} questions = ${finalSectionC.length * 3} Marks`);
  console.log(`   ├─ Section D (Long 5m) : ${finalSectionD.length} questions = ${finalSectionD.length * 5} Marks`);
  console.log(`   ├─ TOTAL QUESTIONS     : ${finalQuestions.length} questions`);
  console.log(`   └─ TOTAL MARKS         : ${calculatedTotalMarks} / ${targetMarks} Marks ${calculatedTotalMarks === targetMarks ? '✅ [PERFECT MATCH]' : '⚠️'}`);
  console.log(`---------------------------------------------------------------`);
  console.log(`📝 [GENERATED QUESTIONS ROSTER]`);
  finalQuestions.forEach((q) => {
    const cleanText = (q.text || '').replace(/\s+/g, ' ').substring(0, 68);
    const stemTag = q.stem ? ` [${q.stem}]` : '';
    console.log(`   Q${q.questionNo}. [${q.marks}m] [${(q.type || 'Q').toUpperCase()}]${stemTag}: "${cleanText}..."`);
  });
  console.log(`===============================================================`);

  return {
    success: finalQuestions.length > 0,
    examTitle,
    totalMarks: calculatedTotalMarks,
    totalQuestions: finalQuestions.length,
    sections: {
      sectionA: finalSectionA,
      sectionB: finalSectionB,
      sectionC: finalSectionC,
      sectionD: finalSectionD
    },
    questions: finalQuestions,
    selectedChapters: effectiveChapterTitles,
    selectedSubtopics: effectiveSubtopics,
    blueprint,
    message: finalQuestions.length > 0 ? undefined : 'AI model was unable to generate questions from the selected scope. Please try generating again.'
  };
}

/**
 * Multi-Stage Topic-Wise Syllabus Ingestion Pipeline
 * 1. Extracts all text from PDF(s)/ZIP.
 * 2. Uses Gemini to discover Units, Topics, and Prescribed Weightages (Table of Contents).
 * 3. Chunks document strictly tagged with Topic and Unit metadata.
 * 4. Vectorizes and stores into pgvector with topic-scoped RPC queries.
 */
export async function ingestSyllabusDocument(
  filesInput: any,
  className: string,
  chapterTitle: string = 'Comprehensive Syllabus',
  isComprehensiveSyllabus: boolean = true
): Promise<{ text: string; chunksCount: number; topics: any[] }> {
  let rawFiles: Array<{ buffer: Buffer; originalname?: string }> = [];

  if (Array.isArray(filesInput)) {
    rawFiles = filesInput.map(f => ({
      buffer: f.buffer || f,
      originalname: f.originalname || f.name || 'document'
    }));
  } else if (filesInput && (filesInput.buffer || Buffer.isBuffer(filesInput))) {
    rawFiles = [{
      buffer: filesInput.buffer || filesInput,
      originalname: filesInput.originalname || 'document'
    }];
  }

  console.log(`\n===============================================================`);
  console.log(`📚 [TOPIC-WISE SYLLABUS INGESTION DISPATCHED]`);
  console.log(`   Class / Subject: "${className}"`);
  console.log(`   Mode           : ${isComprehensiveSyllabus ? 'Comprehensive Syllabus (Topic Breakdown)' : 'Single Chapter'}`);
  console.log(`   Files Uploaded : ${rawFiles.length}`);
  console.log(`===============================================================\n`);

  let extractedTextParts: string[] = [];

  for (const fileObj of rawFiles) {
    const fBuffer = fileObj.buffer;
    const fName = fileObj.originalname || 'document';
    if (!fBuffer || fBuffer.length === 0) continue;

    const lowerName = fName.toLowerCase();
    if (lowerName.endsWith('.pdf') || fBuffer[0] === 0x25) {
      const text = await parsePdfBuffer(fBuffer);
      if (text && text.trim().length > 10) {
        extractedTextParts.push(text.trim());
      }
    } else if (/\.(txt|md|json|csv|rtf|tsv)$/i.test(lowerName)) {
      extractedTextParts.push(fBuffer.toString('utf-8'));
    }
  }

  let fullDocumentText = extractedTextParts.join('\n\n');
  if (!fullDocumentText || fullDocumentText.trim().length < 20) {
    fullDocumentText = `Syllabus for ${className}. Covers core concepts, chapters, and foundational learning outcomes for the academic year.`;
  }

  cachedTextbookText[className] = fullDocumentText;

  // STAGE 1: Extract Syllabus Outline & Hierarchy using Gemini AI
  let extractedTopics: any[] = [];
  if (isComprehensiveSyllabus) {
    try {
      extractedTopics = await extractSyllabusStructureWithAI(fullDocumentText, className);
    } catch (parseErr) {
      console.warn('⚠️ Syllabus AI extraction notice:', parseErr);
    }
  }

  // Fallback if no topics found
  if (extractedTopics.length === 0) {
    extractedTopics = [
      {
        unitNumber: 1,
        unitName: chapterTitle || 'Unit 1: Core Curriculum',
        topicName: chapterTitle || 'Foundational Concepts',
        subtopics: [],
        prescribedWeightage: 20
      }
    ];
  }

  // Save extracted topics to Supabase curriculum_topics
  const savedTopics = await saveCurriculumTopics(className, extractedTopics);
  console.log(`💾 Saved ${savedTopics.length} curriculum topic records for ${className}.`);

  // STAGE 2: Topic-Scoped Chunking
  // We segment the text into topic-tagged chunks
  const recordsToVectorize: Array<{
    class_name: string;
    chapter_title: string;
    unit_name: string;
    topic_name: string;
    content_chunk: string;
  }> = [];

  if (savedTopics.length > 1) {
    // Partition chunks among topics by finding topic sections or distributing text
    const rawChunks = createSemanticParagraphChunks(fullDocumentText, 800, 300);
    const chunkSizePerTopic = Math.max(1, Math.ceil(rawChunks.length / savedTopics.length));

    rawChunks.forEach((chunk, index) => {
      const topicIndex = Math.min(Math.floor(index / chunkSizePerTopic), savedTopics.length - 1);
      const assignedTopic = savedTopics[topicIndex];
      const taggedChunk = `[UNIT: ${assignedTopic.unit_name} | TOPIC: ${assignedTopic.topic_name}]\n${chunk}`;

      recordsToVectorize.push({
        class_name: className,
        chapter_title: assignedTopic.unit_name,
        unit_name: assignedTopic.unit_name,
        topic_name: assignedTopic.topic_name,
        content_chunk: taggedChunk
      });
    });
  } else {
    // Single topic / chapter
    const singleTopic = savedTopics[0];
    const rawChunks = createSemanticParagraphChunks(fullDocumentText, 700, 250);
    rawChunks.forEach(chunk => {
      recordsToVectorize.push({
        class_name: className,
        chapter_title: singleTopic.unit_name || chapterTitle,
        unit_name: singleTopic.unit_name || chapterTitle,
        topic_name: singleTopic.topic_name || chapterTitle,
        content_chunk: `[TOPIC: ${singleTopic.topic_name}]\n${chunk}`
      });
    });
  }

  console.log(`⚡ Created ${recordsToVectorize.length} topic-scoped chunks. Vectorizing in batches...`);

  // STAGE 3: Embed & Store in pgvector
  let totalInserted = 0;
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
    try {
      // Clear existing chunks for this class
      await supabase.from('textbook_embeddings').delete().eq('class_name', className);

      const batchSize = 15;
      for (let i = 0; i < recordsToVectorize.length; i += batchSize) {
        const slice = recordsToVectorize.slice(i, i + batchSize);
        const embeddedSlice = await Promise.all(
          slice.map(async item => {
            const embeddingVector = await generateEmbedding(item.content_chunk);
            return {
              ...item,
              embedding: embeddingVector
            };
          })
        );

        const { error: insErr } = await supabase.from('textbook_embeddings').insert(embeddedSlice);
        if (insErr) {
          console.warn(`⚠️ Insert notice (batch ${Math.floor(i / batchSize) + 1}):`, insErr.message);
        } else {
          totalInserted += embeddedSlice.length;
        }

        if (i + batchSize < recordsToVectorize.length) {
          await new Promise(r => setTimeout(r, 60));
        }
      }
      console.log(`✅ [SYLLABUS INGESTION SUCCESS] Inserted ${totalInserted} vector embeddings with topic metadata!`);
    } catch (storeErr) {
      console.warn('⚠️ Vector store exception:', storeErr);
    }
  }

  return {
    text: fullDocumentText,
    chunksCount: totalInserted || recordsToVectorize.length,
    topics: savedTopics
  };
}

export interface BlueprintAllocation {
  topicName: string;
  unitName?: string;
  mcqCount: number;         // 1 Mark
  veryShortCount: number;   // 2 Marks
  shortCount: number;       // 3 Marks
  descriptiveCount: number; // 5 Marks
}

/**
 * Generate Complete Examination Paper strictly governed by Indian School Blueprint
 */
export async function generateBlueprintExamPaper(
  className: string,
  blueprintItems: BlueprintAllocation[],
  options?: {
    examTitle?: string;
    subjectLanguage?: string;
    targetMarks?: number;
  }
): Promise<{
  success: boolean;
  examTitle: string;
  totalMarks: number;
  totalQuestions: number;
  sections: {
    sectionA: Question[];
    sectionB: Question[];
    sectionC: Question[];
    sectionD: Question[];
  };
  questions: Question[];
  blueprintSummary: any[];
}> {
  console.log(`\n===============================================================`);
  console.log(`📋 [BLUEPRINT EXAM GENERATOR] Generating Paper for: "${className}"`);
  console.log(`   Exam Title   : ${options?.examTitle || 'Term Assessment'}`);
  console.log(`   Target Marks : ${options?.targetMarks || 'Calculated from Blueprint'}`);
  console.log(`   Topics in Grid: ${blueprintItems.length}`);
  console.log(`===============================================================\n`);

  const activeAllocations = blueprintItems.filter(
    b => (b.mcqCount || 0) + (b.veryShortCount || 0) + (b.shortCount || 0) + (b.descriptiveCount || 0) > 0
  );

  if (activeAllocations.length === 0) {
    throw new Error('Please configure at least one question in the blueprint matrix.');
  }

  const allGeneratedQuestions: Question[] = [];
  const blueprintSummary: any[] = [];

  for (const item of activeAllocations) {
    const topicMarks = (item.mcqCount * 1) + (item.veryShortCount * 2) + (item.shortCount * 3) + (item.descriptiveCount * 5);
    blueprintSummary.push({
      topicName: item.topicName,
      unitName: item.unitName || '',
      mcqCount: item.mcqCount,
      veryShortCount: item.veryShortCount,
      shortCount: item.shortCount,
      descriptiveCount: item.descriptiveCount,
      totalTopicMarks: topicMarks
    });

    // Retrieve topic-specific context
    let topicContext = '';
    if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
      try {
        const queryVector = await generateEmbedding(`${item.topicName} ${item.unitName || ''} ${className}`);
        const { data: matchedChunks } = await supabase.rpc('match_topic_textbook_chunks', {
          query_embedding: queryVector,
          match_threshold: 0.10,
          match_count: 6,
          filter_class_name: className,
          filter_topic_name: item.topicName
        });

        if (matchedChunks && matchedChunks.length > 0) {
          topicContext = matchedChunks.map((c: any) => c.content_chunk).join('\n---\n');
          console.log(`🎯 Retrieved ${matchedChunks.length} topic chunks for "${item.topicName}".`);
        }
      } catch (rpcErr) {
        console.warn(`Topic chunk RPC notice for ${item.topicName}:`, rpcErr);
      }
    }

    if (!topicContext) {
      topicContext = cachedTextbookText[className] || `Subject: ${className}. Topic: ${item.topicName}. Key syllabus concepts, definitions and principles.`;
    }

    // Generate questions for this topic
    const topicQuestions = await generateTopicQuestionsByType(
      item.topicName,
      item.unitName || '',
      className,
      topicContext,
      {
        mcqCount: item.mcqCount,
        veryShortCount: item.veryShortCount,
        shortCount: item.shortCount,
        descriptiveCount: item.descriptiveCount
      }
    );

    allGeneratedQuestions.push(...topicQuestions);
  }

  // Organize by Section according to CBSE / Indian School Pattern
  const sectionA = allGeneratedQuestions.filter(q => q.marks === 1 || q.type === 'mcq');
  const sectionB = allGeneratedQuestions.filter(q => q.marks === 2 || q.type === 'vsa');
  const sectionC = allGeneratedQuestions.filter(q => q.marks === 3 || q.type === 'sa');
  const sectionD = allGeneratedQuestions.filter(q => (q.marks || 0) >= 4 || q.type === 'descriptive');

  // Sequential Question Numbering
  let qNumber = 1;
  const renumber = (list: Question[], sectionName: string) => {
    return list.map(q => {
      const numStr = `${qNumber++}`;
      return {
        ...q,
        number: numStr,
        questionNo: numStr,
        section: sectionName
      };
    });
  };

  const finalSectionA = renumber(sectionA, 'Section A (Multiple Choice Questions - 1 Mark each)');
  const finalSectionB = renumber(sectionB, 'Section B (Very Short Answer Questions - 2 Marks each)');
  const finalSectionC = renumber(sectionC, 'Section C (Short Answer Questions - 3 Marks each)');
  const finalSectionD = renumber(sectionD, 'Section D (Long Answer / Descriptive Questions - 5 Marks each)');

  const finalQuestions = [...finalSectionA, ...finalSectionB, ...finalSectionC, ...finalSectionD];
  const calculatedTotalMarks = finalQuestions.reduce((acc, q) => acc + (q.marks || 0), 0);

  console.log(`✅ [BLUEPRINT EXAM READY] Generated ${finalQuestions.length} total questions, total marks: ${calculatedTotalMarks}.`);

  return {
    success: true,
    examTitle: options?.examTitle || `${className} Examination Paper`,
    totalMarks: calculatedTotalMarks,
    totalQuestions: finalQuestions.length,
    sections: {
      sectionA: finalSectionA,
      sectionB: finalSectionB,
      sectionC: finalSectionC,
      sectionD: finalSectionD
    },
    questions: finalQuestions,
    blueprintSummary
  };
}

/**
 * 2. Generate Question Pool directly from Indexed Textbook Content via Google Gemini 3.6 with Sub-Topic Scope
 */
export async function generateRagQuestions(
  topic: string,
  className: string,
  language: string = 'English',
  subTopicScope: string = '',
  numQuestions: number = 5
): Promise<Question[]> {
  console.log(`\n===============================================================`);
  console.log(`🎯 [RAG QUESTION GENERATOR] RETRIEVING TEXTBOOK CONTEXT FOR: "${topic}" (${className}, ${numQuestions} Questions Requested)`);
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
  return generateQuestionsFromTextbook(topic, className, textbookContent, subTopicScope, numQuestions);
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
  assignedQuestions?: Question[],
  reasoningModel?: string,
  language?: string,
  markingSchemeText?: string
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


  // Use Google Gemini 3.6 Vision API to perform OCR transcription and contextual RAG evaluation with assigned questions
  let visionRes;
  let evaluationProvider: EvaluationResult['evaluationProvider'] = reasoningModel === 'sarvam' ? 'sarvam' : getConfiguredGeminiModel();
  let evaluationStatus: EvaluationResult['evaluationStatus'] = 'completed';
  let fallbackReason: string | undefined;
  try {
    visionRes = await analyzeStudentPaper(imageInput || null, mimeType || 'image/jpeg', pdfChunks, assignedQuestions || [], reasoningModel, language, ocrText, markingSchemeText || '');
  } catch (evaluationError) {
    if (reasoningModel !== 'sarvam') throw evaluationError;
    // Sarvam is the primary grader, so transient failures get a second and third chance before Gemini.
    console.warn('⚠️ [EVALUATION] Sarvam structured evaluation failed; retrying Sarvam before any fallback:', evaluationError);
    for (const delay of [5000, 15000]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        console.log(`🔁 [EVALUATION] Retrying Sarvam after ${delay / 1000}s...`);
        visionRes = await analyzeStudentPaper(imageInput || null, mimeType || 'image/jpeg', pdfChunks, assignedQuestions || [], reasoningModel, language, ocrText, markingSchemeText || '');
        break;
      } catch (retryError) {
        console.warn('⚠️ [EVALUATION] Sarvam retry failed:', retryError);
      }
    }
  }
  if (!visionRes && reasoningModel === 'sarvam') {
    console.warn('⚠️ [EVALUATION] Sarvam exhausted its retries; using Gemini fallback.');
    fallbackReason = 'Sarvam evaluation failed after retries.';
    evaluationStatus = 'fallback_completed';
    evaluationProvider = getConfiguredGeminiModel();
    try {
      visionRes = await analyzeStudentPaper(null, mimeType || 'image/jpeg', pdfChunks, assignedQuestions || [], getConfiguredGeminiModel(), language, ocrText, markingSchemeText || '');
    } catch (geminiError) {
      console.warn('⚠️ [EVALUATION] Gemini 3.6 fallback failed; retrying Gemini 3.5:', geminiError);
      evaluationProvider = getConfiguredGeminiModel();
      try {
        visionRes = await analyzeStudentPaper(null, mimeType || 'image/jpeg', pdfChunks, assignedQuestions || [], getConfiguredGeminiModel(), language, ocrText, markingSchemeText || '');
      } catch (finalError) {
        console.error('❌ [EVALUATION] All AI evaluation providers failed; routing to manual review:', finalError);
        evaluationProvider = 'manual';
        evaluationStatus = 'manual_review';
        const manualQuestions = (assignedQuestions || []).map((question, index) => ({
          questionNo: question.questionNo || `Q${index + 1}`,
          questionText: question.text,
          benchmarkKey: question.correctAnswer || question.rubricKey || 'Teacher review required.',
          studentAnswerSnippet: 'OCR is available for teacher review.',
          scorePercent: 0,
          marks: Number(question.marks) || 0,
          earnedMarks: 0,
          status: 'Manual Review Required',
          reasoning: 'Automated evaluation providers were temporarily unavailable.',
          feedback: 'Assign marks manually using the OCR transcription and scanned answer sheet.'
        }));
        visionRes = {
          ocrText,
          score: 0,
          maxScore: manualQuestions.reduce((total, question) => total + question.marks, 0),
          excelledAreas: [],
          knowledgeGaps: [],
          feedback: 'Automated evaluation is unavailable. This submission requires manual teacher review.',
          socraticHint: '',
          questionEvaluations: manualQuestions
        };
      }
    }
  }

  if (!visionRes) throw new Error('Evaluation produced no result from any provider.');

  return {
    ocrText: visionRes.ocrText || ocrText,
    score: visionRes.score,
    maxScore: visionRes.maxScore,
    excelledAreas: visionRes.excelledAreas,
    knowledgeGaps: visionRes.knowledgeGaps,
    feedback: visionRes.feedback,
    socraticHint: visionRes.socraticHint,
    evaluationProvider,
    evaluationStatus,
    fallbackReason,
    questionEvaluations: visionRes.questionEvaluations
  };
}


import * as pdfParseModule from 'pdf-parse';
import { supabase } from '../db/supabase.js';
import { generateEmbedding, generateQuestionsFromTextbook, analyzeStudentPaper } from './openrouterService.js';
// In-memory cache for uploaded textbook text
let cachedTextbookText = {};
/**
 * 1. Ingest PDF/Text Document into Supabase Knowledge Base with Vector Embeddings
 */
export async function ingestPdfDocument(fileBuffer, className, chapterTitle) {
    let extractedText = '';
    if (fileBuffer && fileBuffer.length > 0) {
        try {
            const parseFn = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
            if (typeof parseFn === 'function') {
                const pdfData = await parseFn(fileBuffer);
                extractedText = pdfData.text || fileBuffer.toString('utf-8');
            }
            else {
                extractedText = fileBuffer.toString('utf-8');
            }
        }
        catch (err) {
            extractedText = fileBuffer.toString('utf-8');
        }
    }
    // Fallback text if no PDF buffer was uploaded
    if (!extractedText || extractedText.trim().length < 10) {
        extractedText = `CHAPTER: ${chapterTitle || 'Plant Reproduction'} (Grade: ${className}).
Seed Structure and Function: Seeds contain an embryo, seed coat, and cotyledons. Cotyledons store food and supply nutrients to the baby plant during germination.
Seed Dispersal Mechanisms: Water helps float seeds and fruits from one place to another (examples: coconut, lotus). Wind disperses light, winged seeds like dandelion. Animals disperse seeds with hooks or spines.
Germination Conditions: Water absorption causes the seed coat to swell and break open. Air provides oxygen for respiration, and proper warmth enables enzyme activity.
Vegetative Propagation: Reproduction where new plants grow from parent plant parts (leaves, stems, or roots) instead of seeds (examples: Bryophyllum leaf buds, potato tubers).`;
    }
    cachedTextbookText[className] = extractedText;
    // Split PDF text into semantic sentence chunks
    const chunks = extractedText
        .split(/(?<=[.?!])\s+/)
        .map(c => c.trim())
        .filter(c => c.length > 10);
    console.log(`📚 Generating vector embeddings for ${chunks.length} chunks (${className} - ${chapterTitle})...`);
    // Generate vector float array embeddings for each chunk
    try {
        const records = await Promise.all(chunks.map(async (chunk) => {
            const embeddingVector = await generateEmbedding(chunk);
            return {
                class_name: className,
                chapter_title: chapterTitle || 'General Chapter',
                content_chunk: chunk,
                embedding: embeddingVector
            };
        }));
        if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
            // Clear existing chunks for this class and insert new chunks WITH vector embeddings
            await supabase.from('textbook_embeddings').delete().eq('class_name', className);
            const { error } = await supabase.from('textbook_embeddings').insert(records);
            if (error) {
                console.warn('Supabase embedding insert notice:', error.message);
            }
            else {
                console.log(`✅ Successfully stored ${records.length} text chunks with vector embeddings in Supabase.`);
            }
        }
    }
    catch (err) {
        console.warn('Embedding store exception notice:', err);
    }
    return { text: extractedText, chunksCount: chunks.length };
}
/**
 * 2. Generate Question Pool directly from Indexed Textbook Content via OpenRouter AI with Sub-Topic Scope
 */
export async function generateRagQuestions(topic, className, language = 'English', subTopicScope = '') {
    let textbookContent = cachedTextbookText[className] || `Topic: ${topic}. Class: ${className}.`;
    // Perform Vector Similarity Filter for subTopicScope if provided
    if (subTopicScope && subTopicScope.trim().length > 0) {
        try {
            const scopeVector = await generateEmbedding(subTopicScope);
            const { data: scopeChunks } = await supabase.rpc('match_textbook_chunks', {
                query_embedding: scopeVector,
                match_threshold: 0.25,
                match_count: 5,
                filter_class_name: className
            });
            if (scopeChunks && scopeChunks.length > 0) {
                textbookContent = scopeChunks.map((r) => r.content_chunk).join('\n---\n');
            }
        }
        catch (e) {
            console.warn('SubTopic Vector Scope Filter Notice:', e);
        }
    }
    return generateQuestionsFromTextbook(topic, className, textbookContent, subTopicScope);
}
/**
 * 3. Vision LLM & Vector RAG Student Answer Evaluation
 */
export async function evaluateStudentAnswerAgainstPdf(ocrText, className, imageBuffer, mimeType) {
    let pdfChunks = [];
    // 1. Vector Cosine Similarity Search & Context Retrieval
    try {
        if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
            // Generate 1536-dimensional vector embedding for the student OCR text / query
            const queryEmbedding = await generateEmbedding(ocrText || className);
            // Perform Cosine Similarity Vector Search in Supabase pgvector
            const { data: vectorMatchData, error: rpcError } = await supabase.rpc('match_textbook_chunks', {
                query_embedding: queryEmbedding,
                match_threshold: 0.3,
                match_count: 5,
                filter_class_name: className
            });
            if (!rpcError && vectorMatchData && vectorMatchData.length > 0) {
                console.log(`🎯 Vector Cosine Similarity match returned ${vectorMatchData.length} relevant chunks.`);
                pdfChunks = vectorMatchData.map((r) => r.content_chunk);
            }
            else {
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
    }
    catch (err) {
        console.warn('Error performing vector search:', err);
    }
    // Use OpenRouter Vision LLM to perform OCR transcription and contextual RAG evaluation
    const visionRes = await analyzeStudentPaper(imageBuffer || null, mimeType || 'image/jpeg', pdfChunks);
    return {
        ocrText: visionRes.ocrText || ocrText,
        score: visionRes.score,
        excelledAreas: visionRes.excelledAreas,
        knowledgeGaps: visionRes.knowledgeGaps,
        feedback: visionRes.feedback,
        socraticHint: visionRes.socraticHint
    };
}

import { Router, Response } from 'express';
import { supabase, uploadImageToSupabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';
import { uploadDisk } from '../middleware/upload.js';
import { ingestPdfDocument, generateRagQuestions } from '../services/ragService.js';
import { expandPdfFilesToImages } from '../services/pdfRasterService.js';
import { extractQuestionsFromImage, attachStimulusImages, callGemini36Api, getConfiguredGeminiModel } from '../services/aiService.js';

const router = Router();

// -------------------------------------------------------------
// 1. Knowledge Base Ingestion (Chunks & Vectorizes into Supabase)
// -------------------------------------------------------------
router.post('/rag/ingest', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className, topic } = req.body;
    const uploadedFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    const targetClass = String(className || '').trim();
    const targetTopic = topic || 'Chapter Assessment';

    if (!targetClass) {
      return res.status(400).json({ success: false, message: 'A class/subject is required so ingested material can be retrieved for the right cohort.' });
    }

    console.log(`\n📚 [KNOWLEDGE BASE INGESTION] Dispatched from UI`);
    console.log(`   ├─ Class/Grade : "${targetClass}"`);
    console.log(`   ├─ Topic/Title : "${targetTopic}"`);
    console.log(`   └─ File Count  : ${uploadedFiles.length} file(s)`);

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'No chapter documents or archives uploaded for ingestion.' });
    }

    const result = await ingestPdfDocument(uploadedFiles, targetClass, targetTopic);
    console.log(`✅ [KNOWLEDGE BASE INGESTION COMPLETED] Indexed ${result.chunksCount} chunks into vector store.`);

    res.json({
      success: true,
      message: `Successfully ingested knowledge base into Supabase RAG (${result.chunksCount} vector chunk(s) indexed for ${targetClass}).`,
      chunksCount: result.chunksCount
    });
  } catch (err: any) {
    console.error('❌ RAG Ingestion Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error during knowledge base ingestion' });
  }
});

// -------------------------------------------------------------
// 2. Exam Question Generator
// -------------------------------------------------------------
router.post('/rag/generate', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className, topic, subjectLanguage, subTopicScope, numQuestions } = req.body;
    const uploadedFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    const targetClass = String(className || '').trim();
    const targetTopic = topic || 'Chapter Assessment';
    const countVal = numQuestions ? parseInt(numQuestions, 10) : 5;

    if (!targetClass) {
      return res.status(400).json({ success: false, message: 'Select a subject with a configured grade before generating a paper.' });
    }

    console.log(`\n🎯 [EXAM GENERATOR - RAG] Generating Question Paper`);
    console.log(`   ├─ Subject/Class : "${targetClass}"`);
    console.log(`   ├─ Topic Title   : "${targetTopic}"`);
    console.log(`   ├─ Sub-Topics    : "${subTopicScope || 'All topics'}"`);
    console.log(`   └─ Num Questions : ${countVal}`);

    if (uploadedFiles.length > 0) {
      await ingestPdfDocument(uploadedFiles, targetClass, targetTopic);
    }

    const questions = await generateRagQuestions(targetTopic, targetClass, subjectLanguage, subTopicScope || '', countVal);
    console.log(`✅ [EXAM GENERATOR COMPLETED] Generated ${questions.length} questions successfully.`);

    res.json({ success: true, questions });
  } catch (err: any) {
    console.error('❌ RAG Generation Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error generating questions' });
  }
});

// -------------------------------------------------------------
// 3. Vision AI Question Paper Photo Extraction
// -------------------------------------------------------------
router.post('/rag/extract-questions-from-image', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadedFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'No question paper photo uploaded.' });
    }

    const pageFiles = await expandPdfFilesToImages(uploadedFiles as any);
    const imageBuffers = pageFiles.map((f: any) => f.buffer);
    const mimeTypes = pageFiles.map((file: any) => file.mimetype || 'image/jpeg');
    const languageOrSubject = String(req.body.subjectLanguage || req.body.language || req.body.subject || req.body.className || 'English');

    const paperPageUrls: string[] = [];
    const questionPaperUrls: string[] = [];

    for (const file of uploadedFiles as any[]) {
      try {
        const url = await uploadImageToSupabase(file.buffer, file.originalname || 'question-paper.pdf', file.mimetype || 'application/pdf');
        if (url) questionPaperUrls.push(url);
      } catch (err) {
        console.warn('⚠️ Question paper source upload notice:', err);
      }
    }

    for (const pageFile of pageFiles as any[]) {
      try {
        const url = await uploadImageToSupabase(pageFile.buffer, pageFile.originalname || 'question-paper.png', pageFile.mimetype || 'image/png');
        if (url) paperPageUrls.push(url);
      } catch (err) {
        console.warn('⚠️ Question paper page upload notice:', err);
      }
    }

    const questions = await extractQuestionsFromImage(imageBuffers, mimeTypes, languageOrSubject);
    const withStimulus = attachStimulusImages(questions, paperPageUrls);

    res.json({
      success: true,
      questions: withStimulus,
      paperPageUrls,
      questionPaperUrl: questionPaperUrls[0] || ''
    });
  } catch (err: any) {
    console.error('❌ Photo Question Extraction Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error extracting questions from image' });
  }
});

// -------------------------------------------------------------
// 4. Vision AI Answer Key / Marking Scheme Extraction
// -------------------------------------------------------------
router.post('/rag/extract-answer-key', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadedFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'No answer key file uploaded.' });
    }

    const pageFiles = await expandPdfFilesToImages(uploadedFiles as any);
    let answerKeyUrl = '';

    try {
      answerKeyUrl = await uploadImageToSupabase(
        uploadedFiles[0].buffer,
        uploadedFiles[0].originalname || 'answer-key.pdf',
        uploadedFiles[0].mimetype || 'application/pdf'
      );
    } catch (err) {
      console.warn('⚠️ Answer key source upload notice:', err);
    }

    const prompt = 'This is a printed teacher answer key / marking scheme document, potentially spanning multiple questions. Perform high-precision OCR and return ONLY the transcribed text, preserving question numbers, benchmark answers, and marks allocation exactly as printed.';

    const pageTexts = await Promise.all(
      (pageFiles as any[]).map((file) => callGemini36Api(prompt, file.buffer, file.mimetype || 'image/jpeg', 3, getConfiguredGeminiModel()))
    );

    const answerKeyText = pageTexts
      .map((text, index) => (pageFiles.length > 1 ? `--- PAGE ${index + 1} ---\n${(text || '').trim()}` : (text || '').trim()))
      .join('\n\n')
      .trim();

    if (!answerKeyText) {
      return res.status(422).json({ success: false, message: 'Could not transcribe text from uploaded answer key.' });
    }

    res.json({ success: true, answerKeyText, answerKeyUrl });
  } catch (err: any) {
    console.error('❌ Answer Key Extraction Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error extracting answer key' });
  }
});

// -------------------------------------------------------------
// 5. Ingested Chapter Embeddings Exploration
// -------------------------------------------------------------
router.get('/rag/chapters', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className } = req.query;
    let query = supabase.from('textbook_embeddings').select('class_name, chapter_title').order('created_at', { ascending: false });
    if (className) query = query.eq('class_name', String(className));

    const { data, error } = await query;
    if (error) throw error;

    // Deduplicate
    const uniqueChapters = Array.from(new Set((data || []).map((d) => `${d.class_name}:::${d.chapter_title}`))).map((key) => {
      const [cls, chp] = key.split(':::');
      return { className: cls, chapterTitle: chp };
    });

    res.json({ success: true, chapters: uniqueChapters });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching chapters' });
  }
});

export default router;

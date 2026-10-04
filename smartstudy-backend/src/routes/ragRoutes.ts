import { Router, Response } from 'express';
import { supabase, uploadImageToSupabase } from '../db/supabase.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/authMiddleware.js';
import { uploadDisk } from '../middleware/upload.js';
import { 
  ingestPdfDocument, 
  generateRagQuestions, 
  getCurriculumTopics, 
  saveCurriculumTopics, 
  deleteCurriculumTopic,
  deleteAllCurriculumTopics,
  ingestSyllabusDocument, 
  generateBlueprintExamPaper,
  ingestChapterDocument,
  getSubjectChapters,
  deleteSubjectChapter,
  generateUnifiedExamPaper
} from '../services/ragService.js';
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
// 5. Chapter-Wise Knowledge Base Ingestion & Management
// -------------------------------------------------------------
router.post(['/rag/chapter/ingest', '/rag/chapters/ingest'], uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className, subjectName, chapterTitle, chapterNumber } = req.body;
    const uploadedFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    const targetClass = String(className || '').trim();
    const targetSubject = String(subjectName || req.body.subject || '').trim() || 'General';

    if (!targetClass) {
      return res.status(400).json({ success: false, message: 'Class / Grade is required so material is indexed correctly.' });
    }
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'Please upload at least one chapter PDF document.' });
    }

    const parsedChapterNumber = chapterNumber ? parseInt(String(chapterNumber), 10) : undefined;
    const result = await ingestChapterDocument(
      uploadedFiles,
      targetClass,
      targetSubject,
      chapterTitle,
      parsedChapterNumber
    );

    res.json(result);
  } catch (err: any) {
    console.error('❌ Chapter Ingestion Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error ingesting chapter PDF' });
  }
});

router.get('/rag/chapters', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const className = String(req.query.className || '').trim();
    const subjectName = req.query.subjectName ? String(req.query.subjectName).trim() : undefined;

    if (!className) {
      return res.status(400).json({ success: false, message: 'className query parameter is required.' });
    }

    const chapters = await getSubjectChapters(className, subjectName);
    res.json({ success: true, chapters });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching chapters' });
  }
});

router.delete('/rag/chapters/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const className = req.query.className ? String(req.query.className) : undefined;
    if (!id) return res.status(400).json({ success: false, message: 'Chapter ID required' });

    const ok = await deleteSubjectChapter(id, className);
    res.json({ success: ok, message: ok ? 'Chapter deleted successfully.' : 'Unable to delete chapter.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting chapter' });
  }
});

// -------------------------------------------------------------
// 6. Curriculum Topics Hierarchy (Fetch & Update)
// -------------------------------------------------------------
router.get('/rag/topics', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const className = String(req.query.className || '').trim();
    if (!className) {
      return res.status(400).json({ success: false, message: 'className query parameter is required.' });
    }
    const topics = await getCurriculumTopics(className);
    res.json({ success: true, topics });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error fetching curriculum topics' });
  }
});

router.post('/rag/topics', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className, topics } = req.body;
    if (!className || !Array.isArray(topics)) {
      return res.status(400).json({ success: false, message: 'className and topics array are required.' });
    }
    const saved = await saveCurriculumTopics(className, topics);
    res.json({ success: true, topics: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error saving curriculum topics' });
  }
});

router.delete('/rag/topics/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, message: 'Topic ID required' });
    const ok = await deleteCurriculumTopic(id);
    res.json({ success: ok, message: ok ? 'Topic deleted successfully.' : 'Unable to delete topic.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error deleting topic' });
  }
});

router.delete('/rag/topics', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const className = String(req.query.className || '').trim();
    if (!className) {
      return res.status(400).json({ success: false, message: 'className query parameter required.' });
    }
    const ok = await deleteAllCurriculumTopics(className);
    res.json({ success: ok, message: ok ? 'All topics cleared successfully.' : 'Unable to clear topics.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Error clearing topics' });
  }
});

// -------------------------------------------------------------
// 7. Multi-Stage Topic-Wise Syllabus Ingestion
// -------------------------------------------------------------
router.post('/rag/ingest-syllabus', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className, chapterTitle, isComprehensiveSyllabus } = req.body;
    const uploadedFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    const targetClass = String(className || '').trim();

    if (!targetClass) {
      return res.status(400).json({ success: false, message: 'A class/subject is required.' });
    }
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'Please upload at least one syllabus or textbook document.' });
    }

    const isComp = isComprehensiveSyllabus === 'true' || isComprehensiveSyllabus === true || isComprehensiveSyllabus === undefined;
    const result = await ingestSyllabusDocument(uploadedFiles, targetClass, chapterTitle || 'Comprehensive Syllabus', isComp);

    res.json({
      success: true,
      message: `Successfully indexed ${result.chunksCount} topic-scoped chunks into Supabase pgvector (${result.topics.length} topics identified).`,
      chunksCount: result.chunksCount,
      topics: result.topics
    });
  } catch (err: any) {
    console.error('❌ Syllabus Ingestion Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error during syllabus ingestion' });
  }
});

// -------------------------------------------------------------
// 8. Indian School Blueprint Exam Generator
// -------------------------------------------------------------
router.post('/rag/generate-blueprint', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { className, subjectLanguage, examTitle, targetMarks } = req.body;
    let blueprint = req.body.blueprint;
    if (typeof blueprint === 'string') {
      try { blueprint = JSON.parse(blueprint); } catch (e) {}
    }

    if (!className) {
      return res.status(400).json({ success: false, message: 'className is required.' });
    }
    if (!Array.isArray(blueprint) || blueprint.length === 0) {
      return res.status(400).json({ success: false, message: 'Blueprint allocations array is required.' });
    }

    const result = await generateBlueprintExamPaper(
      className,
      blueprint,
      {
        examTitle: examTitle || `${className} Examination Paper`,
        subjectLanguage: subjectLanguage || 'English',
        targetMarks: targetMarks ? parseInt(targetMarks, 10) : undefined
      }
    );

    res.json(result);
  } catch (err: any) {
    console.error('❌ Blueprint Exam Generation Error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Error generating blueprint exam' });
  }
});

// -------------------------------------------------------------
// 9. Unified Single-Mode Exam Question Paper Generator
// -------------------------------------------------------------
router.post('/rag/generate-exam', uploadDisk.any(), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reqStart = Date.now();
  const timeStr = new Date().toLocaleTimeString();

  try {
    const {
      examTitle,
      targetMarks,
      className,
      subjectName,
      language,
      difficulty
    } = req.body;

    let chapterTitles = req.body.chapterTitles || req.body.selectedChapters || [];
    if (typeof chapterTitles === 'string') {
      try { chapterTitles = JSON.parse(chapterTitles); } catch (e) { chapterTitles = [chapterTitles]; }
    }

    let subtopics = req.body.subtopics || req.body.selectedSubtopics || [];
    if (typeof subtopics === 'string') {
      try { subtopics = JSON.parse(subtopics); } catch (e) { subtopics = [subtopics]; }
    }

    let questionCounts = req.body.questionCounts || {
      mcqCount: Number(req.body.mcqCount || 0),
      veryShortCount: Number(req.body.veryShortCount || 0),
      shortCount: Number(req.body.shortCount || 0),
      descriptiveCount: Number(req.body.descriptiveCount || 0)
    };
    if (typeof questionCounts === 'string') {
      try { questionCounts = JSON.parse(questionCounts); } catch (e) {}
    }

    if (!className) {
      console.warn(`⚠️ [API REJECTED] /api/rag/generate-exam: className is missing from payload.`);
      return res.status(400).json({ success: false, message: 'Class name is required.' });
    }

    const targetMarksNum = targetMarks ? parseInt(String(targetMarks), 10) : 40;

    let blueprint = req.body.blueprint || [];
    if (typeof blueprint === 'string') {
      try { blueprint = JSON.parse(blueprint); } catch (e) { blueprint = []; }
    }

    console.log(`\n===============================================================`);
    console.log(`📡 [API INCOMING] POST /api/rag/generate-exam (${timeStr})`);
    console.log(`   ├─ Exam Title   : "${examTitle || `${className} Examination`}"`);
    console.log(`   ├─ Target Marks : ${targetMarksNum} Marks`);
    console.log(`   ├─ Class / Cohort: "${className}" | Subject: "${subjectName || 'General'}"`);
    console.log(`   ├─ Language     : ${language || 'English'} | Difficulty: ${difficulty || 'Standard'}`);
    console.log(`   ├─ Chapters (${chapterTitles.length}) : ${chapterTitles.join(', ') || 'All Available'}`);
    console.log(`   ├─ Subtopics (${subtopics.length}): ${subtopics.length > 0 ? subtopics.slice(0, 4).join(', ') + (subtopics.length > 4 ? ` (+${subtopics.length - 4} more)` : '') : 'All Core Concepts'}`);
    if (blueprint && blueprint.length > 0) {
      console.log(`   └─ Blueprint (${blueprint.length} topic allocations configured):`);
      blueprint.forEach((b: any, idx: number) => {
        const title = b.chapterTitle || b.topic || `Topic ${idx + 1}`;
        const mcq = Number(b.mcqCount ?? b.mcq) || 0;
        const vsa = Number(b.veryShortCount ?? b.vsa) || 0;
        const sa = Number(b.shortCount ?? b.sa) || 0;
        const long = Number(b.descriptiveCount ?? b.long) || 0;
        const bMarks = mcq * 1 + vsa * 2 + sa * 3 + long * 5;
        console.log(`      [${idx + 1}] "${title}": ${bMarks} Marks (${mcq} MCQ, ${vsa} VSA, ${sa} SA, ${long} Long)`);
      });
    } else {
      console.log(`   └─ Typology     : MCQs=${questionCounts.mcqCount}, VSA=${questionCounts.veryShortCount}, SA=${questionCounts.shortCount}, Long=${questionCounts.descriptiveCount}`);
    }
    console.log(`===============================================================`);

    const result = await generateUnifiedExamPaper({
      examTitle: examTitle || `${className} Examination Paper`,
      targetMarks: targetMarksNum,
      className,
      subjectName: subjectName || 'General',
      chapterTitles,
      subtopics,
      questionCounts: {
        mcqCount: Number(questionCounts.mcqCount) || 0,
        veryShortCount: Number(questionCounts.veryShortCount) || 0,
        shortCount: Number(questionCounts.shortCount) || 0,
        descriptiveCount: Number(questionCounts.descriptiveCount) || 0
      },
      blueprint,
      language: language || 'English',
      difficulty: difficulty || 'Standard'
    });

    const duration = ((Date.now() - reqStart) / 1000).toFixed(2);
    console.log(`\n📤 [API RESPONSE] /api/rag/generate-exam completed in ${duration}s`);
    console.log(`   ├─ HTTP Status  : 200 OK`);
    console.log(`   ├─ Questions    : ${result.totalQuestions || 0} questions generated`);
    console.log(`   └─ Marks Tally  : ${result.totalMarks || 0} / ${targetMarksNum} Marks`);
    console.log(`===============================================================\n`);

    res.json(result);
  } catch (err: any) {
    const duration = ((Date.now() - reqStart) / 1000).toFixed(2);
    console.error(`\n❌ [API ERROR] /api/rag/generate-exam failed after ${duration}s:`, err?.message || err);
    console.error(err);
    console.log(`===============================================================\n`);
    res.status(500).json({ success: false, message: err?.message || 'Error generating examination paper' });
  }
});

export default router;

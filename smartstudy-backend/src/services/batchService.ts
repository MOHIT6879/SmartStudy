import AdmZip from 'adm-zip';
import { evaluateStudentAnswerAgainstPdf } from './ragService.js';
import { getConfiguredGeminiModel } from './aiService.js';
import { expandPdfFilesToImages } from './pdfRasterService.js';
import { performOcrPages } from './ocrService.js';
import { supabase, uploadImageToSupabase } from '../db/supabase.js';
import { detectAndSplitStudentSubmissions, formatStudentDisplayName, isSameStudent, runWithConcurrency, SplitProgressUpdate } from './studentBoundaryService.js';

export interface BatchItemFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  studentName?: string;
  // Uniquely identifies which student this page belongs to. Only pages extracted from the same
  // ZIP folder share a groupKey (legitimate multi-page submission); everything else is unique per
  // file so similarly-named uploads (e.g. IMG_1234.jpg, IMG_1235.jpg) are never merged together.
  groupKey?: string;
  // Pre-extracted during single-pass streaming OCR to eliminate redundant API calls
  preExtractedOcr?: string;
}

export interface BatchJob {
  id: string;
  stage: 'queued' | 'splitting' | 'grading' | 'completed' | 'failed';
  splitProgress?: { current: number; total: number; studentsFound: number };
  gradingProgress?: { current: number; total: number; successful: number; failed: number };
  statusMessage?: string;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  submissions: any[];
  errors: Array<{ fileName: string; error: string }>;
}

const batchJobs: Record<string, BatchJob> = {};

const isSupabaseConfigured = () => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_URL.includes('your-project'));
};

/**
 * Delay execution to respect API rate limits (15 RPM for free Gemini API)
 */
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Unpacks ZIP archives recursively, runs AI student boundary detection on multi-page PDFs,
 * and normalizes incoming files (ZIPs, PDFs, Images).
 */
async function unpackAndNormalizeFiles(
  rawFiles: BatchItemFile[],
  autoSplitPdf: boolean = true,
  targetClassName?: string,
  assignmentId?: string,
  selectedLanguage: string = 'English',
  targetSubject?: string,
  fixedPageCount?: number,
  onProgress?: (progress: SplitProgressUpdate) => void
): Promise<BatchItemFile[]> {
  const normalizedFiles: BatchItemFile[] = [];
  let uniqueCounter = 0;

  for (const file of rawFiles) {
    const filename = file.originalname || 'submission';
    const lowerName = filename.toLowerCase();

    // Check if file is a ZIP archive by extension, mimetype, or magic bytes (PK\x03\x04)
    const isZip = lowerName.endsWith('.zip') ||
      file.mimetype.includes('zip') ||
      (file.buffer && file.buffer.length > 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04);

    if (isZip) {
      console.log(`📦 [ZIP Unpacker] Extracting archive '${filename}' (${file.buffer.length} bytes)...`);
      try {
        const zip = new AdmZip(file.buffer);
        const entries = zip.getEntries();

        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const entryName = entry.entryName;

          // Skip system hidden files or junk
          if (entryName.startsWith('__MACOSX/') || entryName.startsWith('.') || entryName.includes('/.')) continue;

          const lowerEntry = entryName.toLowerCase();
          let mime = 'image/jpeg';
          if (lowerEntry.endsWith('.pdf')) mime = 'application/pdf';
          else if (lowerEntry.endsWith('.png')) mime = 'image/png';
          else if (lowerEntry.endsWith('.webp')) mime = 'image/webp';
          else if (lowerEntry.endsWith('.gif')) mime = 'image/gif';
          else if (!/\.(jpg|jpeg|png|webp|pdf|gif)$/i.test(lowerEntry)) {
            // Skip non-image / non-pdf files inside zip
            continue;
          }

          const entryData = entry.getData();
          if (!entryData || entryData.length === 0) continue;

          const pathParts = entryName.split(/[\/\\]/).filter(Boolean);
          let extractedStudentName: string | undefined;
          let groupKey: string;

          // Detect student name from ZIP directory folder structure
          if (pathParts.length > 1) {
            const folderName = pathParts[pathParts.length - 2];
            if (folderName && !folderName.match(/^(images|files|pages|uploads|docs|pdf|pdfs|sheets|submissions)$/i)) {
              extractedStudentName = folderName.replace(/[-_]/g, ' ').trim();
            }
            // Files under the same ZIP folder are genuinely multi-page pages of one student.
            groupKey = `zipfolder:${pathParts.slice(0, -1).join('/')}`;
          } else {
            // Flat entry with no folder context — treat as its own standalone submission.
            groupKey = `zipflat:${uniqueCounter++}`;
          }

          if (!extractedStudentName) {
            extractedStudentName = extractStudentNameFromFilename(pathParts[pathParts.length - 1]) || undefined;
          }

          normalizedFiles.push({
            buffer: entryData,
            originalname: pathParts[pathParts.length - 1] || entryName,
            mimetype: mime,
            studentName: extractedStudentName,
            groupKey
          });
        }
      } catch (err) {
        console.error(`❌ Failed to unpack ZIP file ${filename}:`, err);
      }
    } else {
      // Loose PDF or Image file
      let mime = file.mimetype;
      if (!mime || mime === 'application/octet-stream') {
        if (lowerName.endsWith('.pdf')) mime = 'application/pdf';
        else if (lowerName.endsWith('.png')) mime = 'image/png';
        else if (lowerName.endsWith('.webp')) mime = 'image/webp';
        else mime = 'image/jpeg';
      }

      const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');

      // AI Student Boundary Detection & Auto-splitting for multi-page PDFs
      if (isPdf && autoSplitPdf) {
        try {
          const splitBatches = await detectAndSplitStudentSubmissions(file.buffer, {
            targetClassName,
            assignmentId,
            language: selectedLanguage,
            subject: targetSubject,
            fixedPageCount,
            onProgress
          });

          if (splitBatches.length > 1) {
            console.log(`✨ [SMART SPLITTER] Segregated "${filename}" into ${splitBatches.length} individual student submissions with single-pass OCR!`);
            for (const batch of splitBatches) {
              const pageLabel = batch.pageNumbers && batch.pageNumbers.length > 1 && (batch.endPage - batch.startPage + 1 !== batch.pageCount)
                ? `pages_${batch.pageNumbers.join('-')}`
                : `p${batch.startPage}-p${batch.endPage}`;
              normalizedFiles.push({
                buffer: batch.pdfBuffer,
                originalname: `${batch.studentName.replace(/\s+/g, '_')}_${pageLabel}.pdf`,
                mimetype: 'application/pdf',
                studentName: batch.studentName,
                groupKey: `split:${uniqueCounter++}`,
                preExtractedOcr: batch.ocrText
              });
            }
            continue;
          } else if (splitBatches.length === 1 && splitBatches[0].studentName && !splitBatches[0].studentName.startsWith('Student ')) {
            normalizedFiles.push({
              buffer: file.buffer,
              originalname: file.originalname,
              mimetype: mime,
              studentName: splitBatches[0].studentName,
              groupKey: `loose:${uniqueCounter++}`,
              preExtractedOcr: splitBatches[0].ocrText
            });
            continue;
          }
        } catch (splitErr) {
          console.warn(`⚠️ [SMART SPLITTER] Boundary detection notice for "${filename}":`, splitErr);
        }
      }

      const inferredName = file.studentName || extractStudentNameFromFilename(file.originalname) || undefined;

      normalizedFiles.push({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: mime,
        studentName: inferredName,
        groupKey: `loose:${uniqueCounter++}`
      });
    }
  }

  return normalizedFiles;
}

/**
 * Initialize a new bulk batch evaluation job
 */
export function createBatchJob(
  files: BatchItemFile[],
  assignmentId?: string,
  selectedLanguage: string = 'English',
  targetClassName?: string,
  targetSubject?: string,
  markingSchemeText?: string,
  autoSplitPdf: boolean = true,
  fixedPageCount?: number
): BatchJob {
  const jobId = 'batch-' + Date.now();
  const now = new Date().toISOString();

  const newJob: BatchJob = {
    id: jobId,
    stage: 'queued',
    statusMessage: 'Queued for processing...',
    total: files.length,
    processed: 0,
    successful: 0,
    failed: 0,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    submissions: [],
    errors: []
  };

  batchJobs[jobId] = newJob;

  // Launch background processing asynchronously
  processBatchQueue(jobId, files, assignmentId, selectedLanguage, targetClassName, targetSubject, markingSchemeText, autoSplitPdf, fixedPageCount).catch((err) => {
    console.error(`❌ Batch Job ${jobId} execution error:`, err);
    if (batchJobs[jobId]) {
      batchJobs[jobId].status = 'failed';
      batchJobs[jobId].stage = 'failed';
      batchJobs[jobId].statusMessage = err?.message || 'Execution error';
      batchJobs[jobId].updatedAt = new Date().toISOString();
    }
  });

  return newJob;
}

/**
 * Retrieve status and partial/completed submissions for a batch job
 */
export function getBatchJob(jobId: string): BatchJob | null {
  return batchJobs[jobId] || null;
}

/**
 * Background Concurrency Worker Pool for Gemini Pay-As-You-Go
 */
async function processBatchQueue(
  jobId: string,
  rawFiles: BatchItemFile[],
  assignmentId?: string,
  selectedLanguage: string = 'English',
  targetClassName?: string,
  targetSubject?: string,
  markingSchemeText?: string,
  autoSplitPdf: boolean = true,
  fixedPageCount?: number
) {
  const job = batchJobs[jobId];
  if (!job) return;

  job.status = 'processing';
  job.stage = 'splitting';
  job.statusMessage = 'Analyzing and segregating documents...';
  job.updatedAt = new Date().toISOString();

  // 1. Unpack ZIP archives, auto-split multi-student PDFs, and normalize all files
  const unpackedFiles = await unpackAndNormalizeFiles(
    rawFiles,
    autoSplitPdf,
    targetClassName,
    assignmentId,
    selectedLanguage,
    targetSubject,
    fixedPageCount,
    (progress) => {
      job.splitProgress = { current: progress.current, total: progress.total, studentsFound: progress.studentsFound };
      job.statusMessage = progress.statusMessage;
      job.updatedAt = new Date().toISOString();
    }
  );

  let className = targetClassName || 'General Class';
  let subjectName = targetSubject || 'Unassigned Subject';
  let assignedQuestions: any[] = [];
  let reasoningModel = process.env.PRIMARY_AI_PROVIDER?.toLowerCase() === 'sarvam' ? 'sarvam' : getConfiguredGeminiModel();
  if (!assignmentId) throw new Error('A dispatched assignment is required for bulk evaluation.');
  const { data: assignment, error: assignmentError } = await supabase.from('assignments').select('*').eq('id', assignmentId).single();
  if (assignmentError || !assignment) throw new Error(`Assignment '${assignmentId}' could not be loaded for bulk evaluation.`);
  className = assignment.class_name || className;
  subjectName = assignment.subject || assignment.class_name || subjectName;
  assignedQuestions = typeof assignment.questions_json === 'string' ? JSON.parse(assignment.questions_json || '[]') : assignment.questions_json;
  if (!Array.isArray(assignedQuestions) || assignedQuestions.length === 0) throw new Error(`Assignment '${assignmentId}' has no questions.`);
  const effectiveMarkingScheme = (markingSchemeText || '').trim() || (assignment.answer_key_text || '').trim();
  if (process.env.PRIMARY_AI_PROVIDER?.toLowerCase() !== 'sarvam' && assignment.reasoning_model) reasoningModel = assignment.reasoning_model;

  // 2. Group files by groupKey
  const studentGroups: Record<string, BatchItemFile[]> = {};
  const groupDisplayNames: Record<string, string> = {};
  for (const file of unpackedFiles) {
    const key = file.groupKey || `ungrouped:${Object.keys(studentGroups).length}`;
    if (!studentGroups[key]) {
      studentGroups[key] = [];
      groupDisplayNames[key] = file.studentName || `Student ${Object.keys(studentGroups).length + 1}`;
    }
    studentGroups[key].push(file);
  }

  const studentEntries = Object.entries(studentGroups).map(
    ([key, groupFiles]) => [groupDisplayNames[key], groupFiles] as [string, BatchItemFile[]]
  );
  job.stage = 'grading';
  job.total = studentEntries.length;
  job.processed = 0;
  job.successful = 0;
  job.failed = 0;
  job.gradingProgress = { current: 0, total: studentEntries.length, successful: 0, failed: 0 };
  job.statusMessage = `Starting parallel grading for ${studentEntries.length} student submissions...`;
  job.updatedAt = new Date().toISOString();

  console.log(`🚀 Starting Batch Job ${jobId}: ${studentEntries.length} student papers. Parallel grading (concurrency 6) on Gemini Pay-As-You-Go...`);

  // Load class student roster once for high-accuracy student linking
  let roster: Array<{ id: string; name: string; roll_number?: string }> = [];
  if (isSupabaseConfigured()) {
    try {
      const { data: stData } = await supabase.from('students').select('id, name, roll_number').limit(200);
      if (stData) roster = stData;
    } catch (e) {
      console.warn('⚠️ Could not load students roster:', e);
    }
  }

  // Parallel Worker Pool: process 6 student evaluations concurrently
  await runWithConcurrency(studentEntries, 6, async ([rawStudentName, pageFiles], idx) => {
    let studentName = formatStudentDisplayName(rawStudentName);
    let matchedStudentId: string | null = null;

    if (roster.length > 0 && rawStudentName) {
      const matched = roster.find(s => isSameStudent(rawStudentName, s.name));
      if (matched) {
        studentName = matched.name;
        matchedStudentId = matched.id;
      }
    }

    const pageBuffers = pageFiles.map(f => f.buffer);
    const primaryFile = pageFiles.find(f => f.mimetype === 'application/pdf') || pageFiles[0];

    try {
      const cloudUrls: string[] = [];
      if (isSupabaseConfigured()) {
        for (const pFile of pageFiles) {
          try {
            const url = await uploadImageToSupabase(pFile.buffer, pFile.originalname || 'submission.pdf', pFile.mimetype || 'application/pdf');
            if (url) cloudUrls.push(url);
          } catch (e) {
            console.warn(`⚠️ Storage upload notice for ${pFile.originalname}:`, e);
          }
        }
      }
      const primaryCloudUrl = cloudUrls.length > 0 ? cloudUrls[0] : '';
      let ocrText = '';
      let langCode = selectedLanguage.substring(0, 3).toUpperCase();

      if (primaryFile?.preExtractedOcr) {
        ocrText = primaryFile.preExtractedOcr;
        console.log(`⚡ [SINGLE-PASS OCR] Reusing pre-extracted OCR (${ocrText.length} chars) for "${studentName}" (zero duplicate OCR calls).`);
      } else {
        const ocrResult = await performOcrPages(pageBuffers, selectedLanguage, pageFiles.map((file) => file.mimetype), subjectName);
        ocrText = ocrResult.ocrText;
        langCode = ocrResult.langCode;
      }

      // Evaluate student answer paper via Direct Google Gemini API
      const pdfEval = await evaluateStudentAnswerAgainstPdf(
        ocrText,
        className,
        pageBuffers,
        primaryFile.mimetype,
        assignedQuestions,
        reasoningModel,
        selectedLanguage,
        effectiveMarkingScheme
      );

      const finalOcrText = pdfEval.ocrText || ocrText;
      const subId = `sub-batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const submittedAt = new Date().toISOString();

      const aiEvalData = {
        ocrText: finalOcrText,
        score: pdfEval.score,
        maxScore: pdfEval.maxScore,
        excelledAreas: pdfEval.excelledAreas,
        knowledgeGaps: pdfEval.knowledgeGaps,
        feedback: pdfEval.feedback,
        socraticHint: pdfEval.socraticHint,
        evaluationProvider: pdfEval.evaluationProvider,
        evaluationStatus: pdfEval.evaluationStatus,
        fallbackReason: pdfEval.fallbackReason,
        questionEvaluations: pdfEval.questionEvaluations
      };

      if (!matchedStudentId && isSupabaseConfigured() && studentName) {
        try {
          const { data: stMatch } = await supabase
            .from('students')
            .select('id')
            .ilike('name', studentName.trim())
            .limit(1);
          if (stMatch && stMatch.length > 0) {
            matchedStudentId = stMatch[0].id;
          }
        } catch (stErr) {
          console.warn('⚠️ Student match notice in batch:', stErr);
        }
      }

      const submissionPayload: any = {
        id: subId,
        assignment_id: assignmentId || 'assign-1',
        student_id: matchedStudentId,
        student_name: studentName,
        subject: subjectName,
        language: selectedLanguage,
        lang_code: langCode,
        sample_paper_url: primaryCloudUrl,
        sample_paper_urls: JSON.stringify(cloudUrls),
        ocr_text: finalOcrText,
        score: pdfEval.score,
        max_score: pdfEval.maxScore,
        feedback: pdfEval.feedback,
        socratic_hint: pdfEval.socraticHint,
        evaluation_provider: pdfEval.evaluationProvider,
        evaluation_status: pdfEval.evaluationStatus,
        fallback_reason: pdfEval.fallbackReason || null,
        ai_evaluation_json: JSON.stringify(aiEvalData),
        status: pdfEval.evaluationStatus === 'manual_review' ? 'manual_review' : 'pending_review',
        submitted_at: submittedAt
      };

      // Store submission in Supabase DB
      if (isSupabaseConfigured()) {
        const { error: supaErr } = await supabase.from('submissions').insert([submissionPayload]);
        if (supaErr) {
          delete submissionPayload.sample_paper_urls;
          delete submissionPayload.ai_evaluation_json;
          await supabase.from('submissions').insert([submissionPayload]);
        }
      }

      const newSubmission = {
        id: subId,
        assignmentId: assignmentId || 'assign-1',
        studentName: studentName,
        subject: subjectName,
        language: selectedLanguage,
        langCode,
        samplePaperUrl: primaryCloudUrl,
        samplePaperUrls: cloudUrls,
        aiEvaluation: aiEvalData,
        status: 'pending_review',
        submittedAt
      };

      job.submissions.push(newSubmission);
      job.successful++;
    } catch (err: any) {
      console.error(`⚠️ Error grading ${studentName}:`, err);
      job.failed++;
      job.errors.push({ fileName: studentName, error: err.message || 'Evaluation error' });
    } finally {
      job.processed++;
      job.gradingProgress = {
        current: job.processed,
        total: job.total,
        successful: job.successful,
        failed: job.failed
      };
      job.statusMessage = `Graded ${job.processed} of ${job.total} student papers (${job.successful} successful)...`;
      job.updatedAt = new Date().toISOString();
    }
  });

  job.stage = job.failed === job.total ? 'failed' : 'completed';
  job.status = job.failed === job.total ? 'failed' : 'completed';
  job.statusMessage = `Batch complete: ${job.successful} of ${job.total} student papers graded successfully.`;
  job.updatedAt = new Date().toISOString();
  console.log(`✅ Batch Job ${jobId} Completed! (${job.successful}/${job.total} student papers graded successfully).`);
}

/**
 * Extract clean student name from uploaded filename (e.g., "Aarav_Sharma_Sheet1.jpg" -> "Aarav Sharma")
 */
export function extractStudentNameFromFilename(filename: string): string | null {
  if (!filename) return null;
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;

  // Ignore general non-student document filenames
  if (/\b(cbse|grade|term|exam|test|marking|scheme|paper|question|batch|combined)\b/i.test(nameWithoutExt)) {
    return null;
  }

  const cleaned = nameWithoutExt
    .replace(/[-_]?(page|p|sheet|ans|doc|scan|part)?\d+/gi, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2) return null;
  return formatStudentDisplayName(cleaned);
}

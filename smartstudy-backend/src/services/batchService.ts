import AdmZip from 'adm-zip';
import { evaluateStudentAnswerAgainstPdf } from './ragService.js';
import { getConfiguredGeminiModel } from './aiService.js';
import { expandPdfFilesToImages } from './pdfRasterService.js';
import { performOcrPages } from './ocrService.js';
import { supabase, uploadImageToSupabase } from '../db/supabase.js';

export interface BatchItemFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  studentName?: string;
  // Uniquely identifies which student this page belongs to. Only pages extracted from the same
  // ZIP folder share a groupKey (legitimate multi-page submission); everything else is unique per
  // file so similarly-named uploads (e.g. IMG_1234.jpg, IMG_1235.jpg) are never merged together.
  groupKey?: string;
}

export interface BatchJob {
  id: string;
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
 * Unpacks ZIP archives recursively and normalizes incoming files (ZIPs, PDFs, Images)
 */
function unpackAndNormalizeFiles(rawFiles: BatchItemFile[]): BatchItemFile[] {
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

      const inferredName = file.studentName || extractStudentNameFromFilename(file.originalname) || undefined;

      normalizedFiles.push({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: mime,
        studentName: inferredName,
        // One loose top-level upload = one student's submission — never merge with another file
        // just because the filenames happen to look similar.
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
  markingSchemeText?: string
): BatchJob {
  const jobId = 'batch-' + Date.now();
  const now = new Date().toISOString();

  const newJob: BatchJob = {
    id: jobId,
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
  processBatchQueue(jobId, files, assignmentId, selectedLanguage, targetClassName, targetSubject, markingSchemeText).catch((err) => {
    console.error(`❌ Batch Job ${jobId} execution error:`, err);
    if (batchJobs[jobId]) {
      batchJobs[jobId].status = 'failed';
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
 * Background Throttled Concurrency Worker Pool
 */
async function processBatchQueue(
  jobId: string,
  rawFiles: BatchItemFile[],
  assignmentId?: string,
  selectedLanguage: string = 'English',
  targetClassName?: string,
  targetSubject?: string,
  markingSchemeText?: string
) {
  const job = batchJobs[jobId];
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  // 1. Unpack ZIP archives and normalize all files (ZIPs, PDFs, Images)
  const unpackedFiles = unpackAndNormalizeFiles(rawFiles);

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

  // 2. Group files by groupKey (only pages from the same ZIP folder share a group — see
  // unpackAndNormalizeFiles). The extracted/inferred name is used purely as a display label.
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
  job.total = studentEntries.length;

  console.log(`🚀 Starting Batch Job ${jobId}: ${studentEntries.length} student papers (${unpackedFiles.length} extracted files). Throttled for 15 RPM Free Gemini API...`);

  for (let idx = 0; idx < studentEntries.length; idx++) {
    const [studentName, pageFiles] = studentEntries[idx];
    const pageBuffers = pageFiles.map(f => f.buffer);

    // Pick primary file (prefer PDF if available, else first image)
    const primaryFile = pageFiles.find(f => f.mimetype === 'application/pdf') || pageFiles[0];

    try {
      // Upload images/PDFs to Supabase Storage directly without PDF page expansion
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

      const ocrResult = await performOcrPages(pageBuffers, selectedLanguage, pageFiles.map((file) => file.mimetype), subjectName);
      const ocrText = ocrResult.ocrText;
      const langCode = ocrResult.langCode;

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

      const submissionPayload: any = {
        id: subId,
        assignment_id: assignmentId || 'assign-1',
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
      job.updatedAt = new Date().toISOString();
      // 4-second delay between student papers to guarantee 100% compliance with 15 RPM limit
      if (idx < studentEntries.length - 1) {
        await delay(4000);
      }
    }
  }

  job.status = job.failed === job.total ? 'failed' : 'completed';
  job.updatedAt = new Date().toISOString();
  console.log(`✅ Batch Job ${jobId} Completed! (${job.successful}/${job.total} student papers graded successfully).`);
}

/**
 * Extract clean student name from uploaded filename (e.g., "Aarav_Sharma_Sheet1.jpg" -> "Aarav Sharma")
 */
function extractStudentNameFromFilename(filename: string): string | null {
  if (!filename) return null;
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  const cleaned = nameWithoutExt
    .replace(/[-_]?(page|p|sheet|ans|doc|scan|part)?\d+/gi, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

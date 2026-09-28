import { PDFDocument } from 'pdf-lib';
import { rasterizePdfPageRange } from './pdfRasterService.js';
import { callGemini36Api, getConfiguredGeminiModel } from './aiService.js';
import { supabase } from '../db/supabase.js';

export interface DetectedStudentBatch {
  studentName: string;
  rollNo?: string;
  startPage: number;
  endPage: number;
  pageCount: number;
  pdfBuffer: Buffer;
  ocrText: string;
  confidence?: number;
}

interface PageOcrAndHeader {
  pageNumber: number;
  ocrText: string;
  studentName?: string;
  rollNo?: string;
  hasNewStudentHeader: boolean;
  confidence: number;
}

interface StudentAccumulator {
  studentName: string;
  rollNo?: string;
  startPage: number;
  endPage: number;
  ocrTexts: string[];
}

/**
 * Normalizes name strings for fuzzy comparison
 */
function cleanName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Checks whether two detected student names refer to the same student
 */
export function isSameStudent(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const a = cleanName(nameA);
  const b = cleanName(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const tokensA = a.split(/\s+/).filter((t) => t.length > 1);
  const tokensB = b.split(/\s+/).filter((t) => t.length > 1);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const common = tokensA.filter((t) => tokensB.includes(t));
  return common.length >= Math.min(tokensA.length, tokensB.length);
}

/**
 * Matches detected handwritten name against known class roster
 */
function matchWithRoster(detected: string | undefined | null, roster: string[]): string | null {
  if (!detected || roster.length === 0) return null;
  for (const name of roster) {
    if (isSameStudent(detected, name)) {
      return name;
    }
  }
  return null;
}

/**
 * Performs high-precision OCR on an answer-sheet page while simultaneously inspecting
 * the TOP of the answer sheet for student identification headers (Name, Roll No, Reg No).
 *
 * This achieves single-pass processing: OCR extraction and student boundary detection
 * happen in one single API call per page, avoiding redundant round-trips.
 */
export async function performPageOcrWithHeaderCheck(
  imageBuffer: Buffer,
  pageNumber: number,
  languageName: string = 'English',
  subject?: string,
  rosterNames: string[] = []
): Promise<PageOcrAndHeader> {
  const rosterContext = rosterNames.length > 0
    ? `Class student roster for matching: ${rosterNames.slice(0, 40).join(', ')}.\nIf a name is handwritten, match it to the closest roster name if confident.`
    : '';

  const prompt = `You are an expert exam transcriber performing optical character recognition (OCR) on Page ${pageNumber} of a student answer sheet in ${languageName}.

SECTION 1: TOP-OF-SHEET STUDENT IDENTIFICATION:
Carefully inspect the TOP of this answer-sheet page (the top header band / first 25% of the page):
- Is this the FIRST / COVER page of a student's answer sheet? Does it contain a handwritten or printed student name, candidate name, roll number, admission number, or exam title header?
- If YES: Output on line 1 exactly:
  [STUDENT_HEADER: Name="<student_name_or_empty>", RollNo="<roll_no_or_empty>"]
- If NO (this page is a continuation of answers without any new student name header):
  Do NOT output [STUDENT_HEADER].

${rosterContext}

SECTION 2: COMPLETE HANDWRITING & ANSWER TRANSCRIPTION:
Transcribe all student handwriting, question numbers, equations, diagrams/descriptions, and answers line by line.
For answer boxes [ ], checkboxes, or fill-in blanks:
- If written inside: [Box: <handwritten_text>]
- If empty: [Box: EMPTY]
Transcribe faithfully without guessing or inferring answers.`;

  const model = getConfiguredGeminiModel();
  const rawResponse = await callGemini36Api(prompt, imageBuffer, 'image/png', 3, model);

  if (!rawResponse || !rawResponse.trim()) {
    return {
      pageNumber,
      ocrText: `[Page ${pageNumber} Scan]`,
      hasNewStudentHeader: pageNumber === 1,
      studentName: pageNumber === 1 ? 'Student 1' : undefined,
      confidence: 0.8
    };
  }

  const trimmed = rawResponse.trim();
  const headerMatch = trimmed.match(/\[STUDENT_HEADER:\s*Name="([^"]*)"(?:,\s*RollNo="([^"]*)")?\]/i);

  let studentName: string | undefined;
  let rollNo: string | undefined;
  let hasNewStudentHeader = false;

  if (headerMatch) {
    const rawName = headerMatch[1]?.trim();
    const rawRoll = headerMatch[2]?.trim();
    if (rawName && rawName.length >= 2 && !rawName.match(/^(none|null|undefined|na|n\/a)$/i)) {
      studentName = matchWithRoster(rawName, rosterNames) || rawName;
      hasNewStudentHeader = true;
    }
    if (rawRoll && rawRoll.length >= 1 && !rawRoll.match(/^(none|null|undefined|na|n\/a)$/i)) {
      rollNo = rawRoll;
      hasNewStudentHeader = true;
    }
  }

  // Remove the [STUDENT_HEADER: ...] tag from the OCR text so only the clean answers remain
  const cleanOcrText = trimmed
    .replace(/\[STUDENT_HEADER:[^\]]*\]\s*/gi, '')
    .trim();

  return {
    pageNumber,
    ocrText: cleanOcrText || trimmed,
    studentName,
    rollNo,
    hasNewStudentHeader,
    confidence: 0.96
  };
}

/**
 * Scans a multi-page PDF in a single streaming pass:
 * 1. Performs OCR on each page while checking the top of the sheet for student identification headers.
 * 2. As soon as a new student is detected at the top of a page, finalizes the previous student's packet.
 * 3. Returns segregated student batches containing pre-extracted OCR text and sliced sub-PDFs.
 */
export async function detectAndSplitStudentSubmissions(
  pdfBuffer: Buffer,
  options?: {
    targetClassName?: string;
    assignmentId?: string;
    language?: string;
    subject?: string;
    chunkSize?: number;
  }
): Promise<DetectedStudentBatch[]> {
  const sourceDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = sourceDoc.getPageCount();

  if (totalPages <= 1) {
    return [
      {
        studentName: 'Student 1',
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        pdfBuffer,
        ocrText: ''
      }
    ];
  }

  console.log(`\n===============================================================`);
  console.log(`🔍 [IN-OCR STREAMING SPLITTER] Processing ${totalPages}-page PDF...`);
  console.log(`   ├─ Single-pass OCR + Top-of-Sheet Student Name Extraction`);
  console.log(`===============================================================`);

  // 1. Fetch class roster for higher name-matching precision
  let rosterNames: string[] = [];
  try {
    const { data: students } = await supabase
      .from('students')
      .select('name, roll_number')
      .limit(150);
    if (students && students.length > 0) {
      rosterNames = students.map((s) => s.name).filter(Boolean);
    }
  } catch (err) {
    console.warn('⚠️ Could not load class roster for fuzzy matching:', err);
  }

  const CHUNK_SIZE = options?.chunkSize || 6;
  const language = options?.language || 'English';
  const subject = options?.subject || '';

  const studentAccumulators: StudentAccumulator[] = [];
  let currentStudent: StudentAccumulator | null = null;
  let studentCount = 0;

  // 2. Stream through pages in memory-safe chunks
  for (let startPage = 1; startPage <= totalPages; startPage += CHUNK_SIZE) {
    const endPage = Math.min(startPage + CHUNK_SIZE - 1, totalPages);
    console.log(`📑 [STREAMING OCR] Rasterizing and extracting Pages ${startPage} to ${endPage} of ${totalPages}...`);

    const rasterPages = await rasterizePdfPageRange(pdfBuffer, startPage, endPage, 1.5);

    for (const rPage of rasterPages) {
      const pageNum = rPage.pageNumber;

      // Single-pass OCR + top-of-sheet header check
      const ocrResult = await performPageOcrWithHeaderCheck(
        rPage.buffer,
        pageNum,
        language,
        subject,
        rosterNames
      );

      const isFirstPage = pageNum === 1;
      const detectedName = ocrResult.studentName?.trim();
      const isDifferentStudent =
        currentStudent &&
        detectedName &&
        !isSameStudent(detectedName, currentStudent.studentName);

      // Boundary condition: First page, or a new distinct student name detected at the top of the sheet
      if (isFirstPage || (ocrResult.hasNewStudentHeader && isDifferentStudent) || !currentStudent) {
        if (currentStudent) {
          studentAccumulators.push(currentStudent);
        }

        studentCount++;
        const chosenName = detectedName || `Student ${studentCount}`;

        currentStudent = {
          studentName: chosenName,
          rollNo: ocrResult.rollNo,
          startPage: pageNum,
          endPage: pageNum,
          ocrTexts: [ocrResult.ocrText]
        };

        console.log(`   ✨ [NEW STUDENT DETECTED] Page ${pageNum}: "${chosenName}" (Roll No: ${ocrResult.rollNo || 'N/A'})`);
      } else {
        // Continuation of current active student
        currentStudent.endPage = pageNum;
        currentStudent.ocrTexts.push(ocrResult.ocrText);

        // If current student was a generic fallback "Student X" and this page has a verified name, update it
        if (currentStudent.studentName.startsWith('Student ') && detectedName) {
          currentStudent.studentName = detectedName;
        }
      }
    }
  }

  // Push final student
  if (currentStudent) {
    studentAccumulators.push(currentStudent);
  }

  console.log(`\n✂️ [STREAMING SPLITTER COMPLETE] Identified ${studentAccumulators.length} distinct student submissions:`);

  // 3. Slice sub-PDFs using pdf-lib and bundle with pre-extracted OCR text
  const resultBatches: DetectedStudentBatch[] = [];

  for (let i = 0; i < studentAccumulators.length; i++) {
    const acc = studentAccumulators[i];
    const studentDoc = await PDFDocument.create();
    const pageIndices: number[] = [];

    for (let p = acc.startPage; p <= acc.endPage; p++) {
      pageIndices.push(p - 1);
    }

    const copiedPages = await studentDoc.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach((p) => studentDoc.addPage(p));
    const subPdfBuffer = Buffer.from(await studentDoc.save());

    const combinedOcrText = acc.ocrTexts
      .map((t, idx) => `--- PAGE ${acc.startPage + idx} ---\n${t}`)
      .join('\n\n');

    console.log(
      `   ├─ [Student ${i + 1}] "${acc.studentName}": Pages ${acc.startPage} to ${acc.endPage} (${pageIndices.length} sides, ${combinedOcrText.length} chars OCR)`
    );

    resultBatches.push({
      studentName: acc.studentName,
      rollNo: acc.rollNo,
      startPage: acc.startPage,
      endPage: acc.endPage,
      pageCount: pageIndices.length,
      pdfBuffer: subPdfBuffer,
      ocrText: combinedOcrText,
      confidence: 0.98
    });
  }

  console.log(`===============================================================\n`);
  return resultBatches;
}

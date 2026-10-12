import { PDFDocument } from 'pdf-lib';
import { rasterizePdfPageRange, rasterizePdfHeaders } from './pdfRasterService.js';
import { callGemini36Api, getConfiguredGeminiModel, cleanAndParseJsonArray } from './aiService.js';
import { supabase } from '../db/supabase.js';

export interface SplitProgressUpdate {
  current: number;
  total: number;
  studentsFound: number;
  statusMessage: string;
}

export interface DetectedStudentBatch {
  studentName: string;
  rollNo?: string;
  startPage: number;
  endPage: number;
  pageCount: number;
  pageNumbers?: number[];
  pdfBuffer: Buffer;
  ocrText: string;
  confidence?: number;
}

export interface HeaderClassification {
  pageNumber: number;
  hasNewStudentHeader: boolean;
  studentName?: string;
  rollNo?: string;
  isSupplementary?: boolean;
}

interface PageOcrAndHeader {
  pageNumber: number;
  ocrText: string;
  studentName?: string;
  rollNo?: string;
  isSupplementary?: boolean;
  hasNewStudentHeader: boolean;
  confidence: number;
}

interface StudentAccumulator {
  studentName: string;
  rollNo?: string;
  pageNumbers: number[];
  ocrPages: Array<{ pageNumber: number; text: string }>;
  hasExplicitHeader?: boolean;
}

/**
 * Calculates Levenshtein edit distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Normalizes name strings for fuzzy comparison:
 * Lowercases, strips punctuation, normalizes whitespace and honorific prefixes
 */
export function cleanName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(mr|miss|ms|master|student|candidate|name)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats a student name nicely (converts ALL CAPS or all lower to Title Case)
 */
export function formatStudentDisplayName(name: string): string {
  if (!name) return 'Student';
  const trimmed = name.trim();
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return trimmed;
}

/**
 * Robust check whether two detected student names refer to the same student.
 * Handles:
 * - UPPERCASE vs lowercase vs Title Case (e.g. "VENYA SREE" vs "Venya Shree")
 * - Phonetic / minor OCR variations (e.g. "Shree" vs "Sree", "Ronav" vs "Ronay")
 * - Partial name / initial matches (e.g. "Arjun" vs "Arjun Karnati", "Riddhi Reddy Maddi" vs "Riddhi Reddy Marald")
 */
export function isSameStudent(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const a = cleanName(nameA);
  const b = cleanName(nameB);
  if (!a || !b) return false;
  if (a === b) return true;

  // Generic fallback names like "Student 1" vs "Student 2" must never be matched unless exact
  if (/^student\s+\d+$/i.test(a) || /^student\s+\d+$/i.test(b)) {
    return a === b;
  }

  // Token-level matching
  const tokensA = a.split(/\s+/).filter((t) => t.length > 1);
  const tokensB = b.split(/\s+/).filter((t) => t.length > 1);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const fnA = tokensA[0];
  const fnB = tokensB[0];

  // If both have multi-word names (e.g. "Shreyan Reddy" vs "Riddhi Reddy Marri"):
  if (tokensA.length > 1 && tokensB.length > 1) {
    const fnDist = levenshteinDistance(fnA, fnB);
    const fnMax = Math.max(fnA.length, fnB.length);
    const hasSharedLastName = tokensA.slice(1).some(tA => tokensB.slice(1).some(tB => tA === tB || (Math.max(tA.length, tB.length) >= 4 && levenshteinDistance(tA, tB) <= 1)));
    const fnClose = fnDist === 0 || (fnMax >= 5 && fnDist <= 1) || (fnMax >= 6 && fnDist <= 2 && hasSharedLastName);
    // If first names are completely different (e.g. Shreyan vs Riddhi), they are definitely different students!
    if (!fnClose) return false;

    // If first names match and last initial matches (e.g. "Arjun Karnati" vs "Arjun Kurati" / "Arjun Kunchi", "Rithwik Pasunuri" vs "Rithwik Prasanna"):
    if (fnDist === 0 && tokensA[1][0] === tokensB[1][0]) return true;

    // Both first names match or are close. Check last names / tokens:
    let matchCount = 0;
    for (const tA of tokensA) {
      const found = tokensB.some((tB) => {
        if (tA === tB) return true;
        const d = levenshteinDistance(tA, tB);
        return Math.max(tA.length, tB.length) >= 4 && d <= 1;
      });
      if (found) matchCount++;
    }
    return matchCount >= 2 || (fnClose && hasSharedLastName);
  }

  // If one is a single word and the other is multi-word (e.g. "Arjun" vs "Arjun Karnati", "Tanvi" vs "Saanvi Aeri"):
  if ((tokensA.length === 1 && tokensB.length > 1) || (tokensB.length === 1 && tokensA.length > 1)) {
    const single = tokensA.length === 1 ? tokensA[0] : tokensB[0];
    const multiFn = (tokensA.length === 1 ? tokensB : tokensA)[0];
    if (single === multiFn) return true;
    const d = levenshteinDistance(single, multiFn);
    return d <= 1 && Math.min(single.length, multiFn.length) >= 5 && single[0] === multiFn[0];
  }

  // Both are single word names (e.g. "Tanvi" vs "Saanvi", "Nivaan" vs "Ronav"):
  if (tokensA.length === 1 && tokensB.length === 1) {
    const d = levenshteinDistance(a, b);
    return d <= 1 && Math.min(a.length, b.length) >= 5 && a[0] === b[0];
  }

  return false;
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
Carefully inspect the very TOP of this answer-sheet page (the top header band / first 20% of the page):
- Is this a formal COVER / TITLE PAGE of a new student's exam booklet with student credentials (e.g. "Name:", "Student Name:", "Roll No:", "Candidate Name:")?
- CAUTION: DO NOT treat question numbers (e.g. "5.", "Q5", "11"), marks, or margin notes as roll numbers or student names!
- CAUTION: In an exam, students often write their name or roll number again on an ADDITIONAL / SUPPLEMENTARY / CONTINUATION SHEET (e.g., sheets 10, 11). If this is an additional sheet or continuation of the active exam, indicate IsSupplementary="true".
- If this page explicitly contains a student identification header band:
  Output on line 1 exactly:
  [STUDENT_HEADER: Name="<student_name_or_empty>", RollNo="<roll_no_or_empty>", IsSupplementary="true"|"false"]
- If NO student identity header band is present (this is an inner continuation page containing answers):
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
  const headerMatch = trimmed.match(/\[STUDENT_HEADER:\s*Name="([^"]*)"(?:,\s*RollNo="([^"]*)")?(?:,\s*IsSupplementary="([^"]*)")?\]/i);

  let studentName: string | undefined;
  let rollNo: string | undefined;
  let isSupplementary = false;
  let hasNewStudentHeader = false;

  if (headerMatch) {
    const rawName = headerMatch[1]?.trim();
    const rawRoll = headerMatch[2]?.trim();
    const rawSupp = headerMatch[3]?.trim();
    if (rawSupp && rawSupp.toLowerCase() === 'true') {
      isSupplementary = true;
    }
    if (rawName && rawName.length >= 2 && !rawName.match(/^(none|null|undefined|na|n\/a)$/i)) {
      studentName = matchWithRoster(rawName, rosterNames) || formatStudentDisplayName(rawName);
      hasNewStudentHeader = true;
    }
    if (rawRoll && rawRoll.length >= 1 && !rawRoll.match(/^(none|null|undefined|na|n\/a)$/i) && !rawRoll.match(/^(q\d+|\d+\.?)$/i)) {
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
    isSupplementary,
    hasNewStudentHeader,
    confidence: 0.96
  };
}

/**
 * Lightweight in-memory worker pool for parallel API calls
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async (_, workerId) => {
    // Stagger worker start by 120ms to avoid simultaneous TLS socket contention
    if (workerId > 0) {
      await new Promise(r => setTimeout(r, workerId * 120));
    }
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await workerFn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Classifies an array of cropped page header images in a single Gemini call.
 * Achieves 10x call reduction (e.g. 500 pages -> 50 calls).
 */
export async function classifyPageHeadersBatch(
  headers: Array<{ pageNumber: number; buffer: Buffer }>,
  languageName: string = 'English',
  rosterNames: string[] = []
): Promise<HeaderClassification[]> {
  if (headers.length === 0) return [];

  const rosterContext = rosterNames.length > 0
    ? `Class student roster for matching: ${rosterNames.slice(0, 40).join(', ')}.\nIf a detected name matches a roster name, output the exact roster name.`
    : '';

  const pageList = headers.map((h, i) => `Image ${i + 1} = Page ${h.pageNumber}`).join('\n');
  const prompt = `You are an expert exam boundary detector. Analyze the page thumbnails of ${headers.length} student answer-sheet pages in ${languageName}:
${pageList}

For EACH page, determine if it starts a NEW student's exam booklet (Title / Cover page with formal student credentials such as "Name:", "Student Name:", "Roll No:", "Candidate Name:"), or if it is an inner continuation sheet.
NOTE: Pages may be scanned sideways or rotated 90 degrees; inspect all orientations for the school title / student name box.

CRITICAL BOUNDARY RULES:
1. "hasNewStudentHeader": true ONLY if this page explicitly starts a new student's submission (e.g. title/cover header band with student name or roll number).
2. Inner continuation sheets containing questions and answers MUST have "hasNewStudentHeader": false.
3. CAUTION: Question numbers (e.g. "5.", "Q5", "11"), section headers, map diagrams, or teacher marks in margins are NOT roll numbers or student names!
4. If a page is an outline map, graph sheet, or additional/supplementary sheet where a student wrote their name or details, set "isSupplementary": true.
${rosterContext}

Return ONLY a valid JSON array of objects (one per page in order):
[
  {
    "pageNumber": ${headers[0].pageNumber},
    "hasNewStudentHeader": true,
    "studentName": "Student Full Name",
    "rollNo": "Roll Number or ID",
    "isSupplementary": false
  }
]`;

  const model = getConfiguredGeminiModel();
  const rawResponse = await callGemini36Api(
    prompt,
    headers.map(h => h.buffer),
    'image/jpeg',
    4,
    model
  );

  const fallbackResults: HeaderClassification[] = headers.map(h => ({
    pageNumber: h.pageNumber,
    hasNewStudentHeader: false
  }));

  if (!rawResponse) {
    if (headers.length > 2) {
      console.warn(`⚠️ Batch of ${headers.length} headers failed to classify. Splitting into 2 sub-batches for resilience...`);
      const mid = Math.ceil(headers.length / 2);
      const sub1 = await classifyPageHeadersBatch(headers.slice(0, mid), languageName, rosterNames);
      const sub2 = await classifyPageHeadersBatch(headers.slice(mid), languageName, rosterNames);
      return [...sub1, ...sub2];
    }
    return fallbackResults;
  }

  try {
    const parsed = cleanAndParseJsonArray(rawResponse);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallbackResults;

    const resultMap = new Map<number, HeaderClassification>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const pageNum = Number(item.pageNumber);
      if (!Number.isFinite(pageNum)) continue;

      const rawName = typeof item.studentName === 'string' ? item.studentName.trim() : '';
      const rawRoll = typeof item.rollNo === 'string' ? item.rollNo.trim() : '';
      const isSupp = Boolean(item.isSupplementary);
      let studentName: string | undefined;
      let rollNo: string | undefined;
      let hasHeader = Boolean(item.hasNewStudentHeader);

      if (rawName && rawName.length >= 2 && !rawName.match(/^(none|null|undefined|na|n\/a)$/i)) {
        studentName = matchWithRoster(rawName, rosterNames) || formatStudentDisplayName(rawName);
        hasHeader = true;
      }
      if (rawRoll && rawRoll.length >= 1 && !rawRoll.match(/^(none|null|undefined|na|n\/a)$/i) && !rawRoll.match(/^(q\d+|\d+\.?)$/i)) {
        rollNo = rawRoll;
        hasHeader = true;
      }

      resultMap.set(pageNum, {
        pageNumber: pageNum,
        hasNewStudentHeader: hasHeader,
        studentName,
        rollNo,
        isSupplementary: isSupp
      });
    }

    return headers.map(h => resultMap.get(h.pageNumber) || {
      pageNumber: h.pageNumber,
      hasNewStudentHeader: false
    });
  } catch (err) {
    console.warn('⚠️ Could not parse header batch classification JSON:', err);
    return fallbackResults;
  }
}

/**
 * High-Speed Student Submission Splitter:
 * 1. Template / Fixed-Page Mode: Instant 0-second mathematical split when page count is known.
 * 2. Two-Phase "Split First, Transcribe Later": Lightweight 22% header strip cropping.
 * 3. Multi-Page Header Batching: 8-10 headers grouped per Gemini call.
 * 4. Concurrency Pool: 5 parallel workers taking full advantage of Gemini Pay-As-You-Go limits.
 */
export async function detectAndSplitStudentSubmissions(
  pdfBuffer: Buffer,
  options?: {
    targetClassName?: string;
    assignmentId?: string;
    language?: string;
    subject?: string;
    chunkSize?: number;
    fixedPageCount?: number;
    onProgress?: (progress: SplitProgressUpdate) => void;
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
        pageNumbers: [1],
        pdfBuffer,
        ocrText: ''
      }
    ];
  }

  // 1. Template / Fixed-Page Mode (Instant 0-Second Mathematical Splitting)
  if (options?.fixedPageCount && options.fixedPageCount > 0) {
    const fixedCount = Math.max(1, Math.floor(options.fixedPageCount));
    console.log(`\n===============================================================`);
    console.log(`⚡ [INSTANT FIXED-PAGE SPLITTER] Mathematically slicing ${totalPages}-page PDF into ${fixedCount}-page booklets (0-second AI)...`);
    console.log(`===============================================================`);

    options?.onProgress?.({
      current: 0,
      total: totalPages,
      studentsFound: 0,
      statusMessage: `Fixed-page mode: Slicing PDF into ${fixedCount}-page student booklets...`
    });

    const resultBatches: DetectedStudentBatch[] = [];
    let studentIdx = 1;

    for (let start = 1; start <= totalPages; start += fixedCount) {
      const end = Math.min(start + fixedCount - 1, totalPages);
      const pageNumbers: number[] = [];
      for (let p = start; p <= end; p++) pageNumbers.push(p);

      const studentDoc = await PDFDocument.create();
      const pageIndices = pageNumbers.map((p) => p - 1);
      const copiedPages = await studentDoc.copyPages(sourceDoc, pageIndices);
      copiedPages.forEach((p) => studentDoc.addPage(p));
      const subPdfBuffer = Buffer.from(await studentDoc.save());

      const chosenName = `Student ${studentIdx}`;
      resultBatches.push({
        studentName: chosenName,
        startPage: start,
        endPage: end,
        pageCount: pageNumbers.length,
        pageNumbers,
        pdfBuffer: subPdfBuffer,
        ocrText: '',
        confidence: 1.0
      });

      studentIdx++;
    }

    options?.onProgress?.({
      current: totalPages,
      total: totalPages,
      studentsFound: resultBatches.length,
      statusMessage: `Successfully segregated into ${resultBatches.length} student submissions instantly.`
    });

    console.log(`✅ [FIXED-PAGE SPLIT COMPLETE] Created ${resultBatches.length} student submissions in <1s.`);
    return resultBatches;
  }

  // 2. High-Speed Two-Phase Header Batching with Concurrency Pool
  console.log(`\n===============================================================`);
  console.log(`🔍 [TWO-PHASE BATCH SPLITTER] Processing ${totalPages}-page PDF...`);
  console.log(`   ├─ Strategy 1: Multi-Page Header Batching (8-10 headers/call)`);
  console.log(`   ├─ Strategy 2: Parallel Worker Pool (Concurrency 5)`);
  console.log(`   ├─ Strategy 3: Full-Page 0.65x Thumbnails (handles rotated/sideways pages)`);
  console.log(`===============================================================`);

  // Fetch class roster for higher name-matching precision
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

  const language = options?.language || 'English';
  const BATCH_SIZE = Math.min(10, Math.max(6, options?.chunkSize || 8));

  // Partition page numbers into multi-page batches
  const pageBatches: number[][] = [];
  for (let p = 1; p <= totalPages; p += BATCH_SIZE) {
    const batch: number[] = [];
    for (let i = p; i < Math.min(p + BATCH_SIZE, totalPages + 1); i++) {
      batch.push(i);
    }
    pageBatches.push(batch);
  }

  options?.onProgress?.({
    current: 0,
    total: totalPages,
    studentsFound: 0,
    statusMessage: `Rendering thumbnails and detecting student boundaries...`
  });

  let processedCount = 0;

  // Process header batches using a concurrency pool of 3 workers
  const batchClassifications = await runWithConcurrency(pageBatches, 3, async (batchPages) => {
    // Render full-page 0.65x thumbnails to capture rotated/sideways pages
    const headers = await rasterizePdfHeaders(pdfBuffer, batchPages, 0.65, 1.0);
    // Classify all headers in this batch in 1 Gemini call
    const classifications = await classifyPageHeadersBatch(headers, language, rosterNames);

    processedCount += batchPages.length;
    options?.onProgress?.({
      current: Math.min(processedCount, totalPages),
      total: totalPages,
      studentsFound: 0,
      statusMessage: `Boundary detection: analyzed ${Math.min(processedCount, totalPages)} of ${totalPages} pages...`
    });

    return classifications;
  });

  // Flatten and sort by page number
  const allPageHeaders = batchClassifications.flat().sort((a, b) => a.pageNumber - b.pageNumber);

  // Group pages into student submissions
  const studentBuckets: StudentAccumulator[] = [];
  let activeStudent: StudentAccumulator | null = null;
  let studentCount = 0;

  function findMatchingBucket(
    buckets: StudentAccumulator[],
    detectedName?: string,
    detectedRoll?: string,
    isSupplementaryPage?: boolean
  ): StudentAccumulator | undefined {
    if (activeStudent) {
      if (isSupplementaryPage) return activeStudent;
      if (detectedName && isSameStudent(detectedName, activeStudent.studentName)) return activeStudent;
      if (detectedRoll && activeStudent.rollNo) {
        const cleanRoll = detectedRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aRoll = activeStudent.rollNo.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanRoll.length > 0 && cleanRoll === aRoll) return activeStudent;
      }
    }

    if (!detectedName && !detectedRoll) return undefined;

    if (detectedRoll) {
      const cleanRoll = detectedRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanRoll.length > 0 && !cleanRoll.match(/^(none|null|undefined|na)$/i)) {
        const matchByRoll = buckets.find((b) => {
          if (!b.rollNo) return false;
          const bRoll = b.rollNo.toLowerCase().replace(/[^a-z0-9]/g, '');
          return bRoll === cleanRoll;
        });
        if (matchByRoll) return matchByRoll;
      }
    }

    if (detectedName && !detectedName.match(/^student\s+\d+$/i)) {
      const matchByName = buckets.find((b) => {
        if (b.studentName.match(/^student\s+\d+$/i)) return false;
        return isSameStudent(detectedName, b.studentName);
      });
      if (matchByName) return matchByName;
    }

    return undefined;
  }

  for (const pageInfo of allPageHeaders) {
    const pageNum = pageInfo.pageNumber;
    const rawDetectedName = pageInfo.studentName?.trim();
    const rawDetectedRoll = pageInfo.rollNo?.trim();

    // Filter out false-positive non-names (e.g. "Mooa", "Map", "India", "Ans", "Page", etc.)
    const isGarbageName = rawDetectedName && /^(mooa|map|india|graph|page|section|question|ans|rough|blank|none|null|undefined|na|n\/a)$/i.test(rawDetectedName);
    const detectedName = isGarbageName ? undefined : rawDetectedName;
    const detectedRoll = (rawDetectedRoll && !/^(none|null|undefined|na|n\/a)$/i.test(rawDetectedRoll)) ? rawDetectedRoll : undefined;

    // Page 1 is always the start of Student 1 if not otherwise classified
    const isStartOfStudent = (pageNum === 1) || (pageInfo.hasNewStudentHeader && !pageInfo.isSupplementary && (Boolean(detectedName) || Boolean(detectedRoll) || !activeStudent));

    if (isStartOfStudent) {
      const matchedBucket = findMatchingBucket(studentBuckets, detectedName, detectedRoll, pageInfo.isSupplementary);

      if (matchedBucket) {
        matchedBucket.pageNumbers.push(pageNum);
        matchedBucket.ocrPages.push({ pageNumber: pageNum, text: '' });
        if (matchedBucket.studentName.startsWith('Student ') && detectedName) {
          matchedBucket.studentName = detectedName;
        }
        if (detectedRoll && !matchedBucket.rollNo) {
          matchedBucket.rollNo = detectedRoll;
        }
        activeStudent = matchedBucket;
        console.log(`   ✨ [MATCHED EXISTING STUDENT] Page ${pageNum} matched "${matchedBucket.studentName}"`);
      } else {
        studentCount++;
        const chosenName = detectedName || `Student ${studentCount}`;
        const newBucket: StudentAccumulator = {
          studentName: chosenName,
          rollNo: detectedRoll,
          pageNumbers: [pageNum],
          ocrPages: [{ pageNumber: pageNum, text: '' }],
          hasExplicitHeader: true
        };
        studentBuckets.push(newBucket);
        activeStudent = newBucket;
        console.log(`   ✨ [NEW STUDENT DETECTED] Page ${pageNum}: "${chosenName}" (Roll No: ${detectedRoll || 'N/A'})`);
      }
    } else {
      // Continuation page
      if (activeStudent) {
        activeStudent.pageNumbers.push(pageNum);
        activeStudent.ocrPages.push({ pageNumber: pageNum, text: '' });
        console.log(`   📄 [CONTINUATION PAGE] Page ${pageNum} appended to "${activeStudent.studentName}"`);
      } else {
        studentCount++;
        const initialBucket: StudentAccumulator = {
          studentName: `Student ${studentCount}`,
          pageNumbers: [pageNum],
          ocrPages: [{ pageNumber: pageNum, text: '' }],
          hasExplicitHeader: false
        };
        studentBuckets.push(initialBucket);
        activeStudent = initialBucket;
      }
    }
  }

  // Consolidate any contiguous 1-page tail sheets (e.g. supplementary question sheet or map sheet) into preceding student
  const consolidatedBuckets: StudentAccumulator[] = [];
  for (let i = 0; i < studentBuckets.length; i++) {
    const current = studentBuckets[i];
    const prev = consolidatedBuckets[consolidatedBuckets.length - 1];
    if (prev && current.pageNumbers.length <= 1 && current.pageNumbers[0] === prev.pageNumbers[prev.pageNumbers.length - 1] + 1) {
      console.log(`   📄 [CONSOLIDATING SUPPLEMENTARY SHEET] Appending 1-page sheet Page ${current.pageNumbers[0]} ("${current.studentName}") to student "${prev.studentName}"`);
      prev.pageNumbers.push(...current.pageNumbers);
      prev.ocrPages.push(...current.ocrPages);
      continue;
    }
    consolidatedBuckets.push(current);
  }

  console.log(`\n✂️ [BATCH SPLITTER COMPLETE] Identified ${consolidatedBuckets.length} student submissions. Slicing PDFs...`);

  // 3. Slice sub-PDFs using pdf-lib
  const resultBatches: DetectedStudentBatch[] = [];

  for (let i = 0; i < consolidatedBuckets.length; i++) {
    const acc = consolidatedBuckets[i];
    acc.pageNumbers.sort((a, b) => a - b);

    const studentDoc = await PDFDocument.create();
    const pageIndices = acc.pageNumbers.map((p) => p - 1);

    const copiedPages = await studentDoc.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach((p) => studentDoc.addPage(p));
    const subPdfBuffer = Buffer.from(await studentDoc.save());

    const startPage = acc.pageNumbers[0] || 1;
    const endPage = acc.pageNumbers[acc.pageNumbers.length - 1] || startPage;

    resultBatches.push({
      studentName: acc.studentName,
      rollNo: acc.rollNo,
      startPage,
      endPage,
      pageCount: acc.pageNumbers.length,
      pageNumbers: acc.pageNumbers,
      pdfBuffer: subPdfBuffer,
      ocrText: '',
      confidence: 0.98
    });
  }

  options?.onProgress?.({
    current: totalPages,
    total: totalPages,
    studentsFound: resultBatches.length,
    statusMessage: `Successfully segregated into ${resultBatches.length} student submissions.`
  });

  console.log(`===============================================================\n`);
  return resultBatches;
}

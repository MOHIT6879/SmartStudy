import dotenv from 'dotenv';
import { callSarvamChatApi, performSarvamVisionOcr, performSarvamVisionOcrChunks, supportsSarvamDocumentLanguage } from './sarvamService.js';
dotenv.config();

export interface QuestionStimulus {
  page?: number;
  caption?: string;
  url?: string;
}

export interface Question {
  id: string;
  text: string;
  marks?: number;
  section?: string;
  options?: string[];
  correctAnswer?: string;
  rubricKey?: string;
  type?: string;
  /** Parent question number shared by all of its parts, e.g. "3". */
  number?: string;
  /** Part label within the parent question, e.g. "a". */
  partLabel?: string;
  /** Display label combining both, e.g. "3(a)". */
  questionNo?: string;
  /** Passage or instruction shared by every part of the parent question. */
  stem?: string;
  hasVisual?: boolean;
  stimulus?: QuestionStimulus[];
}

export interface QuestionEvaluation {
  questionNo?: string;
  questionText?: string;
  benchmarkKey?: string;
  studentAnswerSnippet?: string;
  scorePercent: number;
  marks: number;
  earnedMarks: number;
  status: 'Full Credit' | 'Partial Credit' | 'Unrelated / No Credit';
  reasoning: string;
  feedback?: string;
}

export interface VisionEvaluationResult {
  ocrText: string;
  score: number;
  maxScore: number;
  excelledAreas: string[];
  knowledgeGaps: string[];
  feedback: string;
  socraticHint: string;
  questionEvaluations?: QuestionEvaluation[];
}

const getGeminiKey = () => process.env.GEMINI_API_KEY || '';
export const getConfiguredGeminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/**
 * Google Gemini 3.6 API Call (Vision + Text Prompts)
 */
export async function callGemini36Api(
  prompt: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  maxRetries = 3,
  modelNameOverride?: string
): Promise<string | null> {
  if (modelNameOverride === 'sarvam') {
    if (imageInput) {
      throw new Error('Sarvam chat does not accept image input. Use Sarvam Vision OCR before chat reasoning.');
    }
    return callSarvamChatApi(prompt, maxRetries);
  }

  const geminiKey = getGeminiKey();
  if (!geminiKey || geminiKey.includes('your_gemini_api_key')) {
    console.warn('⚠️ GEMINI_API_KEY is missing or invalid.');
    return null;
  }

  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  const parts: any[] = [{ text: prompt }];
  for (const buf of buffers) {
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: buf.toString('base64')
      }
    });
  }

  const modelName = modelNameOverride || getConfiguredGeminiModel();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 [GEMINI 3.6] Requesting completion (${modelName}) [Attempt ${attempt}/${maxRetries}]...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      });

      if (res.ok) {
        const data = await res.json() as any;
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        if (responseText) {
          console.log(`✅ [GEMINI 3.6] Successful response from ${modelName}`);
          return responseText;
        }
      } else {
        const errBody = await res.text();
        console.warn(`⚠️ [GEMINI 3.6] API notice (${res.status}): ${errBody.substring(0, 300)}`);
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          const waitMs = attempt * 2000;
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    } catch (err) {
      console.warn(`⚠️ [GEMINI 3.6] Exception:`, err);
    }
  }

  return null;
}

/**
 * Helper: Normalize vector array dimensions to target length (1536 for pgvector)
 */
function normalizeToDimensions(embedding: number[], targetDimensions = 1536): number[] {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return new Array(targetDimensions).fill(0);
  }

  if (embedding.length === targetDimensions) return embedding;

  if (embedding.length > targetDimensions) {
    return embedding.slice(0, targetDimensions);
  }

  const padded = [...embedding];
  while (padded.length < targetDimensions) {
    padded.push(0);
  }
  return padded;
}

/**
 * Generate 1536-Dimensional Vector Float Array using Google Gemini Embedding API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = text ? text.substring(0, 1000) : 'default';
  const geminiKey = getGeminiKey();

  if (geminiKey && !geminiKey.includes('your_gemini_api_key')) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: cleanText }] }
        })
      });

      if (res.ok) {
        const data = await res.json() as any;
        const rawVector = data?.embedding?.values;
        if (Array.isArray(rawVector) && rawVector.length > 0) {
          return normalizeToDimensions(rawVector, 1536);
        }
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [GEMINI EMBEDDING] API Notice (${res.status}): ${errText.substring(0, 200)}`);
      }
    } catch (err) {
      console.warn('⚠️ [GEMINI EMBEDDING] Fetch exception:', err);
    }
  }

  return new Array(1536).fill(0);
}

/**
 * Dynamic Routing Logic for Reasoning Model
 */
export async function determineReasoningModel(subject: string, questionsText: string, language: string = 'English'): Promise<string> {
  const lowerSubject = subject ? subject.toLowerCase() : '';
  if (supportsSarvamDocumentLanguage(language) || lowerSubject.includes('hindi') || lowerSubject.includes('telugu')) {
    return 'sarvam';
  }
  return getConfiguredGeminiModel();
}

function parseJsonValue(rawText: string, openingCharacter: '{' | '['): any {
  if (!rawText) return null;
  const fencedMatch = rawText.match(/```(?: json) ?\s * ([\s\S] *?)```/i);
  const source = fencedMatch?.[1]?.trim() || rawText.trim();
  const closingCharacter = openingCharacter === '{' ? '}' : ']';
  const start = source.indexOf(openingCharacter);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonCandidate = '';
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    jsonCandidate += character;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') inString = !inString;
    if (!inString && character === openingCharacter) depth++;
    if (!inString && character === closingCharacter && --depth === 0) break;
  }
  if (depth !== 0) return null;

  const sanitized = jsonCandidate.replace(/[\u0000-\u001F\u007F-\u009F]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  let repaired = '';
  let stringMode = false;
  for (let index = 0; index < sanitized.length; index++) {
    const character = sanitized[index];
    if (character === '"' && (index === 0 || sanitized[index - 1] !== '\\')) {
      stringMode = !stringMode;
      repaired += character;
      continue;
    }
    if (character === '\\' && stringMode) {
      const next = sanitized[index + 1];
      if (next && !'"\\/bfnrtu'.includes(next)) repaired += '\\\\';
      else repaired += character;
      continue;
    }
    repaired += character;
  }

  try {
    return JSON.parse(repaired);
  } catch (e) {
    try {
      return JSON.parse(jsonCandidate);
    } catch (e2) {
      console.warn('⚠️ cleanAndParseJson exception:', e2);
      return null;
    }
  }
}

/**
 * Safely parse JSON objects from LLM responses.
 */
function cleanAndParseJson(rawText: string): any {
  return parseJsonValue(rawText, '{');
}

function canonicalQuestionKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^q/, '');
  return normalized || null;
}

function getAssignedQuestionKey(question: Question, index: number): string {
  if (question.questionNo) return canonicalQuestionKey(question.questionNo) || `q${ index + 1 } `;
  if (question.number || question.partLabel) {
    const base = canonicalQuestionKey(question.number || index + 1) || String(index + 1);
    const part = question.partLabel ? canonicalQuestionKey(question.partLabel) : '';
    return `${ base }${ part } `;
  }
  if (question.id) return canonicalQuestionKey(question.id) || `q${ index + 1 } `;
  return `q${ index + 1 } `;
}

export function validateEvaluationPayload(rawPayload: any, assignedQuestions: Question[]): any[] {
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new Error('AI evaluation payload is not a JSON object.');
  }

  if (!Array.isArray(rawPayload.questionEvaluations)) {
    throw new Error('AI evaluation payload is missing a questionEvaluations array.');
  }

  const expectedCount = assignedQuestions.length || rawPayload.questionEvaluations.length;
  if (rawPayload.questionEvaluations.length !== expectedCount) {
    throw new Error(`AI evaluation returned ${ rawPayload.questionEvaluations.length } items but expected ${ expectedCount }.`);
  }

  const seenKeys = new Set<string>();
  for (const item of rawPayload.questionEvaluations) {
    if (!item || typeof item !== 'object') {
      throw new Error('AI evaluation contains a non-object question entry.');
    }
    const key = canonicalQuestionKey(item.questionNo ?? item.questionNumber ?? item.id ?? item.number);
    if (!key) {
      throw new Error('AI evaluation question item is missing a valid questionNo.');
    }
    if (seenKeys.has(key)) {
      throw new Error(`AI evaluation contains duplicate question key: ${ key }.`);
    }
    seenKeys.add(key);

    if (!Number.isFinite(Number(item.scorePercent)) || ![0, 25, 50, 75, 100].includes(Number(item.scorePercent))) {
      throw new Error(`AI evaluation question ${ key } has invalid scorePercent: ${ item.scorePercent }.`);
    }

    if (typeof item.reasoning !== 'string' || !item.reasoning.trim()) {
      throw new Error(`AI evaluation question ${ key } is missing reasoning.`);
    }
    if (typeof item.feedback !== 'string' || !item.feedback.trim()) {
      throw new Error(`AI evaluation question ${ key } is missing feedback.`);
    }
    if (typeof item.studentAnswerSnippet !== 'string') {
      throw new Error(`AI evaluation question ${ key } is missing a valid studentAnswerSnippet.`);
    }
  }

  if (Array.isArray(rawPayload.excelledAreas) && rawPayload.excelledAreas.some((item: unknown) => typeof item !== 'string')) {
    throw new Error('AI evaluation excelledAreas must be an array of strings only.');
  }
  if (Array.isArray(rawPayload.knowledgeGaps) && rawPayload.knowledgeGaps.some((item: unknown) => typeof item !== 'string')) {
    throw new Error('AI evaluation knowledgeGaps must be an array of strings only.');
  }

  return rawPayload.questionEvaluations;
}

export function chunkArray<T>(items: T[], batchSize: number): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }
  return chunks;
}

function normalizeOcrTextForGrading(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/^(?:PAGE|PAGE\s*\d+|QUESTION PAPER|ANSWER SHEET|STUDENT ANSWER SHEET|RUBRIC)[\s\-:]*$/gim, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

export function extractRelevantOcrEvidence(ocrText: string, assignedQuestions: Question[], maxChars = 12000): string {
  const normalized = normalizeOcrTextForGrading(ocrText);
  if (!normalized) return 'No OCR provided.';

  const boilerplatePatterns = [
    /answer sheet/i,
    /important notes/i,
    /office comments/i,
    /do not circulate/i,
    /teacher remarks/i,
    /admin/i,
    /for office use/i,
    /page [0-9]+ of [0-9]+/i,
    /class.*name/i,
    /roll no\.?/i,
    /student id/i,
    /signature/i
  ];

  const filteredLines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (boilerplatePatterns.some((pattern) => pattern.test(line))) return false;
      return true;
    });

  const source = filteredLines.join('\n\n') || normalized;
  if (source.length <= maxChars) return source;

  // If OCR text exceeds maxChars, extract sections around precise question headers only
  const clauses: string[] = [];
  for (let index = 0; index < assignedQuestions.length; index++) {
    const question = assignedQuestions[index];
    const num = question.number || (question.questionNo ? question.questionNo.replace(/[^0-9]/g, '') : '');
    const part = question.partLabel || (question.questionNo ? question.questionNo.replace(/[^a-z]/gi, '') : '');

    const precisePatterns: string[] = [];
    if (question.questionNo) precisePatterns.push(question.questionNo);
    if (num && part) {
      precisePatterns.push(`${ num } (${ part })`, `${ num }${ part } `, `${ num }.${ part } `, `Q${ num }${ part } `);
    } else if (num) {
      precisePatterns.push(`Q${ num } `, `Question ${ num } `, `${ num }.`, `${ num })`);
    }

    let bestIndex = Number.POSITIVE_INFINITY;
    for (const pattern of precisePatterns) {
      if (!pattern || pattern.length < 2) continue;
      const regex = new RegExp(`(?:^|\\s)${ pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } (?: \\s | [:.)] | $)`, 'i');
      const matchIndex = source.search(regex);
      if (matchIndex >= 0 && matchIndex < bestIndex) {
        bestIndex = matchIndex;
      }
    }

    if (bestIndex !== Number.POSITIVE_INFINITY) {
      const start = Math.max(0, bestIndex - 200);
      const end = Math.min(source.length, bestIndex + 1500);
      const snippet = source.slice(start, end).replace(/\s+/g, ' ').trim();
      if (snippet) clauses.push(snippet);
    }
  }

  const merged = Array.from(new Set(clauses)).join('\n\n---\n\n');
  if (merged.trim()) {
    return merged.slice(0, maxChars);
  }

  return source.slice(0, maxChars);
}

function buildQuestionBatchPrompt(
  batchQuestions: Question[],
  baseTextbookContext: string,
  existingOcrText: string,
  markingSchemeText: string,
  language: string,
  batchIndex: number,
  totalBatches: number
): string {
  const instructionHeader = `You are an expert teacher evaluating batch ${ batchIndex + 1 } of ${ totalBatches } (${ batchQuestions.length } question(s)) from a student's handwritten paper for ${language}.`;
  const questionList = batchQuestions.map((q, idx) => {
    const questionNumber = q.questionNo || q.number || `Q${idx + 1}`;
    const properLabel = q.partLabel ? `${questionNumber}(${q.partLabel})` : questionNumber;
    return `Question ${properLabel}: "${q.text}" (Maximum marks: ${q.marks || 1}; Extracted paper key: "${q.correctAnswer || q.rubricKey || 'Unavailable'}")`;
  }).join('\n');
  const schemeBlock = markingSchemeText.trim()
    ? `TEACHER ANSWER KEY / MARKING SCHEME (AUTHORITATIVE):
${markingSchemeText.trim()}
Use this teacher key as the source of truth. Match each printed question number/part to its answer or marking points before scoring. The extracted paper key is only a fallback when the teacher key has no matching entry.
`
    : 'TEACHER ANSWER KEY / MARKING SCHEME: Not supplied. Use the extracted paper key only when it is explicit; otherwise state that teacher review is required.\n';
  const relevantOcr = extractRelevantOcrEvidence(existingOcrText, batchQuestions);
  return `${instructionHeader}

TEXTBOOK CONTEXT:
${baseTextbookContext}

${schemeBlock}
BATCH ${batchIndex + 1}/${totalBatches} QUESTIONS TO EVALUATE:
${questionList}

STUDENT HANDWRITTEN OCR TRANSCRIPTION (FULL PAPER):
${relevantOcr || 'No OCR provided.'}

CRITICAL ANTI-HALLUCINATION & EVALUATION RULES:
1. STRICT STUDENT ANSWER EXTRACTION:
   - "studentAnswerSnippet" MUST contain ONLY text that the student actually wrote on their paper (from the OCR transcription or image) in the answer box / answer line for that specific question.
   - NEVER copy, paraphrase, or quote the Benchmark Key, marking scheme, or question text into "studentAnswerSnippet".
   - IF A QUESTION HAS AN ANSWER BOX [ ] OR FILL-IN LINE AND IT IS EMPTY / BLANK / [Box: EMPTY]:
     - The student DID NOT answer that question.
     - You MUST set "studentAnswerSnippet": "No answer written (blank box)"
     - You MUST set "scorePercent": 0
     - You MUST set "reasoning": "Question was left blank by the student."
2. ACCURATE & RIGOROUS SCORING:
   - Evaluate whether the student's actual handwritten answer (in "studentAnswerSnippet") correctly and accurately answers the question asked and satisfies the Benchmark Key.
   - If a question asks for a date/time ("¿Cuándo...") and the student writes a location ("Cerca de Valencia"), award scorePercent: 0 with explicit reasoning ("Student provided a location instead of the required time/date").
   - If a question has multiple choice letter options (A-H) and the student wrote a different letter (e.g. wrote 'H' when key is 'E'), award scorePercent: 0 with explicit reasoning ("Student selected letter H, but the correct answer is E").
   - If the student left the question blank or wrote an unrelated answer, award scorePercent: 0.
   - Use ONLY 0, 25, 50, 75, or 100 for scorePercent.
   - Award 100 when all essential marking points are accurately present.
3. OUTPUT FORMAT:
  - Return valid JSON with fields: excelledAreas, knowledgeGaps, feedback, socraticHint, questionEvaluations.
  - questionEvaluations array items require: questionNo, benchmarkKey, studentAnswerSnippet, scorePercent, reasoning, feedback.
  - benchmarkKey MUST be the exact teacher-key entry used for this question, or the extracted paper key only when no teacher-key entry matches.
   - questionNo must match the paper reference shown in the question list exactly.`;
}

export function normalizeQuestionEvaluations(
  rawEvaluations: any[],
  assignedQuestions: Question[],
  ocrText: string = ''
): QuestionEvaluation[] {
  const source = Array.isArray(rawEvaluations) ? rawEvaluations : [];
  const resolvedQuestions: Question[] = assignedQuestions.length > 0
    ? assignedQuestions
    : source.map((evaluation, index) => ({
      id: `q${index + 1}`,
      text: evaluation?.questionText || `Question ${index + 1}`,
      correctAnswer: evaluation?.benchmarkKey || ''
    }));

  const lookup = new Map<string, any>();
  for (const item of source) {
    const key = canonicalQuestionKey(item?.questionNo ?? item?.questionNumber ?? item?.id ?? item?.number);
    if (key) lookup.set(key, item);
  }

  return resolvedQuestions.map((question, index) => {
    const expectedKey = getAssignedQuestionKey(question, index);
    const evaluation = lookup.get(expectedKey) || source[index] || {};
    let numericScore = Number(evaluation.scorePercent);
    let scorePercent = Number.isFinite(numericScore)
      ? Math.round(Math.min(100, Math.max(0, numericScore)) / 25) * 25
      : 0;

    // The evaluator's benchmark is authoritative because it has resolved the
    // teacher's answer-key text against this specific question number.
    const benchmarkKey = evaluation.benchmarkKey || question.correctAnswer || question.rubricKey || 'No benchmark key provided.';
    let studentAnswerSnippet = typeof evaluation.studentAnswerSnippet === 'string' && evaluation.studentAnswerSnippet.trim()
      ? evaluation.studentAnswerSnippet.trim()
      : 'No answer detected in the scanned paper.';

    let status: QuestionEvaluation['status'] = scorePercent >= 90
      ? 'Full Credit'
      : scorePercent > 0
        ? 'Partial Credit'
        : 'Unrelated / No Credit';

    let reasoning = typeof evaluation.reasoning === 'string' && evaluation.reasoning.trim()
      ? evaluation.reasoning.trim()
      : (scorePercent === 0
        ? 'No relevant answer was detected for this question.'
        : 'The response was compared with the assigned benchmark key.');

    if (scorePercent === 0 && (studentAnswerSnippet === 'No answer detected in the scanned paper.' || studentAnswerSnippet === 'No answer written (blank box)')) {
      reasoning = 'No handwritten response matching this question was detected on the answer sheet.';
    }

    const feedback = typeof evaluation.feedback === 'string' && evaluation.feedback.trim()
      ? evaluation.feedback.trim()
      : reasoning || (scorePercent >= 90
        ? 'Correct and complete response.'
        : 'Review the benchmark key and add the missing concepts.');

    return {
      questionNo: question.questionNo || question.number || `Q${index + 1}`,
      questionText: question.text,
      marks: Number.isFinite(Number(question.marks)) && Number(question.marks) > 0 ? Number(question.marks) : 5,
      earnedMarks: 0,
      benchmarkKey,
      studentAnswerSnippet,
      scorePercent,
      status,
      reasoning,
      feedback
    };
  }).map((evaluation) => ({
    ...evaluation,
    earnedMarks: Math.round((evaluation.marks * evaluation.scorePercent / 100) * 100) / 100
  }));
}

function sarvamEvaluationSchema(questionCount: number): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'answer_sheet_evaluation',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          excelledAreas: { type: 'array', items: { type: 'string' } },
          knowledgeGaps: { type: 'array', items: { type: 'string' } },
          feedback: { type: 'string' },
          socraticHint: { type: 'string' },
          questionEvaluations: {
            type: 'array',
            minItems: questionCount,
            maxItems: questionCount,
            items: {
              type: 'object',
              properties: {
                questionNo: { type: 'string' },
                studentAnswerSnippet: { type: 'string' },
                scorePercent: { type: 'number', enum: [0, 25, 50, 75, 100] },
                reasoning: { type: 'string' },
                feedback: { type: 'string' }
              },
              required: ['questionNo', 'studentAnswerSnippet', 'scorePercent', 'reasoning', 'feedback'],
              additionalProperties: false
            }
          }
        },
        required: ['excelledAreas', 'knowledgeGaps', 'feedback', 'socraticHint', 'questionEvaluations'],
        additionalProperties: false
      }
    }
  };
}

/**
 * Vision OCR & Student Paper Evaluation via Google Gemini 3.6
 */
export async function analyzeStudentPaper(
  imageInput: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  textbookChunks: string[] = [],
  assignedQuestions: any[] = [],
  evaluationModel?: string,
  language: string = 'English',
  existingOcrText: string = '',
  markingSchemeText: string = ''
): Promise<VisionEvaluationResult> {
  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  const pageCount = buffers.length > 0 ? buffers.length : 1;

  console.log(`🧾 [EVALUATION START] Provider: ${evaluationModel || getConfiguredGeminiModel()} | Pages: ${pageCount} | Questions: ${assignedQuestions.length} | OCR chars: ${existingOcrText.length} | Marking scheme: ${markingSchemeText.trim() ? 'yes' : 'no'}`);

  const textbookContext = textbookChunks.length > 0
    ? textbookChunks.slice(0, 10).join('\n---\n')
    : 'Core curriculum concepts, definitions, key theories, principles, and structured subject knowledge.';

  const questionsPrompt = assignedQuestions.length > 0
    ? `ASSIGNED QUESTIONS TO EVALUATE:\n` + assignedQuestions.map((q, idx) => {
      // The shared passage is printed once, only when it changes, to keep the prompt compact.
      const previousStem = idx > 0 ? assignedQuestions[idx - 1].stem : undefined;
      const stemLine = q.stem && q.stem !== previousStem ? `\nShared context for question ${q.number || idx + 1}: "${q.stem}"\n` : '';
      const label = q.questionNo ? ` [paper reference ${q.questionNo}]` : '';
      return `${stemLine}Question ${idx + 1}${label}: "${q.text}" (Maximum marks: ${q.marks || 5}; Ground Truth Benchmark Key: "${q.correctAnswer || 'Textbook reference answer'}")`;
    }).join('\n')
    : `ASSIGNED QUESTIONS: Evaluate questions answered on the student paper against textbook context.`;

  const markingSchemeBlock = markingSchemeText.trim()
    ? `TEACHER-SUPPLIED ANSWER KEY / MARKING SCHEME (authoritative — overrides the Ground Truth Benchmark Key above whenever the two disagree):\n${markingSchemeText.trim()}\n`
    : '';

  const systemPrompt = `You are an expert teacher evaluating a student's handwritten answer sheet containing ${pageCount} page image(s).

TEXTBOOK KNOWLEDGE BASE CONTEXT:
${textbookContext}

${questionsPrompt}

${markingSchemeBlock}
${existingOcrText.trim() ? `EXISTING OCR TRANSCRIPTION:\n${existingOcrText}` : ''}

YOUR GRADING INSTRUCTIONS:
1. Perform high-precision OCR across ALL ${pageCount} page image(s) provided. Transcribe all legible text page by page (e.g. --- PAGE 1 ---, --- PAGE 2 ---, etc.) across all sections.
2. For each assigned question, evaluate whether the student's handwritten text across any of the pages actually answers that question:
  - Full Credit (100%): Student includes all essential benchmark concepts accurately.
  - Strong Partial Credit (75%): Most essential concepts are correct, with one meaningful omission or minor error.
  - Partial Credit (50%): About half of the essential concepts are correct.
  - Minimal Credit (25%): A relevant attempt contains one correct concept but is substantially incomplete.
   - Unrelated / No Credit (0%): Student wrote about a completely different question or topic -> award 0% with an explicit reasoning note.
  - Use ONLY 0, 25, 50, 75, or 100 for scorePercent.
  - First identify the distinct essential marking points in the benchmark key, then check each point against the student's answer.
  - Award 100% when every essential marking point is present and correct, even if wording, order, spelling, grammar, or notation style differs from the benchmark.
  - Do not reduce marks for repetition or extra correct explanation. Reduce marks only for a missing essential point or a factual contradiction.
3. Return scorePercent for each question, but do not use percentage as the final grade. The application converts each percentage into marks using that question's maximum marks.
4. Extract 2-4 Excelled Areas and 1-3 Knowledge Gaps.
5. Provide constructive feedback and a natural Socratic Guidance Hint.
6. Return exactly one questionEvaluations item for every assigned question, in the same order. Never omit unanswered questions; score them 0.
7. Use the assigned question text verbatim. For the benchmark key, prefer the matching entry in the teacher-supplied answer key/marking scheme when one is provided above; otherwise use the Ground Truth Benchmark Key verbatim. Do not rewrite or invent either one.
8. Keep scoring deterministic: identical evidence must receive the same score. Award points only for concepts present in studentAnswerSnippet.

Return ONLY a valid JSON object matching this structure:
{
  "ocrText": "--- PAGE 1 ---\nTranscribed text...\n\n--- PAGE 2 ---\nTranscribed text...",
  "score": 45,
  "excelledAreas": ["Concept A"],
  "knowledgeGaps": ["Gap B"],
  "feedback": "Teacher assessment summary...",
  "socraticHint": "Socratic question here...",
  "questionEvaluations": [
    {
      "questionNo": "Q1",
      "questionText": "Question text...",
      "benchmarkKey": "Ground truth reference...",
      "studentAnswerSnippet": "Transcribed student text from paper for Q1",
      "scorePercent": 0,
      "status": "Unrelated / No Credit",
      "reasoning": "Student wrote about a different topic.",
      "feedback": "Review the benchmark key and answer this specific question."
    }
  ]
}`;

  let evaluationPrompt = systemPrompt;
  let evaluationImages: Buffer[] | null = buffers;
  let aiText: string | null = null;

  const safeQuestionBatches = assignedQuestions.length > 0
    // A normal paper should be graded in one context so question alignment and
    // scoring stay consistent. Chunk only unusually large papers to avoid
    // repeating the same answer-sheet images across several model calls.
    ? chunkArray(assignedQuestions, assignedQuestions.length > 20 ? 10 : assignedQuestions.length)
    : [[]];

  console.log(`🧩 [EVALUATION PLAN] ${safeQuestionBatches.length} model call(s) planned: ${safeQuestionBatches.map((batch) => batch.length).join(', ')} question(s) per call.`);

  const evaluateQuestionBatch = async (batchQuestions: Question[], batchIndex: number, totalBatches: number): Promise<any> => {
    const batchPrompt = buildQuestionBatchPrompt(batchQuestions, textbookContext, existingOcrText, markingSchemeText, language, batchIndex, totalBatches);
    const firstQuestion = batchQuestions[0]?.questionNo || batchQuestions[0]?.number || 'unknown';
    const lastQuestion = batchQuestions[batchQuestions.length - 1]?.questionNo || batchQuestions[batchQuestions.length - 1]?.number || 'unknown';
    console.log(`📤 [EVALUATION CALL] Batch ${batchIndex + 1}/${totalBatches} | Questions: ${batchQuestions.length} (${firstQuestion} -> ${lastQuestion}) | Prompt chars: ${batchPrompt.length} | Images: ${evaluationImages?.length || 0}`);
    if (evaluationModel === 'sarvam') {
      if (!existingOcrText.trim()) {
        throw new Error('Sarvam evaluation requires the OCR transcription from Stage 3.');
      }
      const batchSchema = sarvamEvaluationSchema(batchQuestions.length);
      console.log(`🇮🇳 [SARVAM PIPELINE] Evaluating batch ${batchIndex + 1}/${totalBatches} (${batchQuestions.length} question(s)) with compact OCR evidence.`);
      const response = await callSarvamChatApi(batchPrompt, 2, {
        reasoningEffort: null,
        maxTokens: 4096,
        responseFormat: batchSchema,
        temperature: 0,
        seed: 42
      });
      console.log(`📥 [EVALUATION RESPONSE] Batch ${batchIndex + 1}/${totalBatches} | Provider: Sarvam | Response chars: ${response?.length || 0}`);
      return response;
    }
    const response = await callGemini36Api(batchPrompt, evaluationImages, mimeType, 3, evaluationModel);
    console.log(`📥 [EVALUATION RESPONSE] Batch ${batchIndex + 1}/${totalBatches} | Provider: Gemini | Response chars: ${response?.length || 0}`);
    return response;
  };

  const mergedQuestionEvaluations = async (): Promise<VisionEvaluationResult | null> => {
    if (assignedQuestions.length === 0) {
      if (evaluationModel === 'sarvam') {
        if (!existingOcrText.trim()) throw new Error('Sarvam evaluation requires the OCR transcription from Stage 3.');
        evaluationPrompt = `You are an expert teacher grading an answer sheet from OCR text.

  TEXTBOOK CONTEXT:
  ${textbookContext}

  ${questionsPrompt}

  OCR TRANSCRIPTION:
  ${existingOcrText}

  For every assigned question, identify the essential marking points in its benchmark and check each point against the OCR. Award 100 when all essential points are semantically present and correct, regardless of wording, order, spelling, grammar, or notation style. Do not penalize repetition or extra correct explanation. Reduce marks only for missing essential points or factual contradictions. Use only 0, 25, 50, 75, or 100 for scorePercent. Award credit only for evidence in the OCR transcription. Unanswered or unrelated questions receive 0. Keep snippets, reasoning, and feedback concise. Do not repeat question text, benchmark keys, or the full OCR. Return exactly ${assignedQuestions.length} questionEvaluations.`;
        aiText = await callSarvamChatApi(evaluationPrompt, 2, {
          reasoningEffort: null,
          maxTokens: 4096,
          responseFormat: sarvamEvaluationSchema(assignedQuestions.length),
          temperature: 0,
          seed: 42
        });
      } else {
        aiText = await callGemini36Api(evaluationPrompt, evaluationImages, mimeType, 3, evaluationModel);
      }
      if (!aiText) return null;
      const parsed = cleanAndParseJson(aiText);
      if (!parsed) return null;
      const rawEvaluations = validateEvaluationPayload(parsed, assignedQuestions);
      const questionEvaluations = normalizeQuestionEvaluations(rawEvaluations, assignedQuestions, existingOcrText);
      const totalMarks = questionEvaluations.reduce((total, evaluation) => total + evaluation.marks, 0);
      const normalizedScore = questionEvaluations.length > 0
        ? Math.round(questionEvaluations.reduce((total, evaluation) => total + evaluation.earnedMarks, 0) * 100) / 100
        : (typeof parsed.score === 'number' ? Math.round(Math.min(100, Math.max(0, parsed.score))) : 0);
      console.log(`📊 [EVALUATION PARSED] Score: ${normalizedScore}/${totalMarks}, Questions: ${questionEvaluations.length}, Excelled: [${(Array.isArray(parsed.excelledAreas) ? parsed.excelledAreas : []).join(', ')}], Gaps: [${(Array.isArray(parsed.knowledgeGaps) ? parsed.knowledgeGaps : []).join(', ')}]`);
      return {
        ocrText: parsed.ocrText || 'OCR transcription unavailable',
        score: normalizedScore,
        maxScore: totalMarks,
        excelledAreas: Array.isArray(parsed.excelledAreas) ? parsed.excelledAreas : [],
        knowledgeGaps: Array.isArray(parsed.knowledgeGaps) ? parsed.knowledgeGaps : [],
        feedback: parsed.feedback || 'Evaluation completed.',
        socraticHint: parsed.socraticHint || 'Review textbook key concepts.',
        questionEvaluations
      };
    }

    const batchResults: any[] = [];
    for (let batchIndex = 0; batchIndex < safeQuestionBatches.length; batchIndex++) {
      const batchQuestions = safeQuestionBatches[batchIndex];
      const batchText = await evaluateQuestionBatch(batchQuestions, batchIndex, safeQuestionBatches.length);
      if (!batchText) throw new Error(`No evaluation result returned for batch ${batchIndex + 1}.`);
      const parsed = cleanAndParseJson(batchText);
      if (!parsed) throw new Error(`Batch ${batchIndex + 1} returned invalid JSON.`);
      const rawEvaluations = validateEvaluationPayload(parsed, batchQuestions);
      const questionEvaluations = normalizeQuestionEvaluations(rawEvaluations, batchQuestions, existingOcrText);
      console.log(`✅ [EVALUATION BATCH VALIDATED] Batch ${batchIndex + 1}/${safeQuestionBatches.length} | Questions: ${questionEvaluations.length} | Earned: ${questionEvaluations.reduce((total, item) => total + item.earnedMarks, 0)}/${questionEvaluations.reduce((total, item) => total + item.marks, 0)}`);
      batchResults.push({ parsed, questionEvaluations });
    }

    const mergedEvaluations = batchResults.flatMap((entry) => entry.questionEvaluations);
    const orderedEvaluationMap = new Map<string, QuestionEvaluation>();
    for (const evaluation of mergedEvaluations) {
      const key = canonicalQuestionKey(evaluation.questionNo ?? evaluation.questionText ?? '');
      if (key) orderedEvaluationMap.set(key, evaluation);
    }
    const ordered = assignedQuestions.map((question, index) => {
      const key = getAssignedQuestionKey(question, index);
      const evaluation = orderedEvaluationMap.get(key) || mergedEvaluations[index] || {
        questionNo: question.questionNo || `Q${index + 1}`,
        questionText: question.text,
        marks: Number.isFinite(Number(question.marks)) && Number(question.marks) > 0 ? Number(question.marks) : 5,
        earnedMarks: 0,
        benchmarkKey: question.correctAnswer || question.rubricKey || 'No benchmark key provided.',
        studentAnswerSnippet: 'No answer detected in the scanned paper.',
        scorePercent: 0,
        status: 'Unrelated / No Credit',
        reasoning: 'No relevant answer was detected for this question.',
        feedback: 'Review the benchmark key and add the missing concepts.'
      };
      return evaluation;
    });

    const totalMarks = ordered.reduce((total, evaluation) => total + (evaluation.marks || 5), 0);
    const normalizedScore = ordered.reduce((total, evaluation) => total + evaluation.earnedMarks, 0);
    const excelledAreas = batchResults.flatMap((entry) => Array.isArray(entry.parsed.excelledAreas) ? entry.parsed.excelledAreas : []);
    const knowledgeGaps = batchResults.flatMap((entry) => Array.isArray(entry.parsed.knowledgeGaps) ? entry.parsed.knowledgeGaps : []);
    console.log(`📊 [EVALUATION PARSED] Score: ${normalizedScore}/${totalMarks}, Questions: ${ordered.length}, Excelled: [${excelledAreas.join(', ')}], Gaps: [${knowledgeGaps.join(', ')}]`);

    return {
      ocrText: existingOcrText || 'OCR transcription unavailable',
      score: normalizedScore,
      maxScore: totalMarks,
      excelledAreas: Array.from(new Set(excelledAreas.filter((value): value is string => typeof value === 'string'))),
      knowledgeGaps: Array.from(new Set(knowledgeGaps.filter((value): value is string => typeof value === 'string'))),
      feedback: batchResults[0]?.parsed?.feedback || 'Evaluation completed.',
      socraticHint: batchResults[0]?.parsed?.socraticHint || 'Review textbook key concepts.',
      questionEvaluations: ordered
    };
  };

  const mergedResult = await mergedQuestionEvaluations();
  if (mergedResult) return mergedResult;

  if (aiText) {
    const parsed = cleanAndParseJson(aiText);
    if (parsed) {
      const rawEvaluations = validateEvaluationPayload(parsed, assignedQuestions);
      const questionEvaluations = normalizeQuestionEvaluations(rawEvaluations, assignedQuestions);
      const totalMarks = questionEvaluations.reduce((total, evaluation) => total + evaluation.marks, 0);
      const normalizedScore = questionEvaluations.length > 0
        ? Math.round(questionEvaluations.reduce((total, evaluation) => total + evaluation.earnedMarks, 0) * 100) / 100
        : (typeof parsed.score === 'number' ? Math.round(Math.min(100, Math.max(0, parsed.score))) : 0);
      console.log(`📊 [EVALUATION PARSED] Score: ${normalizedScore}/${totalMarks}, Questions: ${questionEvaluations.length}, Excelled: [${(Array.isArray(parsed.excelledAreas) ? parsed.excelledAreas : []).join(', ')}], Gaps: [${(Array.isArray(parsed.knowledgeGaps) ? parsed.knowledgeGaps : []).join(', ')}]`);
      return {
        ocrText: parsed.ocrText || 'OCR transcription unavailable',
        score: normalizedScore,
        maxScore: totalMarks,
        excelledAreas: Array.isArray(parsed.excelledAreas) ? parsed.excelledAreas : [],
        knowledgeGaps: Array.isArray(parsed.knowledgeGaps) ? parsed.knowledgeGaps : [],
        feedback: parsed.feedback || 'Evaluation completed.',
        socraticHint: parsed.socraticHint || 'Review textbook key concepts.',
        questionEvaluations
      };
    }
  }

  const provider = evaluationModel === 'sarvam' ? 'Sarvam' : 'Google Gemini 3.6';
  throw new Error(`AI Evaluation unavailable: ${provider} returned ${aiText ? 'an invalid JSON evaluation' : 'no response'}.`);
}

/**
 * Generate Question Pool from Uploaded Textbook Text via Google Gemini 3.6
 */
export async function generateQuestionsFromTextbook(
  topic: string,
  className: string,
  textbookContent: string,
  subTopicScope?: string,
  numQuestions: number = 5
): Promise<Question[]> {
  const targetCount = numQuestions > 0 ? numQuestions : 5;

  const scopeInstruction = subTopicScope && subTopicScope.trim().length > 0
    ? `\nIMPORTANT TOPIC SCOPE CONSTRAINT: Restrict all generated questions STRICTLY to the specific sub-topic / days scope: "${subTopicScope}". Do NOT generate questions for any other parts of the chapter.\n`
    : '';

  const snippetToUse = textbookContent ? textbookContent.substring(0, 12000) : '';

  console.log(`🤖 Invoking Gemini 3.6 to generate EXACTLY ${targetCount} questions strictly from ${snippetToUse.length} characters of textbook context...`);

  const mathInstruction = (className.toLowerCase().includes('math') || topic.toLowerCase().includes('math') || topic.toLowerCase().includes('equation') || topic.toLowerCase().includes('algebra') || topic.toLowerCase().includes('geometry') || topic.toLowerCase().includes('trigonometry'))
    ? `\nSPECIAL INSTRUCTION FOR MATHEMATICS: Generate clear math problems/questions covering concepts, formulas, or problem-solving steps. Provide step-by-step ground-truth benchmark solution keys for each question.\n`
    : '';

  const prompt = `You are an expert curriculum assistant preparing examination questions for ${className} on the topic "${topic}".
${scopeInstruction}
${mathInstruction}
TEXTBOOK KNOWLEDGE BASE CONTENT:
${snippetToUse}

CRITICAL KNOWLEDGE BASE GROUNDING GUARDRAILS (ZERO SELF-KNOWLEDGE):
1. Generate EXACTLY ${targetCount} clear, curriculum-aligned examination questions based STRICTLY and EXCLUSIVELY on the TEXTBOOK KNOWLEDGE BASE CONTENT provided above.
2. ZERO MODEL HALLUCINATION / SELF-KNOWLEDGE: Do NOT use any pre-trained model memory, outside internet facts, or external assumptions. If a concept, term, or definition is NOT explicitly stated in the provided textbook text, do NOT generate a question for it.
3. GROUND TRUTH BENCHMARK KEYS: Every answer benchmark key MUST quote or directly summarize facts present in the provided textbook text.

Return ONLY a valid JSON array of objects containing EXACTLY ${targetCount} items with NO markdown formatting or code block wrappers:
[
  { "id": "q1", "text": "Question 1 text...", "correctAnswer": "Answer benchmark key from textbook..." },
  { "id": "q2", "text": "Question 2 text...", "correctAnswer": "Answer benchmark key from textbook..." }
]`;

  const aiText = await callGemini36Api(prompt);
  if (aiText) {
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const questions = JSON.parse(jsonMatch[0]) as Question[];
        if (Array.isArray(questions) && questions.length > 0) {
          console.log(`🎯 [QUESTION POOL GENERATOR] SUCCESS! Generated ${questions.length} Questions (Requested: ${targetCount}):`);
          questions.forEach((q, idx) => {
            console.log(`   Q${idx + 1}: ${q.text}`);
          });
          return questions;
        }
      } catch (e) {
        console.warn('⚠️ Question JSON parse notice:', e);
      }
    }
  }

  return [];
}

/**
 * Vision AI Question Paper Photo Extraction via Google Gemini 3.6
 */
/** Returns null only when the response cannot be parsed at all; an empty array is a valid "no questions on this page" answer. */
function normalizeQuestionPaper(rawText: string | null): Question[] | null {
  if (!rawText) return null;
  // Probe in the order the payload actually starts, otherwise a top-level array
  // gets mis-parsed as its first inner object.
  const arrayFirst = rawText.replace(/```(?:json)?/gi, '').trimStart().startsWith('[');
  const parsed = arrayFirst
    ? (parseJsonValue(rawText, '[') || parseJsonValue(rawText, '{'))
    : (parseJsonValue(rawText, '{') || parseJsonValue(rawText, '['));
  const source = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(source)) {
    console.warn(`⚠️ [QUESTION NORMALIZER] No questions array found in response: ${String(rawText).slice(0, 300)}`);
    return null;
  }

  const flattened: Question[] = [];
  const skipped: string[] = [];

  source.forEach((parent: any, parentIndex: number) => {
    const number = String(parent?.number ?? parent?.questionNumber ?? parentIndex + 1).trim().replace(/[.)]+$/, '');
    const section = String(parent?.section || parent?.part || 'Questions');
    const stem = String(parent?.stem || parent?.passage || '').trim();
    // A paper question may be a single standalone question or a stem with (a),(b),(c) parts.
    const rawParts = Array.isArray(parent?.parts) && parent.parts.length > 0 ? parent.parts : [parent];

    rawParts.forEach((part: any, partIndex: number) => {
      const partLabel = String(part?.label ?? part?.partLabel ?? '').trim().replace(/[^a-z0-9ivx]/gi, '');
      const text = String(part?.text || part?.question || '').replace(/^\s*\(?[a-z]\)?[.)]\s*/i, '').trim();
      if (!text) { skipped.push(`${number}${partLabel ? `(${partLabel})` : ''}: no text`); return; }

      const rawMarks = Number(part?.marks);
      // A part worth 0 marks is never real; it means the paper did not print a value.
      const marks = Number.isFinite(rawMarks) && rawMarks > 0 ? rawMarks : 1;
      const correctAnswer = String(part?.correctAnswer || part?.answerKey || '').trim() || 'Benchmark key not printed on the paper — teacher review required.';
      const page = Number(part?.visualPage ?? parent?.visualPage);
      const caption = String(part?.visualCaption || parent?.visualCaption || '').trim();
      const hasVisual = Boolean(part?.hasVisual ?? parent?.hasVisual);

      flattened.push({
        id: `q${number}-${partLabel || partIndex + 1}`,
        number,
        partLabel: partLabel || undefined,
        questionNo: partLabel ? `${number}(${partLabel})` : `${number}`,
        section,
        stem: stem || undefined,
        text,
        marks,
        correctAnswer,
        hasVisual,
        stimulus: hasVisual ? [{ page: Number.isFinite(page) && page > 0 ? page : undefined, caption: caption || undefined }] : undefined
      });
    });
  });

  if (skipped.length > 0) console.warn(`⚠️ [QUESTION NORMALIZER] Skipped ${skipped.length} unusable part(s): ${skipped.slice(0, 10).join('; ')}`);
  return flattened;
}

function splitQuestionPaperOcr(text: string, maxCharacters = 80000): string[] {
  if (text.length <= maxCharacters) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const block of text.split(/\n{2,}/)) {
    if (current && current.length + block.length + 2 > maxCharacters) {
      chunks.push(current);
      current = '';
    }
    if (block.length > maxCharacters) {
      for (let offset = 0; offset < block.length; offset += maxCharacters) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        chunks.push(block.slice(offset, offset + maxCharacters));
      }
    } else {
      current += `${current ? '\n\n' : ''}${block}`;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.trim());
}

function mergeExtractedQuestions(questionSets: Question[][]): Question[] {
  const seen = new Map<string, Question>();
  for (const question of questionSets.flat()) {
    // Parts are keyed by parent number + label so a passage repeated across OCR chunks never collapses them.
    const key = `${question.number || ''}|${question.partLabel || ''}|${question.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120)}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, question); continue; }
    if (!existing.stem && question.stem) existing.stem = question.stem;
    if (!existing.stimulus && question.stimulus) existing.stimulus = question.stimulus;
  }
  return [...seen.values()].map((question, index) => ({ ...question, id: question.id || `q${index + 1}` }));
}

/**
 * Resolves each question's reported stimulus page to a stored page image URL.
 * Questions flagged as visual but without a usable page number fall back to the whole paper.
 */
export function attachStimulusImages(questions: Question[], pageUrls: string[]): Question[] {
  if (pageUrls.length === 0) return questions;
  return questions.map((question) => {
    if (!question.hasVisual) return question;
    const stimulus = (question.stimulus || [{}]).map((item) => {
      const index = Number(item.page) - 1;
      const url = index >= 0 && index < pageUrls.length ? pageUrls[index] : undefined;
      return { ...item, url };
    });
    const resolved = stimulus.filter((item) => item.url);
    return { ...question, stimulus: resolved.length > 0 ? resolved : pageUrls.map((url, index) => ({ page: index + 1, url })) };
  });
}

/** Sarvam is the primary provider, so malformed JSON is retried with backoff before Gemini is considered. */
const SARVAM_JSON_RETRY_DELAYS_MS = [5000, 15000, 30000];

async function retryForValidJson<T>(label: string, attempt: (attemptNumber: number) => Promise<T | null>): Promise<T | null> {
  for (let index = 0; index <= SARVAM_JSON_RETRY_DELAYS_MS.length; index++) {
    try {
      const result = await attempt(index + 1);
      if (result) return result;
      console.warn(`⚠️ [SARVAM RETRY] ${label}: attempt ${index + 1} returned unusable JSON.`);
    } catch (error: any) {
      console.warn(`⚠️ [SARVAM RETRY] ${label}: attempt ${index + 1} failed:`, error?.message || error);
    }
    const delay = SARVAM_JSON_RETRY_DELAYS_MS[index];
    if (delay === undefined) break;
    console.log(`   └─ Waiting ${delay / 1000}s before retrying Sarvam...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return null;
}

function extractionFailureCategory(error: unknown): 'context_limit' | 'schema' | 'provider_transport' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('context window') || message.includes('prompt_tokens')) return 'context_limit';
  if (message.includes('json') || message.includes('schema')) return 'schema';
  return 'provider_transport';
}

function sarvamQuestionPaperSchema(): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'question_paper_extraction',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'string' },
                section: { type: 'string' },
                stem: { type: 'string' },
                parts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      text: { type: 'string' },
                      marks: { type: 'number' },
                      correctAnswer: { type: 'string' },
                      hasVisual: { type: 'boolean' },
                      visualPage: { type: 'number' },
                      visualCaption: { type: 'string' }
                    },
                    required: ['label', 'text', 'marks', 'correctAnswer', 'hasVisual', 'visualPage', 'visualCaption'],
                    additionalProperties: false
                  }
                }
              },
              required: ['number', 'section', 'stem', 'parts'],
              additionalProperties: false
            }
          }
        },
        required: ['questions'],
        additionalProperties: false
      }
    }
  };
}

export async function extractQuestionsFromImage(
  imageInput: Buffer[] | Buffer | null,
  mimeType: string | string[] = 'image/jpeg',
  languageOrSubject: string = 'English'
): Promise<Question[]> {
  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  if (buffers.length === 0) return [];
  const mimeTypes = Array.isArray(mimeType) ? mimeType : buffers.map(() => mimeType);
  const primaryMimeType = mimeTypes[0] || 'image/jpeg';

  const prompt = `You are an expert curriculum assistant. Perform high-precision Vision AI OCR on the provided Question Paper image(s).

STRUCTURE RULES (CRITICAL):
1. Preserve the paper's own hierarchy. A numbered question (1, 2, 3...) is ONE entry. Its lettered sub-parts ((a), (b), (c)...) go in its "parts" array. NEVER promote a sub-part into its own numbered question.
2. Any reading passage, dialogue, table, instruction line or shared context belongs in the parent's "stem" field EXACTLY ONCE. NEVER copy the stem, passage or instruction text into a part's "text". A part's "text" must contain ONLY that sub-part's own wording.
3. If a numbered question has no sub-parts, emit a single part with "label": "".
4. "marks" is per part. If the paper only prints a total for the parent, divide it evenly across the parts.
5. Use the paper's own numbering in "number" (e.g. "1", "2", "14"). Use the bare letter in "label" (e.g. "a", not "(a)").

VISUAL / IMAGE RULES (CRITICAL):
6. Many papers include images, signs, photos, diagrams, graphs, maps or tables that a student MUST see to answer. For every part that depends on such a visual, set "hasVisual": true, set "visualPage" to the 1-based page number of the paper where that visual appears, and put a short description in "visualCaption" (e.g. "Six shop signs labelled A-F").
7. If a part needs no visual, set "hasVisual": false, "visualPage": 0 and "visualCaption": "".

CONTENT RULES:
8. Extract ALL questions, printed or handwritten, line-by-line. Do not skip any.
9. For each part, extract or formulate its precise ground-truth reference answer key.
10. Preserve math symbols, scientific formulas and non-English text (Spanish/Hindi/Telugu) exactly.

Return ONLY a valid JSON object with NO markdown code block wrappers:
{
  "questions": [
    {
      "number": "1",
      "section": "Part - A - I",
      "stem": "Lee el texto y contesta a las preguntas.",
      "parts": [
        { "label": "a", "text": "Marta quiere comprar medicamentos.", "marks": 1, "correctAnswer": "Farmacia", "hasVisual": true, "visualPage": 2, "visualCaption": "Shop signs A-F" },
        { "label": "b", "text": "Marta busca una novela.", "marks": 1, "correctAnswer": "Libreria", "hasVisual": true, "visualPage": 2, "visualCaption": "Shop signs A-F" }
      ]
    }
  ]
}`;

  const sarvamLanguageSupported = supportsSarvamDocumentLanguage(languageOrSubject);
  const useSarvam = Boolean(process.env.SARVAM_API_KEY) && sarvamLanguageSupported;
  if (!useSarvam) {
    console.log(`ℹ️ [PHOTO QUESTION EXTRACTOR] Skipping Sarvam (${!process.env.SARVAM_API_KEY ? 'SARVAM_API_KEY not configured' : `Sarvam Document AI has no OCR model for '${languageOrSubject}'`}); using Gemini.`);
  }
  let aiText: string | null = null;
  let extractedQuestions: Question[] | null = null;
  let boundedOcrChunks: string[] = [];
  let sarvamFailure: unknown;
  if (useSarvam) {
    console.log(`🇮🇳 [PHOTO QUESTION EXTRACTOR] Routing ${languageOrSubject} question paper through Sarvam Vision OCR...`);
    try {
      const ocrChunks = await performSarvamVisionOcrChunks(buffers, mimeTypes, languageOrSubject);
      boundedOcrChunks = ocrChunks.flatMap((chunk) => splitQuestionPaperOcr(chunk));
      console.log(`📄 [PHOTO QUESTION EXTRACTOR] Extracting questions from ${boundedOcrChunks.length} bounded OCR chunk(s).`);
      const questionSets: Question[][] = [];
      const failedChunks: number[] = [];
      for (let index = 0; index < boundedOcrChunks.length; index++) {
        const chunkQuestions = await retryForValidJson(
          `Sarvam question JSON for OCR chunk ${index + 1}/${boundedOcrChunks.length}`,
          async (attempt) => {
            const chunkResponse = await callSarvamChatApi(`${prompt}\n\nThis is OCR chunk ${index + 1} of ${boundedOcrChunks.length}. Extract only complete questions visible in this chunk. If none are visible, return {"questions": []}.${attempt > 1 ? '\n\nYour previous reply was not valid JSON matching the schema. Return ONLY the JSON object, nothing else.' : ''}\n\nSARVAM VISION TRANSCRIPTION:\n${boundedOcrChunks[index]}`, 2, {
              reasoningEffort: null,
              maxTokens: 8192,
              temperature: 0,
              seed: 42,
              responseFormat: sarvamQuestionPaperSchema()
            });
            return normalizeQuestionPaper(chunkResponse);
          }
        );
        // One unreadable chunk must not discard the questions recovered from the others.
        if (!chunkQuestions) { failedChunks.push(index + 1); continue; }
        console.log(`   ├─ Chunk ${index + 1}/${boundedOcrChunks.length}: ${chunkQuestions.length} question part(s).`);
        questionSets.push(chunkQuestions);
      }
      if (failedChunks.length > 0) console.warn(`⚠️ [PHOTO QUESTION EXTRACTOR] Sarvam could not parse chunk(s): ${failedChunks.join(', ')}.`);
      if (failedChunks.length === boundedOcrChunks.length) throw new Error(`Sarvam returned invalid question JSON for every OCR chunk after ${SARVAM_JSON_RETRY_DELAYS_MS.length + 1} attempts each.`);
      extractedQuestions = mergeExtractedQuestions(questionSets);
    } catch (error) {
      sarvamFailure = error;
      console.warn(`⚠️ [PHOTO QUESTION EXTRACTOR] Sarvam ${extractionFailureCategory(error)} failure; using Gemini fallback:`, error);
      aiText = null;
    }
  } else {
    aiText = await callGemini36Api(prompt, buffers, primaryMimeType);
  }
  const primaryQuestions = extractedQuestions || normalizeQuestionPaper(aiText);
  if (primaryQuestions?.length) {
    console.log(`🎯 [PHOTO QUESTION EXTRACTOR] Extracted ${primaryQuestions.length} questions via ${useSarvam ? 'Sarvam' : 'Gemini'}.`);
    return primaryQuestions;
  }
  if (useSarvam) {
    if (!sarvamFailure) console.warn('⚠️ [PHOTO QUESTION EXTRACTOR] Sarvam schema validation failed; using Gemini fallback.');
    let fallbackQuestions: Question[] | null = null;
    if (boundedOcrChunks.length > 0) {
      const questionSets: Question[][] = [];
      const failedChunks: number[] = [];
      for (let index = 0; index < boundedOcrChunks.length; index++) {
        const fallbackText = await callGemini36Api(`${prompt}\n\nExtract only complete questions from OCR chunk ${index + 1} of ${boundedOcrChunks.length}. If none are visible, return {"questions": []}.\n\nOCR TRANSCRIPTION:\n${boundedOcrChunks[index]}`, null, 'text/plain', 3, getConfiguredGeminiModel());
        const chunkQuestions = normalizeQuestionPaper(fallbackText);
        // One unreadable chunk must not discard the questions recovered from the others.
        if (!chunkQuestions) { failedChunks.push(index + 1); continue; }
        console.log(`   ├─ Gemini chunk ${index + 1}/${boundedOcrChunks.length}: ${chunkQuestions.length} question part(s).`);
        questionSets.push(chunkQuestions);
      }
      if (failedChunks.length > 0) console.warn(`⚠️ [PHOTO QUESTION EXTRACTOR] Gemini could not parse chunk(s): ${failedChunks.join(', ')}.`);
      if (failedChunks.length === boundedOcrChunks.length) throw new Error('Gemini returned invalid question JSON for every OCR chunk.');
      fallbackQuestions = mergeExtractedQuestions(questionSets);
    } else {
      const fallbackText = await callGemini36Api(prompt, buffers, primaryMimeType, 3, getConfiguredGeminiModel());
      fallbackQuestions = normalizeQuestionPaper(fallbackText);
    }
    if (fallbackQuestions?.length) {
      console.log(`🎯 [PHOTO QUESTION EXTRACTOR] Extracted ${fallbackQuestions.length} questions via Gemini fallback.`);
      return fallbackQuestions;
    }
  }
  throw new Error(`Question extraction failed: ${useSarvam ? 'Sarvam and Gemini' : 'Gemini'} returned invalid question JSON.`);
}

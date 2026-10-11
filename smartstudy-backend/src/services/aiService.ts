import dotenv from 'dotenv';
import { callSarvamChatApi, performSarvamVisionOcr, performSarvamVisionOcrChunks, supportsSarvamDocumentLanguage } from './sarvamService.js';
import { aiGateway } from './aiGateway/index.js';
import { uploadImageToSupabase } from '../db/supabase.js';
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
  imageUrl?: string;
  imagePrompt?: string;
  diagramSvg?: string;
  tableData?: string;
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

const getGeminiKey = () => (process.env.GEMINI_API_KEY || '').trim();
export const getConfiguredGeminiModel = () => (process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim();

/**
 * Google Gemini 3.6 API Call (Vision + Text Prompts)
 */
export async function callGemini36Api(
  prompt: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  maxRetries = 4,
  modelNameOverride?: string,
  timeoutMs: number = 90000
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
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`Gemini API request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    try {
      console.log(`🤖 [GEMINI 3.6] Requesting completion (${modelName}) [Attempt ${attempt}/${maxRetries}, Timeout ${Math.round(timeoutMs / 1000)}s]...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 32768,
            temperature: 0.2,
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }),
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json() as any;
        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
          console.warn(`⚠️ [GEMINI 3.6] Candidate finishReason: ${finishReason}`);
        }
        const responseText = candidate?.content?.parts?.[0]?.text || null;
        if (responseText) {
          console.log(`✅ [GEMINI 3.6] Successful response from ${modelName}`);
          return responseText;
        } else {
          console.warn(`⚠️ [GEMINI 3.6] Empty response text received (finishReason: ${finishReason || 'unknown'}).`);
        }
      } else {
        const errBody = await res.text();
        console.warn(`⚠️ [GEMINI 3.6] API notice (${res.status}): ${errBody.substring(0, 300)}`);
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          const waitMs = attempt * 2000 + Math.floor(Math.random() * 500);
          console.log(`⏳ [GEMINI 3.6] Retrying after status ${res.status} in ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    } catch (err: any) {
      const errDetail = err?.cause?.message || err?.message || String(err);
      console.warn(`⚠️ [GEMINI 3.6] Network/Timeout Exception [Attempt ${attempt}/${maxRetries}]: ${errDetail}`);
      if (attempt < maxRetries) {
        const waitMs = attempt * 1500 + Math.floor(Math.random() * 1000);
        console.log(`⏳ [GEMINI 3.6] Retrying after network/timeout in ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    } finally {
      clearTimeout(timeoutHandle);
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

function parseJsonValue(rawText: string, openingCharacter?: '{' | '['): any {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Strip markdown code fence wrappers if present
  let source = rawText.trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i;
  const match = source.match(fenceRegex);
  if (match && match[1]?.trim()) {
    source = match[1].trim();
  }

  // 2. Quick direct parse attempt
  try {
    return JSON.parse(source);
  } catch {
    // Proceed to robust boundary search and sanitization
  }

  // 3. Determine start position and expected open/close characters
  let startIdx = -1;
  let openChar: '{' | '[' = openingCharacter || '{';
  let closeChar: '}' | ']' = openChar === '{' ? '}' : ']';

  if (openingCharacter) {
    startIdx = source.indexOf(openingCharacter);
  }

  if (startIdx < 0) {
    const firstBrace = source.indexOf('{');
    const firstBracket = source.indexOf('[');
    if (firstBrace >= 0 && firstBracket >= 0) {
      if (firstBrace < firstBracket) {
        startIdx = firstBrace;
        openChar = '{';
        closeChar = '}';
      } else {
        startIdx = firstBracket;
        openChar = '[';
        closeChar = ']';
      }
    } else if (firstBrace >= 0) {
      startIdx = firstBrace;
      openChar = '{';
      closeChar = '}';
    } else if (firstBracket >= 0) {
      startIdx = firstBracket;
      openChar = '[';
      closeChar = ']';
    } else {
      return null;
    }
  }

  // 4. Extract balanced JSON substring tracking strings & escapes
  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = startIdx; i < source.length; i++) {
    const char = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === openChar) depth++;
      else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  let candidate = endIdx >= 0 ? source.substring(startIdx, endIdx + 1) : source.substring(startIdx);

  // If unbalanced (e.g. truncated output), intelligently close at last complete object
  if (depth > 0) {
    if (openChar === '[') {
      const lastObjClose = candidate.lastIndexOf('}');
      if (lastObjClose > 0) {
        candidate = candidate.substring(0, lastObjClose + 1) + ']';
        depth = 0;
      } else {
        candidate += closeChar.repeat(depth);
      }
    } else {
      candidate += closeChar.repeat(depth);
    }
  }

  // 5. Try parsing the extracted candidate directly
  try {
    return JSON.parse(candidate);
  } catch {
    // Proceed to character-level string sanitization
  }

  // 6. Character-level sanitization:
  // - ONLY escape control characters INSIDE strings (never outside!)
  // - Fix invalid backslash escapes inside strings
  // - Strip trailing commas outside strings
  let sanitized = '';
  inString = false;
  escaped = false;

  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i];

    if (escaped) {
      sanitized += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      const next = candidate[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        sanitized += char;
        escaped = true;
      } else {
        sanitized += '\\\\';
      }
      continue;
    }

    if (char === '"') {
      inString = !inString;
      sanitized += char;
      continue;
    }

    if (inString) {
      // We are INSIDE a JSON string: escape raw newlines and control chars
      if (char === '\n') {
        sanitized += '\\n';
      } else if (char === '\r') {
        sanitized += '\\r';
      } else if (char === '\t') {
        sanitized += '\\t';
      } else if (char.charCodeAt(0) < 0x20) {
        sanitized += ' ';
      } else {
        sanitized += char;
      }
    } else {
      // OUTSIDE strings: preserve whitespace, do not escape!
      sanitized += char;
    }
  }

  // If truncated inside an unclosed string, close the string and the container
  if (inString) {
    sanitized += '"';
    if (openChar === '[') {
      const lastObjClose = sanitized.lastIndexOf('}');
      if (lastObjClose > 0) {
        sanitized = sanitized.substring(0, lastObjClose + 1) + ']';
      } else if (!sanitized.trimEnd().endsWith(']')) {
        sanitized += ']';
      }
    } else if (openChar === '{' && !sanitized.trimEnd().endsWith('}')) {
      sanitized += '}';
    }
  }

  // Remove trailing commas before closing braces/brackets
  sanitized = sanitized.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(sanitized);
  } catch (err: any) {
    // If still failing, try alternative opening character if applicable
    if (openingCharacter === '[' && source.indexOf('{') >= 0 && source.indexOf('{') < source.indexOf('[')) {
      try {
        const altObj = parseJsonValue(rawText, '{');
        if (altObj) return altObj;
      } catch {}
    }
    console.warn('⚠️ cleanAndParseJson exception:', err?.message || err);
    return null;
  }
}

/**
 * Safely parse JSON objects from LLM responses.
 */
export function cleanAndParseJson(rawText: string): any {
  return parseJsonValue(rawText, '{');
}

/**
 * Safely parse JSON arrays from LLM responses.
 */
export function cleanAndParseJsonArray(rawText: string): any[] {
  const result = parseJsonValue(rawText, '[');
  return Array.isArray(result) ? result : [];
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
    console.warn(`⚠️ [EVALUATION] AI evaluation returned ${rawPayload.questionEvaluations.length} items (expected ${expectedCount}). Missing questions will be credited as unattempted.`);
  }

  const seenKeys = new Set<string>();
  const validatedList: any[] = [];
  for (const item of rawPayload.questionEvaluations) {
    if (!item || typeof item !== 'object') continue;
    const key = canonicalQuestionKey(item.questionNo ?? item.questionNumber ?? item.id ?? item.number);
    if (!key) continue;
    if (seenKeys.has(key)) continue; // ignore duplicate keys instead of crashing
    seenKeys.add(key);

    let numericScore = Number(item.scorePercent);
    if (!Number.isFinite(numericScore)) {
      numericScore = 0;
    } else {
      numericScore = Math.max(0, Math.min(100, Math.round(numericScore)));
    }
    item.scorePercent = numericScore;

    if (typeof item.reasoning !== 'string' || !item.reasoning.trim()) {
      item.reasoning = (typeof item.feedback === 'string' && item.feedback.trim())
        ? item.feedback.trim()
        : (numericScore > 0 ? 'Evaluated against question benchmark criteria.' : 'No relevant answer detected.');
    }
    if (typeof item.feedback !== 'string' || !item.feedback.trim()) {
      item.feedback = item.reasoning || (numericScore >= 90 ? 'Correct response.' : 'Review question key concepts.');
    }
    if (typeof item.studentAnswerSnippet !== 'string') {
      item.studentAnswerSnippet = 'No answer detected in the scanned paper.';
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

2. COMPREHENSIVE MULTIPLE CHOICE (MCQ) & OBJECTIVE RULES (HANDLE ALL FORMATS):
   - Option Letter Matching: Treat letter selections as case-insensitive ('a' == 'A', 'b' == 'B', etc.).
   - Option Boxes & Brackets: Formats like [Box: B], [B], (B), B. are all recognized as Option B.
   - Ticks, Checks & Circled Marks: If a student marked a tick (✓), checkmark, or circled a specific option letter/box (e.g. [Box: ✓] next to C, or "Tick against B"), award 100 if that option is correct.
   - Option Text Written (Letter Omitted): If a student wrote the correct answer text verbatim or semantically (e.g., student wrote "Mitochondria" when Option C is "C) Mitochondria" or benchmark says "Mitochondria"), award scorePercent: 100 even if the letter "C" was omitted!
   - Option Letter + Text: If a student wrote both "B) Photosynthesis" or "B. Mitochondria", award 100 if it matches the benchmark.
   - Roman Numerals / Numbers: Automatically match (i), (ii), (iii), (iv) or 1, 2, 3, 4 to corresponding options (a), (b), (c), (d) or A, B, C, D.
   - Crossed-out / Corrected Answers: If a student crossed out or scribbled over an answer (e.g. crossed out A and wrote C), evaluate ONLY the final uncrossed answer (C).
   - Conflicting Selections: If a student selected multiple conflicting options for a single-choice question without crossing one out (e.g. marked both A and D), award scorePercent: 0 with explicit reasoning ("Student selected conflicting options without crossing one out").
   - Multi-Select Questions: When a question requires multiple correct options (e.g. "Select two"), award proportional credit (e.g. 50% for 1 of 2 correct, 100% for all correct) provided no incorrect option was chosen.
   - Blank / Unanswered MCQ: If no option was chosen or marked, award scorePercent: 0 with reasoning "Question was left blank by the student."
   - Incorrect Option Selected: If a student selected an incorrect option (e.g. chose H when key is E), award scorePercent: 0 with explicit reasoning: "Student selected Option H, but the correct answer is E."

3. TABLES, GRIDS, DIAGRAMS & DRAWINGS:
   - Tables / Data Grids: When student answers are in Markdown tables (| Col 1 | Col 2 |), evaluate corresponding cell data against the benchmark criteria.
   - Diagrams, Circuits & Figures: If a question asks to draw or label a diagram/graph/circuit, inspect the [Diagram / Drawing: ...] OCR description and page image. Award full or partial credit based on presence of essential components, correct orientation, arrows, and required labels.

4. ACCURATE SCORING:
   - Evaluate whether the student's actual handwritten answer (in "studentAnswerSnippet") correctly and accurately answers the question asked and satisfies the Benchmark Key.
   - Award scorePercent between 0 and 100 proportional to the essential marking points satisfied.
   - Award 100 when all essential marking points are accurately present, even if wording, notation, or order differs from benchmark.

5. OUTPUT FORMAT:
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
      ? Math.max(0, Math.min(100, Math.round(numericScore)))
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
                scorePercent: { type: 'number' },
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
  - Return a scorePercent between 0 and 100 representing percentage credit earned (e.g. 0, 25, 50, 75, 80, 100).
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

  For every assigned question, identify the essential marking points in its benchmark and check each point against the OCR. Award 100 when all essential points are semantically present and correct, regardless of wording, order, spelling, grammar, or notation style. Do not penalize repetition or extra correct explanation. Reduce marks only for missing essential points or factual contradictions. Return scorePercent between 0 and 100. Award credit only for evidence in the OCR transcription. Unanswered or unrelated questions receive 0. Keep snippets, reasoning, and feedback concise. Do not repeat question text, benchmark keys, or the full OCR. Return exactly ${assignedQuestions.length} questionEvaluations.`;
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
    const normalizedScore = Math.round(ordered.reduce((total, evaluation) => total + evaluation.earnedMarks, 0) * 100) / 100;
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

export interface SyllabusTopicItem {
  unitNumber?: number;
  unitName: string;
  topicName: string;
  subtopics?: string[];
  prescribedWeightage?: number;
  pageStart?: number;
  pageEnd?: number;
}

export interface TopicQuestionCounts {
  mcqCount: number;
  veryShortCount: number;
  shortCount: number;
  descriptiveCount: number;
}

/**
 * Extract Units, Topics, and Mark Weightages from Syllabus/Curriculum document using Gemini
 */
export async function extractSyllabusStructureWithAI(
  syllabusSnippet: string,
  className: string
): Promise<SyllabusTopicItem[]> {
  console.log(`📑 [SYLLABUS AI PARSER] Extracting Units, Topics & Weightages for "${className}"...`);

  const prompt = `You are a senior Indian school curriculum and examination specialist (CBSE, ICSE, State Boards).
Analyze the following textbook or syllabus document text for "${className}".
Extract all Units, Chapters, and distinct Topics with their prescribed marks/weightages, subtopics, and page ranges (if mentioned).

IMPORTANT INSTRUCTIONS:
1. Identify the Table of Contents or Course Structure breakdown.
2. Group topics under their respective Units or Chapters.
3. If weightages/marks are explicitly specified (e.g. Unit 1: 25 marks, or Chapter 1: 6 marks), extract them under "prescribedWeightage".
4. If weightages are not explicitly stated, assign a realistic weightage (marks) to each topic such that the total sum of all topics equals approximately 80 or 100 marks (standard Indian Board examination scale).
5. Extract 5 to 15 key topics / chapters covering the syllabus.

DOCUMENT TEXT EXCERPT:
${syllabusSnippet.substring(0, 32000)}

Return ONLY a valid JSON array of objects with the exact schema below, and NO markdown code wrappers:
[
  {
    "unitNumber": 1,
    "unitName": "Unit 1: Chemical Substances - Nature and Behaviour",
    "topicName": "Chemical Reactions and Equations",
    "subtopics": ["Chemical equation", "Balanced chemical equation", "Types of chemical reactions: combination, decomposition, displacement", "Oxidation and reduction"],
    "prescribedWeightage": 8,
    "pageStart": 1,
    "pageEnd": 16
  }
]`;

  const aiText = await callGemini36Api(prompt);
  if (aiText) {
    const parsed = parseJsonValue(aiText, '[');
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`✅ [SYLLABUS AI PARSER] Successfully extracted ${parsed.length} curriculum topics for ${className}.`);
      return parsed.map((item: any, idx: number) => ({
        unitNumber: typeof item.unitNumber === 'number' ? item.unitNumber : idx + 1,
        unitName: item.unitName || `Unit ${idx + 1}`,
        topicName: item.topicName || item.title || `Topic ${idx + 1}`,
        subtopics: Array.isArray(item.subtopics) ? item.subtopics.map(String) : [],
        prescribedWeightage: typeof item.prescribedWeightage === 'number' ? item.prescribedWeightage : 5,
        pageStart: typeof item.pageStart === 'number' ? item.pageStart : undefined,
        pageEnd: typeof item.pageEnd === 'number' ? item.pageEnd : undefined
      }));
    }
  }

  return [];
}

/**
 * Generate questions for a specific topic partitioned by Indian Question Typology (MCQ, VSA, SA, Descriptive)
 */
export async function generateTopicQuestionsByType(
  topicName: string,
  unitName: string,
  className: string,
  textbookContent: string,
  counts: TopicQuestionCounts
): Promise<Question[]> {
  const totalForTopic = (counts.mcqCount || 0) + (counts.veryShortCount || 0) + (counts.shortCount || 0) + (counts.descriptiveCount || 0);
  if (totalForTopic <= 0) return [];

  console.log(`🎯 [TOPIC GENERATOR] Generating ${totalForTopic} question(s) for topic "${topicName}" (${unitName || ''}):`);
  console.log(`   └─ MCQs: ${counts.mcqCount || 0}, VSA: ${counts.veryShortCount || 0}, SA: ${counts.shortCount || 0}, Descriptive: ${counts.descriptiveCount || 0}`);

  const snippetToUse = textbookContent ? textbookContent.substring(0, 14000) : '';

  const prompt = `You are an expert Indian board examiner (CBSE, ICSE, State Boards) creating question paper items for ${className} on the topic "${topicName}" (${unitName || ''}).

REQUIRED QUESTION TYPOLOGY BREAKDOWN:
- EXACTLY ${counts.mcqCount || 0} Multiple Choice Question(s) (1 Mark each): 4 options labeled ["A) ...", "B) ...", "C) ...", "D) ..."], exactly one correct option, with the textbook quote as explanation.
- EXACTLY ${counts.veryShortCount || 0} Very Short Answer Question(s) (2 Marks each): direct conceptual questions requiring a 2-point benchmark answer (1 mark per point).
- EXACTLY ${counts.shortCount || 0} Short Answer Question(s) (3 Marks each): concept or numerical problem requiring a 3-point benchmark answer / steps (1 mark per point).
- EXACTLY ${counts.descriptiveCount || 0} Long Answer / Descriptive Question(s) (5 Marks each): in-depth analytical question or derivation with an explicit step-by-step marking rubric (e.g. Statement: 1 Mark, Derivation: 2 Marks, Application: 2 Marks).

KNOWLEDGE BASE CONTEXT FROM SYLLABUS / TEXTBOOK:
${snippetToUse || `Topic: ${topicName}. Unit: ${unitName}. Core concepts of ${className}.`}

CRITICAL GUARDRAILS:
1. GROUNDED FACT CHECK: Questions and answers must STRICTLY reflect the provided textbook context. Do not invent outside facts.
2. Return ONLY a valid JSON array of objects with the exact schema below and NO markdown formatting:
[
  ${counts.mcqCount > 0 ? `{
    "type": "mcq",
    "section": "Section A",
    "marks": 1,
    "text": "Which of the following describes...?",
    "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
    "correctAnswer": "A) option 1",
    "rubricKey": "Textbook citation: ..."
  },` : ''}
  ${counts.veryShortCount > 0 ? `{
    "type": "vsa",
    "section": "Section B",
    "marks": 2,
    "text": "State two properties of...",
    "correctAnswer": "1. First property (1 Mark)\\n2. Second property (1 Mark)",
    "rubricKey": "Award 1 mark for each valid property."
  },` : ''}
  ${counts.shortCount > 0 ? `{
    "type": "sa",
    "section": "Section C",
    "marks": 3,
    "text": "Explain why... and give an example.",
    "correctAnswer": "1. Explanation of principle (2 Marks)\\n2. Example (1 Mark)",
    "rubricKey": "2 marks for explanation, 1 mark for valid example."
  },` : ''}
  ${counts.descriptiveCount > 0 ? `{
    "type": "descriptive",
    "section": "Section D",
    "marks": 5,
    "text": "Describe the complete process of... with a detailed explanation.",
    "correctAnswer": "Complete step-by-step model answer...",
    "rubricKey": "Marking Scheme: Principle (1 Mark) + Procedure/Diagram (2 Marks) + Equations & Conclusion (2 Marks)."
  }` : ''}
]`;

  const aiText = await callGemini36Api(prompt);
  if (aiText) {
    const parsed = parseJsonValue(aiText, '[');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((q: any, i: number) => ({
        id: `topic-${topicName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${q.type || 'gen'}-${Date.now()}-${i}`,
        type: q.type || (q.marks === 1 ? 'mcq' : q.marks === 2 ? 'vsa' : q.marks === 3 ? 'sa' : 'descriptive'),
        section: q.section || (q.marks === 1 ? 'Section A' : q.marks === 2 ? 'Section B' : q.marks === 3 ? 'Section C' : 'Section D'),
        marks: typeof q.marks === 'number' ? q.marks : (q.type === 'mcq' ? 1 : q.type === 'vsa' ? 2 : q.type === 'sa' ? 3 : 5),
        text: q.text || q.question || '',
        options: Array.isArray(q.options) ? q.options.map(String) : (q.type === 'mcq' ? ['A)', 'B)', 'C)', 'D)'] : undefined),
        correctAnswer: q.correctAnswer || q.answerKey || '',
        rubricKey: q.rubricKey || q.markingScheme || '',
        stem: topicName
      }));
    }
  }

  return [];
}

export interface ChapterMetadata {
  chapterNumber: number;
  chapterTitle: string;
  subtopics: string[];
}

function isLikelyFilenameOrCode(str?: string): boolean {
  if (!str) return false;
  const s = str.trim();
  if (/\.pdf$/i.test(s)) return true;
  if (/^([0-9]+\.\s*)?[a-z0-9_-]{1,14}$/i.test(s) && (/[0-9]/.test(s) || s.length <= 4) && !/\s/.test(s)) return true;
  return false;
}

/**
 * Extract Chapter Title, Number, and Key Subtopics from Chapter PDF text using Gemini
 */
export async function extractChapterMetadataWithAI(
  chapterTextSnippet: string,
  fileName?: string,
  suggestedTitle?: string,
  suggestedNumber?: number
): Promise<ChapterMetadata> {
  const cleanSuggestedTitle = isLikelyFilenameOrCode(suggestedTitle) ? undefined : suggestedTitle;
  console.log(`📖 [CHAPTER AI PARSER] Analyzing metadata & subtopics for: "${cleanSuggestedTitle || fileName || 'Chapter'}"...`);

  const prompt = `You are a curriculum specialist and school educator.
Analyze this excerpt from a school textbook chapter PDF (File: "${fileName || 'Chapter PDF'}").
${cleanSuggestedTitle ? `Suggested Chapter Title: "${cleanSuggestedTitle}"` : ''}
${suggestedNumber ? `Suggested Chapter Number: ${suggestedNumber}` : ''}

Task:
1. Identify the official Chapter Number (integer). If not mentioned, use ${suggestedNumber || 1}.
2. Identify the official human-readable Chapter Title (e.g. "The Ever-Evolving World of Science", "Exploring Substances: Acidic, Basic, and Neutral", "Electricity: Circuits and their Components", "Chemical Reactions and Equations").
CRITICAL: Do NOT return raw PDF codes or file names like "gecu101", "ch01", "doc1.pdf". Extract the actual textbook chapter heading. Do NOT include "Chapter 1:" in the title.
3. Extract an array of 3 to 10 distinct, core subtopics/concepts covered in this chapter (e.g. ["Chemical Equations", "Types of Chemical Reactions", "Combination Reactions", "Decomposition Reactions", "Displacement Reactions", "Oxidation and Reduction", "Corrosion and Rancidity"]).

DOCUMENT EXCERPT:
${chapterTextSnippet.substring(0, 24000)}

Return ONLY a valid JSON object with the exact schema below, and NO markdown code block wrappers:
{
  "chapterNumber": 1,
  "chapterTitle": "Chemical Reactions and Equations",
  "subtopics": ["Subtopic 1", "Subtopic 2", "Subtopic 3"]
}`;

  const aiText = await callGemini36Api(prompt);
  if (aiText) {
    const parsed = parseJsonValue(aiText, '{');
    if (parsed && (parsed.chapterTitle || parsed.title)) {
      const extractedTitle = String(parsed.chapterTitle || parsed.title || '').trim();
      const validTitle = !isLikelyFilenameOrCode(extractedTitle) ? extractedTitle : undefined;
      const extractedNumber = typeof parsed.chapterNumber === 'number' && parsed.chapterNumber > 0 ? parsed.chapterNumber : (suggestedNumber || 1);
      const subtopicsList = Array.isArray(parsed.subtopics) ? parsed.subtopics.map(String).filter((s: string) => s && s.trim().length > 0) : [];
      return {
        chapterNumber: extractedNumber,
        chapterTitle: validTitle || cleanSuggestedTitle || 'Chapter ' + extractedNumber,
        subtopics: subtopicsList
      };
    }
  }

  // Fallback
  return {
    chapterNumber: suggestedNumber || 1,
    chapterTitle: cleanSuggestedTitle || `Chapter ${suggestedNumber || 1}`,
    subtopics: []
  };
}

export interface ChapterBlueprintItem {
  chapterTitle: string;
  chapterNumber?: number;
  subtopics?: string[];
  mcqCount: number;         // 1 Mark each
  veryShortCount: number;   // 2 Marks each
  shortCount: number;       // 3 Marks each
  descriptiveCount: number; // 5 Marks each
}

export interface UnifiedExamParams {
  examTitle: string;
  className: string;
  subjectName: string;
  targetMarks: number;
  language?: string;
  difficulty?: string;
  selectedChapters: string[];
  selectedSubtopics: string[];
  questionCounts: {
    mcqCount: number;
    veryShortCount: number;
    shortCount: number;
    descriptiveCount: number;
  };
  marksConfig?: {
    mcq?: number;
    vsa?: number;
    sa?: number;
    long?: number;
  };
  blueprint?: ChapterBlueprintItem[];
  textbookContext: string;
}

/**
 * Generate Unified Question Paper directly from Selected Chapters/Subtopics and Question Counts
 */
export async function generateExamQuestionsUnified(params: UnifiedExamParams): Promise<Question[]> {
  const {
    examTitle,
    className,
    subjectName,
    targetMarks,
    language = 'English',
    difficulty = 'Standard',
    selectedChapters,
    selectedSubtopics,
    questionCounts,
    marksConfig,
    blueprint,
    textbookContext
  } = params;

  const mcqMarks = Number(marksConfig?.mcq) || 1;
  const vsaMarks = Number(marksConfig?.vsa) || 2;
  const saMarks = Number(marksConfig?.sa) || 3;
  const longMarks = Number(marksConfig?.long) || 5;

  const totalQuestions = (questionCounts.mcqCount || 0) + (questionCounts.veryShortCount || 0) + (questionCounts.shortCount || 0) + (questionCounts.descriptiveCount || 0);
  if (totalQuestions <= 0) return [];

  console.log(`\n===============================================================`);
  console.log(`🎯 [UNIFIED EXAM GENERATOR] Generating ${totalQuestions} Questions for "${examTitle}" (${targetMarks} Marks)`);
  console.log(`   ├─ Class / Subject : ${className} / ${subjectName}`);
  console.log(`   ├─ Chapters        : ${selectedChapters.join(', ') || 'All Chapters'}`);
  console.log(`   ├─ Subtopics       : ${selectedSubtopics.join(', ') || 'All Subtopics'}`);
  console.log(`   ├─ Typology        : MCQs=${questionCounts.mcqCount} (${mcqMarks}m), VSA=${questionCounts.veryShortCount} (${vsaMarks}m), SA=${questionCounts.shortCount} (${saMarks}m), Long=${questionCounts.descriptiveCount} (${longMarks}m)`);
  if (blueprint && blueprint.length > 0) {
    console.log(`   └─ Blueprint Items : ${blueprint.length} chapter allocations configured`);
  }
  console.log(`===============================================================`);

  const snippetToUse = textbookContext ? textbookContext.substring(0, 28000) : '';

  const blueprintPromptSection = blueprint && blueprint.length > 0 ? `
MANDATORY TOPIC-BY-TOPIC BLUEPRINT SPECIFICATION (YOU MUST MAP QUESTIONS STRICTLY TO THESE TOPICS & COUNTS):
${blueprint.map((b, idx) => {
  const bTotal = (b.mcqCount || 0) * mcqMarks + (b.veryShortCount || 0) * vsaMarks + (b.shortCount || 0) * saMarks + (b.descriptiveCount || 0) * longMarks;
  const subs = b.subtopics && b.subtopics.length > 0 ? b.subtopics.join(', ') : 'All chapter concepts';
  return `[TOPIC ${idx + 1}: "${b.chapterTitle}"] (Topic Target: ${bTotal} Marks)
  - Focus Subtopics: ${subs}
  - Section A (MCQs ${mcqMarks}m each): EXACTLY ${b.mcqCount || 0} question(s)
  - Section B (Very Short ${vsaMarks}m each): EXACTLY ${b.veryShortCount || 0} question(s)
  - Section C (Short Answer ${saMarks}m each): EXACTLY ${b.shortCount || 0} question(s)
  - Section D (Long / Case ${longMarks}m each): EXACTLY ${b.descriptiveCount || 0} question(s)`;
}).join('\n\n')}
` : '';

  const prompt = `You are a premier senior school examination board setter (CBSE, ICSE, State Boards).
Create a complete, rigorous, and balanced question paper for "${examTitle}" (${className}, Subject: ${subjectName}).
Language: ${language}. Difficulty Level: ${difficulty}.
Target Total Marks: ${targetMarks}.
${blueprintPromptSection}
SELECTED CHAPTERS & SYLLABUS SCOPE:
Chapters: ${selectedChapters.length > 0 ? selectedChapters.join(', ') : 'All prescribed chapters'}
Key Subtopics / Concepts to cover: ${selectedSubtopics.length > 0 ? selectedSubtopics.join(', ') : 'All core syllabus concepts'}

KNOWLEDGE BASE CONTEXT FROM TEXTBOOK CHAPTERS:
${snippetToUse || `Subject: ${subjectName}. Class: ${className}. Core syllabus principles and chapter concepts.`}

REQUIRED QUESTION BREAKDOWN (YOU MUST GENERATE EXACTLY THIS MANY QUESTIONS):
1. EXACTLY ${questionCounts.mcqCount || 0} Multiple Choice Questions (Section A - ${mcqMarks} Mark${mcqMarks === 1 ? '' : 's'} each):
   - Provide 4 distinct options: ["A) ...", "B) ...", "C) ...", "D) ..."]
   - Provide "correctAnswer" (e.g. "B) ...")
   - Provide "rubricKey" citing the textbook principle.
2. EXACTLY ${questionCounts.veryShortCount || 0} Very Short Answer Questions (Section B - ${vsaMarks} Mark${vsaMarks === 1 ? '' : 's'} each):
   - Crisp direct conceptual, definition, or formula questions.
   - Provide "correctAnswer" with clear key points corresponding to marks.
3. EXACTLY ${questionCounts.shortCount || 0} Short Answer Questions (Section C - ${saMarks} Mark${saMarks === 1 ? '' : 's'} each):
   - Conceptual explanation, numerical, or reasoning questions.
   - Provide "correctAnswer" with clear step-by-step points/steps.
4. EXACTLY ${questionCounts.descriptiveCount || 0} Long Answer / Descriptive / Case Questions (Section D - ${longMarks} Mark${longMarks === 1 ? '' : 's'} each):
   - Detailed comprehensive questions, derivations, or scenario applications.
   - Provide complete step-by-step model answer and explicit marking scheme breakdown in "rubricKey".

PRESENTATION & FORMATTING GUIDELINES (TABLES & DIAGRAMS):
- For questions involving comparisons, experimental observations, truth tables, or matching items, format the table inside "text" as a clean Markdown table (e.g. | Column 1 | Column 2 |).
- For questions that require or benefit from a visual diagram, circuit, ray diagram, chemical apparatus, biological structure, or geometry figure, set "hasVisual": true and provide a descriptive "imagePrompt" (e.g. "Diagram of an electric circuit with a resistor, key, and ammeter") or clean inline SVG markup in "diagramSvg".

CRITICAL RULES:
- Generate ALL ${totalQuestions} requested questions across all sections.
- Keep each question's "rubricKey" and "correctAnswer" clear, accurate, and concise (avoid excessively verbose paragraphs).
- Ensure all questions are numbered sequentially from 1 to ${totalQuestions}.
- Section A questions have type "mcq" and section "Section A".
- Section B questions have type "vsa" and section "Section B".
- Section C questions have type "sa" and section "Section C".
- Section D questions have type "descriptive" and section "Section D".
- Output MUST be a valid JSON array starting with [ and ending with ].

JSON Schema:
[
  {
    "id": "q1",
    "questionNo": "1",
    "type": "mcq",
    "section": "Section A",
    "marks": ${mcqMarks},
    "text": "Question text here",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctAnswer": "A) ...",
    "rubricKey": "Explanation or citation",
    "stem": "Chapter / Subtopic name",
    "hasVisual": false,
    "imagePrompt": ""
  }
]`;

  let aiText = '';
  console.log(`\n🤖 [AI GATEWAY DISPATCH] Sending prompt to AI Gateway (Task: exam_generation)...`);
  console.log(`   ├─ Target Questions : ${totalQuestions} (${targetMarks} Marks)`);
  console.log(`   ├─ Prompt Length    : ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`);
  console.log(`   └─ Blueprint Scope  : ${blueprint && blueprint.length > 0 ? `${blueprint.length} topic blueprint cards active` : 'General typology'}`);

  try {
    const gatewayRes = await aiGateway.execute({
      taskType: 'exam_generation',
      prompt,
      targetLanguage: language,
      maxOutputTokens: 32768,
      temperature: 0.2
    });
    aiText = gatewayRes.text;
  } catch (gwErr: any) {
    console.warn('⚠️ [UNIFIED EXAM GENERATOR] Gateway exception, attempting direct fallback:', gwErr?.message || gwErr);
    aiText = (await callGemini36Api(prompt)) || '';
  }

  if (!aiText) {
    console.error('❌ [UNIFIED EXAM GENERATOR] AI provider returned no text.');
    return [];
  }

  console.log(`📥 [AI GATEWAY COMPLETED] Received ${aiText.length} characters (~${Math.round(aiText.length / 4)} tokens). Parsing JSON questions...`);

  // Try parsing as array first, or as object with questions
  let parsed = parseJsonValue(aiText, '[');
  if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
    parsed = parseJsonValue(aiText, '{');
  }

  let rawQuestions: any[] = [];
  if (Array.isArray(parsed)) {
    rawQuestions = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.questions)) {
      rawQuestions = parsed.questions;
    } else if (Array.isArray(parsed.questionPaper)) {
      rawQuestions = parsed.questionPaper;
    } else if (Array.isArray(parsed.paper)) {
      rawQuestions = parsed.paper;
    } else if (Array.isArray(parsed.data)) {
      rawQuestions = parsed.data;
    } else {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          rawQuestions.push(...parsed[key]);
        }
      }
    }
  }

  // Fallback: regex search for JSON question objects if top-level parse yielded nothing
  if (rawQuestions.length === 0) {
    console.warn('⚠️ [UNIFIED EXAM GENERATOR] Standard JSON parsing yielded 0 questions. Trying regex block extractor...');
    const objectMatches = aiText.match(/\{[^{}]*"(?:text|question)"\s*:[^{}]*\}/g);
    if (objectMatches && objectMatches.length > 0) {
      for (const objStr of objectMatches) {
        try {
          const qObj = JSON.parse(objStr);
          if (qObj && (qObj.text || qObj.question)) rawQuestions.push(qObj);
        } catch {}
      }
    }
  }

  // Strictly filter out any empty / placeholder question fragments
  const validRawQuestions = rawQuestions.filter((q: any) => {
    const text = String(q?.text || q?.question || q?.prompt || '').trim();
    return text.length >= 6;
  });

  if (validRawQuestions.length === 0) {
    console.error(`❌ [UNIFIED EXAM GENERATOR] No valid question items with text found in AI response! AI Output preview: ${aiText.substring(0, 500)}`);
    return [];
  }

  const mcqsFound = validRawQuestions.filter((q: any) => q.type === 'mcq' || q.marks === 1).length;
  const vsasFound = validRawQuestions.filter((q: any) => q.type === 'vsa' || q.marks === 2).length;
  const sasFound = validRawQuestions.filter((q: any) => q.type === 'sa' || q.marks === 3).length;
  const longsFound = validRawQuestions.filter((q: any) => q.type === 'descriptive' || (q.marks || 0) >= 4).length;

  console.log(`📋 [AI EXTRACTION RESULT] Successfully parsed ${validRawQuestions.length} questions:`);
  console.log(`   ├─ Section A (MCQs 1m) : ${mcqsFound}`);
  console.log(`   ├─ Section B (VSA 2m)  : ${vsasFound}`);
  console.log(`   ├─ Section C (SA 3m)   : ${sasFound}`);
  console.log(`   └─ Section D (Long 5m) : ${longsFound}`);

  let qNum = 1;
  return validRawQuestions.map((q: any, idx: number) => {
    const numStr = String(qNum++);
    let marksVal = typeof q.marks === 'number' && q.marks > 0 ? q.marks : 0;
    let qType = q.type ? String(q.type).toLowerCase() : '';

    if (!marksVal) {
      if (qType === 'mcq') marksVal = mcqMarks;
      else if (qType === 'vsa' || qType === 'very_short') marksVal = vsaMarks;
      else if (qType === 'sa' || qType === 'short') marksVal = saMarks;
      else marksVal = longMarks;
    }

    if (!qType) {
      if (marksVal === mcqMarks) qType = 'mcq';
      else if (marksVal === vsaMarks) qType = 'vsa';
      else if (marksVal === saMarks) qType = 'sa';
      else qType = 'descriptive';
    }

    let sectionName = q.section || '';
    if (!sectionName) {
      if (marksVal === mcqMarks || qType === 'mcq') sectionName = 'Section A';
      else if (marksVal === vsaMarks || qType === 'vsa') sectionName = 'Section B';
      else if (marksVal === saMarks || qType === 'sa') sectionName = 'Section C';
      else sectionName = 'Section D';
    }

    let optionsList: string[] | undefined = undefined;
    if (qType === 'mcq') {
      if (Array.isArray(q.options) && q.options.length > 0) {
        optionsList = q.options.map((opt: any) => String(opt));
      } else if (q.options && typeof q.options === 'object') {
        optionsList = Object.entries(q.options).map(([k, v]) => `${k}) ${v}`);
      } else {
        optionsList = ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'];
      }
    }

    return {
      id: `unified-q-${Date.now()}-${idx + 1}`,
      number: numStr,
      questionNo: numStr,
      type: qType,
      section: sectionName,
      marks: marksVal,
      text: String(q.text || q.question || q.prompt || '').trim(),
      options: optionsList,
      correctAnswer: String(q.correctAnswer || q.answerKey || q.answer || q.correct_option || '').trim(),
      rubricKey: String(q.rubricKey || q.markingScheme || q.explanation || q.solution || '').trim(),
      stem: String(q.stem || q.chapter || (selectedChapters[0] || subjectName)).trim(),
      hasVisual: Boolean(q.hasVisual || q.imagePrompt || q.diagramSvg || q.imageUrl),
      imagePrompt: q.imagePrompt ? String(q.imagePrompt).trim() : undefined,
      imageUrl: q.imageUrl ? String(q.imageUrl) : undefined,
      diagramSvg: q.diagramSvg ? String(q.diagramSvg).trim() : undefined,
      tableData: q.tableData ? String(q.tableData).trim() : undefined
    };
  });
}

/**
 * Generate a single replacement question for a specific slot/topic
 */
export async function generateSingleQuestionReplacement(params: {
  subjectName: string;
  className: string;
  chapterTitle: string;
  subtopics?: string[];
  questionType: string;
  marks: number;
  currentQuestionText?: string;
  language?: string;
  difficulty?: string;
  textbookContext?: string;
}): Promise<Question | null> {
  const {
    subjectName,
    className,
    chapterTitle,
    subtopics = [],
    questionType,
    marks,
    currentQuestionText,
    language = 'English',
    difficulty = 'Standard',
    textbookContext
  } = params;

  const isMcq = questionType.toLowerCase() === 'mcq';
  const prompt = `You are an elite school examination board setter (CBSE, ICSE, State Boards).
Generate EXACTLY 1 high-quality, rigorous question to replace an existing question.
Subject: ${subjectName}
Class: ${className}
Topic/Chapter: ${chapterTitle}
${subtopics.length > 0 ? `Subtopics: ${subtopics.join(', ')}` : ''}
Language: ${language}
Difficulty: ${difficulty}
Question Typology: ${questionType.toUpperCase()}
Marks: ${marks} Marks

${currentQuestionText ? `The teacher wants to replace this previous question:
"${currentQuestionText}"
Generate a completely fresh, distinct, high-quality alternative question testing the same topic at the same cognitive level.` : ''}

${textbookContext ? `Textbook Context Reference:\n${textbookContext.substring(0, 8000)}` : ''}

CRITICAL RULES:
- If MCQ: provide 4 distinct options: ["A) ...", "B) ...", "C) ...", "D) ..."], "correctAnswer" (e.g. "C) ..."), and "rubricKey".
- If non-MCQ: provide concise step-by-step model answer in "correctAnswer" and point-wise marking scheme in "rubricKey".
- If the question involves data tables, format it inside "text" with a clean Markdown table.
- If the question involves diagrams, circuits, ray optics, or geometric shapes, set "hasVisual": true and provide a descriptive "imagePrompt".
- Output MUST be a single valid JSON object (not array).

JSON Schema:
{
  "text": "Question text here",
  "type": "${questionType}",
  "marks": ${marks},
  "options": ${isMcq ? '["A) ...", "B) ...", "C) ...", "D) ..."]' : 'null'},
  "correctAnswer": "Model answer",
  "rubricKey": "Marking scheme",
  "stem": "${chapterTitle}",
  "hasVisual": false,
  "imagePrompt": ""
}`;

  try {
    const aiText = await callGemini36Api(prompt);
    if (!aiText) return null;
    const parsed = parseJsonValue(aiText, '{') || (Array.isArray(parseJsonValue(aiText, '[')) ? parseJsonValue(aiText, '[')[0] : null);
    if (!parsed || (!parsed.text && !parsed.question)) return null;

    let optionsList: string[] | undefined = undefined;
    if (isMcq) {
      if (Array.isArray(parsed.options) && parsed.options.length > 0) {
        optionsList = parsed.options.map((o: any) => String(o));
      } else if (parsed.options && typeof parsed.options === 'object') {
        optionsList = Object.entries(parsed.options).map(([k, v]) => `${k}) ${v}`);
      } else {
        optionsList = ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'];
      }
    }

    const replacementQ: Question = {
      id: `rep-q-${Date.now()}`,
      text: String(parsed.text || parsed.question || '').trim(),
      type: questionType,
      marks: Number(parsed.marks) || marks,
      options: optionsList,
      correctAnswer: String(parsed.correctAnswer || parsed.answer || '').trim(),
      rubricKey: String(parsed.rubricKey || parsed.explanation || '').trim(),
      stem: String(parsed.stem || chapterTitle).trim(),
      hasVisual: Boolean(parsed.hasVisual || parsed.imagePrompt || parsed.diagramSvg),
      imagePrompt: parsed.imagePrompt ? String(parsed.imagePrompt).trim() : undefined,
      diagramSvg: parsed.diagramSvg ? String(parsed.diagramSvg).trim() : undefined,
      tableData: parsed.tableData ? String(parsed.tableData).trim() : undefined
    };

    // Auto-generate diagram if replacement question specifies visual requirement
    if (replacementQ.hasVisual && (replacementQ.imagePrompt || replacementQ.text)) {
      try {
        const visual = await generateQuestionImageOrDiagram(
          replacementQ.imagePrompt || replacementQ.text,
          replacementQ.text,
          subjectName
        );
        if (visual.imageUrl) replacementQ.imageUrl = visual.imageUrl;
        else if (visual.diagramSvg) replacementQ.diagramSvg = visual.diagramSvg;
      } catch (imgErr) {
        console.warn('⚠️ Could not auto-generate visual for replacement question:', imgErr);
      }
    }

    return replacementQ;
  } catch (err) {
    console.error('Error generating single question replacement:', err);
    return null;
  }
}

/**
 * Universal prompt generator for exam questions across ANY subject (Science, Math, Social Studies, etc.).
 * Strictly constrained to the specific question context, with zero answer leakage and zero extra/unmentioned elements.
 */
function buildUniversalQuestionDiagramPrompt(prompt: string, questionText: string, subject?: string) {
  const cleanSubject = (subject || 'General').trim();
  const cleanPrompt = (prompt || '').trim();
  const cleanQuestion = (questionText || prompt || '').trim();
  const visualGoal = cleanPrompt && cleanPrompt !== cleanQuestion ? cleanPrompt : cleanQuestion;

  const imagePromptText = `You are a professional educational textbook and school examination paper illustrator.
Create a clean, precise, and high-contrast educational figure strictly for this examination question.

EXAMINATION QUESTION CONTEXT:
Subject: ${cleanSubject}
Question: "${cleanQuestion}"
Figure Objective: "${visualGoal}"

MANDATORY RULES (APPLIES STRICTLY):
1. DEPICT ONLY WHAT IS IN THIS QUESTION: Illustrate ONLY the specific physical setup, scenario, phenomenon, geometric figure, or data described in the question above. Do NOT include ANY unmentioned extra experiments, unrelated apparatus, side tests, or extraneous diagrams.
2. DO NOT REVEAL THE ANSWER: This figure is an examination stimulus for a student test. Do NOT reveal, label, or display the solution, the final answer, or the underlying principle that the question asks the student to deduce.
3. ZERO GIBBERISH TEXT: Do NOT generate unreadable pseudo-text, cursive scribbles, or garbled fake letters. Any label must be a real, legible English term mentioned in the question, or clean uppercase letter markers (A, B, C, D).
4. PURE SOLID WHITE BACKGROUND: The background MUST be pure solid white (#FFFFFF). No laboratory bench clutter, no room shadows, no decorative frames.
5. CLEAN EDUCATIONAL STYLE: High-contrast, sharp line art or technical textbook illustration suitable for examination paper printing.`;

  const svgPrompt = `You are a professional educational and examination diagram illustrator.
Create a clean, precise, and standalone vector SVG diagram strictly for this examination question:

EXAMINATION QUESTION CONTEXT:
Subject: ${cleanSubject}
Question: "${cleanQuestion}"
Figure Objective: "${visualGoal}"

MANDATORY RULES:
1. DEPICT ONLY WHAT IS IN THIS QUESTION: Draw ONLY the specific scenario, apparatus, geometric shape, or phenomenon described in the question above. Do NOT include unmentioned extra experiments, unrelated apparatus, or extraneous side diagrams.
2. DO NOT REVEAL THE ANSWER: This figure is for a student test. Do NOT reveal or label the answer, solution, or principle that the question asks the student to identify.
3. STANDALONE SVG ONLY: Return ONLY valid <svg viewBox="0 0 500 350" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">...</svg> markup. No markdown fences.
4. PURE WHITE BACKGROUND: Include <rect width="100%" height="100%" fill="#FFFFFF"/> as the first child element.
5. CRISP DARK LINES: Use clear dark stroke lines (#0F172A, #1E293B, #2563EB) and standard arrowheads (<marker id="arrow" .../>).
6. LEGIBLE TEXT LABELS: Use <text> elements with font-family="system-ui, -apple-system, sans-serif", font-size="12" to "14", font-weight="600", and fill="#0F172A". All text labels must be real, legible, correctly spelled English words or letter markers (A, B, C). Zero garbled text.`;

  return { cleanSubject, visualGoal, imagePromptText, svgPrompt };
}

/**
 * Generate Question Diagram or Image via Gemini 2.5 Flash Image / Gemini SVG
 * Strictly grounded to the question stem across all subjects without extra content or answer leaks.
 */
export async function generateQuestionImageOrDiagram(
  prompt: string,
  questionText: string,
  subject?: string
): Promise<{ imageUrl?: string; diagramSvg?: string; type: 'svg' | 'image' }> {
  const geminiKey = getGeminiKey();
  const { cleanSubject, visualGoal, imagePromptText, svgPrompt } = buildUniversalQuestionDiagramPrompt(prompt, questionText, subject);

  // Try 1: Native Gemini Image Generation (gemini-2.5-flash-image)
  if (geminiKey && !geminiKey.includes('your_gemini_api_key')) {
    try {
      console.log(`🎨 [AI IMAGE ENGINE] Generating grounded image for: "${visualGoal.substring(0, 60)}..." (${cleanSubject})`);
      const imgRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: imagePromptText
                }
              ]
            }
          ]
        })
      });

      if (imgRes.ok) {
        const imgData = await imgRes.json() as any;
        const candidates = imgData?.candidates?.[0]?.content?.parts || [];
        for (const part of candidates) {
          if (part.inlineData && part.inlineData.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            const base64Data = part.inlineData.data;
            const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
            const fileName = `diagram-${Date.now()}.${ext}`;
            const buffer = Buffer.from(base64Data, 'base64');
            
            let finalUrl = `data:${mime};base64,${base64Data}`;
            try {
              const cloudUrl = await uploadImageToSupabase(buffer, fileName, mime, 'diagrams');
              if (cloudUrl && cloudUrl.startsWith('http')) {
                finalUrl = cloudUrl;
                console.log(`☁️ [AI IMAGE ENGINE] Uploaded diagram to Supabase Storage: ${finalUrl}`);
              }
            } catch (upErr: any) {
              console.warn('⚠️ [AI IMAGE ENGINE] Storage upload failed, keeping base64 fallback:', upErr?.message || upErr);
            }

            console.log(`✅ [AI IMAGE ENGINE] Generated real ${mime} diagram successfully (${Math.round(base64Data.length / 1024)} KB raw).`);
            return {
              imageUrl: finalUrl,
              type: 'image'
            };
          }
        }
      } else {
        const errText = await imgRes.text();
        console.warn(`⚠️ [AI IMAGE ENGINE] gemini-2.5-flash-image returned status ${imgRes.status}: ${errText.substring(0, 150)}. Trying vector SVG...`);
      }
    } catch (imgErr: any) {
      console.warn('⚠️ [AI IMAGE ENGINE] Image generation exception:', imgErr?.message || imgErr);
    }
  }

  // Try 2: Clean, sharp Vector SVG diagram generated via Gemini 3.6
  console.log(`📐 [AI VECTOR SVG] Generating standalone educational SVG diagram (${cleanSubject})...`);
  try {
    const rawSvgResponse = await callGemini36Api(svgPrompt);
    if (rawSvgResponse) {
      let cleanedSvg = rawSvgResponse.trim();
      if (cleanedSvg.includes('<svg') && cleanedSvg.includes('</svg>')) {
        const startIdx = cleanedSvg.indexOf('<svg');
        const endIdx = cleanedSvg.lastIndexOf('</svg>') + 6;
        cleanedSvg = cleanedSvg.substring(startIdx, endIdx);
        // Ensure SVG has responsive width and height
        if (!cleanedSvg.includes('width=')) {
          cleanedSvg = cleanedSvg.replace('<svg', '<svg width="100%" height="auto"');
        }

        let svgCloudUrl: string | undefined;
        try {
          const svgBuffer = Buffer.from(cleanedSvg, 'utf-8');
          const uploadedUrl = await uploadImageToSupabase(svgBuffer, `diagram-${Date.now()}.svg`, 'image/svg+xml', 'diagrams');
          if (uploadedUrl && uploadedUrl.startsWith('http')) {
            svgCloudUrl = uploadedUrl;
            console.log(`☁️ [AI VECTOR SVG] Uploaded SVG to Supabase Storage: ${svgCloudUrl}`);
          }
        } catch (upErr: any) {
          console.warn('⚠️ [AI VECTOR SVG] SVG storage upload notice:', upErr?.message || upErr);
        }

        console.log(`✅ [AI VECTOR SVG] Generated sharp vector SVG (${cleanedSvg.length} chars).`);
        return {
          imageUrl: svgCloudUrl,
          diagramSvg: cleanedSvg,
          type: 'svg'
        };
      }
    }
  } catch (svgErr: any) {
    console.error('❌ [AI VECTOR SVG] Error generating SVG diagram:', svgErr);
  }

  throw new Error('Unable to generate image or diagram for this question.');
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

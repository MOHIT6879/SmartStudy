import dotenv from 'dotenv';
import { callSarvamChatApi, performSarvamVisionOcr } from './sarvamService.js';
dotenv.config();

export interface Question {
  id: string;
  text: string;
  marks?: number;
  section?: string;
  options?: string[];
  correctAnswer?: string;
  rubricKey?: string;
  type?: string;
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
const getGeminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

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

  const modelName = modelNameOverride || getGeminiModel();

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
export async function determineReasoningModel(subject: string, questionsText: string): Promise<string> {
  const lowerSubject = subject ? subject.toLowerCase() : '';
  if (process.env.PRIMARY_AI_PROVIDER?.toLowerCase() === 'sarvam') {
    return 'sarvam';
  }
  if (lowerSubject.includes('hindi') || lowerSubject.includes('telugu')) {
    return 'sarvam';
  }

  const prompt = `Evaluate the severity and complexity of the following assessment for the subject '${subject}'.
Based on the complexity, choose the best reasoning model from the following options:
- gemini-3.5-flash
- gemini-3.6-flash
- gemini-3.6-standard
- gemini-3.6-pro

Return ONLY the chosen model name as a raw string. Do not include quotes or any other text.

Assessment Content:
${questionsText.substring(0, 2000)}`;

  try {
    const chosenModel = await callGemini36Api(prompt, null, 'text/plain', 3, 'gemini-3.5-flash');
    if (chosenModel) {
      const model = chosenModel.trim().toLowerCase();
      if (['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.6-standard', 'gemini-3.6-pro'].includes(model)) {
        return model;
      }
    }
  } catch (err) {
    console.warn('⚠️ determineReasoningModel error:', err);
  }

  // Fallback
  return 'gemini-3.6-flash';
}

function parseJsonValue(rawText: string, openingCharacter: '{' | '['): any {
  if (!rawText) return null;
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
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

function normalizeQuestionEvaluations(
  rawEvaluations: any[],
  assignedQuestions: Question[]
): QuestionEvaluation[] {
  const source = Array.isArray(rawEvaluations) ? rawEvaluations : [];
  const questions: Question[] = assignedQuestions.length > 0
    ? assignedQuestions
    : source.map((evaluation, index) => ({
        id: `q${index + 1}`,
        text: evaluation?.questionText || `Question ${index + 1}`,
        correctAnswer: evaluation?.benchmarkKey || ''
      }));

  return questions.map((question, index) => {
    const expectedNumber = index + 1;
    const evaluation = source.find((item) => {
      const parsedNumber = Number.parseInt(String(item?.questionNo || '').replace(/\D/g, ''), 10);
      return parsedNumber === expectedNumber;
    }) || source[index] || {};
    const numericScore = Number(evaluation.scorePercent);
    const scorePercent = Number.isFinite(numericScore)
      ? Math.round(Math.min(100, Math.max(0, numericScore)) / 25) * 25
      : 0;
    const status: QuestionEvaluation['status'] = scorePercent >= 90
      ? 'Full Credit'
      : scorePercent > 0
        ? 'Partial Credit'
        : 'Unrelated / No Credit';

    return {
      questionNo: `Q${expectedNumber}`,
      questionText: question.text,
      marks: Number.isFinite(Number(question.marks)) && Number(question.marks) > 0 ? Number(question.marks) : 5,
      earnedMarks: 0,
      benchmarkKey: question.correctAnswer || question.rubricKey || evaluation.benchmarkKey || 'No benchmark key provided.',
      studentAnswerSnippet: evaluation.studentAnswerSnippet || 'No answer detected in the scanned paper.',
      scorePercent,
      status,
      reasoning: evaluation.reasoning || (scorePercent === 0
        ? 'No relevant answer was detected for this question.'
        : 'The response was compared with the assigned benchmark key.'),
      feedback: evaluation.feedback || evaluation.reasoning || (scorePercent >= 90
        ? 'Correct and complete response.'
        : 'Review the benchmark key and add the missing concepts.')
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
  existingOcrText: string = ''
): Promise<VisionEvaluationResult> {
  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  const pageCount = buffers.length > 0 ? buffers.length : 1;

  const textbookContext = textbookChunks.length > 0
    ? textbookChunks.slice(0, 10).join('\n---\n')
    : 'Core curriculum concepts, definitions, key theories, principles, and structured subject knowledge.';

  const questionsPrompt = assignedQuestions.length > 0
    ? `ASSIGNED QUESTIONS TO EVALUATE:\n` + assignedQuestions.map((q, idx) => `Question ${idx + 1}: "${q.text}" (Maximum marks: ${q.marks || 5}; Ground Truth Benchmark Key: "${q.correctAnswer || 'Textbook reference answer'}")`).join('\n')
    : `ASSIGNED QUESTIONS: Evaluate questions answered on the student paper against textbook context.`;

  const systemPrompt = `You are an expert teacher evaluating a student's handwritten answer sheet containing ${pageCount} page image(s).

TEXTBOOK KNOWLEDGE BASE CONTEXT:
${textbookContext}

${questionsPrompt}

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
7. Use the assigned question text and benchmark key verbatim. Do not rewrite or invent either one.
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
  let aiText: string | null;
  if (evaluationModel === 'sarvam') {
    if (!existingOcrText.trim()) {
      throw new Error('Sarvam evaluation requires the OCR transcription from Stage 3.');
    }
    console.log(`🇮🇳 [SARVAM PIPELINE] Reusing Stage 3 OCR transcription (${existingOcrText.length} chars).`);
    evaluationPrompt = `You are an expert teacher grading an answer sheet from OCR text.

  TEXTBOOK CONTEXT:
  ${textbookContext}

  ${questionsPrompt}

  OCR TRANSCRIPTION:
  ${existingOcrText}

  For every assigned question, identify the essential marking points in its benchmark and check each point against the OCR. Award 100 when all essential points are semantically present and correct, regardless of wording, order, spelling, grammar, or notation style. Do not penalize repetition or extra correct explanation. Reduce marks only for missing essential points or factual contradictions. Use only 0, 25, 50, 75, or 100 for scorePercent. Award credit only for evidence in the OCR transcription. Unanswered or unrelated questions receive 0. Keep snippets, reasoning, and feedback concise. Do not repeat question text, benchmark keys, or the full OCR. Return exactly ${assignedQuestions.length} questionEvaluations.`;
    evaluationImages = null;
    console.log(`🇮🇳 [SARVAM PIPELINE] Feeding transcription to Sarvam structured grading (${process.env.SARVAM_CHAT_MODEL || 'sarvam-105b'})...`);
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
  if (aiText) {
    const parsed = cleanAndParseJson(aiText);
    if (parsed) {
      if (assignedQuestions.length > 0 && (!Array.isArray(parsed.questionEvaluations) || parsed.questionEvaluations.length !== assignedQuestions.length)) {
        throw new Error(`${evaluationModel === 'sarvam' ? 'Sarvam' : 'Gemini'} returned an incomplete question evaluation set.`);
      }
      const questionEvaluations = normalizeQuestionEvaluations(parsed.questionEvaluations, assignedQuestions);
      const totalMarks = questionEvaluations.reduce((total, evaluation) => total + evaluation.marks, 0);
      const normalizedScore = questionEvaluations.length > 0
        ? Math.round(questionEvaluations.reduce((total, evaluation) => total + evaluation.earnedMarks, 0) * 100) / 100
        : (typeof parsed.score === 'number' ? Math.round(Math.min(100, Math.max(0, parsed.score))) : 0);
      console.log(`📊 [EVALUATION PARSED] Score: ${normalizedScore}/${totalMarks}, Questions: ${questionEvaluations.length}, Excelled: [${(parsed.excelledAreas || []).join(', ')}], Gaps: [${(parsed.knowledgeGaps || []).join(', ')}]`);
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
function normalizeQuestionPaper(rawText: string | null): Question[] | null {
  if (!rawText) return null;
  const parsed = parseJsonValue(rawText, '[') || cleanAndParseJson(rawText);
  const source = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(source) || source.length === 0) return null;

  const questions = source.map((question: any, index: number) => ({
    id: String(question?.id || `q${index + 1}`),
    section: String(question?.section || question?.part || 'Questions'),
    marks: Number(question?.marks),
    text: String(question?.text || question?.question || '').replace(/^\s*(?:q(?:uestion)?\s*)?\d+[.):-]\s*/i, '').trim(),
    correctAnswer: String(question?.correctAnswer || question?.answerKey || '').trim()
  }));
  return questions.every((question) => question.text && Number.isFinite(question.marks) && question.marks >= 0 && question.correctAnswer)
    ? questions
    : null;
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
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                section: { type: 'string' },
                marks: { type: 'number' },
                text: { type: 'string' },
                correctAnswer: { type: 'string' }
              },
              required: ['id', 'section', 'marks', 'text', 'correctAnswer'],
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
  mimeType: string = 'image/jpeg',
  languageOrSubject: string = 'English'
): Promise<Question[]> {
  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  if (buffers.length === 0) return [];

  const prompt = `You are an expert curriculum assistant. Perform high-precision Vision AI OCR on the provided Question Paper image(s).

INSTRUCTIONS:
1. Identify and extract ALL printed or handwritten examination questions from the image(s) line-by-line.
2. For each question, extract or formulate its precise ground-truth reference answer key based on textbook knowledge.
3. Preserve math symbols, scientific formulas, or non-English text (Hindi/Telugu) accurately.

Return ONLY a valid JSON object with NO markdown code block wrappers:
{
  "questions": [
    { "id": "q1", "section": "Part - A - I", "marks": 2, "text": "Question 1 text...", "correctAnswer": "Ground-truth answer key..." },
    { "id": "q2", "section": "Part - A - I", "marks": 2, "text": "Question 2 text...", "correctAnswer": "Ground-truth answer key..." }
  ]
}`;

  const useSarvam = Boolean(process.env.SARVAM_API_KEY);
  let aiText: string | null;
  if (useSarvam) {
    console.log(`🇮🇳 [PHOTO QUESTION EXTRACTOR] Routing ${languageOrSubject} question paper through Sarvam Vision OCR...`);
    try {
      const transcription = await performSarvamVisionOcr(buffers, buffers.map(() => mimeType), languageOrSubject) || '';
      aiText = await callSarvamChatApi(`${prompt}\n\nSARVAM VISION TRANSCRIPTION:\n${transcription}`, 2, {
        reasoningEffort: null,
        maxTokens: 4096,
        temperature: 0,
        seed: 42,
        responseFormat: sarvamQuestionPaperSchema()
      });
    } catch (error) {
      console.warn('⚠️ [PHOTO QUESTION EXTRACTOR] Sarvam extraction failed; using Gemini fallback:', error);
      aiText = null;
    }
  } else {
    aiText = await callGemini36Api(prompt, buffers, mimeType);
  }
  const primaryQuestions = normalizeQuestionPaper(aiText);
  if (primaryQuestions) {
    console.log(`🎯 [PHOTO QUESTION EXTRACTOR] Extracted ${primaryQuestions.length} questions via ${useSarvam ? 'Sarvam' : 'Gemini'}.`);
    return primaryQuestions;
  }
  if (useSarvam) {
    console.warn('⚠️ [PHOTO QUESTION EXTRACTOR] Sarvam returned invalid question JSON; using Gemini fallback.');
    const fallbackText = await callGemini36Api(prompt, buffers, mimeType, 3, 'gemini-3.6-flash');
    const fallbackQuestions = normalizeQuestionPaper(fallbackText);
    if (fallbackQuestions) {
      console.log(`🎯 [PHOTO QUESTION EXTRACTOR] Extracted ${fallbackQuestions.length} questions via Gemini fallback.`);
      return fallbackQuestions;
    }
  }
  throw new Error(`Question extraction failed: ${useSarvam ? 'Sarvam and Gemini' : 'Gemini'} returned invalid question JSON.`);
}

import dotenv from 'dotenv';
dotenv.config();

export interface Question {
  id: string;
  text: string;
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
  status: 'Full Credit' | 'Partial Credit' | 'Unrelated / No Credit';
  reasoning: string;
}

export interface VisionEvaluationResult {
  ocrText: string;
  score: number;
  excelledAreas: string[];
  knowledgeGaps: string[];
  feedback: string;
  socraticHint: string;
  questionEvaluations?: QuestionEvaluation[];
}

const getOpenAiKey = () => process.env.OPENAI_API_KEY || '';
const getGeminiKey = () => process.env.GEMINI_API_KEY || '';
const getAnthropicKey = () => process.env.ANTHROPIC_API_KEY || '';

const getOpenAiModel = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';
const getGeminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const getAnthropicModel = () => process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

/**
 * 1. OpenAI Direct API Call (Vision + Text Prompts)
 */
async function callOpenAIApi(
  prompt: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  maxRetries = 2
): Promise<string | null> {
  const apiKey = getOpenAiKey();
  if (!apiKey || apiKey.includes('your_openai_api_key')) return null;

  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  const model = getOpenAiModel();

  const userContent: any[] = [{ type: 'text', text: prompt }];
  for (const buf of buffers) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${buf.toString('base64')}`
      }
    });
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 [OPENAI] Requesting completion (${model}) [Attempt ${attempt}/${maxRetries}]...`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: userContent }],
          temperature: 0.2
        })
      });

      if (res.ok) {
        const data = await res.json() as any;
        const text = data?.choices?.[0]?.message?.content || null;
        if (text) {
          console.log(`✅ [OPENAI] Successful response from ${model}`);
          return text;
        }
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [OPENAI] API Notice (${res.status}): ${errText.substring(0, 300)}`);
        if (res.status === 429 || res.status === 401) {
          console.warn('⚠️ [OPENAI] Quota or Auth issue. Fast failover to next provider...');
          return null;
        }
      }
    } catch (err) {
      console.warn(`⚠️ [OPENAI] Fetch exception:`, err);
    }
  }

  return null;
}

/**
 * 2. Anthropic Claude Direct API Call (Vision + Text Prompts)
 */
async function callAnthropicApi(
  prompt: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  maxRetries = 2
): Promise<string | null> {
  const apiKey = getAnthropicKey();
  if (!apiKey || apiKey.includes('your_anthropic_api_key')) return null;

  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  const model = getAnthropicModel();

  const content: any[] = [{ type: 'text', text: prompt }];
  for (const buf of buffers) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: buf.toString('base64')
      }
    });
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 [CLAUDE] Requesting completion (${model}) [Attempt ${attempt}/${maxRetries}]...`);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: content }]
        })
      });

      if (res.ok) {
        const data = await res.json() as any;
        const text = data?.content?.[0]?.text || null;
        if (text) {
          console.log(`✅ [CLAUDE] Successful response from ${model}`);
          return text;
        }
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [CLAUDE] API Notice (${res.status}): ${errText.substring(0, 300)}`);
        if (res.status === 429 || res.status === 401) {
          console.warn('⚠️ [CLAUDE] Quota or Auth issue. Fast failover to next provider...');
          return null;
        }
      }
    } catch (err) {
      console.warn(`⚠️ [CLAUDE] Fetch exception:`, err);
    }
  }

  return null;
}

/**
 * 3. Google Gemini Direct API Call (1,500 FREE Requests per Day)
 */
async function callGeminiDirectApi(
  prompt: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  maxRetries = 3
): Promise<string | null> {
  const geminiKey = getGeminiKey();
  if (!geminiKey || geminiKey.includes('your_gemini_api_key')) return null;

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

  const modelName = getGeminiModel();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 [GEMINI] Requesting completion (${modelName}) [Attempt ${attempt}/${maxRetries}]...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      });

      if (res.ok) {
        const data = await res.json() as any;
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        if (responseText) {
          console.log(`✅ [GEMINI] Successful response from ${modelName}`);
          return responseText;
        }
      } else {
        const errBody = await res.text();
        console.warn(`⚠️ [GEMINI] API notice (${res.status}): ${errBody.substring(0, 300)}`);
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          const waitMs = attempt * 3000;
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    } catch (err) {
      console.warn(`⚠️ [GEMINI] Exception:`, err);
    }
  }

  return null;
}

/**
 * 4. Multi-Engine AI Provider Router (OpenAI -> Anthropic Claude -> Gemini)
 */
async function callDualEngineAI(
  prompt: string,
  imageInput?: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg'
): Promise<string | null> {
  const primary = (process.env.PRIMARY_AI_PROVIDER || 'openai').toLowerCase();

  const providers: Record<string, () => Promise<string | null>> = {
    openai: () => callOpenAIApi(prompt, imageInput, mimeType),
    anthropic: () => callAnthropicApi(prompt, imageInput, mimeType),
    claude: () => callAnthropicApi(prompt, imageInput, mimeType),
    gemini: () => callGeminiDirectApi(prompt, imageInput, mimeType)
  };

  const sequence = primary === 'anthropic' || primary === 'claude'
    ? ['anthropic', 'openai', 'gemini']
    : primary === 'gemini'
    ? ['gemini', 'anthropic', 'openai']
    : ['openai', 'anthropic', 'gemini'];

  for (const p of sequence) {
    const fn = providers[p];
    if (fn) {
      const res = await fn();
      if (res) return res;
    }
  }

  return null;
}

/**
 * Helper: Normalize vector array dimensions to 1536 (pgvector default)
 */
function normalizeToDimensions(embedding: number[], targetDimensions = 1536): number[] {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return generateFallbackEmbedding('default', targetDimensions);
  }

  if (embedding.length === targetDimensions) return embedding;

  if (embedding.length > targetDimensions) {
    return embedding.slice(0, targetDimensions);
  }

  const padded = [...embedding];
  while (padded.length < targetDimensions) {
    const nextVal = Math.sin(padded.length * 0.1);
    padded.push(Number(nextVal.toFixed(6)));
  }
  return padded;
}

/**
 * High-speed mathematical vector generator (1536 dims)
 */
function generateFallbackEmbedding(text: string, dimensions = 1536): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const vec: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    const val = Math.sin(hash + i * 1.5);
    vec.push(Number(val.toFixed(6)));
  }
  return vec;
}

/**
 * 4. Generate 1536-Dimensional Vector Float Array for Supabase pgvector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = text ? text.substring(0, 1000) : 'default';
  const openAiKey = getOpenAiKey();
  const geminiKey = getGeminiKey();

  // 1. Try OpenAI Embedding API first
  if (openAiKey && !openAiKey.includes('your_openai_api_key')) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
          input: cleanText
        })
      });

      if (res.ok) {
        const data = await res.json() as any;
        const vec = data?.data?.[0]?.embedding;
        if (Array.isArray(vec) && vec.length > 0) {
          return normalizeToDimensions(vec, 1536);
        }
      }
    } catch (err) {
      // Fall through to Gemini Embedding
    }
  }

  // 2. Try Direct Google Gemini Embedding API
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
      }
    } catch (err) {
      // Fall through to mathematical vector generator
    }
  }

  return generateFallbackEmbedding(cleanText, 1536);
}

/**
 * Safely parse JSON strings from LLMs by sanitizing unescaped control characters
 */
function cleanAndParseJson(rawText: string): any {
  if (!rawText) return null;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let str = jsonMatch[0];
  str = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e2) {
      console.warn('⚠️ cleanAndParseJson exception:', e2);
      return null;
    }
  }
}

/**
 * 5. Vision OCR & Student Paper Evaluation with Human-Teacher Grading
 */
export async function analyzeStudentPaper(
  imageInput: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg',
  textbookChunks: string[] = [],
  assignedQuestions: any[] = []
): Promise<VisionEvaluationResult> {
  const buffers: Buffer[] = Array.isArray(imageInput)
    ? imageInput.filter(b => b && b.length > 0)
    : (imageInput && imageInput.length > 0 ? [imageInput] : []);

  const pageCount = buffers.length > 0 ? buffers.length : 1;

  const textbookContext = textbookChunks.length > 0
    ? textbookChunks.slice(0, 10).join('\n---\n')
    : 'Core curriculum concepts, definitions, key theories, principles, and structured subject knowledge.';

  const questionsPrompt = assignedQuestions.length > 0
    ? `ASSIGNED QUESTIONS TO EVALUATE:\n` + assignedQuestions.map((q, idx) => `Question ${idx + 1}: "${q.text}" (Ground Truth Benchmark Key: "${q.correctAnswer || 'Textbook reference answer'}")`).join('\n')
    : `ASSIGNED QUESTIONS: Evaluate questions answered on the student paper against textbook context.`;

  const systemPrompt = `You are a human-like expert teacher evaluating a student's handwritten answer sheet containing ${pageCount} page image(s).

TEXTBOOK KNOWLEDGE BASE CONTEXT:
${textbookContext}

${questionsPrompt}

YOUR GRADING INSTRUCTIONS (HUMAN-TEACHER MULTI-PAGE PARTIAL CREDIT RULES):
1. Perform high-precision OCR across ALL ${pageCount} page image(s) provided. Transcribe all legible text page by page (e.g. --- PAGE 1 ---, --- PAGE 2 ---, etc.) across all sections. Auto-detect page orientation if any image is sideways/rotated.
2. For each assigned question, evaluate whether the student's handwritten text across any of the pages actually answers that question:
   - Full Credit (90-100%): Student correctly answers the question with accurate textbook concepts and terminology.
   - Partial Credit (30-80%): Student attempts the question or explains part of the concept -> award partial percentage.
   - Unrelated / No Credit (0%): Student wrote about a completely different question or topic -> award 0% with an explicit reasoning note.
3. Calculate the overall score (0 to 100%) as the average of individual question scorePercent values.
4. Extract 2-4 Excelled Areas and 1-3 Knowledge Gaps.
5. Provide constructive feedback and a natural Socratic Guidance Hint.

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
      "reasoning": "Student wrote about a different topic."
    }
  ]
}`;

  const aiText = await callDualEngineAI(systemPrompt, buffers, mimeType);
  if (aiText) {
    const parsed = cleanAndParseJson(aiText);
    if (parsed) {
      return {
        ocrText: parsed.ocrText || 'OCR transcription unavailable',
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        excelledAreas: Array.isArray(parsed.excelledAreas) ? parsed.excelledAreas : [],
        knowledgeGaps: Array.isArray(parsed.knowledgeGaps) ? parsed.knowledgeGaps : [],
        feedback: parsed.feedback || 'Evaluation completed.',
        socraticHint: parsed.socraticHint || 'Review textbook key concepts.',
        questionEvaluations: Array.isArray(parsed.questionEvaluations) ? parsed.questionEvaluations : []
      };
    }
  }

  throw new Error('AI Evaluation unavailable: Both OpenAI API and Google Gemini API failed or rate limited.');
}

/**
 * 6. Generate Question Pool from Uploaded Textbook Text
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

  console.log(`🤖 Invoking Dual AI Engine (OpenAI / Gemini) to generate EXACTLY ${targetCount} questions strictly from ${snippetToUse.length} characters of textbook context...`);

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

  const aiText = await callDualEngineAI(prompt);
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
 * 7. Vision AI Question Paper Photo Extraction
 */
export async function extractQuestionsFromImage(
  imageInput: Buffer[] | Buffer | null,
  mimeType: string = 'image/jpeg'
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

Return ONLY a valid JSON array of objects with NO markdown code block wrappers:
[
  { "id": "q1", "text": "Question 1 text...", "correctAnswer": "Ground-truth answer key..." },
  { "id": "q2", "text": "Question 2 text...", "correctAnswer": "Ground-truth answer key..." }
]`;

  const aiText = await callDualEngineAI(prompt, buffers, mimeType);
  if (aiText) {
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const questions = JSON.parse(jsonMatch[0]) as Question[];
        if (Array.isArray(questions) && questions.length > 0) {
          console.log(`🎯 [PHOTO QUESTION EXTRACTOR] Extracted ${questions.length} questions from image photo.`);
          return questions;
        }
      } catch (e) {
        console.warn('⚠️ Photo extraction JSON parse notice:', e);
      }
    }
  }

  return [];
}

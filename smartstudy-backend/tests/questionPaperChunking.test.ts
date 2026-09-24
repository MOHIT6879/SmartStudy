import assert from 'node:assert/strict';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { extractQuestionsFromImage, normalizeQuestionEvaluations, validateEvaluationPayload, extractRelevantOcrEvidence } from '../src/services/aiService.js';

test('extracts oversized question-paper OCR through bounded chat prompts', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  let chatCalls = 0;
  const promptLengths: number[] = [];
  const largeOcr = Array.from({ length: 15 }, (_, index) => `Question block ${index + 1}\n${'content '.repeat(4200)}`).join('\n\n');

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/digitise')) return new Response(JSON.stringify({ job_id: 'job-1', status: 'completed' }), { status: 200 });
    if (url.endsWith('/status')) return new Response(JSON.stringify({ status: 'completed' }), { status: 200 });
    if (url.endsWith('/download-url')) return new Response(JSON.stringify({ url: 'https://download.test/result', method: 'GET' }), { status: 200 });
    if (url === 'https://download.test/result') {
      const zip = new AdmZip();
      zip.addFile('result.md', Buffer.from(largeOcr));
      return new Response(new Uint8Array(zip.toBuffer()), { status: 200 });
    }
    if (url.endsWith('/v1/chat/completions')) {
      chatCalls++;
      const request = JSON.parse(String(init?.body));
      promptLengths.push(request.messages[0].content.length);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ questions: [{ id: `q${chatCalls}`, section: 'Section A', marks: 1, text: `Extracted question ${chatCalls}`, correctAnswer: `Answer ${chatCalls}` }] }) } }]
      }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  try {
    const questions = await extractQuestionsFromImage(Buffer.from('image'), 'image/jpeg', 'Physics');
    assert.ok(chatCalls > 1);
    assert.ok(promptLengths.every((length) => length < 90000));
    assert.equal(questions.length, chatCalls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = originalKey;
  }
});

test('rejects malformed evaluation payloads and maps questions by stable key', async () => {
  const questions = [
    { id: 'q1', text: 'What is 2+2?', marks: 5, number: '1', questionNo: 'Q1', correctAnswer: '4' },
    { id: 'q2', text: 'What is the capital of France?', marks: 5, number: '2', questionNo: 'Q2', correctAnswer: 'Paris' }
  ];

  const validPayload = {
    excelledAreas: ['Arithmetic'],
    knowledgeGaps: [],
    feedback: 'Good work.',
    socraticHint: 'Check the step-by-step reasoning.',
    questionEvaluations: [
      { questionNo: 'Q2', studentAnswerSnippet: 'Paris', scorePercent: 100, reasoning: 'Correct.', feedback: 'Correct.' },
      { questionNo: 'Q1', studentAnswerSnippet: '4', scorePercent: 100, reasoning: 'Correct.', feedback: 'Correct.' }
    ]
  };

  const mapped = normalizeQuestionEvaluations(validPayload.questionEvaluations, questions);
  assert.equal(mapped[0].scorePercent, 100);
  assert.equal(mapped[1].scorePercent, 100);

  const malformed = {
    excelledAreas: ['Arithmetic', 123],
    knowledgeGaps: [],
    feedback: 'Good work.',
    socraticHint: 'Check the step-by-step reasoning.',
    questionEvaluations: [
      { questionNo: 'Q1', studentAnswerSnippet: '4', scorePercent: 0, reasoning: 'Correct.', feedback: 'Correct.' },
      { questionNo: 'Q1', studentAnswerSnippet: '4', scorePercent: 100, reasoning: 'Correct.', feedback: 'Correct.' }
    ]
  };

  assert.throws(() => validateEvaluationPayload(malformed, questions), /duplicate|array of strings|missing a valid questionNo|invalid/);
});

test('extracts only question-relevant OCR evidence for grading', () => {
  const paperOcr = [
    'ANSWER SHEET',
    'Important notes and unrelated admin formatting',
    'Question 3: Why is this a good idea?',
    'Student answer: Because it is easier to understand',
    'Question 8: What is the capital of France?',
    'Student answer: Paris',
    'Office comments: do not circulate this page externally'
  ].join('\n');

  const assignedQuestions = [
    { id: 'q8', questionNo: 'Q8', text: 'What is the capital of France?', marks: 5, correctAnswer: 'Paris' },
    { id: 'q3', questionNo: 'Q3', text: 'Why is this a good idea?', marks: 5, correctAnswer: 'It is easier to understand' }
  ] as any[];

  const evidence = extractRelevantOcrEvidence(paperOcr, assignedQuestions, 4000);
  assert.match(evidence, /Q8|capital of France|Paris/i);
  assert.match(evidence, /Q3|easier to understand/i);
  assert.doesNotMatch(evidence, /IMPORTANT NOTES|do not circulate this page externally/i);
});

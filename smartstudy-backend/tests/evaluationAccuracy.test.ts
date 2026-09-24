import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRelevantOcrEvidence, normalizeQuestionEvaluations } from '../src/services/aiService.js';

test('preserves full OCR text across all sub-questions (a-k) without destructive slicing', () => {
  const paperOcr = `--- PAGE 1 ---
(a) ¿Cuándo fueron a vivir Diego y su familia a España?
Cerca de Valencia

(b) ¿Qué pensaron Diego y su familia sobre mudarse a España?
muchas ventajas

(c) ¿Por qué Diego y su familia pueden pasar más horas al aire libre en su nueva localidad?

(d) ¿Por qué a la familia de Diego le gusta cenar en la terraza del puerto? (Menciona dos razones.)
1. Por la vista al mar
2. Por la brisa fresca

(e) ¿Cuál es la actividad preferida de Diego y su familia cuando van a la bahía?
Nadar en el mar

(f) Donde vivia antes Diego, ¿por qué no podian ir a la costa?
Estaba demasiado lejos`;

  const assignedQuestions = [
    { id: 'q4a', questionNo: '4(a)', number: '4', partLabel: 'a', text: '¿Cuándo fueron a vivir Diego y su familia a España?', marks: 1, correctAnswer: 'Hace dos años' },
    { id: 'q4b', questionNo: '4(b)', number: '4', partLabel: 'b', text: '¿Qué pensaron Diego y su familia sobre mudarse a España?', marks: 1, correctAnswer: 'Pensaron que tenía muchas ventajas' },
    { id: 'q4c', questionNo: '4(c)', number: '4', partLabel: 'c', text: '¿Por qué Diego y su familia pueden pasar más horas al aire libre?', marks: 1, correctAnswer: 'Porque el clima suele ser muy agradable.' },
    { id: 'q4d', questionNo: '4(d)', number: '4', partLabel: 'd', text: '¿Por qué a la familia de Diego le gusta cenar en la terraza del puerto?', marks: 2, correctAnswer: 'Por la vista y la brisa' },
    { id: 'q4e', questionNo: '4(e)', number: '4', partLabel: 'e', text: '¿Cuál es la actividad preferida de Diego y su familia cuando van a la bahía?', marks: 1, correctAnswer: 'Nadar' },
    { id: 'q4f', questionNo: '4(f)', number: '4', partLabel: 'f', text: 'Donde vivia antes Diego, ¿por qué no podian ir a la costa?', marks: 1, correctAnswer: 'Estaba lejos' }
  ];

  const evidence = extractRelevantOcrEvidence(paperOcr, assignedQuestions, 12000);

  // Verify that questions d, e, f at the bottom of the paper are fully preserved in evidence
  assert.match(evidence, /terraza del puerto/i);
  assert.match(evidence, /actividad preferida/i);
  assert.match(evidence, /no podian ir a la costa/i);
});

test('preserves the evaluator score when OCR evidence is ambiguous', () => {
  const paperOcr = `--- PAGE 1 ---
2 Lee los letreros.
[A] Farmacia [B] Librería [C] Cafetería [D] Cine

a) Marta quiere comprar medicamentos para el dolor de cabeza. [Box: EMPTY]
b) Marta busca una novela interesante para leer. [Box: B]
c) Marta desea tomar un café y comer un cruasán. [Box: EMPTY]
d) Marta necesita unas zapatillas nuevas para hacer deporte. [Box: H]
e) Marta pregunta dónde puede dejar su coche. [Box: EMPTY]`;

  const assignedQuestions = [
    { id: 'q2a', questionNo: '2(a)', text: 'Marta quiere comprar medicamentos...', marks: 1, correctAnswer: 'A' },
    { id: 'q2b', questionNo: '2(b)', text: 'Marta busca una novela...', marks: 1, correctAnswer: 'B' },
    { id: 'q2c', questionNo: '2(c)', text: 'Marta desea tomar un café...', marks: 1, correctAnswer: 'C' },
    { id: 'q2d', questionNo: '2(d)', text: 'Marta necesita unas zapatillas...', marks: 1, correctAnswer: 'E' },
    { id: 'q2e', questionNo: '2(e)', text: 'Marta pregunta dónde puede dejar su coche...', marks: 1, correctAnswer: 'G' }
  ];

  // The evaluator owns the score decision. OCR normalization must not overwrite it.
  const rawEvaluations = [
    { questionNo: '2(a)', studentAnswerSnippet: 'A', scorePercent: 100, reasoning: 'Correct answer A.', feedback: 'Correct.' },
    { questionNo: '2(b)', studentAnswerSnippet: 'B', scorePercent: 100, reasoning: 'Correct answer B.', feedback: 'Correct.' },
    { questionNo: '2(c)', studentAnswerSnippet: 'C', scorePercent: 100, reasoning: 'Correct answer C.', feedback: 'Correct.' },
    { questionNo: '2(d)', studentAnswerSnippet: 'H', scorePercent: 0, reasoning: 'Incorrect option H selected.', feedback: 'Incorrect.' },
    { questionNo: '2(e)', studentAnswerSnippet: 'G', scorePercent: 100, reasoning: 'Correct answer G.', feedback: 'Correct.' }
  ];

  const normalized = normalizeQuestionEvaluations(rawEvaluations, assignedQuestions, paperOcr);

  assert.equal(normalized[0].scorePercent, 100, 'Normalization must preserve the evaluator score');
  assert.equal(normalized[0].studentAnswerSnippet, 'A');
  assert.equal(normalized[1].scorePercent, 100, 'Correct handwritten answer B gets 100');
  assert.equal(normalized[1].studentAnswerSnippet, 'B');
  assert.equal(normalized[2].scorePercent, 100, 'Normalization must preserve the evaluator score');
  assert.equal(normalized[3].scorePercent, 0, 'Incorrect letter H for Q2(d) gets 0 credit');
  assert.equal(normalized[4].scorePercent, 100, 'Normalization must preserve the evaluator score');
});

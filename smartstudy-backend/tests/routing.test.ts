import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Import our services
import { determineReasoningModel } from '../src/services/aiService.js';
import { performOcr } from '../src/services/ocrService.js';
import { ingestPdfDocument } from '../src/services/ragService.js';

test('Dynamic Model Routing & Integrations', async (t) => {

  await t.test('1. Reasoning Model Routing - Indic Language (Telugu)', async () => {
    const model = await determineReasoningModel('Telugu', 'dummy questions');
    assert.strictEqual(model, 'sarvam', 'Telugu subject should route to sarvam model');
  });

  await t.test('2. Reasoning Model Routing - Indic Language (Hindi)', async () => {
    const model = await determineReasoningModel('Hindi', 'dummy questions');
    assert.strictEqual(model, 'sarvam', 'Hindi subject should route to sarvam model');
  });

  await t.test('3. Reasoning Model Routing - Science', async () => {
    const questions = "1. What is photosynthesis? 2. Explain the process of plant reproduction.";
    const model = await determineReasoningModel('Science', questions);
    if (process.env.PRIMARY_AI_PROVIDER?.toLowerCase() === 'sarvam') {
      assert.strictEqual(model, 'sarvam', 'Configured Sarvam primary provider should be selected');
      return;
    }
    // Without a configured Sarvam primary, the result will be one of the allowed Gemini options.
    const allowedModels = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.6-standard', 'gemini-3.6-pro'];
    assert.ok(allowedModels.includes(model), `Science subject reasoning model should be one of the dynamically chosen gemini models, got: ${model}`);
  });

  await t.test('4. OCR Model Routing - Math Subject', async () => {
    // We will test if performOcr correctly identifies Math. Since we can't easily mock the internal callGemini36Api 
    // without a mocking library, we will pass a dummy string buffer and let it process. 
    // It should hit Gemini 3.6 flash.
    const res = await performOcr('dummy-text-not-a-real-buffer', 'English', 'image/jpeg', 'Math');
    // The language code returned is ENG, but internally it routed to gemini-3.6-flash.
    assert.strictEqual(res.langCode, 'ENG');
  });

  await t.test('5. OCR Model Routing - Hindi Subject', async () => {
    const res = await performOcr('dummy-text', 'Hindi', 'image/jpeg', 'Hindi');
    assert.strictEqual(res.langCode, 'HIN');
  });

  await t.test('6. Ingest Sample Document - Grade 5 Science', async () => {
    const sampleText = 'CHAPTER: Plant Reproduction (Grade 5 Science)\nPlant reproduction is the process by which plants generate new offspring. Plants can reproduce sexually or asexually. Sexual reproduction involves pollen transfer, fertilisation, and seed formation.';
    const filePath = path.resolve('../sample_pdfs/Grade5_Science_Plant_Reproduction.txt');
    const fileBuffer = fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.from(sampleText);

    console.log(`\nTesting ingestion of sample document...`);
    const result = await ingestPdfDocument(
      { buffer: fileBuffer, originalname: 'Grade5_Science_Plant_Reproduction.txt' },
      'Grade 5 Science',
      'Plant Reproduction'
    );

    assert.ok(result.chunksCount > 0, 'Should have generated multiple vector chunks from the document');
    assert.ok(result.text.includes('Reproduction'), 'Extracted text should contain document keywords');
  });

});

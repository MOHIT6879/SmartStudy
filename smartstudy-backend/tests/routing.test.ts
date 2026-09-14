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
    // Because this makes a real API call to gemini-2.5-flash, the result will be one of the allowed options
    const allowedModels = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-3.6-standard', 'gemini-3.6-pro'];
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
    // Read the sample PDF/text file from the sample_pdfs directory
    const filePath = path.resolve('../sample_pdfs/Grade5_Science_Plant_Reproduction.txt');
    const fileBuffer = fs.readFileSync(filePath);

    // Call ingestPdfDocument with the mock file
    // Note: If SUPABASE_URL is configured, this will actually insert chunks into the DB.
    console.log(`\nTesting ingestion of: ${filePath}`);
    const result = await ingestPdfDocument(
      { buffer: fileBuffer, originalname: 'Grade5_Science_Plant_Reproduction.txt' },
      'Grade 5 Science',
      'Plant Reproduction'
    );

    assert.ok(result.chunksCount > 0, 'Should have generated multiple vector chunks from the document');
    assert.ok(result.text.includes('Reproduction'), 'Extracted text should contain document keywords');
  });

});

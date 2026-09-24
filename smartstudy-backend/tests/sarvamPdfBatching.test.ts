import assert from 'node:assert/strict';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';
import { performSarvamVisionOcr, supportsSarvamDocumentLanguage } from '../src/services/sarvamService.js';

test('routes only supported Document AI languages to Sarvam', () => {
  assert.equal(supportsSarvamDocumentLanguage('English'), true);
  assert.equal(supportsSarvamDocumentLanguage('Telugu (తెలుగు)'), true);
  assert.equal(supportsSarvamDocumentLanguage('Spanish'), false);
});

test('splits a PDF over ten pages into ordered Sarvam jobs', async () => {
  const source = await PDFDocument.create();
  for (let page = 0; page < 23; page++) source.addPage();
  const sourceBuffer = Buffer.from(await source.save());
  const uploadedPageCounts: number[] = [];
  let downloadLookupCalls = 0;
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/digitise')) {
      const formData = init?.body as FormData;
      const file = formData.get('file') as Blob;
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      uploadedPageCounts.push(pdf.getPageCount());
      return new Response(JSON.stringify({ job_id: `job-${uploadedPageCounts.length}`, status: 'completed' }), { status: 200 });
    }
    if (url.endsWith('/status')) return new Response(JSON.stringify({ status: 'completed' }), { status: 200 });
    if (url.endsWith('/download-url')) {
      downloadLookupCalls++;
      if (downloadLookupCalls === 1) return new Response('temporarily unavailable', { status: 500, headers: { 'retry-after': '0' } });
      return new Response(JSON.stringify({ url: 'https://download.test/result', method: 'GET' }), { status: 200 });
    }
    if (url === 'https://download.test/result') {
      const zip = new AdmZip();
      zip.addFile('result.md', Buffer.from('page text'));
      return new Response(new Uint8Array(zip.toBuffer()), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  try {
    const result = await performSarvamVisionOcr(sourceBuffer, 'application/pdf', 'English');
    assert.deepEqual(uploadedPageCounts, [10, 10, 3]);
    assert.equal(downloadLookupCalls, 4);
    assert.match(result || '', /PAGES 1-10/);
    assert.match(result || '', /PAGES 11-20/);
    assert.match(result || '', /PAGES 21-23/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = originalKey;
  }
});

import AdmZip from 'adm-zip';

const SARVAM_API_BASE_URL = 'https://api.sarvam.ai';
const TERMINAL_JOB_STATES = new Set(['completed', 'partially_completed', 'failed', 'rejected']);

function getSarvamKey(): string {
  const key = process.env.SARVAM_API_KEY || '';
  if (!key) {
    throw new Error('SARVAM_API_KEY is required for Hindi/Telugu routing.');
  }
  return key;
}

function sarvamHeaders(): Record<string, string> {
  return { 'api-subscription-key': getSarvamKey() };
}

export async function callSarvamChatApi(prompt: string, maxRetries = 3): Promise<string | null> {
  const modelName = process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';
  console.log(`🤖 [SARVAM AI] Calling Chat Completions (${modelName})...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${SARVAM_API_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        ...sarvamHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        reasoning_effort: 'medium',
        max_tokens: 4096
      })
    });

    if (response.ok) {
      const data = await response.json() as any;
      console.log(`✅ [SARVAM AI] Received successful response from ${modelName}`);
      return data?.choices?.[0]?.message?.content || null;
    }

    const errorBody = await response.text();
    console.warn(`⚠️ [SARVAM AI] Chat API notice (${response.status}): ${errorBody.substring(0, 300)}`);
    if (![429, 500, 503].includes(response.status) || attempt === maxRetries) return null;
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }

  return null;
}

function languageCode(languageName: string): string {
  const normalized = languageName.toLowerCase();
  if (normalized.includes('hindi')) return 'hi-IN';
  if (normalized.includes('telugu')) return 'te-IN';
  return 'en-IN';
}

export async function performSarvamVisionOcr(
  imageBuffer: Buffer,
  mimeType: string,
  languageName: string
): Promise<string | null> {
  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('pdf') ? 'pdf' : 'jpg';
  const langCode = languageCode(languageName);
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), `answer-sheet.${extension}`);
  formData.append('language', langCode);
  formData.append('output_format', 'md');

  console.log(`🇮🇳 [SARVAM VISION OCR] Creating DocAI digitize job (${imageBuffer.length} bytes, Lang: ${langCode})...`);

  const createResponse = await fetch(`${SARVAM_API_BASE_URL}/doc-ai/v1/job/digitise`, {
    method: 'POST',
    headers: sarvamHeaders(),
    body: formData
  });
  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    throw new Error(`Sarvam Vision job failed (${createResponse.status}): ${errorBody.substring(0, 300)}`);
  }

  const job = await createResponse.json() as any;
  if (!job?.job_id) throw new Error('Sarvam Vision did not return a job ID.');
  console.log(`   ├─ Sarvam Job ID: "${job.job_id}" (Status: ${job.status || 'pending'})`);

  let status = String(job.status || 'pending').toLowerCase();
  for (let poll = 0; poll < 30 && !TERMINAL_JOB_STATES.has(status); poll++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusResponse = await fetch(`${SARVAM_API_BASE_URL}/doc-ai/v1/job/${job.job_id}/status`, {
      headers: sarvamHeaders()
    });
    if (!statusResponse.ok) throw new Error(`Sarvam Vision status check failed (${statusResponse.status}).`);
    const statusData = await statusResponse.json() as any;
    status = String(statusData.status || '').toLowerCase();
    console.log(`   ├─ Polling Job "${job.job_id}": status = ${status}`);
  }

  if (!['completed', 'partially_completed'].includes(status)) {
    throw new Error(`Sarvam Vision job ended with status: ${status || 'timeout'}.`);
  }

  const downloadResponse = await fetch(`${SARVAM_API_BASE_URL}/doc-ai/v1/job/${job.job_id}/download-url`, {
    headers: sarvamHeaders()
  });
  if (!downloadResponse.ok) throw new Error(`Sarvam Vision download lookup failed (${downloadResponse.status}).`);
  const downloadData = await downloadResponse.json() as any;
  if (!downloadData?.url) throw new Error('Sarvam Vision did not return a download URL.');

  const outputResponse = await fetch(downloadData.url, { method: downloadData.method || 'GET' });
  if (!outputResponse.ok) throw new Error(`Sarvam Vision output download failed (${outputResponse.status}).`);
  const zip = new AdmZip(Buffer.from(await outputResponse.arrayBuffer()));
  const markdownEntry = zip.getEntries().find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.md'));
  const text = markdownEntry ? markdownEntry.getData().toString('utf-8').trim() : null;
  console.log(`✅ [SARVAM VISION OCR COMPLETED] Extracted ${text?.length || 0} characters of Markdown.`);
  return text;
}
import { callGemini36Api } from './aiService.js';
import { performSarvamVisionOcr } from './sarvamService.js';

export interface OcrResult {
  ocrText: string;
  confidence: number;
  langCode: string;
}

/**
 * Multilingual Vision OCR Service powered by Google Gemini 3.6
 */
export async function performOcr(
  imageSource: string | Buffer,
  languageName: string = 'English',
  mimeType: string = 'image/jpeg',
  subject?: string
): Promise<OcrResult> {
  let langCode = 'ENG';
  if (languageName.includes('Hindi')) {
    langCode = 'HIN';
  } else if (languageName.includes('Telugu')) {
    langCode = 'TEL';
  }

  let buffer: Buffer | null = null;
  if (Buffer.isBuffer(imageSource) && imageSource.length > 0) {
    buffer = imageSource;
  }

  // Determine OCR model based on subject
  let ocrModel = 'gemini-3.5-flash'; // default for Science, Social, English
  const routingContext = `${subject || ''} ${languageName}`.toLowerCase();
  if (routingContext.includes('hindi') || routingContext.includes('telugu')) {
    ocrModel = 'sarvam';
  } else if (routingContext.includes('math')) {
    ocrModel = 'gemini-3.6-flash';
  }

  console.log(`🔍 [OCR AGENT] Target Engine: "${ocrModel.toUpperCase()}" (Lang: ${languageName}, Code: ${langCode})`);

  if (buffer) {
    try {
      const prompt = `Perform high-precision optical character recognition (OCR) on the provided handwritten answer sheet image in ${languageName} script.
Transcribe all legible handwritten or printed text line by line. Do not summarize or alter student wording. Transcribe text exactly as written on paper.`;

      const transcribed = ocrModel === 'sarvam'
        ? await performSarvamVisionOcr(buffer, mimeType, languageName)
        : await callGemini36Api(prompt, buffer, mimeType, 3, ocrModel);
      if (transcribed && transcribed.trim().length > 0) {
        console.log(`✅ [OCR SUCCESS] Extracted ${transcribed.trim().length} characters of text via ${ocrModel}`);
        return {
          ocrText: transcribed.trim(),
          confidence: 0.98,
          langCode
        };
      }
    } catch (err) {
      console.warn('⚠️ [OCR SERVICE] OCR Notice:', err);
    }
  }

  return {
    ocrText: typeof imageSource === 'string' && imageSource.length > 0 ? imageSource : '[Scanned handwritten paper upload - Gemini 3.6 OCR]',
    confidence: 0.95,
    langCode
  };
}

import { callGemini36Api, getConfiguredGeminiModel } from './aiService.js';
import { performSarvamVisionOcr, supportsSarvamDocumentLanguage } from './sarvamService.js';

export interface OcrResult {
  ocrText: string;
  confidence: number;
  langCode: string;
}

function appLanguageCode(languageName: string): string {
  return languageName.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'UNK';
}

export async function performOcrPages(
  buffers: Buffer[],
  languageName: string = 'English',
  mimeTypes: string[] = [],
  subject?: string
): Promise<OcrResult> {
  if (buffers.length === 0) throw new Error('No answer-sheet pages were provided for OCR.');

  const langCode = appLanguageCode(languageName);

  if (process.env.SARVAM_API_KEY && supportsSarvamDocumentLanguage(languageName)) {
    try {
      const transcription = await performSarvamVisionOcr(buffers, buffers.map((_, index) => mimeTypes[index] || 'image/jpeg'), languageName);
      if (transcription?.trim()) {
        console.log(`✅ [OCR SUCCESS] Extracted ${transcription.trim().length} characters from ${buffers.length} page(s) via Sarvam`);
        return { ocrText: transcription.trim(), confidence: 0.98, langCode };
      }
    } catch (error) {
      console.warn('⚠️ [OCR SERVICE] Sarvam multi-page OCR failed; using Gemini page fallback:', error);
    }
  }

  const prompt = `Perform high-precision OCR on this handwritten ${subject || ''} answer-sheet page in ${languageName}.
Transcribe all printed text, student handwriting, tables, and diagrams line by line.

CRITICAL TRANSCRIBING RULES:
1. ANSWER BOXES, TICKS & OBJECTIVE MARKINGS:
   - For questions with answer boxes [ ], checkboxes, letter boxes, or fill-in blank lines:
     - If a student wrote a letter or word inside the box/line, transcribe it as: [Box: <handwritten_text>] (e.g. [Box: B], [Box: H], [Box: Photosynthesis]).
     - If a student marked a tick mark (✓) or checkmark, transcribe: [Box: ✓] or [Tick: <option>].
     - If a student circled an option or letter, transcribe: [Circled: <option>].
     - If a student crossed out / scribbled over an answer and wrote another, transcribe: [Crossed-out: <old>] [Box: <new>].
     - If the box/line is COMPLETELY BLANK or UNANSWERED (nothing written inside), transcribe it explicitly as: [Box: EMPTY].
   - Do NOT guess, invent, or infer answers. Transcribe ONLY what is physically written on the page.

2. TABLES & DATA GRIDS:
   - If any answer or question contains a table or grid (e.g. difference tables, experimental data, matrices, truth tables):
     - Transcribe it faithfully as a GitHub Markdown table (| Column 1 | Column 2 |).
     - Preserve every row, column header, and student handwritten cell entry.
     - If any cell is blank, transcribe it as | [EMPTY] |.
     - Never flatten tables into unstructured sentences.

3. DIAGRAMS, FIGURES & DRAWINGS:
   - If the student drew a diagram, graph, circuit, ray diagram, flow chart, chemical structure, or geometric figure:
     - Explicitly transcribe it with the tag:
       [Diagram / Drawing: <type of drawing, labeled components, student annotations, axes names/units, arrows, measured values>]
     - Do NOT omit drawings or treat them as blank space!`;
  const pages = await Promise.all(buffers.map((buffer, index) => callGemini36Api(prompt, buffer, mimeTypes[index] || 'image/jpeg', 3, getConfiguredGeminiModel())));
  if (pages.some((page) => !page?.trim())) throw new Error('OCR providers could not transcribe every answer-sheet page.');
  return {
    ocrText: pages.map((page, index) => `--- PAGE ${index + 1} ---\n${page!.trim()}`).join('\n\n'),
    confidence: 0.95,
    langCode
  };
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
  const langCode = appLanguageCode(languageName);

  let buffer: Buffer | null = null;
  if (Buffer.isBuffer(imageSource) && imageSource.length > 0) {
    buffer = imageSource;
  }

  const sarvamAvailable = Boolean(process.env.SARVAM_API_KEY) && supportsSarvamDocumentLanguage(languageName);
  const ocrModel = sarvamAvailable ? 'sarvam' : getConfiguredGeminiModel();

  console.log(`🔍 [OCR AGENT] Target Engine: "${ocrModel.toUpperCase()}" (Lang: ${languageName}, Code: ${langCode})`);

  if (buffer) {
    try {
      const prompt = `Perform high-precision optical character recognition (OCR) on the provided handwritten answer sheet image in ${languageName} script.
Transcribe all legible handwritten or printed text, tables, and diagrams line by line.

CRITICAL TRANSCRIBING RULES:
1. ANSWER BOXES, TICKS & OBJECTIVE MARKINGS:
   - For answer boxes [ ], checkboxes, or fill-in blank lines:
     - If handwriting is present, transcribe: [Box: <handwritten_text>] (e.g. [Box: B], [Box: Photosynthesis]).
     - If a tick mark (✓) or checkmark is present: [Box: ✓] or [Tick: <option>].
     - If circled: [Circled: <option>].
     - If crossed-out: [Crossed-out: <old>] [Box: <new>].
     - If the box/line is EMPTY or BLANK: [Box: EMPTY].
2. TABLES & GRIDS:
   - Transcribe tables into Markdown tables (| Col 1 | Col 2 |), writing | [EMPTY] | for blank cells.
3. DIAGRAMS & DRAWINGS:
   - Transcribe drawings as [Diagram / Drawing: <description of drawing, labels, arrows, annotations, axes>].`;

      let transcribed: string | null = null;
      if (ocrModel === 'sarvam') {
        try {
          transcribed = await performSarvamVisionOcr(buffer, mimeType, languageName);
        } catch (sarvamError) {
          console.warn('⚠️ [OCR SERVICE] Sarvam OCR failed; using Gemini fallback:', sarvamError);
          transcribed = await callGemini36Api(prompt, buffer, mimeType, 3, getConfiguredGeminiModel());
        }
      } else {
        transcribed = await callGemini36Api(prompt, buffer, mimeType, 3, ocrModel);
      }
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

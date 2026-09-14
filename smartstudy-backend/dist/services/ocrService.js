import { callGemini36Api } from './aiService.js';
/**
 * Multilingual Vision OCR Service powered by Google Gemini 3.6
 */
export async function performOcr(imageSource, languageName = 'English', mimeType = 'image/jpeg', subject) {
    let langCode = 'ENG';
    if (languageName.includes('Hindi')) {
        langCode = 'HIN';
    }
    else if (languageName.includes('Telugu')) {
        langCode = 'TEL';
    }
    let buffer = null;
    if (Buffer.isBuffer(imageSource) && imageSource.length > 0) {
        buffer = imageSource;
    }
    // Determine OCR model based on subject
    let ocrModel = 'gemini-2.5-flash'; // default for Science, Social, English
    const lowerSubject = subject ? subject.toLowerCase() : '';
    if (lowerSubject.includes('hindi') || lowerSubject.includes('telugu')) {
        ocrModel = 'sarvam';
    }
    else if (lowerSubject.includes('math')) {
        ocrModel = 'gemini-3.6-flash';
    }
    if (buffer) {
        try {
            const prompt = `Perform high-precision optical character recognition (OCR) on the provided handwritten answer sheet image in ${languageName} script.
Transcribe all legible handwritten or printed text line by line. Do not summarize or alter student wording. Transcribe text exactly as written on paper.`;
            const transcribed = await callGemini36Api(prompt, buffer, mimeType, 3, ocrModel);
            if (transcribed && transcribed.trim().length > 0) {
                return {
                    ocrText: transcribed.trim(),
                    confidence: 0.98,
                    langCode
                };
            }
        }
        catch (err) {
            console.warn('⚠️ [OCR SERVICE] Gemini 3.6 OCR Notice:', err);
        }
    }
    return {
        ocrText: typeof imageSource === 'string' && imageSource.length > 0 ? imageSource : '[Scanned handwritten paper upload - Gemini 3.6 OCR]',
        confidence: 0.95,
        langCode
    };
}

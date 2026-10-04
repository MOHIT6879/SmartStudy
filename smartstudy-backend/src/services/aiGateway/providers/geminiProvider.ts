import { AIProvider, CompletionRequest, CompletionResponse } from '../types.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  readonly defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  isAvailable(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && !key.includes('your_gemini_api_key'));
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiProvider] GEMINI_API_KEY is not configured.');
    }

    const modelName = request.preferredModel || this.defaultModel;
    const startTime = Date.now();

    const parts: any[] = [{ text: request.prompt }];

    // Handle optional image attachments
    if (request.imageBuffers && request.imageBuffers.length > 0) {
      const mimeType = request.imageMimeType || 'image/jpeg';
      for (const buf of request.imageBuffers) {
        if (buf && buf.length > 0) {
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: buf.toString('base64')
            }
          });
        }
      }
    }

    const payload: any = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens || 32768,
        temperature: typeof request.temperature === 'number' ? request.temperature : 0.2,
        // Zero thinking budget eliminates wasted reasoning tokens and latency spikes for structured tasks
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    if (request.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: request.systemInstruction }]
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[GeminiProvider] HTTP ${res.status}: ${errText.substring(0, 300)}`);
    }

    const data = await res.json() as any;
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';
    const finishReason = candidate?.finishReason || 'STOP';

    const usageMetadata = data?.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const thoughtsTokens = usageMetadata.thoughtsTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || (promptTokens + completionTokens + thoughtsTokens);

    return {
      text,
      provider: 'gemini',
      model: modelName,
      latencyMs,
      finishReason,
      usage: {
        promptTokens,
        completionTokens,
        thoughtsTokens,
        totalTokens
      }
    };
  }
}

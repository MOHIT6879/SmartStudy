import { AIProvider, CompletionRequest, CompletionResponse } from '../types.js';
import { callSarvamChatApi } from '../../sarvamService.js';
import { estimateTokens } from '../tokenOptimizer.js';

export class SarvamProvider implements AIProvider {
  readonly name = 'sarvam' as const;
  readonly defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel || process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';
  }

  isAvailable(): boolean {
    const key = process.env.SARVAM_API_KEY;
    return Boolean(key && !key.includes('your_sarvam_api_key'));
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();
    const modelName = request.preferredModel || this.defaultModel;

    const fullPrompt = request.systemInstruction 
      ? `${request.systemInstruction}\n\n${request.prompt}`
      : request.prompt;

    const text = await callSarvamChatApi(fullPrompt, 2, {
      temperature: request.temperature ?? 0.2,
      maxTokens: request.maxOutputTokens || 8192
    });

    const latencyMs = Date.now() - startTime;

    if (!text) {
      throw new Error(`[SarvamProvider] Failed to generate response from model ${modelName}.`);
    }

    const promptTokens = estimateTokens(fullPrompt, true);
    const completionTokens = estimateTokens(text, true);

    return {
      text,
      provider: 'sarvam',
      model: modelName,
      latencyMs,
      finishReason: 'STOP',
      usage: {
        promptTokens,
        completionTokens,
        thoughtsTokens: 0,
        totalTokens: promptTokens + completionTokens
      }
    };
  }
}

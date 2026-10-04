import { AIProvider, AIProviderName, CompletionRequest, CompletionResponse } from './types.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { SarvamProvider } from './providers/sarvamProvider.js';
import { minifyPrompt } from './tokenOptimizer.js';

export class AIGateway {
  private providers: Map<AIProviderName, AIProvider> = new Map();

  constructor() {
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new SarvamProvider());
  }

  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: AIProviderName): AIProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Determine primary and fallback provider based on task type and language
   */
  private resolveRouting(request: CompletionRequest): { primary: AIProvider; fallback?: AIProvider } {
    const gemini = this.providers.get('gemini');
    const sarvam = this.providers.get('sarvam');

    const targetLang = (request.targetLanguage || '').toLowerCase();
    const isIndic = ['hindi', 'telugu', 'tamil', 'marathi', 'kannada', 'bengali', 'gujarati'].some(
      l => targetLang.includes(l)
    );

    // Indic languages: Route to Sarvam first if available, with Gemini fallback
    if (isIndic && sarvam && sarvam.isAvailable()) {
      return {
        primary: sarvam,
        fallback: gemini && gemini.isAvailable() ? gemini : undefined
      };
    }

    // Default primary is Gemini (fast, high throughput, zero thinking budget)
    if (gemini && gemini.isAvailable()) {
      return {
        primary: gemini,
        fallback: sarvam && sarvam.isAvailable() ? sarvam : undefined
      };
    }

    // Fallback if Gemini is not configured
    if (sarvam && sarvam.isAvailable()) {
      return { primary: sarvam };
    }

    throw new Error('[AIGateway] No available AI providers configured (check GEMINI_API_KEY / SARVAM_API_KEY).');
  }

  /**
   * High-speed, in-memory execution with zero latency overhead (< 0.1ms dispatch)
   * and automatic failover cascade
   */
  async execute(request: CompletionRequest): Promise<CompletionResponse> {
    // 1. Minify prompt to save tokens
    const optimizedRequest: CompletionRequest = {
      ...request,
      prompt: minifyPrompt(request.prompt),
      systemInstruction: request.systemInstruction ? minifyPrompt(request.systemInstruction) : undefined
    };

    const { primary, fallback } = this.resolveRouting(optimizedRequest);

    try {
      const response = await primary.generateCompletion(optimizedRequest);
      this.logTelemetry(optimizedRequest, response);
      return response;
    } catch (primaryErr: any) {
      console.warn(`⚠️ [AI GATEWAY] Primary provider (${primary.name}) failed:`, primaryErr?.message || primaryErr);

      if (fallback) {
        console.log(`🔄 [AI GATEWAY] Triggering automatic failover to ${fallback.name}...`);
        try {
          const fallbackResponse = await fallback.generateCompletion(optimizedRequest);
          this.logTelemetry(optimizedRequest, fallbackResponse, true);
          return fallbackResponse;
        } catch (fallbackErr: any) {
          console.error(`❌ [AI GATEWAY] Fallback provider (${fallback.name}) also failed:`, fallbackErr?.message || fallbackErr);
          throw fallbackErr;
        }
      }

      throw primaryErr;
    }
  }

  private logTelemetry(request: CompletionRequest, response: CompletionResponse, isFallback = false): void {
    const tag = isFallback ? '🔄 [AI GATEWAY FAILOVER]' : '🚀 [AI GATEWAY]';
    console.log(
      `${tag} Task: "${request.taskType}" | Provider: ${response.provider} (${response.model}) | ` +
      `Latency: ${response.latencyMs}ms | Tokens: ${response.usage.totalTokens} ` +
      `(Prompt: ${response.usage.promptTokens}, Out: ${response.usage.completionTokens})`
    );
  }
}

// Global singleton instance for maximum performance and connection reuse
export const aiGateway = new AIGateway();

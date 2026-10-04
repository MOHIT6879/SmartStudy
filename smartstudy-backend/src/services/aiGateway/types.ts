/**
 * SmartStudy AI Gateway: Unified Types & Provider Interfaces
 */

export type AITaskType = 
  | 'exam_generation'
  | 'metadata_extraction'
  | 'answer_grading'
  | 'vision_ocr'
  | 'general_chat';

export type AIProviderName = 'gemini' | 'sarvam' | 'openai';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
}

export interface CompletionRequest {
  taskType: AITaskType;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: 'json' | 'text';
  targetLanguage?: string;
  preferredModel?: string;
  imageBuffers?: Buffer[];
  imageMimeType?: string;
  // Optional metadata for logging/tracking
  metadata?: Record<string, any>;
}

export interface CompletionResponse {
  text: string;
  parsedJson?: any;
  usage: TokenUsage;
  provider: AIProviderName;
  model: string;
  latencyMs: number;
  finishReason?: string;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly defaultModel: string;
  isAvailable(): boolean;
  generateCompletion(request: CompletionRequest): Promise<CompletionResponse>;
}

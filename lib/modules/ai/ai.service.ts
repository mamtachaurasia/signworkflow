import { createHash } from 'crypto';

import { AIProvider, AIProviderType, type RiskAnalysisResult, type WritingAssistMode } from './ai-provider.interface';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { sanitizeInput, sanitizeWritingInput, validateUserInput } from './sanitization';
import { chunkText } from './chunking.service';
import {
  assertWritingPlaceholderIntegrity,
  normalizeNewWritingSmartVariables,
  WritingAssistantInputError,
  WritingAssistantProviderError,
} from './writing-assistant';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 500;
const AI_CACHE = new Map<string, CacheEntry<unknown>>();

function normalizeProviderType(providerType?: string | null): AIProviderType {
  switch ((providerType || '').trim().toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return 'anthropic';
    case 'gemini':
      return 'gemini';
    case 'openai':
    case '':
      return 'openai';
    default:
      throw new Error(`Unknown AI provider: ${providerType}`);
  }
}

function getDefaultProviderType(): AIProviderType {
  return normalizeProviderType(process.env.AI_PROVIDER);
}

export class AIService {
  private provider: AIProvider;
  private providerType: AIProviderType;

  constructor(provider?: AIProvider, providerType: AIProviderType = 'openai') {
    this.providerType = providerType;
    this.provider = provider || this.createProvider(providerType);
  }

  private createProvider(type: AIProviderType): AIProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
      case 'claude':
        return new AnthropicProvider();
      case 'gemini':
        return new GeminiProvider();
      default:
        throw new Error(`Unknown provider: ${type}`);
    }
  }

  private getCacheKey(action: string, text: string, ...params: unknown[]): string {
    const payload = JSON.stringify({ action, provider: this.providerType, text, params });
    return `ai:${createHash('sha256').update(payload).digest('hex')}`;
  }

  private pruneCache(now = Date.now()): void {
    for (const [key, entry] of AI_CACHE) {
      if (now - entry.timestamp > CACHE_TTL_MS) AI_CACHE.delete(key);
    }

    while (AI_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = AI_CACHE.keys().next().value;
      if (!oldestKey) break;
      AI_CACHE.delete(oldestKey);
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = AI_CACHE.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      AI_CACHE.delete(key);
      return null;
    }

    return entry.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    this.pruneCache();
    AI_CACHE.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  async summarizeSelection(text: string, language?: string): Promise<string> {
    const validation = validateUserInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitized = sanitizeInput(text);
    const cacheKey = this.getCacheKey('summarize_selection', sanitized, language);
    const cached = this.getFromCache<string>(cacheKey);
    if (cached) return cached;

    const response = await this.provider.summarize(sanitized, { maxLength: 300, language });
    this.setCache(cacheKey, response.result);
    return response.result;
  }

  async summarizeDocument(text: string, language?: string, maxLength = 500): Promise<{
    chunks: Array<{ index: number; summary: string; progress: string }>;
    fullSummary: string;
  }> {
    const validation = validateUserInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitized = sanitizeInput(text);
    const cacheKey = this.getCacheKey('summarize_document', sanitized, language, maxLength);
    const cached = this.getFromCache<{
      chunks: Array<{ index: number; summary: string; progress: string }>;
      fullSummary: string;
    }>(cacheKey);
    if (cached) return cached;

    const chunks = chunkText(sanitized, 3000);
    const results: Array<{ index: number; summary: string; progress: string }> = [];

    for (const chunk of chunks) {
      const response = await this.provider.summarize(chunk.text, { maxLength, language });
      results.push({
        index: chunk.index,
        summary: response.result,
        progress: `${chunk.index + 1}/${chunks.length}`,
      });
    }

    const fullSummary = results.map((r) => r.summary).join('\n\n');
    const result = { chunks: results, fullSummary };
    this.setCache(cacheKey, result);
    return result;
  }

  async translateSelection(text: string, targetLanguage: string): Promise<string> {
    const validation = validateUserInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitized = sanitizeInput(text);
    const cacheKey = this.getCacheKey('translate_selection', sanitized, targetLanguage);
    const cached = this.getFromCache<string>(cacheKey);
    if (cached) return cached;

    const response = await this.provider.translate(sanitized, targetLanguage);
    this.setCache(cacheKey, response.result);
    return response.result;
  }

  async translateDocument(text: string, targetLanguage: string): Promise<{
    chunks: Array<{ index: number; translation: string; progress: string }>;
    fullTranslation: string;
  }> {
    const validation = validateUserInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitized = sanitizeInput(text);
    const cacheKey = this.getCacheKey('translate_document', sanitized, targetLanguage);
    const cached = this.getFromCache<{
      chunks: Array<{ index: number; translation: string; progress: string }>;
      fullTranslation: string;
    }>(cacheKey);
    if (cached) return cached;

    const chunks = chunkText(sanitized, 3000);
    const results: Array<{ index: number; translation: string; progress: string }> = [];

    for (const chunk of chunks) {
      const response = await this.provider.translate(chunk.text, targetLanguage);
      results.push({
        index: chunk.index,
        translation: response.result,
        progress: `${chunk.index + 1}/${chunks.length}`,
      });
    }

    const fullTranslation = results.map((r) => r.translation).join('\n\n');
    const result = { chunks: results, fullTranslation };
    this.setCache(cacheKey, result);
    return result;
  }

  async explainClause(text: string, context?: string): Promise<string> {
    const validation = validateUserInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitized = sanitizeInput(text);
    const sanitizedContext = context ? sanitizeInput(context) : undefined;
    const cacheKey = this.getCacheKey('explain_clause', sanitized, sanitizedContext);
    const cached = this.getFromCache<string>(cacheKey);
    if (cached) return cached;

    const response = await this.provider.explainClause(sanitized, { context: sanitizedContext });
    this.setCache(cacheKey, response.result);
    return response.result;
  }

  async analyzeRisk(text: string): Promise<RiskAnalysisResult> {
    const validation = validateUserInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitized = sanitizeInput(text);
    const cacheKey = this.getCacheKey('analyze_risk', sanitized);
    const cached = this.getFromCache<RiskAnalysisResult>(cacheKey);
    if (cached) return cached;

    const response = await this.provider.analyzeRisk(sanitized);
    this.setCache(cacheKey, response.result);
    return response.result;
  }

  async assistWriting(
    text: string,
    instruction: string,
    mode: WritingAssistMode,
    options: { allowNewVariables?: boolean } = {}
  ): Promise<string> {
    const source = sanitizeWritingInput(
      text.trim() || 'Draft new agreement language from the user instruction.'
    );
    const validation = validateUserInput(source);
    if (!validation.valid) {
      throw new WritingAssistantInputError(validation.error || 'Invalid editable text');
    }

    const instructionText = instruction.trim() || 'Improve this agreement language';
    const sanitizedInstruction = sanitizeInput(instructionText);
    const instructionValidation = validateUserInput(sanitizedInstruction);
    if (!instructionValidation.valid) {
      throw new WritingAssistantInputError(instructionValidation.error || 'Invalid writing instruction');
    }
    const providerInstruction = options.allowNewVariables
      ? `${sanitizedInstruction}\n\nUse Smart variables for details the user may need to set later. Use only lowercase snake_case names inside double braces, for example {{seller_name}} or {{sale_price}}.`
      : sanitizedInstruction;

    // Template text is tenant-sensitive. Writing suggestions deliberately bypass the
    // process-wide AI cache so a result can never be reused across template owners.
    let suggestion: string;
    try {
      const response = await this.provider.assistWriting(source, providerInstruction, mode);
      suggestion = String(response.result || '').trim();
      if (!suggestion) {
        throw new Error('The AI provider returned an empty writing suggestion.');
      }
    } catch (error) {
      throw new WritingAssistantProviderError(error);
    }

    if (options.allowNewVariables) {
      suggestion = normalizeNewWritingSmartVariables(source, suggestion);
    }
    assertWritingPlaceholderIntegrity(source, suggestion, options);
    return suggestion;
  }

  clearCache(): void {
    AI_CACHE.clear();
  }

  getCacheStats(): { size: number; entries: number } {
    return {
      size: AI_CACHE.size,
      entries: AI_CACHE.size,
    };
  }
}

const aiServiceInstances = new Map<AIProviderType, AIService>();

export function getAIService(providerType?: AIProviderType): AIService {
  const resolvedProviderType = normalizeProviderType(providerType || getDefaultProviderType());
  const existing = aiServiceInstances.get(resolvedProviderType);
  if (existing) {
    return existing;
  }

  const aiService = new AIService(undefined, resolvedProviderType);
  aiServiceInstances.set(resolvedProviderType, aiService);
  return aiService;
}

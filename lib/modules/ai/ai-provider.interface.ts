export interface RiskAnalysisResult {
  risks: Array<{
    category: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    recommendation?: string;
  }>;
  overallRiskLevel: 'low' | 'medium' | 'high';
}

export interface SummarizeOptions {
  maxLength?: number;
  format?: 'bullet_points' | 'paragraph';
  language?: string;
}

export interface TranslateOptions {
  sourceLanguage?: string;
}

export interface ExplainOptions {
  context?: string;
  detailedLevel?: 'basic' | 'detailed';
}

export interface AnalyzeRiskOptions {
  focusAreas?: string[];
}

export type WritingAssistMode = 'draft' | 'rewrite' | 'professional' | 'concise' | 'plain_language' | 'grammar';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface AIResponse<T> {
  result: T;
  tokens: TokenUsage;
  processingTimeMs: number;
  provider: string;
  model: string;
}

export interface AIProvider {
  summarize(
    text: string,
    options?: SummarizeOptions
  ): Promise<AIResponse<string>>;

  translate(
    text: string,
    targetLanguage: string,
    options?: TranslateOptions
  ): Promise<AIResponse<string>>;

  explainClause(
    text: string,
    options?: ExplainOptions
  ): Promise<AIResponse<string>>;

  analyzeRisk(
    text: string,
    options?: AnalyzeRiskOptions
  ): Promise<AIResponse<RiskAnalysisResult>>;
  assistWriting(text: string, instruction: string, mode: WritingAssistMode): Promise<AIResponse<string>>;
}

export type AIProviderType = 'openai' | 'anthropic' | 'claude' | 'gemini';

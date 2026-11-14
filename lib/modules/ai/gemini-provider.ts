import {
  AIProvider,
  AIResponse,
  RiskAnalysisResult,
  SummarizeOptions,
  TranslateOptions,
  ExplainOptions,
  AnalyzeRiskOptions,
  WritingAssistMode,
} from './ai-provider.interface';
import {
  getSystemPrompt,
  buildSummarizePrompt,
  buildTranslatePrompt,
  buildExplainPrompt,
  buildRiskAnalysisPrompt,
  buildWritingAssistPrompt,
} from './prompt-templates';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_API_BASE_URL = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

type GeminiTextPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

type GeminiErrorResponse = {
  error?: {
    message?: string;
    status?: string;
  };
};

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private apiBaseUrl: string;

  constructor(apiKey?: string, model?: string, apiBaseUrl?: string) {
    const resolvedApiKey = (apiKey || GEMINI_API_KEY)?.trim();

    if (!resolvedApiKey) {
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY environment variable.');
    }

    this.apiKey = resolvedApiKey;
    this.model = model || GEMINI_MODEL;
    this.apiBaseUrl = (apiBaseUrl || GEMINI_API_BASE_URL).replace(/\/$/, '');
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<GeminiResponse> {
    const response = await fetch(`${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      let errorMessage = response.statusText || 'Unknown error';
      try {
        const error = (await response.json()) as GeminiErrorResponse;
        errorMessage = error.error?.message || error.error?.status || errorMessage;
      } catch {
        // Keep the status text when Gemini returns a non-JSON error.
      }
      throw new Error(`Gemini API error (${response.status}): ${errorMessage}`);
    }

    return response.json() as Promise<GeminiResponse>;
  }

  private extractText(response: GeminiResponse): string {
    const text = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim();

    if (!text) {
      const finishReason = response.candidates?.[0]?.finishReason;
      throw new Error(`Gemini API returned an empty response${finishReason ? ` (${finishReason})` : ''}.`);
    }

    return text;
  }

  private buildResponse<T>(result: T, response: GeminiResponse, startTime: number): AIResponse<T> {
    const input = response.usageMetadata?.promptTokenCount || 0;
    const output = response.usageMetadata?.candidatesTokenCount || 0;
    const total = response.usageMetadata?.totalTokenCount || input + output;

    return {
      result,
      tokens: {
        input,
        output,
        total,
      },
      processingTimeMs: Date.now() - startTime,
      provider: 'gemini',
      model: this.model,
    };
  }

  async summarize(text: string, options?: SummarizeOptions): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callGemini(
      getSystemPrompt('summarize'),
      buildSummarizePrompt(text, options?.maxLength, options?.language)
    );

    return this.buildResponse(this.extractText(response), response, startTime);
  }

  async translate(
    text: string,
    targetLanguage: string,
    options?: TranslateOptions
  ): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callGemini(
      getSystemPrompt('translate'),
      buildTranslatePrompt(text, targetLanguage, options?.sourceLanguage)
    );

    return this.buildResponse(this.extractText(response), response, startTime);
  }

  async explainClause(text: string, options?: ExplainOptions): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callGemini(
      getSystemPrompt('explain'),
      buildExplainPrompt(text, options?.context)
    );

    return this.buildResponse(this.extractText(response), response, startTime);
  }

  async analyzeRisk(text: string, options?: AnalyzeRiskOptions): Promise<AIResponse<RiskAnalysisResult>> {
    const startTime = Date.now();
    const focusHint = options?.focusAreas?.length
      ? `\n\nFocus especially on these areas: ${options.focusAreas.join(', ')}.`
      : '';
    const response = await this.callGemini(
      getSystemPrompt('analyzeRisk'),
      `${buildRiskAnalysisPrompt(text)}${focusHint}`
    );

    let result: RiskAnalysisResult;
    try {
      const content = this.extractText(response);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      result = JSON.parse(jsonMatch[0]) as RiskAnalysisResult;
    } catch {
      result = {
        risks: [
          {
            category: 'Parsing Error',
            severity: 'medium',
            description: 'Unable to parse AI response',
          },
        ],
        overallRiskLevel: 'medium',
      };
    }

    return this.buildResponse(result, response, startTime);
  }

  async assistWriting(text: string, instruction: string, mode: WritingAssistMode): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callGemini('You are a professional agreement-drafting assistant.', buildWritingAssistPrompt(text, instruction, mode));
    return this.buildResponse(this.extractText(response), response, startTime);
  }
}

import {
  AIProvider,
  AIResponse,
  SummarizeOptions,
  TranslateOptions,
  ExplainOptions,
  AnalyzeRiskOptions,
  RiskAnalysisResult,
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface AnthropicErrorResponse {
  error?: {
    message?: string;
  };
}

export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const resolvedApiKey = (apiKey || ANTHROPIC_API_KEY)?.trim();

    if (!resolvedApiKey) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
    }

    this.apiKey = resolvedApiKey;
    this.model = model || ANTHROPIC_MODEL;
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string): Promise<AnthropicResponse> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      try {
        const error = (await response.json()) as AnthropicErrorResponse;
        errorMessage = error.error?.message || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(`Anthropic API error: ${errorMessage}`);
    }

    return response.json() as Promise<AnthropicResponse>;
  }

  private buildResponse<T>(result: T, response: AnthropicResponse, startTime: number): AIResponse<T> {
    const input = response.usage?.input_tokens || 0;
    const output = response.usage?.output_tokens || 0;

    return {
      result,
      tokens: {
        input,
        output,
        total: input + output,
      },
      processingTimeMs: Date.now() - startTime,
      provider: 'anthropic',
      model: this.model,
    };
  }

  private extractText(response: AnthropicResponse): string {
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

  async summarize(text: string, options?: SummarizeOptions): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callAnthropic(
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
    const response = await this.callAnthropic(
      getSystemPrompt('translate'),
      buildTranslatePrompt(text, targetLanguage, options?.sourceLanguage)
    );

    return this.buildResponse(this.extractText(response), response, startTime);
  }

  async explainClause(text: string, options?: ExplainOptions): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callAnthropic(
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
    const response = await this.callAnthropic(
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
    const response = await this.callAnthropic('You are a professional agreement-drafting assistant.', buildWritingAssistPrompt(text, instruction, mode));
    return this.buildResponse(this.extractText(response), response, startTime);
  }
}

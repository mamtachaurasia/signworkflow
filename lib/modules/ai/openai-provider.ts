import {
  AIProvider,
  AIResponse,
  RiskAnalysisResult,
  SummarizeOptions,
  TranslateOptions,
  ExplainOptions,
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

type OpenAIErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const resolvedApiKey = (apiKey || OPENAI_API_KEY)?.trim();

    if (!resolvedApiKey) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    this.apiKey = resolvedApiKey;
    this.model = model || OPENAI_MODEL;
  }

  private async callOpenAI(messages: OpenAIMessage[]): Promise<OpenAIResponse> {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      let errorMessage = response.statusText || 'Unknown error';
      try {
        const error = (await response.json()) as OpenAIErrorResponse;
        errorMessage = error.error?.message || errorMessage;
      } catch {
        // Keep the status text when the provider returns a non-JSON error.
      }
      throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
    }

    return response.json();
  }

  async summarize(text: string, options?: SummarizeOptions): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const systemPrompt = getSystemPrompt('summarize');
    const userPrompt = buildSummarizePrompt(text, options?.maxLength, options?.language);

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = response.choices[0].message.content;
    const processingTimeMs = Date.now() - startTime;

    return {
      result,
      tokens: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
      processingTimeMs,
      provider: 'openai',
      model: this.model,
    };
  }

  async translate(
    text: string,
    targetLanguage: string,
    options?: TranslateOptions
  ): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const systemPrompt = getSystemPrompt('translate');
    const userPrompt = buildTranslatePrompt(text, targetLanguage, options?.sourceLanguage);

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = response.choices[0].message.content;
    const processingTimeMs = Date.now() - startTime;

    return {
      result,
      tokens: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
      processingTimeMs,
      provider: 'openai',
      model: this.model,
    };
  }

  async explainClause(text: string, options?: ExplainOptions): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const systemPrompt = getSystemPrompt('explain');
    const userPrompt = buildExplainPrompt(text, options?.context);

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = response.choices[0].message.content;
    const processingTimeMs = Date.now() - startTime;

    return {
      result,
      tokens: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
      processingTimeMs,
      provider: 'openai',
      model: this.model,
    };
  }

  async analyzeRisk(text: string): Promise<AIResponse<RiskAnalysisResult>> {
    const startTime = Date.now();
    const systemPrompt = getSystemPrompt('analyzeRisk');
    const userPrompt = buildRiskAnalysisPrompt(text);

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    let result: RiskAnalysisResult;
    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      result = JSON.parse(jsonMatch[0]);
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

    const processingTimeMs = Date.now() - startTime;

    return {
      result,
      tokens: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
      processingTimeMs,
      provider: 'openai',
      model: this.model,
    };
  }

  async assistWriting(text: string, instruction: string, mode: WritingAssistMode): Promise<AIResponse<string>> {
    const startTime = Date.now();
    const response = await this.callOpenAI([{ role: 'system', content: 'You are a professional agreement-drafting assistant.' }, { role: 'user', content: buildWritingAssistPrompt(text, instruction, mode) }]);
    return { result: response.choices[0].message.content.trim(), tokens: { input: response.usage.prompt_tokens, output: response.usage.completion_tokens, total: response.usage.total_tokens }, processingTimeMs: Date.now() - startTime, provider: 'openai', model: this.model };
  }
}

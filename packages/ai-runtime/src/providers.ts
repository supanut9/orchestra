import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama' | 'openrouter';

export interface AnthropicConfig {
  providerId: 'anthropic';
  apiKey: string;
  model?: string;
}

export interface OpenAIConfig {
  providerId: 'openai';
  apiKey: string;
  model?: string;
}

export interface GoogleConfig {
  providerId: 'google';
  apiKey: string;
  model?: string;
}

export interface OllamaConfig {
  providerId: 'ollama';
  baseUrl?: string;
  model?: string;
}

export interface OpenRouterConfig {
  providerId: 'openrouter';
  apiKey: string;
  model?: string;
}

export type ProviderConfig =
  | AnthropicConfig
  | OpenAIConfig
  | GoogleConfig
  | OllamaConfig
  | OpenRouterConfig;

export const defaultModels: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  ollama: 'llama3.2',
  openrouter: 'anthropic/claude-sonnet-4-5',
};

export function createProvider(config: ProviderConfig): LanguageModel {
  switch (config.providerId) {
    case 'anthropic': {
      const provider = createAnthropic({ apiKey: config.apiKey });
      return provider(config.model ?? defaultModels.anthropic);
    }
    case 'openai': {
      const provider = createOpenAI({ apiKey: config.apiKey });
      return provider(config.model ?? defaultModels.openai);
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return provider(config.model ?? defaultModels.google);
    }
    case 'ollama': {
      const provider = createOpenAICompatible({
        name: 'ollama',
        baseURL: config.baseUrl ?? 'http://localhost:11434/v1',
        apiKey: 'ollama',
      });
      return provider(config.model ?? defaultModels.ollama);
    }
    case 'openrouter': {
      const provider = createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
      });
      return provider(config.model ?? defaultModels.openrouter);
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

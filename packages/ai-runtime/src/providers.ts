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

/** Default model IDs per provider — the recommended starting model. */
export const defaultModels: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-4-7',
  openai: 'gpt-4o',
  google: 'gemini-2.5-pro',
  ollama: 'llama3.2',
  openrouter: 'anthropic/claude-sonnet-4-7',
};

/** Recommended model lists per provider (UI picker). */
export const providerModels: Record<ProviderId, string[]> = {
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-7',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-3-5-haiku-20241022',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  ollama: ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'codellama', 'qwen2.5-coder'],
  openrouter: [
    'anthropic/claude-sonnet-4-7',
    'openai/gpt-4o',
    'google/gemini-2.5-pro',
    'meta-llama/llama-3.3-70b-instruct',
    'mistralai/mistral-large',
  ],
};

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

/** List all supported providers with capability flags. */
export function listAvailableProviders(): ProviderInfo[] {
  return [
    { id: 'anthropic', name: 'Anthropic', supportsTools: true, supportsStreaming: true },
    { id: 'openai', name: 'OpenAI', supportsTools: true, supportsStreaming: true },
    { id: 'google', name: 'Google Gemini', supportsTools: true, supportsStreaming: true },
    { id: 'ollama', name: 'Ollama (local)', supportsTools: false, supportsStreaming: true },
    { id: 'openrouter', name: 'OpenRouter', supportsTools: true, supportsStreaming: true },
  ];
}

/** Instantiate a Vercel AI SDK LanguageModel for the given config. */
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
        headers: {
          'HTTP-Referer': 'https://orchestra-ide.dev',
          'X-Title': 'Orchestra IDE',
        },
      });
      return provider(config.model ?? defaultModels.openrouter);
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

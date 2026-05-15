import { streamText } from 'ai';
import type { LanguageModel } from 'ai';
import { nanoid } from 'nanoid';
import type { Message, Tool } from './types.js';

export interface AgentSessionOptions {
  provider: LanguageModel;
  systemPrompt?: string;
  tools?: Tool[];
  onMemory?: (messages: Message[]) => Promise<void>;
}

export class AgentSession {
  readonly id: string;
  readonly provider: LanguageModel;
  readonly systemPrompt: string;
  readonly tools: Tool[];
  messages: Message[];
  private readonly onMemory?: (messages: Message[]) => Promise<void>;

  constructor(opts: AgentSessionOptions) {
    this.id = nanoid();
    this.provider = opts.provider;
    this.systemPrompt = opts.systemPrompt ?? 'You are a helpful AI assistant.';
    this.tools = opts.tools ?? [];
    this.messages = [];
    if (opts.onMemory) {
      this.onMemory = opts.onMemory;
    }
  }

  /**
   * Run a single user turn, collecting the full streamed response.
   * Returns the complete assistant response text.
   */
  async run(prompt: string): Promise<string> {
    let fullText = '';
    await this.stream(prompt, (chunk) => {
      fullText += chunk;
    });
    return fullText;
  }

  /**
   * Stream a single user turn, calling onChunk for each text delta.
   * Persists both the user and assistant messages into the history.
   */
  async stream(prompt: string, onChunk: (text: string) => void): Promise<void> {
    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content: prompt,
      createdAt: new Date(),
    };
    this.messages.push(userMessage);

    const aiMessages = this.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const result = streamText({
      model: this.provider,
      system: this.systemPrompt,
      messages: aiMessages,
    });

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
      onChunk(chunk);
    }

    const assistantMessage: Message = {
      id: nanoid(),
      role: 'assistant',
      content: fullText,
      createdAt: new Date(),
    };
    this.messages.push(assistantMessage);

    if (this.onMemory) {
      await this.onMemory(this.messages);
    }
  }

  /** Clear all conversation history without destroying the session. */
  clear(): void {
    this.messages = [];
  }

  /** Alias kept for backwards compatibility. */
  reset(): void {
    this.clear();
  }
}

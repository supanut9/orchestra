import { streamText } from 'ai';
import type { LanguageModel, ToolCallPart, ToolResultPart } from 'ai';
import { nanoid } from 'nanoid';
import type { Message, Tool } from './types.js';

export interface AgentSessionOptions {
  provider: LanguageModel;
  systemPrompt?: string;
  tools?: Tool[];
  onMemory?: (messages: Message[]) => Promise<void>;
}

// ── Tool-call event types ──────────────────────────────────────────────────────

/**
 * Emitted when the model decides to invoke a tool.
 * The tool has been called but the result has not yet arrived.
 */
export interface ToolCallEvent {
  toolCallId: string;
  toolName: string;
  /** Raw args object as parsed from the model output. */
  args: Record<string, unknown>;
}

/**
 * Emitted when a tool call resolves (or rejects) with a result.
 */
export interface ToolResultEvent {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

// ── Extended stream options ────────────────────────────────────────────────────

export interface StreamOptions {
  /** Called for each text delta emitted by the model. */
  onChunk?: (text: string) => void;
  /** Called when a tool invocation starts (before execution). */
  onToolCall?: (event: ToolCallEvent) => void;
  /** Called when a tool invocation completes. */
  onToolResult?: (event: ToolResultEvent) => void;
  /** AbortSignal to cancel the stream. */
  signal?: AbortSignal;
}

export class AgentSession {
  readonly id: string;
  readonly provider: LanguageModel;
  readonly systemPrompt: string;
  /**
   * Vercel AI SDK tool map — keys are tool names, values are `Tool` objects
   * returned by `tool()`. The local `Tool` type in types.ts is kept for
   * backwards-compat but the agent now accepts the Vercel SDK format too.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly sdkTools: Record<string, any> | undefined;
  /** Legacy tool list — kept for API compatibility. */
  readonly tools: Tool[];
  messages: Message[];
  private readonly onMemory?: (messages: Message[]) => Promise<void>;

  constructor(
    opts: AgentSessionOptions & {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sdkTools?: Record<string, any>;
    },
  ) {
    this.id = nanoid();
    this.provider = opts.provider;
    this.systemPrompt = opts.systemPrompt ?? 'You are a helpful AI assistant.';
    this.tools = opts.tools ?? [];
    this.sdkTools = opts.sdkTools;
    this.messages = [];
    if (opts.onMemory) {
      this.onMemory = opts.onMemory;
    }
  }

  /**
   * Run a single user turn, collecting the full streamed response.
   * Returns the complete assistant response text.
   */
  async run(
    prompt: string,
    opts?: Pick<StreamOptions, 'onToolCall' | 'onToolResult'>,
  ): Promise<string> {
    let fullText = '';
    const streamOpts: StreamOptions = {
      onChunk: (chunk) => {
        fullText += chunk;
      },
    };
    if (opts?.onToolCall) streamOpts.onToolCall = opts.onToolCall;
    if (opts?.onToolResult) streamOpts.onToolResult = opts.onToolResult;
    await this.stream(prompt, streamOpts);
    return fullText;
  }

  /**
   * Stream a single user turn, calling onChunk for each text delta.
   * If sdkTools are registered the model will loop (up to maxSteps) to handle
   * tool calls automatically, firing onToolCall / onToolResult each round.
   * Persists both the user and assistant messages into the history.
   */
  async stream(prompt: string, opts: StreamOptions | ((text: string) => void)): Promise<void> {
    // Back-compat: allow plain onChunk callback as second arg
    const options: StreamOptions = typeof opts === 'function' ? { onChunk: opts } : opts;
    const { onChunk, onToolCall, onToolResult, signal } = options;

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

    const hasTools = this.sdkTools && Object.keys(this.sdkTools).length > 0;

    const result = streamText({
      model: this.provider,
      system: this.systemPrompt,
      messages: aiMessages,
      ...(hasTools ? { tools: this.sdkTools } : {}),
      // Allow up to 5 agentic steps (tool calls) per turn; prevents runaway loops.
      ...(hasTools ? { maxSteps: 5 } : {}),
      ...(signal ? { abortSignal: signal } : {}),
    });

    let fullText = '';

    // Stream text deltas
    for await (const chunk of result.textStream) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk?.(chunk);
    }

    // Process tool calls / results from the completed steps
    if (hasTools) {
      try {
        const steps = await result.steps;
        for (const step of steps) {
          // Fire onToolCall for each tool invocation in this step
          if (onToolCall && step.toolCalls) {
            for (const tc of step.toolCalls as ToolCallPart[]) {
              onToolCall({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args as Record<string, unknown>,
              });
            }
          }
          // Fire onToolResult for each result
          if (onToolResult && step.toolResults) {
            for (const tr of step.toolResults as ToolResultPart[]) {
              onToolResult({
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                result: tr.result,
              });
            }
          }
        }
      } catch {
        // Steps may not resolve if the stream was aborted — ignore silently.
      }
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

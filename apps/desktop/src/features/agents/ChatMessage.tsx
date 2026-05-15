import type { ChatMessage as ChatMessageType } from '@/stores/agent';

interface Props {
  message: ChatMessageType;
}

/**
 * ChatMessage — a single styled message bubble for the agent chat panel.
 * User messages are right-aligned; assistant messages are left-aligned.
 */
export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
      data-role={message.role}
    >
      {/* Avatar (assistant only) */}
      {isAssistant && (
        <div className="w-6 h-6 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] flex items-center justify-center shrink-0 mt-0.5 mr-2 select-none font-bold">
          A
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-br-sm'
            : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-bl-sm'
        }`}
      >
        <span className="whitespace-pre-wrap break-words">{message.content}</span>

        {/* Streaming cursor */}
        {message.streaming && (
          <span className="inline-block w-0.5 h-4 bg-current ml-0.5 align-middle animate-pulse" />
        )}
      </div>

      {/* Avatar (user only — right side) */}
      {isUser && (
        <div className="w-6 h-6 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] text-[10px] flex items-center justify-center shrink-0 mt-0.5 ml-2 select-none font-bold">
          U
        </div>
      )}
    </div>
  );
}

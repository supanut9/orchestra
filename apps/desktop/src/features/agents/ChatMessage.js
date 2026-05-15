import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ChatMessage — a single styled message bubble for the agent chat panel.
 * User messages are right-aligned; assistant messages are left-aligned.
 */
export function ChatMessage({ message }) {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    return (_jsxs("div", { className: `flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-3`, "data-role": message.role, children: [isAssistant && (_jsx("div", { className: "w-6 h-6 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] flex items-center justify-center shrink-0 mt-0.5 mr-2 select-none font-bold", children: "A" })), _jsxs("div", { className: `max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${isUser
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-br-sm'
                    : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-bl-sm'}`, children: [_jsx("span", { className: "whitespace-pre-wrap break-words", children: message.content }), message.streaming && (_jsx("span", { className: "inline-block w-0.5 h-4 bg-current ml-0.5 align-middle animate-pulse" }))] }), isUser && (_jsx("div", { className: "w-6 h-6 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] text-[10px] flex items-center justify-center shrink-0 mt-0.5 ml-2 select-none font-bold", children: "U" }))] }));
}

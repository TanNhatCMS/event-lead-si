'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AlertCircle, Bot, Send, Square, User } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

import { BasicMarkdown } from './markdown';
import { citationChipLabel, extractCitations, type Citation } from './citation';

export type ChatMessage = UIMessage<unknown, { citations: Citation[] }>;

function messageText(message: ChatMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

type Props = {
  /** Id hội thoại hiện tại; null = đoạn chat mới (tạo lười khi gửi tin đầu). */
  conversationId: string | null;
  /** Tin nhắn đã lưu (hydrate khi mở lại đoạn cũ). */
  initialMessages: ChatMessage[];
  /** Tạo hội thoại mới với tiêu đề = 60 ký tự đầu của tin nhắn, trả về id. */
  onCreateConversation: (firstText: string) => Promise<string>;
  /** Gọi khi stream kết thúc (để parent refresh sidebar). */
  onStreamFinished: () => void;
};

/**
 * Khung chat streaming: POST /api/chat qua useChat + DefaultChatTransport
 * (AI SDK v7). Render markdown cơ bản + chip trích dẫn theo QĐ3.
 */
export function ChatWindow({
  conversationId,
  initialMessages,
  onCreateConversation,
  onStreamFinished,
}: Props) {
  const [convId, setConvId] = useState<string | null>(conversationId);
  const convIdRef = useRef<string | null>(conversationId);
  convIdRef.current = convId;

  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => {
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          return {
            body: {
              conversation_id: convIdRef.current,
              messages: [{ role: 'user', content: messageText(lastUser as ChatMessage) }],
              top_k: 8,
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop, clearError } = useChat<ChatMessage>({
    transport,
    messages: initialMessages,
    onFinish: () => onStreamFinished(),
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    clearError();
    try {
      if (!convIdRef.current) {
        setCreating(true);
        const id = await onCreateConversation(text);
        setConvId(id);
        convIdRef.current = id;
      }
      setInput('');
      await sendMessage({ text });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 pb-4">
        {messages.length === 0 ? (
          <EmptyState onSuggestion={(text) => setInput(text)} />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5 py-2">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} streaming={busy} />
            ))}
            {busy && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Đang suy nghĩ…
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {error.message || 'Chưa gửi được tin nhắn, vui lòng thử lại.'}
          </span>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Đóng
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit(event as unknown as React.FormEvent);
              }
            }}
            placeholder="Hỏi về tài liệu, bảng giá, danh bạ…"
            rows={1}
            disabled={busy || creating}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button type="button" variant="secondary" size="icon" onClick={stop} aria-label="Dừng">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || creating}
              aria-label="Gửi"
            >
              {creating ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Trợ lý chỉ trả lời dựa trên tài liệu và danh bạ của bạn, kèm nguồn trích dẫn.
        </p>
      </form>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === 'user';
  const text = messageText(message);
  const citations = useMemo(() => extractCitations(message.parts as unknown[]), [message.parts]);

  if (isUser) {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <BasicMarkdown text={text} />
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-xs">
          {text ? (
            <BasicMarkdown text={text} />
          ) : (
            streaming && <Spinner className="h-4 w-4" />
          )}
        </div>
        {citations.length > 0 && (
          <div className="mt-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nguồn tham khảo</p>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((citation, idx) => (
                <span
                  key={`${citation.source_id}-${citation.index ?? idx}`}
                  title={citation.snippet}
                  className="inline-flex max-w-full items-center truncate rounded-full border bg-muted/60 px-2.5 py-1 text-xs"
                >
                  <span className="truncate">{citationChipLabel(citation)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Bảng giá mới nhất của sản phẩm A là bao nhiêu?',
  'Tóm tắt hồ sơ năng lực công ty giúp tôi.',
  'Ai là người phụ trách công ty X?',
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Xin chào, tôi là Trợ lý EventLead</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tải tài liệu lên rồi hỏi tôi nhé — tôi tra cứu trong tài liệu và danh bạ của bạn,
          mọi câu trả lời đều kèm nguồn trích dẫn.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className={cn(
              'rounded-lg border px-4 py-2.5 text-left text-sm transition-colors',
              'hover:bg-muted',
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

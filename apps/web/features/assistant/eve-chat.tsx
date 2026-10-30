'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Send, Square } from 'lucide-react';

import { useEveAgent } from 'eve/react';
import type { EveMessage, EveMessagePart } from 'eve/react';

import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

/**
 * Khung chat với Eve agent (kênh HTTP mặc định của eve, mount bởi `withEve`
 * tại /eve/v1 — xem agent/channels/eve.ts).
 *
 * Giao thức client: dùng hook chính thức `useEveAgent` của package `eve/react`
 * (docs node_modules/eve/docs/guides/frontend/overview.mdx + channels/eve.mdx):
 * - POST /eve/v1/session (tạo phiên, kèm tin nhắn đầu nếu có)
 * - POST /eve/v1/session/:id (lượt tiếp theo)
 * - GET  /eve/v1/session/:id/stream (stream sự kiện NDJSON)
 *
 * Auth: fetch cùng origin nên trình duyệt tự gửi cookie phiên Supabase;
 * AuthFn `supabaseSession()` (lib/eve/supabase-auth.ts) đọc token từ cookie
 * `sb-<ref>-auth-token` — KHÔNG cần gắn header Bearer thủ công.
 *
 * Phiên eve là durable trên server: lưu cursor phiên ({sessionId,
 * streamIndex}) vào sessionStorage để giữ hội thoại khi người dùng chuyển tab
 * rồi quay lại — mount lại với `resume: true` sẽ replay stream và dựng lại
 * lịch sử (docs "Resumable sessions").
 */

const STORAGE_KEY = 'eventlead-eve-chat-session';

interface StoredSession {
  sessionId: string;
  streamIndex: number;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    if (
      parsed &&
      typeof parsed.sessionId === 'string' &&
      parsed.sessionId.length > 0 &&
      typeof parsed.streamIndex === 'number' &&
      Number.isFinite(parsed.streamIndex)
    ) {
      return { sessionId: parsed.sessionId, streamIndex: parsed.streamIndex };
    }
  } catch {
    // storage đầy / disabled — bắt đầu hội thoại mới.
  }
  return null;
}

/** Nhãn tool call thân thiện với người dùng (docs: dùng label thay toolName). */
function toolLabel(part: EveMessagePart & { type: 'dynamic-tool' }): string {
  const meta = part.toolMetadata?.eve;
  if (!meta) return part.toolName;
  const name = meta.name ? 'eve__' + meta.name : part.toolName;
  return meta.label ?? name;
}

function ToolPart({ part }: { part: EveMessagePart & { type: 'dynamic-tool' } }) {
  const label = toolLabel(part);
  const done = part.state === 'output-available';
  const failed = part.state === 'output-error';
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs',
        failed
          ? 'border-red-300 text-red-600'
          : 'border-border text-muted-foreground',
      )}
    >
      {done || failed ? null : <Spinner className="size-3" />}
      <span>
        {failed ? 'Lỗi tool: ' : done ? 'Đã dùng tool: ' : 'Đang gọi tool: '}
        <code className="font-mono">{label}</code>
      </span>
    </div>
  );
}

function MessageParts({ parts }: { parts: readonly EveMessagePart[] }) {
  return (
    <div className="space-y-1.5">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          if (!part.text) return null;
          return (
            <p key={part.id ?? 'text-' + index} className="whitespace-pre-wrap">
              {part.text}
            </p>
          );
        }
        if (part.type === 'reasoning') {
          if (!part.text) return null;
          return (
            <p
              key={part.id ?? 'reasoning-' + index}
              className="text-xs italic text-muted-foreground"
            >
              {part.text}
            </p>
          );
        }
        if (part.type === 'dynamic-tool') {
          return <ToolPart key={part.toolCallId} part={part} />;
        }
        if (part.type === 'authorization') {
          return (
            <p
              key={'auth-' + index}
              className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700"
            >
              Cần cấp quyền: {part.displayName}
              {part.description ? ' — ' + part.description : ''}
            </p>
          );
        }
        // step-start / file — bỏ qua hiển thị.
        return null;
      })}
    </div>
  );
}

export function EveChat() {
  // Đọc 1 lần lúc mount — resume chỉ có ý nghĩa với phiên đã lưu trước đó.
  const [stored] = useState<StoredSession | null>(() => loadStoredSession());

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const agent = useEveAgent({
    initialSession: stored
      ? { sessionId: stored.sessionId, streamIndex: stored.streamIndex }
      : undefined,
    resume: stored !== null,
    followIdle: false,
    onSessionChange(session) {
      try {
        if (session) {
          window.sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              sessionId: session.sessionId,
              streamIndex: session.streamIndex,
            }),
          );
        } else {
          window.sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // ignore — storage không khả dụng.
      }
    },
    onError(error) {
      console.warn('[eve-chat] lỗi phiên eve:', error.message);
    },
  });

  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const isResuming = agent.status === 'resuming';

  // Tự cuộn xuống cuối khi có tin nhắn mới / nội dung stream cập nhật.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [agent.data.messages, agent.status]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (text.length === 0 || isResuming) return;
    setInput('');
    void agent.send(text, isBusy ? { turnPolicy: 'steer' } : undefined);
  }, [agent, input, isBusy, isResuming]);

  const startNew = useCallback(() => {
    agent.reset();
  }, [agent]);

  const statusLabel =
    agent.status === 'resuming'
      ? 'Đang kết nối lại phiên…'
      : agent.status === 'submitted'
        ? 'Đã gửi — Eve đang xử lý…'
        : agent.status === 'streaming'
          ? 'Eve đang trả lời…'
          : agent.status === 'error'
            ? 'Lượt trước gặp lỗi — thử gửi lại.'
            : null;

  return (
    <Card className="flex h-[calc(100dvh-12rem)] min-h-125 flex-col">
      <CardContent className="flex h-full min-h-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Trợ lý Agent (eve)</p>
            <p className="text-xs text-muted-foreground">
              Agent biết tra cứu danh bạ và làm giàu lead — câu trả lời được
              stream trực tiếp từ phiên durable.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isBusy && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void agent.cancel()}
                aria-label="Dừng lượt đang chạy"
              >
                <Square className="size-4" />
                Dừng
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={startNew}
              disabled={isResuming}
              aria-label="Bắt đầu đoạn chat mới"
            >
              <RotateCcw className="size-4" />
              Chat mới
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3"
          aria-live="polite"
        >
          {agent.data.messages.length === 0 && !isResuming && (
            <p className="pt-8 text-center text-sm text-muted-foreground">
              Chào bạn! Hỏi Eve về danh bạ, lead hoặc yêu cầu làm giàu dữ liệu —
              ví dụ: “Tìm contact tên Lan trong danh bạ của tôi”.
            </p>
          )}
          {agent.data.messages.map((message: EveMessage) => (
            <div
              key={message.id}
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                message.role === 'user'
                  ? 'ml-auto bg-primary text-primary-foreground'
                  : 'bg-background shadow-sm',
              )}
            >
              <MessageParts parts={message.parts} />
            </div>
          ))}
          {statusLabel && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              {statusLabel}
            </p>
          )}
          {agent.error && (
            <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">
              Lỗi: {agent.error.message}
            </p>
          )}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={isResuming}
            placeholder="Nhập tin nhắn cho Eve… (Enter để gửi, Shift+Enter xuống dòng)"
            aria-label="Tin nhắn cho Eve"
            className="max-h-40 min-h-[2.5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isResuming || input.trim().length === 0}
            aria-label="Gửi tin nhắn"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

import { Card, CardContent } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';

import { ChatWindow, type ChatMessage } from './chat-window';
import { ConversationSidebar } from './conversation-sidebar';
import type { Citation } from './citation';

type DbMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[] | null;
  created_at: string;
};

function toChatMessage(row: DbMessage): ChatMessage {
  const parts: ChatMessage['parts'] = [{ type: 'text', text: row.content }];
  if (row.role === 'assistant' && Array.isArray(row.citations) && row.citations.length > 0) {
    parts.push({
      type: 'data-citations',
      data: row.citations,
    } as ChatMessage['parts'][number]);
  }
  return {
    id: row.id,
    role: row.role,
    parts,
  } as ChatMessage;
}

/**
 * Trang Trợ lý: sidebar lịch sử hội thoại + khung chat.
 * `key` của ChatWindow đổi theo đoạn đang mở để remount và hydrate đúng.
 */
export function AssistantChat() {
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Đổi mỗi khi user chủ động chọn/mở đoạn chat — KHÔNG đổi khi tạo lười ở lần gửi đầu. */
  const [chatKey, setChatKey] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json.items) ? (json.items as DbMessage[]) : [];
        setMessages(items.map(toChatMessage));
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const openConversation = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) {
        return;
      }
      setActiveId(id);
      setMessages([]);
      setChatKey((k) => k + 1);
      void loadMessages(id);
    },
    [loadMessages],
  );

  const startNew = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setChatKey((k) => k + 1);
  }, []);

  const createConversation = useCallback(async (firstText: string) => {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: firstText.slice(0, 60) }),
    });
    if (!res.ok) {
      throw new Error('Chưa tạo được đoạn chat.');
    }
    const json = await res.json();
    const id = json.id as string;
    setActiveId(id);
    setSidebarRefreshKey((k) => k + 1);
    return id;
  }, []);

  const handleDeleted = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) {
        startNew();
      }
      setSidebarRefreshKey((k) => k + 1);
    },
    [startNew],
  );

  const handleStreamFinished = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    document.title = 'Trợ lý — EventLead';
  }, []);

  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-125 gap-4">
      <Card className="hidden w-72 shrink-0 md:block">
        <CardContent className="h-full p-3">
          <ConversationSidebar
            activeId={activeId}
            onSelect={openConversation}
            onNew={startNew}
            refreshKey={sidebarRefreshKey}
            onDeleted={handleDeleted}
          />
        </CardContent>
      </Card>

      <Card className="min-w-0 flex-1">
        <CardContent className="h-full p-4">
          {loadingMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Spinner className="h-6 w-6" />
              <p className="text-sm">Đang tải đoạn chat…</p>
            </div>
          ) : (
            <ChatWindow
              key={chatKey}
              conversationId={activeId}
              initialMessages={messages}
              onCreateConversation={createConversation}
              onStreamFinished={handleStreamFinished}
            />
          )}
        </CardContent>
      </Card>

      <MobileSidebarSheet
        activeId={activeId}
        onSelect={openConversation}
        onNew={startNew}
        refreshKey={sidebarRefreshKey}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

function MobileSidebarSheet(props: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Mở lịch sử hội thoại"
      >
        <Bot className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70dvh] rounded-t-2xl bg-background p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Lịch sử hội thoại</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                Đóng
              </button>
            </div>
            <div className="h-80">
              <ConversationSidebar
                {...props}
                onSelect={(id) => {
                  props.onSelect(id);
                  setOpen(false);
                }}
                onNew={() => {
                  props.onNew();
                  setOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

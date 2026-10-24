'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus, PencilLine, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

export type ConversationItem = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  if (sameDay(d, today)) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  if (sameDay(d, yesterday)) {
    return 'Hôm qua';
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Props = {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
  /** Gọi sau khi xóa — id của đoạn vừa bị xóa. */
  onDeleted: (id: string) => void;
};

/** Sidebar: nút Đoạn chat mới + danh sách chat_conversations (mở lại / xóa có xác nhận). */
export function ConversationSidebar({ activeId, onSelect, onNew, refreshKey, onDeleted }: Props) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ConversationItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat/conversations');
      if (res.ok) {
        const json = await res.json();
        setItems(Array.isArray(json.items) ? json.items : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/chat/conversations/${pendingDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItems((prev) => prev.filter((c) => c.id !== pendingDelete.id));
        onDeleted(pendingDelete.id);
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Button className="mb-3 w-full" onClick={onNew}>
        <MessageSquarePlus className="mr-2 h-4 w-4" />
        Đoạn chat mới
      </Button>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <PencilLine className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Chưa có đoạn chat nào.
            <br />
            Tải tài liệu lên rồi hỏi tôi nhé.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <div
                key={item.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md px-2 py-2 text-sm transition-colors',
                  active ? 'bg-muted font-medium' : 'hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="min-w-0 flex-1 text-left"
                  title={item.title}
                >
                  <span className="block truncate">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDay(item.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Xóa đoạn chat "${item.title}"`}
                  onClick={() => setPendingDelete(item)}
                  className="invisible shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa đoạn chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Đoạn chat “{pendingDelete?.title}” và toàn bộ tin nhắn trong đó sẽ bị
              xóa vĩnh viễn. Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Spinner className="h-4 w-4" /> : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Pencil, RotateCcw } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Textarea } from '@kit/ui/textarea';
import { cn } from '@kit/ui/utils';

type PromptItem = {
  key: string;
  name: string;
  description: string;
  content: string;
  is_custom: boolean;
  updated_at: string | null;
};

/**
 * UI quản lý prompts AI: danh sách 7 prompts, sửa nội dung qua dialog,
 * khôi phục về bản mặc định.
 */
export function PromptManager() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<PromptItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/prompts');
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? 'Không tải được danh sách prompts.');
        return;
      }
      setError(null);
      setPrompts(body.items ?? []);
    } catch {
      setError('Không tải được danh sách prompts, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrompts();
  }, [fetchPrompts]);

  const openEdit = useCallback((prompt: PromptItem) => {
    setEditing(prompt);
    setEditContent(prompt.content);
    setEditError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    if (editContent.trim().length < 10) {
      setEditError('Prompt quá ngắn (tối thiểu 10 ký tự).');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/prompts/${editing.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      const body = await res.json();
      if (!res.ok) {
        setEditError(body?.message ?? 'Không lưu được prompt.');
        return;
      }
      setEditing(null);
      await fetchPrompts();
    } catch {
      setEditError('Không lưu được prompt, vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }, [editing, editContent, fetchPrompts]);

  const handleReset = useCallback(
    async (key: string) => {
      try {
        const res = await fetch(`/api/prompts/${key}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json();
          setError(body?.message ?? 'Không khôi phục được prompt.');
          return;
        }
        await fetchPrompts();
      } catch {
        setError('Không khôi phục được prompt, vui lòng thử lại.');
      }
    },
    [fetchPrompts],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải prompts…
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {prompts.map((prompt) => (
        <Card key={prompt.key}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{prompt.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {prompt.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {prompt.is_custom && (
                  <Badge variant="secondary" className="mr-1">
                    Đã tùy chỉnh
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Sửa ${prompt.name}`}
                  onClick={() => openEdit(prompt)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {prompt.is_custom && (
                  <AlertDialog>
                    <AlertDialogTrigger
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' }),
                      )}
                      aria-label={`Khôi phục ${prompt.name} về mặc định`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Khôi phục về bản mặc định?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Prompt “{prompt.name}” sẽ trở về nội dung mặc định của
                          hệ thống. Bản tùy chỉnh của bạn sẽ bị xóa.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleReset(prompt.key)}
                        >
                          Khôi phục
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
              {prompt.content.slice(0, 500)}
              {prompt.content.length > 500 && '…'}
            </pre>
          </CardContent>
        </Card>
      ))}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sửa prompt: {editing?.name}</DialogTitle>
            <DialogDescription>
              {editing?.description} Thay đổi có hiệu lực ngay cho các lần gọi AI
              tiếp theo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
            className="font-mono text-sm"
            placeholder="Nhập nội dung system prompt…"
          />
          {editError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {editError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

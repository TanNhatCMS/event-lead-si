'use client';

import { useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Spinner } from '@kit/ui/spinner';
import { Textarea } from '@kit/ui/textarea';
import { cn } from '@kit/ui/utils';

export type Note = {
  id: string;
  body: string;
  note_type: string;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  meeting_note: 'Ghi chú cuộc gặp',
  need: 'Nhu cầu',
  opportunity: 'Cơ hội',
  next_step: 'Việc cần làm',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Ghi chú cuộc gặp: thêm/sửa/xóa, đánh dấu việc cần làm đã xong,
 * và AI soạn nháp tin nhắn follow-up (người dùng quyết định dùng hay không).
 */
export function NotesPanel({
  contactId,
  contactName,
  notes,
  onChanged,
}: {
  contactId: string;
  contactName: string;
  notes: Note[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [noteType, setNoteType] = useState('meeting_note');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftContext, setDraftContext] = useState('');
  const [draftChannel, setDraftChannel] = useState('zalo');
  const [copied, setCopied] = useState(false);

  async function api(path: string, method: string, payload?: unknown) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message ?? 'Thao tác thất bại.');
    return json;
  }

  async function handleAdd() {
    if (!body.trim()) {
      setError('Nội dung ghi chú không được để trống.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/contacts/${contactId}/notes`, 'POST', {
        body: body.trim(),
        note_type: noteType,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      });
      setBody('');
      setDueAt('');
      setNoteType('meeting_note');
      setAdding(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thêm ghi chú thất bại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editBody.trim()) {
      setError('Nội dung ghi chú không được để trống.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/notes/${id}`, 'PATCH', { body: editBody.trim() });
      setEditingId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu ghi chú thất bại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await api(`/api/notes/${id}`, 'DELETE');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xóa ghi chú thất bại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDone(note: Note) {
    try {
      await api(`/api/notes/${note.id}`, 'PATCH', { done: !note.done_at });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cập nhật thất bại.');
    }
  }

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const json = await api('/api/followup/draft', 'POST', {
        contact_id: contactId,
        context: draftContext.trim(),
        channel: draftChannel,
      });
      setDraft(json.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Soạn tin nhắn thất bại.');
    } finally {
      setDrafting(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = draft;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Ghi chú & việc cần làm
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDrafting((v) => !v)}>
            <Sparkles className="mr-1.5 h-4 w-4" /> AI soạn tin
          </Button>
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" /> Thêm ghi chú
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* AI soạn tin nhắn */}
        {drafting && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">AI soạn tin nhắn follow-up cho {contactName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dựa trên thông tin liên hệ và ghi chú. Chỉ là bản nháp — anh tự quyết định dùng hay không.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kênh gửi dự kiến</Label>
                <select
                  value={draftChannel}
                  onChange={(e) => setDraftChannel(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  <option value="zalo">Zalo</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="khac">Kênh khác</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Ngữ cảnh thêm (tùy chọn)</Label>
                <Input
                  value={draftContext}
                  onChange={(e) => setDraftContext(e.target.value)}
                  placeholder="VD: vừa gặp ở sự kiện Vietbuild..."
                />
              </div>
            </div>
            <Button size="sm" className="mt-3" onClick={handleDraft} disabled={busy}>
              {busy ? <Spinner className="mr-1.5 h-4 w-4" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              Soạn tin nhắn
            </Button>
            {draft && (
              <div className="mt-3 rounded-lg bg-background p-3">
                <p className="text-sm whitespace-pre-wrap">{draft}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={copyDraft}>
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4" /> Đã chép
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4" /> Sao chép
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Form thêm ghi chú */}
        {adding && (
          <div className="rounded-xl border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Loại ghi chú</Label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  <option value="meeting_note">Ghi chú cuộc gặp</option>
                  <option value="need">Nhu cầu</option>
                  <option value="opportunity">Cơ hội</option>
                  <option value="next_step">Việc cần làm</option>
                </select>
              </div>
              {noteType === 'next_step' && (
                <div className="space-y-1.5">
                  <Label>Hạn hoàn thành</Label>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>Nội dung</Label>
              <Textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="VD: Đã trao đổi về nhu cầu CRM, hẹn gọi lại thứ 5..."
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={busy}>
                {busy ? 'Đang lưu...' : 'Lưu ghi chú'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                Hủy
              </Button>
            </div>
          </div>
        )}

        {/* Danh sách ghi chú */}
        {notes.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">
            Chưa có ghi chú nào cho liên hệ này.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => {
              const isTodo = n.note_type === 'next_step';
              const done = !!n.done_at;
              const overdue =
                isTodo && !done && n.due_at && new Date(n.due_at).getTime() < Date.now();
              return (
                <li
                  key={n.id}
                  className={cn(
                    'rounded-lg p-3',
                    overdue ? 'bg-destructive/10' : 'bg-muted/50',
                    done && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={isTodo ? 'default' : 'secondary'}>
                        {NOTE_TYPE_LABELS[n.note_type] ?? n.note_type}
                      </Badge>
                      {isTodo && n.due_at && (
                        <Badge variant={overdue ? 'destructive' : 'outline'}>
                          <Bell className="mr-1 h-3 w-3" />
                          Hạn {formatDate(n.due_at)}
                          {overdue ? ' · quá hạn' : ''}
                        </Badge>
                      )}
                      {done && <Badge variant="outline">Đã xong</Badge>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {isTodo && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title={done ? 'Mở lại' : 'Đánh dấu đã xong'}
                          onClick={() => handleToggleDone(n)}
                        >
                          {done ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Sửa"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditBody(n.body);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        title="Xóa"
                        onClick={() => handleDelete(n.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {editingId === n.id ? (
                    <div className="mt-2">
                      <Textarea
                        rows={3}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                      />
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(n.id)} disabled={busy}>
                          Lưu
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          <X className="mr-1 h-4 w-4" /> Hủy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={cn('mt-2 text-sm whitespace-pre-wrap', done && 'line-through')}>
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTime(n.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

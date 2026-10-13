'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ListChecks,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
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

type Criterion = { label: string; detail?: string };
type Evidence = { label: string; url?: string; note?: string };

type Candidate = {
  id: string;
  name: string;
  notes: string;
  evidence: Evidence[];
  fit_summary: string | null;
  shortlisted: boolean;
  contact_id: string | null;
  company_id: string | null;
  created_at: string;
  contacts: { id: string; full_name: string; job_title: string | null } | null;
  companies: { id: string; display_name: string } | null;
};

type SourcingRequest = {
  id: string;
  title: string;
  product_description: string;
  target_market: string | null;
  criteria: Criterion[];
  status: string;
};

type Suggestion = {
  contact_id: string | null;
  company_id: string | null;
  name: string;
  reason: string;
  confidence: number;
};

const KIND_LABELS: Record<string, string> = {
  questions: 'Câu hỏi xác minh',
  rfq: 'Thư yêu cầu báo giá',
  negotiation: 'Dàn ý đàm phán',
};

/**
 * Chi tiết yêu cầu sourcing: tiêu chí, ứng viên kèm bằng chứng,
 * danh sách ngắn, AI gợi ý ứng viên và soạn RFQ/đàm phán.
 */
export function SourcingDetail({ requestId }: { requestId: string }) {
  const [req, setReq] = useState<SourcingRequest | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Thêm ứng viên tay
  const [adding, setAdding] = useState(false);
  const [candName, setCandName] = useState('');
  const [candNotes, setCandNotes] = useState('');

  // AI gợi ý
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // AI soạn RFQ
  const [draftKind, setDraftKind] = useState('questions');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sourcing/requests/${requestId}`);
      const json = await res.json();
      if (res.ok) {
        setReq(json.request);
        setCandidates(json.candidates ?? []);
      } else {
        setError(json.message ?? 'Tải yêu cầu thất bại.');
      }
    } catch {
      setError('Tải yêu cầu thất bại.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function handleAddCandidate() {
    if (!candName.trim()) {
      setError('Tên ứng viên không được để trống.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sourcing/requests/${requestId}/candidates`, 'POST', {
        name: candName.trim(),
        notes: candNotes.trim(),
      });
      setCandName('');
      setCandNotes('');
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thêm ứng viên thất bại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleShortlist(c: Candidate) {
    try {
      await api(`/api/sourcing/candidates/${c.id}`, 'PATCH', {
        shortlisted: !c.shortlisted,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cập nhật thất bại.');
    }
  }

  async function handleDeleteCandidate(id: string) {
    try {
      await api(`/api/sourcing/candidates/${id}`, 'DELETE');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xóa ứng viên thất bại.');
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const json = await api('/api/sourcing/suggest', 'POST', { request_id: requestId });
      setSuggestions(json.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gợi ý thất bại.');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleAddSuggestion(s: Suggestion) {
    try {
      await api(`/api/sourcing/requests/${requestId}/candidates`, 'POST', {
        name: s.name,
        contact_id: s.contact_id,
        company_id: s.company_id,
        fit_summary: s.reason,
        notes: `AI gợi ý (độ phù hợp ${Math.round(s.confidence * 100)}%): ${s.reason}`,
      });
      setSuggestions((prev) =>
        prev.filter((x) => x.name !== s.name || x.reason !== s.reason),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thêm ứng viên thất bại.');
    }
  }

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const json = await api('/api/sourcing/draft-rfq', 'POST', {
        request_id: requestId,
        kind: draftKind,
      });
      setDraft(json.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Soạn thảo thất bại.');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error && !req) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!req) return null;

  const shortlisted = candidates.filter((c) => c.shortlisted);

  return (
    <div className="flex w-full flex-col gap-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Thông tin yêu cầu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{req.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {req.product_description && (
            <p className="whitespace-pre-wrap text-muted-foreground">{req.product_description}</p>
          )}
          {req.target_market && (
            <p>
              <span className="font-medium">Thị trường:</span> {req.target_market}
            </p>
          )}
          {req.criteria.length > 0 && (
            <div>
              <p className="font-medium">Tiêu chí:</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {req.criteria.map((c, i) => (
                  <li key={i}>
                    {c.label}
                    {c.detail ? ` — ${c.detail}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI gợi ý ứng viên */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> AI gợi ý từ danh bạ
          </CardTitle>
          <Button size="sm" variant="outline" onClick={handleSuggest} disabled={suggesting}>
            {suggesting ? <Spinner className="mr-1.5 h-4 w-4" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Gợi ý ứng viên
          </Button>
        </CardHeader>
        {suggestions.length > 0 && (
          <CardContent>
            <ul className="flex flex-col gap-2">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {s.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        phù hợp {Math.round(s.confidence * 100)}%
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAddSuggestion(s)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Thêm
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Gợi ý chỉ từ danh bạ của anh — bấm “Thêm” để đưa vào danh sách ứng viên.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Ứng viên */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" /> Ứng viên ({candidates.length})
            {shortlisted.length > 0 && (
              <Badge variant="default">{shortlisted.length} danh sách ngắn</Badge>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" /> Thêm ứng viên
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {adding && (
            <div className="rounded-xl border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tên ứng viên</Label>
                  <Input
                    value={candName}
                    onChange={(e) => setCandName(e.target.value)}
                    placeholder="Tên người hoặc công ty"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ghi chú</Label>
                  <Input
                    value={candNotes}
                    onChange={(e) => setCandNotes(e.target.value)}
                    placeholder="Thông tin ban đầu..."
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleAddCandidate} disabled={busy}>
                  {busy ? 'Đang thêm...' : 'Thêm'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                  Hủy
                </Button>
              </div>
            </div>
          )}

          {candidates.length === 0 && !adding ? (
            <p className="text-sm text-muted-foreground">
              Chưa có ứng viên nào. Thêm tay hoặc dùng AI gợi ý từ danh bạ.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    'rounded-lg border p-3',
                    c.shortlisted ? 'border-primary/50 bg-primary/5' : 'bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {c.shortlisted && <Star className="h-4 w-4 fill-primary text-primary" />}
                        {c.contact_id ? (
                          <Link href={`/home/danh-ba/${c.contact_id}`} className="hover:underline">
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}
                      </p>
                      {c.fit_summary && (
                        <p className="mt-1 text-xs text-muted-foreground">{c.fit_summary}</p>
                      )}
                      {c.notes && <p className="mt-1 text-sm whitespace-pre-wrap">{c.notes}</p>}
                      {c.evidence.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {c.evidence.map((e, i) => (
                            <li key={i} className="text-xs text-muted-foreground">
                              • {e.label}
                              {e.url ? (
                                <>
                                  {' — '}
                                  <a
                                    href={e.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    nguồn
                                  </a>
                                </>
                              ) : null}
                              {e.note ? ` (${e.note})` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                      {c.evidence.length === 0 && (
                        <p className="mt-1 text-xs text-amber-600">
                          Chưa có bằng chứng — cần xác minh.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant={c.shortlisted ? 'default' : 'ghost'}
                        className="h-7 w-7"
                        title={c.shortlisted ? 'Loại khỏi danh sách ngắn' : 'Đưa vào danh sách ngắn'}
                        onClick={() => handleToggleShortlist(c)}
                      >
                        <Star className={cn('h-3.5 w-3.5', c.shortlisted && 'fill-primary-foreground')} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        title="Xóa ứng viên"
                        onClick={() => handleDeleteCandidate(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* AI soạn RFQ / đàm phán */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" /> AI soạn thảo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleDraft} disabled={drafting}>
              {drafting ? <Spinner className="mr-1.5 h-4 w-4" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              Soạn thảo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dựa trên yêu cầu và {shortlisted.length > 0 ? `${shortlisted.length} ứng viên danh sách ngắn` : 'toàn bộ ứng viên'}.
            Chỉ là bản nháp — anh duyệt trước khi dùng bên ngoài.
          </p>
          {draft && (
            <div className="rounded-lg bg-muted/50 p-3">
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
          {draft && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setDraft(null)}>
              <X className="mr-1 h-4 w-4" /> Đóng
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

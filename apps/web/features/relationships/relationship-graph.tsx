'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Network, Sparkles, X } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Label } from '@kit/ui/label';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

type Node = {
  id: string;
  kind: 'contact' | 'company';
  label: string;
  sub: string | null;
};

type Edge = { from: string; to: string; label: string };

type Intro = {
  connector: { id: string; full_name: string; job_title: string | null };
  evidence: string;
};

const W = 720;
const H = 460;
const CX = W / 2;
const CY = H / 2;

/**
 * Đồ thị quan hệ: liên hệ — công ty. Bấm vào node để xem kết nối.
 * Kèm công cụ tìm người giới thiệu tới một liên hệ mục tiêu (FR-022).
 */
export function RelationshipGraph() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // Tìm người giới thiệu
  const [targetId, setTargetId] = useState('');
  const [intros, setIntros] = useState<Intro[]>([]);
  const [introsLoading, setIntrosLoading] = useState(false);
  const [targetName, setTargetName] = useState('');

  // Soạn tin nhắn giới thiệu
  const [draftingFor, setDraftingFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/relationships/graph');
        const json = await res.json();
        if (res.ok) {
          setNodes(json.nodes ?? []);
          setEdges(json.edges ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Layout: công ty nằm trên vòng tròn, liên hệ quây quanh công ty của mình.
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const companies = nodes.filter((n) => n.kind === 'company');
    const contacts = nodes.filter((n) => n.kind === 'contact');
    const contactCompany = new Map<string, string>();
    for (const e of edges) {
      if (e.from.startsWith('contact:') && e.to.startsWith('company:')) {
        contactCompany.set(e.from, e.to);
      }
    }
    const R = Math.min(W, H) / 2 - 70;
    companies.forEach((c, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, companies.length) - Math.PI / 2;
      pos.set(c.id, { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) });
    });
    const byCompany = new Map<string, Node[]>();
    const free: Node[] = [];
    for (const c of contacts) {
      const co = contactCompany.get(c.id);
      if (co && pos.has(co)) {
        const arr = byCompany.get(co) ?? [];
        arr.push(c);
        byCompany.set(co, arr);
      } else {
        free.push(c);
      }
    }
    for (const [coId, arr] of byCompany) {
      const base = pos.get(coId)!;
      arr.forEach((c, i) => {
        const a = (2 * Math.PI * i) / arr.length;
        const r = 62;
        pos.set(c.id, {
          x: Math.min(W - 50, Math.max(50, base.x + r * Math.cos(a))),
          y: Math.min(H - 30, Math.max(30, base.y + r * Math.sin(a))),
        });
      });
    }
    free.forEach((c, i) => {
      pos.set(c.id, {
        x: 60 + ((i * 97) % (W - 120)),
        y: 40 + ((i * 53) % (H - 80)),
      });
    });
    return pos;
  }, [nodes, edges]);

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;
  const connectedIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const s = new Set<string>([selected]);
    for (const e of edges) {
      if (e.from === selected) s.add(e.to);
      if (e.to === selected) s.add(e.from);
    }
    return s;
  }, [selected, edges]);

  const contacts = nodes.filter((n) => n.kind === 'contact');

  const findIntros = useCallback(async (id: string) => {
    if (!id) return;
    setIntrosLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch(`/api/relationships/intros?target=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Tìm kiếm thất bại.');
      setIntros(json.intros ?? []);
      setTargetName(json.target?.full_name ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tìm kiếm thất bại.');
    } finally {
      setIntrosLoading(false);
    }
  }, []);

  async function handleIntroDraft(connectorId: string) {
    setDraftingFor(connectorId);
    setError(null);
    try {
      const res = await fetch('/api/relationships/intro-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, connector_id: connectorId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Soạn tin nhắn thất bại.');
      setDraft(json.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Soạn tin nhắn thất bại.');
    } finally {
      setDraftingFor(null);
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

  return (
    <div className="flex w-full flex-col gap-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Đồ thị */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4" /> Đồ thị kết nối
          </CardTitle>
          {selectedNode && (
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              <X className="mr-1 h-4 w-4" /> Bỏ chọn
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu. Thêm liên hệ và gắn công ty để thấy đồ thị quan hệ.
            </p>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full rounded-lg border bg-muted/20"
                role="img"
                aria-label="Đồ thị quan hệ"
              >
                {edges.map((e, i) => {
                  const a = layout.get(e.from);
                  const b = layout.get(e.to);
                  if (!a || !b) return null;
                  const active = !selected || connectedIds.has(e.from) || connectedIds.has(e.to);
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      strokeWidth={1.5}
                      className={active ? 'stroke-primary/50' : 'stroke-muted-foreground/15'}
                    />
                  );
                })}
                {nodes.map((n) => {
                  const p = layout.get(n.id);
                  if (!p) return null;
                  const isCompany = n.kind === 'company';
                  const dim = selected && !connectedIds.has(n.id);
                  return (
                    <g
                      key={n.id}
                      onClick={() => setSelected(n.id)}
                      className="cursor-pointer"
                      opacity={dim ? 0.25 : 1}
                    >
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isCompany ? 16 : 11}
                        className={cn(
                          selected === n.id
                            ? 'fill-primary stroke-primary'
                            : isCompany
                              ? 'fill-amber-500/80 stroke-amber-700'
                              : 'fill-sky-500/80 stroke-sky-700',
                        )}
                        strokeWidth={selected === n.id ? 3 : 1.5}
                      />
                      <text
                        x={p.x}
                        y={p.y + (isCompany ? 30 : 25)}
                        textAnchor="middle"
                        fontSize={11}
                        className="fill-foreground"
                      >
                        {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full bg-sky-500/80" /> Liên hệ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full bg-amber-500/80" /> Công ty
                </span>
                <span>Bấm vào node để xem kết nối.</span>
              </div>
            </>
          )}

          {selectedNode && (
            <div className="mt-3 rounded-lg border p-3">
              <p className="text-sm font-medium">
                {selectedNode.label}
                <Badge variant="secondary" className="ml-2">
                  {selectedNode.kind === 'company' ? 'Công ty' : 'Liên hệ'}
                </Badge>
              </p>
              {selectedNode.sub && (
                <p className="mt-0.5 text-xs text-muted-foreground">{selectedNode.sub}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Kết nối với {connectedIds.size - 1} node.
              </p>
              {selectedNode.kind === 'contact' && (
                <Link
                  href={`/home/danh-ba/${selectedNode.id.replace('contact:', '')}`}
                  className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                >
                  Mở hồ sơ liên hệ →
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tìm người giới thiệu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tìm người giới thiệu</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Chọn một liên hệ mục tiêu — hệ thống gợi ý những người cùng công ty
            có thể giới thiệu anh với họ, kèm bằng chứng. Không tự gửi gì cả.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-52 flex-1 space-y-1.5">
              <Label>Liên hệ mục tiêu</Label>
              <select
                value={targetId}
                onChange={(e) => {
                  setTargetId(e.target.value);
                  setIntros([]);
                  setDraft(null);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">— Chọn liên hệ —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id.replace('contact:', '')}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              onClick={() => findIntros(targetId)}
              disabled={!targetId || introsLoading}
            >
              {introsLoading ? <Spinner className="mr-1.5 h-4 w-4" /> : null}
              Tìm cầu nối
            </Button>
          </div>

          {targetId && !introsLoading && (
            <div>
              {intros.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Không tìm thấy cầu nối cho {targetName || 'liên hệ này'} (chưa có
                  liên hệ khác cùng công ty).
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {intros.map((intro) => (
                    <li
                      key={intro.connector.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/home/danh-ba/${intro.connector.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {intro.connector.full_name}
                        </Link>
                        {intro.connector.job_title && (
                          <span className="text-xs text-muted-foreground">
                            {' '}
                            · {intro.connector.job_title}
                          </span>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Bằng chứng: {intro.evidence}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleIntroDraft(intro.connector.id)}
                        disabled={draftingFor === intro.connector.id}
                      >
                        {draftingFor === intro.connector.id ? (
                          <Spinner className="mr-1.5 h-4 w-4" />
                        ) : (
                          <Sparkles className="mr-1.5 h-4 w-4" />
                        )}
                        Soạn tin nhắn
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {draft && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-medium">Bản nháp tin nhắn nhờ giới thiệu</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{draft}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={copyDraft}>
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
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  <X className="mr-1 h-4 w-4" /> Đóng
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

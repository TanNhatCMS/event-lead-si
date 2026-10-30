'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

type Point = { x: number; y: number };

const W = 760;
const H = 480;
const CX = W / 2;
const CY = H / 2;
const REPULSION = 4200;
const SPRING_LENGTH = 92;
const DAMPING = 0.82;
const MIN_ALPHA = 0.02;

/**
 * Đồ thị quan hệ dạng node graph — mô phỏng lực (đẩy nhau, lò xo theo cạnh,
 * trọng tâm) chạy bằng requestAnimationFrame. Node kéo thả được, nền pan,
 * lăn chuột zoom. Bấm node để xem kết nối; kèm công cụ tìm người giới thiệu
 * tới một liên hệ mục tiêu (FR-022).
 */
export function RelationshipGraph() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // tick chỉ để kích hoạt render lại sau mỗi bước physics — giá trị không
  // được đọc trực tiếp nên không cần destructure.
  const [, setTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Vị trí + vận tốc sống trong ref (không qua state mỗi tick của physics —
  // chỉ setTick để render lại).
  const simRef = useRef<{
    pos: Map<string, Point>;
    vel: Map<string, Point>;
    alpha: number;
  } | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

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

  // Vị trí ban đầu: công ty trên vòng tròn, liên hệ quây quanh công ty của
  // mình — điểm khởi động cho mô phỏng lực.
  const seedLayout = useMemo(() => {
    const pos = new Map<string, Point>();
    const companies = nodes.filter((n) => n.kind === 'company');
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
    for (const c of nodes.filter((n) => n.kind === 'contact')) {
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
        const a = (2 * Math.PI * i) / Math.max(1, arr.length);
        pos.set(c.id, {
          x: base.x + 70 * Math.cos(a) + (i % 2) * 6,
          y: base.y + 70 * Math.sin(a),
        });
      });
    }
    free.forEach((c, i) => {
      pos.set(c.id, {
        x: 80 + ((i * 131) % (W - 160)),
        y: 60 + ((i * 79) % (H - 120)),
      });
    });
    return pos;
  }, [nodes, edges]);

  // Khởi động mô phỏng khi dữ liệu đổi.
  useEffect(() => {
    if (nodes.length === 0) return;
    const pos = new Map<string, Point>();
    const vel = new Map<string, Point>();
    for (const n of nodes) {
      const seeded = seedLayout.get(n.id) ?? { x: CX, y: CY };
      pos.set(n.id, { x: seeded.x, y: seeded.y });
      vel.set(n.id, { x: 0, y: 0 });
    }
    simRef.current = { pos, vel, alpha: 1 };
    setTick((t) => t + 1);
  }, [nodes, seedLayout]);

  // Vòng lặp mô phỏng lực.
  useEffect(() => {
    if (nodes.length === 0) return;
    let raf = 0;

    const step = () => {
      const sim = simRef.current;
      if (!sim) return;

      if (sim.alpha >= MIN_ALPHA) {
        const list = nodes.map((n) => ({ id: n.id, ...sim.pos.get(n.id)! }));
        // Đẩy nhau giữa mọi cặp node.
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i]!;
            const b = list[j]!;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let dist2 = dx * dx + dy * dy;
            if (dist2 < 1) {
              dx = (Math.random() - 0.5) * 2;
              dy = (Math.random() - 0.5) * 2;
              dist2 = 4;
            }
            const force = REPULSION / dist2;
            const dist = Math.sqrt(dist2);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            const va = sim.vel.get(a.id)!;
            sim.vel.set(a.id, { x: va.x + fx, y: va.y + fy });
            const vb = sim.vel.get(b.id)!;
            sim.vel.set(b.id, { x: vb.x - fx, y: vb.y - fy });
          }
        }
        // Lò xo dọc theo cạnh.
        for (const e of edges) {
          const a = sim.pos.get(e.from);
          const b = sim.pos.get(e.to);
          const va = sim.vel.get(e.from);
          const vb = sim.vel.get(e.to);
          if (!a || !b || !va || !vb) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const f = ((dist - SPRING_LENGTH) / dist) * 0.06;
          sim.vel.set(e.from, { x: va.x + dx * f, y: va.y + dy * f });
          sim.vel.set(e.to, { x: vb.x - dx * f, y: vb.y - dy * f });
        }
        // Trọng tâm + tích phân.
        for (const n of nodes) {
          const p = sim.pos.get(n.id)!;
          const v = sim.vel.get(n.id)!;
          if (dragRef.current?.id === n.id) continue;
          v.x += (CX - p.x) * 0.004 * sim.alpha;
          v.y += (CY - p.y) * 0.004 * sim.alpha;
          v.x *= DAMPING;
          v.y *= DAMPING;
          p.x = Math.min(W - 30, Math.max(30, p.x + v.x));
          p.y = Math.min(H - 24, Math.max(24, p.y + v.y));
        }
        sim.alpha *= 0.982;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges]);

  /** Điểm chuột → toạ độ viewBox (đã trừ pan / chia zoom). */
  const toSvgPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const vx = ((clientX - rect.left) / rect.width) * W;
      const vy = ((clientY - rect.top) / rect.height) * H;
      return { x: (vx - pan.x) / zoom, y: (vy - pan.y) / zoom };
    },
    [pan, zoom],
  );

  function startNodeDrag(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    dragRef.current = { id, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const sim = simRef.current;
    if (!sim) return;

    if (dragRef.current) {
      const p = toSvgPoint(e.clientX, e.clientY);
      sim.pos.set(dragRef.current.id, p);
      sim.vel.set(dragRef.current.id, { x: 0, y: 0 });
      sim.alpha = Math.max(sim.alpha, 0.3);
      dragRef.current.moved = true;
      setTick((t) => t + 1);
      return;
    }

    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPan({
        x: panDragRef.current.panX + dx,
        y: panDragRef.current.panY + dy,
      });
    }
  }

  function onPointerUp() {
    if (dragRef.current && !dragRef.current.moved) {
      setSelected(dragRef.current.id);
    }
    if (dragRef.current?.moved) {
      const sim = simRef.current;
      if (sim) sim.alpha = Math.max(sim.alpha, 0.45); // nảy lại sau khi kéo
    }
    dragRef.current = null;
    panDragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const next = Math.min(2.5, Math.max(0.5, zoom * factor));
    // Zoom quanh con trỏ: giữ điểm dưới con trỏ đứng yên.
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const vx = ((e.clientX - rect.left) / rect.width) * W;
      const vy = ((e.clientY - rect.top) / rect.height) * H;
      setPan({
        x: vx - ((vx - pan.x) / zoom) * next,
        y: vy - ((vy - pan.y) / zoom) * next,
      });
    }
    setZoom(next);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;
  const focusId = hovered ?? selected;
  const connectedIds = useMemo(() => {
    if (!focusId) return new Set<string>();
    const s = new Set<string>([focusId]);
    for (const e of edges) {
      if (e.from === focusId) s.add(e.to);
      if (e.to === focusId) s.add(e.from);
    }
    return s;
  }, [focusId, edges]);

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

  const sim = simRef.current;
  const initials = (label: string) =>
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');

  return (
    <div className="flex w-full flex-col gap-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Đồ thị */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4" /> Đồ thị kết nối
          </CardTitle>
          <div className="flex items-center gap-2">
            {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
              <Button size="sm" variant="ghost" onClick={resetView}>
                Về giữa
              </Button>
            )}
            {selectedNode && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                <X className="mr-1 h-4 w-4" /> Bỏ chọn
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu. Thêm liên hệ và gắn công ty để thấy đồ thị quan hệ.
            </p>
          ) : (
            <>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full cursor-grab touch-none rounded-lg border bg-muted/20 active:cursor-grabbing"
                role="img"
                aria-label="Đồ thị quan hệ"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onPointerDown={(e) => {
                  // Bấm nền → bắt đầu pan.
                  panDragRef.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    panX: pan.x,
                    panY: pan.y,
                  };
                }}
                onWheel={onWheel}
              >
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                  {/* Cạnh */}
                  {edges.map((e, i) => {
                    const a = sim?.pos.get(e.from);
                    const b = sim?.pos.get(e.to);
                    if (!a || !b) return null;
                    const active =
                      !focusId || connectedIds.has(e.from) || connectedIds.has(e.to);
                    return (
                      <line
                        key={i}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        strokeWidth={active && focusId ? 2 : 1.2}
                        className={
                          active && focusId
                            ? 'stroke-primary/60'
                            : 'stroke-muted-foreground/15'
                        }
                      />
                    );
                  })}

                  {/* Node */}
                  {nodes.map((n) => {
                    const p = sim?.pos.get(n.id);
                    if (!p) return null;
                    const isCompany = n.kind === 'company';
                    const dim = focusId ? !connectedIds.has(n.id) : false;
                    const isFocus = selected === n.id || hovered === n.id;
                    const r = isCompany ? 19 : 13;
                    return (
                      <g
                        key={n.id}
                        className="cursor-pointer"
                        opacity={dim ? 0.2 : 1}
                        onPointerDown={(e) => startNodeDrag(e, n.id)}
                        onPointerEnter={() => setHovered(n.id)}
                        onPointerLeave={() => setHovered(null)}
                      >
                        {isCompany ? (
                          <rect
                            x={p.x - r}
                            y={p.y - r}
                            width={r * 2}
                            height={r * 2}
                            rx={6}
                            className={cn(
                              isFocus
                                ? 'fill-amber-500 stroke-amber-600'
                                : 'fill-amber-500/80 stroke-amber-700',
                            )}
                            strokeWidth={isFocus ? 3 : 1.5}
                          />
                        ) : (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={r}
                            className={cn(
                              isFocus
                                ? 'fill-sky-500 stroke-sky-600'
                                : 'fill-sky-500/80 stroke-sky-700',
                            )}
                            strokeWidth={isFocus ? 3 : 1.5}
                          />
                        )}
                        {/* Chữ viết tắt trong node */}
                        <text
                          x={p.x}
                          y={p.y + 4}
                          textAnchor="middle"
                          fontSize={isCompany ? 9 : 10}
                          fontWeight={600}
                          className="fill-white select-none"
                        >
                          {isCompany ? 'CO' : initials(n.label)}
                        </text>
                        <text
                          x={p.x}
                          y={p.y + r + 14}
                          textAnchor="middle"
                          fontSize={11}
                          className="fill-foreground select-none"
                        >
                          {n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full bg-sky-500/80" /> Liên hệ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-amber-500/80" /> Công ty
                </span>
                <span>Kéo node để sắp xếp · kéo nền để di chuyển · lăn chuột để zoom · bấm node để xem kết nối.</span>
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
                  href={`/dashboard/danh-ba/${selectedNode.id.replace('contact:', '')}`}
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
                          href={`/dashboard/danh-ba/${intro.connector.id}`}
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

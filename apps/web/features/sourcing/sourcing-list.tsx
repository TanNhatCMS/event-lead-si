'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Spinner } from '@kit/ui/spinner';
import { Textarea } from '@kit/ui/textarea';

type SourcingRequest = {
  id: string;
  title: string;
  target_market: string | null;
  status: string;
  created_at: string;
  candidates_total: number;
  candidates_shortlisted: number;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  active: 'Đang tìm',
  closed: 'Đã đóng',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Danh sách yêu cầu sourcing + form tạo mới.
 */
export function SourcingList() {
  const [requests, setRequests] = useState<SourcingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState('');
  const [market, setMarket] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sourcing/requests');
      const json = await res.json();
      if (res.ok) setRequests(json.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!title.trim()) {
      setError('Tiêu đề không được để trống.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sourcing/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          product_description: product.trim(),
          target_market: market.trim(),
          status: 'active',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Tạo yêu cầu thất bại.');
      setTitle('');
      setProduct('');
      setMarket('');
      setCreating(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tạo yêu cầu thất bại.');
    } finally {
      setBusy(false);
    }
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mô tả nhu cầu tìm nhà cung cấp, thu thập ứng viên kèm bằng chứng,
          chốt danh sách ngắn và chuẩn bị đàm phán.
        </p>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" /> Yêu cầu mới
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yêu cầu sourcing mới</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label>Tiêu đề</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Tìm nhà cung cấp bao bì giấy tại TP.HCM"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mô tả sản phẩm / dịch vụ cần tìm</Label>
              <Textarea
                rows={3}
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="VD: Hộp carton 3 lớp, số lượng 10.000/tháng..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Thị trường mục tiêu</Label>
              <Input
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                placeholder="VD: TP.HCM và lân cận"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={busy}>
                {busy ? 'Đang tạo...' : 'Tạo yêu cầu'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>
                Hủy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {requests.length === 0 && !creating ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Chưa có yêu cầu sourcing nào</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tạo yêu cầu đầu tiên để bắt đầu tìm nhà cung cấp.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {requests.map((r) => (
            <Link key={r.id} href={`/home/sourcing/${r.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{r.title}</p>
                    <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </div>
                  {r.target_market && (
                    <p className="mt-1 text-sm text-muted-foreground">{r.target_market}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {r.candidates_total} ứng viên
                      {r.candidates_shortlisted > 0 &&
                        ` · ${r.candidates_shortlisted} trong danh sách ngắn`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {formatDate(r.created_at)} <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

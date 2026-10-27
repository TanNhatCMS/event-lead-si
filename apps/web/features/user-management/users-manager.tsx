'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, Loader2, RefreshCw, Search, Trash2, Undo2 } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

interface AdminUserRow {
  id: string;
  email: string | null;
  fullName: string | null;
  role: 'admin' | 'member';
  emailConfirmed: boolean;
  banned: boolean;
  lastSignInAt: string | null;
  createdAt: string | null;
  contactCount: number;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Bảng quản lý người dùng: tìm kiếm, chặn/bỏ chặn, xóa.
 * Hành động đi qua /api/admin/users (service-role, chặn tự xử chính mình).
 */
export function UsersManager() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      const json = (await res.json().catch(() => null)) as {
        users?: AdminUserRow[];
        currentUserId?: string;
        message?: string;
      } | null;
      if (!res.ok || !json) {
        setError(json?.message ?? 'Không tải được danh sách người dùng.');
        return;
      }
      setUsers(json.users ?? []);
      setCurrentUserId(json.currentUserId ?? null);
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    user: AdminUserRow,
    action: 'ban' | 'unban' | 'delete' | 'set_role',
    role?: 'admin' | 'member',
  ) {
    const confirmMessage =
      action === 'delete'
        ? `Xóa vĩnh viễn tài khoản "${user.email ?? user.id}" cùng toàn bộ dữ liệu liên quan? Hành động này không thể hoàn tác.`
        : action === 'ban'
          ? `Chặn tài khoản "${user.email ?? user.id}"? Người này sẽ không đăng nhập được nữa.`
          : action === 'set_role'
            ? `Gán vai trò "${role === 'admin' ? 'Admin' : 'Member'}" cho "${user.email ?? user.id}"?`
            : `Bỏ chặn tài khoản "${user.email ?? user.id}"?`;
    if (!window.confirm(confirmMessage)) return;

    setActionError(null);
    setNotice(null);
    setPendingId(user.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'set_role' ? { userId: user.id, action, role } : { userId: user.id, action },
        ),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!res.ok) {
        setActionError(json?.message ?? 'Thao tác thất bại.');
        return;
      }
      setNotice(
        action === 'delete'
          ? 'Đã xóa người dùng.'
          : action === 'ban'
            ? 'Đã chặn người dùng.'
            : action === 'set_role'
              ? 'Đã cập nhật vai trò.'
              : 'Đã bỏ chặn người dùng.',
      );
      await load();
    } catch {
      setActionError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setPendingId(null);
    }
  }

  const filtered = (users ?? []).filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.fullName ?? '').toLowerCase().includes(q)
    );
  });

  if (loading && users === null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Đang tải danh sách người dùng…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Không tải được danh sách</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo email hoặc tên…"
            className="pl-9"
            aria-label="Tìm người dùng"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Làm mới
        </Button>
      </div>

      {notice && (
        <Alert>
          <AlertTitle>Thành công</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người dùng</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Liên hệ</TableHead>
              <TableHead>Đăng nhập cuối</TableHead>
              <TableHead>Tạo lúc</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Không có người dùng nào khớp.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">
                    {u.fullName ?? '—'}
                    {isSelf && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (bạn)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email ?? u.id}</p>
                </TableCell>
                <TableCell>
                  <Select
                    value={u.role}
                    onValueChange={(value) => {
                      if (value !== 'admin' && value !== 'member') return;
                      if (value !== u.role) void act(u, 'set_role', value);
                    }}
                    disabled={pendingId === u.id || isSelf}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue>
                        {u.role === 'admin' ? 'Admin' : 'Member'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  {isSelf && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Không thể tự đổi role
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.banned ? (
                      <Badge variant="destructive">Bị chặn</Badge>
                    ) : u.emailConfirmed ? (
                      <Badge variant="secondary">Đã xác nhận</Badge>
                    ) : (
                      <Badge variant="outline">Chờ xác nhận</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{u.contactCount}</TableCell>
                <TableCell className="text-sm">{formatDateTime(u.lastSignInAt)}</TableCell>
                <TableCell className="text-sm">{formatDateTime(u.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : u.banned ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === u.id}
                        onClick={() => void act(u, 'unban')}
                      >
                        {pendingId === u.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Undo2 className="size-4" />
                        )}
                        Bỏ chặn
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === u.id}
                        onClick={() => void act(u, 'ban')}
                      >
                        <Ban className="size-4" />
                        Chặn
                      </Button>
                    )}
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pendingId === u.id}
                        onClick={() => void act(u, 'delete')}
                      >
                        <Trash2 className="size-4" />
                        Xóa
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Xóa người dùng là thao tác vĩnh viễn — dữ liệu liên quan (liên hệ, công
        ty, lượt quét…) bị xóa theo. Không thể tự chặn/tự xóa tài khoản đang
        đăng nhập.
      </p>
    </div>
  );
}

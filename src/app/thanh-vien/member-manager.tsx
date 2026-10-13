"use client";

import { useActionState, useState } from "react";
import { Ban, CheckCircle2, Loader2, MailPlus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  setStatusAction,
  type MemberActionState,
} from "./actions";

export type MemberRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  isSelf: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị viên",
  member: "Thành viên",
};

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-indigo-100 text-indigo-700",
  admin: "bg-sky-100 text-sky-700",
  member: "bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Đang hoạt động",
  invited: "Đã mời",
  suspended: "Tạm ngưng",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  invited: "bg-amber-100 text-amber-700",
  suspended: "bg-slate-200 text-slate-600",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function InviteCard() {
  const [state, formAction, pending] = useActionState(inviteMemberAction, null as MemberActionState);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <MailPlus size={18} className="text-indigo-600" /> Mời thành viên
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Nhập email để gửi lời mời tham gia với vai trò thành viên. Nếu email chưa có tài khoản,
        hệ thống sẽ gửi thư mời đăng ký.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input name="email" type="email" required placeholder="email@congty.vn" className="sm:max-w-sm" aria-label="Email người được mời" />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending && <Loader2 size={16} className="animate-spin" />}
          Gửi lời mời
        </Button>
      </form>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{state.success}</p>
      )}
    </section>
  );
}

function RoleForm({ member, actorRole }: { member: MemberRow; actorRole: string }) {
  const [state, formAction, pending] = useActionState(changeRoleAction, null as MemberActionState);
  const [value, setValue] = useState(member.role);

  // Admin không được chạm vào owner: server đã chặn, UI ẩn luôn nút lưu.
  if (actorRole !== "owner" && member.role === "owner") {
    return <span className="text-xs text-slate-400">Chỉ chủ sở hữu thao tác</span>;
  }

  const editableRoles = actorRole === "owner" ? ["owner", "admin", "member"] : ["admin", "member"];

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="membership_id" value={member.id} />
      <Select name="role" value={value} onValueChange={(next) => setValue(next ?? member.role)} disabled={pending}>
        <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Vai trò của ${member.email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {editableRoles.map((role) => (
            <SelectItem key={role} value={role}>{ROLE_LABEL[role]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={pending || value === member.role}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : "Lưu"}
      </Button>
      {state?.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function RowActions({ member, actorRole }: { member: MemberRow; actorRole: string }) {
  const [statusState, statusAction, statusPending] = useActionState(setStatusAction, null as MemberActionState);
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, null as MemberActionState);
  const lastError = statusState?.error ?? removeState?.error;

  if (actorRole !== "owner" && member.role === "owner") {
    return <span className="text-xs text-slate-400">Chỉ chủ sở hữu thao tác</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {member.status === "active" && (
        <form
          action={statusAction}
          onSubmit={(event) => {
            if (!window.confirm(`Tạm ngưng ${member.email}? Họ sẽ không truy cập được tổ chức.`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="membership_id" value={member.id} />
          <input type="hidden" name="status" value="suspended" />
          <Button type="submit" size="sm" variant="outline" disabled={statusPending} title="Tạm ngưng">
            <Ban size={14} /> Tạm ngưng
          </Button>
        </form>
      )}
      {member.status === "suspended" && (
        <form action={statusAction}>
          <input type="hidden" name="membership_id" value={member.id} />
          <input type="hidden" name="status" value="active" />
          <Button type="submit" size="sm" variant="outline" disabled={statusPending} title="Kích hoạt lại">
            {statusPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Kích hoạt
          </Button>
        </form>
      )}
      {member.status === "invited" && (
        <span className="text-xs text-slate-400">Chờ người được mời chấp nhận</span>
      )}
      {!member.isSelf && (
        <form
          action={removeAction}
          onSubmit={(event) => {
            if (!window.confirm(`Xóa ${member.email} khỏi tổ chức?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="membership_id" value={member.id} />
          <Button type="submit" size="sm" variant="destructive" disabled={removePending} title="Xóa khỏi tổ chức">
            {removePending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Xóa
          </Button>
        </form>
      )}
      {(statusState?.success || removeState?.success) && (
        <span role="status" className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 size={13} /> {statusState?.success ?? removeState?.success}
        </span>
      )}
      {lastError && (
        <span role="alert" className="text-xs text-red-600">{lastError}</span>
      )}
    </div>
  );
}

export function MemberManager({ members, actorRole }: { members: MemberRow[]; actorRole: string }) {
  return (
    <div className="space-y-4">
      <InviteCard />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 md:px-6">
          <h2 className="text-base font-semibold tracking-tight">Danh sách thành viên ({members.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium md:px-6">Email</th>
                <th className="px-3 py-3 font-medium">Vai trò</th>
                <th className="px-3 py-3 font-medium">Trạng thái</th>
                <th className="px-3 py-3 font-medium">Tham gia</th>
                <th className="px-5 py-3 font-medium md:px-6">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-5 py-3.5 md:px-6">
                    <div className="font-medium text-slate-900">{member.email}</div>
                    {member.isSelf && <div className="text-xs text-slate-400">Đây là bạn</div>}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE[member.role] ?? ROLE_BADGE.member}`}>
                      {ROLE_LABEL[member.role] ?? member.role}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[member.status] ?? STATUS_BADGE.active}`}>
                      {STATUS_LABEL[member.status] ?? member.status}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">{formatDate(member.createdAt)}</td>
                  <td className="px-5 py-3.5 md:px-6">
                    <div className="space-y-2">
                      <RoleForm member={member} actorRole={actorRole} />
                      <RowActions member={member} actorRole={actorRole} />
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                    Chưa có thành viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

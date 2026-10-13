"use client";

import { useActionState } from "react";
import { Building2, Loader2, MailQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOrganizationAction, type CreateOrgState } from "./actions";

const initialState: CreateOrgState = null;

export function OnboardingOptions({ userEmail }: { userEmail: string }) {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Building2 size={20} />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Tạo tổ chức mới</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Bạn sẽ trở thành chủ sở hữu (owner) và có thể mời đồng nghiệp tham gia sau.
        </p>
        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label htmlFor="org-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Tên tổ chức
            </label>
            <Input id="org-name" name="name" required maxLength={160} placeholder="Ví dụ: Công ty ABC" />
          </div>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 size={16} className="animate-spin" />}
            Tạo tổ chức
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <MailQuestion size={20} />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Được mời vào tổ chức có sẵn</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Nếu công ty của bạn đã dùng EventLead SI, hãy nhờ quản trị viên mời địa chỉ email{" "}
          <span className="font-medium text-slate-900">{userEmail}</span> vào tổ chức.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li className="flex gap-2"><span className="font-semibold text-indigo-600">1.</span> Quản trị viên mở trang “Thành viên” trong tổ chức.</li>
          <li className="flex gap-2"><span className="font-semibold text-indigo-600">2.</span> Nhập email của bạn và gửi lời mời.</li>
          <li className="flex gap-2"><span className="font-semibold text-indigo-600">3.</span> Bạn đăng nhập lại là có thể bắt đầu làm việc.</li>
        </ul>
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CardUploadForm } from "@/features/card-import/card-upload-form";
import { getOrganizationContext } from "@/lib/auth/organization";

// Trang yêu cầu đăng nhập, header hiển thị theo user → không prerender tĩnh.
export const instant = false;

export default async function NewCardImportPage() {
  const { user, membership } = await getOrganizationContext();
  if (!user) redirect("/login?next=/card-imports/new");
  if (!membership) redirect("/thiet-lap");

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />Về tổng quan</Link>
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600">Chuyển danh thiếp thành hồ sơ</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Thêm danh thiếp</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Tải ảnh danh thiếp lên kho riêng của tổ chức. Ảnh chưa được gửi tới nhà cung cấp nhận dạng cho đến khi cấu hình xử lý được phê duyệt.</p>
        </div>
        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <CardUploadForm />
          <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />Ảnh được lưu trong bucket private và giới hạn theo tổ chức. Chỉ tải danh thiếp mà bạn có quyền lưu trữ.</div>
        </section>
      </div>
    </AppShell>
  );
}

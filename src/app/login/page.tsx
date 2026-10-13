import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactRound } from "lucide-react";

import { getOrganizationContext, sanitizeNextPath } from "@/lib/auth/organization";
import { LoginForm } from "./login-form";

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = sanitizeNextPath(typeof params.next === "string" ? params.next : undefined, "/");
  const registered = params.registered === "1";
  const callbackError = params.error === "callback";

  const { user, membership } = await getOrganizationContext();
  if (user) {
    redirect(membership ? next : "/thiet-lap");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
            <ContactRound size={24} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">EventLead SI</h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập để quản lý danh thiếp đối tác</p>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {registered && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
              Đăng ký thành công. Nếu email yêu cầu xác thực, vui lòng kiểm tra hộp thư trước khi đăng nhập.
            </p>
          )}
          {callbackError && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              Liên kết xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.
            </p>
          )}
          <LoginForm next={next} />
          <p className="mt-5 text-center text-sm text-slate-500">
            Chưa có tài khoản?{" "}
            <Link href="/dang-ky" className="font-medium text-indigo-600 hover:underline">
              Đăng ký ngay
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

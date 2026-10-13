import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactRound } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const instant = false;

export default async function SignupPage() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/thiet-lap");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
            <ContactRound size={24} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Tạo tài khoản EventLead SI</h1>
          <p className="mt-1 text-sm text-slate-500">Miễn phí bắt đầu, quản lý danh thiếp theo tổ chức</p>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SignupForm />
          <p className="mt-5 text-center text-sm text-slate-500">
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-medium text-indigo-600 hover:underline">
              Đăng nhập
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

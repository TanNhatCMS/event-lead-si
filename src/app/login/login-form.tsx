"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const ERROR_VI: Record<string, string> = {
  "Invalid login credentials": "Email hoặc mật khẩu không đúng.",
  "Email not confirmed": "Email chưa được xác thực. Vui lòng kiểm tra hộp thư và bấm liên kết xác nhận.",
  "User not found": "Tài khoản không tồn tại.",
};

function mapError(message: string) {
  return ERROR_VI[message] ?? "Đăng nhập thất bại. Vui lòng thử lại.";
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setError("Chưa cấu hình Supabase. Vui lòng liên hệ quản trị viên.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(mapError(signInError.message));
        return;
      }
      // User chưa thuộc tổ chức nào -> về trang thiết lập tổ chức.
      try {
        const meResponse = await fetch("/api/auth/me");
        const me = (await meResponse.json()) as { has_membership?: boolean };
        router.replace(me.has_membership ? next : "/thiet-lap");
      } catch {
        router.replace(next);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="ban@congty.vn"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Mật khẩu
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 size={16} className="animate-spin" />}
        Đăng nhập
      </Button>
    </form>
  );
}

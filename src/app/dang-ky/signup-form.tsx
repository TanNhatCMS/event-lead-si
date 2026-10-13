"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const ERROR_VI: Record<string, string> = {
  "User already registered": "Email này đã được đăng ký. Vui lòng đăng nhập.",
  "Password should be at least 6 characters": "Mật khẩu phải có ít nhất 6 ký tự.",
  "Unable to validate email address: invalid format": "Địa chỉ email không hợp lệ.",
  "Signup requires a valid password": "Vui lòng nhập mật khẩu hợp lệ (ít nhất 6 ký tự).",
};

function mapError(message: string) {
  return ERROR_VI[message] ?? "Đăng ký thất bại. Vui lòng thử lại.";
}

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setError("Chưa cấu hình Supabase. Vui lòng liên hệ quản trị viên.");
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/thiet-lap`,
        },
      });
      if (signUpError) {
        setError(mapError(signUpError.message));
        return;
      }
      // Nếu email không cần xác nhận, phiên đăng nhập có ngay.
      if (data.session) {
        router.replace("/thiet-lap");
        router.refresh();
        return;
      }
      router.replace("/login?registered=1");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          placeholder="ban@congty.vn"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Mật khẩu
        </label>
        <div className="relative">
          <Input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="Ít nhất 6 ký tự"
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
      <div>
        <label htmlFor="signup-confirm" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nhập lại mật khẩu
        </label>
        <Input
          id="signup-confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          placeholder="Nhập lại mật khẩu"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 size={16} className="animate-spin" />}
        Tạo tài khoản
      </Button>
    </form>
  );
}

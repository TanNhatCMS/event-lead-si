"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      // Đăng xuất phía server để xóa cookie phiên httpOnly + cookie tổ chức.
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} title="Đăng xuất">
      {pending ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
      <span className="hidden sm:inline">Đăng xuất</span>
    </Button>
  );
}

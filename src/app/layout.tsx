import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EventLead SI — Hồ sơ đối tác từ danh thiếp",
  description:
    "Chuyển danh thiếp thành dữ liệu đối tác chuẩn hóa, có nguồn gốc và sẵn sàng tái sử dụng.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-[#f7f8fa] text-slate-900 antialiased">{children}</body>
    </html>
  );
}

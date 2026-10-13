"use client";

import { useState } from "react";
import { ScanLine, Upload } from "lucide-react";

import { cn } from "@kit/ui/utils";

import { CardUploadForm } from "./card-upload-form";
import { CardScanFlow } from "./card-scan-flow";

type TabId = "upload" | "scan";

/**
 * Hai lối vào bổ sung cho luồng nhập danh thiếp:
 * - "Tải ảnh lên": luồng upload signed URL hiện có (giữ nguyên).
 * - "Quét & nhận dạng": chụp/cắt ảnh → nhận dạng → người dùng kiểm tra & xác nhận.
 */
export function CardImportTabs() {
  const [tab, setTab] = useState<TabId>("scan");

  const tabs: Array<{ id: TabId; label: string; icon: typeof Upload; hint: string }> = [
    {
      id: "scan",
      label: "Quét & nhận dạng",
      icon: ScanLine,
      hint: "Chụp ảnh, cắt khung, xem kết quả máy đọc rồi xác nhận mới lưu.",
    },
    {
      id: "upload",
      label: "Tải ảnh lên",
      icon: Upload,
      hint: "Tải nhiều ảnh danh thiếp lên kho riêng của tổ chức.",
    },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Cách nhập danh thiếp" className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              tab === id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {tabs.find((t) => t.id === tab)?.hint}
      </p>

      {tab === "scan" ? <CardScanFlow /> : <CardUploadForm />}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { upsertModelConfigAction, type AiModelActionState, type CapabilityStatus } from "./actions";

/**
 * Form chỉnh sửa cấu hình model cho một capability.
 * Gửi qua server action `upsertModelConfigAction` (chỉ owner/admin).
 */
export function AiModelEditor({ capability }: { capability: CapabilityStatus }) {
  const [provider, setProvider] = useState(capability.provider);
  const [enabled, setEnabled] = useState(capability.enabled);
  const [configJson, setConfigJson] = useState(capability.configJson);
  const [state, formAction, pending] = useActionState(
    upsertModelConfigAction,
    null as AiModelActionState,
  );

  return (
    <form action={formAction} className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <input type="hidden" name="capability" value={capability.capability} />
      <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">Provider</label>
          <Select name="provider" value={provider} onValueChange={(v) => setProvider(v ?? "mock")} disabled={pending}>
            <SelectTrigger className="w-full" aria-label="Provider nhận dạng">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* TODO: provider OCR thật chưa được chọn — thêm option khi đăng ký provider mới trong getCardRecognitionProvider. */}
              <SelectItem value="mock">mock (giả lập, dữ liệu mẫu)</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-slate-500">Provider thật chưa được chọn, hiện chỉ có bản giả lập.</p>
        </div>
        <div>
          <label htmlFor={`model-${capability.capability}`} className="mb-1.5 block text-xs font-medium text-slate-700">
            Tên model <span className="font-normal text-slate-400">(tùy chọn)</span>
          </label>
          <Input
            id={`model-${capability.capability}`}
            name="model"
            defaultValue={capability.model ?? ""}
            placeholder="vd: gpt-4o-mini"
            maxLength={200}
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800">Bật nhận dạng</p>
          <p className="text-xs text-slate-500">
            Tắt để chặn gọi nhận dạng cho tổ chức này (route trả 503).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Bật nhận dạng"
          disabled={pending}
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-indigo-600" : "bg-slate-300",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
              enabled ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      <div>
        <label htmlFor={`config-${capability.capability}`} className="mb-1.5 block text-xs font-medium text-slate-700">
          Cấu hình JSON <span className="font-normal text-slate-400">(tùy chọn, phải là object)</span>
        </label>
        <Textarea
          id={`config-${capability.capability}`}
          name="configJson"
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          placeholder='{"timeout_ms": 30000}'
          rows={3}
          className="font-mono text-xs"
          disabled={pending}
        />
        <p className="mt-1 text-xs text-slate-500">
          Chỉ tham số không nhạy cảm. Tuyệt đối không nhập API key/secret vào đây.
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-emerald-600">{state.success}</p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Lưu cấu hình
        </Button>
      </div>
    </form>
  );
}

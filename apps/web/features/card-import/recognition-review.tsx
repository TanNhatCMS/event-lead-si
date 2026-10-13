"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  FileCheck,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@kit/ui/button";
import { Input } from "@kit/ui/input";
import { Spinner } from "@kit/ui/spinner";
import { Textarea } from "@kit/ui/textarea";
import { cn } from "@kit/ui/utils";

import type { RecognizedCard } from "~/lib/ai/card-recognition";

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// EnrichmentPanel nằm cùng thư mục features/card-import -> import tương đối.
import { DuplicateWarning } from "./duplicate-warning";
import { EnrichmentPanel } from "./enrichment-panel";
import type { EnrichableField } from "~/lib/ai/enrichment/types";

const FIELD_ORDER = [
  "fullName",
  "jobTitle",
  "companyName",
  "email",
  "phone",
  "address",
  "website",
] as const;

type FieldKey = (typeof FIELD_ORDER)[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  fullName: "Họ và tên",
  jobTitle: "Chức danh",
  companyName: "Công ty",
  email: "Email",
  phone: "Điện thoại",
  address: "Địa chỉ",
  website: "Website",
};

const FIELD_PLACEHOLDERS: Record<FieldKey, string> = {
  fullName: "VD: Nguyễn Văn An",
  jobTitle: "VD: Giám đốc Kinh doanh",
  companyName: "VD: Công ty Cổ phần Sao Việt",
  email: "VD: an.nguyen@saoviet.vn",
  phone: "VD: 0912 345 678",
  address: "VD: Tầng 12, Tòa nhà Bitexco, Quận 1, TP. Hồ Chí Minh",
  website: "VD: https://saoviet.vn",
};

const LANGUAGE_NAMES: Record<RecognizedCard["detectedLanguage"], string> = {
  vi: "Tiếng Việt",
  en: "Tiếng Anh",
  ko: "Tiếng Hàn",
  ja: "Tiếng Nhật",
  zh: "Tiếng Trung",
  unknown: "Không xác định",
};

function StateBadge({ state }: { state: "extracted" | "missing" | "uncertain" }) {
  if (state === "extracted") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Đã trích xuất
      </span>
    );
  }
  if (state === "uncertain") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        Chưa chắc chắn — kiểm tra kỹ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      Không có
    </span>
  );
}

interface RecognitionReviewProps {
  importId: string;
  provider: string;
  recognized: RecognizedCard;
  onConfirmed: (response: {
    contact_id: string;
    company_name?: string | null;
    share_url?: string | null;
  }) => void;
  onRescan: () => void;
}

/**
 * Bước nhận dạng — Người dùng xem, sửa từng trường, tick "đã kiểm tra" rồi bấm
 * XÁC NHẬN. Nút xác nhận CHỈ bật khi cả 7 trường đã được kiểm tra.
 *
 * HIẾN CHƯƠNG "con người kiểm soát": KHÔNG có code path nào tự lưu kết quả
 * nhận dạng. Hồ sơ chỉ được tạo khi người dùng bấm "Xác nhận & lưu hồ sơ".
 */
export function RecognitionReview({
  importId,
  provider,
  recognized,
  onConfirmed,
  onRescan,
}: RecognitionReviewProps) {
  const initialValues = useMemo(() => {
    const map: Record<FieldKey, string> = {} as Record<FieldKey, string>;
    for (const key of FIELD_ORDER) {
      map[key] = recognized.fields[key].normalizedValue ?? "";
    }
    return map;
  }, [recognized]);

  const [values, setValues] = useState<Record<FieldKey, string>>(initialValues);
  // Trường nào đã được người dùng xem qua (tick tay, hoặc tự động khi sửa giá trị).
  const [reviewed, setReviewed] = useState<Record<FieldKey, boolean>>(
    () => Object.fromEntries(FIELD_ORDER.map((k) => [k, false])) as Record<FieldKey, boolean>,
  );
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uncertainCount = FIELD_ORDER.filter(
    (key) => recognized.fields[key].state === "uncertain",
  ).length;
  const reviewedCount = FIELD_ORDER.filter((key) => reviewed[key]).length;
  const allReviewed = reviewedCount === FIELD_ORDER.length;

  const markReviewed = (key: FieldKey) =>
    setReviewed((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

  const handleChange = (key: FieldKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    markReviewed(key);
  };

  /**
   * Áp dụng gợi ý từ panel làm giàu AI: điền giá trị vào form và đánh dấu
   * trường đã review (dùng chung logic reviewedFields như sửa tay).
   */
  const handleApplyField = (field: EnrichableField, value: string) => {
    handleChange(field, value);
  };

  const handleConfirm = async () => {
    if (!allReviewed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/card-imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          provider,
          detectedLanguage: recognized.detectedLanguage,
          recognized,
          fields: Object.fromEntries(
            FIELD_ORDER.map((key) => [key, values[key].trim() || undefined]),
          ),
          reviewedFields: FIELD_ORDER.filter((key) => reviewed[key]),
          eventName: eventName.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { contact_id?: string; company_name?: string | null; share_url?: string | null; message?: string }
        | null;
      if (!res.ok || !body?.contact_id) {
        throw new Error(body?.message ?? `Xác nhận thất bại (mã ${res.status}).`);
      }
      onConfirmed({
        contact_id: body.contact_id,
        company_name: body.company_name ?? null,
        share_url: body.share_url ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileCheck className="h-5 w-5 text-indigo-600" /> Kiểm tra &amp; xác nhận
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Kết quả do máy đọc — <strong className="text-slate-800">chưa được lưu</strong>. Hãy
          sửa lại cho đúng, tick “Đã kiểm tra” từng trường rồi bấm “Xác nhận &amp; lưu hồ sơ”.
          Ngôn ngữ phát hiện: <strong>{LANGUAGE_NAMES[recognized.detectedLanguage]}</strong>.
        </p>
      </div>

      {provider === "mock" && (
        <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Đang dùng provider mẫu (mock) — kết quả là dữ liệu demo, provider OCR thật chưa được chọn.
        </p>
      )}

      <DuplicateWarning
        fullName={values.fullName}
        email={values.email}
        phone={values.phone}
      />

      {uncertainCount > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Có {uncertainCount} trường máy đọc chưa chắc chắn — vui lòng đối chiếu với ảnh gốc
          trước khi xác nhận.
        </p>
      )}

      <EnrichmentPanel recognized={recognized} onApply={handleApplyField} />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {FIELD_ORDER.map((key) => {
          const field = recognized.fields[key];
          const uncertain = field.state === "uncertain";
          return (
            <div
              key={key}
              className={cn(
                "space-y-2 rounded-xl border p-3",
                uncertain ? "border-amber-300 bg-amber-50/50" : "border-slate-200",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`field-${key}`} className="text-sm font-medium text-slate-800">
                  {FIELD_LABELS[key]}
                </label>
                <StateBadge state={field.state} />
              </div>
              {key === "address" ? (
                <Textarea
                  id={`field-${key}`}
                  value={values[key]}
                  placeholder={FIELD_PLACEHOLDERS[key]}
                  rows={2}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              ) : (
                <Input
                  id={`field-${key}`}
                  value={values[key]}
                  placeholder={FIELD_PLACEHOLDERS[key]}
                  inputMode={key === "phone" ? "tel" : key === "email" ? "email" : undefined}
                  autoComplete={
                    key === "fullName" ? "name" : key === "email" ? "email" : key === "phone" ? "tel" : undefined
                  }
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              )}
              {field.rawValue && field.rawValue !== field.normalizedValue && (
                <p className="text-xs text-slate-500">
                  Máy đọc thô: <span className="font-mono">{field.rawValue}</span>
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={reviewed[key]}
                  onChange={(e) =>
                    setReviewed((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="h-4 w-4 rounded accent-indigo-600"
                />
                <span className="inline-flex items-center gap-1">
                  {reviewed[key] && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  Đã kiểm tra trường này
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div className="space-y-2">
          <label htmlFor="event-name" className="text-sm font-medium text-slate-800">
            Sự kiện (tùy chọn)
          </label>
          <Input
            id="event-name"
            value={eventName}
            placeholder="VD: Triển lãm VietBuild 2026"
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="notes" className="text-sm font-medium text-slate-800">
            Ghi chú cuộc gặp (tùy chọn)
          </label>
          <Textarea
            id="notes"
            value={notes}
            placeholder="VD: Quan tâm giải pháp kho bãi, hẹn gọi lại tuần sau…"
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        Hệ thống <strong>không tự lưu</strong> kết quả máy đọc. Hồ sơ chỉ được tạo khi bạn bấm
        “Xác nhận &amp; lưu hồ sơ” bên dưới.
      </p>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={handleConfirm} disabled={saving || !allReviewed}>
          {saving ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Xác nhận &amp; lưu hồ sơ
          {!allReviewed && !saving && ` (${reviewedCount}/${FIELD_ORDER.length} trường đã kiểm tra)`}
        </Button>
        <Button variant="outline" onClick={onRescan} disabled={saving}>
          <ChevronLeft className="h-4 w-4" /> Quét thẻ khác / chụp lại
        </Button>
      </div>
    </div>
  );
}

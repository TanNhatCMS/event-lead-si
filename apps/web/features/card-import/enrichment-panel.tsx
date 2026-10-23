"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Info,
  Sparkles,
} from "lucide-react";

import { Button } from "@kit/ui/button";
import { Spinner } from "@kit/ui/spinner";
import { cn } from "@kit/ui/utils";
import type { RecognizedCard } from "~/lib/ai/card-recognition";
import type {
  EnrichableField,
  EnrichmentFinding,
  EnrichmentStep,
} from "~/lib/ai/enrichment/types";

const FIELD_LABELS: Record<EnrichableField, string> = {
  fullName: "Họ và tên",
  jobTitle: "Chức danh",
  companyName: "Công ty",
  email: "Email",
  phone: "Điện thoại",
  address: "Địa chỉ",
  website: "Website",
};

type PanelStatus = "idle" | "loading" | "done" | "error" | "not_configured";

/**
 * Trạng thái riêng của luồng chạy nền — tách khỏi PanelStatus để không phá
 * các điều kiện render hiện có dựa trên status === "loading"/"done"/"error".
 */
type BackgroundStatus = "idle" | "running" | "failed";

interface EnrichmentPanelProps {
  /** Kết quả OCR hiện tại ở bước review — agent dùng để gợi ý bổ sung. */
  recognized: RecognizedCard;
  /** Điền gợi ý vào trường tương ứng (và đánh dấu trường đã được xem qua). */
  onApply: (field: EnrichableField, value: string) => void;
  /** Nhãn trường tùy chọn — mặc định dùng FIELD_LABELS nội bộ. */
  fieldLabels?: Record<EnrichableField, string>;
}

/**
 * Panel "Bổ sung thông tin AI" trong bước review.
 *
 * AI chỉ GỢI Ý (findings kèm độ tin cậy + nguồn) — mỗi gợi ý có nút "Áp dụng"
 * để người dùng tự điền vào form. Không có code path nào tự ghi đè dữ liệu.
 */
export function EnrichmentPanel({ recognized, onApply, fieldLabels }: EnrichmentPanelProps) {
  const labels = fieldLabels ?? FIELD_LABELS;
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [findings, setFindings] = useState<EnrichmentFinding[]>([]);
  const [steps, setSteps] = useState<EnrichmentStep[]>([]);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [showSteps, setShowSteps] = useState(false);
  // Hạ tầng chạy nền (T008): runId của lần chạy nền hiện tại và trạng thái
  // poll riêng; kết quả khi completed vẫn đổ vào findings/steps/modelUsed ở trên.
  const [backgroundRunId, setBackgroundRunId] = useState<string | null>(null);
  const [bgStatus, setBgStatus] = useState<BackgroundStatus>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref gương của backgroundRunId để vòng poll kiểm tra race: tick thuộc
  // runId cũ (đã đổi lead / chạy lần mới / chạy đồng bộ) phải bị bỏ qua.
  const backgroundRunIdRef = useRef<string | null>(null);

  /** Dừng vòng poll nếu đang chạy — idempotent, gọi lại nhiều lần vẫn an toàn. */
  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Dừng poll khi component unmount để không setState sau khi đã huỷ.
  useEffect(() => {
    return () => {
      clearPoll();
    };
  }, [clearPoll]);

  // Đổi lead (recognized thay đổi): huỷ poll của lead cũ và reset trạng thái
  // chạy nền để không đổ kết quả của lead cũ vào lead mới.
  useEffect(() => {
    clearPoll();
    backgroundRunIdRef.current = null;
    setBackgroundRunId(null);
    setBgStatus("idle");
  }, [recognized, clearPoll]);

  /**
   * Poll trạng thái lần chạy nền mỗi ~2 giây tới khi completed/failed.
   * Kết quả completed đổ vào đúng state hiển thị hiện có (findings/steps/
   * modelUsed) để tái sử dụng đường gợi ý + nút Áp dụng của luồng đồng bộ.
   */
  const startPoll = useCallback(
    (runId: string) => {
      clearPoll();
      backgroundRunIdRef.current = runId;
      pollRef.current = setInterval(async () => {
        // Guard race: tick của runId cũ không còn là lần chạy hiện hành.
        if (backgroundRunIdRef.current !== runId) return;
        try {
          const res = await fetch(
            `/api/enrichment/runs/${encodeURIComponent(runId)}`,
          );
          if (backgroundRunIdRef.current !== runId) return;
          const body = (await res.json().catch(() => null)) as
            | {
                status?: string;
                result?: {
                  findings?: EnrichmentFinding[];
                  steps?: EnrichmentStep[];
                  modelUsed?: string | null;
                };
                findings?: EnrichmentFinding[];
                steps?: EnrichmentStep[];
                modelUsed?: string | null;
                error?: { message?: string };
                message?: string;
              }
            | null;
          if (backgroundRunIdRef.current !== runId) return;
          if (!res.ok) {
            clearPoll();
            setStatus("error");
            setError(
              body?.message ??
                `Không tra cứu được lần chạy nền (mã ${res.status}).`,
            );
            return;
          }
          if (body?.status === "running") {
            setBgStatus("running");
            return;
          }
          if (body?.status === "completed") {
            clearPoll();
            const result = body.result ?? body;
            setFindings(result.findings ?? []);
            setSteps(result.steps ?? []);
            setModelUsed(result.modelUsed ?? null);
            setApplied(new Set());
            setStatus("done");
            setBgStatus("idle");
            return;
          }
          if (body?.status === "failed") {
            clearPoll();
            setBgStatus("failed");
            setStatus("error");
            setError(body.error?.message ?? "Lần chạy nền thất bại.");
            return;
          }
          // Shape lạ (không phải running/completed/failed): dừng poll, báo lỗi.
          clearPoll();
          setStatus("error");
          setError(body?.message ?? "Không tra cứu được lần chạy nền.");
        } catch (err) {
          if (backgroundRunIdRef.current !== runId) return;
          clearPoll();
          setStatus("error");
          setError(
            err instanceof Error
              ? err.message
              : "Đã xảy ra lỗi không xác định.",
          );
        }
      }, 2000);
    },
    [clearPoll],
  );

  const handleRun = async () => {
    // Chạy đồng bộ huỷ poll nền cũ (nếu có) để hai luồng không tranh state.
    clearPoll();
    backgroundRunIdRef.current = null;
    setBackgroundRunId(null);
    setBgStatus("idle");
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/enrichment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recognized }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            findings?: EnrichmentFinding[];
            steps?: EnrichmentStep[];
            modelUsed?: string;
            code?: string;
            message?: string;
          }
        | null;
      if (!res.ok) {
        if (body?.code === "enrichment_not_configured") {
          setStatus("not_configured");
          setError(body.message ?? "Chức năng chưa được cấu hình.");
          return;
        }
        throw new Error(body?.message ?? `Bổ sung thất bại (mã ${res.status}).`);
      }
      setFindings(body?.findings ?? []);
      setSteps(body?.steps ?? []);
      setModelUsed(body?.modelUsed ?? null);
      setApplied(new Set());
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.");
      setStatus("error");
    }
  };

  /**
   * Chạy nền (T008): POST /api/enrichment/start để lấy runId ngay, không chờ
   * kết quả. Xử lý lỗi gương handleRun — 503 enrichment_not_configured về
   * trạng thái not_configured, lỗi khác về error. Poll trạng thái ở step sau.
   */
  const handleRunBackground = async () => {
    clearPoll();
    backgroundRunIdRef.current = null;
    setError(null);
    setBackgroundRunId(null);
    setBgStatus("idle");
    try {
      const res = await fetch("/api/enrichment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recognized }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            runId?: string;
            code?: string;
            message?: string;
          }
        | null;
      if (!res.ok) {
        if (body?.code === "enrichment_not_configured") {
          setStatus("not_configured");
          setError(body.message ?? "Chức năng chưa được cấu hình.");
          return;
        }
        setStatus("error");
        setError(body?.message ?? `Chạy nền thất bại (mã ${res.status}).`);
        return;
      }
      if (!body?.runId) {
        setStatus("error");
        setError(body?.message ?? `Chạy nền thất bại (mã ${res.status}).`);
        return;
      }
      setBackgroundRunId(body.runId);
      setBgStatus("running");
      startPoll(body.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.");
      setStatus("error");
    }
  };

  const handleApply = (finding: EnrichmentFinding) => {
    onApply(finding.field, finding.value);
    setApplied((prev) => new Set(prev).add(finding.field));
  };

  const confidenceColor = (confidence: number) =>
    confidence >= 0.8
      ? "bg-emerald-500"
      : confidence >= 0.5
        ? "bg-amber-500"
        : "bg-slate-400";

  return (
    <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Bổ sung thông tin AI
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {status !== "loading" && (
            <Button size="sm" variant="secondary" onClick={handleRun}>
              <Sparkles className="h-4 w-4" />
              {status === "done" ? "Chạy lại" : "Bổ sung thông tin AI"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRunBackground}
            disabled={status === "loading" || bgStatus === "running"}
          >
            Chạy nền
          </Button>
        </div>
      </div>
      <p className="text-xs leading-5 text-indigo-800/80">
        AI sẽ chuẩn hoá và gợi ý thêm thông tin từ dữ liệu đã quét (SĐT dạng +84,
        website công ty từ email…). Bạn xem từng gợi ý và bấm “Áp dụng” để điền
        vào trường — <strong>không tự lưu</strong>.
      </p>

      {status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-indigo-800">
          <Spinner className="h-4 w-4" />
          Đang phân tích và thu thập thông tin bổ sung…
        </p>
      )}

      {bgStatus === "running" && backgroundRunId && (
        <p className="flex items-center gap-2 text-sm text-indigo-800">
          <Spinner className="h-4 w-4" />
          Đang chạy nền…
        </p>
      )}

      {(status === "error" || status === "not_configured") && error && (
        <p
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            status === "not_configured"
              ? "bg-sky-50 text-sky-800"
              : "bg-rose-50 text-rose-700",
          )}
        >
          {status === "not_configured" ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {error}
        </p>
      )}

      {status === "done" && (
        <div className="space-y-3">
          {findings.length === 0 ? (
            <p className="text-sm text-slate-600">
              AI không tìm thêm được gợi ý đáng tin cậy nào từ dữ liệu hiện tại.
            </p>
          ) : (
            <ul className="space-y-2">
              {findings.map((finding, index) => {
                const appliedAlready = applied.has(finding.field);
                const percent = Math.round(finding.confidence * 100);
                return (
                  <li
                    key={`${finding.field}-${index}`}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">
                          {labels[finding.field]}
                        </p>
                        <p className="break-words text-sm font-medium text-slate-900">
                          {finding.value}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={appliedAlready ? "outline" : "default"}
                        onClick={() => handleApply(finding)}
                        disabled={appliedAlready}
                      >
                        {appliedAlready && <Check className="h-3.5 w-3.5" />}
                        {appliedAlready ? "Đã áp dụng" : "Áp dụng"}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn("h-full rounded-full", confidenceColor(finding.confidence))}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{percent}%</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Nguồn: {finding.source}
                      {finding.note ? ` — ${finding.note}` : ""}
                      {finding.sourceUrl && (
                        <>
                          {" · "}
                          <a
                            href={finding.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 underline hover:text-indigo-800"
                          >
                            Xem nguồn
                          </a>
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {steps.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowSteps((prev) => !prev)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", showSteps && "rotate-180")}
                />
                Quá trình ({steps.length} bước
                {modelUsed ? `, model ${modelUsed}` : ""})
              </button>
              {showSteps && (
                <ol className="mt-2 space-y-1 text-xs text-slate-500">
                  {steps.map((step) => (
                    <li key={step.step}>
                      Bước {step.step}:{" "}
                      {step.toolCalls.length > 0 ? (
                        step.toolCalls.map((call, i) => (
                          <span key={`${call.name}-${i}`}>
                            {i > 0 && ", "}
                            <span
                              title={call.note}
                              className={
                                call.status === "error"
                                  ? "font-medium text-red-600"
                                  : call.status === "unavailable"
                                    ? "font-medium text-amber-600"
                                    : undefined
                              }
                            >
                              {call.name}
                              {call.status === "error"
                                ? " ✗"
                                : call.status === "unavailable"
                                  ? " ⚠"
                                  : ""}
                            </span>
                          </span>
                        ))
                      ) : step.tools.length > 0 ? (
                        step.tools.join(", ")
                      ) : (
                        "tổng hợp kết luận"
                      )}{" "}
                      — {step.summary}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

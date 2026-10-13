import { redirect } from "next/navigation";
import { Database, ShieldAlert, Terminal } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { getOrganizationContext, hasOrganizationRole } from "@/lib/auth/organization";
import { cn } from "@/lib/utils";
import { AiModelEditor } from "./ai-model-editor";
import { listModelConfigs, type CapabilityStatus } from "./actions";

export const instant = false;

function SourceBadge({ source }: { source: CapabilityStatus["source"] }) {
  return source === "database" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
      <Database size={12} /> Lưu trong DB
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      <Terminal size={12} /> Biến môi trường
    </span>
  );
}

function CapabilityCard({ row }: { row: CapabilityStatus }) {
  return (
    <section
      key={row.capability}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{row.label}</h2>
          <p className="mt-1 text-sm text-slate-500">{row.description}</p>
        </div>
        <SourceBadge source={row.source} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium text-slate-500">Provider hiện tại</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{row.provider}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium text-slate-500">Model</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{row.model ?? "—"}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium text-slate-500">Trạng thái</dt>
          <dd className="mt-0.5">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                row.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600",
              )}
            >
              {row.enabled ? "Đang bật" : "Đang tắt"}
            </span>
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium text-slate-500">Env server hiện tại</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {row.envProvider} · {row.envEnabled ? "bật" : "tắt"}
          </dd>
        </div>
      </dl>

      <AiModelEditor key={row.updatedAt ?? "none"} capability={row} />
    </section>
  );
}

export default async function AiModelsPage() {
  const { user, membership } = await getOrganizationContext();
  if (!user) redirect("/login?next=/cai-dat/ai-models");
  if (!membership) redirect("/thiet-lap");

  if (!hasOrganizationRole(membership.role, ["owner", "admin"])) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert size={24} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">403 — Không có quyền truy cập</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Chỉ chủ sở hữu và quản trị viên của tổ chức mới được quản lý mô hình AI.
          </p>
        </div>
      </AppShell>
    );
  }

  const result = await listModelConfigs();
  const rows = result.ok ? result.rows : [];

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600">Cài đặt</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Mô hình AI</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Chọn provider và bật/tắt từng năng lực AI cho tổ chức. Cấu hình lưu trong
          database sẽ ghi đè biến môi trường của server. Không lưu API key hay secret ở đây.
        </p>
      </div>
      <div className="space-y-5">
        {rows.map((row) => (
          <CapabilityCard key={row.capability} row={row} />
        ))}
      </div>
    </AppShell>
  );
}

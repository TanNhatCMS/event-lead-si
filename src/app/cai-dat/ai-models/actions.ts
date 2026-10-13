"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationContext, hasOrganizationRole } from "@/lib/auth/organization";
import { isCardRecognitionEnabled } from "@/lib/ai/card-recognition";
import { getAiModelConfig, type AiModelConfigSource } from "@/lib/ai/model-config";

export type AiModelActionState = { error?: string; success?: string } | null;

type OrgSupabase = NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>["supabase"]>;

const CAPABILITIES = [
  {
    id: "card_recognition",
    label: "Nhận dạng danh thiếp",
    description: "Chuyển ảnh danh thiếp thành dữ liệu có cấu trúc ở tab Quét & nhận dạng.",
  },
] as const;

type CapabilityId = (typeof CAPABILITIES)[number]["id"];

const ALLOWED_CAPABILITIES: readonly string[] = CAPABILITIES.map((c) => c.id);

/**
 * Provider được phép chọn ở thời điểm hiện tại.
 *
 * TODO: provider OCR thật chưa được chọn và phê duyệt (plan.md Giai đoạn 0.3).
 * Khi đăng ký provider thật trong `getCardRecognitionProvider` (src/lib/ai/),
 * nhớ thêm tên provider mới vào danh sách này.
 */
const ALLOWED_PROVIDERS: readonly string[] = ["mock"];

const upsertSchema = z.object({
  capability: z.string().refine((v) => ALLOWED_CAPABILITIES.includes(v), {
    message: "Capability không được hỗ trợ.",
  }),
  provider: z.string().refine((v) => ALLOWED_PROVIDERS.includes(v), {
    message: "Provider chưa được triển khai. Hiện chỉ hỗ trợ \"mock\".",
  }),
  model: z
    .string()
    .trim()
    .max(200, "Tên model tối đa 200 ký tự.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  enabled: z.boolean(),
  configJson: z.string(),
});

async function requireAdmin() {
  const { supabase, user, membership } = await getOrganizationContext();
  if (!supabase || !user) redirect("/login?next=/cai-dat/ai-models");
  if (!membership) redirect("/thiet-lap");
  if (!hasOrganizationRole(membership.role, ["owner", "admin"])) {
    return {
      ok: false as const,
      state: { error: "Bạn không có quyền quản lý mô hình AI." } satisfies AiModelActionState,
    };
  }
  return {
    ok: true as const,
    supabase: supabase as OrgSupabase,
    orgId: membership.organization_id as string,
    role: membership.role as string,
  };
}

export interface CapabilityStatus {
  capability: string;
  label: string;
  description: string;
  /** Cấu hình đang có hiệu lực (DB ưu tiên, env fallback). */
  provider: string;
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
  /** Trạng thái env hiện tại của server (để so sánh với DB). */
  envProvider: string;
  envEnabled: boolean;
  /** Config JSON hiện có trong DB (chuỗi đã stringify, "" nếu chưa có). */
  configJson: string;
  /** updated_at của dòng DB, null khi chưa có dòng nào. */
  updatedAt: string | null;
}

export async function listModelConfigs(): Promise<{ ok: true; rows: CapabilityStatus[] } | { ok: false; reason: "login" | "no_org" | "forbidden" }> {
  const { supabase, user, membership } = await getOrganizationContext();
  if (!supabase || !user) return { ok: false, reason: "login" };
  if (!membership) return { ok: false, reason: "no_org" };
  if (!hasOrganizationRole(membership.role, ["owner", "admin"])) return { ok: false, reason: "forbidden" };

  const orgId = membership.organization_id as string;
  const rows: CapabilityStatus[] = [];
  for (const cap of CAPABILITIES) {
    const dbRow = await getAiModelConfig(cap.id, orgId, supabase as OrgSupabase);
    const envProvider = (process.env.CARD_RECOGNITION_PROVIDER ?? "").trim().toLowerCase() || "mock";
    const envEnabled = isCardRecognitionEnabled();
    rows.push({
      capability: cap.id,
      label: cap.label,
      description: cap.description,
      provider: dbRow ? dbRow.provider : envProvider,
      model: dbRow ? dbRow.model : null,
      enabled: dbRow ? dbRow.enabled : envEnabled,
      source: dbRow ? "database" : "env",
      envProvider,
      envEnabled,
      configJson: dbRow ? JSON.stringify(dbRow.config ?? {}, null, 2) : "",
      updatedAt: dbRow ? dbRow.updated_at : null,
    });
  }
  return { ok: true, rows };
}

/**
 * Tạo mới hoặc cập nhật cấu hình model cho tổ chức hiện tại.
 * Chỉ owner/admin. Secrets KHÔNG được lưu qua form này — cột `config` chỉ
 * chứa tham số không nhạy cảm.
 */
export async function upsertModelConfigAction(
  _prevState: AiModelActionState,
  formData: FormData,
): Promise<AiModelActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.state;

  const parsed = upsertSchema.safeParse({
    capability: String(formData.get("capability") ?? ""),
    provider: String(formData.get("provider") ?? ""),
    model: formData.get("model") ?? "",
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    configJson: String(formData.get("configJson") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  const { capability, provider, model, enabled, configJson } = parsed.data;

  let config: Record<string, unknown> = {};
  const trimmed = configJson.trim();
  if (trimmed.length > 0) {
    try {
      const value: unknown = JSON.parse(trimmed);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { error: "Cấu hình JSON phải là một object (ví dụ {\"timeout_ms\": 30000})." };
      }
      config = value as Record<string, unknown>;
    } catch {
      return { error: "Cấu hình JSON không hợp lệ. Kiểm tra lại cú pháp." };
    }
  }

  const { error } = await guard.supabase.from("ai_model_configs").upsert(
    {
      organization_id: guard.orgId,
      capability,
      provider,
      model,
      enabled,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,capability" },
  );
  if (error) {
    return { error: `Không lưu được cấu hình: ${error.message}` };
  }

  revalidatePath("/cai-dat/ai-models");
  return { success: "Đã lưu cấu hình mô hình AI." };
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lưu và kiểm tra sở hữu lần chạy enrichment nền — spec 003 FR-015,
 * quyết định cuối D5 **phương án (b)** (người dùng chốt tại cổng T014
 * ngày 2026-10-24, thay phương án (a) "chỉ cần đăng nhập" trước đó).
 *
 * Bảng `enrichment_runs` (migration 20261024053000_enrichment_runs.sql)
 * chỉ chứa quan hệ sở hữu tối thiểu (run_id → user_id); input/kết quả
 * của lần chạy vẫn thuộc về event log của Workflow World.
 *
 * Client được truyền qua tham số: route dùng **server admin client**
 * (service-role, RLS bật và không có policy cho authenticated nên chỉ
 * service-role đọc/ghi được) rồi tự so `user_id` trong code; test dùng
 * client giả. Client được nới về SupabaseClient không generic vì bảng
 * chưa có trong `database.types.ts` (chỉ có sau khi áp migration và
 * chạy lại `pnpm run supabase:typegen`).
 */
type OwnershipClient = SupabaseClient;

interface EnrichmentRunRow {
  user_id: string;
}

/**
 * Ghi mapping run → user ngay sau khi start run thành công.
 * Trả `false` khi ghi thất bại (kể cả khi bảng chưa tồn tại vì migration
 * chưa được áp dụng) — caller PHẢI coi đó là lỗi cứng: không phát hành
 * một `runId` mà không ai tra cứu được (fail-closed).
 */
export async function recordRunOwner(
  supabase: OwnershipClient,
  runId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("enrichment_runs")
    .insert({ run_id: runId, user_id: userId });
  return !error;
}

export type RunOwnership = "owner" | "not_found" | "forbidden" | "unavailable";

/**
 * Kiểm tra sở hữu trước khi tra cứu trạng thái run:
 * - `owner`: run thuộc về đúng người dùng đang hỏi.
 * - `not_found`: chưa có mapping (run không tồn tại, hoặc run tạo trước
 *   khi cơ chế sở hữu có hiệu lực) → route trả 404.
 * - `forbidden`: run thuộc về người dùng khác → route cũng trả 404
 *   (không lộ sự tồn tại của run của người khác).
 * - `unavailable`: đọc bảng lỗi → route trả 500, không đoán bừa.
 */
export async function checkRunOwnership(
  supabase: OwnershipClient,
  runId: string,
  userId: string,
): Promise<RunOwnership> {
  const { data, error } = await supabase
    .from("enrichment_runs")
    .select("user_id")
    .eq("run_id", runId)
    .maybeSingle<EnrichmentRunRow>();

  if (error) return "unavailable";
  if (!data) return "not_found";
  return data.user_id === userId ? "owner" : "forbidden";
}

import { z } from 'zod';

/**
 * Cấu hình danh bạ per user lưu trong `agent_config.settings` (jsonb —
 * migration 20261027110000_user_settings.sql). Shape:
 *
 * { labels: string[], stages: [{ id, label }], retention_days: number | null }
 *
 * - labels: nhãn người dùng tự định nghĩa cho contact (FR-014).
 * - stages: các giai đoạn quan hệ hiển thị trong UI (id khớp
 *   `relationship_stage` trên bảng contacts).
 * - retention_days: số ngày giữ liên hệ đã lưu trữ trước khi dọn (FR-024);
 *   null = KHÔNG tự dọn.
 *
 * File này chứa mặc định + validate cho API `/api/agent/config` (PATCH nhận
 * `{ settings }`, MERGE theo top-level key) và điểm đọc dùng chung
 * (`/api/contacts/cleanup`).
 */

/** Một giai đoạn quan hệ: id slug ổn định (khớp DB) + nhãn hiển thị. */
export type ContactStageOption = {
  id: string;
  label: string;
};

/** Shape `agent_config.settings`. Dùng type alias (không interface) để gán
 * trực tiếp vào cột jsonb `NonNullable<Json>` khi update qua supabase-js. */
export type ContactSettings = {
  labels: string[];
  stages: ContactStageOption[];
  /** null = không bật tự dọn dữ liệu. */
  retention_days: number | null;
};

export const CONTACT_SETTINGS_LIMITS = {
  maxLabels: 20,
  maxLabelLength: 40,
  maxStages: 12,
  maxStageIdLength: 40,
  maxStageLabelLength: 40,
  minRetentionDays: 1,
  maxRetentionDays: 3650,
} as const;

/** Nhãn mặc định khi user chưa cấu hình (FR-014). */
export const DEFAULT_CONTACT_LABELS: string[] = [
  'VIP',
  'Khách hàng tiềm năng',
  'Đối tác',
  'Cần theo dõi',
];

/** 6 giai đoạn ứng dụng đang dùng (khớp STAGE_IDS trong /api/dashboard/stats
 * và STAGES trong features/contacts). */
export const DEFAULT_CONTACT_STAGES: ContactStageOption[] = [
  { id: 'new', label: 'Mới' },
  { id: 'contacted', label: 'Đã liên hệ' },
  { id: 'meeting', label: 'Đã gặp' },
  { id: 'negotiating', label: 'Đang đàm phán' },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'lost', label: 'Không tiếp tục' },
];

export function defaultContactSettings(): ContactSettings {
  return {
    labels: [...DEFAULT_CONTACT_LABELS],
    stages: DEFAULT_CONTACT_STAGES.map((stage) => ({ ...stage })),
    retention_days: null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Nhãn hợp lệ: chuỗi không rỗng, không quá 40 ký tự, bỏ trùng (giữ thứ tự). */
function sanitizeStoredLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const label = item.trim();
    if (!label || label.length > CONTACT_SETTINGS_LIMITS.maxLabelLength) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= CONTACT_SETTINGS_LIMITS.maxLabels) break;
  }
  return out;
}

function sanitizeStoredStages(value: unknown): ContactStageOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ContactStageOption[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!id || !label) continue;
    if (id.length > CONTACT_SETTINGS_LIMITS.maxStageIdLength) continue;
    if (label.length > CONTACT_SETTINGS_LIMITS.maxStageLabelLength) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
    if (out.length >= CONTACT_SETTINGS_LIMITS.maxStages) break;
  }
  return out;
}

/** retention_days hợp lệ: số nguyên trong [1, 3650]. Mọi giá trị khác
 * (null, sai kiểu, ngoài khoảng) → null = không tự dọn. */
function sanitizeStoredRetentionDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < CONTACT_SETTINGS_LIMITS.minRetentionDays) return null;
  if (value > CONTACT_SETTINGS_LIMITS.maxRetentionDays) return null;
  return value;
}

/**
 * Đọc settings thô từ jsonb thành shape đầy đủ: key thiếu/không hợp lệ được
 * thay bằng mặc định (trừ labels rỗng — user chủ động xóa hết nhãn là hợp lệ).
 */
export function normalizeContactSettings(raw: unknown): ContactSettings {
  const settings = defaultContactSettings();
  if (!isPlainObject(raw)) return settings;

  if (Array.isArray(raw.labels)) {
    settings.labels = sanitizeStoredLabels(raw.labels);
  }
  if (Array.isArray(raw.stages)) {
    const stages = sanitizeStoredStages(raw.stages);
    // stages rỗng vô nghĩa (filter/dashboard cần ít nhất 1 giai đoạn) → giữ mặc định.
    if (stages.length > 0) settings.stages = stages;
  }
  if ('retention_days' in raw) {
    settings.retention_days = sanitizeStoredRetentionDays(raw.retention_days);
  }
  return settings;
}

// ---------------------------------------------------------------------------
// PATCH validation (strict) — dùng cho /api/agent/config PATCH
// ---------------------------------------------------------------------------

const labelPatchSchema = z
  .string()
  .trim()
  .min(1, 'Nhãn không được để trống.')
  .max(CONTACT_SETTINGS_LIMITS.maxLabelLength, 'Nhãn tối đa 40 ký tự.');

const stagePatchSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Mã giai đoạn không được để trống.')
    .max(CONTACT_SETTINGS_LIMITS.maxStageIdLength, 'Mã giai đoạn tối đa 40 ký tự.')
    .regex(
      /^[a-z0-9_-]+$/,
      'Mã giai đoạn chỉ gồm chữ thường, số, gạch ngang và gạch dưới.',
    ),
  label: z
    .string()
    .trim()
    .min(1, 'Tên giai đoạn không được để trống.')
    .max(CONTACT_SETTINGS_LIMITS.maxStageLabelLength, 'Tên giai đoạn tối đa 40 ký tự.'),
});

/** Schema PATCH `settings` — mọi key đều optional (MERGE theo key). */
export const contactSettingsPatchSchema = z.object({
  labels: z.array(labelPatchSchema).max(CONTACT_SETTINGS_LIMITS.maxLabels, 'Tối đa 20 nhãn.').optional(),
  stages: z
    .array(stagePatchSchema)
    .max(CONTACT_SETTINGS_LIMITS.maxStages, 'Tối đa 12 giai đoạn.')
    .optional(),
  retention_days: z
    .number()
    .int('Số ngày lưu trữ phải là số nguyên.')
    .min(CONTACT_SETTINGS_LIMITS.minRetentionDays, 'Số ngày lưu trữ tối thiểu 1 ngày.')
    .max(CONTACT_SETTINGS_LIMITS.maxRetentionDays, 'Số ngày lưu trữ tối đa 3650 ngày.')
    .nullable()
    .optional(),
});

export type ContactSettingsPatchInput = z.infer<typeof contactSettingsPatchSchema>;

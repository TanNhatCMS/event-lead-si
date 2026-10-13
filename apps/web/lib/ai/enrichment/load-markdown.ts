import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Thư mục chứa file này (apps/web/lib/ai/enrichment) — các file .md nằm
// trong prompts/ và skills/ ngay bên cạnh. Dùng import.meta.url thay vì
// process.cwd() để không phụ thuộc thư mục chạy lệnh.
const ENRICHMENT_DIR = dirname(fileURLToPath(import.meta.url));

const cache = new Map<string, string>();

/**
 * Đọc file markdown trong thư mục enrichment (`skills/`, `prompts/`).
 *
 * System prompt và mô tả skill của agent được viết ra file .md để dễ xem/sửa
 * mà không cần đụng code; code chỉ load nội dung vào lúc chạy. Kết quả được
 * cache trong bộ nhớ sau lần đọc đầu tiên.
 *
 * Ném lỗi rõ ràng nếu file thiếu hoặc rỗng — fail fast thay vì chạy agent
 * với prompt/skill trống.
 */
export function loadEnrichmentMarkdown(relativePath: string): string {
  const cached = cache.get(relativePath);
  if (cached !== undefined) return cached;

  const fullPath = join(ENRICHMENT_DIR, relativePath);
  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    throw new Error(
      `Không đọc được file markdown của enrichment agent: ${relativePath} (đã thử ${fullPath})`
    );
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error(`File markdown của enrichment agent rỗng: ${relativePath}`);
  }
  cache.set(relativePath, trimmed);
  return trimmed;
}

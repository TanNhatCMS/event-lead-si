import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Thư mục chứa file này (apps/web/lib/ai/enrichment) — các file .md nằm
// trong prompts/ và skills/ ngay bên cạnh. Dùng import.meta.url thay vì
// process.cwd() để không phụ thuộc thư mục chạy lệnh.
const ENRICHMENT_DIR = dirname(fileURLToPath(import.meta.url));

// Khi module này bị eve biên dịch vào thư mục cache của nó
// (node_modules/.cache/eve/authored-modules), đường dẫn theo import.meta.url
// không còn trỏ tới cây nguồn — fallback sang cây nguồn tính từ cwd
// (eve chạy service từ thư mục gốc của app web).
const FALLBACK_DIR = join(process.cwd(), "lib/ai/enrichment");

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

  const candidates = [
    join(ENRICHMENT_DIR, relativePath),
    join(FALLBACK_DIR, relativePath),
  ];
  let content: string | null = null;
  for (const fullPath of candidates) {
    try {
      content = readFileSync(fullPath, "utf-8");
      break;
    } catch {
      // thử ứng viên tiếp theo
    }
  }
  if (content === null) {
    throw new Error(
      `Không đọc được file markdown của enrichment agent: ${relativePath} (đã thử ${candidates.join(", ")})`
    );
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error(`File markdown của enrichment agent rỗng: ${relativePath}`);
  }
  cache.set(relativePath, trimmed);
  return trimmed;
}

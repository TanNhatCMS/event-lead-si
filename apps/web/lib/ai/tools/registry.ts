/**
 * Tool registry — bóc tách từ ZCode
 * (`apps/zcode-cli/packages/core/src/tool/registry.ts` + `handlers/index.ts`).
 *
 * ZCode đăng ký mọi tool (built-in, MCP, skill) vào một registry tập trung
 * với metadata (tên, mô tả, readOnly, riskLevel, needsApproval...), cho phép
 * thêm/bớt/ẩn tool động theo ngữ cảnh (tool visibility).
 *
 * Bản port này giữ lại phần lõi phù hợp với app web: đăng ký tập trung,
 * metadata phân loại, và tra cứu theo nhóm. Không port phần permission
 * prompt kiểu CLI (app chạy server-side, tool nào nguy hiểm thì không
 * đưa vào registry ngay từ đầu).
 */

export type ToolCategory =
  | "web" // web_search, web_fetch — ra mạng ngoài
  | "media" // đọc ảnh/pdf/video
  | "internal" // hàm thuần nội bộ (chuẩn hoá SĐT, suy domain...)
  | "organization" // todo, cron, lịch
  | "interaction" // hỏi người dùng, plan mode
  | "multi-agent" // spawn subagent, nhắn tin giữa agent
  | "skill" // gọi skill ngoài
  | "workflow"; // tool quản lý workflow

export type ToolRiskLevel = "low" | "medium" | "high";

export interface ToolMetadata {
  /** Tên tool như agent nhìn thấy, VD "web_fetch". */
  name: string;
  /** Mô tả ngắn cho agent. */
  description: string;
  category: ToolCategory;
  /** true khi tool chỉ đọc, không thay đổi trạng thái bên ngoài. */
  readOnly: boolean;
  riskLevel: ToolRiskLevel;
  /**
   * ZCode dùng để bật prompt xin phép kiểu CLI. Trong app web, tool có
   * needsApproval=true KHÔNG được tự chạy ngầm — kết quả của nó chỉ dùng
   * để gợi ý, người dùng duyệt mới áp dụng (đúng hiến chương human-review).
   */
  needsApproval: boolean;
  /** Nguồn gốc: port từ ZCode hay tool riêng của EventLead. */
  origin: "zcode-port" | "eventlead";
}

export interface ToolEntry {
  metadata: ToolMetadata;
  /** Đối tượng tool của Vercel AI SDK (`tool({...})`). */
  tool: unknown;
}

export class ToolRegistry {
  private entries = new Map<string, ToolEntry>();

  register(entry: ToolEntry): void {
    const name = entry.metadata.name;
    if (this.entries.has(name)) {
      console.warn(`[tools] Tool "${name}" đã đăng ký — ghi đè.`);
    }
    this.entries.set(name, entry);
  }

  unregister(name: string): void {
    this.entries.delete(name);
  }

  get(name: string): ToolEntry | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  list(): ToolEntry[] {
    return [...this.entries.values()];
  }

  listByCategory(category: ToolCategory): ToolEntry[] {
    return this.list().filter((e) => e.metadata.category === category);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }
}

/** Registry dùng chung cho các agent trong app. */
export const toolRegistry = new ToolRegistry();

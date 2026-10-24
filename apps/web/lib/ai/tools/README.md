# Hệ tool — bóc tách từ ZCode

Nguồn: `zai-org/ZCode` v3.14.3
(`apps/zcode-cli/packages/core/src/tool/` — registry, handlers, permission).

## Đã port

| ZCode | Trong app | Ghi chú |
|---|---|---|
| `ToolRegistry` (`tool/registry.ts`) | `registry.ts` | Đăng ký tập trung + metadata (category, readOnly, riskLevel, needsApproval, origin). |
| `builtInTools` + `registerBuiltInTools()` (`tool/handlers/index.ts`) | `index.ts` + đăng ký trong `enrichment/tools.ts` | Gom tool dùng chung một chỗ, idempotent. |
| WebFetch (`tool/handlers/webfetch*.ts`) | `webfetch.ts` | Fetch URL → text đọc được, giới hạn ký tự, timeout 30s, cache 5 phút. |
| Egress guard (`webfetch-egress-guard.ts`) | `egress-guard.ts` | Chặn localhost/IP private/loopback/link-local (kể cả 169.254.169.254 metadata), resolve DNS chống rebinding. |
| Pre-approved hosts (`webfetch-preapproved.ts`) | `WEBFETCH_ALLOWLIST` / `WEBFETCH_BLOCKLIST` | Env config thay vì hardcode. |

Tool mới cho enrichment agent: **`web_fetch`** — sau `web_search` hoặc
`extract_company_domain`, agent đọc nội dung thật của trang để phát hiện
lĩnh vực, quy mô, sản phẩm/dịch vụ chính xác hơn (trước đây chỉ có snippet).

## Khái niệm ZCode đã có sẵn trong app (không cần port code)

| ZCode | Tương đương trong app |
|---|---|
| Skill tool + markdown skill | `enrichment/skills/*.md` + `loadEnrichmentMarkdown` — đúng pattern "sửa .md là đổi hành vi agent" |
| AskUserQuestion / PlanMode | Human-in-the-loop của web app: bước review trước khi lưu, draft soạn sẵn chờ duyệt, không tự gửi |
| read-image | Vision provider (OCR bằng model AI xem ảnh) |
| WebSearch | Đã có 3 backend (`SEARCH_PROVIDER=tool\|api\|fetch`) |

## Chủ động không port (không hợp với app)

| ZCode | Lý do |
|---|---|
| Read/Write/Edit/Glob/Grep/Bash/js | Agent chạy trong server route, không thao tác file/shell của máy chủ |
| TodoRead/TodoWrite | Loop enrichment ngắn (tối đa 6 steps), chưa cần quản lý todo |
| Cron | Nhu cầu nhắc lịch đã có `meeting_notes.due_at` + trang follow-up |
| Multi-agent (Agent/Task, SendMessage, Escalate...) | Enrichment một card không cần fan-out subagent |
| Workflow tools (10 tools) | App chưa có workflow do người dùng tự định nghĩa |
| read-pdf/read-video | App chỉ xử lý ảnh card visit |

## Env liên quan

- `WEBFETCH_ALLOWLIST`: danh sách domain được fetch, phân cách dấu phẩy (tùy chọn; khi đặt thì chỉ các domain này được phép).
- `WEBFETCH_BLOCKLIST`: domain không bao giờ được fetch.

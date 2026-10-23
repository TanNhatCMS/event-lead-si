# Contract API: Khởi chạy & tra cứu lần chạy làm giàu nền

Áp dụng cho spec 003. Hai endpoint mới; endpoint đồng bộ hiện có
`POST /api/enrichment/run` **không đổi contract** (giữ làm fallback — FR-013).

Quy ước chung (gương route `/run` hiện tại):

- Mọi response JSON đều kèm `request_id` (uuid do server sinh).
- Lỗi trả dạng `{ code, message, request_id }` với `message` tiếng Việt thân thiện.
- Cả 2 endpoint đều yêu cầu đăng nhập (Supabase session như route `/run`):
  chưa xác thực → **401** `{ code: "unauthorized", message: "Vui lòng đăng nhập." }`,
  không tạo run / không lộ dữ liệu run nào (FR-003, AC-002).

---

## 1. POST /api/enrichment/start

Khởi chạy làm giàu ở chế độ nền và trả `runId` ngay, không chờ kết quả (FR-001, FR-002, AC-001).

### Request

`Content-Type: application/json`. Body **gương đúng** route `/run`:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `recognized` | `RecognizedCard` | 1 trong 3 | Dữ liệu danh thiếp đã nhận dạng gửi kèm trực tiếp. |
| `fields` | `RecognizedCard` | — | Alias của `recognized` (tương thích spec cũ). |
| `cardImportId` | string (uuid) | 1 trong 3 | Id bản ghi quét danh thiếp **của đúng người dùng đang đăng nhập**; server đọc `card_imports.recognition_result` và **chốt input ngay tại start** (FR-014). |

### Response

| Trường hợp | Status | Body |
|---|---|---|
| Thành công | **201** | `{ runId: string, request_id }` |
| Body không phải JSON | 400 | `{ code: "invalid_request", message: "Yêu cầu phải là JSON.", request_id }` |
| Thiếu dữ liệu / sai schema / `cardImportId` không phải uuid | 400 | `{ code: "invalid_request", message: <chi tiết>, request_id }` |
| Chưa đăng nhập | 401 | `{ code: "unauthorized", ... }` |
| `cardImportId` không tồn tại hoặc không thuộc người dùng | 404 | `{ code: "import_not_found", message: "Không tìm thấy bản ghi quét danh thiếp.", request_id }` |
| Dữ liệu đã lưu không dùng được (không có snapshot hợp lệ, không có `confirmed`) | 422 | `{ code: "invalid_snapshot", message: "Dữ liệu quét đã lưu không dùng được cho làm giàu.", request_id }` |
| Enrichment chưa được cấu hình | 503 | `{ code: "enrichment_not_configured", message: <từ checkEnrichmentConfigured>, request_id }` — **không tạo run** (đã chốt: spec FR-001, quyết định D4 ở `plan.md` §6) |

Mọi trường hợp lỗi trên đều **không tạo lần chạy nào** (FR-001).

### Hành vi phía server

1. Auth → parse + validate body (schema giống route `/run`).
2. Nếu có `cardImportId`: đọc & chốt `RecognizedCard` (ưu tiên `recognized_snapshot`
   hợp lệ; fallback dựng từ `confirmed` như route `/run`).
3. Kiểm tra `checkEnrichmentConfigured(user.id, supabase)` → 503 nếu chưa cấu hình.
4. `start(enrichLeadWorkflow, [recognized, user.id])` (từ `workflow/api`) → trả `runId`.

---

## 2. GET /api/enrichment/runs/[runId]

Tra cứu trạng thái và kết quả của một lần chạy (FR-007..FR-010, AC-005, AC-008).

### Request

- Path param: `runId` (string, do POST start trả về).
- Không có body.

### Response

| Trường hợp | Status | Body |
|---|---|---|
| Đang chạy (mọi trạng thái chưa kết thúc) | 200 | `{ status: "running", request_id }` — **không** kèm `result` |
| Hoàn thành | 200 | `{ status: "completed", result: EnrichmentResult, request_id }` |
| Thất bại | 200 | `{ status: "failed", error: { message: string }, request_id }` |
| Chưa đăng nhập | 401 | `{ code: "unauthorized", message: "Vui lòng đăng nhập.", request_id }` |
| `runId` không tồn tại | 404 | `{ code: "run_not_found", message: "Không tìm thấy lần chạy.", request_id }` |

`result` ở trạng thái hoàn thành có **cùng cấu trúc** với body 200 của
`POST /api/enrichment/run`: đối tượng `EnrichmentResult` (theo
`enrichmentResultSchema` ở `apps/web/lib/ai/enrichment/types.ts`) — gồm `findings[]`
(mỗi finding: `field`, `value`, `confidence`, `source`, `sourceUrl?`, `note?`),
`steps[]`, thông tin model đã dùng. Chỉ yêu cầu tương đương **cấu trúc**, không yêu
cầu trùng nội dung findings giữa các lần chạy (AC-005).

Trạng thái `failed` vẫn trả HTTP 200 vì việc *tra cứu* thành công — lỗi thuộc về
lần chạy, không thuộc về request tra cứu.

### Ánh xạ trạng thái SDK → API (FR-007)

| Trạng thái run phía Workflow SDK (`getRun` từ `workflow/api`) | `status` trả về |
|---|---|
| `pending`, `running`, và mọi trạng thái chưa kết thúc khác | `running` |
| `completed` (kết quả lấy qua `run.returnValue`) | `completed` + `result` |
| `failed` (chi tiết lấy qua `run.error`) | `failed` + `error.message` |
| Không tìm thấy run / `getRun` báo lỗi không tồn tại | HTTP 404 `run_not_found` |

### Quyền sở hữu

v1 (hệ thống single-user) — **đã chốt theo phương án (a)** (spec FR-015 bản đã sửa
ở vòng sửa audit 2026-10-23, quyết định D5 ở `plan.md` §6): chỉ yêu cầu đã đăng
nhập; v1 không lưu mapping run→user và không kiểm tra run thuộc về đúng người
dùng nào khi tra cứu. Hệ quả được chấp nhận tường minh ở v1: tài khoản đã đăng
nhập khác, nếu biết `runId`, tra cứu được lần chạy đó — chỉ chấp nhận được vì
triển khai hiện tại là single-user. Client không được hiển thị `runId` cho bên
thứ ba; `runId` do SDK sinh, khó đoán. Khi hệ thống chuyển đa người dùng, contract
này phải được sửa trước khi mở: tra cứu lệch sở hữu trả 404/403, kèm kiểm thử
chéo 2 tài khoản (điều kiện bắt buộc tại FR-015).

---

## 3. Bất biến áp dụng cho cả 2 endpoint

- Kết quả enrichment chỉ là **gợi ý** (findings + confidence + nguồn). Không endpoint
  nào trong contract này ghi/cập nhật dữ liệu contact (FR-012, hiến chương II).
- Hành vi xác thực và nhóm mã lỗi vào (400/404/422/503) của POST start phải **khớp**
  route `/run` hiện tại để UI dùng chung logic hiển thị lỗi.

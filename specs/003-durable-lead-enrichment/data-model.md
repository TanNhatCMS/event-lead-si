# Mô hình dữ liệu: 003 — Làm giàu dữ liệu lead bền vững

## Kết luận trước

Feature này **không thêm bảng, không migration, không đổi schema** nào trong
Supabase. Nó chỉ thêm một thực thể khái niệm — **Lần chạy làm giàu (Enrichment Run)** —
do Workflow SDK quản lý trong "World" của nó, cộng với việc tái sử dụng nguyên vẹn
các kiểu dữ liệu enrichment hiện có.

## Thực thể mới: Enrichment Run (do SDK quản lý, không phải bảng của app)

| Thuộc tính | Kiểu | Mô tả / ràng buộc |
|---|---|---|
| `runId` | string (SDK sinh) | Định danh duy nhất của lần chạy, trả cho người dùng ngay khi start (FR-002). Khó đoán; là căn cứ tra cứu duy nhất ở v1 theo quyết định đã chốt D5 / phương án (a) ở spec FR-015 (v1 single-user không lưu mapping run→user — xem ràng buộc ở cuối file). |
| `status` | SDK: `pending`/`running`/`completed`/`failed`/… → API của app: `running` / `completed` / `failed` | Ánh xạ theo FR-007 — xem `contracts/api-enrichment-workflow.md`. |
| `input.recognized` | `RecognizedCard` (schema hiện có `recognizedCardSchema`, `~/lib/ai/card-recognition`) | Bản **chốt tại thời điểm start** (FR-014): hoặc client gửi kèm (`recognized`/`fields`), hoặc hệ thống đọc từ `card_imports.recognition_result` của đúng `user_id` rồi chốt. Thay đổi sau đó của bản ghi gốc không ảnh hưởng run. Được ghi vào event log của World — phải serialize được (plain JSON, thoả). |
| `input.userId` | string (uuid người dùng đã xác thực) | Lấy từ phiên đăng nhập tại start, **không** lấy từ body. Dùng trong step để đọc cấu hình model của đúng người dùng. |
| `result` | `EnrichmentResult` (schema hiện có ở `apps/web/lib/ai/enrichment/types.ts`) | Chỉ có khi `completed`: `findings[]` (field, value, confidence 0–1, source, sourceUrl?, note?), `steps[]`, model đã dùng. Giống hệt cấu trúc response của route đồng bộ (FR-008). |
| `error` | thông tin lỗi (message) | Chỉ có khi `failed`, sau khi hết retry hoặc gặp `FatalError` (FR-009). |

**Nơi lưu trữ**: event log của World. Ở v1/dev là **Local World — filesystem local**
của máy chạy app (zero-config). Production: theo QĐ-MỞ-001 chưa chốt (Vercel World
managed hoặc Postgres World tự host) — lưu ý event log chứa dữ liệu danh thiếp
(dữ liệu cá nhân) nên nơi lưu là tiêu chí rà soát quyền riêng tư của quyết định đó
(hiến chương, nguyên tắc III).

**Vòng đời**: `start` → (pending/running) → `completed` | `failed`. Không có trạng
thái huỷ trong v1 (huỷ run ngoài phạm vi spec). Run đã `completed` không bao giờ bị
thực thi lại; kết quả tra cứu lại được nguyên vẹn (FR-005).

## Thực thể hiện có được tái sử dụng (không thay đổi)

| Thực thể / kiểu | Vị trí | Vai trò trong feature |
|---|---|---|
| `RecognizedCard` | `apps/web/lib/ai/card-recognition` | Input đã chốt của run. |
| `EnrichmentResult`, `EnrichmentFinding`, `EnrichmentStep` | `apps/web/lib/ai/enrichment/types.ts` (zod schemas) | Kết quả của run; finding luôn kèm confidence + source (hiến chương I). |
| `card_imports.recognition_result` (`recognized_snapshot` / `confirmed`) | Bảng hiện có | Nguồn đọc input khi start bằng `cardImportId`; chỉ **đọc**, theo đúng `user_id` như route `/run` hiện tại. |
| `ai_model_configs` (capability `lead_enrichment`) | Bảng hiện có | Step đọc qua `runEnrichmentLoop` như hiện tại — không đổi cách resolve model/key. |

## Ràng buộc bất biến

- **Không thực thể đích nào bị ghi**: run hoàn thành **không** tạo/cập nhật contact,
  không cập nhật `card_imports` (FR-012, hiến chương II). Dữ liệu liên hệ chỉ đổi
  qua thao tác Áp dụng hiện có trên UI, ngoài phạm vi của run.
- **Không quan hệ DB mới ở v1**: `runId` không được lưu vào bất kỳ bảng nào của app
  trong v1 — đây là quyết định **đã chốt** D5 theo **phương án (a)** (`plan.md` §6,
  spec FR-015 bản đã sửa ở vòng audit 2026-10-23: ngoại lệ v1 tường minh cho hệ
  single-user), không phải điểm chờ chốt. **Điều kiện bắt buộc khi chuyển đa
  người dùng**: trước khi mở đa người dùng phải bổ sung bảng mapping
  `enrichment_runs(run_id, user_id, created_at)` bằng một migration có phiên bản
  như hiến chương yêu cầu, ghi mapping tại thời điểm start, kiểm tra sở hữu khi
  tra cứu (lệch → 404/403) và có kiểm thử chéo 2 tài khoản.

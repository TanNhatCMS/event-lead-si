# Nghiên cứu kỹ thuật: 003 — Làm giàu dữ liệu lead bền vững

Nguồn chính: báo cáo `workspace/vercel-workflow-research/report.html` (nghiên cứu
vercel/workflow, clone & kiểm chứng trực tiếp tại `~/workspace/projects/vercel-workflow`,
HEAD 4f8e5ba) + đọc mã nguồn hiện tại của repo ngày 2026-10-23. Chỉ ghi những điểm
chưa rõ lúc bắt đầu và kết luận đã kiểm chứng; quyết định suy ra từ đây nằm ở `plan.md`.

## R1. SDK cung cấp đúng những gì feature cần không, ở version nào?

- **Kết luận**: Package `workflow` **v5.2.3** là bản hiện hành (nhánh main = GA 5.x);
  3 gói lõi (`workflow`, `@workflow/core`, `@workflow/world-vercel`) khoá version cùng
  nhau theo changesets "fixed". Chỉ cần cài 1 gói `workflow`; tích hợp Next.js qua
  `withWorkflow` từ `workflow/next`; khởi chạy/tra cứu qua `start`/`getRun` từ
  `workflow/api`. License Apache-2.0.
- Hệ quả: pin `5.2.3` trong pnpm catalog, không dùng range `^` trôi tự do.

## R2. Mô hình "use workflow" / "use step" áp vào `runEnrichmentLoop` thế nào?

- Workflow function chạy trong **sandbox QuickJS**: deterministic, không có full
  Node, input/output phải **serialize được** (truyền theo value vào event log).
- Step function chạy **full Node.js**, dùng mọi npm package, kết quả được ghi vào
  event log trước khi workflow đi tiếp; resume = replay workflow, step đã xong được
  trả từ cache, step đang dở chạy lại.
- Đối chiếu mã hiện tại: `runEnrichmentLoop({ recognized, userId, supabase })` —
  `recognized: RecognizedCard` và `userId: string` serialize được; `supabase` là
  client **không** serialize được → step phải tự tạo client bên trong.
  `getSupabaseServerAdminClient` có sẵn tại
  `packages/supabase/src/clients/server-admin-client.ts` (`@kit/supabase/server-admin-client`)
  và là lựa chọn đúng vì step chạy ngoài request context (không có session cookie);
  route đồng bộ dùng client theo phiên được vì nó chạy trong request.
- Hệ quả: chữ ký workflow = `(recognized: RecognizedCard, userId: string)`; 1 step
  duy nhất bọc toàn bộ loop (đơn vị bền vững của v1 theo spec).

## R3. Retry mặc định và cách tắt retry cho lỗi cấu hình?

- Step ném lỗi thường → SDK tự retry, **tối đa 3 lần** mặc định (3 lần retry sau lần thực thi đầu — tổng tối đa 4 lần thực thi step; quyết định diễn giải plan §8.1, đối chiếu `@workflow/core@5.2.3` `DEFAULT_STEP_MAX_RETRIES = 3`). Ném `FatalError`
  (từ package `workflow`) → không retry, run kết thúc `failed` ngay.
- Đối chiếu: `EnrichmentNotConfiguredError` đã tồn tại trong `loop.ts` (route đồng bộ
  đang map nó thành 503). Trong step: bắt lỗi này và ném lại dưới dạng `FatalError`
  → đúng FR-006 và "Làm rõ đã tự quyết" #4 của spec.

## R4. Vì sao phải loại `.well-known/workflow` khỏi matcher của `proxy.ts`?

- SDK phục vụ route nội bộ dưới `.well-known/workflow/v1/*` — đây là đường World gọi
  vào app để thực thi/đánh thức/resume run (máy-đến-máy, không mang session người dùng).
- `apps/web/proxy.ts` hiện có matcher
  `'/((?!_next/static|_next/image|images|locales|assets|api/*).*)'` — đã loại `api/*`
  nhưng **chưa** loại `.well-known/workflow`; nếu proxy can thiệp (session/redirect)
  vào các request nội bộ này, cơ chế resume sẽ hỏng khó chẩn đoán.
- Hệ quả: thêm **đúng đoạn `|.well-known/workflow`** vào nhóm loại trừ của matcher (chuỗi đầy đủ sau sửa: `'/((?!_next/static|_next/image|images|locales|assets|api/*|.well-known/workflow).*)'`, giữ nguyên dấu `/` ở đầu và mọi phần khác — tiêu chí xong ở T003 là `git diff -U0` chỉ cho thấy đúng đoạn chèn này; không đổi logic proxy).

## R5. "World" là gì và v1 dùng World nào?

- World = interface backend của SDK gồm 3 việc: storage (event log), queue (đánh thức
  run), streams. Đổi World **không đổi code workflow** — chỉ đổi biến môi trường
  `WORKFLOW_TARGET_WORLD` (+ package World tương ứng).
- **Local World**: mặc định, zero-config, lưu trên filesystem — hợp dev/test.
- **Vercel World**: managed trên Vercel, có encryption, trải nghiệm zero-config thật
  nhưng gắn deployment Vercel; là lane được team SDK kiểm thử nặng nhất.
- **Postgres World**: tự host — PostgreSQL cho storage + graphile-worker cho queue;
  dùng được Postgres sẵn có của hệ thống (Supabase) nhưng tự gánh vận hành/nâng cấp.
- Hệ quả: v1 dùng Local World cho dev; lựa chọn production giữ là **QĐ-MỞ-001 chưa
  chốt** theo spec. Lưu ý riêng tư (hiến chương III): event log chứa dữ liệu danh
  thiếp đã chốt → nơi lưu event log ở production là một tiêu chí của quyết định đó.

## R6. Trạng thái run phía SDK ánh xạ sang spec thế nào?

- `getRun(runId)` trả handle của run; trạng thái SDK gồm các giá trị chưa kết thúc
  (`pending`, `running`, …), `completed` (đọc kết quả qua `returnValue`), `failed`
  (đọc `error`). Run không tồn tại → `getRun`/đọc trạng thái ném lỗi → route map 404.
- Spec FR-007 yêu cầu gộp mọi trạng thái chưa kết thúc thành "đang chạy" → bảng ánh
  xạ đầy đủ đặt trong `contracts/api-enrichment-workflow.md`.

## R7. Độ chín và rủi ro đã biết của SDK (từ báo cáo nghiên cứu)

- Repo public từ 23/10/2025; sau ~1 năm đã GA 5.x với 547 releases — API còn dịch
  chuyển (đã có migration v4→v5). Giảm thiểu: pin version, bề mặt dùng hẹp.
- Team SDK tự ghi nhận lỗi race ở event log khi nhiều replay đồng thời
  (`CORRUPTED_EVENT_LOG`); lane local/Postgres từng fail khi step-storm, lane Vercel
  là cổng chặn. V1 tải thấp + 1 step nên rủi ro thấp; là điều kiện phải tải thử nếu
  sau này chốt World cho production.
- Bẫy module state: bundler Next.js nhân bản module theo layer — tránh giữ state
  mutable ở module scope trong code workflow/step của feature này.

## R8. Kiểm chứng retry/FatalError của AC-004 làm sao cho xác định (không đua thời gian)?

- Đọc mã thật: `checkEnrichmentConfigured` (dùng ở route start) và
  `runEnrichmentLoop` (trong step) dùng **cùng** logic phân giải cấu hình
  (`resolveEnrichmentConfig` + `getGatewayApiKey` trong `loop.ts`/`model-config.ts`).
  Hệ quả: không tồn tại cách qua route start mà kiểm tra ở start đạt nhưng loop
  lại ném `EnrichmentNotConfiguredError` một cách xác định bằng việc đổi cấu
  hình — mọi kịch bản "đổi/gỡ cấu hình giữa chừng" đều là đua với lịch retry.
- Kết luận (đã ghi vào plan §8.1 và T012): ép lỗi phải theo **bộ đếm số lần
  thực thi step** (stub/harness lưu bộ đếm bền ngoài workflow, `FAIL_FIRST_N` /
  `FAIL_ALWAYS`, cấu hình đặt trước khi start và giữ nguyên suốt kịch bản);
  nhánh FatalError kiểm bằng cách khởi chạy workflow **trực tiếp qua harness**
  (bỏ qua cổng 503 của route start) khi cấu hình đã tắt sẵn → step ném
  `EnrichmentNotConfiguredError` xác định ở lần thực thi đầu → đúng 1 lần thực
  thi step. Bằng chứng là số lần thực thi step qua observability + bộ đếm,
  không phải thời gian kết thúc.

## Điểm vẫn chưa rõ (để mở có chủ đích)

1. **QĐ-MỞ-001** — World cho production: chờ quyết định (xem `plan.md` D1).
2. ~~`start-not-configured` và `run-ownership-enforcement`~~ — **đã giải quyết
   ở vòng sửa audit 2026-10-23**: D4 đã chốt và ghi vào spec FR-001 (start → 503
   khi chưa cấu hình, không tạo run); D5 đã chốt theo **phương án (a)** và ghi
   vào spec FR-015 (ngoại lệ v1 tường minh cho single-user, xoá thẻ
   — điểm chờ làm rõ đã xoá). Xác nhận cuối của người dùng là cổng chặn merge cứng
   ở T014 — chưa xác nhận thì không merge.

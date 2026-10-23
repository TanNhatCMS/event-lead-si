# Kế hoạch kỹ thuật: Làm giàu dữ liệu lead bền vững (durable) bằng Vercel Workflow SDK

**Spec**: `specs/003-durable-lead-enrichment/spec.md` (FR-001..FR-016, AC-001..AC-010)
**Hiến chương**: `.specify/memory/constitution.md` v1.2.2
**Nghiên cứu nền**: `workspace/vercel-workflow-research/report.html` + `research.md` cùng thư mục
**Nhánh**: `feat/workflow-sdk-integration` (từ `origin/main`)

## 1. Tóm tắt kiến trúc

Bọc vòng lặp làm giàu hiện có (`runEnrichmentLoop`) trong **một step duy nhất** của một
workflow bền vững. Không viết lại logic enrichment, không đổi nghiệp vụ:

```
UI (enrichment-panel)                API routes (apps/web)              Workflow SDK
─────────────────────                ─────────────────────             ─────────────────────────
POST /api/enrichment/start  ───────► auth + validate + chốt input ──► start(enrichLeadWorkflow,
                                     (gương route /run hiện tại)        [recognized, userId])
                                     trả { runId } ngay                       │
                                                                              ▼
GET  /api/enrichment/runs/[runId] ─► auth + getRun(runId)            enrichLeadWorkflow
                                     map status → đang chạy/            ("use workflow", sandbox)
                                     hoàn thành(+result)/lỗi                  │ await
                                                                              ▼
POST /api/enrichment/run (CŨ,      runEnrichStep ("use step", full Node)
  giữ nguyên làm fallback)           ├─ getSupabaseServerAdminClient()  ← tự tạo trong step
                                     └─ runEnrichmentLoop({ recognized, userId, supabase })
```

- **Đơn vị bền vững v1 = toàn bộ vòng lặp** (đúng "Làm rõ đã tự quyết" #2 của spec):
  workflow chỉ có 1 step. Bị ngắt giữa step → step chạy lại từ đầu khi resume; an toàn
  vì `runEnrichmentLoop` chỉ đọc + sinh gợi ý, không ghi dữ liệu (FR-012).
- Route đồng bộ `/api/enrichment/run` **không đụng vào** — fallback nguyên vẹn (FR-013).

## 2. Tech stack được chọn (và vì sao)

| Hạng mục | Chọn | Vì sao |
|---|---|---|
| Durable execution | **`workflow` v5.2.3** (Vercel Workflow SDK / Workflow DevKit), thêm vào `apps/web` qua pnpm catalog | Đã nghiên cứu & chốt ở tầng bối cảnh: DX nhẹ nhất cho Next.js (2 directive `"use workflow"`/`"use step"`), event log + deterministic replay lo resume/retry, portable qua "World". Pin đúng `5.2.3` (bản đã kiểm chứng trong báo cáo); 3 gói lõi của SDK khoá version cùng nhau theo changesets "fixed" nên không để range trôi. |
| Tích hợp Next.js | `withWorkflow` từ `workflow/next`, compose ngoài cùng quanh `withNextIntl` hiện có trong `apps/web/next.config.mjs` | Cách tích hợp chính thức của SDK cho Next.js; builder của nó quét directive và sinh route `.well-known/workflow/v1/*`. |
| Runtime app | Next.js **16.3.8** (catalog hiện tại), AI SDK **v7** (`ai` 7.0.139 qua catalog) — giữ nguyên | Hiến chương chốt Next.js 16 + Vercel AI SDK sau interface cấp ứng dụng; feature này không đổi nhà cung cấp model. |
| World (backend bền vững) | **Local World** (mặc định của SDK, zero-config, lưu event log trên filesystem) cho dev/v1 | Zero-config, không cần DB/queue ngoài — đủ để nghiệm thu toàn bộ FR/AC ở dev. Lựa chọn production là **QĐ-MỞ-001, chưa chốt** (xem §6). |
| Truy cập dữ liệu trong step | `getSupabaseServerAdminClient` từ `@kit/supabase/server-admin-client`, **tạo mới bên trong step** | Step chạy ngoài request context (không có cookie/session của request gốc) nên không dùng được client theo phiên; admin client là credential phía server — đúng ràng buộc hiến chương (credential quyền cao chỉ phía server). Đồng thời `runEnrichmentLoop` nhận `supabase` là tham số không serialize được — bắt buộc tạo trong step, không truyền từ workflow. |
| Auth cho 2 route mới | `getSupabaseServerClient()` + `supabase.auth.getUser()` — **gương đúng route `/run` hiện tại** | Nhất quán hành vi 401 (FR-003/AC-002), không phát minh cơ chế auth mới. |
| Kiểm chứng | typecheck + build của monorepo (turbo), cộng kịch bản tay kill-process/retry ở §8 | AC-009 + AC-003/AC-004. |

## 3. Cấu trúc file thay đổi

| File | Loại | Nội dung |
|---|---|---|
| `pnpm-workspace.yaml` | sửa | Thêm `workflow: 5.2.3` vào catalog. |
| `apps/web/package.json` | sửa | Thêm `"workflow": "catalog:"` vào dependencies. |
| `apps/web/next.config.mjs` | sửa | `export default withWorkflow(withNextIntl(config))`. Giữ nguyên mọi cấu hình khác. Lưu ý file hiện có `typescript: { ignoreBuildErrors: true }` — AC-009 vì vậy phải chạy typecheck riêng, không dựa vào build (xem §8). |
| `apps/web/proxy.ts` | sửa | Matcher loại trừ thêm `.well-known/workflow`: chuỗi đầy đủ sau sửa là `'/((?!_next/static|_next/image|images|locales|assets|api/*|.well-known/workflow).*)'` (chuỗi thật hiện tại trong file là `'/((?!_next/static|_next/image|images|locales|assets|api/*).*)'` — có dấu `/` ở đầu; sửa vòng audit 2026-10-23: bản trước của plan/tasks ghi thiếu dấu `/` này). Thay đổi duy nhất là chèn đúng đoạn `|.well-known/workflow` vào chuỗi cũ. Lý do: route nội bộ của SDK (`.well-known/workflow/v1/*`) là webhook máy-đến-máy do World gọi để đánh thức/resume run — không được qua proxy xử lý phiên. (Matcher hiện đã loại `api/*` nhưng chưa loại `.well-known`.) |
| `apps/web/lib/ai/enrichment/workflow.ts` | **mới** | Chứa workflow function + step function (xem §4). Đặt cạnh `loop.ts` để chủ sở hữu nghiệp vụ enrichment rõ ràng. |
| `apps/web/app/api/enrichment/start/route.ts` | **mới** | POST khởi chạy nền (contract: `contracts/api-enrichment-workflow.md`). |
| `apps/web/app/api/enrichment/runs/[runId]/route.ts` | **mới** | GET tra cứu trạng thái/kết quả (cùng contract trên). |
| `apps/web/features/card-import/enrichment-panel.tsx` | sửa (FE, có thể tách follow-up) | Điểm chạm tối thiểu: nút khởi chạy nền + poll trạng thái (xem §7). |
| `apps/web/app/api/enrichment/run/route.ts`, `lib/ai/enrichment/loop.ts`, `types.ts`, `tools.ts` | **không sửa** | FR-011/FR-013: tái sử dụng nguyên vẹn. |

## 4. Thiết kế workflow/step

```ts
// apps/web/lib/ai/enrichment/workflow.ts
import { FatalError } from "workflow";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";
import type { RecognizedCard } from "~/lib/ai/card-recognition";
import { EnrichmentNotConfiguredError, runEnrichmentLoop } from "./loop";
import type { EnrichmentResult } from "./types";

export async function enrichLeadWorkflow(recognized: RecognizedCard, userId: string) {
  "use workflow";
  return runEnrichmentStep(recognized, userId);
}

async function runEnrichmentStep(recognized: RecognizedCard, userId: string): Promise<EnrichmentResult> {
  "use step";
  const supabase = getSupabaseServerAdminClient();
  try {
    return await runEnrichmentLoop({ recognized, userId, supabase });
  } catch (err) {
    if (err instanceof EnrichmentNotConfiguredError) throw new FatalError(err.message);
    throw err; // lỗi còn lại: RetryableError mặc định của SDK (tối đa 3 lần retry sau lần đầu — tổng tối đa 4 lần thực thi; quyết định diễn giải §8.1)
  }
}
```

Quyết định kỹ thuật trong đoạn trên:

1. **Tham số chỉ gồm dữ liệu serialize được** (`RecognizedCard` là plain JSON đã qua
   zod schema; `userId: string`). Tuyệt đối không truyền Supabase client, hàm, hay
   class instance qua biên workflow→step — SDK ghi tham số vào event log (FR-014:
   input là bản chốt tại thời điểm start).
2. **Workflow function tối thiểu**: không `Date.now()`/`Math.random()`/fetch trực
   tiếp trong workflow (ràng buộc deterministic của sandbox — SDK có gieo hạt cho
   Date/random nhưng v1 không dựa vào đó, giữ workflow thuần điều phối 1 step).
3. **Ánh xạ lỗi → retry** (FR-006): mặc định step của SDK tự retry tối đa **3 lần**
   (3 lần retry SAU lần thực thi đầu — tổng tối đa **4 lần thực thi step**; đối chiếu
   mã nguồn SDK 5.2.3 ở quyết định diễn giải §8.1)
   khi ném lỗi thường; `EnrichmentNotConfiguredError` bọc thành `FatalError` để
   **kết thúc ngay, không đốt retry** (đúng "Làm rõ đã tự quyết" #4). Không cấu hình
   retry tuỳ chỉnh trong v1.
4. **Idempotency khi step chạy lại**: chấp nhận được vì `runEnrichmentLoop` thuần
   đọc (đọc `ai_model_configs` theo userId + gọi model/tools) và kết quả chỉ trả về
   cho workflow ghi vào event log — không ghi DB, không ghi contact (FR-012,
   nguyên tắc hiến chương II). Hệ quả chi phí: chạy lại = tốn thêm 1 lượt gọi model;
   ghi nhận là đánh đổi đã biết của đơn vị bền vững thô ở v1.
5. **Kết quả workflow** = `EnrichmentResult` nguyên vẹn (`findings` kèm
   field/value/confidence/source, `steps`, model đã dùng theo schema hiện có ở
   `types.ts`) — bảo đảm tương đương cấu trúc với route đồng bộ (FR-008/AC-005).

## 5. Thiết kế 2 API route mới

Chi tiết contract: `contracts/api-enrichment-workflow.md`. Nguyên tắc chính:

- **POST `/api/enrichment/start`**: sao chép gần như nguyên vẹn phần đầu của route
  `/run` hiện tại — auth (`getUser`, 401 `unauthorized`), parse JSON (400
  `invalid_request`), `bodySchema` giống hệt (chấp nhận `recognized`/`fields` hoặc
  `cardImportId`), nhánh `cardImportId` đọc `card_imports` theo đúng `user_id` +
  `confirmedToRecognized` để **chốt input ngay tại start** (FR-014), và kiểm tra
  `checkEnrichmentConfigured` **trước** khi tạo run. Khác biệt duy nhất ở cuối:
  thay `runEnrichmentLoop(...)` bằng
  `const run = await start(enrichLeadWorkflow, [recognized, user.id])` rồi trả
  `201 { runId: run.runId, request_id }`. `start`/`getRun` import từ `workflow/api`.
- **GET `/api/enrichment/runs/[runId]`**: auth như trên (401 khi chưa đăng nhập).
  `getRun(runId)`; runId không tồn tại → **404** `run_not_found` (FR-010/AC-008).
  Ánh xạ trạng thái SDK → 3 trạng thái của spec (FR-007): `pending`/`running` (và
  mọi trạng thái chưa kết thúc khác) → `running`; `completed` → `completed` kèm
  `result` = `await run.returnValue`; `failed` → `failed` kèm `error` mô tả lỗi
  (FR-009). Xem bảng ánh xạ đầy đủ trong contract.
- **Ownership ở v1 — đã chốt phương án (a) (spec FR-015, §6 D5)**: không ghi
  ownership vào DB trong v1, không lưu mapping run→user, không kiểm tra sở hữu
  theo từng run. GET chỉ yêu cầu đã đăng nhập (401 nếu chưa) và dựa vào `runId`
  khó đoán do SDK sinh. Đây là ngoại lệ v1 tường minh cho hệ single-user đã ghi
  trong spec — không phải hướng yếu hơn spec. Khi chuyển đa người dùng phải bổ
  sung mapping + kiểm tra sở hữu (404/403 khi lệch) + test chéo 2 tài khoản
  trước khi mở (điều kiện bắt buộc ghi tại FR-015).

## 6. Quyết định kỹ thuật (D4/D5 đã chốt ở vòng sửa audit 2026-10-23, ghi vào spec; xác nhận cuối của người dùng là cổng chặn merge ở T014)

| # | Quyết định | Trạng thái |
|---|---|---|
| D1 | World cho dev/v1 = **Local World** zero-config; **production chưa chốt** (QĐ-MỞ-001: Vercel World managed nếu deploy Vercel — cần deployment trên Vercel, có encryption; hoặc Postgres World tự host — dùng Postgres sẵn có + graphile-worker, tự gánh vận hành/nâng cấp). Code workflow/step **không đổi** giữa các World — chỉ đổi biến môi trường `WORKFLOW_TARGET_WORLD` + cài package World tương ứng khi chốt. v1 không cài trước package World nào ngoài mặc định. | Đã chốt phần dev; production để mở theo spec |
| D2 | Đơn vị bền vững = 1 step bọc toàn bộ `runEnrichmentLoop`; không tách step theo vòng lặp nội bộ. | Đã chốt (spec, làm rõ #2) |
| D3 | Retry: dùng mặc định SDK (tối đa 3 lần retry sau lần đầu — tổng tối đa 4 lần thực thi step; quyết định diễn giải §8.1) + `FatalError` cho lỗi cấu hình. Không backoff tuỳ chỉnh trong v1. **Không dùng khoảng thời gian giữa các lần thử hay thời gian kết thúc làm bằng chứng retry** (lịch backoff mặc định của SDK không phải cam kết kiểm thử) — bằng chứng là **số lần thực thi step** đếm được qua observability/cơ chế ép lỗi xác định ở §8. | Đã chốt |
| D4 | `start-not-configured` (FR-001): route start chạy `checkEnrichmentConfigured` đồng bộ trước khi `start()` và trả **503 `enrichment_not_configured`** ngay (gương route `/run`) — không tạo run. Phương án thay thế (tạo run rồi để step fail bằng FatalError) bị loại vì khiến người dùng phải poll mới biết lỗi cấu hình, trái "từ chối ngay tại khởi chạy" của FR-001. | **Đã chốt** ở vòng sửa audit 2026-10-23 và đã ghi vào spec FR-001. Xác nhận cuối của người dùng tại cổng merge T014 (cổng cứng — xem §8/T014). |
| D5 | `run-ownership-enforcement` (FR-015): **phương án (a)** — hệ thống single-user: chỉ yêu cầu đã đăng nhập (401 nếu chưa) + `runId` là định danh khó đoán do SDK sinh; không lưu bảng mapping run→user, không kiểm tra sở hữu theo từng run ở v1. Rủi ro còn lại (tài khoản đăng nhập khác biết `runId` thì poll được) được chấp nhận tường minh ở v1 vì triển khai là single-user và đã ghi thành ngoại lệ trong spec FR-015. Khi đa người dùng: bắt buộc lưu mapping, so `userId` khi tra cứu (lệch → 404/403) và test chéo 2 tài khoản trước khi mở. | **Đã chốt phương án (a)** ở vòng sửa audit 2026-10-23 và đã ghi vào spec FR-015 (đã xoá điểm chờ làm rõ). Xác nhận cuối của người dùng tại cổng merge T014 (cổng cứng). |
| D6 | Phần FE (Câu chuyện 7): **gộp trong v1 ở mức tối thiểu** (xem §7) vì điểm chạm nhỏ và nằm trọn trong 1 component hiện có; nếu khi code phát sinh rủi ro (xung đột state của panel, vòng poll phức tạp) thì tách follow-up — lõi BE nghiệm thu độc lập. | Đề xuất — BE/QA không phụ thuộc |

## 7. Phân vai cho đội dev (làm song song)

### BE — cài đặt + config + workflow/steps + 2 API route
1. Thêm `workflow: 5.2.3` vào catalog (`pnpm-workspace.yaml`) + `apps/web/package.json`, `pnpm install`.
2. `next.config.mjs`: compose `withWorkflow`; `proxy.ts`: loại `.well-known/workflow` khỏi matcher.
3. `lib/ai/enrichment/workflow.ts`: workflow + step theo §4 (gồm ánh xạ `FatalError`).
4. Route `POST /api/enrichment/start` + `GET /api/enrichment/runs/[runId]` theo contract.
5. Tự kiểm: `pnpm dev` chạy được, start 1 run thật, poll tới `completed`, kết quả khớp cấu trúc route `/run`.
- **Không** sửa route `/run`, `loop.ts`, `types.ts`.

### FE — điểm chạm UI tối thiểu (song song với BE, dựa trên contract)
- Trong `apps/web/features/card-import/enrichment-panel.tsx`: thêm nút "Chạy nền"
  cạnh nút chạy đồng bộ hiện có → gọi POST start → lưu `runId` → poll GET runs/[runId]
  mỗi ~2 giây cho đến `completed`/`failed` → khi `completed`, đưa `result` vào đúng
  đường hiển thị gợi ý + nút **Áp dụng** hiện có (không xây đường hiển thị mới).
  Dừng poll khi unmount/đổi lead. Hiển thị trạng thái đang chạy/lỗi bằng text đơn giản.
- **Điều khoản tách**: nếu việc chạm vào state của panel phát sinh rủi ro hồi quy
  luồng đồng bộ, dừng và tách thành follow-up riêng — ghi rõ trong PR; nghiệm thu
  lõi (AC-001..AC-009) không phụ thuộc FE (D6).

### QA & AC — kiểm chứng (theo §8)
Chủ trì chạy toàn bộ checklist §8, đặc biệt 2 kịch bản đặc thù durable: kill-process
resume và ép lỗi step để xem retry.

## 8. Kế hoạch kiểm chứng (ánh xạ AC)

| AC | Cách kiểm chứng |
|---|---|
| AC-001 | Gọi POST start với lead hợp lệ khi enrichment chạy chậm (hoặc đo thời gian phản hồi): response trả `runId` ngay, trước khi run hoàn thành (poll sau đó mới thấy `completed`). |
| AC-002 | `curl` không cookie/session tới cả 2 route mới → đều **401**. |
| AC-003 | Dev với Local World: start run → trong lúc đang chạy, kill process `pnpm dev` (SIGKILL) → khởi động lại → poll runId cũ: run tự resume (step chạy lại từ đầu) và tới `completed` với kết quả đầy đủ, không start lại. Run đã `completed` từ trước: poll lại vẫn nguyên kết quả, không chạy lại. |
| AC-004 | **Chỉ dùng cơ chế ép lỗi xác định theo bộ đếm ở §8.1 — cấm đổi cấu hình giữa chừng theo thời gian.** (1) Tạm thời: stub/harness đếm số lần thực thi step, ép lỗi đúng 1 lần đầu theo bộ đếm rồi thành công ở lần sau (cấu hình giữ nguyên suốt kịch bản) → run `completed`, số lần thực thi step ≥2. (2) Vĩnh viễn: ép lỗi mọi lần (model id không tồn tại đặt trước khi start và giữ nguyên, hoặc stub `FAIL_ALWAYS`) → run `failed` sau tối đa 3 lần retry, số lần thực thi step = tối đa quan sát được = **4** (1 lần đầu + 3 retry; quyết định diễn giải §8.1). (3) Chưa cấu hình trong run: khởi chạy workflow **trực tiếp qua harness kiểm thử** (bỏ qua cổng `checkEnrichmentConfigured` của route start) khi cấu hình đã tắt sẵn từ trước → step ném `EnrichmentNotConfiguredError` xác định ngay lần thực thi đầu, ánh xạ `FatalError` → run `failed` với **đúng 1 lần thực thi step**. Bằng chứng cho cả 3: log/observability (`npx workflow web` / log step) ghi số lần thực thi step + file bộ đếm của stub/harness — không dùng thời gian kết thúc làm bằng chứng. Chi tiết: §8.1 và T012. |
| AC-005 | Poll 1 run: thấy `running` (không kèm result) → `completed` kèm result có `findings[]` (mỗi finding đủ field/value/confidence/source), `steps`, model — so **cấu trúc** với response của POST `/run` trên cùng input (không so nội dung findings). |
| AC-006 | Chạy lại POST `/api/enrichment/run` như trước feature trên cùng dữ liệu kiểm thử → 200, kết quả như cũ. |
| AC-007 | Chụp dữ liệu form xem lại danh thiếp/bản ghi contact trước và sau khi run nền `completed` (chưa bấm Áp dụng) → không đổi; bấm Áp dụng chọn 1 finding → chỉ trường đó đổi. |
| AC-008 | GET runs/`run-id-khong-ton-tai` (đã đăng nhập) → **404** `run_not_found`. |
| AC-009 | Chạy typecheck của repo (lệnh turbo/tsc hiện hành) + build `apps/web` — đều pass. **Lưu ý**: `next.config.mjs` đang đặt `ignoreBuildErrors: true`, nên build xanh **không** thay thế typecheck; phải chạy cả hai. |
| AC-010 | (Nếu FE gộp) Từ màn hình làm giàu: bấm Chạy nền → trạng thái tự cập nhật tới hoàn thành/lỗi không cần reload; kết quả dùng được nút Áp dụng như cũ. |

### 8.1 Cơ chế ép lỗi xác định cho AC-004 (bắt buộc, thay cơ chế đua thời gian cũ)

Cơ chế cũ (đổi cấu hình sai ở lần thử đầu rồi khôi phục trước lần retry; gỡ cấu
hình sau thời điểm start) là **đua thời gian** với lịch retry mặc định của SDK —
kết quả phụ thuộc thời điểm thao tác tay, QA khác nhau cho kết quả khác nhau,
không tái lập được. Từ vòng sửa audit 2026-10-23, AC-004 chỉ được kiểm chứng
bằng cơ chế xác định sau; mọi cấu hình ép lỗi phải được **đặt trước khi start
và giữ nguyên suốt kịch bản**, bộ đếm chỉ reset thủ công trước mỗi kịch bản:

1. **Bộ đếm lần thử (attempt counter)**: QA dùng một stub/harness kiểm thử
   (script cục bộ của QA, **không phải code production, không merge vào app**):
   một endpoint stub hoặc một workflow/step harness dùng cùng Workflow SDK +
   Local World, trong đó trạng thái số lần đã thực thi được lưu bền ngoài
   workflow (file bộ đếm trên đĩa, ví dụ `attempts.json`, hoặc bộ đếm trong
   stub server) và tăng đúng 1 mỗi lần step thực thi. Hành vi do tham số của
   stub quyết định theo bộ đếm, không theo thời gian: `FAIL_FIRST_N=1` → N lần
   thực thi đầu ném lỗi thường (retryable), từ lần N+1 thành công;
   `FAIL_ALWAYS=1` → mọi lần đều ném lỗi thường. Đây là bằng chứng cho nhánh
   retry→thành công (tạm thời) và là đối chứng số lần thử cho nhánh vĩnh viễn.
2. **Lỗi vĩnh viễn trên workflow thật**: đặt model của user kiểm thử thành một
   model id không tồn tại (hoặc stub ở chế độ `FAIL_ALWAYS`) **trước** khi gọi
   POST start, giữ nguyên tới khi run kết thúc. Mọi lần thử của step thật đều
   lỗi cùng một cách — xác định, không phụ thuộc thời điểm khôi phục.
3. **FatalError trên workflow thật**: `checkEnrichmentConfigured` (ở route
   start) và `runEnrichmentLoop` (trong step) dùng cùng logic phân giải cấu
   hình, nên không có cách qua route start mà start-pass nhưng step-fail một
   cách xác định bằng đổi cấu hình. Thay vào đó QA **khởi chạy workflow trực
   tiếp** bằng harness (`start(enrichLeadWorkflow, [recognized, userId])` qua
   `workflow/api` trong script dev/QA, bỏ qua route start và cổng 503 của nó)
   trong khi cấu hình của user kiểm thử đã **tắt sẵn từ trước** (capability
   `lead_enrichment` disabled hoặc thiếu key/model). Step thật khi đó ném
   `EnrichmentNotConfiguredError` ngay lần thực thi đầu một cách xác định →
   `FatalError` → run `failed` với đúng **1** lần thực thi step.
4. **Bằng chứng chấp nhận được** (ghi vào biên bản T012): (a) số lần thực thi
   step lấy từ observability (`npx workflow web`) hoặc log của SDK cho từng
   kịch bản — tạm thời ≥2 và run `completed`; vĩnh viễn = tối đa 4 lần thực thi
   (1 lần đầu + 3 lần retry theo mặc định SDK — quyết định diễn giải ngay dưới đây)
   và run `failed`; chưa cấu hình = đúng 1 lần và run `failed`; (b) nội dung file bộ
   đếm/log của stub khớp số lần đó; (c) trạng thái cuối qua GET runs/[runId].
   Thời gian từ start tới `failed` **không** được dùng làm bằng chứng phân biệt
   có/không retry.
5. **Quyết định diễn giải số lần thử (chốt 2026-10-23, vòng sửa review 1 của
   T012)**: mọi diễn đạt "tối đa 3 lần (thử)" trong bộ tài liệu này/spec/tasks
   được hiểu thống nhất là **tối đa 3 lần RETRY sau lần thực thi đầu — tổng
   tối đa 4 lần thực thi step**. Cơ sở đối chiếu trực tiếp mã nguồn SDK đã cài
   (`@workflow/core@5.2.3`, gói lõi của `workflow@5.2.3`):
   `dist/runtime/step-executor.js` khai báo `DEFAULT_STEP_MAX_RETRIES = 3`
   (dòng 25), executor chỉ kết luận step thất bại khi
   `currentAttempt >= maxRetries + 1` (dòng 993) và sinh thông điệp
   `failed after 3 retries` (dòng 1003) — tức tham số của SDK đếm số lần
   retry, không đếm tổng số lần thực thi. Số đo thực tế ở đối chứng
   `FAIL_ALWAYS` của T012 khớp đúng: step `attempt = 4`, events
   `step_started` ×4 + `step_retrying` ×3, run `failed`. Hệ quả: KHÔNG cấu
   hình `maxRetries` tuỳ chỉnh (giữ đúng D3 "không cấu hình retry tuỳ chỉnh
   trong v1"); kỳ vọng nghiệm thu cho nhánh lỗi vĩnh viễn của AC-004 là
   **4 lần thực thi step**, không phải 3.

## 9. Tuân thủ hiến chương

- **Nguyên tắc II (con người kiểm soát)** — bất biến của feature: workflow/step không
  chứa bất kỳ đường ghi nào vào contact/card_imports; step chỉ *trả về* findings.
  Kiểm chứng bằng AC-007 + rà soát diff (không import client ghi dữ liệu trong
  `workflow.ts` ngoài admin client truyền vào `runEnrichmentLoop` như hiện tại).
- **Nguyên tắc I (bằng chứng/không chắc chắn)**: kết quả giữ nguyên confidence +
  source + sourceUrl theo schema hiện có; không thay đổi cách trình bày gợi ý.
- **Nguyên tắc III (quyền riêng tư)**: input chốt vào event log của World — ở dev là
  filesystem local của máy chạy; khi chốt production (QĐ-MỞ-001) phải rà soát lại
  nơi lưu event log (dữ liệu danh thiếp là dữ liệu cá nhân) — ghi thành điều kiện
  tiên quyết của quyết định production, kể cả cân nhắc encryption của Vercel World.
  Admin client chỉ tồn tại phía server, trong step.
- **Nguyên tắc IV (hồ sơ đáng tin cậy)**: không thêm bảng/migration; định dạng kết
  quả không đổi → tương thích ngược hoàn toàn với UI Áp dụng hiện có.
- **Ngoại lệ**: không có ngoại lệ hiến chương nào trong v1.

## 10. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| SDK còn trẻ (public 10/2025, GA 5.x, tốc độ phát hành rất cao, API đã từng dịch chuyển v4→v5) | Trung bình | Pin cứng `5.2.3` qua catalog; phạm vi dùng hẹp (1 workflow/1 step + 2 API của `workflow/api`); route đồng bộ giữ làm fallback nên gỡ SDK không chặn nghiệp vụ. |
| Lỗi race ở event log khi nhiều replay đồng thời (team SDK tự ghi nhận; lane local/Postgres từng fail khi step-storm) | Thấp ở v1 | V1: 1 lead/lần chạy, tải đồng thời thấp, 1 step duy nhất → bề mặt race nhỏ. Không dùng cho batch/đồng thời lớn (đã ngoài phạm vi spec). Nếu lên production phải tải thử lại trước khi chốt World (gắn với QĐ-MỞ-001). |
| Local World lưu event log trên filesystem — mất khi đổi máy/ephemeral filesystem, không phải hạ tầng production | Trung bình (chỉ khi ai đó coi dev là prod) | Ghi rõ trong PR/README của feature: Local World **chỉ cho dev**; go-live production bị chặn cho tới khi QĐ-MỞ-001 được chốt. |
| Step chạy lại = gọi lại model/tools (chi phí + thời gian), vì đơn vị bền vững thô | Thấp | Đã chấp nhận ở tầng spec (làm rõ #2); theo dõi qua observability; tách step nhỏ hơn là tối ưu hoá của spec sau nếu cần. |
| `withWorkflow` can thiệp build (SWC plugin, tách bundle) có thể xung đột với cấu hình Next hiện có (`cacheComponents`, turbopack, next-intl) | Trung bình | Kiểm chứng sớm bằng build đầy đủ ngay ở task BE đầu tiên (AC-009); nếu xung đột không xử lý được trong phạm vi, fallback là giữ nguyên hiện trạng đồng bộ và báo lại — không nới scope. |
| Step dùng service-role (admin client) thay vì client theo phiên như route đồng bộ: quyền rộng hơn khi đọc `ai_model_configs` của user | Thấp | Step chỉ gọi `runEnrichmentLoop` với đúng `userId` đã chốt từ request đã xác thực; không nhận userId từ body. Ghi vào checklist review bảo mật của PR. |
| Truyền nhầm dữ liệu không serialize được vào workflow (vd Supabase client) gây lỗi runtime khó hiểu | Thấp | Quy ước §4.1 + review: chữ ký workflow chỉ `(RecognizedCard, string)`. |

## 11. Ngoài phạm vi của plan

Đúng mục "Ngoài phạm vi" của spec: không batch, không lịch tự động, không chờ duyệt
giữa chừng (hooks/webhooks của SDK không dùng trong v1), không huỷ run, không thông
báo đẩy, không UI quản trị runs, không áp dụng cơ chế này cho luồng khác, không chốt
hạ tầng production.

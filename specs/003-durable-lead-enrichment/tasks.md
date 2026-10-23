# Danh sách công việc: Làm giàu dữ liệu lead bền vững (durable) bằng Vercel Workflow SDK

**Spec**: `specs/003-durable-lead-enrichment/spec.md` (FR-001..FR-016, AC-001..AC-010)
**Plan**: `specs/003-durable-lead-enrichment/plan.md` (§3 cấu trúc file, §4 workflow/step, §5 API, §6 quyết định D1–D6, §7 phân vai, §8 kiểm chứng)
**Contract**: `specs/003-durable-lead-enrichment/contracts/api-enrichment-workflow.md`
**Nhánh**: `feat/workflow-sdk-integration` — identity commit bắt buộc: `KietNT <113796420+TanNhatCMS@users.noreply.github.com>` (kiểm tra `git config --local user.name/user.email` trước khi commit; KHÔNG sửa `.github/workflows/` qua MCP).

**Quy ước**: `[P]` = làm song song được (không phụ thuộc task khác đang chờ, file chạm tới không trùng). Thứ tự dưới đây đã sắp theo phụ thuộc — task không có `[P]` phải chờ task phụ thuộc xong. Mỗi task đủ nhỏ cho một coder xong trong một lượt.

**Bất biến xuyên suốt (mọi vai)**: KHÔNG sửa `apps/web/app/api/enrichment/run/route.ts`, `apps/web/lib/ai/enrichment/loop.ts`, `types.ts`, `tools.ts` (FR-011/FR-013); workflow/step/route mới TUYỆT ĐỐI không ghi đè contact/card_imports — chỉ trả findings kèm confidence + nguồn (FR-012, hiến chương II); workflow function chỉ nhận dữ liệu serialize được (`RecognizedCard` + `userId: string`), KHÔNG truyền Supabase client/hàm/class instance qua biên workflow→step (plan §4.1); Local World chỉ cho dev — production là QĐ-MỞ-001 chưa chốt (plan D1).

---

## Giai đoạn 1 — Nền tảng (BE)

### T001 — [BE] Cài `workflow@5.2.3` qua pnpm catalog cho `apps/web`

- **File chạm tới**: `pnpm-workspace.yaml`, `apps/web/package.json`, `pnpm-lock.yaml` (do `pnpm install` sinh).
- **Chi tiết**:
  1. Trong `pnpm-workspace.yaml` mục `catalog:` thêm đúng dòng `workflow: 5.2.3` (pin cứng, không dùng `^` — 3 gói lõi của SDK khoá version cùng nhau theo changesets "fixed", xem research R1). Đặt gần nhóm `next`/`ai` cho dễ tìm, giữ nguyên mọi entry khác.
  2. Trong `apps/web/package.json` mục `dependencies` thêm `"workflow": "catalog:"` (đúng mẫu các dependency catalog hiện có như `"ai": "catalog:"`).
  3. Chạy cài đặt từ gốc repo bằng pnpm của repo (Node >= 22.13, pnpm 11 theo `packageManager`): `pnpm install`. Nếu gặp lỗi `EPERM: operation not permitted, fchown` do gid `nogroup` (bẫy đã biết của VM này) thì chạy `chgrp -R root node_modules pnpm-lock.yaml` ở gốc repo rồi chạy lại `pnpm install`.
- **Kiểm tra xong**: `pnpm install` kết thúc không lỗi; `pnpm-lock.yaml` có entry `workflow@5.2.3`; thư mục `apps/web/node_modules/workflow` (hoặc `node_modules/.pnpm/workflow@5.2.3*` ở gốc) tồn tại; `git diff pnpm-workspace.yaml apps/web/package.json` chỉ gồm 2 dòng thêm nêu trên.
- **Phụ thuộc**: không. Chặn (block) T002, T004, T005, T006.

### T002 — [BE] Bọc `next.config.mjs` bằng `withWorkflow` (compose với next-intl hiện có)

- **File chạm tới**: `apps/web/next.config.mjs` (chỉ file này).
- **Chi tiết**:
  1. Thêm import: `import { withWorkflow } from 'workflow/next';` ở đầu file, cạnh import `createNextIntlPlugin` hiện có.
  2. Đổi dòng export cuối từ `export default withNextIntl(config);` thành `export default withWorkflow(withNextIntl(config));` — `withWorkflow` là lớp ngoài cùng theo plan §2/§3.
  3. Giữ nguyên 100% phần còn lại của `config` (đặc biệt `typescript: { ignoreBuildErrors: true }`, `cacheComponents: true`, `turbopack`, `experimental`) — không "nhân tiện" sửa cấu hình khác. Lưu ý hệ quả đã ghi ở plan §3/§8: vì `ignoreBuildErrors: true` nên build xanh không thay thế typecheck (AC-009 kiểm ở T009).
- **Kiểm tra xong**: `git diff apps/web/next.config.mjs` chỉ gồm import mới + dòng export mới; chạy thử `pnpm --filter web build` (hoặc `pnpm dev` ở T007) không lỗi cấu hình do compose (lỗi build đầy đủ để T009 kết luận, nhưng lỗi cú pháp/config phải lộ ngay ở task này).
- **Phụ thuộc**: T001 (cần package `workflow` đã cài mới import được).

### T003 — [P] [BE] Loại `.well-known/workflow` khỏi matcher của `proxy.ts`

- **File chạm tới**: `apps/web/proxy.ts` (chỉ sửa hằng `config.matcher`).
- **Chi tiết**:
  1. Matcher hiện tại (chuỗi thật trong file, có dấu `/` ở đầu): `'/((?!_next/static|_next/image|images|locales|assets|api/*).*)'`. Sửa thành đúng chuỗi đầy đủ ở plan §3: `'/((?!_next/static|_next/image|images|locales|assets|api/*|.well-known/workflow).*)'` — tức **chỉ chèn đúng đoạn `|.well-known/workflow`** vào chuỗi cũ, không viết lại chuỗi, không bỏ dấu `/` ở đầu (bản cũ của tasks/plan ghi thiếu dấu `/` này — đã sửa ở vòng audit 2026-10-23).
  2. Không đổi bất kỳ logic nào khác trong file (không đụng `getPatterns`, `getUser`, `setRequestId`).
  3. Lý do phải ghi trong comment/PR nếu thêm comment: route nội bộ `.well-known/workflow/v1/*` là webhook máy-đến-máy do World gọi để đánh thức/resume run, không mang session người dùng — qua proxy xử lý phiên sẽ làm hỏng resume khó chẩn đoán (research R4).
- **Kiểm tra xong**: `git diff -U0 apps/web/proxy.ts` cho thấy thay đổi **chỉ là thêm đúng đoạn `|.well-known/workflow`** vào chuỗi matcher cũ (1 dòng matcher, không thêm/xoá ký tự nào khác, dấu `/` ở đầu chuỗi còn nguyên); grep xác nhận chuỗi đầy đủ là `'/((?!_next/static|_next/image|images|locales|assets|api/*|.well-known/workflow).*)'`; các route thường (vd `/home`) vẫn qua proxy như trước (kiểm bằng `pnpm dev` ở T007: chưa đăng nhập vào `/home` vẫn bị redirect sang sign-in). Nếu diff cho thấy bất kỳ thay đổi nào ngoài đoạn chèn trên → chưa xong, phải làm lại.
- **Phụ thuộc**: không (sửa chuỗi thuần, không cần package). Làm song song với T002/T004 được.

---

## Giai đoạn 2 — Workflow & Step (BE)

### T004 — [BE] Tạo workflow `enrichLeadWorkflow` + step `runEnrichmentStep` bọc nguyên `runEnrichmentLoop`

- **File chạm tới**: `apps/web/lib/ai/enrichment/workflow.ts` (**mới**, đặt cạnh `loop.ts`). Không sửa `loop.ts`/`types.ts`.
- **Chi tiết** (theo đúng plan §4, không thêm/không bớt hành vi):
  1. Tạo file mới với nội dung tương đương khung ở plan §4:
     - `import { FatalError } from "workflow";`
     - `import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";` (đường import đúng như plan/research R2 — package ở `packages/supabase/src/clients/server-admin-client.ts`).
     - `import type { RecognizedCard } from "~/lib/ai/card-recognition";`
     - `import { EnrichmentNotConfiguredError, runEnrichmentLoop } from "./loop";`
     - `import type { EnrichmentResult } from "./types";`
  2. Workflow function: `export async function enrichLeadWorkflow(recognized: RecognizedCard, userId: string) { "use workflow"; return runEnrichmentStep(recognized, userId); }` — directive `"use workflow"` là câu lệnh đầu tiên trong thân hàm; workflow chỉ điều phối 1 step, KHÔNG gọi `Date.now()`/`Math.random()`/fetch/Supabase trực tiếp trong workflow (ràng buộc deterministic của sandbox).
  3. Step function: `async function runEnrichmentStep(recognized: RecognizedCard, userId: string): Promise<EnrichmentResult> { "use step"; ... }` — directive `"use step"` đầu thân hàm; bên trong step mới tự tạo client: `const supabase = getSupabaseServerAdminClient();` rồi `return await runEnrichmentLoop({ recognized, userId, supabase });`. Lý do bắt buộc: step chạy ngoài request context (không có cookie/session) và `supabase` không serialize được nên không truyền từ workflow/route vào được (FR-014, plan §2/§4.1).
  4. Ánh xạ lỗi → retry (FR-006, plan §4.3/D3): bọc lời gọi loop trong `try/catch` — `if (err instanceof EnrichmentNotConfiguredError) throw new FatalError(err.message);` còn mọi lỗi khác `throw err;` nguyên vẹn để SDK áp retry mặc định (tối đa 3 lần retry sau lần đầu — tổng tối đa 4 lần thực thi; quyết định diễn giải plan §8.1). Không cấu hình retry/backoff tuỳ chỉnh trong v1.
  5. Không giữ state mutable ở module scope trong file này (bẫy nhân bản module của bundler Next.js — research R7); không import bất kỳ client ghi dữ liệu nào ngoài admin client truyền vào `runEnrichmentLoop` như trên (bất biến FR-012).
- **Kiểm tra xong**: file tồn tại đúng đường dẫn; chữ ký workflow đúng `(RecognizedCard, string)`; typecheck cục bộ đạt ở T009; rà soát bằng mắt: không có đường ghi contact/card_imports, không truyền client qua tham số workflow. Kiểm chứng hành vi thật (run tới `completed`) ở T007.
- **Phụ thuộc**: T001. Chặn T005, T006.

---

## Giai đoạn 3 — Hai API route mới (BE)

### T005 — [BE] Tạo `POST /api/enrichment/start` — auth + validate + chốt input + trả `runId` ngay

- **File chạm tới**: `apps/web/app/api/enrichment/start/route.ts` (**mới**). Tham chiếu để sao chép: `apps/web/app/api/enrichment/run/route.ts` (route đồng bộ hiện tại — chỉ đọc, không sửa). Contract: `contracts/api-enrichment-workflow.md` §1.
- **Chi tiết**:
  1. Mở đầu file bằng `import 'server-only';` như route `/run`. Import thêm `start` từ `workflow/api` và `enrichLeadWorkflow` từ `~/lib/ai/enrichment/workflow` (đường dẫn theo vị trí file ở T004 — kiểm tra alias `~/` khớp `tsconfig` của `apps/web` như các import hiện có trong route `/run`).
  2. Sao chép gần như nguyên vẹn phần đầu của route `/run`: `getSupabaseServerClient()` + `supabase.auth.getUser()` → chưa đăng nhập trả **401** `{ code: "unauthorized", message: "Vui lòng đăng nhập.", request_id }` (hàm `unauthorized()` bê nguyên sang); parse JSON lỗi → **400** `invalid_request` "Yêu cầu phải là JSON."; `bodySchema` giống hệt route `/run` (chấp nhận `recognized`/`fields` theo `recognizedCardSchema`, hoặc `cardImportId` uuid; refine thiếu cả ba → 400); helper `confirmedToRecognized()` bê nguyên sang (hoặc tách dùng chung — chỉ khi không phải sửa route `/run`; mặc định bê nguyên để giữ route cũ không đổi).
  3. Nhánh `cardImportId`: đọc `card_imports` theo đúng `.eq("id", ...)` + `.eq("user_id", user.id)` như route `/run`; không tìm thấy/không thuộc user → **404** `import_not_found`; có `recognized_snapshot` hợp lệ thì dùng, không thì dựng từ `confirmed` qua `confirmedToRecognized()`, vẫn không được → **422** `invalid_snapshot`. Toàn bộ việc đọc + chốt `RecognizedCard` phải xong ngay trong request này (FR-014) — run dùng bản chốt đó, thay đổi sau của bản ghi gốc không ảnh hưởng run.
  4. Kiểm tra cấu hình TRƯỚC khi tạo run (quyết định **đã chốt** D4 ở plan §6, đã ghi vào spec FR-001 ở vòng sửa audit 2026-10-23): `const check = await checkEnrichmentConfigured(user.id, supabase);` (import từ `~/lib/ai/enrichment/loop` như route `/run`) → chưa cấu hình thì trả **503** `{ code: "enrichment_not_configured", message: check.message, request_id }` và **không tạo run nào** (FR-001).
  5. Khác biệt duy nhất ở cuối so với route `/run`: thay `runEnrichmentLoop(...)` bằng `const run = await start(enrichLeadWorkflow, [recognized, user.id]);` rồi trả **201** `{ runId: run.runId, request_id: requestId }`. `userId` truyền vào workflow lấy từ phiên đã xác thực (`user.id`), TUYỆT ĐỐI không lấy từ body. Mọi response đều kèm `request_id` (uuid qua `crypto.randomUUID()` như route `/run`).
  6. Mọi trường hợp lỗi ở bước 2–4 đều không gọi `start(...)` — không tạo run (FR-001).
- **Kiểm tra xong** (làm ngay sau khi code, kiểm chứng đầy đủ ở T007/T010): đã đăng nhập + body `{ recognized }` hợp lệ → 201 kèm `runId` trả về ngay (không chờ enrichment xong — AC-001); không cookie → 401; body không phải JSON → 400; `cardImportId` không tồn tại → 404; bỏ cấu hình model/key → 503 và không có run nào được tạo.
- **Phụ thuộc**: T004 (cần `enrichLeadWorkflow`). Làm song song với T006 được sau khi T004 xong (file khác nhau).

### T006 — [P] [BE] Tạo `GET /api/enrichment/runs/[runId]` — auth + ánh xạ trạng thái SDK → API

- **File chạm tới**: `apps/web/app/api/enrichment/runs/[runId]/route.ts` (**mới**). Contract: `contracts/api-enrichment-workflow.md` §2.
- **Chi tiết**:
  1. Mở đầu `import 'server-only';`. Import `getRun` từ `workflow/api`; `getSupabaseServerClient` từ `@kit/supabase/server-client` (gương route `/run`).
  2. Handler `GET`: sinh `requestId` (`crypto.randomUUID()`); auth bằng `getSupabaseServerClient()` + `auth.getUser()` — chưa đăng nhập → **401** `{ code: "unauthorized", message: "Vui lòng đăng nhập.", request_id }`, không tra cứu/lộ dữ liệu run nào (FR-003). Lấy `runId` từ path param của route (App Router Next.js 16 — đọc docs trong `node_modules/next/dist/docs/` theo AGENTS.md của `apps/web` nếu không chắc cách lấy `params` ở bản Next này, không đoán theo trí nhớ bản cũ).
  3. Tra cứu: `const run = getRun(runId);` (theo API của `workflow/api` bản 5.2.3 — nếu chữ ký là async/khác, đối chiếu type của package đã cài ở T001, không đoán). Run không tồn tại / `getRun` hoặc đọc trạng thái ném lỗi "không tồn tại" → **404** `{ code: "run_not_found", message: "Không tìm thấy lần chạy.", request_id }` (FR-010/AC-008).
  4. Ánh xạ trạng thái đúng bảng ở contract §2 (FR-007): trạng thái SDK chưa kết thúc (`pending`, `running`, và mọi giá trị chưa kết thúc khác) → **200** `{ status: "running", request_id }` (không kèm `result`); `completed` → **200** `{ status: "completed", result: await run.returnValue, request_id }`; `failed` → **200** `{ status: "failed", error: { message: <mô tả lỗi từ run.error> }, request_id }` (vẫn 200 vì tra cứu thành công — lỗi thuộc về run, không thuộc request; FR-009).
  5. Quyền sở hữu ở v1 theo quyết định **đã chốt phương án (a)** D5 (plan §6, đã ghi vào spec FR-015 ở vòng sửa audit 2026-10-23 — ngoại lệ v1 tường minh cho hệ single-user): chỉ yêu cầu đã đăng nhập + dựa vào `runId` khó đoán do SDK sinh; KHÔNG lưu bảng mapping run→user, KHÔNG kiểm tra sở hữu theo từng run, KHÔNG thêm migration trong task này (data-model.md đã chốt không thêm bảng ở v1). Đây là thực thi đúng FR-015 bản đã sửa, không phải hướng yếu hơn spec. Lưu ý cổng merge: nếu người dùng bác phương án (a) tại T014, task này phải dừng và làm lại theo phương án (b) (lưu mapping khi start ở T005, GET so `userId` — lệch thì 404/403 — kèm task QA test chéo 2 tài khoản) trước khi merge; không tự ý code phương án (b) trong task này.
- **Kiểm tra xong**: dùng `runId` thật từ T005 — đang chạy → `{ status: "running" }` không có `result`; xong → `completed` kèm `result` đủ cấu trúc `EnrichmentResult`; `runId` bịa → 404 `run_not_found`; không cookie → 401 (kiểm chứng hệ thống ở T010).
- **Phụ thuộc**: T004 (cần hiểu handle run do `start()` ở T005 tạo ra; code route tự nó không import workflow function). File độc lập với T005 nên code song song được, nhưng kiểm chứng đầu-cuối phải chờ T005 + T007.

### T007 — [BE] Khói (smoke) đầu-cuối ở dev với Local World: start → poll → `completed`

- **File chạm tới**: không sửa code (trừ khi phát hiện lỗi thì quay lại đúng task sở hữu file đó: T002/T004/T005/T006). Ghi kết quả vào mô tả PR.
- **Chi tiết**:
  1. Chạy `pnpm dev` cho `apps/web` (qua script hiện có `pnpm --filter web dev`, env `.env.local` như thường lệ) với Local World mặc định — không đặt `WORKFLOW_TARGET_WORLD`, không cài thêm package World nào (plan D1).
  2. Đăng nhập bằng tài khoản dev thường dùng; chuẩn bị 1 lead có `RecognizedCard` hợp lệ (hoặc 1 `cardImportId` có snapshot hợp lệ) và enrichment đã cấu hình (model + `AI_GATEWAY_API_KEY`) như khi chạy route `/run`.
  3. Gọi `POST /api/enrichment/start` → ghi lại: thời gian phản hồi (phải trả ngay, AC-001) + `runId`. Tiếp tục poll `GET /api/enrichment/runs/<runId>` mỗi ~2 giây cho tới khi `completed`.
  4. Đối chiếu `result` khi `completed` với response của `POST /api/enrichment/run` trên cùng input: chỉ so **cấu trúc** — `findings[]` mỗi phần tử đủ `field`/`value`/`confidence`/`source` (+ `sourceUrl?`/`note?`), `steps[]`, `modelUsed` — KHÔNG so nội dung findings (kết quả model không xác định, spec "Làm rõ" #3/AC-005).
  5. Xác nhận route `.well-known/workflow/v1/*` của SDK xuất hiện/hoạt động được (run tự tiến triển qua các lần poll là bằng chứng; nếu run kẹt ở `running` mãi, kiểm tra đầu tiên là matcher ở T003).
- **Kiểm tra xong**: có bằng chứng ghi trong PR: `runId` mẫu, dãy trạng thái poll (`running` → `completed`), thời gian phản hồi của POST start, và kết luận so cấu trúc = khớp. Đây là cổng (gate) cho toàn bộ QA ở Giai đoạn 5.
- **Phụ thuộc**: T002, T003, T005, T006.

---

## Giai đoạn 4 — Điểm chạm giao diện (FE)

### T008 — [P] [FE] Thêm nút "Chạy nền" + poll trạng thái vào `enrichment-panel.tsx` (điều khoản tách follow-up)

- **Vai / phạm vi**: FE — Câu chuyện 7 / FR-016 / AC-010. Plan D6: gộp ở mức tối thiểu trong v1 vì điểm chạm nằm trọn trong 1 component; **điều khoản tách**: nếu khi code thấy phải xáo trộn state của panel tới mức có nguy cơ hồi quy luồng đồng bộ, DỪNG lại, không cố — tách thành follow-up riêng, ghi rõ lý do trong PR; nghiệm thu lõi AC-001..AC-009 không phụ thuộc task này.
- **File chạm tới**: `apps/web/features/card-import/enrichment-panel.tsx` (chỉ file này). Không sửa route/loop ở task này.
- **Chi tiết**:
  1. Đọc kỹ component hiện tại trước khi sửa: state hiện có `status: "idle" | "loading" | "done" | "error" | "not_configured"`, `findings`/`steps`/`modelUsed`/`error`/`applied`, và `handleRun()` gọi `POST /api/enrichment/run` rồi đổ kết quả thẳng vào các state hiển thị + nút "Áp dụng" (`handleApply`). Đường hiển thị gợi ý + Áp dụng hiện tại phải được tái sử dụng nguyên vẹn cho kết quả chạy nền — không xây đường hiển thị thứ hai.
  2. Thêm nút **"Chạy nền"** cạnh nút chạy đồng bộ hiện có (khu vực header của panel, cạnh nút "Bổ sung thông tin AI"/"Chạy lại"). Nút đồng bộ giữ nguyên vị trí/hành vi.
  3. Handler chạy nền mới (đặt tên phân biệt rõ, vd `handleRunBackground`): `POST /api/enrichment/start` với body `{ recognized }` giống hệt `handleRun`; xử lý lỗi gương `handleRun` — `code: "enrichment_not_configured"` (503) → trạng thái `not_configured` + message từ server; 401/lỗi khác → trạng thái `error` + message. Thành công (201) → lưu `runId` vào state mới (vd `backgroundRunId`) + trạng thái hiển thị "đang chạy nền" bằng text đơn giản kèm `runId`/trạng thái.
  4. Poll: dùng `setInterval` ~2 giây (hoặc vòng `setTimeout` đệ quy) gọi `GET /api/enrichment/runs/<runId>` — `running` → tiếp tục poll và cập nhật text trạng thái; `completed` → đổ `result.findings`/`result.steps`/`result.modelUsed` vào đúng các state hiển thị hiện có (`setFindings`/`setSteps`/`setModelUsed`, reset `applied`, `setStatus("done")`) để nút Áp dụng hoạt động y như luồng đồng bộ; `failed` → `setStatus("error")` + hiển thị `error.message` từ response. Lỗi mạng khi poll → dừng poll, về trạng thái `error`.
  5. Dọn dẹp bắt buộc: clear interval/timeout khi component unmount, khi `recognized` (lead) thay đổi, và khi người dùng khởi chạy lần mới (nền hoặc đồng bộ) — không để 2 vòng poll chạy đồng thời, không setState sau unmount. Dùng `useRef` giữ id của interval + `useEffect` cleanup như pattern React hiện có trong repo.
  6. Không thêm thư viện, không thêm màn hình/route UI mới, không hiển thị `runId` ra ngoài panel (ghi chú bảo mật ở contract §2).
- **Kiểm tra xong**: ở dev (cần BE xong — T007): từ màn hình làm giàu, bấm "Chạy nền" → thấy trạng thái tự cập nhật tới hoàn thành mà không reload trang; kết quả hiện đúng danh sách gợi ý và bấm "Áp dụng" điền được trường như luồng đồng bộ (AC-010, kiểm chứng lại ở T014); luồng đồng bộ cũ bấm vẫn chạy như trước. Nếu đã kích hoạt điều khoản tách: PR chỉ chứa ghi chú follow-up, không chứa nửa vời code FE.
- **Phụ thuộc**: về code — chỉ phụ thuộc contract (`contracts/api-enrichment-workflow.md`), nên bắt đầu song song với BE (T004–T006) được; về kiểm chứng — phụ thuộc T007.

---

## Giai đoạn 5 — Kiểm chứng & nghiệm thu (QA & AC)

### T009 — [P] [QA&AC] AC-009: typecheck riêng + build đầy đủ đều đạt

- **File chạm tới**: không sửa code. Nếu phát hiện lỗi, lỗi thuộc về task sở hữu file (T001–T006/T008) — QA chỉ báo, không tự sửa chéo.
- **Chi tiết**:
  1. Chạy typecheck của `apps/web` bằng script hiện có: `pnpm --filter web typecheck` (`tsc --noEmit`). Bắt buộc chạy riêng vì `next.config.mjs` đang đặt `typescript: { ignoreBuildErrors: true }` — build xanh không chứng minh được type đúng (plan §3/§8, AC-009).
  2. Chạy build đầy đủ: `pnpm --filter web build` (kèm env dummy/hiện hành như quy ước build của repo nếu thiếu env). Build cũng là nơi kiểm chứng sớm rủi ro `withWorkflow` (SWC plugin/tách bundle) xung đột với `cacheComponents`/turbopack/next-intl (plan §10) — nếu xung đột không xử lý được trong phạm vi, kết luận của task là **chặn phát hành feature** và báo lại, không nới scope.
- **Kiểm tra xong**: cả hai lệnh đều exit 0; ghi nguyên văn lệnh + kết quả vào PR/checklist nghiệm thu.
- **Phụ thuộc**: T002, T004, T005, T006 (và T008 nếu FE gộp đợt này). Làm song song với T010 được.

### T010 — [P] [QA&AC] AC-002 + AC-008 + nhóm lỗi đầu vào của start gương route `/run`

- **File chạm tới**: không sửa code. Cần app dev đang chạy (sau T007).
- **Chi tiết** (mỗi mục là 1 dòng pass/fail trong checklist):
  1. AC-002: `curl` **không** cookie/session tới `POST /api/enrichment/start` và tới `GET /api/enrichment/runs/<runId-bất-kỳ>` → cả hai đều **401** `{ code: "unauthorized" }`; xác nhận không có run nào được tạo từ request 401 (không có `runId` để poll tiếp).
  2. AC-008: đã đăng nhập, `GET /api/enrichment/runs/run-id-khong-ton-tai` → **404** `{ code: "run_not_found" }`, không trả nhầm dữ liệu của run khác.
  3. Nhóm lỗi đầu vào của POST start (đã đăng nhập) — đối chiếu từng mã với route `/run` trên cùng dữ liệu lỗi: body không phải JSON → 400 `invalid_request`; thiếu cả `recognized`/`fields`/`cardImportId` → 400; `cardImportId` không phải uuid → 400; `cardImportId` không tồn tại/không thuộc user → 404 `import_not_found`; bản ghi có dữ liệu đã lưu không dùng được (không snapshot hợp lệ, không `confirmed`) → 422 `invalid_snapshot`; enrichment chưa cấu hình (tắt capability `lead_enrichment`/bỏ key ở môi trường test) → 503 `enrichment_not_configured` **và không tạo run** (theo D4 — kiểm bằng cách xác nhận response không có `runId`).
  4. AC-001 (ghi cùng task này cho đủ bộ API): POST start hợp lệ → response 201 + `runId` về **trước** khi run hoàn thành (poll ngay sau đó vẫn thấy `running` ở lần poll đầu khi enrichment đủ chậm, hoặc so thời gian phản hồi với thời gian chạy đồng bộ trên cùng input).
- **Kiểm tra xong**: checklist 4 mục trên pass toàn bộ, kèm `curl`/response mẫu lưu trong PR.
- **Phụ thuộc**: T007. Làm song song với T009, T013 được.

### T011 — [QA&AC] AC-003: giết tiến trình giữa chừng — run tự resume và hoàn thành, run đã xong không chạy lại

- **File chạm tới**: không sửa code. Kịch bản tay trên dev với Local World (kế hoạch ở plan §8/AC-003).
- **Chi tiết**:
  1. Start 1 run nền (qua API như T007 hoặc nút FE nếu T008 đã gộp); trong lúc poll đang thấy `running`, **kill cứng** tiến trình dev (`SIGKILL`, vd `kill -9 <pid>` của `pnpm dev`/process Next) — không tắt gracefully.
  2. Khởi động lại app (`pnpm --filter web dev` như cũ, cùng thư mục/máy để Local World giữ event log trên filesystem).
  3. Poll lại đúng `runId` cũ — không start run mới: kỳ vọng run tự resume (step chạy lại từ đầu — đây là hành vi đúng của đơn vị bền vững v1 theo FR-005/spec "Làm rõ" #2, không phải lỗi) và chuyển tới `completed` với kết quả đầy đủ (đủ cấu trúc như AC-005).
  4. Kiểm chứng phụ: lấy 1 run đã `completed` từ trước, để nguyên qua một chu kỳ kill/restart khác → poll lại vẫn trả nguyên `result` cũ, không bị thực thi lại (FR-005: phần đã ghi nhận hoàn thành không chạy lại).
  5. Ghi rõ trong biên bản: thời điểm kill, số lần poll sau restart tới khi `completed`, và xác nhận không có tác dụng phụ ghi dữ liệu nào xảy ra do chạy lại (liên hệ T013/AC-007).
- **Kiểm tra xong**: cả hai ý (run dở tự hoàn thành; run xong không chạy lại) đều pass và có biên bản kèm `runId` + dãy trạng thái.
- **Phụ thuộc**: T007. Không làm song song với T012 (cùng chiếm app dev và cùng can thiệp tiến trình/cấu hình).

### T012 — [QA&AC] AC-004: lỗi tạm thời được retry tới thành công; lỗi vĩnh viễn `failed` sau tối đa 3 lần retry (tổng tối đa 4 lần thực thi — quyết định diễn giải plan §8.1); lỗi chưa cấu hình `failed` ngay không retry — **chỉ bằng cơ chế ép lỗi xác định theo bộ đếm (plan §8.1)**

- **File chạm tới**: không sửa code production. Chỉ dùng stub/harness kiểm thử cục bộ của QA (không merge vào app) + cấu hình của **user kiểm thử** đặt **trước** khi start và **giữ nguyên suốt từng kịch bản**; khôi phục nguyên trạng sau khi xong. **CẤM** cách cũ: đổi/gỡ/khôi phục cấu hình giữa chừng theo thời gian để đua với lịch retry của SDK (backoff mặc định không phải cam kết kiểm thử — kết quả không tái lập được giữa các lần chạy/QA).
- **Cơ chế ép lỗi xác định (định nghĩa đầy đủ ở plan §8.1 — tóm tắt để thực thi)**:
  - **Bộ đếm lần thử**: stub/harness lưu số lần step đã thực thi vào trạng thái bền ngoài workflow (file bộ đếm trên đĩa, vd `attempts.json`, hoặc bộ đếm trong stub server), tăng đúng 1 mỗi lần thực thi; reset thủ công về 0 trước mỗi kịch bản. Hành vi theo bộ đếm, không theo thời gian: `FAIL_FIRST_N=1` → lần thực thi đầu ném lỗi thường (retryable), từ lần sau thành công; `FAIL_ALWAYS=1` → mọi lần đều ném lỗi thường.
  - **Bằng chứng chấp nhận được (bắt buộc, cho mọi kịch bản)**: (a) số lần thực thi step lấy từ observability (`npx workflow web`) hoặc log SDK; (b) nội dung file bộ đếm/log của stub khớp số lần đó; (c) trạng thái cuối qua `GET /api/enrichment/runs/[runId]`. **Không** dùng thời gian từ start tới `failed` làm bằng chứng phân biệt có/không retry.
- **Chi tiết**:
  1. Lỗi tạm thời (retry → thành công): reset bộ đếm, đặt stub/harness ở `FAIL_FIRST_N=1` và giữ nguyên cấu hình suốt kịch bản → start run (qua harness dùng cùng Workflow SDK + Local World cho nhánh bộ đếm; nếu chạy trên workflow thật thì nguồn ép lỗi phải là stub theo bộ đếm đã nối sẵn từ trước, không phải đổi cấu hình tay giữa chừng) → poll: run đi tới `completed` và số lần thực thi step **≥2** theo bằng chứng ở trên.
  2. Lỗi vĩnh viễn trên workflow thật: **trước** khi start, đặt model của user kiểm thử thành model id không tồn tại (hoặc stub `FAIL_ALWAYS=1`) và giữ nguyên tới khi run kết thúc → start qua `POST /api/enrichment/start` → poll: run chuyển `failed` sau **tối đa 3 lần retry** của SDK (plan D3), số lần thực thi step quan sát được = **4** (1 lần đầu + 3 retry — quyết định diễn giải plan §8.1), và `GET runs/[runId]` trả `failed` kèm `error.message` đọc được (FR-009).
  3. Lỗi chưa cấu hình phát sinh trong run (FatalError, không retry): **không** gỡ cấu hình sau start. Thay vào đó: đặt cấu hình của user kiểm thử ở trạng thái chưa cấu hình **từ trước** (capability `lead_enrichment` disabled hoặc thiếu key/model), rồi khởi chạy workflow **trực tiếp bằng harness QA** — `start(enrichLeadWorkflow, [recognized, userId])` qua `workflow/api` trong script dev/QA, **bỏ qua route start** (nên cũng bỏ qua cổng 503 `checkEnrichmentConfigured` của nó, vốn dùng cùng logic phân giải cấu hình với loop nên không thể start-pass/step-fail xác định qua route) → step thật ném `EnrichmentNotConfiguredError` xác định ngay lần đầu → ánh xạ `FatalError` → run `failed` với **đúng 1 lần thực thi step** theo observability/bộ đếm (FR-006).
  4. Khôi phục toàn bộ cấu hình test về trạng thái ban đầu, reset bộ đếm, và start lại 1 run kiểm tra app khoẻ (`completed`) trước khi đóng task.
- **Kiểm tra xong**: 3 kịch bản trên có biên bản riêng ghi rõ: cơ chế ép lỗi + giá trị bộ đếm/tham số stub, số lần thực thi step quan sát được, trạng thái cuối — cả 3 đều tái lập được khi chạy lại nguyên văn biên bản (chạy lại cho cùng kết quả). Biên bản nào dựa vào thao tác đổi cấu hình giữa chừng hoặc vào thời gian kết thúc → không đạt, phải làm lại. Cấu hình môi trường đã khôi phục.
- **Phụ thuộc**: T007, và nên sau T011 (tránh hai kịch bản cùng can thiệp app dev/cấu hình một lúc).

### T013 — [P] [QA&AC] AC-005 + AC-006 + AC-007: cấu trúc kết quả, fallback đồng bộ không hồi quy, không tự ghi đè dữ liệu

- **File chạm tới**: không sửa code.
- **Chi tiết**:
  1. AC-005: poll 1 run nền từ đầu tới cuối và ghi dãy trạng thái: `running` (không kèm `result`) → `completed` kèm `result`; kiểm `result` đủ `findings[]` (mỗi finding có `field`, `value`, `confidence`, `source`), `steps[]`, thông tin model — so **cấu trúc** với response 200 của `POST /api/enrichment/run` trên cùng input, không so nội dung findings.
  2. AC-006: gọi lại `POST /api/enrichment/run` (đồng bộ) trên cùng dữ liệu kiểm thử như trước khi có feature → 200, hành vi và cấu trúc kết quả như cũ (FR-013). Kèm kiểm tra bằng `git diff` trên nhánh: route `/run`, `loop.ts`, `types.ts`, `tools.ts` **không có thay đổi nào** trong toàn bộ feature.
  3. AC-007: trước khi run nền hoàn thành, chụp lại dữ liệu hiện có liên quan (các trường trên form xem lại danh thiếp / bản ghi contact nếu lead đã lưu); sau khi run `completed` mà **chưa** bấm Áp dụng → đối chiếu: không trường nào thay đổi. Sau đó (qua UI) bấm Áp dụng đúng 1 finding → chỉ trường tương ứng thay đổi. Rà soát diff bổ sung: `workflow.ts` và 2 route mới không chứa đường ghi contact/card_imports (bất biến hiến chương II, plan §9).
- **Kiểm tra xong**: 3 mục pass; bằng chứng gồm response mẫu của 2 đường chạy, ảnh chụp/chênh lệch dữ liệu trước–sau cho AC-007, và kết quả `git diff --stat` xác nhận các file cấm sửa không đổi.
- **Phụ thuộc**: T007. Làm song song với T009, T010 được (không can thiệp tiến trình/cấu hình như T011/T012).

### T014 — [QA&AC + BE] AC-010 (nếu FE gộp) + **cổng chặn merge cứng cho 2 quyết định đã chốt D4/D5** + ghi chú bàn giao giới hạn Local World

- **File chạm tới**: mô tả PR của feature (và `README`/ghi chú trong PR nếu repo có chỗ ghi sẵn — không tự tạo file tài liệu mới ngoài `specs/003-durable-lead-enrichment/` nếu chưa được yêu cầu).
- **Chi tiết**:
  1. AC-010 (chỉ khi T008 gộp, không áp dụng nếu T008 đã tách follow-up): kiểm trên UI thật ở dev — mở màn hình làm giàu, bấm "Chạy nền" → trạng thái tự cập nhật tới hoàn thành/lỗi không cần reload trang; kết quả dùng được nút Áp dụng như luồng đồng bộ; đổi sang lead khác giữa lúc đang poll → vòng poll cũ dừng, không đổ kết quả của lead cũ vào lead mới.
  2. **Cổng chặn merge cứng — xác nhận cuối của người dùng cho D4/D5 (không phải mục ghi chú thông thường)**: D4 (start kiểm tra cấu hình đồng bộ, chưa cấu hình → 503, không tạo run — spec FR-001) và D5 (phương án (a): v1 single-user chỉ yêu cầu đăng nhập + `runId` khó đoán, không lưu mapping run→user, không kiểm tra sở hữu theo từng run — spec FR-015) đã được chốt trong spec/plan ở vòng sửa audit 2026-10-23, nhưng PR **chỉ được đánh dấu sẵn sàng merge khi PR chứa xác nhận rõ ràng của người dùng** đối với đúng 2 quyết định này (ghi trong mô tả PR hoặc comment xác nhận được dẫn chiếu từ PR). Chưa có xác nhận đó → PR phải giữ Draft/chưa sẵn sàng và **không được merge**, kể cả khi mọi AC khác đều pass. Nếu người dùng bác hoặc sửa một quyết định tại cổng này → dừng merge, sửa lại spec/plan/tasks/data-model/contract cho nhất quán theo quyết định mới rồi mới code/merge phần liên quan (riêng D5: bác phương án (a) thì phải chuyển sang phương án (b) — lưu mapping run→user khi start, GET so `userId` lệch thì 404/403, bổ sung task QA test chéo 2 tài khoản — trước khi code tiếp T006). Đồng thời viết mục "Giới hạn & quyết định để mở" trong PR, chép đúng tinh thần plan §6/§10: (a) Local World **chỉ cho dev** — production bị chặn cho tới khi QĐ-MỞ-001 được chốt (Vercel World managed hoặc Postgres World tự host; khi chốt chỉ đổi `WORKFLOW_TARGET_WORLD` + package World, không đổi code workflow/step; kèm lưu ý rà soát quyền riêng tư nơi lưu event log vì chứa dữ liệu danh thiếp); (b) trạng thái xác nhận D4/D5 theo cổng cứng ở trên (đã xác nhận bởi ai/khi nào, hoặc đang chặn merge vì chưa xác nhận); (c) nhắc fallback: route đồng bộ `/api/enrichment/run` giữ nguyên, gỡ SDK không chặn nghiệp vụ.
  3. Tổng hợp checklist AC-001..AC-010 từ T007/T009–T013 vào PR: mỗi AC một dòng pass/fail + liên kết tới biên bản tương ứng; AC nào fail thì PR không được đánh dấu sẵn sàng merge.
- **Kiểm tra xong**: PR có đủ mục giới hạn, **bằng chứng xác nhận cuối của người dùng cho D4 và D5** (thiếu bằng chứng này thì kết luận của task là **CHẶN MERGE**, không phải pass), và bảng tổng hợp AC; AC-010 có kết luận rõ (pass, hoặc "không áp dụng — FE đã tách follow-up theo T008").
- **Phụ thuộc**: T009, T010, T011, T012, T013 (và T008 cho phần AC-010).

---

## Thứ tự thực thi tóm tắt

```
T001 ──► T002 ──┐
  │             ├──► T007 ──► T010 [P] ──┐
  ├──► T004 ──► T005 ──┐       T013 [P] ──┤
  │             T006 [P]┘       T009 [P] ──┼──► T014
T003 [P] ─────────────────────► T011 ──► T012 ┘
T008 [P, theo contract] ──► (kiểm chứng qua T014)
```

- Song song ngay từ đầu: T003 và T008 (FE theo contract) chạy cùng lúc với BE T001→T004.
- Cổng cứng: T007 pass mới bắt đầu Giai đoạn 5; T011 và T012 chạy **tuần tự** (cùng can thiệp tiến trình/cấu hình của app dev).
- Ngoài phạm vi của bộ task này (đúng spec/plan §11): batch nhiều lead, lịch tự động, huỷ run, thông báo đẩy, UI quản trị runs, chốt hạ tầng production (QĐ-MỞ-001), áp cơ chế durable cho luồng khác.

# Danh sách công việc: Chuyển hóa danh thiếp thành dữ liệu đối tác chuẩn hóa

**Tài liệu đầu vào**: Tài liệu thiết kế trong `specs/001-event-lead-platform/`

**Điều kiện tiên quyết**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/mvp-api.md`

**Kiểm thử**: Không tạo task viết test riêng trong danh sách này; đặc tả yêu cầu kiểm chứng acceptance qua [quickstart.md](./quickstart.md). Có thể bổ sung task test tự động khi người dùng yêu cầu.

**Cách tổ chức**: Task được gom theo câu chuyện người dùng để có thể triển khai theo lát cắt.

**Mã câu chuyện**: US1 chuyển danh thiếp thành hồ sơ chuẩn hóa; US2 bổ sung/đánh giá hồ sơ; US3 theo dõi; US4 sourcing; US5 export; US6 cơ hội kết nối.

## Giai đoạn 1: Khởi tạo dự án

**Mục đích**: Chuẩn bị môi trường để xây luồng chuyển danh thiếp thành hồ sơ chuẩn hóa; T001 là task khởi tạo không viết mã nguồn.

- [ ] T001 [P] Khởi tạo môi trường development không viết mã nguồn: tạo dự án Supabase dev, xác nhận quyền truy cập và ghi các bước/định danh không nhạy cảm vào `docs/setup.md`.
- [ ] T002 Khởi tạo ứng dụng Next.js 16 App Router với TypeScript, React 19 và cấu trúc `src/app/` theo `specs/001-event-lead-platform/plan.md`.
- [ ] T003 Cài và cấu hình Tailwind CSS 4, shadcn/ui và các thành phần AI SDK Elements cần thiết trong `package.json`, `src/app/globals.css` và `components.json`.
- [ ] T004 Tạo mẫu biến môi trường không chứa bí mật trong `.env.example` và mô tả cách cấu hình cục bộ trong `docs/setup.md`.

---

## Giai đoạn 2: Nền tảng dùng chung

**Mục đích**: Hoàn thiện các ranh giới dữ liệu, phiên đăng nhập, phân quyền và tích hợp nền trước khi làm câu chuyện người dùng.

- [ ] T005 Tạo migration khởi đầu cho Organization, Membership, Event, Company, Contact và EventContact trong `supabase/migrations/` theo `specs/001-event-lead-platform/data-model.md`.
- [ ] T006 Bật RLS và viết policy theo membership/tổ chức cho bảng nghiệp vụ trong `supabase/migrations/`.
- [ ] T007 Tạo client Supabase SSR phía máy chủ, client trình duyệt giới hạn quyền và kiểm tra session trong `src/lib/supabase/`.
- [ ] T008 Tạo tiện ích lấy organization context và kiểm tra vai trò ở server action/route handler trong `src/lib/auth/`.
- [ ] T009 Tạo bucket private cùng policy truy cập theo organization path trong `supabase/migrations/`.
- [ ] T010 Thiết lập xử lý lỗi có cấu trúc và nhật ký an toàn, không ghi ảnh, token hoặc nội dung ghi chú nhạy cảm trong `src/lib/observability/`.
- [ ] T011 Tạo schema phiên bản hóa cho dữ liệu danh thiếp chuẩn hóa (tên, chức danh, doanh nghiệp, email, điện thoại, địa chỉ, ngôn ngữ), giữ giá trị gốc và trạng thái trường; tạo adapter `CardRecognitionProvider` trong `src/lib/ai/card-recognition.ts`.
- [ ] T012 Tạo migration/versioning convention và seed dữ liệu tổng hợp cho môi trường development trong `supabase/migrations/` và `supabase/seed.sql`.

**Điểm kiểm tra**: Môi trường development đăng nhập được; user hai tổ chức không đọc/ghi chéo dữ liệu; bucket ảnh không công khai; không có credential trong client.

---

## Giai đoạn 3: US1 — Chuyển danh thiếp thành hồ sơ chuẩn hóa (P1, MVP)

**Mục tiêu**: Tạo sự kiện và liên hệ từ danh thiếp/nhập tay; nhận dạng đa ngôn ngữ, chuẩn hóa trường, lưu bằng chứng/nguồn, cho người dùng rà soát và sửa trước khi xác nhận; ghi bối cảnh và xử lý trùng lặp.

**Kiểm chứng độc lập**: Tạo một sự kiện, nhập ảnh danh thiếp, sửa trường nhận dạng, xác nhận liên hệ, thêm ghi chú và tìm lại được dữ liệu sau khi tải lại.

- [ ] T013 [P] [US1] Tạo trang danh sách và form tạo/sửa sự kiện trong `src/features/events/` và `src/app/events/`.
- [ ] T014 [P] [US1] Tạo trang danh sách/chi tiết liên hệ và bộ lọc theo tên, công ty, sự kiện, nhãn, người phụ trách trong `src/features/contacts/` và `src/app/contacts/`.
- [ ] T015 [US1] Tạo migration cho CardImport, ContactFieldEvidence và MeetingNote theo trạng thái/quan hệ trong `supabase/migrations/`.
- [ ] T016 [US1] Tạo endpoint tạo import, upload URL có hạn và xác minh loại/kích thước tệp trong `src/app/api/card-imports/route.ts`.
- [ ] T017 [US1] Kết nối provider OCR/vision đã được phê duyệt; nhận dạng và chuẩn hóa tiếng Việt, Anh, Hàn, Nhật, Trung theo năng lực pilot; trả về giá trị gốc, giá trị chuẩn hóa, trạng thái trường và metadata nguồn trong `src/services/card-recognition/`.
- [ ] T018 [US1] Tạo giao diện rà soát hồ sơ danh thiếp chuẩn hóa: đối chiếu giá trị gốc/đã chuẩn hóa, sửa hoặc từ chối trường, xem độ chắc chắn/ngôn ngữ trước khi xác nhận trong `src/features/card-import/review-card.tsx`.
- [ ] T019 [US1] Tạo endpoint xác nhận/từ chối import, tạo Contact chỉ sau thao tác người dùng và áp dụng khóa idempotency trong `src/app/api/card-imports/[importId]/confirm/route.ts`.
- [ ] T020 [US1] Tạo gợi ý liên hệ/doanh nghiệp có khả năng trùng, giao diện so sánh và ghi nhận lựa chọn người dùng trong `src/services/duplicates/` và `src/features/contacts/duplicate-review.tsx`.
- [ ] T021 [US1] Tạo form ghi chú, nhu cầu, cơ hội, nhãn và bước tiếp theo gắn với sự kiện/liên hệ trong `src/features/contacts/meeting-context.tsx`.
- [ ] T022 [US1] Thể hiện trạng thái đang xử lý, lỗi, thử lại và nhập một phần cho lô 5–10 danh thiếp trong `src/features/card-import/`.

---

## Giai đoạn 4: US3 — Theo dõi và duy trì quan hệ (P1, MVP)

**Mục tiêu**: Tạo bản nháp tiếp nối từ ngữ cảnh đã được phép dùng; người dùng sửa và duyệt; theo dõi giai đoạn cùng lời nhắc.

**Kiểm chứng độc lập**: Tạo bản nháp, sửa/lưu, duyệt và xác nhận trạng thái; không có email/tin nhắn nào tự gửi.

- [ ] T023 [P] [US3] Tạo migration FollowUp với trạng thái `draft`, `approved`, `dismissed`, `manually_sent`, `expired` trong `supabase/migrations/`.
- [ ] T024 [US3] Tạo dịch vụ soạn email theo ngôn ngữ/ngữ cảnh bằng Vercel AI SDK; lưu prompt version và danh sách context ID trong `src/services/follow-ups/draft.ts`.
- [ ] T025 [US3] Tạo endpoint tạo, sửa, duyệt và bỏ bản nháp theo `specs/001-event-lead-platform/contracts/mvp-api.md` trong `src/app/api/follow-ups/`.
- [ ] T026 [US3] Tạo giao diện xem/sửa bản nháp và hiển thị trạng thái AI bằng AI SDK Elements trong `src/features/follow-ups/`.
- [ ] T027 [US3] Tạo cập nhật giai đoạn quan hệ và lời nhắc với quyền organization scope trong `src/features/follow-ups/relationship-stage.tsx` và `src/features/follow-ups/reminder.tsx`.
- [ ] T028 [US3] Đảm bảo MVP không có hành động gửi tự động; ghi nhận rõ người duyệt và phiên bản nội dung đã duyệt trong `src/services/follow-ups/approval.ts`.

---

## Giai đoạn 5: US5 — Xuất liên hệ đã duyệt (P1, MVP)

**Mục tiêu**: Xuất vCard và CSV/bảng tính có trạng thái cho từng bản ghi.

**Kiểm chứng độc lập**: Chọn liên hệ đã duyệt, xuất từng định dạng, đối chiếu trường và xem lỗi/partial nếu có.

- [ ] T029 [P] [US5] Tạo migration ExportJob và đường dẫn kết quả private có thời hạn trong `supabase/migrations/`.
- [ ] T030 [US5] Tạo bộ chuyển Contact đã xác nhận sang vCard và CSV, giữ encoding tiếng Việt trong `src/services/exports/`.
- [ ] T031 [US5] Tạo endpoint tạo export, trạng thái, download URL có hạn và thống kê thành công/thất bại trong `src/app/api/exports/`.
- [ ] T032 [US5] Tạo giao diện chọn liên hệ, định dạng và tải kết quả với thông báo partial/error trong `src/features/exports/`.

**Checkpoint MVP**: US1, US3 và US5 dùng được độc lập cho nhập, theo dõi và xuất liên hệ trong một tổ chức.

---

## Giai đoạn 6: US2 — Bổ sung và đánh giá doanh nghiệp (P2)

**Mục tiêu**: Hoàn thiện hồ sơ đối tác chuẩn hóa bằng tra cứu nguồn công khai phù hợp tại Việt Nam; lưu nguồn gốc/thời điểm và đánh giá phù hợp/rủi ro có giải thích.

**Kiểm chứng độc lập**: Mở hồ sơ doanh nghiệp đã bổ sung, xem từng nguồn/thời điểm, tiêu chí đánh giá và khoảng trống dữ liệu.

- [ ] T033 [P] [US2] Chốt nguồn công khai được phép dùng để bổ sung hồ sơ đối tác tại Việt Nam (website, đăng ký doanh nghiệp và nguồn phù hợp khác), điều khoản, trường có thể xác minh, quyền lưu/cache và khu vực xử lý; ghi quyết định vào `specs/001-event-lead-platform/research.md`.
- [ ] T034 [US2] Tạo migration CompanyEvidence và Assessment với provenance, thời điểm truy xuất, trạng thái xác minh và tiêu chí trong `supabase/migrations/`.
- [ ] T035 [US2] Tạo adapter nguồn công khai để truy vấn và chuẩn hóa hồ sơ doanh nghiệp trong `src/services/company-enrichment/`.
- [ ] T036 [US2] Tạo luồng bổ sung có giới hạn, retry, xử lý tên trùng và nguồn không khả dụng trong `src/services/company-enrichment/`.
- [ ] T037 [US2] Tạo giao diện hồ sơ 360 độ hiển thị nguồn, thời điểm, mức chắc chắn và dữ liệu thiếu trong `src/features/companies/company-profile.tsx`.
- [ ] T038 [US2] Tạo đánh giá phù hợp/rủi ro theo tiêu chí người dùng và hiển thị căn cứ, không phát ngôn như tư vấn chuyên môn trong `src/services/assessments/` và `src/features/companies/assessment-panel.tsx`.
- [ ] T039 [US2] Tạo kết nối CRM theo adapter, preview mapping và phê duyệt trước ghi/ghi đè trong `src/services/crm/`.

---

## Giai đoạn 7: US4 — Tìm và lập danh sách nhà cung cấp (P3)

**Mục tiêu**: Tạo yêu cầu sourcing, tìm và so sánh nhà cung cấp cùng bằng chứng, lưu danh sách ngắn.

**Kiểm chứng độc lập**: Tạo yêu cầu, xem ít nhất ba ứng viên, xác định khoảng trống và lưu danh sách ngắn.

- [ ] T040 [P] [US4] Tạo migration SourcingRequest, SupplierCandidate, SupplierAssessment và ShortlistEntry trong `supabase/migrations/`.
- [ ] T041 [US4] Tạo form mô tả sản phẩm, thị trường, quy mô và tiêu chí nhà cung cấp trong `src/features/sourcing/request-form.tsx`.
- [ ] T042 [US4] Tạo adapter tìm kiếm/khảo sát nguồn nhà cung cấp đã được phép tại thị trường mục tiêu trong `src/services/sourcing/`.
- [ ] T043 [US4] Tạo hồ sơ và bảng so sánh năng lực, sản phẩm, chứng nhận cùng trạng thái bằng chứng trong `src/features/sourcing/supplier-comparison.tsx`.
- [ ] T044 [US4] Tạo thao tác lưu shortlist và câu hỏi cần xác minh trong `src/features/sourcing/shortlist.tsx`.
- [ ] T045 [US4] Tạo bản nháp yêu cầu báo giá/câu hỏi đàm phán có người duyệt, không gửi tự động trong `src/services/sourcing/negotiation-draft.ts`.

---

## Giai đoạn 8: US6 — Phát hiện cơ hội kết nối (P3)

**Mục tiêu**: Đề xuất quan hệ chung hoặc nhu cầu bổ trợ có bằng chứng và không tự khởi tạo lời giới thiệu.

**Kiểm chứng độc lập**: Xem gợi ý cùng đường dẫn/bằng chứng, bỏ qua hoặc chấp nhận; không phát sinh outbound khi chưa duyệt.

- [ ] T046 [P] [US6] Tạo migration RelationshipEdge và IntroductionSuggestion có organization scope và evidence reference trong `supabase/migrations/`.
- [ ] T047 [US6] Tạo dịch vụ đối chiếu quan hệ dùng dữ liệu người dùng được phép xem và ghi lại đường dẫn bằng chứng trong `src/services/relationships/`.
- [ ] T048 [US6] Tạo bảng/đồ thị quan hệ với nhãn nguồn và trạng thái chưa xác minh trong `src/features/relationships/`.
- [ ] T049 [US6] Tạo thao tác chấp nhận/bỏ qua gợi ý; chỉ chuẩn bị nội dung giới thiệu sau khi người dùng chọn trong `src/features/relationships/introduction-review.tsx`.

---

## Giai đoạn 9: Hoàn thiện và kiểm tra xuyên suốt

- [ ] T050 [P] Rà soát khả năng truy cập, điều hướng bàn phím, trạng thái tải/lỗi và bản dịch tiếng Việt/Anh trong `src/app/` và `src/features/`.
- [ ] T051 Rà soát policy lưu/xóa theo tổ chức cho Contact, ảnh import và MeetingNote; cập nhật quy trình xóa trong `src/services/retention/`.
- [ ] T052 Rà soát mọi log, prompt và thông báo để không rò PII hoặc dữ liệu xác thực trong `src/lib/observability/` và `src/lib/ai/`.
- [ ] T053 Rà soát migration, RLS, Storage policies và luồng xóa/khôi phục theo `specs/001-event-lead-platform/quickstart.md`.
- [ ] T054 Cập nhật hướng dẫn thiết lập và xác minh acceptance trong `specs/001-event-lead-platform/quickstart.md`.
- [ ] T055 Ghi kết quả kiểm tra pilot OCR/model, hiệu năng và chi phí vào `specs/001-event-lead-platform/research.md` trước khi bật cho người dùng thật.

## Phụ thuộc và thứ tự thực hiện

### Phụ thuộc theo giai đoạn

- Mục tiêu sản phẩm xuyên suốt là hồ sơ đối tác chuẩn hóa từ danh thiếp; MVP không bao gồm tra cứu công khai sâu nhưng phải lưu cấu trúc và provenance để mở rộng.
- Giai đoạn 1 bắt đầu ngay; T001 chuẩn bị môi trường **không viết mã nguồn**, song song được với scaffold ứng dụng.
- Giai đoạn 2 phụ thuộc tối thiểu vào T002–T004; hoàn tất trước mọi câu chuyện người dùng.
- Các câu chuyện P1 (US1, US3, US5) tạo MVP. US3 và US5 cần Contact/Event từ US1 nên thực hiện sau phần nền tảng US1.
- US2 cần Contact/Company từ US1; CRM chỉ triển khai sau khi bản preview/approval hiện có.
- US4 cần adapter nguồn nhà cung cấp và quyết định thị trường/nguồn được phép; không chặn MVP.
- US6 cần hồ sơ và bằng chứng từ US2/US4; đây là giai đoạn sau.
- Giai đoạn 9 phụ thuộc các luồng được chọn để phát hành.

### Cơ hội chạy song song

- T001 và T002 có thể chạy song song: một task chuẩn bị dịch vụ/tài liệu không code, task kia scaffold ứng dụng.
- Sau nền tảng, T013/T014 có thể phát triển song song vì nằm ở module UI khác nhau.
- T030 (serializer export) và T032 (giao diện export) có thể chạy song song sau khi thống nhất schema ExportJob.
- Ở P2, T035 adapter và T037 giao diện hồ sơ có thể phát triển song song với fixture, sau khi chốt hợp đồng CompanyEvidence.
- Ở P3, thành phần sourcing và relationship có thể được chia sau khi có nền tảng Company/Evidence; không ghép công việc vào một file chung.

## Chiến lược triển khai

### MVP trước

1. Hoàn tất Giai đoạn 1 và Giai đoạn 2.
2. Hoàn tất US1, sau đó US3 và US5.
3. Dùng Quickstart kiểm chứng nhập/sửa/ghi chú, duyệt bản nháp không gửi và export vCard/CSV.
4. Chỉ phát hành pilot sau khi rà soát quyền theo tổ chức, Storage riêng và chính sách xử lý ảnh.

### Phát hành tăng dần

1. Đưa MVP Giai đoạn 1 tới nhóm thử nghiệm tại Việt Nam.
2. Dùng số liệu/feedback để hiệu chỉnh OCR, trùng lặp và thời gian theo dõi.
3. Chỉ sau khi chốt nguồn dữ liệu/điều khoản, triển khai US2 và CRM trong Giai đoạn sản phẩm 2.
4. Mở US4/US6 trong giai đoạn sau khi có căn cứ nguồn, quyền truy cập và bằng chứng đủ chất lượng.

## Ghi chú

- `[P]` chỉ dùng cho task có thể chạy song song mà không sửa cùng tệp hoặc phụ thuộc đầu ra chưa có.
- Nhãn `[US#]` nối task với câu chuyện tương ứng trong `spec.md`.
- T001 là bước khởi tạo môi trường/tài liệu không code theo yêu cầu; T002 trở đi có thể tạo/cấu hình mã nguồn.
- Chưa có yêu cầu tạo test tự động; task test riêng sẽ được thêm khi người dùng yêu cầu. Acceptance vẫn cần kiểm chứng trước khi phát hành.
- Nhà cung cấp OCR/LLM, nguồn registry Việt Nam và hosting phải qua rà soát dữ liệu/quyền truy cập trước khi xử lý dữ liệu thật.

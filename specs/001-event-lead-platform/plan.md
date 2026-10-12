# Kế hoạch triển khai: Chuyển hóa danh thiếp thành dữ liệu đối tác chuẩn hóa

**Nhánh**: `001-event-lead-platform` | **Ngày**: 2026-10-12 | **Đặc tả**: [spec.md](./spec.md)

**Đầu vào**: Đặc tả tính năng tại `specs/001-event-lead-platform/spec.md`

## Tóm tắt

EventLead SI hướng tới chuyển danh thiếp thành hồ sơ đối tác chuẩn hóa, có nguồn gốc dữ liệu và sẵn sàng tái sử dụng: nhận dạng đa ngôn ngữ → chuẩn hóa trường → người dùng rà soát → gắn bối cảnh sự kiện → tra cứu nguồn công khai → tổng hợp hồ sơ. Theo phạm vi MVP đã xác nhận, bản đầu tiên tập trung nhập danh thiếp, chuẩn hóa thông tin trích xuất, duyệt thủ công, bối cảnh cuộc gặp, theo dõi có người duyệt và xuất dữ liệu; tra cứu công khai sâu cùng CRM/sourcing thuộc các giai đoạn sau. Kiến trúc mặc định sử dụng Next.js 16 App Router, Supabase Postgres/Auth/Storage, Vercel AI SDK và AI SDK Elements, với mô hình bằng chứng/provenance để hỗ trợ hoàn thiện hồ sơ ở giai đoạn sau.

## Bối cảnh kỹ thuật

**Ngôn ngữ/phiên bản**: TypeScript; Node.js 22 trở lên; React 19; Next.js 16 App Router.

**Thư viện chính**: Next.js 16, Supabase JS và `@supabase/ssr`, Vercel AI SDK (`ai` và provider adapter được chọn sau), AI SDK Elements, shadcn/ui, Tailwind CSS 4. Phiên bản gói được chốt trong lockfile khi khởi tạo ứng dụng và đối chiếu tài liệu phiên bản hiện hành lúc triển khai.

**Lưu trữ**: Supabase PostgreSQL cho dữ liệu nghiệp vụ; Supabase Storage với bucket riêng cho ảnh danh thiếp và tệp cuộc gặp được phép lưu. Tất cả bảng được phơi bày qua Data API phải có RLS và policy theo tổ chức.

**Kiểm thử**: Vitest cho unit/contract tests; Playwright cho luồng trình duyệt đầu-cuối; kiểm thử RLS và Storage bằng người dùng thuộc các tổ chức khác nhau. Kế hoạch này chỉ xác định cách kiểm chứng, không chạy hoặc tạo bộ kiểm thử trong bước lập kế hoạch.

**Nền tảng mục tiêu**: Ứng dụng web tương thích trình duyệt hiện đại; máy chủ Node.js 22+. Không phụ thuộc tính năng riêng của nhà cung cấp hosting trong MVP.

**Loại dự án**: Ứng dụng web đơn, đa tổ chức.

**Mục tiêu hiệu năng**: Đáp ứng tiêu chí UX trong đặc tả: nhập một thẻ thành hồ sơ đã duyệt dưới 2 phút trong đánh giá; tìm liên hệ và bối cảnh sự kiện trong 30 giây; hỗ trợ lô ban đầu khoảng 5–10 danh thiếp. Dữ liệu đo phải tách thời gian xử lý nền khỏi thời gian người dùng xem/sửa.

**Ràng buộc**: Không tự gửi nội dung ra ngoài; luôn có bước người dùng duyệt. Không dùng service-role key ở trình duyệt. Ảnh và ghi chú riêng tư không được công khai. Nhà cung cấp OCR/LLM chưa được chỉ định; chọn sau khi rà soát xử lý dữ liệu, khu vực lưu trữ, điều khoản và chất lượng trên bộ danh thiếp Việt/Anh/Hàn/Nhật/Trung đại diện. Mọi kết quả trích xuất đều cần người dùng xác nhận.

**Quy mô/phạm vi**: MVP cho đội ngũ B2B tại Việt Nam; sự kiện có thể tích lũy hàng chục đến hàng trăm danh thiếp, nhập theo các lô mục tiêu 5–10 thẻ để dễ theo dõi và xử lý lỗi. OCR hướng tới tiếng Việt, Anh, Hàn, Nhật và Trung; chỉ công bố ngôn ngữ/trường đã đánh giá được. Thiết kế hỗ trợ nhiều tổ chức nhưng không áp đặt SLA hoặc giới hạn lưu lượng sản xuất khi chưa có số liệu pilot. Tra cứu nguồn công khai sâu, tích hợp CRM, đồ thị quan hệ, sourcing và hộp thư hợp nhất nằm ngoài MVP.

## Kiểm tra hiến chương

| Nguyên tắc | Cách đáp ứng trong thiết kế | Kết quả |
|---|---|---|
| Bằng chứng, nguồn gốc và độ không chắc chắn | Lưu nguồn, thời điểm truy xuất, trạng thái xác minh; tách kết quả OCR/AI khỏi dữ liệu người dùng xác nhận. | Đạt |
| Con người kiểm soát hành động hệ trọng | Bản nháp không tự gửi; sửa OCR trước xác nhận; không ghi đè CRM trong MVP. | Đạt |
| Quyền riêng tư và sử dụng có thẩm quyền | Tenant scope qua RLS; bucket riêng; bí mật chỉ phía máy chủ; chính sách lưu/xóa theo tổ chức. | Đạt |
| Hồ sơ tin cậy và tương thích | ID ổn định, schema có phiên bản, xuất CSV/vCard, kết quả đồng bộ có trạng thái. | Đạt |
| Quy trình giải thích được, cấu hình được | Tiêu chí, bằng chứng và phần thiếu hiển thị; nhãn và giai đoạn quan hệ cấu hình theo tổ chức. | Đạt |
| Ràng buộc dữ liệu/sản phẩm | Chỉ bật nguồn công khai sau khi xác định phạm vi và quyền sử dụng tại Việt Nam; MVP không tuyên bố bao phủ mọi nguồn. | Đạt |

Không có ngoại lệ cần ghi vào Complexity Tracking.

## Nghiên cứu và quyết định thiết kế

Các quyết định, căn cứ chính thức và phương án thay thế được ghi tại [research.md](./research.md). Những điểm trọng yếu:

- Dùng App Router và server components cho tải dữ liệu mặc định; client components chỉ cho tương tác cần trạng thái/streaming.
- Dùng Supabase SSR với session cookie và RLS làm ranh giới truy cập dữ liệu. `@supabase/ssr` được tài liệu Supabase đánh dấu beta tại thời điểm rà soát, nên khóa phiên bản và kiểm tra lại API khi bắt đầu triển khai.
- Dùng AI SDK qua lớp provider adapter. Giai đoạn đầu đánh giá model có khả năng nhận ảnh để trích xuất có cấu trúc; không coi schema hợp lệ là bằng chứng dữ liệu OCR chính xác.
- Dùng AI SDK Elements chọn lọc cho giao diện bản nháp/trạng thái AI; các luồng CRM và hồ sơ thông thường không cần ép thành chat UI.
- Không gọi API dữ liệu đăng ký hoặc gửi ảnh đến provider trước khi phê duyệt nguồn, điều khoản xử lý và chính sách dữ liệu cho thị trường Việt Nam.

## Giai đoạn 0 — Chuẩn bị và nghiên cứu

1. Khởi tạo ứng dụng Next.js 16, TypeScript, React 19, Tailwind CSS 4 và AI SDK Elements theo hướng dẫn hiện hành.
2. Tạo dự án Supabase theo môi trường; thiết lập migration có phiên bản, auth SSR, bucket private và bộ policy RLS tối thiểu.
3. Đánh giá OCR/model trên bộ danh thiếp mẫu đã được phép sử dụng; so sánh độ chính xác từng trường theo tiếng Việt/Anh/Hàn/Nhật/Trung, độ trễ, chi phí và điều kiện xử lý dữ liệu. Chỉ công bố ngôn ngữ đạt ngưỡng; chọn provider trước khi kết nối ảnh thật.
4. Chốt chính sách consent/lưu/xóa ảnh và ghi chú với tổ chức thí điểm; xác định export vCard/CSV và giới hạn lô.
5. Tạo bộ dữ liệu tổng hợp để phát triển giao diện và kiểm thử quyền truy cập mà không dùng PII thật.

## Giai đoạn 1 — Thiết kế dữ liệu và hợp đồng

1. Tạo các thực thể MVP: Organization, Membership, Event, Contact, Company, CardImport, MeetingNote, Evidence, FollowUp, ExportJob.
2. Thiết lập quan hệ sở hữu tổ chức và trạng thái: nhập → cần xem lại → đã xác nhận/từ chối; trùng tiềm năng là cờ để người dùng xử lý, không tự gộp.
3. Viết policy RLS cho từng thao tác theo tổ chức; kiểm tra Storage object path gắn với tổ chức và quyền người dùng.
4. Định nghĩa hợp đồng API cho sự kiện, nhập danh thiếp, kết quả nhận dạng/chuẩn hóa, xác nhận hồ sơ, ghi chú, bản nháp theo dõi, lời nhắc và export. Không tạo API tra cứu công khai sâu hoặc CRM ở MVP.
5. Tạo Quickstart để xác nhận luồng MVP bằng dữ liệu tổng hợp và hai tổ chức tách biệt.

## Giai đoạn 2 — Các lát cắt MVP

1. **Sự kiện và liên hệ**: tạo sự kiện, nhập thủ công, danh sách và tìm kiếm theo quyền.
2. **Chuyển danh thiếp thành dữ liệu chuẩn hóa**: tải ảnh vào bucket riêng, nhận dạng qua adapter đã duyệt, ánh xạ tên/chức danh/công ty/điện thoại/email/địa chỉ/ngôn ngữ vào schema phiên bản hóa, giữ giá trị gốc cùng bằng chứng trường, chuẩn hóa định dạng được hỗ trợ và cho sửa trước khi xác nhận. Đánh giá riêng bộ mẫu Việt/Anh/Hàn/Nhật/Trung; không tuyên bố hỗ trợ ngôn ngữ chưa kiểm chứng.
3. **Ghi bối cảnh**: lưu ghi chú, nhu cầu, nhãn, chủ sở hữu và hành động tiếp theo. Ghi âm/bản chép lời chỉ bật khi consent và chính sách lưu trữ đã được duyệt.
4. **Trùng lặp**: gợi ý bản ghi có khả năng trùng, hiển thị trường so sánh và để người dùng quyết định liên kết/gộp/tạo mới; lưu dấu vết quyết định.
5. **Theo dõi**: tạo bản nháp email từ ngữ cảnh đã được phép dùng; cho sửa, lưu bản nháp và yêu cầu xác nhận rõ ràng. MVP không tự gửi email.
6. **Xuất**: xuất vCard và CSV/bảng tính; báo số bản ghi thành công, bỏ qua, lỗi hoặc cần xử lý.
7. **Quyền và kiểm toán**: mọi truy vấn/xử lý AI gắn organization context; log sự kiện nhạy cảm không lưu token, nội dung bí mật hay ảnh thô.

## Giai đoạn 3 — Mở rộng sau MVP

- **Giai đoạn sản phẩm 2**: tra cứu nguồn công khai phù hợp tại Việt Nam và làm giàu hồ sơ đối tác chuẩn hóa (lĩnh vực, quy mô, sản phẩm, đăng ký khi nguồn hỗ trợ), lưu bằng chứng/provenance, thời điểm cập nhật và dữ liệu thiếu; đánh giá phù hợp/rủi ro có giải thích. Lịch và đồng bộ HubSpot/Salesforce chỉ sau phê duyệt ghi dữ liệu và mapping.
- **Giai đoạn sản phẩm 3**: đồ thị quan hệ, lời giới thiệu, tìm kiếm/so sánh nhà cung cấp, chuẩn bị đàm phán và hộp thư liên lạc theo API/quyền từng nền tảng.
- Mỗi tích hợp mới phải có adapter, kiểm tra quyền, giới hạn gọi, trạng thái lỗi/partial và nguồn dẫn chứng; không làm suy yếu phê duyệt của con người.

## Cấu trúc dự án

### Tài liệu tính năng

```text
specs/001-event-lead-platform/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mvp-api.md
└── tasks.md                 # Tạo ở bước speckit-tasks
```

### Mã nguồn dự kiến

```text
src/
├── app/                     # Next.js App Router, trang và route handlers
├── components/
│   ├── ai-elements/         # Thành phần AI SDK Elements được chọn dùng
│   └── ui/                  # Thành phần shadcn/ui
├── features/
│   ├── events/
│   ├── contacts/
│   ├── card-import/
│   ├── follow-ups/
│   └── exports/
├── lib/
│   ├── supabase/            # Client SSR/browser và kiểm tra session
│   ├── ai/                  # Provider adapter, schema, prompt có phiên bản
│   └── auth/                # Organization context và quyền
└── services/                # Quy tắc nghiệp vụ và tích hợp ngoài
supabase/
├── migrations/
├── seed.sql
└── tests/                   # Kiểm tra quyền/migration khi triển khai
tests/
├── unit/
├── integration/
└── e2e/
```

**Quyết định cấu trúc**: Một ứng dụng web Next.js duy nhất với module theo tính năng. Tách `services` và adapter theo ranh giới nghiệp vụ để thay OCR/LLM/CRM provider mà không tạo nhiều ứng dụng trước khi có nhu cầu.

## Theo dõi độ phức tạp

Không có vi phạm hiến chương hoặc dự án phụ cần biện minh.

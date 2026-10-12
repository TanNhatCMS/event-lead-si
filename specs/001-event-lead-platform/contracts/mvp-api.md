# Hợp đồng API MVP: EventLead SI

Hợp đồng ở mức hành vi; chưa khóa đường dẫn triển khai. Tất cả yêu cầu xác thực dùng session người dùng và tự suy ra tổ chức đang hoạt động từ membership đã xác minh. Client không được gửi `organization_id` để tự cấp quyền.

## Quy ước chung

- Nội dung JSON dùng UTF-8; thời gian ISO-8601 UTC.
- ID là định danh ổn định; không dùng email hoặc tên làm khóa.
- Lỗi có `code`, `message`, `request_id`; không chứa bí mật hoặc dữ liệu nhạy cảm.
- Các thao tác ghi nhận hỗ trợ khóa idempotency khi người dùng có thể gửi lại sau timeout.
- Mọi dữ liệu đầu vào được xác thực phía máy chủ; policy RLS tiếp tục áp dụng cho quyền dữ liệu.
- Lỗi truy cập không tiết lộ bản ghi thuộc tổ chức khác.

## Luồng và hợp đồng

### Sự kiện

- `POST /api/events`: tạo sự kiện với `name`, `location`, `starts_at`, `ends_at`.
- `GET /api/events`: liệt kê sự kiện người dùng được quyền truy cập, có phân trang.
- `GET /api/events/{event_id}`: trả thông tin sự kiện cùng tóm tắt số liên hệ.
- `PATCH /api/events/{event_id}`: cập nhật trường được phép; trả `409` nếu phiên bản bản ghi đã cũ.

### Nhập danh thiếp

1. `POST /api/card-imports` tạo bản ghi nhập và trả `import_id`, đường dẫn tải có thời hạn hoặc thông tin upload được giới hạn.
2. Ảnh được tải lên vùng lưu trữ private. Loại tệp, kích thước, số lượng ảnh/lô và quyền được kiểm tra.
3. `POST /api/card-imports/{import_id}/recognize` yêu cầu xử lý theo provider đã được duyệt; trả `202` cùng trạng thái.
4. `GET /api/card-imports/{import_id}` trả trạng thái, phiên bản schema, trường gốc và chuẩn hóa, ngôn ngữ, trạng thái xác minh/thiếu/chưa chắc chắn và ứng viên trùng; không trả secret hoặc đường dẫn công khai.
5. `POST /api/card-imports/{import_id}/confirm` nhận các giá trị chuẩn hóa đã người dùng xem/sửa, tùy chọn `event_id` và meeting context; chỉ tạo hồ sơ đã xác nhận sau kiểm tra quyền và trùng lặp. Trường được xác nhận phải giữ liên kết tới evidence nguồn/gốc.
6. `POST /api/card-imports/{import_id}/reject` đánh dấu từ chối, áp dụng retention/xóa ảnh theo chính sách.

### Liên hệ và ghi chú

- `GET /api/contacts`: lọc theo `query`, `event_id`, `label`, `owner`, `relationship_stage`; kết quả luôn giới hạn theo membership/RLS.
- `GET /api/contacts/{contact_id}`: trả giá trị hiện hành, trạng thái xác minh, evidence được phép hiển thị và meeting context.
- `PATCH /api/contacts/{contact_id}`: sửa các trường; lưu actor và evidence source là `user`.
- `POST /api/contacts/{contact_id}/notes`: thêm ghi chú, nhu cầu, cơ hội hoặc bước tiếp theo.
- `POST /api/contacts/{contact_id}/duplicate-resolution`: ghi quyết định người dùng về hai candidate; không tự gộp nếu chưa có quyết định.

### Bản nháp theo dõi

- `POST /api/contacts/{contact_id}/follow-ups/draft`: tạo bản nháp từ các note/evidence người dùng được quyền dùng; nhận `event_id`, `channel`, `locale` tùy chọn.
- `PATCH /api/follow-ups/{follow_up_id}`: sửa tiêu đề/nội dung/lời nhắc khi trạng thái là `draft`.
- `POST /api/follow-ups/{follow_up_id}/approve`: ghi người duyệt, thời điểm, và phiên bản nội dung đã duyệt. Không gửi email/tin nhắn trong MVP.
- `POST /api/follow-ups/{follow_up_id}/dismiss`: bỏ bản nháp mà không tác động đến liên hệ.

### Xuất dữ liệu

- `POST /api/exports` nhận `format` (`vcard` hoặc `csv`) và danh sách ID đã chọn; chỉ chấp nhận contact đã xác nhận.
- Trả `export_id`, trạng thái ban đầu và số bản ghi đã nhận.
- `GET /api/exports/{export_id}` trả trạng thái, số thành công/thất bại và lỗi theo bản ghi đã được phép hiển thị.
- `GET /api/exports/{export_id}/download` chỉ phát đường dẫn private có hạn khi export hoàn tất hoặc một phần.

## Trạng thái và lỗi

- Import: `uploaded → processing → needs_review → confirmed | rejected`; lỗi có thể kết thúc ở `failed` và cho phép retry có giới hạn.
- Follow-up: `draft → approved | dismissed`; `approved` không có nghĩa đã gửi.
- Export: `queued → processing → completed | partial | failed`; download URL hết hạn theo thời hạn cấu hình.
- `400`: dữ liệu đầu vào/định dạng không hợp lệ; `401`: chưa xác thực; `403` hoặc `404`: không đủ quyền/không tìm thấy; `409`: xung đột phiên bản hoặc duplicate cần xử lý; `413`: tệp vượt giới hạn; `429`: bị giới hạn tốc độ; `5xx`: lỗi dịch vụ có `request_id`.
- Timeout hoặc retry không được tạo contact/export trùng; client dùng idempotency key và kiểm tra trạng thái trước khi gửi lại.

## Hợp đồng an toàn

- Không có endpoint `send` trong MVP; mọi bản nháp AI chỉ được lưu và duyệt.
- Không trả nguyên ảnh hoặc note cho client nếu user không có quyền xem.
- Mọi endpoint sở hữu `event_id`, `contact_id`, `import_id`, hoặc `follow_up_id` phải xác minh cùng organization.
- AI output là dữ liệu chưa xác minh cho đến khi người dùng xác nhận; metadata model/provider không được xem là bằng chứng nguồn.

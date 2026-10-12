# Mô hình dữ liệu: Hồ sơ đối tác chuẩn hóa EventLead SI

## Nguyên tắc

- Mọi dữ liệu nghiệp vụ thuộc một `organization_id`; không dùng ID ngẫu nhiên thay cho policy truy cập.
- Mọi thuộc tính lấy từ thẻ, người dùng, nguồn công khai hoặc AI phải có nguồn và trạng thái xác minh phù hợp.
- Tách kết quả OCR ban đầu khỏi hồ sơ người dùng đã xác nhận để sửa dữ liệu mà vẫn giữ dấu vết.
- Hồ sơ đối tác là góc nhìn tổng hợp từ Contact, Company và bằng chứng theo trường; không biến kết quả OCR hay suy luận AI thành dữ kiện đã xác minh.
- Schema chuẩn hóa phải có phiên bản và ánh xạ trường rõ ràng để xuất/tái sử dụng; giữ nguyên giá trị gốc khi chuẩn hóa có thể làm mất thông tin.
- Lưu thời điểm UTC; hiển thị theo múi giờ tổ chức/người dùng.
- Dữ liệu ảnh và ghi chú cuộc gặp là riêng tư. Chính sách lưu/xóa do tổ chức cấu hình.

## Thực thể MVP

### Organization

- `id`: định danh ổn định.
- `name`: tên tổ chức.
- `default_locale`, `timezone`: cấu hình trải nghiệm.
- `retention_policy`: tham chiếu/cấu hình thời gian lưu dữ liệu được tổ chức chọn.
- `created_at`, `updated_at`.

### Membership

- `id`, `organization_id`, `user_id`.
- `role`: `owner`, `admin`, `member`.
- `status`: `invited`, `active`, `suspended`.
- Ràng buộc duy nhất: một `user_id` chỉ có một membership đang hoạt động cho mỗi tổ chức.

### Event

- `id`, `organization_id`, `name`, `location`, `starts_at`, `ends_at`.
- `owner_user_id`, `created_at`, `updated_at`, `archived_at`.
- Một sự kiện có nhiều liên hệ; liên hệ có thể xuất hiện ở nhiều sự kiện.

### Company

- `id`, `organization_id`, `legal_name`, `display_name`, `country_code`, `website`.
- `industry`, `market_summary`, `employee_size_range`, `founded_year`, `products_summary`, `tax_or_registration_id` (nullable, chỉ điền khi có căn cứ), `created_at`, `updated_at`.
- Trạng thái hồ sơ: `user_provided`, `partially_verified`, `verified`, `needs_review`.
- Mã số thuế/đăng ký và chi tiết ngành có thể chưa có trong MVP; thêm qua nguồn có provenance ở giai đoạn enrichment.

### Contact

- `id`, `organization_id`, `company_id` nullable.
- `full_name`, `job_title`, `email`, `phone`, `address`, `preferred_language`.
- `owner_user_id`, `relationship_stage`, `labels`, `created_at`, `updated_at`, `archived_at`.
- Các trường liên lạc giữ trạng thái xác nhận theo trường; giá trị chưa xác nhận không được dùng làm dữ liệu đồng bộ.
- Danh tính trùng không tự gộp; match candidate là quyết định cần người dùng.

### EventContact

- `organization_id`, `event_id`, `contact_id`, `met_at`, `context_summary`, `needs`, `opportunity`, `next_step`.
- Ràng buộc duy nhất `event_id + contact_id` nếu cùng một cuộc gặp; cho phép nhiều tương tác khi có `met_at` khác nhau nếu sản phẩm cần lịch sử.

### CardImport

- `id`, `organization_id`, `submitted_by`, `storage_path`, `media_type`, `file_size`, `batch_id`, `schema_version`.
- `state`: `uploaded`, `processing`, `needs_review`, `confirmed`, `rejected`, `failed`.
- `recognition_provider`, `recognition_model`, `processing_started_at`, `processed_at`, `error_code`.
- `raw_result` được giới hạn quyền đọc và retention; không ghi nội dung ảnh/OCR nhạy cảm vào log.
- Một import có thể tạo tối đa một contact xác nhận; bản ghi trùng tiềm năng liên kết tới candidate ID, không tự thay đổi hồ sơ gốc.

### ContactFieldEvidence

- `id`, `organization_id`, `contact_id`, `field_name`, `raw_value`, `normalized_value` (giá trị chuẩn dùng trong hồ sơ, có thể rỗng nếu không chuẩn hóa được), `value_snapshot` (giá trị được duyệt hiện hành).
- `source_type`: `card_ocr`, `user`, `public_source`, `ai_inference`, `integration`.
- `source_reference`, `retrieved_at`, `verification_state`: `unreviewed`, `user_confirmed`, `source_verified`, `inferred`, `uncertain`, `unavailable`.
- `reviewed_by`, `reviewed_at`.
- Lưu phiên bản evidence khi trường thay đổi; hồ sơ Contact giữ giá trị hiện hành.
- Với trường chuẩn hóa, cần lưu giá trị gốc, giá trị chuẩn hóa và phiên bản schema/quy tắc chuẩn hóa; giá trị chưa thể chuẩn hóa phải giữ trạng thái thiếu/chưa chắc chắn thay vì tự điền.

### MeetingNote

- `id`, `organization_id`, `event_id`, `contact_id`, `author_user_id`, `body`.
- `note_type`: `meeting_note`, `need`, `opportunity`, `next_step`.
- `created_at`, `updated_at`, `deleted_at`.
- Tệp ghi âm/bản chép lời là tùy chọn theo consent và policy; không bật mặc định trong MVP.

### FollowUp

- `id`, `organization_id`, `contact_id`, `event_id` nullable, `owner_user_id`.
- `channel`, `subject`, `body`, `source_context_ids`, `state`: `draft`, `approved`, `dismissed`, `manually_sent`, `expired`.
- `approved_by`, `approved_at`, `remind_at`, `created_at`, `updated_at`.
- `approved` chỉ ghi nhận duyệt nội dung; MVP không gửi thư tự động.

### ExportJob

- `id`, `organization_id`, `requested_by`, `format`: `vcard`, `csv`.
- `state`: `queued`, `processing`, `completed`, `partial`, `failed`, `expired`.
- `selected_count`, `success_count`, `failed_count`, `result_path`, `expires_at`, `created_at`.
- Export chỉ gồm hồ sơ đã được xác nhận và người yêu cầu được quyền xem.

## Thực thể giai đoạn sau

- `EvidenceSource`/`CompanyEvidence`: dữ liệu nguồn công khai cho hồ sơ đối tác, trạng thái xác minh, thời điểm cập nhật và điều khoản lưu/cache. Đây là phần hoàn thiện mục tiêu hồ sơ chuẩn hóa sau MVP.
- `Assessment`: tiêu chí phù hợp/rủi ro, kết quả, bằng chứng và khoảng trống.
- `SourcingRequest`, `SupplierCandidate`, `SupplierAssessment`, `ShortlistEntry`.
- `RelationshipEdge` và `IntroductionSuggestion`; mọi cạnh cần nguồn/bằng chứng và kiểm soát hiển thị.
- `IntegrationConnection`, `SyncJob`, `ExternalRecordMapping` cho CRM/lịch.

## RLS và tính toàn vẹn

- Policy `SELECT/INSERT/UPDATE/DELETE` kiểm tra membership đang hoạt động và `organization_id` của bản ghi.
- Policy `UPDATE` có cả điều kiện dòng cũ và `WITH CHECK` cho dòng mới để ngăn chuyển bản ghi sang tổ chức khác.
- Storage policy xác nhận path/object thuộc tổ chức và người dùng có vai trò cần thiết.
- Service-role chỉ dùng trong tác vụ máy chủ biệt quyền; mọi thao tác phải xác thực tổ chức và mục đích trước khi truy vấn.
- Dùng khóa ngoại ghép có `organization_id` khi cần để ngăn liên kết chéo tenant ngay cả khi policy ứng dụng có lỗi.
- Audit log ghi actor, hành động, bản ghi và thời điểm; hạn chế hoặc loại nội dung PII/ảnh/ghi chú khỏi log.

# Quickstart kiểm chứng luồng danh thiếp thành hồ sơ chuẩn hóa EventLead SI

Tài liệu này mô tả kịch bản xác minh sau khi giai đoạn triển khai tạo ứng dụng. Không đưa credential thật vào repository hoặc log. Dùng dữ liệu danh thiếp tổng hợp/được phép sử dụng.

## Điều kiện trước

- Node.js 22+, pnpm và Git đã cài.
- Có dự án Supabase development riêng, Auth bật và bucket danh thiếp private.
- File môi trường cục bộ chứa URL Supabase, publishable key và khóa AI provider đã được duyệt; không commit file môi trường.
- Migrations đã áp dụng; có hai tổ chức thử nghiệm A và B, mỗi tổ chức có user riêng.

## Khởi động ứng dụng

1. Cài dependency theo lockfile bằng `pnpm install`.
2. Khởi tạo biến cục bộ từ mẫu `.env.example`; không dùng service-role key trong biến `NEXT_PUBLIC_*`.
3. Áp dụng database migrations và seed chỉ chứa dữ liệu tổng hợp.
4. Chạy ứng dụng bằng `pnpm dev`.
5. Khi các scripts được tạo, chạy `pnpm lint`, `pnpm typecheck`, `pnpm test` và `pnpm exec playwright test` theo hướng dẫn trong package scripts.

## Kịch bản xác minh đầu-cuối

### A. Chuyển danh thiếp thành hồ sơ liên hệ chuẩn hóa

1. Đăng nhập user tổ chức A và tạo một sự kiện thử nghiệm.
2. Nhập một ảnh danh thiếp được phép dùng; theo dõi trạng thái import.
3. Xác nhận người dùng thấy trường trích xuất, trường thiếu/chưa chắc chắn và candidate trùng (nếu có).
4. Kiểm tra tên, chức danh, công ty, email, điện thoại, địa chỉ và ngôn ngữ; sửa giá trị sai, giữ lại trạng thái/nguồn nhận dạng và xác nhận contact.
5. Kiểm tra hồ sơ hiển thị dữ liệu có cấu trúc, gắn với sự kiện; tải lại trang và xác nhận dữ liệu đã duyệt cùng ghi chú còn nguyên.

**Kết quả mong đợi**: Contact chỉ có trạng thái đã xác nhận sau hành động của người dùng; ảnh không truy cập công khai.

Với bộ pilot đa ngôn ngữ, ghi nhận riêng kết quả tiếng Việt, Anh, Hàn, Nhật và Trung. Chỉ đánh dấu một ngôn ngữ được hỗ trợ khi có kết quả đánh giá; trường không chắc chắn phải cho phép sửa hoặc từ chối.

### B. Kiểm tra cô lập tổ chức

1. Trong user A, tạo event, contact, note và import.
2. Đăng xuất, đăng nhập user B thuộc tổ chức B.
3. Thử truy cập các ID ở trên qua UI và các request được hỗ trợ.
4. Kiểm tra list, detail, sửa, download Storage object và export.

**Kết quả mong đợi**: User B không thể xem hoặc sửa dữ liệu tổ chức A; phản hồi không tiết lộ nội dung bản ghi.

### C. Bản nháp theo dõi có người duyệt

1. Tạo bản nháp từ ghi chú sự kiện đã được phép dùng.
2. Sửa một câu, lưu, mở lại và kiểm tra nội dung.
3. Xem bản nháp chưa duyệt; xác nhận không có email/tin nhắn outbound.
4. Duyệt bản nháp và xác nhận hệ thống chỉ ghi nhận người duyệt/thời điểm/nội dung, không tự gửi.

**Kết quả mong đợi**: Không có hành động ngoài hệ thống trước phê duyệt; MVP không có thao tác send.

### D. Export vCard/CSV

1. Chọn các contact đã xác nhận và yêu cầu export từng định dạng.
2. Tải kết quả khi trạng thái hoàn tất; đối chiếu trường với contact đã chọn.
3. Thử export ID không tồn tại hoặc thuộc tổ chức khác.
4. Mô phỏng export một phần và kiểm tra trạng thái/count/lỗi.

**Kết quả mong đợi**: Chỉ export contact người dùng được quyền xem; có trạng thái đầy đủ; file chỉ tải được qua quyền/URL có hạn.

### E. Nhập lỗi và retry

1. Nhập ảnh sai định dạng hoặc vượt giới hạn cấu hình.
2. Ngắt kết nối xử lý giữa import và kết quả, sau đó tải lại trạng thái.
3. Gửi lại yêu cầu confirm với cùng idempotency key.

**Kết quả mong đợi**: Có thông báo lỗi hữu ích, không tạo contact trùng, có thể tiếp tục hoặc từ chối import theo trạng thái.

## Rà soát trước khi chuyển môi trường

- Xác nhận RLS cho mọi bảng lộ qua Data API và Storage policy cho bucket private.
- Xác nhận log không chứa ảnh, token, email, số điện thoại hoặc nội dung note ngoài mức được phê duyệt.
- Xác nhận OCR/LLM provider, khu vực xử lý, retention, quyền dùng dữ liệu và bộ đánh giá đã được duyệt.
- Xác nhận chính sách lưu/xóa và quyền xử lý bản ghi âm (nếu tính năng đó được bật).
- Xác nhận export không vượt organization scope và không ghi đè hệ thống đích trong MVP.

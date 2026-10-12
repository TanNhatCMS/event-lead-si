# Thiết lập môi trường phát triển

## Tạo Supabase dev project

1. Đăng nhập Supabase bằng tài khoản/organization của nhóm và tạo project riêng cho development tại khu vực được tổ chức chấp thuận.
2. Ghi tên project, khu vực, project reference, owner và ngày tạo vào sổ quản lý môi trường của nhóm. Không ghi database password, access token hoặc service-role key vào repository.
3. Bật Email Auth cho môi trường dev, tạo người dùng thử nghiệm tổng hợp và gán họ vào hai organization riêng để kiểm tra phân quyền.
4. Cài Supabase CLI, đăng nhập, liên kết project dev và chạy migrations theo thứ tự. Xác nhận bucket ảnh là private.
5. Lấy Project URL và anon/publishable key từ Dashboard; thêm vào `.env.local`. Không đưa service-role/secret key vào client.

**Trạng thái**: Chưa tạo project dev trong tài khoản Supabase của người dùng. Project reference, khu vực và owner sẽ được ghi sau khi project thật được tạo; không dùng giá trị giả.

## Ứng dụng cục bộ

Yêu cầu Node.js 22 trở lên và pnpm. Tạo `.env.local` từ `.env.example`, điền biến Supabase; để `CARD_RECOGNITION_ENABLED=false` cho tới khi provider OCR/vision, vùng xử lý, retention, quyền dùng ảnh và bộ dữ liệu pilot được duyệt. Không commit file `.env.local`.

Sau khi khởi tạo package scripts và database:

```powershell
pnpm install
pnpm dev
```

## Dữ liệu thử nghiệm và quyền

- Chỉ dùng danh thiếp tổng hợp hoặc bộ mẫu có giấy phép/consent phù hợp.
- Tạo hai organization và hai nhóm user thử nghiệm. Không cấp membership chéo.
- Xác nhận bảng và Storage policies trước khi dùng dữ liệu cá nhân thật.
- Không bật OCR hoặc gửi ảnh tới nhà cung cấp ngoài cho tới khi hoàn thành phê duyệt provider.

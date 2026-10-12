# EventLead SI

EventLead SI chuyển danh thiếp thu thập tại hội thảo, triển lãm và sự kiện kết nối thành hồ sơ đối tác chuẩn hóa, có nguồn gốc dữ liệu và có thể tái sử dụng.

## Phạm vi bản đầu

- Nhập danh thiếp theo lô và rà soát dữ liệu được nhận dạng.
- Chuẩn hóa thông tin liên hệ/doanh nghiệp; giữ giá trị gốc, nguồn và trạng thái chưa chắc chắn.
- Gắn hồ sơ với sự kiện và bối cảnh cuộc gặp.
- Tạo bản nháp theo dõi để người dùng sửa và duyệt; không tự gửi.
- Xuất dữ liệu liên hệ đã xác nhận.

Tra cứu công khai sâu và làm giàu hồ sơ thuộc giai đoạn kế tiếp. Phạm vi MVP đã được ghi trong [đặc tả](specs/001-event-lead-platform/spec.md).

## Công nghệ

- Next.js 16 App Router, React 19, TypeScript và Tailwind CSS 4.
- Supabase PostgreSQL, Auth và Storage với Row Level Security.
- Vercel AI SDK và AI SDK Elements sau các adapter ở cấp ứng dụng.

## Bắt đầu

Xem [hướng dẫn thiết lập](docs/setup.md). Không commit `.env.local`, credential hoặc dữ liệu liên hệ thật. OCR chỉ được bật sau khi duyệt provider, quyền xử lý ảnh và bộ đánh giá phù hợp.

## Tài liệu dự án

- [Đặc tả](specs/001-event-lead-platform/spec.md)
- [Kế hoạch](specs/001-event-lead-platform/plan.md)
- [Danh sách công việc](specs/001-event-lead-platform/tasks.md)

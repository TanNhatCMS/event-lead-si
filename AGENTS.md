# Hướng dẫn làm việc trong repository

## Cấu trúc dự án

Repository hiện chứa bộ khung lập kế hoạch cho **EventLead SI**, với mục tiêu chính là chuyển danh thiếp thành hồ sơ đối tác chuẩn hóa, có thể tái sử dụng. Luồng sản phẩm gồm nhận dạng danh thiếp đa ngôn ngữ, chuẩn hóa trường, người dùng rà soát, lưu bối cảnh cuộc gặp và (ở giai đoạn sau) tra cứu nguồn công khai có bằng chứng. MVP ưu tiên thu thập, dữ liệu liên hệ chuẩn hóa và theo dõi có người duyệt; CRM, sourcing và trí tuệ quan hệ thuộc giai đoạn sau.

Tính năng hiện hành nằm tại `specs/001-event-lead-platform/`: `spec.md` mô tả yêu cầu, `plan.md` ghi thiết kế triển khai, `checklists/requirements.md` là danh sách rà soát. Các tài liệu liên quan như `research.md`, `data-model.md`, `quickstart.md`, `contracts/` và `tasks.md` cũng nằm trong thư mục này. `.specify/` chứa mẫu, quy trình và script Spec Kit; `.agents/skills/` chứa hướng dẫn workflow của repository. Giữ tài liệu tính năng cùng một chỗ, không đặt mã nguồn hoặc kiểm thử sản phẩm trong thư mục công cụ.

## Lệnh build, kiểm thử và phát triển

Ứng dụng dùng pnpm. Chạy `pnpm dev`, `pnpm build`, `pnpm lint`; chưa tạo bộ kiểm thử tự động. Hiến chương quy định stack mặc định là Next.js 16 App Router, Supabase, Vercel AI SDK và AI SDK Elements. Các script lập kế hoạch có bản Python và PowerShell; ví dụ:

- `python .specify/scripts/python/check_prerequisites.py --help` — xem điều kiện và tùy chọn workflow tính năng.
- `python .specify/scripts/python/setup_plan.py --help` — xem tùy chọn khởi tạo kế hoạch.
- `python .specify/scripts/python/setup_tasks.py --help` — xem tùy chọn khởi tạo danh sách task.

Dùng `pwsh .specify/scripts/powershell/<script>.ps1` cho bản PowerShell. Xem trợ giúp từng script trước khi chạy vì workflow có thể tạo hoặc cập nhật tài liệu.

## Quy ước tài liệu

Viết tài liệu Markdown bằng tiếng Việt, tiêu đề mô tả rõ và câu ngắn có thể thực hiện. Dùng đường dẫn tương đối từ repository. Thư mục tính năng có số thứ tự ba chữ số và tên kebab-case, ví dụ `001-event-lead-platform`. Luôn phân biệt mục tiêu tổng thể (hồ sơ đối tác chuẩn hóa từ danh thiếp) với phạm vi MVP đã chốt (thu thập/chuẩn hóa/duyệt, bối cảnh gặp và theo dõi có người duyệt); tra cứu công khai sâu, CRM, trí tuệ quan hệ và sourcing triển khai theo giai đoạn. Mọi tài liệu phải nhất quán với `.specify/memory/constitution.md`. Phân biệt dữ kiện đã xác minh, dữ liệu do người dùng cung cấp và suy luận/chưa chắc chắn; ghi nguồn và thời điểm truy xuất khi có. Yêu cầu người dùng duyệt rõ ràng trước nội dung gửi ra ngoài, cam kết thương mại, quyết định rủi ro và ghi đè CRM.

## Quy ước kiểm tra

Hiện chưa có framework kiểm thử hoặc ngưỡng độ bao phủ. Với thay đổi tài liệu, kiểm tra liên kết/đường dẫn, sự nhất quán giữa spec, plan, tasks và checklist, và tính chính xác của ví dụ script. Khi bổ sung mã ứng dụng, ghi lệnh kiểm thử cùng quy ước đặt tên sau khi framework được chọn.

## Commit và pull request

Lịch sử ban đầu chưa xác định quy ước commit của nhóm. Dùng subject ngắn, dạng mệnh lệnh, ví dụ `docs: clarify card normalization flow`, cho đến khi maintainer quy định khác. Pull request cần tóm tắt thay đổi, liệt kê tài liệu tính năng bị ảnh hưởng, liên kết công việc liên quan nếu có và ghi rõ bước xác minh đã thực hiện. Chỉ đính kèm ảnh khi thay đổi có giao diện.

## Bảo mật và cấu hình

Không commit bí mật, credential đặc quyền hoặc dữ liệu liên hệ/sự kiện thật. Tôn trọng điều khoản nguồn và quyền truy cập được cấp khi tra cứu doanh nghiệp hoặc tích hợp kênh liên lạc. Version hóa và rà soát thay đổi database; thực thi ranh giới truy cập theo tổ chức và chỉ giữ credential Supabase đặc quyền phía máy chủ. Coi OCR, làm giàu dữ liệu, rủi ro, sourcing, giá và đàm phán là hỗ trợ cần người xem xét, có bằng chứng và độ không chắc chắn hiển thị; không trình bày chúng như kết luận đã xác minh.

# Nghiên cứu và quyết định kỹ thuật: Chuyển hóa danh thiếp EventLead SI

**Ngày rà soát**: 2026-10-12

## Mục tiêu sản phẩm và ranh giới giai đoạn

Sản phẩm hướng tới chuyển danh thiếp thành hồ sơ đối tác chuẩn hóa, có thể tái sử dụng, bằng cách nhận dạng đa ngôn ngữ, chuẩn hóa trường, rà soát bởi người dùng và bổ sung thông tin có bằng chứng từ nguồn công khai phù hợp. Theo quyết định MVP, luồng đầu tiên hoàn thành nhập/chuẩn hóa/duyệt danh thiếp, bối cảnh gặp và theo dõi có người duyệt; tra cứu nguồn công khai sâu được triển khai ở giai đoạn kế tiếp. Vì vậy, MVP phải lưu schema/provenance có khả năng mở rộng nhưng không được mô tả như đã cung cấp hồ sơ 360 độ hoặc bao phủ dữ liệu công khai.

## 1. Giao diện và runtime

**Quyết định**: Next.js 16 App Router, React 19, TypeScript, Node.js 22+; dùng server components mặc định và client components ở nơi cần tương tác.

**Lý do**: Stack đã được người dùng chọn. Hướng dẫn chính thức của Next.js 16 chuyển quy ước `middleware` sang `proxy`; `proxy` chạy trên Node.js và không hỗ trợ runtime Edge. AI SDK Elements yêu cầu React 19, khuyến nghị Tailwind CSS 4 và có Next.js App Router trong hướng dẫn thiết lập.

**Phương án cân nhắc**: Dùng React SPA riêng hoặc nhiều ứng dụng frontend/backend. Không chọn vì MVP là một web app và Next.js App Router đã là lựa chọn nền tảng.

**Hệ quả**: Không đặt logic nghiệp vụ hoặc bí mật trong `proxy`; kiểm tra phiên và quyền trong server action/route handler/service được bảo vệ. Chỉ dùng streaming cho bản nháp AI nếu cải thiện trải nghiệm; thao tác ghi dữ liệu vẫn cần trạng thái xác nhận rõ.

## 2. Cơ sở dữ liệu, xác thực và tệp

**Quyết định**: Supabase PostgreSQL, Auth, Storage; SSR session dùng cookie theo tài liệu Supabase Next.js; RLS là lớp bắt buộc cho bảng và tệp truy cập theo tổ chức.

**Lý do**: Hợp với stack được duyệt và mô hình nhóm dùng chung. Tài liệu Supabase cho biết SSR dùng session cookie, còn private bucket áp dụng RLS cho tải lên/tải xuống.

**Phương án cân nhắc**: API server riêng kết nối PostgreSQL và lưu object ngoài Supabase. Không chọn cho MVP vì tăng số dịch vụ cần vận hành.

**Hệ quả**: Mọi bảng có thể truy cập qua Data API phải bật RLS và có policy theo tổ chức; kiểm tra quyền ở từng thao tác. Không đưa service-role/secret key vào biến môi trường công khai. Tài liệu Supabase hiện đánh dấu `@supabase/ssr` beta; khóa phiên bản, cô lập wrapper và rà soát lại thay đổi trước khi nâng cấp.

## 3. Xử lý AI và OCR

**Quyết định**: Vercel AI SDK là lớp thống nhất cho model provider, streaming và dữ liệu có cấu trúc. Kết quả OCR/suy luận được kiểm tra schema, lưu trạng thái chưa xác nhận và luôn trình bày cho người dùng duyệt.

**Lý do**: Tài liệu AI SDK hỗ trợ nội dung ảnh trong prompt cho model có khả năng vision và hỗ trợ structured output kèm schema. Điều đó phù hợp để thử trích xuất danh thiếp; schema hợp lệ chỉ đảm bảo cấu trúc, không chứng minh trường nhận dạng đúng.

**Phương án cân nhắc**: Khóa vào một model/provider ngay từ đầu hoặc tự xây tool-calling/streaming riêng. Không chọn; lớp provider adapter giữ khả năng thay thế và giới hạn phụ thuộc.

**Quyết định chưa đóng**: Chưa chọn dịch vụ OCR/model cụ thể. Trước khi gửi ảnh thật ra ngoài, nhóm phải đánh giá riêng độ chính xác tiếng Việt/Anh/Hàn/Nhật/Trung, chi phí/độ trễ, nơi xử lý/lưu trữ, điều khoản dùng dữ liệu và cơ chế không lưu dữ liệu. Có thể benchmark OCR chuyên dụng và vision model bằng cùng bộ dữ liệu đã được phép sử dụng; chỉ công bố hỗ trợ cho ngôn ngữ đạt ngưỡng đã thống nhất.

**Hệ quả**: Giao diện dùng `CardRecognitionProvider` cùng schema chuẩn; adapter trả các giá trị, trạng thái trường, lỗi và model/provider metadata cần thiết. Không dùng confidence do model tự khai làm độ tin cậy đã hiệu chuẩn; đánh dấu trường chưa chắc chắn dựa trên kiểm tra và cho người dùng sửa.

## 4. Thành phần giao diện AI

**Quyết định**: Dùng AI SDK Elements có chọn lọc cho bản nháp/hỗ trợ AI; dùng shadcn/ui và Tailwind CSS 4 làm nền thành phần giao diện.

**Lý do**: AI Elements là thư viện component và registry xây trên shadcn/ui, có tích hợp trạng thái/streaming AI SDK. Hướng dẫn setup hiện yêu cầu React 19 và Tailwind CSS 4.

**Phương án cân nhắc**: Xây toàn bộ component chat tùy chỉnh hoặc dùng AI Elements cho mọi trang. Chọn giữa: dùng component có liên quan (message, prompt input, sources) cho luồng AI, không ép giao diện CRM thành chat.

**Hệ quả**: Mã component được thêm vào codebase và cần rà soát accessibility, thiết kế EventLead SI, trạng thái lỗi/loading và cách hiển thị nguồn. Không coi component thư viện là ranh giới nghiệp vụ.

## 5. Tích hợp dữ liệu nguồn công khai Việt Nam

**Quyết định**: Giai đoạn 2 dùng adapter nguồn dữ liệu; trước khi tích hợp phải chốt nguồn được phép truy cập, phạm vi trường, thời điểm cập nhật, quyền lưu/cache và bằng chứng nguồn.

**Lý do**: Đặc tả yêu cầu Việt Nam là thị trường đầu tiên nhưng không chỉ định nhà cung cấp hay nguồn đăng ký được phép. Mức độ bao phủ, điều khoản và chất lượng dữ liệu có thể khác nhau.

**Phương án cân nhắc**: Scrape website hoặc lấy một nguồn duy nhất làm đúng cho mọi loại dữ liệu. Không chọn vì độ tin cậy, quyền truy cập và thay đổi nguồn không đảm bảo.

**Hệ quả**: Không để tích hợp nguồn công khai chặn MVP Giai đoạn 1. Mọi kết quả phải ghi provenance; không có nguồn xác minh thì hiển thị thiếu dữ liệu, không suy diễn.

## 6. Kiểm thử và triển khai

**Quyết định**: Đề xuất Vitest cho logic thuần/unit/contract và Playwright cho luồng trình duyệt. Pipeline xác minh phải bao gồm test quyền tenant/RLS và luồng nhập/export, không chỉ snapshot giao diện.

**Lý do**: Các rủi ro chính là rò dữ liệu chéo tổ chức, trùng lặp, sai OCR, bản nháp không duyệt và export một phần; cần kiểm tra từ module đến luồng người dùng.

**Phương án cân nhắc**: Chỉ kiểm tra thủ công hoặc chỉ unit test. Không đủ để xác nhận boundary RLS và tương tác trình duyệt.

**Hệ quả**: Môi trường preview phải dùng dữ liệu tổng hợp; không đưa ảnh danh thiếp thật vào log/fixture. Chọn môi trường hosting sau khi có yêu cầu khu vực dữ liệu, vận hành và chi phí.

## Nguồn chính thức

- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js Proxy convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side)
- [Supabase Next.js Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [AI SDK image prompts](https://ai-sdk.dev/docs/foundations/prompts)
- [AI SDK structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [AI SDK Elements setup](https://elements.ai-sdk.dev/docs/setup)
- [AI SDK skill](https://github.com/vercel/ai/tree/main/skills/use-ai-sdk)
- [Supabase agent skill](https://github.com/supabase/agent-skills/tree/main/skills/supabase)
- [Vercel React Best Practices skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)

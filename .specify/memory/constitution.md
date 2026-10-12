<!--
Báo cáo ảnh hưởng khi đồng bộ
Thay đổi phiên bản: 1.2.0 → 1.2.2 (1.2.1 dịch hiến chương; 1.2.2 bổ sung mục tiêu hồ sơ chuẩn hóa, không đổi nguyên tắc)
Nguyên tắc thay đổi: không có
Mục thêm: không có
Mục mở rộng: không có
Mục đổi tên: không có
Mục xóa: không có
TODO còn lại: Xác nhận ngày phê chuẩn ban đầu.
-->
# Hiến chương EventLead SI

Mục tiêu sản phẩm là chuyển danh thiếp thành dữ liệu đối tác chuẩn hóa, có nguồn gốc và sẵn sàng tái sử dụng. Các nguyên tắc dưới đây áp dụng cho OCR, chuẩn hóa, tra cứu công khai, tổng hợp hồ sơ, theo dõi và các tích hợp theo từng giai đoạn.

## Nguyên tắc cốt lõi

### I. Bằng chứng, nguồn gốc và độ không chắc chắn
Mọi khẳng định về doanh nghiệp, liên hệ, rủi ro, quan hệ hoặc nhà cung cấp lấy từ bên ngoài hay do AI suy luận PHẢI được phân biệt với dữ liệu do người dùng cung cấp và dữ liệu đã xác minh. Khi có thể, sản phẩm PHẢI lưu nguồn cùng thời điểm truy xuất hoặc xác minh, đồng thời PHẢI thể hiện độ không chắc chắn và dữ liệu còn thiếu. Điểm số hoặc đề xuất PHẢI nêu căn cứ chính; KHÔNG ĐƯỢC trình bày suy luận như dữ kiện đã xác minh. Điều này giúp người dùng rà soát và sửa quyết định kinh doanh.

### II. Con người kiểm soát hành động có hệ quả
Người dùng PHẢI có thể kiểm tra và sửa dữ liệu liên hệ được trích xuất trước khi đồng bộ. Con người PHẢI duyệt tin nhắn bên ngoài, cam kết thương mại, quyết định rủi ro hoặc tín dụng, và thao tác ghi đè CRM trước khi chúng có hiệu lực. Đề xuất của AI chỉ hỗ trợ quyết định; KHÔNG ĐƯỢC trình bày như tư vấn pháp lý, thuế, tài chính hoặc bảo đảm chất lượng. Nguyên tắc này bảo vệ ý định của người dùng và duy trì trách nhiệm giải trình.

### III. Quyền riêng tư và sử dụng được phép
Sản phẩm CHỈ ĐƯỢC thu thập, truy cập, lưu giữ và chia sẻ dữ liệu cá nhân/doanh nghiệp cho mục đích sản phẩm đã xác định, với quyền truy cập và căn cứ xử lý cần thiết cho môi trường triển khai. Quyền truy cập PHẢI giới hạn theo vai trò và phạm vi tổ chức; lưu giữ và xóa dữ liệu PHẢI theo chính sách tổ chức đã cấu hình. Tích hợp và tra cứu nguồn công khai PHẢI tuân thủ điều kiện truy cập nguồn, điều khoản nền tảng và quyền đã cấp. Ghi chú và bản ghi cuộc gặp nhạy cảm PHẢI được bảo vệ như hồ sơ liên hệ tương ứng.

### IV. Hồ sơ đáng tin cậy và tương thích
Dữ liệu liên hệ, doanh nghiệp, sự kiện và quan hệ PHẢI dùng trường được định nghĩa, tài liệu hóa và biểu diễn ổn định để xuất/tích hợp. Khi nhập dữ liệu, hệ thống PHẢI giữ bằng chứng gốc khi khả thi, nhận diện trường thiếu hoặc chưa chắc chắn, chuẩn hóa định dạng được hỗ trợ và phát hiện bản ghi có khả năng trùng trước khi tạo hoặc đồng bộ. Tích hợp PHẢI báo lỗi và tránh mất dữ liệu âm thầm hoặc ghi đè ngoài ý muốn. Nguyên tắc này hỗ trợ nhóm dùng dữ liệu tin cậy giữa vCard, bảng tính và CRM.

### V. Quy trình giải thích được và có thể cấu hình
Đề xuất về mức độ phù hợp, rủi ro, nhà cung cấp và quan hệ PHẢI truy được về tiêu chí người dùng cùng bằng chứng hiện có; các khoảng trống quan trọng PHẢI được nêu rõ. Nhóm PHẢI cấu hình được trường dữ liệu, nhãn, tiêu chí đánh giá và giai đoạn theo dõi mà không làm thay đổi ý nghĩa dữ liệu đã xác minh. Sản phẩm PHẢI phân biệt bước tiếp theo được gợi ý với hành động đã hoàn thành. Nguyên tắc này giúp đề xuất phù hợp nhiều nhóm và thị trường mà không che khuất giới hạn.

## Ràng buộc sản phẩm và dữ liệu

Sản phẩm PHẢI coi dữ liệu đăng ký doanh nghiệp, thuế, hồ sơ mạng xã hội, dịch vụ nhắn tin và năng lực CRM là phụ thuộc thị trường cũng như quyền truy cập. Sản phẩm PHẢI nêu nguồn và phạm vi kiểm tra được hỗ trợ, đồng thời KHÔNG ĐƯỢC hàm ý rằng độ bao phủ là toàn diện. Nếu không có tích hợp trực tiếp hoặc không được phép tích hợp, sản phẩm CÓ THỂ lưu liên kết hồ sơ chính thức hoặc hỗ trợ quy trình do người dùng thực hiện.

Năng lực nhà cung cấp, chất lượng sản phẩm, chứng nhận, quan hệ sở hữu và uy tín PHẢI gắn với bằng chứng hiện có hoặc được ghi rõ là chưa xác minh. Gợi ý thương mại, tín dụng và đàm phán PHẢI nêu tính chất tham khảo và chờ người dùng xem xét. Sản phẩm PHẢI hỗ trợ dữ liệu liên hệ đa ngôn ngữ và nêu rõ phạm vi ngôn ngữ OCR đã cấu hình.

## Nền tảng công nghệ

Stack mặc định của ứng dụng là **Next.js 16** với App Router, **Supabase** cho PostgreSQL được quản lý, xác thực và lưu trữ tệp, **Vercel AI SDK** cho tích hợp nhà cung cấp mô hình và quy trình AI, cùng **AI SDK Elements** cho các thành phần giao diện AI có thể kết hợp. AI SDK Elements dựa trên quy ước shadcn/ui và tích hợp trạng thái/streaming của AI SDK; chỉ dùng các thành phần phù hợp với luồng nghiệp vụ và thiết kế EventLead SI. AI SDK PHẢI nằm sau interface ở cấp ứng dụng để có thể đổi nhà cung cấp mô hình mà không gắn hành vi sản phẩm vào một nhà cung cấp. Supabase Row Level Security PHẢI thực thi ranh giới truy cập theo tổ chức và người dùng đối với dữ liệu truy cập qua API; thông tin xác thực máy chủ có quyền cao PHẢI chỉ tồn tại phía máy chủ. Thay đổi schema cơ sở dữ liệu PHẢI được quản lý phiên bản và rà soát. Stack này là mặc định; mọi sai khác đáng kể PHẢI có lý do được ghi lại và được rà soát về bảo mật, dữ liệu và vận hành.

## Phát triển và rà soát

Thay đổi về trích xuất, chuẩn hóa, bổ sung thông tin, chấm điểm, đồng bộ hoặc hành động gửi ra ngoài PHẢI được rà soát theo các nguyên tắc trên và hành vi sản phẩm hiển thị cho người dùng. Thay đổi ảnh hưởng dữ liệu đã lưu hoặc hợp đồng tích hợp PHẢI ghi lại tính tương thích, xử lý lỗi và kế hoạch chuyển đổi nếu cần. Việc rà soát PHẢI xem xét quyền riêng tư, phân quyền, nguồn gốc dữ liệu, độ không chắc chắn và bước duyệt của con người trong luồng bị ảnh hưởng.

## Quản trị

Hiến chương này chi phối các quyết định sản phẩm và kỹ thuật của EventLead SI. Nếu đề xuất xung đột với nguyên tắc, PHẢI sửa đề xuất hoặc sửa đổi hiến chương trước khi chấp nhận xung đột. Mọi sửa đổi PHẢI có lý do được ghi lại và được nhóm duy trì dự án rà soát; thay đổi ảnh hưởng dữ liệu cá nhân hoặc đề xuất có hệ quả PHẢI được rà soát thêm các biện pháp kiểm soát liên quan.

Phiên bản hiến chương tuân theo semantic versioning. Tăng MAJOR khi có thay đổi quản trị không tương thích ngược hoặc xóa/định nghĩa lại nguyên tắc; tăng MINOR khi thêm nguyên tắc hoặc mở rộng đáng kể hướng dẫn quản trị; tăng PATCH khi làm rõ hoặc sửa câu chữ không đổi ý nghĩa. Phiên bản, ngày sửa đổi và lý do PHẢI được cập nhật cùng nhau.

Mỗi tính năng và thay đổi PHẢI được rà soát mức tuân thủ các nguyên tắc và ràng buộc áp dụng. Người rà soát PHẢI ghi lại ngoại lệ đáng kể, lý do, luồng bị ảnh hưởng và người phụ trách/kế hoạch xử lý. Ngoại lệ KHÔNG ĐƯỢC âm thầm làm yếu kiểm soát quyền riêng tư hoặc bỏ bước duyệt bắt buộc của con người đối với hành động có hệ quả.

**Phiên bản**: 1.2.2 | **Ngày phê chuẩn**: TODO(RATIFICATION_DATE): xác nhận ngày thông qua ban đầu | **Ngày sửa đổi gần nhất**: 2026-10-12

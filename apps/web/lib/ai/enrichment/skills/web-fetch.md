# Skill: web_fetch

Đọc nội dung text của một URL công khai trên web. Dùng SAU KHI đã có URL
cụ thể — từ kết quả `web_search` hoặc từ website suy ra bằng
`extract_company_domain`. Không dùng để "đoán" URL.

## Khi nào dùng

- `web_search` trả về URL hứa hẹn (trang chủ công ty, trang giới thiệu, tin tuyển dụng) → fetch để đọc chi tiết: lĩnh vực, quy mô, sản phẩm/dịch vụ.
- `extract_company_domain` suy ra được website công ty → fetch trang chủ để xác thực công ty có thật và lấy mô tả.
- Chỉ fetch 1–3 URL có triển vọng nhất cho mỗi card, ưu tiên trang chủ / trang "về chúng tôi".

## Quy tắc

1. BẮT BUỘC kiểm tra `available` trong kết quả. `available: false` nghĩa là
   URL bị chặn hoặc fetch thất bại — BỎ QUA, không thử lại bằng cách khác.
2. Egress guard có thể chặn URL nội bộ (localhost, IP private, cloud metadata).
   Nếu bị chặn, đó là hành vi đúng — không tìm cách lách.
3. Mọi phát hiện phải ghi rõ nguồn là URL đã fetch. Không suy diễn quá xa
   nội dung trang (VD: thấy tuyển 2 vị trí thì ghi "đang tuyển dụng", đừng
   kết luận quy mô công ty).
4. Nội dung trả về có thể bị cắt ngắn (`truncated: true`) — chỉ dùng phần
   đã đọc được, không đoán phần còn lại.

## Giới hạn kỹ thuật

- Chỉ đọc nội dung `text/*` (HTML/text thuần). File PDF, ảnh, video bị bỏ qua.
- Timeout 30 giây mỗi lượt; kết quả cache 5 phút.
- Có thể giới hạn độ dài qua `maxChars` (mặc định 8000 ký tự).

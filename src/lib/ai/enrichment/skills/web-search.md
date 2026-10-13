# Skill: web_search

Tìm kiếm thông tin công khai trên web theo từ khoá (tên công ty, website, email…).
Chỉ dùng khi tool báo available=true; nếu available=false thì BỎ QUA, không được tự suy đoán kết quả.

## Khi nào dùng

- Sau khi đã dùng hai công cụ chuẩn hoá nội bộ, muốn tìm thêm: website chính thức, lĩnh vực, quy mô công ty, tin tức liên quan.
- Từ khoá tốt: tên công ty + "tuyển dụng", domain công ty, `site:<domain>`.

## Quy tắc

1. BẮT BUỘC kiểm tra `available` trong kết quả trả về trước khi dùng. `available: false` nghĩa là chưa cấu hình `SEARCH_API_KEY` hoặc provider chưa chốt — bỏ qua hoàn toàn.
2. Tuyệt đối không bịa kết quả tìm kiếm. Không có kết quả thật thì trả findings rỗng.
3. Mỗi phát hiện phải ghi rõ nguồn (URL). Ưu tiên nguồn chính thức của công ty.
4. Tối đa 5 kết quả mỗi lượt gọi; gọi tối đa vài lượt cho một card, ưu tiên chất lượng từ khoá hơn số lượng.

## Trạng thái hiện tại

Provider tìm kiếm web chưa được chốt (xem plan.md Giai đoạn 2). Khi đã chọn provider
(VD: Exa, Tavily, Brave Search), implement gọi API thật trong `tools.ts` và cập nhật file này.

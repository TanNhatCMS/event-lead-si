# Skill: extract_company_domain

Từ địa chỉ email suy ra domain công ty và website dự kiến. Không áp dụng cho email công cộng (gmail, yahoo…).

## Khi nào dùng

- Khi có email từ danh thiếp và trường `website` còn trống hoặc cần đối chiếu.
- Ưu tiên dùng sau khi đã chuẩn hoá email về chữ thường.

## Quy tắc

1. Tách domain từ phần sau `@`, kiểm tra định dạng hợp lệ (chữ thường, có dấu chấm, TLD ≥ 2 ký tự).
2. Nếu domain thuộc nhà cung cấp email công cộng (gmail.com, yahoo.com, outlook.com, icloud.com, proton.me…) → trả `isPublicProvider: true`, `website: null`. Không suy ra website công ty từ email cá nhân.
3. Nếu domain là của công ty → `website` dự kiến là `https://<domain>`.
4. Đây là SUY ĐOÁN từ email, không phải xác minh — confidence khi gợi ý website theo đó mà đặt, và nên đối chiếu thêm nếu có web_search.

## Ví dụ

- Vào `an.nguyen@saoviet.vn` → `domain: "saoviet.vn"`, `website: "https://saoviet.vn"`, `isPublicProvider: false`.
- Vào `bich.ngoc@gmail.com` → `domain: "gmail.com"`, `website: null`, `isPublicProvider: true`.

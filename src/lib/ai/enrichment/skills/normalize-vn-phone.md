# Skill: normalize_vn_phone

Chuẩn hoá số điện thoại Việt Nam: chuyển 0xxx thành +84, tách nhà mạng, định dạng hiển thị. Dùng cho trường phone.

## Khi nào dùng

- Mọi số điện thoại lấy từ danh thiếp trước khi gợi ý cho người dùng.
- Luôn gọi trước các công cụ khác khi xử lý trường `phone`.

## Quy tắc

1. Chấp nhận các dạng đầu vào: `0912345678`, `+84912345678`, `84912345678`, kèm khoảng trắng/gạch ngang.
2. Số di động hợp lệ: đầu `03`, `05`, `07`, `08`, `09` + 8 chữ số. Số cố định: đầu `02` + 8–9 chữ số.
3. Đầu vào không khớp mẫu → trả `valid: false`, không tự đoán số.
4. Không bao giờ thay đổi nghĩa của số — chỉ chuẩn hoá hình thức.

## Kết quả trả về

- `e164`: dạng quốc tế rút gọn, ví dụ `+84912345678`.
- `display`: dạng hiển thị quen thuộc, ví dụ `+84 912 345 678`.
- `carrier`: nhà mạng (Viettel, Vinaphone, MobiFone, Vietnamobile, GMobile, iTel) hoặc `Cố định`.
- `valid`: true/false.

## Ví dụ

- Vào `0912 345 678` → `display: "+84 912 345 678"`, `carrier: "Vinaphone"`, `valid: true`.
- Vào `+84 935 667 78B` → `valid: false` (lẫn chữ cái, không tự sửa).

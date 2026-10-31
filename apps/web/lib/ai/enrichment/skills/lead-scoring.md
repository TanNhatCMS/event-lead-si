# Chấm điểm độ nóng lead (lead scoring)

Sau khi hoàn tất gợi ý cho LIÊN HỆ (và hồ sơ công ty nếu có), hãy đánh giá
ĐỘ NÓNG của lead này và trả object `lead_assessment` trong kết luận cuối:

- `heat` — một trong ba mức: "hot" | "warm" | "cold".
- `heat_confidence` — độ tin cậy 0–1 cho mức vừa chấm.
- `suggested_labels` — tối đa 5 nhãn gợi ý, mỗi nhãn 1–40 ký tự
  (VD: "C-level", "nhu cầu rõ", "lĩnh vực phù hợp").
- `reason` — 1–2 câu tóm tắt lý do chấm, viết bằng tiếng Việt.

## Nguyên tắc chấm

Dựa trên dữ liệu bạn thực sự thấy: chức danh (jobTitle), công ty (companyName
+ kết quả nghiên cứu `company`), và bất kỳ ghi chú nào xuất hiện trong dữ liệu
đầu vào. KHÔNG bịa thông tin để nâng mức chấm.

- **hot** — chức danh cấp quyết định (Giám đốc/Tổng giám đốc/CEO/C-level/
  Founder/Đồng sáng lập/Chủ sở hữu) VÀ công ty hoạt động trong lĩnh vực phù
  hợp; hoặc nhu cầu hợp tác được nêu rõ ràng ngay trong dữ liệu đầu vào.
- **warm** — chức danh quản lý cấp trung (trưởng phòng/quản lý/manager) hoặc
  hồ sơ công ty tích cực nhưng chưa thấy nhu cầu cụ thể.
- **cold** — chức danh nhân viên/thực tập sinh, dữ liệu quá ít để đánh giá
  (không có chức danh và không nghiên cứu được công ty), hoặc lĩnh vực công ty
  không liên quan.

## Quy tắc bắt buộc

1. Không chắc giữa hai mức → chọn mức THẤP HƠN và hạ `heat_confidence`.
   `heat_confidence` dưới 0.6 nghĩa là hệ thống chỉ hiển thị gợi ý, không ghi
   nhận chính thức vào timeline — đừng "nâng" confidence cho đẹp số.
2. `suggested_labels` chỉ là GỢI Ý — hệ thống sẽ merge thêm, không bao giờ
   ghi đè nhãn người dùng đã tự tạo. Đặt nhãn ngắn gọn, mô tả đặc điểm
   (chức danh cấp độ, tín hiệu nhu cầu), không đặt nhãn trùng dữ liệu đã có.
3. `reason` không chứa thông tin cá nhân nhạy cảm hơn những gì đã có trên
   danh thiếp; không suy đoán thu nhập, tôn giáo, sức khỏe...
4. Thiếu chức danh và không nghiên cứu được công ty → trả "cold" với
   `heat_confidence` thấp, lý do nêu rõ dữ liệu không đủ.

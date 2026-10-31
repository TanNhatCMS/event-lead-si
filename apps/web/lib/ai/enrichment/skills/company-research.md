# Nghiên cứu hồ sơ công ty (company research)

Sau khi hoàn tất các gợi ý cho LIÊN HỆ (phone/website/...), nếu dữ liệu đầu vào
có tên công ty (companyName), hãy nghiên cứu thêm HỒ SƠ DOANH NGHIỆP:

1. **Tìm công ty trên web.** Dùng `web_search` với tên công ty (+ "website",
   "giới thiệu", "about") và/hoặc `web_fetch` thẳng website suy ra từ email
   công ty (tool `extract_company_domain`) hoặc website đã biết. Website
   chính thức là nguồn tốt nhất cho: tên pháp nhân, lĩnh vực, sản phẩm,
   quy mô nhân sự, năm thành lập.
2. **Điền trường công ty còn thiếu** trong object `company` của kết luận cuối:
   - `legal_name` — tên pháp nhân đầy đủ (VD "Công ty Cổ phần ...", "Co., Ltd").
   - `country_code` — mã quốc gia 2 chữ cái (VD "VN", "JP").
   - `industry` — lĩnh vực/ngành nghề ngắn gọn.
   - `market_summary` — 1-3 câu về thị trường/vị thế của công ty.
   - `employee_size_range` — khoảng nhân sự (VD "51-200", "1000+").
   - `founded_year` — năm thành lập, trả về dạng CHUỖI 4 chữ số (VD "1999").
   - `products_summary` — 1-3 câu về sản phẩm/dịch vụ chính.
   - `tax_or_registration_id` — mã số thuế / mã đăng ký kinh doanh nếu công bố.
   - `website` — URL đầy đủ có https://.
3. **Mỗi trường PHẢI kèm `confidence` (0–1) và `evidence`** — nguồn web thật
   (tên trang hoặc URL) nơi bạn thấy thông tin. Có URL thì điền `sourceUrl`.
   KHÔNG điền trường khi không tìm thấy nguồn — để trống, tuyệt đối không bịa
   hoặc đoán (mã số thuế, năm thành lập là dữ liệu dễ nhầm giữa các công ty
   cùng tên).
4. **Chỉ tin nguồn chính thức hoặc nguồn uy tín** (website công ty, báo chí
   kinh doanh, trang doanh nghiệp nhà nước). Trang rao việc/BCA lạ thì hạ
   confidence và nêu rõ trong `note`.
5. Thông tin đã có sẵn trên danh thiếp (tên công ty, website trên thẻ) KHÔNG
   cần trả lại trong `company` — chỉ trả phần BỔ SUNG được từ web.

# Đặc tả tính năng: Chatbot RAG tra cứu tri thức EventLead SI

**Nhánh tính năng**: `002-rag-chatbot`

**Ngày tạo**: 2026-10-13

**Trạng thái**: Đã chốt — Q1–Q3 có quyết định ngày 2026-10-13 (QĐ1, QĐ2, QĐ3); 0 câu hỏi mở.

**Đầu vào**: Yêu cầu của người dùng ngày 2026-10-13 — chatbot trả lời dựa trên (1) tài liệu người dùng tải lên (PDF/DOCX/TXT) và (2) dữ liệu danh bạ đã thu thập; dùng để trả lời câu hỏi, đưa gợi ý, lập/dựng báo giá, tra cứu thông tin công ty; mọi câu trả lời kèm trích dẫn nguồn; số liệu giá trích nguyên văn, tuyệt đối không bịa số, không suy diễn.

## Mục tiêu sản phẩm

EventLead SI đang thu thập hai kho tri thức quý giá nhưng nằm rải rác: tài liệu người dùng tải lên (bảng giá, catalogue, hồ sơ năng lực, hợp đồng mẫu...) và hồ sơ danh bạ đã thu thập (người liên hệ, công ty, ghi chú cuộc gặp). Hiện người dùng phải tự mở từng file, tự nhớ từng hồ sơ để trả lời một câu hỏi hay dựng một báo giá — chậm và dễ sai số.

Chatbot RAG giải quyết đúng điểm đau này: một nơi duy nhất để **hỏi bằng tiếng Việt** và nhận câu trả lời **dựa trên bằng chứng** — trích dẫn rõ nguồn (tên file + số trang/tiêu đề mục, hoặc tên hồ sơ). Với báo giá, chatbot chỉ được dùng số liệu **trích nguyên văn từ tài liệu**, mọi con số đều có nguồn, tuyệt đối không bịa, không ước lượng, không suy ra từ sản phẩm khác.

Tuân hiến chương "AI gợi ý, người quyết định": chatbot tư vấn, gợi ý, dựng dự thảo — mọi quyết định gửi báo giá, liên hệ khách hàng hay thay đổi dữ liệu đều do người thực hiện.

## Quyết định đã chốt

### Quyết định của người dùng (2026-10-13)

- **QĐ1 (Q1 — mâu thuẫn giữa tài liệu và danh bạ)**: Ưu tiên tài liệu có ngày hiệu lực/tải lên mới nhất và **chỉ nêu nguồn đó**; dữ liệu danh bạ mâu thuẫn không được trình bày.
- **QĐ2 (Q2 — nhiều phiên bản tài liệu cùng loại)**: Khi tải lên, người dùng chọn **loại tài liệu** (`document_type`) và **ngày hiệu lực** (`effective_date`); chatbot ưu tiên bản đang hiệu lực và **nêu rõ đang dùng bản nào** (tên file + ngày hiệu lực).
- **QĐ3 (Q3 — đơn vị trích dẫn cho DOCX/TXT)**: Với DOCX/TXT: **tên file + tiêu đề mục hoặc đoạn văn bản gần nhất** chứa thông tin; với PDF: tên file + số trang như bình thường.

### Giả định đã chốt (auto)

- Chatbot chỉ **đọc** dữ liệu: không tự tạo, sửa hay xóa hồ sơ danh bạ; không tự gửi báo giá/email/tin nhắn cho khách hàng.
- Mỗi tài liệu và toàn bộ danh bạ thuộc về đúng người dùng đã tạo; chatbot không bao giờ trả lời từ dữ liệu của người khác.
- Định dạng tài liệu hỗ trợ: PDF, DOCX, TXT (đã chốt). File không đúng định dạng bị từ chối kèm thông báo rõ ràng.
- Khi danh bạ thay đổi (thêm/sửa/xóa liên hệ, công ty, ghi chú cuộc gặp), chatbot phải dùng dữ liệu mới nhất cho các câu hỏi tiếp theo — không trả lời từ dữ liệu cũ quá 5 phút.
- Khi không tìm thấy thông tin trong cả hai kho, chatbot nói rõ "không tìm thấy", gợi ý nguồn gần nhất nếu có — tuyệt đối không bịa câu trả lời.
- Dự thảo báo giá luôn kèm dòng chữ cảnh báo "tạm tính — cần người kiểm tra trước khi gửi".
- Hồ sơ danh bạ đã xóa mềm (`contacts.archived_at`, `meeting_notes.deleted_at`) không được đưa vào chỉ mục và không được dùng để trả lời.
- Khi câu hỏi khớp nhiều công ty/liên hệ trùng tên, chatbot liệt kê các ứng viên kèm thông tin phân biệt để người dùng chọn, không tự đoán một hồ sơ.
- Câu hỏi ngoài phạm vi hai kho tri thức (tài liệu + danh bạ): chatbot từ chối lịch sự và nêu rõ chỉ trả lời dựa trên hai nguồn này.
- Giới hạn mặc định: mỗi file tối đa 25MB, tối đa 100 tài liệu trong kho (có thể điều chỉnh sau).
- Lịch sử chat được giữ đến khi người dùng xóa; không tự xóa theo thời gian.
- Liên kết chia sẻ công ty công khai không có chatbot (chỉ người dùng đăng nhập).

## Kịch bản người dùng và kiểm thử *(bắt buộc)*

### Câu chuyện 1 — Tải tài liệu và hỏi đáp có trích dẫn (Ưu tiên: P1)

Người dùng tải lên bảng giá và catalogue sản phẩm, sau đó hỏi "Giá máy X là bao nhiêu?" Chatbot trả lời con số trích nguyên văn từ tài liệu, kèm nguồn (tên file + số trang). Nếu sản phẩm không có trong tài liệu, chatbot nói rõ không tìm thấy thay vì đoán.

**Lý do ưu tiên**: Đây là năng lực cốt lõi — biến kho tài liệu tĩnh thành nguồn trả lời có căn cứ, và là nền cho mọi kịch bản báo giá, tư vấn.

**Kiểm thử độc lập**: Tải một file PDF 20 trang, chờ trạng thái sẵn sàng, hỏi 5 câu có đáp án trong tài liệu và 1 câu không có — kiểm tra trích dẫn và hành vi "không tìm thấy".

**Kịch bản chấp nhận**:

1. **Cho trước** file PDF bảng giá đã tải lên và xử lý xong, **khi** người dùng hỏi "giá máy X", **thì** câu trả lời chứa con số khớp nguyên văn với tài liệu và ghi rõ tên file + trang.
2. **Cho trước** cùng tài liệu trên, **khi** người dùng hỏi về sản phẩm không có trong tài liệu, **thì** chatbot trả lời không tìm thấy và không đưa ra bất kỳ con số nào.
3. **Cho trước** file không đúng định dạng (ví dụ ảnh .png), **khi** người dùng tải lên, **thì** hệ thống từ chối và báo rõ chỉ nhận PDF/DOCX/TXT.

### Câu chuyện 2 — Tra cứu và tóm tắt danh bạ đã thu thập (Ưu tiên: P1)

Nhân viên bán hàng hỏi "Tuần này tôi đã gặp những công ty nào?" hoặc "Ai là người liên hệ ở công ty A?" Chatbot tóm tắt từ hồ sơ liên hệ, công ty và ghi chú cuộc gặp đã lưu, mỗi thông tin kèm nguồn là tên hồ sơ tương ứng.

**Lý do ưu tiên**: Biến dữ liệu danh bạ đã thu thập (tính năng 001) thành tri thức có thể hỏi đáp, thay vì phải tự lục từng hồ sơ.

**Kiểm thử độc lập**: Tạo 3 công ty + 5 liên hệ + 2 ghi chú cuộc gặp, hỏi 5 câu tra cứu — kiểm tra độ đúng và trích dẫn hồ sơ.

**Kịch bản chấp nhận**:

1. **Cho trước** 3 công ty đã lưu với ghi chú cuộc gặp trong tuần, **khi** người dùng hỏi "tuần này tôi đã gặp những công ty nào", **thì** chatbot liệt kê đúng 3 công ty kèm nguồn từng hồ sơ.
2. **Cho trước** người dùng vừa thêm một liên hệ mới, **khi** hỏi về liên hệ đó trong vòng 5 phút, **thì** chatbot trả lời dựa trên dữ liệu mới, không dùng dữ liệu cũ.

### Câu chuyện 3 — Dựng dự thảo báo giá từ tài liệu giá (Ưu tiên: P2)

Nhân viên kinh doanh nói "Lập báo giá 10 máy X cho công ty A". Chatbot liệt kê các hạng mục với đơn giá **trích nguyên văn từ tài liệu**, mỗi dòng kèm nguồn trích dẫn; chatbot **không tự thực hiện bất kỳ phép tính nào** (không nhân số lượng, không tính thành tiền/tổng cộng) — mọi phép tính do người dùng thực hiện và kiểm tra. Dự thảo kèm cảnh báo "tạm tính — cần người kiểm tra". Người dùng tự kiểm tra, chỉnh sửa và gửi — chatbot không tự gửi.

**Lý do ưu tiên**: Báo giá là nghiệp vụ có giá trị cao nhất nhưng cũng rủi ro nhất nếu sai số; yêu cầu "không bịa số, không tự tính" là ràng buộc an toàn cốt lõi của tính năng.

**Kiểm thử độc lập**: Tải bảng giá có 10 sản phẩm, yêu cầu dựng báo giá 3 dòng hàng — kiểm tra 100% con số trích nguyên văn có nguồn và không có con số nào do chatbot tự tính.

**Kịch bản chấp nhận**:

1. **Cho trước** bảng giá có đơn giá máy X, **khi** người dùng yêu cầu báo giá 10 máy X, **thì** dự thảo liệt kê đơn giá trích nguyên văn kèm nguồn, ghi rõ số lượng do người dùng yêu cầu, và nêu rõ chatbot không tự tính thành tiền — người dùng tự tính và kiểm tra.
2. **Cho trước** yêu cầu báo giá sản phẩm không có giá trong tài liệu, **khi** chatbot dựng dự thảo, **thì** dòng hàng đó ghi rõ "chưa có giá trong tài liệu — cần người bổ sung", không tự điền số.
3. **Cho trước** người dùng yêu cầu chatbot tính tổng, chiết khấu hoặc thành tiền, **khi** chatbot trả lời, **thì** chatbot từ chối tự tính và nêu rõ cần người dùng thực hiện và kiểm tra phép tính.

### Câu chuyện 4 — Gợi ý tiếp cận khách hàng (Ưu tiên: P2)

Nhân viên kinh doanh hỏi "Gợi ý cách tiếp cận công ty B". Chatbot tổng hợp từ hồ sơ công ty B (lĩnh vực, quy mô, ghi chú cuộc gặp) và tài liệu sản phẩm để đưa ra gợi ý — ví dụ sản phẩm phù hợp, điểm chạm đã ghi nhận. Mọi gợi ý đều mang tính tham khảo; quyết định hành động thuộc về người dùng.

**Lý do ưu tiên**: Khai thác chiều sâu của dữ liệu đã có để hỗ trợ bán hàng, đúng tinh thần "AI gợi ý, người quyết định".

**Kiểm thử độc lập**: Hỏi gợi ý cho một công ty có đầy đủ hồ sơ và ghi chú — kiểm tra gợi ý có căn cứ từ hồ sơ/tài liệu, không chứa thông tin bịa.

**Kịch bản chấp nhận**:

1. **Cho trước** hồ sơ công ty B có ghi chú cuộc gặp, **khi** người dùng hỏi gợi ý tiếp cận, **thì** chatbot đưa gợi ý có trích dẫn từ hồ sơ công ty B và tài liệu sản phẩm liên quan.
2. **Cho trước** công ty chưa có ghi chú cuộc gặp nào, **khi** hỏi gợi ý, **thì** chatbot nói rõ dữ liệu còn ít và gợi ý ở mức tổng quát, không bịa chi tiết cuộc gặp.

### Câu chuyện 5 — Quản lý kho tài liệu (Ưu tiên: P1)

Người dùng xem danh sách tài liệu đã tải (tên file, loại tài liệu, ngày tải, ngày hiệu lực, trạng thái: đang xử lý / đã sẵn sàng / lỗi), xóa tài liệu cũ hoặc lỗi thời. Sau khi xóa, chatbot không còn dùng nội dung tài liệu đó để trả lời.

**Lý do ưu tiên**: Kho tri thức phải được kiểm soát — tài liệu lỗi thời còn sót lại là nguồn gốc của câu trả lời sai.

**Kiểm thử độc lập**: Tải 2 tài liệu, xóa 1, hỏi nội dung chỉ có trong tài liệu đã xóa — kiểm tra chatbot trả lời không tìm thấy.

**Kịch bản chấp nhận**:

1. **Cho trước** danh sách 3 tài liệu đã sẵn sàng, **khi** người dùng xóa 1 tài liệu, **thì** tài liệu biến mất khỏi danh sách và chatbot không còn trích dẫn nó.
2. **Cho trước** tài liệu đang ở trạng thái "đang xử lý", **khi** người dùng hỏi nội dung trong đó, **thì** chatbot báo tài liệu chưa sẵn sàng thay vì trả lời thiếu căn cứ.

### Câu chuyện 6 — Lịch sử hội thoại (Ưu tiên: P3)

Người dùng xem lại các đoạn chat cũ, bắt đầu đoạn chat mới, xóa đoạn chat không cần. Lịch sử giúp tiếp tục công việc dở dang (ví dụ quay lại dự thảo báo giá hôm qua).

**Kịch bản chấp nhận**:

1. **Cho trước** 3 đoạn chat đã lưu, **khi** người dùng mở lại 1 đoạn, **thì** toàn bộ nội dung hỏi-đáp kèm trích dẫn hiển thị đầy đủ.
2. **Cho trước** 1 đoạn chat, **khi** người dùng xóa, **thì** đoạn chat biến mất khỏi danh sách.

## Yêu cầu chức năng

- **FR-001**: Người dùng tải lên tài liệu định dạng PDF, DOCX, TXT; hệ thống từ chối định dạng khác kèm thông báo rõ ràng.
- **FR-002**: Khi tải lên tài liệu, người dùng chọn loại tài liệu (document_type) và ngày hiệu lực (effective_date). Hệ thống trích xuất nội dung tài liệu đã tải để chatbot tham khảo khi trả lời; mỗi tài liệu có trạng thái xử lý: đang xử lý / đã sẵn sàng / lỗi. *(Quyết định đã chốt — QĐ2)*
- **FR-003**: Người dùng xem danh sách tài liệu đã tải gồm tên file, loại tài liệu, ngày tải, ngày hiệu lực, trạng thái xử lý. *(Quyết định đã chốt — QĐ2)*
- **FR-004**: Người dùng xóa tài liệu; sau khi xóa, chatbot không còn sử dụng nội dung tài liệu đó trong bất kỳ câu trả lời nào.
- **FR-005**: Trang chat riêng, giao diện tiếng Việt, cho phép hỏi-đáp nhiều lượt; giữ ngữ cảnh trong cùng một đoạn chat.
- **FR-006**: Chatbot trả lời kết hợp cả hai nguồn: nội dung tài liệu đã tải và dữ liệu danh bạ (hồ sơ liên hệ, hồ sơ công ty, ghi chú cuộc gặp). Quy tắc ưu tiên *(quyết định đã chốt — QĐ1, QĐ2)*:
  - Khi tài liệu và hồ sơ danh bạ mâu thuẫn: chatbot trích dẫn nguồn tài liệu có ngày hiệu lực/tải lên mới nhất và **chỉ nêu nguồn đó**; không trình bày dữ liệu danh bạ mâu thuẫn.
  - Khi có nhiều phiên bản tài liệu cùng loại chứa đáp án: chatbot ưu tiên bản đang hiệu lực và **nêu rõ đang dùng bản nào** (tên file + ngày hiệu lực).
- **FR-007**: Mọi câu trả lời dựa trên dữ liệu đều kèm trích dẫn nguồn. *(Quyết định đã chốt — QĐ3)* Với PDF: tên file + số trang. Với DOCX/TXT (không có số trang): tên file + tiêu đề mục hoặc đoạn văn bản gần nhất chứa thông tin. Với danh bạ: tên hồ sơ liên hệ/công ty hoặc tiêu đề ghi chú cuộc gặp.
- **FR-008**: Dự thảo báo giá: mọi con số đều trích NGUYÊN VĂN từ tài liệu và có trích dẫn nguồn từng dòng; chatbot KHÔNG ĐƯỢC tự thực hiện bất kỳ phép tính nào (không nhân số lượng, không tính thành tiền/tổng cộng/chiết khấu/thuế); các phép tính do người dùng thực hiện và kiểm tra; kèm cảnh báo "tạm tính — cần người kiểm tra trước khi gửi".
- **FR-009**: Cấm bịa số liệu: khi không có số liệu trong nguồn, chatbot trả lời "không tìm thấy" và không đưa ra con số nào; không ước lượng, không suy ra giá từ sản phẩm khác, không tự suy diễn điều kiện/chiết khấu không có trong nguồn.
- **FR-010**: Dữ liệu danh bạ mới hoặc vừa chỉnh sửa được chatbot sử dụng cho các câu hỏi tiếp theo trong vòng tối đa 5 phút kể từ khi lưu.
- **FR-011**: Khi không tìm thấy thông tin trong cả hai nguồn, chatbot trả lời rõ ràng là không tìm thấy và gợi ý nguồn gần nhất nếu có.
- **FR-012**: Chatbot không tự thực hiện hành động có hậu quả: không tự gửi báo giá, không tự liên hệ khách hàng, không tự tạo/sửa/xóa hồ sơ danh bạ hay tài liệu. Mọi hành động do người dùng thực hiện.
- **FR-013**: Lịch sử hội thoại: lưu các đoạn chat, cho phép xem lại, bắt đầu đoạn mới, xóa đoạn cũ.
- **FR-014**: Mỗi người dùng chỉ truy cập kho tài liệu và danh bạ của chính mình; chatbot không trả lời từ dữ liệu của người khác.

## Tiêu chí nghiệm thu

- **SC-001**: Tải lên file PDF 20 trang → trạng thái "đã sẵn sàng" trong tối đa 5 phút; hỏi 5 câu có đáp án trong tài liệu → cả 5 câu trả lời đúng nội dung và ghi đúng tên file + số trang.
- **SC-002**: Hỏi giá 3 sản phẩm có trong bảng giá → cả 3 con số khớp nguyên văn với tài liệu, mỗi số có trích dẫn nguồn; hỏi 1 sản phẩm không có trong tài liệu → chatbot trả lời không tìm thấy và không đưa ra bất kỳ con số nào.
- **SC-003**: Dự thảo báo giá 3 dòng hàng → 100% con số trích nguyên văn từ tài liệu và có trích dẫn nguồn; không có con số nào do chatbot tự tính (không thành tiền/tổng cộng); có dòng cảnh báo "tạm tính — cần người kiểm tra trước khi gửi"; dòng hàng thiếu giá trong tài liệu ghi rõ "chưa có giá — cần người bổ sung".
- **SC-004**: Thêm 1 liên hệ mới vào danh bạ → trong vòng 5 phút, hỏi về liên hệ đó → chatbot trả lời đúng thông tin mới kèm nguồn là hồ sơ liên hệ.
- **SC-005**: Xóa 1 trong 2 tài liệu đã tải → hỏi nội dung chỉ có trong tài liệu đã xóa → chatbot trả lời không tìm thấy, không trích dẫn tài liệu đã xóa.
- **SC-006**: Bộ kiểm thử 30 câu hỏi chuẩn (20 từ tài liệu, 10 từ danh bạ) → tối thiểu 27/30 câu trả lời đúng nội dung và có trích dẫn nguồn hợp lệ.
- **SC-007**: Toàn bộ giao diện trang chat hiển thị tiếng Việt; người dùng hoàn thành luồng tải tài liệu → hỏi → nhận trích dẫn mà không cần hướng dẫn thêm.
- **SC-008**: Thử yêu cầu chatbot "gửi báo giá này cho khách" → chatbot từ chối thực hiện hành động gửi và nhắc người dùng tự kiểm tra, tự gửi.
- **SC-009** *(QĐ2)*: Tải lên 2 bảng giá cùng loại `price_list` (ngày hiệu lực 2025 và 2026) → danh sách tài liệu hiển thị đúng loại tài liệu + ngày hiệu lực cho cả 2; hỏi giá sản phẩm có trong cả 2 bản → câu trả lời dùng số liệu bản 2026 và nêu rõ tên file + ngày hiệu lực đang dùng.
- **SC-010** *(QĐ1)*: Tạo tình huống tài liệu và hồ sơ danh bạ mâu thuẫn (ví dụ giá trong bảng giá mới nhất khác ghi chú cuộc gặp) → hỏi về giá đó → câu trả lời chỉ trích dẫn tài liệu có ngày hiệu lực/tải lên mới nhất, không trình bày số liệu danh bạ mâu thuẫn.
- **SC-011** *(QĐ3)*: Tải file DOCX có tiêu đề mục → hỏi nội dung trong một mục → trích dẫn ghi đúng tên file + tiêu đề mục chứa thông tin (không dùng số trang hay số chunk).

## Làm rõ

### Phiên 2026-10-13 (workflow clarify)

Đã tự quyết từ repo/context và ghi vào "Giả định đã chốt (auto)": hồ sơ xóa mềm
không được index; câu hỏi khớp nhiều hồ sơ trùng tên thì liệt kê để người
chọn; câu hỏi ngoài hai kho tri thức thì từ chối lịch sự; giới hạn mặc định
25MB/file và 100 tài liệu; lịch sử chat giữ đến khi người dùng xóa; link chia
sẻ công ty công khai không có chatbot.

Còn chờ người quyết:

*(Không còn điểm nào chờ — cả 3 câu hỏi đã có quyết định, xem mục "Quyết định đã chốt" và FR-002/FR-003/FR-006/FR-007.)*

- **Q1**: Khi tài liệu và hồ sơ danh bạ mâu thuẫn nhau, chatbot ưu tiên nguồn nào và trình bày thế nào? → **Đã trả lời (QĐ1)**: ưu tiên tài liệu có ngày hiệu lực/tải lên mới nhất, chỉ nêu nguồn đó; dữ liệu danh bạ mâu thuẫn không được trình bày.
- **Q2**: Khi có nhiều phiên bản tài liệu cùng loại (bảng giá 2025/2026), phân biệt và ưu tiên ra sao? Có cần metadata loại tài liệu + ngày hiệu lực khi tải lên không? → **Đã trả lời (QĐ2)**: có — khi tải lên cho chọn loại tài liệu (document_type) + ngày hiệu lực (effective_date); chatbot ưu tiên bản đang hiệu lực và nêu rõ đang dùng bản nào (tên file + ngày hiệu lực).
- **Q3**: Với DOCX/TXT không có số trang, trích dẫn nguồn dùng đơn vị nào? → **Đã trả lời (QĐ3)**: tên file + tiêu đề mục hoặc đoạn văn bản gần nhất chứa thông tin (PDF vẫn dùng tên file + số trang).

## Ngoài phạm vi

- Chatbot không thay thế bước con người kiểm tra/duyệt: không tự động gửi email, tin nhắn hay báo giá cho khách hàng.
- Không xử lý tài liệu dạng ảnh quét cần nhận dạng ký tự (OCR) — chỉ tài liệu PDF/DOCX/TXT có sẵn nội dung chữ.
- Giao diện chỉ hỗ trợ tiếng Việt; nội dung tài liệu đa ngôn ngữ tùy khả năng trích xuất nội dung chữ.
- Không tra cứu từ nguồn bên ngoài (tìm kiếm web, cơ sở dữ liệu công khai) trong phạm vi tính năng này.
- Không hỗ trợ chat bằng giọng nói.
- Không chia sẻ kho tài liệu hay lịch sử chat cho người khác (mỗi người dùng một kho riêng).
- Không đào tạo riêng mô hình ngôn ngữ trên dữ liệu của người dùng.

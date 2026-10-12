# Đặc tả tính năng: Nền tảng trí tuệ đối tác EventLead SI

**Nhánh tính năng**: `001-event-lead-platform`

**Ngày tạo**: 2026-10-12

**Trạng thái**: Bản nháp

**Đầu vào**: Đặc tả dự án EventLead SI do người dùng cung cấp (phiên bản 1.0, ngày 2026-10-12), cùng các quyết định tiếp theo về tên và công nghệ.

## Làm rõ

### Phiên 2026-10-12

- Hỏi: Bản phát hành đầu tiên nên bao gồm phạm vi nào? → Đáp án: Ưu tiên thu thập liên hệ và theo dõi sau sự kiện; để bổ sung dữ liệu/CRM và tìm nguồn cung ứng cho các giai đoạn sau.
- Hỏi: Thị trường quốc gia nào sẽ được ưu tiên cho giai đoạn đầu? → Đáp án: Việt Nam.

## Kịch bản người dùng và kiểm thử *(bắt buộc)*

### Câu chuyện 1 — Thu thập và quản lý liên hệ tại sự kiện (Ưu tiên: P1)

Đại diện bán hàng tại sự kiện chụp một hoặc nhiều danh thiếp, ghi chú nội dung trao đổi và xem lại thông tin liên hệ được trích xuất. Họ sửa các trường chưa chính xác và gắn từng liên hệ với sự kiện cùng bối cảnh cuộc gặp.

**Lý do ưu tiên**: Thu thập nhanh và đáng tin cậy là nền tảng của sản phẩm, đồng thời hữu ích ngay cả khi chưa có bổ sung dữ liệu hoặc tích hợp bên ngoài.

**Kiểm thử độc lập**: Người dùng nhập ảnh danh thiếp, sửa trường trích xuất, gắn với một sự kiện và tìm lại hồ sơ cùng ghi chú.

**Kịch bản chấp nhận**:

1. **Cho trước** người dùng có ảnh danh thiếp, **khi** họ nhập ảnh, **thì** hệ thống hiển thị các trường nhận dạng để người dùng xem và sửa trước khi xác nhận hồ sơ.
2. **Cho trước** người dùng ghi lại cuộc gặp, **khi** họ thêm sự kiện, ngày, nhu cầu và ghi chú, **thì** các thông tin đó hiển thị cùng hồ sơ liên hệ.
3. **Cho trước** một lô gồm nhiều danh thiếp, **khi** xử lý hoàn tất, **thì** mỗi danh thiếp trở thành một liên hệ riêng để xem xét và các giá trị chưa chắc chắn hoặc có khả năng trùng được đánh dấu.

### Câu chuyện 2 — Bổ sung và đánh giá doanh nghiệp (Ưu tiên: P2)

Nhân viên bán hàng hoặc sourcing mở hồ sơ liên hệ hay doanh nghiệp để tìm hiểu hoạt động, bằng chứng công khai, mức độ phù hợp và rủi ro trước khi quyết định bước tiếp theo.

**Lý do ưu tiên**: Bổ sung dữ liệu và sàng lọc dựa trên bằng chứng biến liên hệ thô thành hồ sơ kinh doanh có thể hành động sau MVP thu thập và theo dõi.

**Kiểm thử độc lập**: Người dùng mở hồ sơ doanh nghiệp, xem thông tin có nguồn và thời điểm cập nhật, đồng thời phân biệt được dữ kiện đã xác minh, suy luận, thiếu hoặc chưa chắc chắn.

**Kịch bản chấp nhận**:

1. **Cho trước** một liên hệ gắn với doanh nghiệp, **khi** có thông tin công khai, **thì** hồ sơ hiển thị chi tiết liên quan kèm nguồn và thời điểm truy xuất nếu có.
2. **Cho trước** hệ thống hiển thị đánh giá phù hợp hoặc rủi ro, **khi** người dùng xem đánh giá, **thì** hệ thống giải thích tiêu chí và bằng chứng, đồng thời nêu phần còn thiếu hoặc chưa chắc chắn.
3. **Cho trước** nguồn công khai không truy cập được hoặc không có dữ kiện cần tìm, **khi** hồ sơ được hiển thị, **thì** hệ thống nêu rõ khoảng trống thay vì trình bày khẳng định không có căn cứ.

### Câu chuyện 3 — Theo dõi và duy trì quan hệ (Ưu tiên: P1)

Người dùng xem lại nội dung theo dõi do AI soạn dựa trên bối cảnh cuộc gặp, chỉnh sửa và duyệt trước khi gửi. Người dùng theo dõi giai đoạn quan hệ và hành động tiếp theo cùng nhóm.

**Lý do ưu tiên**: Theo dõi kịp thời, đúng ngữ cảnh giúp chuyển kết nối tại sự kiện thành quan hệ kinh doanh tiếp diễn.

**Kiểm thử độc lập**: Người dùng có thể tạo hoặc viết bản nháp, xem và sửa, ghi nhận phê duyệt, cập nhật giai đoạn quan hệ và lời nhắc mà không tự động gửi nội dung.

**Kịch bản chấp nhận**:

1. **Cho trước** liên hệ có ghi chú cuộc gặp, **khi** người dùng yêu cầu bản nháp theo dõi, **thì** nội dung phản ánh ngữ cảnh sẵn có và chưa được gửi cho đến khi người dùng duyệt rõ ràng.
2. **Cho trước** người dùng đổi giai đoạn quan hệ hoặc đặt lời nhắc, **khi** đồng đội xem hồ sơ dùng chung, **thì** họ thấy giai đoạn hiện tại, người phụ trách và hành động tiếp theo theo quyền truy cập của mình.
3. **Cho trước** sắp gửi tin nhắn hoặc cập nhật CRM, **khi** người dùng chưa phê duyệt, **thì** hệ thống không thực hiện hành động bên ngoài.

### Câu chuyện 4 — Tìm và lập danh sách nhà cung cấp (Ưu tiên: P3)

Người dùng phụ trách sourcing mô tả sản phẩm và tiêu chí tìm nguồn cung, xem các nhà cung cấp tiềm năng cùng bằng chứng hiện có, rồi tạo danh sách ngắn và câu hỏi cần xác minh.

**Lý do ưu tiên**: Khám phá nhà cung cấp là giai đoạn sau, tận dụng năng lực bằng chứng và đánh giá của nền tảng.

**Kiểm thử độc lập**: Người dùng sourcing tạo yêu cầu, so sánh ứng viên, ghi lại khoảng trống bằng chứng và lưu danh sách ngắn.

**Kịch bản chấp nhận**:

1. **Cho trước** yêu cầu sourcing có sản phẩm, thị trường và tiêu chí nhà cung cấp, **khi** có kết quả ứng viên, **thì** mỗi ứng viên hiển thị tiêu chí phù hợp và bằng chứng để xem xét.
2. **Cho trước** người dùng so sánh ứng viên, **khi** năng lực hoặc chứng nhận không thể xác minh, **thì** hệ thống đánh dấu là chưa xác minh hoặc còn thiếu.
3. **Cho trước** danh sách ngắn đã lưu, **khi** người dùng quay lại yêu cầu, **thì** các nhà cung cấp đã chọn và câu hỏi cần xác minh vẫn được lưu.

### Câu chuyện 5 — Xuất liên hệ đã duyệt tại sự kiện (Ưu tiên: P1)

Thành viên nhóm xuất các liên hệ đã duyệt sang định dạng danh bạ hoặc bảng tính để tiếp tục xử lý đầu mối bằng quy trình hiện có.

**Lý do ưu tiên**: Dữ liệu liên hệ tại sự kiện có thể dùng và chuyển đi được là một phần của bản phát hành đầu tiên, không cần kết nối CRM.

**Kiểm thử độc lập**: Người dùng chọn các liên hệ đã duyệt, xuất dữ liệu và kiểm tra thông tin liên hệ cùng ngữ cảnh sự kiện trong kết quả.

**Kịch bản chấp nhận**:

1. **Cho trước** người dùng chọn liên hệ đã duyệt, **khi** họ xuất dữ liệu, **thì** kết quả chứa thông tin liên hệ cùng ngữ cảnh sự kiện hiện có trong định dạng danh bạ hoặc bảng tính được hỗ trợ.
2. **Cho trước** thao tác xuất hoặc đồng bộ thất bại hay chỉ hoàn tất một phần, **khi** thao tác kết thúc, **thì** hệ thống báo kết quả và nêu các hồ sơ bị ảnh hưởng.

### Câu chuyện 6 — Phát hiện cơ hội kết nối (Ưu tiên: P3)

Thành viên nhóm xem một kết nối chung, đường dẫn quan hệ hoặc nhu cầu kinh doanh bổ trợ được gợi ý và tự quyết định có nên giới thiệu hay không.

**Lý do ưu tiên**: Trí tuệ quan hệ phát huy giá trị sau khi nhóm đã có dữ liệu liên hệ và doanh nghiệp dùng chung, đáng tin cậy.

**Kiểm thử độc lập**: Người dùng kiểm tra một gợi ý quan hệ, hiểu căn cứ, rồi chấp nhận hoặc bỏ qua mà không tự động gửi lời giới thiệu.

**Kịch bản chấp nhận**:

1. **Cho trước** có khả năng tồn tại quan hệ hoặc nhu cầu bổ trợ, **khi** người dùng xem gợi ý, **thì** hệ thống hiển thị bằng chứng hoặc đường dẫn quan hệ và để người dùng quyết định.
2. **Cho trước** người dùng chưa duyệt lời giới thiệu, **khi** gợi ý được hiển thị, **thì** không có tin nhắn hay lời giới thiệu nào được gửi.

### Trường hợp biên

- Ảnh danh thiếp bị mờ, xoay, che một phần, có chữ viết tay hoặc nhiều ngôn ngữ; người dùng phải sửa hoặc từ chối được giá trị chưa chắc chắn.
- Nhiều liên hệ trùng tên, công ty, số điện thoại hoặc email; hệ thống không được gộp hồ sơ chỉ dựa trên một kết quả khớp yếu.
- Một lô có danh thiếp trùng nhau hoặc liên hệ đã tồn tại trong dữ liệu tổ chức.
- Các nguồn công khai mâu thuẫn, lỗi thời, không truy cập được hoặc nói về doanh nghiệp trùng tên.
- Doanh nghiệp không có website chính thức hoặc thông tin đăng ký có thể xác minh trong thị trường đã cấu hình.
- Người dùng không có quyền xem liên hệ, sự kiện, ghi chú, bản ghi âm hoặc quan hệ doanh nghiệp.
- Tích hợp bị ngắt kết nối, giới hạn tốc độ hoặc trả dữ liệu một phần trong lúc xuất hay đồng bộ.
- Bản nháp AI có nội dung không được hỗ trợ bởi bằng chứng, tiết lộ ghi chú nhạy cảm hoặc hứa hẹn điều người dùng chưa cung cấp.
- Hồ sơ nhà cung cấp thiếu bằng chứng về năng lực, chất lượng, chứng nhận hoặc tuân thủ sản phẩm.
- Người dùng yêu cầu tìm nguồn ở thị trường chưa cấu hình phạm vi dữ liệu công khai.

## Yêu cầu *(bắt buộc)*

### Phân kỳ phát hành

- **Giai đoạn 1 — MVP thu thập và theo dõi**: Tạo sự kiện và liên hệ, nhận dạng và sửa thông tin danh thiếp, lưu bối cảnh cuộc gặp, xem xét trùng lặp, hồ sơ liên hệ/doanh nghiệp cơ bản, theo dõi giai đoạn quan hệ, lời nhắc, bản nháp tiếp nối có người duyệt và xuất vCard/bảng tính.
- **Giai đoạn 2 — Bổ sung thông tin và CRM**: Bổ sung doanh nghiệp từ nguồn công khai, đánh giá phù hợp/rủi ro dựa trên bằng chứng, bảng điều khiển sự kiện, lịch và đồng bộ CRM có phê duyệt.
- **Giai đoạn 3 — Trí tuệ quan hệ và sourcing**: Đồ thị kết nối và gợi ý giới thiệu, tìm kiếm và so sánh nhà cung cấp, danh sách ngắn, chuẩn bị đàm phán và hộp thư hợp nhất nếu nền tảng hỗ trợ.
- Bản phát hành đầu tiên PHẢI cung cấp Giai đoạn 1 như một sản phẩm độc lập có thể sử dụng. Các tính năng Giai đoạn 2 và 3 KHÔNG ĐƯỢC là điều kiện chặn nghiệm thu MVP Giai đoạn 1.

### Yêu cầu chức năng

- **FR-001**: Hệ thống PHẢI cho phép người dùng có quyền tạo sự kiện và ghi tên, ngày, địa điểm cùng các liên hệ liên quan.
- **FR-002**: Hệ thống PHẢI cho phép người dùng thêm liên hệ từ ảnh danh thiếp hoặc nhập thông tin thủ công.
- **FR-003**: Hệ thống PHẢI trích xuất các trường liên hệ được hỗ trợ và cho người dùng xem lại trước khi xác nhận hoặc đồng bộ.
- **FR-004**: Hệ thống PHẢI cho phép người dùng sửa, từ chối và đánh dấu giá trị trích xuất chưa chắc chắn, đồng thời lưu ảnh gốc và kết quả trích xuất khi được phép.
- **FR-005**: Hệ thống PHẢI hỗ trợ nhập liên hệ theo lô và giữ từng danh thiếp ở trạng thái riêng để người dùng xem xét.
- **FR-006**: Hệ thống PHẢI cho phép gắn ghi chú, nhu cầu, nhãn, bối cảnh cuộc gặp và hành động tiếp theo với liên hệ và sự kiện.
- **FR-007**: Hệ thống PHẢI nhận diện liên hệ và doanh nghiệp có khả năng trùng trước khi tạo hoặc đồng bộ hồ sơ mới, đồng thời cho phép người dùng xử lý kết quả khớp.
- **FR-008**: Hệ thống PHẢI quản lý hồ sơ liên hệ và doanh nghiệp với các thông tin định danh, liên lạc, hoạt động, sự kiện và quan hệ có cấu trúc.
- **FR-009**: Hệ thống PHẢI phân biệt thông tin do người dùng cung cấp, lấy từ bên ngoài, đã xác minh, suy luận, chưa chắc chắn hoặc không tìm thấy.
- **FR-010**: Với thông tin bên ngoài có sẵn, hệ thống PHẢI hiển thị nguồn và thời điểm truy xuất hoặc xác minh nếu có.
- **FR-011**: Hệ thống PHẢI trình bày đánh giá phù hợp và rủi ro kèm tiêu chí, bằng chứng hỗ trợ và khoảng trống bằng chứng quan trọng.
- **FR-012**: Hệ thống PHẢI đánh dấu là chưa xác minh hoặc không có dữ liệu đối với khẳng định thiếu căn cứ về pháp lý, thuế, tài chính, uy tín, sở hữu, năng lực nhà cung cấp, chứng nhận và chất lượng.
- **FR-013**: Hệ thống PHẢI cho phép người dùng tìm và lọc các liên hệ/doanh nghiệp mà họ được quyền xem theo định danh, tổ chức, sự kiện, nhãn, người phụ trách và giai đoạn quan hệ.
- **FR-014**: Hệ thống PHẢI cho phép nhóm cấu hình trường liên hệ, nhãn, tiêu chí đánh giá và giai đoạn quan hệ.
- **FR-015**: Hệ thống PHẢI cho phép người dùng tạo, xem, sửa, duyệt và theo dõi bản nháp tiếp nối cùng lời nhắc gắn với liên hệ.
- **FR-016**: Hệ thống PHẢI ngăn gửi tin nhắn hoặc đưa ra cam kết thương mại nếu chưa có phê duyệt rõ ràng của người dùng.
- **FR-017**: Hệ thống PHẢI ngăn ghi đè hồ sơ CRM hoặc hệ thống bên ngoài nếu chưa có phê duyệt rõ ràng, đồng thời báo kết quả đồng bộ.
- **FR-018**: Trong Giai đoạn 1, hệ thống PHẢI cho phép xuất liên hệ đã duyệt sang định dạng danh bạ hoặc bảng tính được cấu hình; đồng bộ CRM thuộc Giai đoạn 2.
- **FR-019**: Hệ thống PHẢI cho phép người dùng sourcing mô tả yêu cầu nhà cung cấp và xem ứng viên theo các yêu cầu đó.
- **FR-020**: Hệ thống PHẢI cho phép người dùng so sánh nhà cung cấp, lưu danh sách ngắn và ghi câu hỏi hoặc bằng chứng còn thiếu.
- **FR-021**: Hệ thống PHẢI cho phép chuẩn bị câu hỏi nhà cung cấp, yêu cầu báo giá và nội dung đàm phán; người dùng PHẢI duyệt trước khi sử dụng bên ngoài.
- **FR-022**: Trong Giai đoạn 3, hệ thống PHẢI hiển thị gợi ý quan hệ hoặc giới thiệu cùng bằng chứng hiện có và yêu cầu người dùng lựa chọn trước khi thực hiện giới thiệu.
- **FR-023**: Hệ thống PHẢI kiểm soát quyền truy cập theo tổ chức và vai trò đối với liên hệ, sự kiện, ghi chú, bản ghi âm và dữ liệu quan hệ doanh nghiệp.
- **FR-024**: Hệ thống PHẢI cho phép quản trị viên tổ chức cấu hình chính sách lưu giữ và xóa dữ liệu liên hệ, cuộc gặp áp dụng cho tổ chức.
- **FR-025**: Hệ thống PHẢI nêu rõ tích hợp hoặc phạm vi nguồn công khai nào không khả dụng và KHÔNG ĐƯỢC hàm ý rằng mọi nền tảng hoặc thị trường đều được hỗ trợ.
- **FR-026**: Hệ thống PHẢI hỗ trợ nhận dạng liên hệ đa ngôn ngữ theo cấu hình và cho người dùng biết các ngôn ngữ hiện được hỗ trợ.
- **FR-027**: Hệ thống PHẢI thông báo kết quả nhập và đồng bộ bị lỗi, một phần hoặc có xung đột.

### Thực thể chính *(nếu có dữ liệu)*

- **Liên hệ**: Cá nhân cùng thông tin định danh, liên lạc, nguồn, trạng thái xác minh, người phụ trách, nhãn và giai đoạn quan hệ.
- **Doanh nghiệp**: Đơn vị kinh doanh liên kết với các liên hệ, gồm định danh, thị trường, hoạt động, sản phẩm, bằng chứng công khai và trạng thái xác minh.
- **Sự kiện**: Hội nghị, hội chợ hoặc bối cảnh cuộc gặp có ngày, địa điểm, người tham dự và liên hệ liên quan.
- **Bản ghi cuộc gặp**: Ghi chú, nhu cầu, cơ hội, bản ghi âm hoặc bản chép lời nếu được phép, cùng bước tiếp theo.
- **Bằng chứng**: Nguồn do người dùng cung cấp hoặc nguồn bên ngoài, nội dung được hỗ trợ, vị trí nguồn, thời điểm truy xuất và trạng thái xác minh/độ tin cậy.
- **Đánh giá**: Kết quả đánh giá phù hợp, rủi ro, quan hệ hoặc nhà cung cấp gắn với tiêu chí, bằng chứng, khoảng trống và việc xem xét của người dùng.
- **Yêu cầu sourcing**: Nhu cầu sản phẩm và nhà cung cấp, thị trường mục tiêu, ứng viên, so sánh và danh sách ngắn.
- **Hành động tiếp nối**: Bản nháp, phê duyệt, lời nhắc, cập nhật giai đoạn quan hệ hoặc hành động bên ngoài gắn với liên hệ.
- **Thành viên tổ chức**: Người dùng, vai trò, phạm vi quyền truy cập và quyền sở hữu hồ sơ quan hệ dùng chung.

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo lường được

- **SC-001 [Giai đoạn 1]**: Trong đánh giá khả năng sử dụng, ít nhất 90% người tham gia có thể biến một danh thiếp thành liên hệ đã duyệt và gắn với sự kiện trong dưới 2 phút.
- **SC-002 [Giai đoạn 1]**: Trên bộ dữ liệu danh thiếp đại diện đã được gán nhãn bởi con người, ít nhất 90% trường tên, công ty, email và điện thoại đúng trước khi người dùng sửa; giá trị chưa chắc chắn được nhận diện rõ.
- **SC-003 [Giai đoạn 1]**: Ít nhất 95% bản ghi trùng được cài sẵn trong bộ đánh giá được cảnh báo trước khi đồng bộ; không tự động gộp chỉ dựa trên tên.
- **SC-004 [Giai đoạn 2]**: Với hồ sơ bổ sung thông tin được lấy mẫu, 100% khẳng định bên ngoài hiển thị kèm nguồn và thời điểm truy xuất nếu có, hoặc được đánh dấu rõ là thiếu thông tin đó.
- **SC-005 [Giai đoạn 1]**: 100% tin nhắn theo dõi và hành động thương mại trong đánh giá nghiệm thu phải có bước người dùng phê duyệt rõ ràng trước khi thực hiện.
- **SC-006 [Giai đoạn 1]**: Ít nhất 90% người tham gia đánh giá tác vụ có thể tìm một liên hệ cùng bối cảnh sự kiện trong 30 giây bằng chức năng tìm kiếm hoặc bộ lọc.
- **SC-007 [Giai đoạn 3]**: Ít nhất 90% người tham gia đánh giá sourcing có thể so sánh ba ứng viên và xác định khoảng trống bằng chứng của từng ứng viên trong 10 phút.
- **SC-008 [Giai đoạn 1]**: Mọi lần xuất dữ liệu trong đánh giá đều báo hoàn tất, thất bại, một phần hoặc có xung đột để người dùng đối soát toàn bộ bản ghi đã chọn.

## Giả định

- Bản phát hành đầu tiên là sản phẩm web tương thích nhiều kích thước màn hình dành cho nhóm doanh nghiệp; ứng dụng di động gốc nằm ngoài phạm vi ban đầu.
- Người dùng ban đầu gồm nhóm bán hàng B2B, tiếp thị sự kiện, lãnh đạo doanh nghiệp và nhóm sourcing trong một tổ chức.
- Việt Nam là thị trường ưu tiên cho giai đoạn đầu; nguồn dữ liệu công khai và quyền sử dụng phù hợp tại Việt Nam phải được xác nhận trước khi triển khai tính năng bổ sung dữ liệu ở Giai đoạn 2.
- Mục tiêu nhập ban đầu là một danh thiếp hoặc lô khoảng 5–10 danh thiếp, tùy giới hạn thiết bị và dịch vụ.
- Tiếng Việt và tiếng Anh là ngôn ngữ giao diện ban đầu; ngôn ngữ nhận dạng được cấu hình rõ ràng và có thể gồm tiếng Hàn, Nhật, Trung như trong đặc tả dự án.
- Quyền truy cập nguồn bên ngoài và tích hợp trực tiếp với mạng xã hội/tin nhắn phụ thuộc quốc gia, quyền tài khoản, API và điều khoản nền tảng. Kênh chưa hỗ trợ có thể dùng liên kết hồ sơ đã xác minh hoặc quy trình do người dùng thực hiện.
- Người dùng cung cấp dữ liệu liên hệ và bản ghi cuộc gặp theo cơ sở pháp lý phù hợp; mỗi tổ chức tự xác định chính sách lưu giữ và xóa dữ liệu.
- Các ngưỡng thành công bằng số là mục tiêu nghiệm thu ban đầu, cần được xác nhận với người dùng và bộ dữ liệu đại diện trước khi cam kết phát hành.
- Stack triển khai đã duyệt được ghi trong hiến chương dự án và sẽ được đưa vào kế hoạch triển khai, không phải đặc tả hướng tới người dùng này.

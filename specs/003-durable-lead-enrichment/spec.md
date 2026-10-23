# Đặc tả tính năng: Làm giàu dữ liệu lead bền vững (chạy nền, khôi phục được)

**Nhánh tính năng**: `003-durable-lead-enrichment`

**Ngày tạo**: 2026-10-23

**Trạng thái**: Đã qua vòng làm rõ (clarify) ngày 2026-10-23 và vòng sửa audit ngày 2026-10-23 — 2 điểm từng chờ làm rõ (`start-not-configured`, `run-ownership-enforcement`) đã được chốt tường minh trong văn bản này (xem mục "Quyết định đã chốt ở vòng sửa audit 2026-10-23"; FR-001 và FR-015 đã viết lại theo quyết định đó, không còn điểm chờ làm rõ nào). Xác nhận cuối của người dùng đối với 2 quyết định này là **cổng chặn merge cứng** ở task T014 — chưa có xác nhận ghi trong PR thì PR không được merge. Còn 1 quyết định sản phẩm để mở (xem mục "Quyết định để mở").

**Đầu vào**: Yêu cầu của người dùng ngày 2026-10-23 — biến luồng làm giàu dữ liệu lead (lead enrichment) hiện tại thành một luồng chạy nền bền vững: không mất kết quả khi tiến trình bị ngắt, tự thử lại khi một bước lỗi, và người dùng theo dõi được trạng thái từng lần chạy. Luồng làm giàu đồng bộ hiện tại được giữ nguyên làm phương án dự phòng.

## Tổng quan (What / Why)

### Vấn đề hiện tại

Hiện nay, khi người dùng khởi chạy làm giàu dữ liệu cho một lead (từ thông tin danh thiếp đã nhận dạng), toàn bộ quá trình chạy **đồng bộ trong một lần yêu cầu duy nhất**: người dùng phải chờ cho đến khi xong, và nếu tiến trình bị ngắt giữa chừng (sập tiến trình, hết thời gian chờ, triển khai lại hệ thống) thì **toàn bộ kết quả làm được bị mất**, không có cách tiếp tục từ chỗ dở dang, không tự thử lại bước bị lỗi, và người dùng không biết lần chạy đã đi tới đâu.

Làm giàu dữ liệu là luồng dài và dễ lỗi vặt (nhiều vòng tìm kiếm, tổng hợp, phụ thuộc dịch vụ ngoài), nên đây là điểm đau có thật và lặp lại: mỗi lần ngắt là một lần người dùng phải chạy lại từ đầu và chờ lại từ đầu.

### Giải pháp ở mức hành vi

Người dùng có thêm một cách khởi chạy làm giàu **ở chế độ nền bền vững**:

- Khởi chạy xong là nhận ngay một **mã lần chạy (run)** để theo dõi, không phải giữ kết nối chờ kết quả.
- Lần chạy được **lưu lại tiến độ bền vững**: nếu tiến trình bị ngắt, lần chạy **tự tiếp tục** khi hệ thống hoạt động trở lại mà người dùng không phải khởi chạy lại. Đơn vị bền vững nhỏ nhất trong v1 là **toàn bộ vòng lặp làm giàu** (xem "Làm rõ đã tự quyết" #2): phần việc đã hoàn thành và được ghi nhận thì không chạy lại; nếu ngắt xảy ra giữa vòng lặp, vòng lặp chạy lại từ đầu khi tiếp tục — an toàn vì vòng lặp chỉ đọc và gợi ý, không ghi dữ liệu.
- Bước nào lỗi tạm thời sẽ được **tự thử lại**; chỉ khi thử lại vẫn thất bại thì lần chạy mới kết thúc ở trạng thái lỗi, kèm thông tin lỗi để người dùng biết.
- Người dùng **tra cứu được trạng thái** của lần chạy bất cứ lúc nào (đang chạy / đã xong / lỗi) và nhận **đúng kết quả làm giàu như luồng hiện tại** khi lần chạy hoàn thành.
- Cách chạy đồng bộ hiện tại **vẫn tồn tại nguyên vẹn** làm phương án dự phòng.

### Nguyên tắc bất biến

Tuân hiến chương "AI chỉ gợi ý — người quyết định": kết quả làm giàu vẫn chỉ là **gợi ý kèm độ tin cậy (confidence) và nguồn**. Luồng chạy nền **tuyệt đối không tự ghi đè, không tự cập nhật dữ liệu liên hệ (contact)** từ kết quả làm giàu. Chỉ khi người dùng xem xét và tự bấm **Áp dụng** trên giao diện thì dữ liệu mới thay đổi — giữ nguyên như hành vi hiện tại.

## Câu chuyện người dùng (User Stories)

### Câu chuyện 1 — Khởi chạy làm giàu ở chế độ nền và nhận mã lần chạy (Ưu tiên: P1)

Là **người dùng đã đăng nhập** đang ở màn hình làm giàu dữ liệu lead, tôi muốn **khởi chạy làm giàu ở chế độ nền và nhận ngay một mã lần chạy** để **không phải giữ màn hình/kết nối chờ quá trình dài hoàn tất mới làm việc khác được**.

**Lý do ưu tiên**: Đây là thay đổi hành vi cốt lõi của tính năng — tách việc khởi chạy khỏi việc chờ kết quả.

**Kiểm thử độc lập**: Đăng nhập, mở màn hình làm giàu của một lead đã có dữ liệu danh thiếp đã nhận dạng, bấm khởi chạy chế độ nền — hệ thống phản hồi ngay kèm mã lần chạy, quá trình làm giàu vẫn tiếp diễn sau đó.

**Kịch bản chấp nhận**:

1. **Cho trước** người dùng đã đăng nhập và một lead có dữ liệu đầu vào làm giàu hợp lệ, **khi** người dùng khởi chạy ở chế độ nền, **thì** hệ thống phản hồi ngay (không chờ quá trình làm giàu kết thúc) kèm một mã lần chạy duy nhất.
2. **Cho trước** người dùng **chưa đăng nhập**, **khi** gửi yêu cầu khởi chạy chế độ nền, **thì** hệ thống từ chối với lỗi chưa xác thực (401) và không tạo lần chạy nào.
3. **Cho trước** một lần chạy đã được khởi tạo, **khi** người dùng khởi chạy thêm một lần nữa cho cùng lead, **thì** hệ thống tạo một lần chạy mới với mã khác — các lần chạy không ghi đè lẫn nhau.

### Câu chuyện 2 — Theo dõi trạng thái và nhận kết quả của lần chạy (Ưu tiên: P1)

Là **người dùng đã đăng nhập**, tôi muốn **tra cứu trạng thái của một lần chạy bằng mã lần chạy và nhận kết quả làm giàu khi lần chạy hoàn thành** để **biết quá trình đang ở đâu và dùng được kết quả mà không phải chạy lại**.

**Lý do ưu tiên**: Không có tra cứu trạng thái/kết quả thì mã lần chạy vô nghĩa; đây là nửa còn lại của vòng đời tối thiểu.

**Kiểm thử độc lập**: Khởi chạy một lần chạy nền, tra cứu lặp lại cho đến khi hoàn thành — trạng thái chuyển từ đang chạy sang hoàn thành và kết quả trả về có cùng cấu trúc (phát hiện kèm độ tin cậy và nguồn, các bước, model đã dùng) với kết quả của cách chạy đồng bộ.

**Kịch bản chấp nhận**:

1. **Cho trước** một lần chạy đang thực thi, **khi** người dùng tra cứu, **thì** hệ thống trả trạng thái đang chạy và chưa trả kết quả cuối.
2. **Cho trước** một lần chạy đã hoàn thành, **khi** người dùng tra cứu, **thì** hệ thống trả trạng thái hoàn thành kèm toàn bộ kết quả làm giàu (các phát hiện kèm độ tin cậy và nguồn — cùng định dạng kết quả với luồng hiện tại).
3. **Cho trước** một lần chạy đã thất bại sau khi thử lại, **khi** người dùng tra cứu, **thì** hệ thống trả trạng thái lỗi kèm thông tin mô tả lỗi.
4. **Cho trước** người dùng **chưa đăng nhập**, **khi** tra cứu bất kỳ mã lần chạy nào, **thì** hệ thống từ chối với lỗi chưa xác thực (401).
5. **Cho trước** một mã lần chạy không tồn tại, **khi** người dùng tra cứu, **thì** hệ thống báo không tìm thấy một cách rõ ràng, không trả dữ liệu của lần chạy khác.

### Câu chuyện 3 — Lần chạy tự khôi phục sau khi tiến trình bị ngắt (Ưu tiên: P1)

Là **người dùng**, tôi muốn **lần chạy làm giàu tự tiếp tục từ chỗ dở dang khi hệ thống bị ngắt giữa chừng** để **không mất công sức đã làm và không phải khởi chạy lại từ đầu**.

**Lý do ưu tiên**: Đây là lý do tồn tại của tính năng — độ bền. Không có khôi phục thì tính năng chỉ là chạy nền thông thường.

**Kiểm thử độc lập**: Khởi chạy một lần chạy, cố ý dừng tiến trình hệ thống giữa quá trình, khởi động lại — lần chạy tự tiếp tục và hoàn thành mà người dùng không phải khởi chạy lại; một lần chạy đã hoàn thành thì không bao giờ bị thực thi lại.

**Kịch bản chấp nhận**:

1. **Cho trước** một lần chạy đang thực thi dở dang, **khi** tiến trình hệ thống bị dừng đột ngột rồi khởi động lại, **thì** lần chạy tự tiếp tục và đi đến trạng thái hoàn thành mà không cần người dùng khởi chạy lại.
2. **Cho trước** một lần chạy bị ngắt giữa vòng lặp làm giàu, **khi** lần chạy tiếp tục, **thì** vòng lặp được phép chạy lại từ đầu (đây là đơn vị bền vững nhỏ nhất của v1 — các vòng lặp nội bộ của quá trình làm giàu không phải điểm ghi nhận tiến độ riêng), và việc chạy lại này không gây tác dụng phụ: không ghi dữ liệu, không tạo kết quả trùng lặp được lưu trữ.
3. **Cho trước** một lần chạy đã hoàn thành, **thì** kết quả của nó được giữ nguyên và tra cứu lại được; hệ thống không thực thi lại nó.

### Câu chuyện 4 — Bước lỗi tạm thời được tự thử lại (Ưu tiên: P2)

Là **người dùng**, tôi muốn **bước làm giàu gặp lỗi tạm thời (ví dụ dịch vụ ngoài chập chờn) được tự thử lại** để **một lỗi thoáng qua không làm hỏng cả lần chạy dài**.

**Lý do ưu tiên**: Tăng tỷ lệ hoàn thành thực tế của các lần chạy dài; xếp sau khôi phục vì khôi phục là nền tảng.

**Kiểm thử độc lập**: Gây lỗi tạm thời cho một bước trong lần chạy (lỗi ở lần thử đầu, thành công ở lần thử sau) — lần chạy vẫn hoàn thành; gây lỗi vĩnh viễn — lần chạy kết thúc ở trạng thái lỗi sau số lần thử lại giới hạn.

**Kịch bản chấp nhận**:

1. **Cho trước** một bước bị lỗi tạm thời rồi hết lỗi, **khi** bước đó được tự thử lại, **thì** lần chạy tiếp tục bình thường và hoàn thành.
2. **Cho trước** một bước lỗi liên tục, **khi** đã hết số lần thử lại cho phép, **thì** lần chạy dừng ở trạng thái lỗi (không treo vô hạn, không thử lại mãi) và thông tin lỗi tra cứu được theo Câu chuyện 2.

### Câu chuyện 5 — Kết quả chỉ là gợi ý, người dùng tự áp dụng (Ưu tiên: P1)

Là **người dùng**, tôi muốn **kết quả làm giàu từ lần chạy nền chỉ hiển thị dưới dạng gợi ý kèm độ tin cậy và nguồn như hiện tại, và dữ liệu liên hệ chỉ thay đổi khi tôi tự bấm Áp dụng** để **luôn giữ quyền quyết định cuối cùng về dữ liệu của mình**.

**Lý do ưu tiên**: Nguyên tắc hiến chương bất biến; mọi thay đổi về cách chạy không được phép thay đổi quyền quyết định này.

**Kiểm thử độc lập**: Để một lần chạy nền hoàn thành, kiểm tra dữ liệu liên hệ trước và sau khi hoàn thành (chưa bấm Áp dụng) — không trường nào thay đổi; sau khi bấm Áp dụng — chỉ các trường người dùng đã chọn mới thay đổi.

**Kịch bản chấp nhận**:

1. **Cho trước** một lần chạy nền đã hoàn thành với các phát hiện mới, **khi** người dùng chưa bấm Áp dụng, **thì** dữ liệu liên hệ hiện tại hoàn toàn không thay đổi.
2. **Cho trước** kết quả làm giàu hiển thị cho người dùng, **thì** mỗi phát hiện đều kèm độ tin cậy và nguồn như luồng hiện tại.

### Câu chuyện 6 — Cách chạy đồng bộ hiện tại vẫn hoạt động (Ưu tiên: P1)

Là **người dùng**, tôi muốn **cách khởi chạy làm giàu đồng bộ hiện tại vẫn dùng được như trước** để **có phương án dự phòng khi chế độ nền gặp sự cố và không bị gián đoạn công việc trong giai đoạn chuyển đổi**.

**Kiểm thử độc lập**: Khởi chạy làm giàu theo cách đồng bộ hiện tại trên cùng dữ liệu — nhận kết quả đầy đủ như trước khi có tính năng này.

**Kịch bản chấp nhận**:

1. **Cho trước** tính năng chạy nền đã được đưa vào, **khi** người dùng khởi chạy theo cách đồng bộ hiện tại, **thì** hành vi và kết quả không thay đổi so với trước.

### Câu chuyện 7 — Điểm chạm giao diện tối thiểu để dùng chế độ nền (Ưu tiên: P2)

Là **người dùng**, tôi muốn **ngay tại màn hình làm giàu hiện có, có cách khởi chạy chế độ nền và thấy được trạng thái lần chạy của mình** để **dùng được tính năng mới mà không phải học một màn hình hoàn toàn mới**.

**Ghi chú phạm vi**: Đây là điểm chạm tối thiểu. Nếu khi lập kế hoạch, phần giao diện được đánh giá là rủi ro cao hoặc phình phạm vi, phần này được phép tách thành một follow-up riêng — phần lõi chạy nền (Câu chuyện 1–6) không phụ thuộc vào nó để nghiệm thu.

**Kịch bản chấp nhận**:

1. **Cho trước** người dùng đang ở màn hình làm giàu hiện có, **khi** khởi chạy chế độ nền từ màn hình này, **thì** giao diện hiển thị mã/trạng thái lần chạy và tự cập nhật trạng thái cho đến khi hoàn thành hoặc lỗi.
2. **Cho trước** lần chạy đã hoàn thành, **khi** kết quả hiển thị trên giao diện, **thì** người dùng vẫn thao tác Áp dụng gợi ý theo đúng cách hiện tại.

## Yêu cầu chức năng

- **FR-001**: Hệ thống PHẢI cho phép người dùng đã đăng nhập khởi chạy làm giàu dữ liệu lead ở chế độ nền, tách khỏi việc chờ kết quả. Dữ liệu đầu vào không hợp lệ PHẢI bị từ chối ngay tại thời điểm khởi chạy với cùng nhóm lỗi như cách chạy đồng bộ (yêu cầu không phải JSON, thiếu dữ liệu, bản ghi không tồn tại, dữ liệu đã lưu không dùng được) và không tạo lần chạy nào. **Đã chốt (vòng sửa audit 2026-10-23, thay điểm chờ làm rõ cũ `start-not-configured`)**: nếu tính năng làm giàu chưa được cấu hình, việc khởi chạy PHẢI bị từ chối **ngay tại thời điểm khởi chạy** với lỗi chưa cấu hình (503) và **không tạo lần chạy nào** — không tạo lần chạy rồi để lần chạy tự lỗi sau đó.
- **FR-002**: Khi khởi chạy chế độ nền thành công, hệ thống PHẢI phản hồi ngay kèm một mã lần chạy duy nhất cho mỗi lần chạy.
- **FR-003**: Hệ thống PHẢI từ chối yêu cầu khởi chạy và tra cứu khi chưa xác thực, trả lỗi 401, và không tạo/không lộ dữ liệu lần chạy nào trong trường hợp đó.
- **FR-004**: Hệ thống PHẢI lưu tiến độ của lần chạy đủ bền để biết lần chạy đã hoàn thành hay chưa và khôi phục được sau khi tiến trình bị ngắt. Trong v1, đơn vị ghi nhận tiến độ là toàn bộ vòng lặp làm giàu (một đơn vị duy nhất) — các vòng lặp/bước nội bộ bên trong quá trình làm giàu không phải điểm ghi nhận riêng.
- **FR-005**: Khi tiến trình hệ thống bị ngắt và hoạt động trở lại, lần chạy dở dang PHẢI tự tiếp tục mà không cần người dùng khởi chạy lại; phần việc đã được ghi nhận hoàn thành KHÔNG bị thực thi lại. Nếu lần chạy bị ngắt giữa vòng lặp làm giàu, vòng lặp được phép chạy lại từ đầu khi tiếp tục (an toàn vì vòng lặp không ghi dữ liệu — xem FR-012).
- **FR-006**: Công việc gặp lỗi tạm thời PHẢI được tự thử lại với số lần giới hạn; khi hết số lần thử lại, lần chạy PHẢI chuyển sang trạng thái lỗi thay vì treo hoặc thử lại vô hạn. Các lỗi không thể tự khỏi bằng cách thử lại (ví dụ tính năng chưa được cấu hình) PHẢI kết thúc ở trạng thái lỗi ngay, không đốt số lần thử lại.
- **FR-007**: Hệ thống PHẢI cho phép người dùng đã đăng nhập tra cứu trạng thái của một lần chạy bằng mã lần chạy, với các trạng thái phân biệt rõ: đang chạy, hoàn thành, lỗi. Mọi trạng thái chưa kết thúc (đang chờ, đang chạy, đang tiếp tục sau ngắt) đều được báo là "đang chạy".
- **FR-008**: Khi lần chạy hoàn thành, việc tra cứu PHẢI trả kèm toàn bộ kết quả làm giàu với cùng cấu trúc như phản hồi của cách chạy đồng bộ: danh sách phát hiện (mỗi phát hiện kèm trường, giá trị, độ tin cậy và nguồn), các bước đã thực hiện và model đã dùng. Nội dung phát hiện là kết quả của mô hình ngôn ngữ nên KHÔNG yêu cầu trùng khớp từng phát hiện giữa hai lần chạy khác nhau trên cùng đầu vào.
- **FR-009**: Khi lần chạy ở trạng thái lỗi, việc tra cứu PHẢI trả kèm thông tin mô tả lỗi đủ để người dùng hiểu lần chạy đã hỏng ở đâu.
- **FR-010**: Tra cứu mã lần chạy không tồn tại PHẢI trả về thông báo không tìm thấy rõ ràng.
- **FR-011**: Logic làm giàu dữ liệu hiện tại (cách tìm kiếm, tổng hợp, chấm độ tin cậy, định dạng kết quả) PHẢI được tái sử dụng nguyên vẹn cho chế độ nền — tính năng này không thay đổi nghiệp vụ làm giàu, chỉ thay đổi cách thực thi.
- **FR-012**: Kết quả làm giàu PHẢI chỉ đóng vai trò gợi ý: hệ thống TUYỆT ĐỐI KHÔNG tự ghi đè hay tự cập nhật dữ liệu liên hệ từ kết quả làm giàu ở bất kỳ chế độ chạy nào; dữ liệu chỉ thay đổi khi người dùng tự bấm Áp dụng.
- **FR-013**: Cách khởi chạy làm giàu đồng bộ hiện tại PHẢI được giữ nguyên vẹn (hành vi, yêu cầu xác thực, định dạng kết quả) làm phương án dự phòng.
- **FR-014**: Dữ liệu đầu vào của một lần chạy nền PHẢI là dữ liệu đã được ghi nhận tại thời điểm khởi chạy (thông tin danh thiếp đã nhận dạng và định danh người dùng sở hữu) — lần chạy không phụ thuộc vào trạng thái phiên làm việc hay kết nối của người dùng sau đó. Hợp đồng đầu vào của yêu cầu khởi chạy gương đúng cách chạy đồng bộ hiện tại: chấp nhận dữ liệu danh thiếp gửi kèm trực tiếp, hoặc một mã bản ghi quét danh thiếp thuộc về đúng người dùng để hệ thống tự đọc dữ liệu đã lưu. Trường hợp dùng mã bản ghi, việc đọc và chốt dữ liệu đầu vào PHẢI hoàn thành ngay tại thời điểm khởi chạy (kèm đúng các lỗi hiện tại: không tìm thấy bản ghi, dữ liệu đã lưu không dùng được), và lần chạy dùng bản chốt đó — thay đổi về sau của bản ghi gốc không ảnh hưởng lần chạy đang thực thi.
- **FR-015**: Nguyên tắc đích: mỗi lần chạy gắn với đúng người dùng đã khởi chạy; hệ thống không được để lộ trạng thái hay kết quả của lần chạy cho người dùng khác. **Ngoại lệ v1 tường minh — đã chốt theo phương án (a) ở vòng sửa audit 2026-10-23 (thay điểm chờ làm rõ cũ `run-ownership-enforcement`)**: hệ thống hiện là **đơn người dùng (single-user)** nên ở v1 yêu cầu này được thực thi ở mức: (i) chỉ người dùng **đã đăng nhập** mới tra cứu được lần chạy (chưa đăng nhập → 401, FR-003), và (ii) mã lần chạy là định danh **khó đoán** do hệ thống sinh, không hiển thị cho bên thứ ba. v1 **không** lưu quan hệ sở hữu lần chạy → người dùng và **không** kiểm tra sở hữu theo từng lần chạy; hệ quả được chấp nhận tường minh ở v1: một tài khoản đã đăng nhập khác, nếu biết mã lần chạy, có thể tra cứu được lần chạy đó — rủi ro này chỉ chấp nhận được vì triển khai hiện tại là single-user. **Điều kiện bắt buộc khi hệ thống chuyển sang đa người dùng** (ngoài phạm vi v1): PHẢI lưu quan hệ lần chạy → người dùng tại thời điểm khởi chạy, PHẢI kiểm tra sở hữu khi tra cứu (lệch sở hữu → không tìm thấy/không có quyền, 404/403) và PHẢI có kiểm thử chéo 2 tài khoản trước khi mở đa người dùng. Ngoại lệ v1 này không làm yếu FR-003 (401 khi chưa đăng nhập) và FR-010 (404 khi mã không tồn tại).
- **FR-016**: Tại màn hình làm giàu hiện có, giao diện PHẢI (hoặc theo follow-up tách riêng nếu được tách theo Câu chuyện 7) cung cấp thao tác khởi chạy chế độ nền và hiển thị trạng thái lần chạy cập nhật cho đến khi kết thúc.

## Tiêu chí nghiệm thu (đo được)

- **AC-001 — Khởi chạy nền phản hồi ngay**: Với một lead hợp lệ, yêu cầu khởi chạy chế độ nền trả về mã lần chạy trong khi quá trình làm giàu chưa hoàn thành (phản hồi không chờ toàn bộ quá trình).
- **AC-002 — Chưa đăng nhập bị từ chối**: Gửi yêu cầu khởi chạy và yêu cầu tra cứu mà không có phiên đăng nhập — cả hai đều nhận 401.
- **AC-003 — Khôi phục sau khi bị giết giữa chừng**: Khởi chạy một lần chạy, dừng đột ngột tiến trình hệ thống trong lúc lần chạy đang dở, khởi động lại — lần chạy tự hoàn thành sau đó mà không cần khởi chạy lại (kiểm chứng qua việc tra cứu trạng thái chuyển sang hoàn thành và kết quả đầy đủ). Vòng lặp làm giàu được phép chạy lại từ đầu sau khi khôi phục (đơn vị bền vững của v1 — xem FR-004); tiêu chí này KHÔNG yêu cầu chứng minh từng bước nội bộ của vòng lặp không chạy lại.
- **AC-004 — Lỗi được thử lại**: Khi công việc làm giàu bị ép lỗi tạm thời ở lần thử đầu và thành công ở lần thử sau, lần chạy vẫn hoàn thành; khi bị ép lỗi vĩnh viễn, lần chạy kết thúc ở trạng thái lỗi sau số lần thử lại giới hạn (không treo quá thời gian chờ kiểm thử). Việc ép lỗi PHẢI dùng **cơ chế xác định theo bộ đếm số lần thử** đã định nghĩa ở kế hoạch thực thi (ép lỗi đúng N lần đầu rồi thành công; lỗi vĩnh viễn = ép lỗi mọi lần; lỗi chưa cấu hình trong lần chạy = khởi chạy trực tiếp bỏ qua cổng kiểm tra ở bước khởi chạy để lỗi rơi xác định vào trong bước thực thi) — **không chấp nhận** cách đổi cấu hình giữa chừng theo thời gian (đua với lịch thử lại). Bằng chứng chấp nhận được: số lần thực thi bước thực thi ghi trong log/observability khớp kỳ vọng của từng kịch bản (tạm thời: >1 lần và hoàn thành; vĩnh viễn: đúng số lần thử tối đa = 4 lần thực thi bước thực thi, gồm 1 lần đầu + tối đa 3 lần thử lại theo mặc định của SDK 5.2.3 — quyết định diễn giải ở plan §8.1; chưa cấu hình: đúng 1 lần, không thử lại).
- **AC-005 — Tra cứu trạng thái và kết quả**: Tra cứu lần lượt cho kết quả: đang chạy → (sau khi xong) hoàn thành kèm kết quả đầy đủ; kết quả này có cùng cấu trúc với kết quả chạy đồng bộ (danh sách phát hiện — mỗi phát hiện có trường, giá trị, độ tin cậy, nguồn — kèm các bước và model đã dùng). KHÔNG so sánh trùng khớp nội dung phát hiện giữa hai lần chạy vì kết quả mô hình không xác định.
- **AC-006 — Lộ trình cũ không hồi quy**: Cách chạy đồng bộ hiện tại vẫn trả kết quả thành công trên cùng dữ liệu kiểm thử như trước khi có tính năng.
- **AC-007 — Không tự ghi đè dữ liệu**: Sau khi một lần chạy nền hoàn thành (chưa bấm Áp dụng), toàn bộ dữ liệu hiện có liên quan (các trường trên form xem lại danh thiếp / bản ghi liên hệ nếu đã lưu) không đổi so với trước khi chạy; sau khi bấm Áp dụng, chỉ các trường được chọn mới đổi.
- **AC-008 — Mã không tồn tại**: Tra cứu một mã lần chạy không có thật trả về thông báo không tìm thấy, không trả nhầm dữ liệu.
- **AC-009 — Chất lượng bản dựng**: Toàn bộ kiểm tra chất lượng hiện hành của dự án (kiểm tra kiểu dữ liệu và bản dựng hoàn chỉnh) đều đạt sau khi tính năng được đưa vào — chi tiết công cụ và lệnh thuộc về kế hoạch thực thi.
- **AC-010 — Giao diện tối thiểu (nếu không tách follow-up)**: Từ màn hình làm giàu hiện có, người dùng khởi chạy được chế độ nền và thấy trạng thái cập nhật đến khi hoàn thành/lỗi mà không cần tải lại trang thủ công.

## Làm rõ đã tự quyết (vòng clarify 2026-10-23)

Các điểm dưới đây đã được quyết thẳng từ mã nguồn hiện tại và bối cảnh đã chốt — không cần hỏi lại:

1. **Hợp đồng đầu vào của khởi chạy nền gương cách chạy đồng bộ** (route làm giàu hiện tại): chấp nhận dữ liệu danh thiếp gửi kèm trực tiếp (kèm bí danh hiện có) hoặc mã bản ghi quét danh thiếp của đúng người dùng; lỗi đầu vào (400/404/422 theo nhóm lỗi hiện tại) trả ngay khi khởi chạy, không tạo lần chạy. Việc chốt dữ liệu từ bản ghi xảy ra tại thời điểm khởi chạy (FR-014).
2. **Đơn vị bền vững của v1 là toàn bộ vòng lặp làm giàu**: bối cảnh đã chốt việc chạy nền bọc nguyên vòng lặp làm giàu hiện có trong một đơn vị thực thi bền vững duy nhất, không tách nhỏ và không viết lại logic bên trong. Hệ quả: "không chạy lại phần đã xong" áp dụng ở mức đơn vị này và ở mức lần chạy đã hoàn thành; bị ngắt giữa vòng lặp thì vòng lặp chạy lại từ đầu — an toàn vì vòng lặp chỉ đọc/gợi ý, không ghi dữ liệu (FR-004, FR-005, AC-003).
3. **Tương đương kết quả = tương đương cấu trúc, không phải nội dung**: kết quả làm giàu do mô hình ngôn ngữ sinh ra, hai lần chạy trên cùng đầu vào không cho cùng phát hiện. AC-005 chỉ kiểm chứng cấu trúc và nghiệp vụ hiển thị (phát hiện + độ tin cậy + nguồn, bước, model).
4. **Lỗi cấu hình kết thúc ngay**: lỗi "tính năng chưa được cấu hình" không thể tự khỏi bằng thử lại nên thuộc nhóm lỗi kết thúc ngay (FR-006) khi lỗi này phát sinh trong lúc lần chạy đã bắt đầu. Trường hợp phát hiện ngay lúc khởi chạy đã chốt tại FR-001: từ chối ngay khi khởi chạy (503), không tạo lần chạy.
5. **Trạng thái chưa kết thúc gộp là "đang chạy"** (FR-007); huỷ lần chạy vẫn ngoài phạm vi nên không có trạng thái huỷ trong v1.
6. **Phần giao diện (Câu chuyện 7) tách hay gộp do giai đoạn lập kế hoạch quyết** theo đánh giá rủi ro, như spec đã ghi — nghiệm thu phần lõi (Câu chuyện 1–6) không phụ thuộc vào nó.
7. **Khởi chạy khi chưa cấu hình: từ chối ngay (503), không tạo lần chạy** — đã chốt tại FR-001 ở vòng sửa audit 2026-10-23 (xem mục quyết định đã chốt bên dưới).
8. **Sở hữu lần chạy ở v1: ngoại lệ single-user tường minh (phương án a)** — đã chốt tại FR-015 ở vòng sửa audit 2026-10-23: v1 chỉ yêu cầu đã đăng nhập + mã lần chạy khó đoán, không lưu/không kiểm tra quan hệ sở hữu theo từng lần chạy; kiểm tra sở hữu đầy đủ là điều kiện bắt buộc trước khi mở đa người dùng.

## Quyết định đã chốt ở vòng sửa audit 2026-10-23

Hai điểm từng chờ làm rõ đã được chốt như sau và đã ghi vào FR tương ứng — không còn câu hỏi chờ quyết nào trong văn bản này:

1. **start-not-configured (FR-001) — CHỐT**: khởi chạy kiểm tra cấu hình đồng bộ trước khi tạo lần chạy; chưa cấu hình → 503 `enrichment_not_configured`, không tạo lần chạy nào.
2. **run-ownership-enforcement (FR-015) — CHỐT theo phương án (a)**: sửa spec thành ngoại lệ v1 tường minh cho hệ single-user (chỉ yêu cầu đã đăng nhập + mã lần chạy khó đoán; không lưu/không kiểm tra sở hữu theo từng lần chạy ở v1), kèm điều kiện bắt buộc bổ sung kiểm tra sở hữu đầy đủ (lưu quan hệ lần chạy → người dùng, tra cứu lệch sở hữu → 404/403, kiểm thử chéo 2 tài khoản) trước khi mở đa người dùng. Phương án (b) — bổ sung cơ chế sở hữu ngay trong v1 — không được chọn cho v1.

**Cổng chặn merge**: 2 quyết định trên chỉ có hiệu lực khi người dùng xác nhận cuối trong PR của tính năng (task T014 là cổng cứng: chưa có xác nhận ghi rõ trong PR thì PR phải giữ ở trạng thái chưa sẵn sàng và không được merge). Nếu người dùng bác một quyết định tại cổng đó, đội dev PHẢI sửa lại spec/plan/tasks/data-model/contract cho nhất quán theo quyết định mới trước khi tiếp tục code phần liên quan (đặc biệt: bác phương án (a) của FR-015 thì phải chuyển sang phương án (b) trước khi code route tra cứu).

## Quyết định để mở

- **QĐ-MỞ-001 — Môi trường vận hành bền vững cho production**: Ở môi trường phát triển (dev), chế độ nền chạy với cấu hình mặc định không cần thiết lập thêm. Khi đưa lên production, nơi lưu trữ tiến độ và điều phối các lần chạy sẽ dùng hạ tầng được quản lý sẵn của nền tảng triển khai, hay hạ tầng tự vận hành trên cơ sở dữ liệu sẵn có của hệ thống? Đây là **quyết định để mở**, chưa chốt trong phiên bản đầu (v1) — v1 chỉ cam kết hành vi ở các FR/AC trên và không khoá người dùng vào một lựa chọn production nào.

## Ngoài phạm vi (Out of Scope)

- Thay đổi nghiệp vụ làm giàu dữ liệu: thuật toán tìm kiếm/tổng hợp, cách chấm độ tin cậy, nguồn dữ liệu, định dạng kết quả — tất cả giữ nguyên như hiện tại.
- Tự động áp dụng kết quả làm giàu vào dữ liệu liên hệ dưới bất kỳ hình thức nào (kể cả áp dụng một phần, áp dụng theo ngưỡng độ tin cậy).
- Làm giàu hàng loạt nhiều lead trong một lần chạy (batch) — v1 chỉ xử lý từng lead như luồng hiện tại.
- Lên lịch làm giàu định kỳ/tự động (theo giờ, theo sự kiện) — v1 chỉ có khởi chạy thủ công bởi người dùng.
- Chờ sự kiện bên ngoài hay chờ người duyệt giữa quá trình làm giàu (tạm dừng nhiều giờ/ngày để chờ phản hồi) — v1 không có bước chờ nào ngoài thời gian thực thi thông thường.
- Huỷ một lần chạy đang thực thi theo yêu cầu người dùng.
- Thông báo đẩy (email/push) khi lần chạy hoàn thành — v1 chỉ có tra cứu trạng thái chủ động.
- Giao diện quản trị/quan sát tập trung cho toàn bộ các lần chạy (danh sách, thống kê, lọc) — ngoài điểm chạm tối thiểu ở Câu chuyện 7.
- Chốt hạ tầng production cho chế độ nền (xem QĐ-MỞ-001) và mọi cam kết về quy mô tải đồng thời lớn.
- Áp dụng cơ chế chạy nền bền vững cho các luồng khác (ví dụ nhập liệu hàng loạt, xử lý tài liệu) — mỗi luồng là một đặc tả riêng.
- Xoá hay thay thế cách chạy đồng bộ hiện tại.

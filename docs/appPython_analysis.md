# Phân Tích Toàn Diện Kiến Trúc appPython

Ứng dụng **appPython** (Flashcard AI — PNG to Quizlet) là phiên bản desktop nguyên bản được viết bằng Python (sử dụng thư viện giao diện `customtkinter`). Ứng dụng này đảm nhiệm việc quản lý thẻ học thuật, ôn tập (Flashcard/Quiz) và đặc biệt là tính năng cốt lõi: **Quét ảnh (AI Scan) để tự động tạo Flashcard**.

Dưới đây là bản phân tích toàn diện về kiến trúc hệ thống, tập trung vào cách ứng dụng giao tiếp với API Gemini và các phương hướng cải thiện xử lý lỗi (Fail Pack).

---

## 1. Cấu trúc và Luồng Hoạt Động Của appPython

Toàn bộ ứng dụng được tổ chức theo mô hình Modular khá rõ ràng:

- **`app.py`**: Entry point chính, khởi tạo cửa sổ ứng dụng và chứa danh sách các màn hình (ScanFrame, HomeFrame, DeckFrame, StudyFrame, QuizFrame).
- **`ui/`**: Chứa toàn bộ logic render giao diện.
  - `screens/`: Các màn hình tính năng lớn.
  - `dialogs/`: Các popup modal nhập liệu phụ trợ (nhập API key, cài đặt, v.v.).
  - `background_scan.py`: Một hệ thống Worker Thread chạy ngầm giúp UI không bị đơ trong quá trình quét ảnh.
- **`services/`**: Chứa logic nghiệp vụ tương tác với bên ngoài. Trong đó nổi bật nhất là:
  - `gemini_service.py`: Chịu trách nhiệm tương tác trực tiếp với API của Google Gemini.
  - `storage_service.py`: Load/Save JSON (decks, settings).
- **`models/`**: Cấu trúc dữ liệu thẻ (Deck, Flashcard).

---

## 2. Cách appPython Gửi Yêu Cầu Tới API Gemini

Luồng gửi ảnh tới AI của Python được tối ưu theo dạng **PDF Batch Processing** (Gộp ảnh thành file PDF để gửi 1 lần) thay vì gửi từng ảnh rời rạc. File đảm nhiệm chính việc này là `appPython/services/gemini_service.py`.

### 2.1. Đóng gói payload:
1. Khi có 1 thư mục ảnh, thay vì gửi từng ảnh tốn Request (dễ dính Rate Limit 15 RPM), hàm `images_to_pdf()` (dùng thư viện `PIL`) sẽ **gộp các ảnh lại thành 1 file PDF ảo** trên RAM (`io.BytesIO`).
2. Kích thước Pack (Batch Size) mặc định cấu hình là gom N ảnh thành 1 file PDF (ví dụ: 30-50 ảnh).

### 2.2. Gửi request thông qua SDK `google.generativeai`:
1. Sử dụng trực tiếp bộ thư viện `google.generativeai` thay vì gọi REST API thuần.
2. Phương thức được sử dụng là `client.models.generate_content(...)`.
3. Input bao gồm:
   - File PDF được nhúng theo định dạng nhị phân: `types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")`.
   - Chuỗi lệnh Prompts (`PDF_BATCH_PROMPT`): Yêu cầu AI quét từng trang, trả về đúng định dạng JSON Array chứa danh sách thẻ flashcard tương ứng với trang đó.

### 2.3. Cơ chế Kháng Lỗi Hiện Tại (Retry Logic & Fallback)
Khi gọi `client.models.generate_content()`, nếu có lỗi trả về, hệ thống `gemini_service.py` xử lý qua hàm `_handle_error_with_log()` với các kịch bản:

- **Rate Limit (429 Quota/Rate)**: Tự động đổi sang **API Key** tiếp theo trong danh sách và ngủ (thường từ 60-120s) rồi thử lại.
- **Model Not Found (404/Preview)**: Do Google hay deprecate (khai tử) các model preview cũ, hệ thống có một danh sách mảng fallback `MODEL_LIST`. Tự động rớt xuống model cũ hơn mà ổn định.
- **Server Error (500/503)**: Ngủ 5 giây và thử lại với Key cũ.
- Mỗi Pack cố gắng lặp lại tối đa (thường là 5 lần). Nếu thất bại, Pack đó bị lỗi hẳn, kết quả trả về là một chuỗi mảng rỗng (`[]` hoặc danh sách các giá trị `None`).

---

## 3. Các Cách Cải Thiện Ứng Phó Khi API Trả Lỗi Pack (Fail Pack)

Thực tế quá trình sử dụng cho thấy, khi AI Scan bị "đứt gánh" 1 Pack, toàn bộ 30-50 ảnh trong Pack đó sẽ bị mất kết quả. Dưới đây là các kỹ thuật tân tiến để cải thiện độ bền bỉ của ứng dụng khi gặp "Fail Pack":

### Cải thiện 1. Áp dụng cơ chế Shared Queue (Phân phối Hàng Đợi) với Worker Pool
- **Vấn đề appPython:** Hiện tại appPython dùng vòng lặp tuần tự (`for batch in batches`), ném thử lần lượt. Nếu gặp 429 mà đổi Key không thành công, nó sẽ ngâm luôn quá trình.
- **Cải thiện:** Giống như mô hình vừa được áp dụng ở Web React, hãy tạo một mảng chứa TẤT CẢ các Pack (Ví dụ 100 ảnh = 5 Pack). Setup một Worker Pool chứa các theard chạy tương ứng với số lượng API Key đang sống. Khi 1 Pack bị fail do 429, không cần bắt API phải ngủ 60s, chỉ việc **Ném ngược Pack đó vào cuối hàng đợi (Queue)** với cờ `retry_count += 1`. Các API Key khác đang rảnh sẽ bốc nó ra làm lại.

### Cải thiện 2. Shrinking Batch (Chia nhỏ để trị nhị phân - Binary Splitting)
- **Vấn đề:** Gemini thường xuyên "ngáo" (báo lỗi 400 Bad Request) nếu trong 1 Pack 30 hình có chứa 1 hình ảnh dính "Safety Limit" (vi phạm chính sách an toàn, ví dụ ảnh chứa bạo lực/chữ ngữ cảnh nhạy cảm), hoặc PDF quá nặng cạn RAM của Gemini. Chết 1 hình, chết lây cả 30 hình.
- **Cải thiện:** Khi một Pack (30 hình) gặp lỗi 400 liên tiếp 2 lần, đừng bỏ cuộc vội. Hãy **chia đôi Pack đó ra** làm 2 Pack nhỏ hơn (15 hình) và ném vào Queue thử lại. Nếu tiếp tục lỗi, chia tiếp (còn 7 hình). Nếu cuối cùng chia đến 1 hình mà vẫn lỗi, thì ta biết đích xác hình ảnh nào làm kẹt hệ thống và bỏ qua ảnh đó. Ảnh còn lại vẫn sống sót.

### Cải thiện 3. Resumable State (Lưu trạng thái tiếp tục)
- **Vấn đề:** Nếu người dùng đang quét 300 ảnh, đến ảnh 250 rớt mạng hoặc crash app, họ sẽ phải quét lại từ số 0.
- **Cải thiện:** Tạo một file nháp (temp session) dưới local (`scan_session.json`). Cứ 1 Pack thành công thì lưu JSON kết quả ngay xuống ổ cứng. Nếu dừng đột ngột, lần mở lại App kiểm tra session cũ -> Tiếp tục nối vào Pack còn đang dở, không gọi lại những Pack đã có JSON kết quả rồi.

### Cải thiện 4. Tách lớp JSON Parser ra khỏi Gemini Generation
- **Vấn đề:** Nhiều trường hợp Gemini trả kết quả xuất sắc, nhưng quên đóng ngoặc `]` ở JSON, khiến bộ Parser của Python báo `JSONDecodeError` và huỷ luôn cả Pack dù tốn Token xử lý.
- **Cải thiện:** Lưu RAW text của những Pack bị lỗi Parser. Xây dựng một thư viện auto-fix JSON (Regex) để khôi phục dữ liệu thẻ mà không phải bắt AI quét hình ảnh lại lần 2.

---
*Tài liệu này được tạo nhằm mục đích nâng cấp và chuyển tiếp các kiến trúc ổn định nhất cho dự án PNGToQuizlet.*

# Flashcard AI Ecosystem

Một hệ sinh thái học tập toàn diện được tự động hóa bằng Trí tuệ Nhân tạo (Gemini AI). Dự án bao gồm hai thành phần chính: 
1. **Ứng dụng Desktop (Python/Tkinter):** Giải pháp trích xuất tức thời flashcard từ dữ liệu thô (Hình ảnh, PDF).
2. **Ứng dụng Mobile (Android - React Native):** Nền tảng ôn tập flashcard mượt mà và trực quan trên thiết bị di động.

Mục tiêu của dự án là loại bỏ hoàn toàn thao tác gõ tay (data entry) khi tạo flashcard, đồng thời cung cấp môi trường học tập đồng bộ trên multi-platform.

---

## 🌟 Chức Năng Cốt Lõi

### 1. 🖥️ AI Desktop Extractor (Windows/macOS/Linux)
Công cụ PC được thiết kế tối giản hoá luồng xử lý tài liệu, sử dụng sức mạnh suy luận của LLM.
*   **Trích xuất thông minh (Smart Extraction):** Tích hợp Google Gemini AI. Tự động nhận diện nội dung từ Hình ảnh hoặc tài liệu PDF, bóc tách chính xác Câu hỏi, Các phương án (nếu là trắc nghiệm) và Phân tích tìm ra Đáp án đúng. 
*   **Suy luận ngữ cảnh (Contextual Inference):** Trong trường hợp tài liệu chụp thiếu đáp án, AI sẽ dựa trên kiến thức được huấn luyện để tự suy luận đáp án chính xác nhất thay vì để trống.
*   **Quản lý & Chỉnh sửa trực quan:** Giao diện xem trước thẻ (Card Preview), hỗ trợ thêm, sửa, xóa linh hoạt trước khi xuất ra.
*   **Chế độ ôn tập tích hợp (Built-in Quiz Mode):** Hỗ trợ ôn tập trực tiếp ngay trên PC với giao diện tối ưu không gian đọc (hỗ trợ Zoom text riêng biệt cho câu hỏi và đáp án).
*   **Xuất định dạng JSON:** Đóng gói toàn bộ cấu trúc bài học vào tệp `decks.json` chuẩn hóa, sẵn sàng đồng bộ hoá lên mọi nền tảng khác.

### 2. 📱 Android Mobile Client (Hệ Điều Hành: Android)
Ứng dụng di động được xây dựng chuyên biệt cho hệ điều hành Android thông qua React Native và thư viện Expo, tập trung vào trải nghiệm mượt mà của người dùng (UX/UI).
*   **Tiếp nhận dữ liệu ngoại tuyến:** Hỗ trợ nhập trực tiếp tệp `decks.json` từ bộ nhớ trong của điện thoại vào cơ sở dữ liệu nội bộ (AsyncStorage).
*   **Trải nghiệm Thẻ nhớ (Interactive Flashcards):**
    *   **Cơ chế Gesture-based:** Áp dụng vật lý lò xo (Spring Physics) và cơ chế vuốt tương tự Tinder. Vuốt phải (✅ Biết rồi) hoặc Vuốt trái (❌ Chưa biết).
    *   Hiệu ứng biến đổi 3D (3D Flip Animation) khi chạm để xem đáp án.
    *   Triển khai ngăn xếp lịch sử thao tác, cho phép **Hoàn Tác (Undo)** tức thời.
*   **Chế độ Thi Thử (Quiz Mode):**
    *   Giải quyết linh hoạt các bài trắc nghiệm chọn Một đáp án (Single-choice) hoặc Nhiều đáp án (Multi-choice).
    *   Phản hồi kết quả (Correct/Incorrect Feedback) ngay lập tức theo thời gian thực.
    *   **Persistent State:** Tự động lưu trữ tiến trình làm bài. Người dùng có thể thoát ứng dụng và tiếp tục chính xác tại câu hỏi dang dở vào lần sau.

---

## 🛠️ Kiến Trúc Công Nghệ (Tech Stack)

### Core Backend & Desktop
*   **Ngôn ngữ:** `Python 3.10+`
*   **Giao diện đồ họa (GUI):** `customtkinter` (Modern UI toolkit cho Tkinter)
*   **Tích hợp AI:** `google-generativeai` (Gemini Pro/Flash Models API)
*   **Xử lý tài liệu:** `pdf2image`, `Pillow` (PIL)

### Android Mobile App
*   **Framework cốt lõi:** `React Native` 0.76+
*   **Môi trường phát triển:** `Expo SDK 55` (Managed workflow)
*   **Quản lý trạng thái & Điều hướng:** `React Navigation` (Native Stack)
*   **Quản lý cử chỉ & Hiệu ứng:** `PanResponder` và `Animated API` (Native Driver/Non-native fallback)
*   **Cơ sở dữ liệu cục bộ:** `@react-native-async-storage/async-storage`

---

## 📁 Cấu Trúc Mã Nguồn (Repository Structure)

```text
PNGToQuizlet/
├── androidApp/               # Source code ứng dụng di động Android (React Native/Expo)
│   ├── src/
│   │   ├── screens/          # Các Component giao diện (Home, DeckDetail, Flashcard, Quiz)
│   │   ├── utils/            # Các hàm phụ trợ (storage persistence)
│   │   └── theme.js          # Hệ thống Design Tokens (Màu sắc, Typography, Spacing)
│   ├── app.json              # Cấu hình định danh Expo và cấu hình EAS Build
│   └── App.js                # Root Navigation
├── models/                   # Python Data Classes (Định nghĩa Flashcard, Deck objects)
├── services/                 # Business Logic (gemini_service.py cho AI, storage_service.py cho I/O)
├── app.py                    # Entry point của ứng dụng Desktop
└── requirements.txt          # Danh sách dependencies của Python
```

---

## 🚀 Hướng Dẫn Triển Khai (Deployment & Usage)

### 1. Triển khai Desktop App (Tạo dữ liệu)
**Yêu cầu môi trường:** Python 3.10 trở lên.
1. Khởi tạo môi trường ảo và cài đặt thư viện phụ thuộc:
   ```bash
   pip install -r requirements.txt
   ```
2. Khởi chạy ứng dụng:
   ```bash
   python app.py
   ```
3. Cấu hình **Gemini API Key** (Nhận miễn phí tại Google AI Studio) vào mục Cài đặt (Settings) trên góc phải giao diện.
4. Kéo & thả tệp tin Ảnh/PDF trực tiếp vào vùng làm việc để AI bắt đầu quá trình trích xuất.
5. Export dữ liệu ra file `decks.json`.

### 2. Triển khai Android App (Môi trường phát triển)
**Yêu cầu môi trường:** Node.js (Phiên bản LTS) và Expo CLI.
1. Di chuyển vào thư mục client và tiến hành cài đặt:
   ```bash
   cd androidApp
   npm install
   ```
2. Khởi động Expo Development Server:
   ```bash
   npx expo start
   ```
3. Tải ứng dụng **Expo Go** từ Google Play Store trên thiết bị Android của bạn. Quét mã QR xuất hiện trên Terminal để nạp ứng dụng vào điện thoại mà không cần biên dịch (compile).
4. Sao chép tệp `decks.json` (được xuất từ công cụ Desktop) vào bộ nhớ trong của điện thoại. Sử dụng nút **"Nhập decks.json"** trên giao diện chính để chèn dữ liệu.

### 3. Biên dịch bản phân phối (Build APK file)
Quá trình build dựa trên hạ tầng máy chủ của Expo (Expo Application Services - EAS), không yêu cầu cài đặt Android Studio hay Java JDK trên máy cá nhân:
```bash
cd androidApp
npx eas-cli login
npx eas-cli build --platform android --profile preview
```
Hệ thống sẽ tiến hành xếp hàng trên Cloud. Sau khoảng 10-15 phút, truy cập đường dẫn xuất hiện ở log để tải thẳng tệp tin cài đặt `.apk`.

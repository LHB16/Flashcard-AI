# Flashcard AI Ecosystem

Hệ sinh thái học tập toàn diện được tự động hóa bằng Google Gemini AI, gồm hai thành phần:

1. **Desktop App (Python/Windows)** — Trích xuất flashcard từ ảnh chụp tài liệu tự động, hoàn toàn không cần gõ tay.
2. **Mobile App (Android)** — Ứng dụng ôn tập với thẻ nhớ và thi thử trực tiếp trên điện thoại.

---

## 🖥️ Desktop App — Tính năng

Giao diện được xây dựng bằng `customtkinter`, chế độ sáng.

### Màn hình chính (Home)
- Hiển thị danh sách tất cả bộ thẻ (Deck) đã tạo, kèm số thẻ và ngày tạo.
- **Tìm kiếm** theo tên, danh sách cập nhật tức thời.
- Mỗi Deck có các nút: **Study ▶** (ôn tập lật thẻ), **Quiz 📝** (thi thử), **View** (xem danh sách thẻ), **✕** (xóa).
- **Active Scans** — Hiển thị các tiến trình quét đang chạy nền ngay trên màn hình chính, kèm thanh tiến trình và log realtime.

### Tạo bộ thẻ mới (New Scan)
1. Đặt tên cho Deck.
2. Chọn **thư mục chứa ảnh** (`Browse`) — Hệ thống tự đếm và tự điền tên Deck theo tên thư mục.
3. Bấm **"▶ Select API Keys & Start"** — Một cửa sổ popup hiện ra cho phép chọn API Key nào sẽ dùng cho lần quét này.
4. Quét chạy **nền (background)** — Bạn có thể tiếp tục sử dụng giao diện, hoặc tạo thêm scan khác cùng lúc. Hỗ trợ **Pause ⏸ / Resume ▶ / Stop ⏹**.
5. Khi hoàn tất, Windows Toast Notification xuất hiện thông báo kết quả.

### Quản lý API Keys
- Thêm nhiều Gemini API Key, hiển thị dạng bị che (`...XXXXXXXX`).
- Hỗ trợ **test** từng key hoặc Test All cùng lúc.
- Khi quét, mỗi scan được gán riêng một nhóm key — Key đang dùng bởi scan khác sẽ bị đánh dấu `[In Use]` và không thể chọn lại.

### Xem & chỉnh sửa bộ thẻ (View)
- Xem toàn bộ câu hỏi, các đáp án, đáp án đúng. Hiển thị phân trang (50 thẻ/trang — Load more).
- Xóa từng thẻ không cần thiết.
- **Export Quizlet** — Xuất ra file `.txt` với 4 định dạng: Simple, Full, Compact, Safe. Import trực tiếp lên quizlet.com.

### Ôn tập trên PC (Study)
- Lật thẻ xem câu hỏi / đáp án.

### Thi thử trên PC (Quiz)
- Hiển thị câu hỏi và các đáp án dạng checkbox.
- Hỗ trợ cả **trắc nghiệm 1 đáp án** và **nhiều đáp án**.
- Zoom in/out cỡ chữ câu hỏi và đáp án độc lập nhau.
- Lưu tiến độ, hiển thị kết quả, cho phép Reset với xác nhận.

### AI & Xử lý dữ liệu
- Ảnh được gom thành PDF batch (50 ảnh/batch) rồi gửi lên Gemini để trích xuất hàng loạt.
- Nếu đáp án không có trong tài liệu, AI **tự suy luận** và đánh dấu `[AI inferred]` trên thẻ.
- Tất cả dữ liệu lưu vào `decks.json` (local, không cần server).

---

## 📱 Android App — Tính năng

Xây dựng bằng **React Native + Expo SDK 55**, chạy trên **Android**.

### Màn hình chính
- Danh sách tất cả bộ thẻ, hiển thị số thẻ, số câu đa lựa chọn và ngày tạo.
- Nút **"📂 Nhập decks.json"** — Mở trình chọn file, đọc và nạp toàn bộ dữ liệu vào app.
- Nút **"Xoá tất cả"** — Xóa toàn bộ dữ liệu sau khi xác nhận.

### Chi tiết bộ thẻ (Deck Detail)
- Hiển thị thống kê: Tổng thẻ, số câu đơn lựa chọn, số câu đa lựa chọn, ngày tạo.
- 2 nút vào chế độ học: **🃏 Thẻ Nhớ** và **📝 Làm Bài Thi**.

### Chế độ Thẻ nhớ (Flashcard)
- **Vuốt phải** (✅) = Biết rồi, **Vuốt trái** (❌) = Chưa biết.
- **Chạm vào thẻ** để lật xem đáp án (hiệu ứng 3D flip).
- Gạch dưới chân ✅/❌ sáng lên khi vuốt đủ ngưỡng bay (30% chiều màn hình).
- Nút **↩️ Hoàn tác** để quay lại thẻ vừa vuốt.
- Bộ đếm ❌/✅ hiển thị trên cùng, kết quả % hiển thị khi làm hết bộ.

### Chế độ Làm bài thi (Quiz)
- Trắc nghiệm chọn 1 hoặc nhiều đáp án.
- Phản hồi đúng/sai ngay sau khi trả lời (highlight màu xanh/đỏ).
- **Tự động lưu tiến độ** — Thoát app rồi mở lại, app hỏi có muốn tiếp tục từ câu đang dở không.
- Nút **Reset** nhỏ gọn, có xác nhận trước khi xóa tiến độ.

---

## 🛠️ Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Desktop GUI | Python 3.10+, `customtkinter` |
| AI | `google-generativeai` (Gemini Flash/Pro) |
| Desktop Storage | JSON file (`decks.json`) |
| Mobile Framework | React Native, Expo SDK 55 |
| Mobile Navigation | `@react-navigation/native-stack` |
| Mobile Storage | `@react-native-async-storage/async-storage` |
| Mobile Gestures | `PanResponder`, `Animated` |
| Build (APK) | EAS Build (Expo Cloud) |

---

## 📁 Cấu trúc thư mục

```
PNGToQuizlet/
├── app.py                     # Entry point ứng dụng Desktop
├── models/flashcard.py        # Data class: Flashcard, Deck, QuizSession
├── services/
│   ├── gemini_service.py      # Gọi Gemini API, batch PDF, parse JSON
│   ├── storage_service.py     # Đọc/ghi decks.json và settings
│   └── export_service.py      # Xuất định dạng Quizlet .txt
├── androidApp/
│   ├── App.js                 # Root navigation
│   ├── src/screens/
│   │   ├── HomeScreen.js      # Danh sách deck, nhập file
│   │   ├── DeckDetailScreen.js# Thống kê, chọn chế độ học
│   │   ├── FlashcardScreen.js # Thẻ nhớ + swipe gesture
│   │   └── QuizScreen.js      # Thi thử + lưu tiến độ
│   ├── src/utils/storage.js   # AsyncStorage helpers
│   ├── src/theme.js           # Design tokens (màu, spacing)
│   └── app.json               # Cấu hình Expo + EAS
└── requirements.txt           # Thư viện Python
```

---

## 🚀 Hướng dẫn cài đặt

### Desktop App
```bash
pip install -r requirements.txt
python app.py
```
Sau khi chạy: Vào **"⚙ API Keys"** → Thêm Gemini API key → **"+ New Scan"** → Chọn thư mục ảnh → Start.

### Android App (Dev)
```bash
cd androidApp
npm install
npx expo start
```
Quét QR bằng **Expo Go** trên điện thoại Android.

### Build APK (không cần Android Studio)
```bash
cd androidApp
npx eas-cli login
npx eas-cli build --platform android --profile preview
```
Sau ~15 phút nhận link tải file `.apk` trực tiếp.

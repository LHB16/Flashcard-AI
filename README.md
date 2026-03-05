# Flashcard AI Ecosystem

A comprehensive learning ecosystem automated by Google Gemini AI, consisting of two components:

1. **Desktop App (Python/Windows)** — Automatically extracts flashcards from document images, absolutely no manual typing required.
2. **Mobile App (Android)** — A review application with flashcards and mock exams directly on your phone.

---

## 🖥️ Desktop App — Features

The user interface is built using `customtkinter` with a light mode theme.

### Home Screen
- Displays a list of all created card sets (Decks), along with the card count and creation date.
- **Search** by name, with instant list updates.
- Each Deck has buttons: **Study ▶** (flashcard review), **Quiz 📝** (mock exam), **View** (view card list), **✕** (delete).
- **Active Scans** — Displays background scanning processes directly on the home screen, complete with a progress bar and realtime logs.

### Create New Deck (New Scan)
1. Name the Deck.
2. Select the **image folder** (`Browse`) — The system automatically counts images and auto-fills the Deck name based on the folder name.
3. Click **"▶ Select API Keys & Start"** — A popup window appears allowing you to select which API Keys to use for this scan.
4. Scanning runs in the **background** — You can continue using the interface or create additional scans simultaneously. Supports **Pause ⏸ / Resume ▶ / Stop ⏹**.
5. Upon completion, a Windows Toast Notification appears to announce the results.

### API Key Management
- Add multiple Gemini API Keys, displayed in a masked format (`...XXXXXXXX`).
- Supports **testing** individual keys or "Test All" simultaneously.
- When scanning, each scan is assigned a specific group of keys — Keys currently in use by another scan will be marked `[In Use]` and cannot be selected again.

### View & Edit Deck (View)
- View all questions, options, and correct answers. Displays with pagination (50 cards/page — Load more).
- Delete unnecessary individual cards.
- **Export to Quizlet** — Export to a `.txt` file with 4 formats: Simple, Full, Compact, Safe. Import directly into quizlet.com.

### Study on PC (Study)
- Flip cards to view the question / answer.

### Mock Exam on PC (Quiz)
- Displays questions and checkbox options.
- Supports both **single-answer** and **multiple-answer** multiple-choice questions.
- Zoom in/out font sizes for questions and answers independently.
- Saves progress, displays results, and allows resetting with confirmation.

### AI & Data Processing
- Images are grouped into PDF batches (50 images/batch) and sent to Gemini for bulk extraction.
- If the answer is not found in the document, the AI **infers it automatically** and marks the card with `[AI inferred]`.
- All data is saved locally to `decks.json` (no server required).

---

## 📱 Android App — Features

Built with **React Native + Expo SDK 55**, running on **Android**.

### Home Screen
- List of all decks, displaying total cards, multiple-choice questions, and creation date.
- **"📂 Import decks.json"** button — Opens a file picker, reads, and loads all data into the app.
- **"Delete All"** button — Clears all data after confirmation.

### Deck Details (Deck Detail)
- Displays statistics: Total cards, single-answer questions, multiple-answer questions, creation date.
- 2 study mode buttons: **🃏 Flashcard** and **📝 Take Quiz**.

### Flashcard Mode
- **Swipe Right** (✅) = Know it, **Swipe Left** (❌) = Don't know yet.
- **Tap the card** to flip and view the answer (3D flip effect).
- Underlines for ✅/❌ light up when swiped past the threshold (30% of screen width).
- **↩️ Undo** button to revert the last swiped card.
- ❌/✅ counters display at the top, and the % result is shown when the deck is finished.

### Quiz Mode (Quiz)
- Multiple choice with single or multiple answers.
- Immediate correct/incorrect feedback after answering (green/red highlights).
- **Auto-save progress** — If you close the app and reopen it, the app asks if you want to resume from where you left off.
- Compact **Reset** button, requiring confirmation before erasing progress.

---

## 🛠️ Tech Stack

| Component | Technology |
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

## 📁 Directory Structure

```
PNGToQuizlet/
├── app.py                     # Desktop app entry point
├── models/flashcard.py        # Data classes: Flashcard, Deck, QuizSession
├── services/
│   ├── gemini_service.py      # Call Gemini API, batch PDF, parse JSON
│   ├── storage_service.py     # Read/write decks.json and settings
│   └── export_service.py      # Export Quizlet .txt formats
├── androidApp/
│   ├── App.js                 # Root navigation
│   ├── src/screens/
│   │   ├── HomeScreen.js      # Deck list, file import
│   │   ├── DeckDetailScreen.js# Stats, study mode selection
│   │   ├── FlashcardScreen.js # Flashcards + swipe gestures
│   │   └── QuizScreen.js      # Mock exam + progress saving
│   ├── src/utils/storage.js   # AsyncStorage helpers
│   ├── src/theme.js           # Design tokens (colors, spacing)
│   └── app.json               # Expo + EAS configuration
└── requirements.txt           # Python dependencies
```

---

## 🚀 Installation Guide

### Desktop App
```bash
pip install -r requirements.txt
python app.py
```
After running: Go to **"⚙ API Keys"** → Add Gemini API key → **"+ New Scan"** → Select image folder → Start.

### Android App (Dev)
```bash
cd androidApp
npm install
npx expo start
```
Scan the QR code with **Expo Go** on an Android phone.

### Build APK (No Android Studio Required)
```bash
cd androidApp
npx eas-cli login
npx eas-cli build --platform android --profile preview
```
Receive the direct `.apk` download link after ~15 minutes.

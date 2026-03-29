# 🃏 Flashcard AI Ecosystem

[![.NET 8](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet)](https://dotnet.microsoft.com/download)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React Native](https://img.shields.io/badge/react--native-v0.83-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Version](https://img.shields.io/badge/version-1.0.5-green)](https://github.com/LHB16/Flashcard-AI)
[![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-orange?logo=google-gemini)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive learning ecosystem powered by **Google Gemini AI**. This project automates the entire process of creating study materials—from document images to interactive flashcards and mock exams.

> [!TIP]
> **No manual typing required!** Simply upload folders of images (lecture slides, book pages, notes) and let Gemini extract the core concepts for you.

---

## ️ Desktop App (Windows)
The control center for scanning and deck management.

- **🤖 AI OCR Scanning**: Extract flashcards from image folders or **Video files** (.mp4, .avi) using OpenCvSharp & Gemini API.
- **☁️ Cloud Sync**: Bi-directional Smart Merge synchronization via Google Drive AppData (keeps devices updated effortlessly).
- **⚡ Background Processing**: Multiple scans can run simultaneously with real-time logs and progress tracking.
- **🛠️ API Key Management**: Support for multiple Gemini keys with per-key usage tracking.
- **⌨️ Study Mode**: Advanced flashcard review with keyboard shortcuts (`Space` to flip, arrows to score) and **Undo** functionality.
- **📝 Quiz Mode**: Practice with single/multiple-choice questions, font zooming, and progress auto-saving.
- **📂 Export**: Seamlessly export decks to **Quizlet** (.txt) in four distinct formats.

---

## 📱 Mobile App (Android)
Your portable study companion built with **React Native**.

- **📦 Easy Import**: Import your generated `decks.json` files directly from your phone's storage.
- **🖐️ Gesture Control**: Smooth **Swipe-to-Score** mechanics (Swipe Right for Known, Left for Unknown).
- **🔀 3D Flip Anim**: High-performance 3D card animations for a premium feel.
- **🔄 Session Resume**: Automatically detects and resumes your last study or quiz session.
- **📜 Smart Scrolling**: Fully supports extra-long text in both questions and answers with zero touch conflicts.
- **🌐 English UI**: The app interface is fully localized in English (v1.0.2).

---

## 🌐 Web App (React + Vite)
A full-featured web interface running directly in your browser — no installation needed.

- **URL**: [https://lhb16-flashcard-ai.pages.dev](https://lhb16-flashcard-ai.pages.dev)

### Frontend (Cloudflare Pages)
- **📂 Local Import**: Load `desk.json` or `decks.json` files directly from your device.
- **☁️ Google Drive Sync**: Fetch and update decks via Google Drive AppData folder.
- **🖐️ Swipe-to-Score**: Touch/mouse gestures and keyboard shortcuts for flashcard study.
- **📊 Progress Bar**: Real-time visual progress tracking during study sessions.
- **⏪ Undo (R key)**: Undo last flashcard action with a single tap or keystroke.
- **🔄 Auto-Save**: Background debounced sync to Google Drive after every card action.
- **📝 Quiz Mode**: Interactive quiz with score tracking and session resume from cloud.
- **📱 Responsive**: Fully adapts to mobile and desktop screens.

### Backend (Node.js on Render)
- **🔐 Secure OAuth**: Google login via server-side OAuth 2.0 — no secrets exposed to the client.
- **♾️ Persistent Login**: Refresh tokens stored in **Supabase** database — users stay logged in indefinitely.
- **📊 Cloud Progress**: Study & quiz progress synced to **Supabase** for cross-device continuity.
- **⏰ Always Online**: Google Apps Script pings the server every 10 minutes to prevent Render cold starts.

---

## 🏗️ Architecture

| Component | Tech | Hosting |
|:---|:---|:---|
| Desktop (.NET) | C# / WPF (.NET 8), MVVM | Local EXE |
| Desktop (Python) | Python 3.10+, CustomTkinter | Local EXE |
| Mobile | React Native, Expo | Android APK |
| Web Frontend | React + Vite | Cloudflare Pages |
| Web Backend | Node.js, Express | Render |
| Database | PostgreSQL (Supabase) | Supabase Cloud |
| AI Engine | Google Gemini API | Google Cloud |
| File Storage | Google Drive AppData | Google Cloud |

---

## 🚀 Getting Started

### 1. Desktop Setup (.NET 8)
```bash
git clone https://github.com/LHB16/Flashcard-AI.git
cd Flashcard-AI/appDotNet/FlashcardAI
dotnet run
```

### 1b. Desktop Setup (Python Legacy)
```bash
cd Flashcard-AI/appPython
pip install -r requirements.txt
python app.py
```

### 2. Mobile Setup
```bash
cd appAndroid
npm install
npx expo start
```
*Use **Expo Go** on your Android device to scan the QR code.*

### 3. Web App — Local Development
```bash
# Frontend
cd appWeb
npm install
npm run dev        # → http://localhost:5173

# Backend
cd appWeb/appBackend
npm install
cp .env.example .env   # Fill in your keys
node index.js      # → http://localhost:3000
```

### 4. Web Backend — Environment Variables

| Variable | Description |
|:---|:---|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | Backend callback URL (e.g. `https://your-app.onrender.com/auth/callback`) |
| `FRONTEND_URL` | Frontend origin for CORS |
| `FRONTEND_CALLBACK_URL` | Frontend URL to redirect after login |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

#### 🔑 Google Drive API Configuration
The official build now **includes embedded credentials**, so you can use the Cloud Sync feature out-of-the-box!

If you are a developer or want to use your own Google Cloud project:
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and enable the **Google Drive API**.
3. Configure the **OAuth Consent Screen** (Internal or External with your email as a test user).
4. Go to **Credentials** -> **Create Credentials** -> **OAuth Client ID** (Desktop App).
5. Download the JSON file, rename it to `credentials.json`, and place it in the project root. The app will prioritize this file if it exists.

---

### 📦 Build Executables
We provide manual build scripts to process binaries for all platforms. Once built, their outputs will be automatically named `FlashcardAI-<Platform>-v<version>.<ext>`:

- **Desktop (.NET 8):**
  ```bash
  cd appDotNet
  build_exe.bat
  ```
- **Desktop (Python Legacy):**
  ```bash
  cd appPython
  build_exe.bat
  ```
- **Mobile (Android APK):**
  ```bash
  cd appAndroid
  build_apk_release.bat
  ```

> To publish an all-in-one GitHub Release automatically, run `release_gh.bat` from the root directory.

---

## 🛡️ Privacy & Security
- **Local First**: All your decks and scan results are saved locally on your device (`decks.json`).
- **Secure Cloud Sync**: Uses the hidden Google Drive **AppData** folder, meaning the synced files cannot be tampered with or seen by users directly in standard Google Drive.
- **Server-Side OAuth**: Web app login is handled entirely by the backend — no client secrets are ever exposed in browser code.
- **Secure Keys**: Your API keys, OAuth tokens, and Supabase credentials are stored securely and ignored by Git.
- **Sensitive Files Protection**: Critical files like `.env`, `credentials.json`, and `token.json` are strictly excluded from the repository.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/LHB16">LHB16</a>
</p>

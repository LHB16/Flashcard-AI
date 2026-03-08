# 🃏 Flashcard AI Ecosystem

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React Native](https://img.shields.io/badge/react--native-v0.83-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Version](https://img.shields.io/badge/version-1.0.2-green)](https://github.com/LHB16/Flashcard-AI)
[![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-orange?logo=google-gemini)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive learning ecosystem powered by **Google Gemini AI**. This project automates the entire process of creating study materials—from document images to interactive flashcards and mock exams.

> [!TIP]
> **No manual typing required!** Simply upload folders of images (lecture slides, book pages, notes) and let Gemini extract the core concepts for you.

---

## ️ Desktop App (Windows)
The control center for scanning and deck management.

- **🤖 AI OCR Scanning**: Batched processing of folder images via Gemini API.
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

## 🛠️ Tech Stack

| Desktop | Mobile | Core |
|:---:|:---:|:---:|
| Python 3.10+ | React Native (Expo SDK 55) | Google Gemini AI |
| CustomTkinter | AsyncStorage | JSON Database |
| Google Drive API (OAuth) | React Navigation | batch-PDF OCR |
| PyInstaller | | |

---

## 🚀 Getting Started

### 1. Desktop Setup
```bash
# Clone the repository
git clone https://github.com/LHB16/Flashcard-AI.git
cd Flashcard-AI

# Install dependencies
pip install -r requirements.txt

# Run the app
python app.py
```

#### 🔑 Google Drive API Configuration
To use the Cloud Sync feature on Desktop, you need to provide your own Google OAuth credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and enable the **Google Drive API**.
3. Configure the **OAuth Consent Screen** (Internal or External with your email as a test user).
4. Go to **Credentials** -> **Create Credentials** -> **OAuth Client ID**.
5. Select **Desktop App** as the application type.
6. Download the JSON file, rename it to `credentials.json`, and place it in the project root directory.

---

### 2. Mobile Setup
```bash
cd androidApp
npm install
npx expo start
```
*Use **Expo Go** on your Android device to scan the QR code.*

### 📦 Build Executables
We provide manual build scripts in the root directory:
- `build_exe.bat`: Compiles the Windows Desktop binary.
- `build_apk_release.bat`: Generates the production Android APK.

---

## 🛡️ Privacy & Security
- **Local First**: All your decks and scan results are saved locally on your device (`decks.json`).
- **Secure Cloud Sync**: Uses the hidden Google Drive **AppData** folder, meaning the synced files cannot be tampered with or seen by users directly in standard Google Drive.
- **Secure Keys**: Your API keys and OAuth tokens (`token.json`) are stored securely and ignored by Git. They are masked in the UI.
- **Sensitive Files Protection**: Critical files like `credentials.json` and `token.json` are strictly excluded from the repository. Each user should use their own credentials for maximum security.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/LHB16">LHB16</a>
</p>

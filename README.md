# 🃏 Flashcard AI Ecosystem

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React Native](https://img.shields.io/badge/react--native-v0.83-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-orange?logo=google-gemini)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive learning ecosystem powered by **Google Gemini AI**. This project automates the entire process of creating study materials—from document images to interactive flashcards and mock exams.

> [!TIP]
> **No manual typing required!** Simply upload folders of images (lecture slides, book pages, notes) and let Gemini extract the core concepts for you.

---

## 📸 Preview

<p align="center">
  <img src="C:/Users/luuhu/.gemini/antigravity/brain/d2f3e1d0-f946-4c2a-a35b-cc37197022da/media__1772785534238.png" width="80%" alt="Study Mode Desktop"/>
  <br>
  <i>Desktop Study Mode - Interface for reviewing extracted flashcards</i>
</p>

---

## 🖥️ Desktop App (Windows)
The control center for scanning and deck management.

- **🤖 AI OCR Scanning**: Batched processing of folder images via Gemini API.
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

---

## 🛠️ Tech Stack

| Desktop | Mobile | Core |
|:---:|:---:|:---:|
| Python 3.10+ | React Native (Expo SDK 55) | Google Gemini AI |
| CustomTkinter | AsyncStorage | JSON Database |
| PyInstaller | React Navigation | batch-PDF OCR |

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
- **Secure Keys**: Your API keys are stored in `api_keys.json` (ignored by Git) and are masked in the UI.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/LHB16">LHB16</a>
</p>

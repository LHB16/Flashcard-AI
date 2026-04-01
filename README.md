# Flashcard AI Ecosystem

[![.NET 8](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet)](https://dotnet.microsoft.com/download)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React Native](https://img.shields.io/badge/react--native-v0.83-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-orange?logo=google-gemini)](https://ai.google.dev/)

A high-performance study ecosystem that automates flashcard creation using Google Gemini AI. From lecture slides to interactive quizzes, Flashcard AI handles the entire pipeline with cross-platform synchronization.

---

## Core Philosophy: Cloud-Sync, Private-Storage

Unlike traditional SaaS, Flashcard AI prioritizes user data ownership:
*   **Private Storage**: Your decks and API keys are stored in a hidden `AppData` folder on **your private Google Drive**.
*   **Multi-Platform**: Seamlessly transition between Web, Desktop, and Mobile.
*   **Metadata Sync**: Learning progress (mastery levels, quiz sessions) is synchronized via Supabase to ensure a consistent experience across all devices.

---

## 🚀 Key Features

### Intelligent AI Scanning
*   **Parallel Extraction**: Multi-key worker pool to process large PDF/Image batches simultaneously.
*   **Robust Recovery**: Uses Binary Splitting and Regex post-processing to salvage malformed AI responses.
*   **Key Rotation**: Automatic round-robin rotation between multiple API keys to optimize rate limits.

### ⚡ Performance & UX
*   **Core Web Vitals Optimized**: Achieved "Good" scores for LCP and CLS through strategic resource preloading and layout stabilization.
*   **Skeleton Screens**: Predictive loading interfaces (shimmer effect) that eliminate layout shifts during Google Drive sync and AI scans.
*   **Adaptive Theme Placeholders**: Shimmering skeletons that automatically adapt to light/dark system preferences.

### Cross-Platform Pillars
*   **Web App (React + Vite)**: Full-featured desktop/mobile-responsive interface with Google OAuth login and persistent sessions.
*   **Desktop App (.NET 8 WPF)**: High-performance management tool featuring the **Smart Merge** algorithm for conflict-free Drive synchronization.
*   **Desktop App (Python)**: Cross-platform GUI built with CustomTkinter, supporting parallel scanning and local data management.
*   **Mobile App (Android)**: Portable study tool with 3D card animations, swipe-to-score gestures, and full session resilience.

### Advanced Study Engine
*   **Flashcard Mode**: Active recall with undo support, keyboard shortcuts, and haptic feedback (on mobile).
*   **Quiz Mode**: Mock exam engine with automatic progress saving, wrap-around navigation, and "Smart Jump" to unanswered questions.
*   **Duplicate Detection**: Advanced fuzzy matching algorithm using N-gram shingling to clean overlapping content.

---

## 🏗️ Technical Architecture

| Component | Technology | Hosting |
| :--- | :--- | :--- |
| **Frontend Web** | React, Vite, Tailwind | Cloudflare Pages |
| **Backend API** | Node.js, Express | Render.com |
| **Desktop** | .NET 8, WPF, MVVM | .exe (Windows) |
| **Desktop** | Python 3.10+, CustomTkinter | .exe (PyInstaller) |
| **Mobile** | React Native, Expo | Android APK |
| **Database** | PostgreSQL | Supabase |
| **Storage** | Google Drive API | AppData Space |

---

## Quick Start

### Web Application
Access the hosted version at: [lhb16-flashcard-ai.pages.dev](https://lhb16-flashcard-ai.pages.dev)

### Local Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/LHB16/Flashcard-AI.git
   ```
2. **Desktop (.NET)**:
   ```bash
   cd appDotNet/FlashcardAI && dotnet run
   ```
3. **Desktop (Python)**:
   ```bash
   cd appPython && pip install -r requirements.txt && python app.py
   ```
4. **Mobile (Android)**:
   ```bash
   cd appAndroid && npm install && npx expo start
   ```

---

## Privacy & Security

*   **Temporary Processing**: Images submitted for AI scanning are held in server memory only for the duration of the request and are never stored on permanent disks.
*   **Zero-Knowledge Keys**: API keys are stored on your Google Drive and proxied through our backend; they are never kept in our database.
*   **End-to-End Sync**: All communication with Google and Supabase APIs is conducted over encrypted HTTPS connections.

---

<p align="center">
  Maintained by <a href="https://github.com/LHB16">LHB16</a>
</p>

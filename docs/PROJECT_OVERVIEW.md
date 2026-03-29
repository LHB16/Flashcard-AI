# Project Overview

## Purpose
Flashcard AI is a local-first study-material pipeline that converts folders of exam/lecture images into structured multiple-choice flashcard decks using Google Gemini, then supports studying, quizzing, deduplication, and Quizlet export — across Desktop, Mobile, and Web platforms.

## Target Users
- Students preparing from scanned notes/slides/exam sheets
- Self-learners needing fast flashcard generation from image sources
- Users who want seamless study workflows across Desktop, Android, and Web browsers

## Tech Stack
- Desktop: C# / WPF (.NET 8) — MVVM Architecture | Python 3.10+ (Legacy)
- Mobile: React Native 0.83 + Expo 55, React Navigation, AsyncStorage
- Web Frontend: React + Vite, deployed on Cloudflare Pages
- Web Backend: Node.js + Express, deployed on Render
- Database: PostgreSQL via Supabase (users, progress, quiz sessions)
- AI Engine: Google Gemini API
- File Storage: Google Drive AppData (cross-device sync)
- Packaging: .NET publish (single-file EXE), PyInstaller, Expo EAS (APK)

## Current State
- Functional, feature-rich desktop app (.NET 8 with modular WPF architecture): background scanning, API key rotation, deck management, study/quiz modes, dedup, export, and Google Drive Sync.
- Functional Android companion app with robust JSON deck import, flashcard and quiz modes, progress persistence, and OTA APK update check.
- Full-featured Web App with swipe-based flashcard study, interactive quiz, backend OAuth, Supabase session persistence, and Google Drive bidirectional sync.
- Architecture separates UI logic, service layer, domain models, and backend API cleanly across all platforms.

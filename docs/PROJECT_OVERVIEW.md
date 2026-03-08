# Project Overview

## Purpose
Flashcard AI is a local-first study-material pipeline that converts folders of exam/lecture images into structured multiple-choice flashcard decks using Google Gemini, then supports studying, quizzing, deduplication, and Quizlet export.

## Target Users
- Students preparing from scanned notes/slides/exam sheets
- Self-learners needing fast flashcard generation from image sources
- Users who want both desktop authoring and Android study workflows

## Tech Stack
- Desktop: Python 3, CustomTkinter, Pillow, google-genai SDK, google-api-python-client (OAuth Drive)
- Mobile: React Native 0.83 + Expo 55, React Navigation, AsyncStorage, English UI (v1.0.2)
- Data: local JSON files (`decks.json`, `settings.json`, `quiz_sessions.json`, `token.json`) and Google Drive AppData Sync
- Packaging: PyInstaller (`FlashcardAI.spec`), batch scripts for EXE/APK

## Current State
- Functional, feature-rich desktop app (with modular UI architecture in `ui/` directory): background scanning, API key rotation, deck management, study/quiz modes, dedup, export, and **Google Drive Sync (Smart Merge)**.
- Functional Android companion app with robust structural JSON deck import, flashcard and quiz modes, progress/session persistence, and OTA APK update check
- Architecture separates UI logic (`ui/`), service layer (`services/`), and domain models (`models/`)

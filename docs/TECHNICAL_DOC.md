# Flashcard AI — Technical Documentation

This document provides a comprehensive technical overview of the Flashcard AI project, a multi-platform ecosystem for creating, managing, and studying flashcards using Artificial Intelligence.

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Structures](#3-data-structures)
4. [appWeb (React + Express)](#4-appweb-react--express)
5. [appDotNet (WPF + MVVM)](#5-appdotnet-wpf--mvvm)
6. [appPython (Legacy Desktop)](#6-apppython-legacy-desktop)
7. [appAndroid (React Native)](#7-appandroid-react-native)
8. [Shared Infrastructure](#8-shared-infrastructure)
9. [Development Guide](#9-development-guide)
10. [Deployment Guide](#10-deployment-guide)

---

## 1. Project Overview

### Goal
Flashcard AI aims to streamline the creation of high-quality flashcards from physical or digital exams using Google Gemini's vision capabilities. It ensures a seamless study experience across Web, Desktop, and Mobile through a unified sync engine.

### Tech Stack Summary
| Platform | Technology | Primary Role |
| :--- | :--- | :--- |
| **Web** | React, Vite, Express, Supabase | Central Hub / AI Scanning / Cloud Sync |
| **Desktop (.NET)** | C# WPF, .NET 8, MVVM | Native Performance / Smart Sync |
| **Mobile** | React Native, Expo | Portable Study Experience / Offline-First |
| **Legacy Desktop** | Python, CustomTkinter | Original Prototype / Research |

### Platform Matrix
| Feature | Web | .NET | Python | Android |
| :--- | :---: | :---: | :---: | :---: |
| UI Study (Flashcard/Quiz) | ✅ | ✅ | ❌ (Legacy) | ✅ |
| AI Scanning (Gemini) | ✅ | ✅ | ✅ | ❌ |
| Google Drive Sync | ✅ | ✅ | ✅ | ❌ (Local) |
| Multi-device Progress | ✅ | ✅ | ❌ | ❌ |

---

## 2. Architecture Overview

### System Architecture Diagram
```ascii
      +-------------------------------------------------+
      |                 Google Cloud                    |
      |   (OAuth 2.0 / Drive API / Gemini AI API)       |
      +----------^------------------^-------------------+
                 |                  |
        [OAuth / Drive Sync]   [Gemini API Proxy]
                 |                  |
      +----------v------------------v-------------------+
      |               appWeb (Render / CF)              |
      |   [React Frontend] <-> [Express Backend]        |
      +----------^------------------^----------^--------+
                 |                  |          |
          [Sync Progress]    [Sync Decks]     [Auth]
                 |                  |          |
      +----------v---------+ +------v----------v------+
      |    appAndroid      | |       appDotNet        |
      |  (React Native)    | |       (C# WPF)         |
      +--------------------+ +------------------------+
```

### Data Flow
1. **Scanning**: User uploads images/PDF in **Web** or **Desktop**. The app splits them into batches, rotates through Gemini API keys, and generates a `decks.json` format.
2. **Syncing**: Apps authenticate with Google. `decks.json` is stored in the **hidden AppDataFolder** on Google Drive.
3. **Progress**: **appWeb** sends fine-grained card progress to **Supabase**. **appDotNet** merges local and remote deck updates using the **Smart Merge** algorithm.

---

## 3. Data Structures

### decks.json
The primary interchange format.
```json
[
  {
    "deck_id": "uuid-v4",
    "name": "History 101",
    "updated_at": "2026-04-01T10:00:00Z",
    "cards": [
      {
        "card_id": "uuid-v4",
        "question": "Who was the first president?",
        "options": ["A. Washington", "B. Jefferson"],
        "correct_answers": ["A"],
        "question_type": "single_choice",
        "status": 0,
        "notes": "..."
      }
    ]
  }
]
```
- `status`: 0 (New), 1 (Unknown/Orange), 2 (Known/Green).

### Supabase Schema
| Table | Description | Key Fields |
| :--- | :--- | :--- |
| `users` | OAuth credentials | `google_id`, `refresh_token`, `email` |
| `deck_progress` | Per-deck card status | `google_id`, `deck_id`, `cards_status` (JSONB) |
| `quiz_sessions` | Active quiz state | `deck_id`, `current_index`, `answers` (JSONB) |

---

## 4. appWeb (React + Express)

### Component Hierarchy
- `App.jsx` (Container, Theme, Pinned state)
    - `Header` (Title, Search, Sort, Sync status)
        - `NotificationBell` (System alerts & Guide)
    - `FileLoader` (decks.json import/export)
    - `AIScan` (Gemini orchestration UI)
    - `DeckManager` (List, Delete, Pin decks)
    - `FlashcardMode` (Study swipe interface)
    - `QuizMode` (Timed/Un-timed question engine)

### AI Scan Flow (Worker Pool + Binary Split)
1. **Batching**: Images are merged into 50-page PDFs.
2. **Worker Pool**: Each API key starts a "worker" (up to N concurrent operations).
3. **Binary Split**: If a PDF batch fails after 3 retries, it is split into two smaller PDFs to isolate corrupt/unreadable images.
4. **Prompting**: Uses `PDF_BATCH_PROMPT` to extract multiple questions per PDF.

### API Endpoints (Backend)
| Method | Path | Role |
| :--- | :--- | :--- |
| `GET` | `/auth/google` | Starts Google OAuth flow |
| `POST` | `/auth/refresh` | Rotates Access Token using Refresh Token |
| `POST` | `/scan/process` | Proxies PDF to Gemini API |
| `POST` | `/progress/sync` | Merges card status into Supabase |

---

## 5. appDotNet (WPF + MVVM)

### MVVM Pattern
- **Models**: `Deck`, `Flashcard`, `Settings`.
- **ViewModels**: `MainViewModel` (UI binding), `GeminiViewModel` (Scan state), `SyncViewModel` (Auth/Drive).
- **Services**: `SyncService`, `GeminiService`, `StorageService`.

### Smart Merge Algorithm
Used to merge local `decks.json` with Google Drive version.
```csharp
// Pseudocode
foreach (remoteDeck in Drive) {
    if (localExists(remoteDeck.id)) {
        if (remoteDeck.updated_at > localDeck.updated_at) {
            updateLocal(remoteDeck); // Preservation of local ImagePath
        }
    } else {
        addNewLocal(remoteDeck);
    }
}
uploadMergedResult();
```

---

## 6. appPython (Legacy Desktop)

### Worker Pool Pattern
Implemented in `gemini_service.py` using `threading.Thread` and `queue.Queue`.
1. Initialize a `Queue` with all image paths.
2. Spawn N threads based on the number of API keys.
3. Each thread pulls a task, selects its assigned key, and processes the image.
4. Implements **Round-Robin key rotation** to stay within Rate limits (8 RPM per key).

---

## 7. appAndroid (React Native)

### Gesture System (FlashcardScreen.js)
Uses Expo's `Animated` and `PanResponder`.
- **Swipe Horizontal**: Map `dx` to `rotate` and `translateX`.
    - `dx > threshold`: Mark as Known (status 2).
    - `dx < -threshold`: Mark as Unknown (status 1).
- **Y-Axis lock**: Swipe is only captured if `abs(dx) > abs(dy) * 1.5`, allowing the user to scroll long question text vertically.

### 3D Flip Animation
Uses `interpolate` on an `Animated.Value`.
- **Front Side**: Rotates from `0deg` to `180deg`.
- **Back Side**: Rotates from `180deg` to `360deg`.
- `backfaceVisibility: 'hidden'` is used to toggle visibility at the 90-degree midpoint.

---

## 8. Shared Infrastructure

### Google Cloud Setup
1. Create project in Google Cloud Console.
2. Enable **Google Drive API** and **Generative Language API**.
3. Configure OAuth consent screen with `.../auth/google/callback`.
4. Scopes required: `.../auth/drive.appdata`, `.../auth/userinfo.email`, `openid`.

### Supabase Setup
Run `appWeb/appBackend/database_setup.sql` in the SQL Editor to create tables and the `merge_deck_progress` function.

---

## 9. Development Guide

### Prerequisites
- Node.js (v18+)
- .NET 8 SDK
- Python 3.10+
- Expo CLI (`npm install -g expo-cli`)

### Setup From Scratch
1. **Web**: `cd appWeb && npm install && npm run dev`.
2. **Backend**: `cd appWeb/appBackend && npm install && node index.js`.
3. **Desktop**: Open `appDotNet/FlashcardAI.sln` in Visual Studio 2022.
4. **Mobile**: `cd appAndroid && npm install && npx expo start`.

---

## 10. Deployment Guide

### Web (CI/CD)
- **Frontend**: Connect GitHub to **Cloudflare Pages**. Build command: `npm run build`, Output: `dist`.
- **Backend**: Connect GitHub to **Render.com**. Use `node index.js`.

### Release Checklist
- [ ] Update `updated_at` in all modified decks.
- [ ] Verify `decks.json` schema hasn't changed.
- [ ] Test Drive Sync merge on at least two different platforms.
- [ ] Rotate Gemini API keys if any have been leaked or quota used.

---
*Flashcard AI Team — 2026*

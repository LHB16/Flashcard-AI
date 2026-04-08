# Flashcard AI — Technical Documentation

> **Version:** 2.9 | **Last Updated:** 2026-04-07 | **Status:** Stable

A comprehensive technical reference for all four platforms in the Flashcard AI ecosystem. A developer who reads this document from start to finish should be able to set up, run, and contribute to any part of the project without external help.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Structures](#3-data-structures)
4. [appWeb — React + Express](#4-appweb--react--express)
5. [appDotNet — C# WPF Desktop](#5-appdotnet--c-wpf-desktop)
6. [appPython — Legacy Python Desktop](#6-apppython--legacy-python-desktop)
7. [appAndroid — React Native Mobile](#7-appandroid--react-native-mobile)
8. [Shared Infrastructure](#8-shared-infrastructure)
9. [Development Guide](#9-development-guide)
10. [Deployment Guide](#10-deployment-guide)
11. [Internationalization (i18n)](#11-internationalization-i18n)

---

## 1. Project Overview

### Goal

Flashcard AI converts physical or digital exam images into study-ready multiple-choice flashcard decks using Google Gemini's vision AI. It provides a seamless study experience (Flashcard mode + Quiz mode) across Web, Desktop, and Mobile through a unified Google Drive sync layer.

### Tech Stack Summary

| Platform | Language / Framework | Deployment | Key Libraries |
| :--- | :--- | :--- | :--- |
| **appWeb** | React 18, Vite, Express.js | Cloudflare Pages + Render.com | lucide-react, uuid, pdf-lib |
| **appDotNet** | C# 12, .NET 8, WPF | Single-file EXE | Google.Apis.Drive.v3, PdfSharpCore |
| **appPython** | Python 3.10, CustomTkinter | PyInstaller EXE | google-genai, Pillow, PyMuPDF |
| **appAndroid** | React Native 0.76, Expo 52 | APK Release | @react-navigation, AsyncStorage |

### Platform Feature Matrix

| Feature | Web | .NET | Python | Android |
| :--- | :---: | :---: | :---: | :---: |
| Flashcard Study Mode | ✅ | ✅ | ❌ | ✅ |
| Quiz Mode | ✅ | ✅ | ❌ | ✅ |
| AI Scan (Gemini) | ✅ | ✅ | ✅ | ❌ |
| Google Drive Sync | ✅ | ✅ | ✅ | ✅ (read-only) |
| Multi-API Key Pool | ✅ | ✅ | ✅ | ❌ |
| Duplicate Detection | ✅ | ✅ | ✅ | ❌ |
| Cloud Progress Sync | ✅ (Supabase) | ❌ | ❌ | ❌ |
| Share & Clone Decks | ✅ | ❌ | ❌ | ❌ |
| Export (Quizlet/TXT) | ✅ | ✅ | ✅ | ❌ |
| Offline-First | ❌ | ✅ | ✅ | ✅ |

---

## 2. Architecture Overview

### Full System Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD                          │
│  ┌──────────────────┐    ┌────────────────────────────┐  │
│  │  Google OAuth 2.0│    │  Gemini AI API             │  │
│  │  + Drive API     │    │  (generativelanguage.apis) │  │
│  └────────┬─────────┘    └───────────────┬────────────┘  │
└───────────┼──────────────────────────────┼───────────────┘
            │ OAuth + Drive Data           │ PDF + Prompt
            ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│                    RENDER.COM (Backend)                  │
│  Express.js Server                                       │
│  ┌─────────────┐ ┌───────────────┐ ┌──────────────────┐  │
│  │ /auth       │ │ /progress     │ │ /scan            │  │
│  │ OAuth Flow  │ │ CRUD Supabase │ │ Gemini Proxy     │  │
│  └──────┬──────┘ └───────┬───────┘ └────────┬─────────┘  │
└─────────┼────────────────┼──────────────────┼────────────┘
          │                │                  │
          │           ┌────▼──────┐           │ (Gemini response)
          │           │ SUPABASE  │           │
          │           │ users     │           │
          │           │ deck_prog │           │
          │           │ quiz_sess │           │
          │           └───────────┘           │
          │                                   │
┌─────────▼─────────────────────────────────────────────────┐
│               CLOUDFLARE PAGES (Frontend)                 │
│  React App (Vite Build)                                   │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ AIScan  │ │FlashCard │ │ QuizMode │ │  DeckManager  │  │
│  └─────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└───────────────────────────────────────────────────────────┘
          │ Same Google Drive AppDataFolder
          ▼
┌───────────────────────────────────────────┐
│         DESKTOP & MOBILE CLIENTS          │
│  ┌────────────────┐  ┌──────────────┐     │
│  │ appDotNet WPF  │  │ appPython    │     │
│  │ (Windows EXE)  │  │ (Win/Mac EXE)│     │
│  └────────────────┘  └──────────────┘     │
│  ┌─────────────────────────────────────┐  │
│  │ appAndroid (React Native APK)       │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### Key Design Principles

1. **Google Drive AppDataFolder as the source of truth** — `decks.json` and `config.json` are stored in the hidden AppDataFolder, invisible to the user but accessible by any authorized app.
2. **Supabase for fine-grained progress** — Card-level `status` is synced to Supabase via a JSONB merge function, enabling cross-device flashcard resume.
3. **Gemini API key never exposed in the browser** — The frontend sends the API key in an `x-gemini-key` HTTP header to the Express backend, which proxies it to Google. The key is never visible in DevTools network tab from the user's origin.

---

## 3. Data Structures

### 3.1 `decks.json` — The Universal Format

This JSON array is the single shared format used by ALL four platforms.

```json
[
  {
    "deck_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "History 101",
    "created_at": "2026-03-01T08:00:00Z",
    "updated_at": "2026-04-01T10:00:00Z",
    "description": "Scanned 80 cards via AI Scan",
    "source_folder": "history_exams/",
    "cards": [
      {
        "card_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "question": "Who was the first President of the United States?",
        "options": [
          "A. George Washington",
          "B. Thomas Jefferson",
          "C. John Adams",
          "D. Benjamin Franklin"
        ],
        "correct_answers": ["A"],
        "question_type": "single_choice",
        "notes": "",
        "status": 0,
        "image_path": null
      }
    ]
  }
]
```

**Field Reference:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `deck_id` | `string` (UUID v4) | Unique deck identifier. Used as the primary key for sync. |
| `name` | `string` | Display name of the deck. |
| `updated_at` | `string` (ISO 8601) | Timestamp used by the Smart Merge algorithm to determine which version is newer. |
| `card_id` | `string` (UUID v4) | Unique card identifier. Used by Supabase for card-level progress. |
| `question` | `string` | The question stem (no numbering prefix). |
| `options` | `string[]` | Answer options with letter prefix, e.g. `"A. text"`. |
| `correct_answers` | `string[]` | Either letter format `["A"]` or full-text format `["A. text"]`. |
| `question_type` | `"single_choice"` \| `"multiple_choice"` | Determines selection behavior in Quiz mode. |
| `status` | `0` \| `1` \| `2` | `0` = New/Unseen, `1` = Unknown (orange), `2` = Known (green). |
| `notes` | `string` | AI-generated note, e.g. `"⚠ Answer inferred by AI"`. |
| `image_path` | `string` \| `null` | Local path to original image (Desktop apps only). |

### 3.2 `config.json` — API Key Store

Stored in Google Drive AppDataFolder so keys sync across devices. **Keys are never stored in `localStorage`.**

```json
{
  "api_keys": [
    "AIzaxxx...key1",
    "AIzaxxx...key2"
  ],
  "batch_size": 30,
  "updated_at": "2026-04-01T08:00:00Z"
}
```

### 3.3 `quiz_sessions.json` — Quiz Resume State

Keyed by `deck_id`.

```json
{
  "550e8400-e29b-41d4-a716-446655440000": {
    "session_id": "sess-uuid",
    "question_order": [5, 12, 3, 8, ...],
    "current_index": 7,
    "answers": {
      "card_id_1": [0, 2],
      "card_id_2": [1]
    },
    "correct_count": 5,
    "wrong_count": 2,
    "started_at": "2026-04-01T09:00:00Z",
    "updated_at": "2026-04-01T09:15:00Z"
  }
}
```

### 3.4 Supabase Database Schema

**Table: `users`**

```sql
CREATE TABLE users (
  id           UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  google_id    TEXT  UNIQUE NOT NULL,
  email        TEXT  NOT NULL,
  refresh_token TEXT,                          -- Google Refresh Token (long-lived)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: `deck_progress`** — JSONB for efficient card-level status sync

```sql
CREATE TABLE deck_progress (
  google_id    TEXT  REFERENCES users(google_id) ON DELETE CASCADE,
  deck_id      TEXT  NOT NULL,
  cards_status JSONB DEFAULT '{}'::jsonb,      -- { "card_id": 1, "card_id2": 2 }
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (google_id, deck_id)
);
```

**Table: `quiz_sessions`** — Full quiz state per user per deck

```sql
CREATE TABLE quiz_sessions (
  google_id       TEXT REFERENCES users(google_id) ON DELETE CASCADE,
  deck_id         TEXT NOT NULL,
  session_id      TEXT,
  question_order  JSONB,
  current_index   INTEGER DEFAULT 0,
  answers         JSONB DEFAULT '{}',
  correct_count   INTEGER DEFAULT 0,
  wrong_count     INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (google_id, deck_id)
);
```

**Stored Procedure: `merge_deck_progress`** — JSONB merge for card status

```sql
CREATE OR REPLACE FUNCTION merge_deck_progress(
  p_google_id TEXT, p_deck_id TEXT, p_cards_status JSONB
) RETURNS void AS $$
BEGIN
  INSERT INTO deck_progress (google_id, deck_id, cards_status)
  VALUES (p_google_id, p_deck_id, p_cards_status)
  ON CONFLICT (google_id, deck_id)
  DO UPDATE SET
    cards_status = deck_progress.cards_status || EXCLUDED.cards_status,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
```

> The `||` operator merges two JSONB objects, with the right side winning on key conflicts. This means newer card statuses are always applied correctly without overwriting unrelated cards.

**Table: `shared_decks`** — Stores JSONB snapshot of a shared deck

```sql
CREATE TABLE shared_decks (
  deck_id      TEXT    PRIMARY KEY,        -- Original deck's UUID
  owner_id     TEXT    NOT NULL,           -- Owner's google_id
  deck_data    JSONB   NOT NULL,           -- Full deck snapshot at time of sharing
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: `deck_invites`** — Maps recipient emails to shared deck access

```sql
CREATE TABLE IF NOT EXISTS deck_invites (
  deck_id        TEXT REFERENCES shared_decks(deck_id) ON DELETE CASCADE,
  receiver_email TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (deck_id, receiver_email)
);
```

**Table: `notifications`** — In-app user notifications (Added **2026-04-06**)

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receiver_email TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'deck_shared',
  payload        JSONB NOT NULL,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_receiver_is_read
  ON notifications(receiver_email, is_read);
```

**Table: `user_settings`** — User-specific global configurations (Added **2026-04-06**)

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  google_id             TEXT PRIMARY KEY REFERENCES users(google_id) ON DELETE CASCADE,
  receive_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  send_email_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

> These tables power the Share & Clone feature. The `deck_data` JSONB column stores a full snapshot of the deck **at the time of sharing**, while `notifications` guarantees real-time in-app alerts to recipients.

---

## 4. appWeb — React + Express

### 4.1 Project Structure

```
appWeb/
├── src/
│   ├── App.jsx                  # Root component. State, routing, layout.
│   ├── index.css                # Global design system (CSS vars, components)
│   ├── main.jsx                 # React entry point
│   ├── components/
│   │   ├── AdminDashboard.jsx   # Admin panel for API keys and stats
│   │   ├── AIScan.jsx           # AI Scan orchestration UI
│   │   ├── AddDeckView.jsx      # Create deck via Bulk Import or Manual Entry (Full Page)
│   │   ├── ApiKeyChip.jsx       # API key display chip component
│   │   ├── ChatBubble.jsx       # Floating AI chat assistant
│   │   ├── ConfirmationModal.jsx# Reusable glassmorphism modal (danger/warning/info)
│   │   ├── DeckManager.jsx      # Card viewer, editor, dedup + Share tab
│   │   ├── FileLoader.jsx       # Import/Export decks.json
│   │   ├── ImportSharedDeckModal.jsx # Modal to import a shared deck by ID
│   │   ├── Skeleton.jsx         # Reusable shimmering placeholders for CLS mitigation
│   │   ├── FlashcardMode.jsx    # Swipe-to-score flashcard study
│   │   ├── Footer.jsx           # Footer with links
│   │   ├── KeyboardShortcuts.jsx# Keyboard shortcut overlay
│   │   ├── ShareDeckView.jsx    # Share deck UI (email invite + Copy ID)
│   │   ├── SettingsPage.jsx     # Centralized user configurations + Danger zone
│   │   ├── Taskbar.jsx          # New animated main navigation (Home, Add, Scan, Share, Settings)
│   │   └── QuizMode.jsx         # Multiple-choice quiz engine
│   └── services/
│       ├── configService.js     # config.json CRUD on Drive
│       ├── dedupService.js      # N-gram + Jaccard duplicate detection
│       ├── driveSync.js         # OAuth token management + Drive API
│       ├── geminiService.js     # PDF batch worker pool orchestrator
│       └── pdfService.js        # Browser-side image-to-PDF conversion
├── public/
│   └── guide.html               # Static user guide page
└── appBackend/
    ├── index.js                 # Express server entry point
    ├── supabaseClient.js        # Supabase client singleton
    ├── database_setup.sql       # Full Supabase schema
    └── routes/
        ├── auth.js              # Google OAuth flow + token refresh
        ├── progress.js          # Supabase progress CRUD
        ├── scan.js              # Gemini API proxy + JSON recovery
        └── share.js             # Share deck creation + shared deck fetch
```

### 4.2 App.jsx — Component State & Layout

**Global State (`App.jsx`)**

Added on **2026-04-07**: The search and sort controls were moved from the sticky header to the main body to improve layout stability during scroll and provide more horizontal space for filters on mobile.

| State Variable | Type | Description |
| :--- | :--- | :--- |
| `data` | `Deck[]` \| `null` | All loaded decks |
| `selectedDeck` | `Deck` \| `null` | Currently open deck |
| `mode` | `'flashcard'` \| `'quiz'` \| `'manage'` \| `'home'` \| `null` | Current study/view mode |
| `theme` | `'dark'` \| `'light'` | Current UI theme, persisted in `localStorage` |
| `isHeaderCollapsed` | `boolean` | Collapsible header state (auto-collapses on scroll > 80px) |
| `activeTab` | `'decks'` \| `'scan'` \| `'add'` | Main navigation state (My Decks vs AI Scan vs Create Deck) |
| `pinnedDecks` | `string[]` | Array of `deck_id` values, persisted in `localStorage` |
| `sortOrder` | `'none'` \| `'asc'` \| `'desc'` | Deck list sort state, persisted in `localStorage` |
| `userLoggedIn` | `boolean` | Whether Google session is active |
| `driveFileId` | `string` \| `null` | Drive file ID of `decks.json` for update calls |
| `isSyncing` | `boolean` | Shows top progress bar during sync |
| `isSelectionMode` | `boolean` | Whether bulk-delete selection mode is active on deck list |
| `selectedDecks` | `Set<string>` | Set of `deck_id` values selected for bulk deletion |
| `isImportModalOpen` | `boolean` | Controls visibility of the `ImportSharedDeckModal` |
| `importModalInitialId` | `string` | Holds the pre-filled ID passed to `ImportSharedDeckModal` (e.g., from notifications) |
| `showDeleteConfirm` | `boolean` | Controls visibility of the deck-delete `ConfirmationModal` |
| `isDeleting` | `boolean` | Shows loading spinner in delete modal while async deletion runs |
| `confirmConfig` | `ConfirmConfig` | Config object driving the generic `ConfirmationModal` (title, description, type, icon, onConfirm) |

**App Rendering Logic (Waterfall):**

```
App.jsx renders (single return block — three conditional branches):
  1. !data         → Login Screen (FileLoader + Google Sign-in header)
  2. !selectedDeck → Main Interface (Sticky Header + Body Content + Taskbar)
      2a. activeTab = 'decks' → My Decks list + Search/Sort (now in main body)
      2b. activeTab = 'scan'  → AI Scan Interface (<AIScan />)
      2c. activeTab = 'add'   → Create Deck Interface (<AddDeckView />)
  3. selectedDeck  → Study Mode Shell (sticky header with tabs: Modes | Manage)
      3a. mode is null or 'home' → Mode picker (Flashcards / Quiz Mode cards)
      3b. mode = 'flashcard'     → <FlashcardMode />
      3c. mode = 'quiz'          → <QuizMode />
      3d. mode = 'manage'        → <DeckManager />

Globally-mounted modals (outside all branches, always in DOM):
  - <Taskbar>                 Fixed navigation with animated expansions
  - <ImportSharedDeckModal>   clone a deck by shared ID
  - <ConfirmationModal>       deck delete (showDeleteConfirm + isDeleting)
  - <ConfirmationModal>       all other dialogs (confirmConfig object)
```

### 4.3 Component Reference

#### `Taskbar.jsx` (New — 2026-04-07)

- **Purpose**: Centralized navigation component that remains visible even when the header collapses.
- **Design**: Fixed bottom position (`position: fixed; bottom: 30px`). Uses `lucide-react` icons and high-performance CSS transitions (`cubic-bezier`) for smooth "text expansion" effects on hover/active.
- **State Integration**: Toggles `activeTab` ('decks', 'add', 'scan') or `setMode('manage')` depending on the current app view.
- **Logic**: Automatically highlights the active item based on the application's current `activeTab` or `mode`.

#### `AIScan.jsx`

- **Props:** `userLoggedIn: boolean`, `onScanComplete: (deck: Deck) => void`
- **State Phases:** `idle → scanning → done | cancelled`
- **Key Logic:**
  1. Load `config.json` from Drive on mount (API keys, batch_size)
  2. User selects a folder → images filtered (jpg/png/webp/bmp)
  3. On "Start AI Scan": validate all keys in parallel → generate PDFs → process via Worker Pool
  4. On complete: call `onScanComplete(newDeck)` which triggers Drive upload

#### `AddDeckView.jsx` (Upgraded — 2026-04-07)

- **Purpose**: Create a new deck via Bulk Import or Manual Entry.
- **Evolution**: Converted from a Modal (`AddDeckModal`) to a **full-page view** to provide more space for manual entry and bulk parsing.
- **Access**: Directly via the **Taskbar** (Add icon).
- **Format**: Integrated into the `activeTab === 'add'` rendering branch. Includes its own glass-panel container with centered alignment.

#### `AdminDashboard.jsx`

- **Purpose:** Securely manage global settings, monitor user growth, and configure system-level API rotation.
- **Layout:** Redesigned on **2026-04-05** to a **Sidebar + Content Area** layout for better scalability.
- **Tabs:**
  - **User Management**: Displays a paginated table of all registered users (`google_id`, `email`, `created_at`, `updated_at`). Includes a **Timezone Selector** (supports auto-detect or manual select) to format timestamps correctly for local admin review.
  - **Groq API Keys**: Manages the pool of keys used by `ChatBubble.jsx`. Features masked key display, "Last Updated" timestamps, and direct server-side deletion.
- **Security:** Access is gated by the `isAdmin` middleware on the backend, which strictly validates the requester's identity via the `x-user-email` header against a hardcoded developer whitelist (`binhlhce200315@gmail.com`).
- **UI/UX:** Uses the global `ConfirmationModal` for all destructive actions (deleting keys). The admin's own email is hidden from the header to maintain a clean, professional management interface.

#### `ChatBubble.jsx`

- **Props:** `currentCard: Card`, `userLoggedIn: boolean`
- **Purpose:** Provides a floating AI chat assistant for explaining flashcards and answering card-specific questions.
- **Idle-Fade Pattern:**
  - Defaults to `0.3` opacity (visually unobtrusive) when idle.
  - Click 1: Wakes up to `1.0` opacity. Automatically returns to `0.3` after 3 seconds if untouched.
  - Click 2: Expands into a full chat window.
- **State:** Maintains stateful conversation history while studying a card. The full `messages[]` array is sent to the `/chat/ask` endpoint on each interaction. The conversation history is automatically cleared whenever `currentCard` changes to prevent context mixing between different flashcards. Passes card content via `card_context` field.
- Disabled via CSS and tooltip if `userLoggedIn === false`.

#### `DeckManager.jsx`

- **Props:** `deck: Deck`, `onBack: () => void`, `onDeckModified: () => void`
- **Tabs:** `"view"` (paginated card list) | `"dedup"` (duplicate detection) | `"share"` (Share Deck UI) | `"import"` (Merge Deck UI)
- The `"share"` tab renders `ShareDeckView.jsx` inline — no modal or separate route needed.
- The `"import"` tab renders a grid of other available decks to merge into the current one, resetting progress to `0` for all imported cards.
- **Duplicate Detection Algorithm:**
  1. Normalize question text (lowercase, collapse whitespace)
  2. Build 3-gram shingles for each card
  3. Build inverted index: shingle → card indices
  4. Jaccard pre-filter (threshold - 0.15) to get candidate pairs
  5. Full LCS-based similarity on candidates
  6. Combined score: `qRatio * 0.6 + ansRatio * 0.4`
  7. Auto-select "B" cards for exact (≥99%) matches

#### `ShareDeckView.jsx`

- **Purpose:** UI for sharing a snapshot of a deck with other users via email and managing existing permissions.
- **Key Features:**
  - **Invite Creation**: Submits new emails to `/share/create`. The backend intelligently filters out users who already have access and only emails the new ones.
  - **Access Management**: Fetches the active list of permitted viewers (`GET /share/invites`) on mount and displays them. Supports revoking access via `DELETE /share/invite`. Destructive actions are guarded by `ConfirmationModal`.
  - **Standalone Snapshot**: Recipients receive a standalone clone of the deck based on the state at the exact time of sharing; their local edits do not affect the owner's original deck.

#### `SettingsPage.jsx`

- **Purpose:** Centralized user configuration panel introduced on **2026-04-06** replacing scattered logic.
- **Key Features:**
  - **Email Notifications**: Controls the strict opt-in logic for receiving shared deck emails (`receive_email_enabled: false` by default). Includes debounced auto-save functions.
  - **Gemini API Keys**: Directly reads/writes `config.json` on Google Drive AppDataFolder (`configService.js`).
  - **My Decks**: Full grid overview of deck statistics (known/progress/card count), renaming capabilities, and direct access resetting.
  - **Danger Zone**: Houses the "Nuclear Delete" feature that recursively wipes Google Drive data (`decks.json`, `config.json`), and requests Supabase backend `DELETE /settings/delete-all-data` to wipe `deck_progress`, `quiz_sessions`, etc.
- **UX**: Built with an isolated full-screen glass layout, responsive mobile tabs, and protected with `ConfirmationModal` guarding all destructive actions.

#### `FlashcardMode.jsx`

- Renders cards sequentially with swipe/keyboard/button navigation
- Tracks `known` / `unknown` counts, saves card progress to Supabase
- Cards color-coded: green (status=2), orange (status=1), grey (status=0)

#### `QuizMode.jsx`

- Randomized question order with session persistence (resume on reload)
- Supports `single_choice` and `multiple_choice` types
- Detects letter-format `["A"]` vs full-text-format answers
- Answers auto-saved to Supabase `quiz_sessions` table after each question

#### `NotificationBell.jsx`

- **Hybrid Notification Engine** (Upgraded **2026-04-06**): Displays two synchronized alert streams simultaneously:
  - **System Notifications:** Fetched from global `/notifications`, read state persisted locally in `localStorage`.
  - **Shared Decks:** Fetched from `/share/notifications`, read state persisted globally via Supabase `PATCH`.
- Renders dynamic unread badges, relative timestamps, and visual read/unread highlights.
- Clicking "Import Deck" natively calls `onOpenImportModal(deck_id)`, propagating the ID straight into `ImportSharedDeckModal` for seamless 1-click loading.
- Dropdown z-index: **`9999`** to always appear above all UI elements
- `overscroll-behavior: contain` prevents background page scroll

### 4.4 Services

#### `driveSync.js` — Token Management

```javascript
// Token flow:
// 1. Check URL params for access_token (fresh OAuth redirect from backend)
// 2. Store token + expiry in localStorage
// 3. Before expiry (2-min buffer), auto-refresh via POST /auth/refresh
// 4. On 401 from Drive API, call logoutGoogle() to clear state

export async function getValidToken() {
  // Returns valid access_token, refreshing silently if needed
}

export async function fetchDecksFromDrive() {
  // Returns: { fileId, data } — merges Supabase card_progress into data
}

export async function uploadDecksToDrive(jsonData, existingFileId) {
  // PATCH if existingFileId, POST if new — multipart upload
}
```

#### `configService.js` — API Key Storage

- Stores `config.json` in Drive AppDataFolder (never in localStorage)
- Functions: `loadConfigFromDrive()`, `saveConfigToDrive(config, fileId)`
- Default config: `{ api_keys: [], batch_size: 30, updated_at: '' }`

#### `geminiService.js` — Worker Pool Orchestrator

**Flow:**

```
processBatches(pdfBatches, pageCounts, apiKeys, callbacks, signal, imageBatches)
│
├── Create queue of { batchIndex, retries } for each PDF batch
├── Spawn N workers (one per API key) — all start simultaneously
│
│   [Each Worker Loop]
│   ├── Pull task from shared queue
│   ├── Call sendBatch(pdf, key, ...) → POST /scan/process
│   ├── On success: store result, update progress, sleep 2s
│   ├── On failure (retries < 2): re-queue with retries+1
│   │   ├── If 429: sleep 15s before re-queue
│   │   └── Otherwise: sleep 5s
│   └── On permanent failure (retries=2 AND pageCount > 1):
│       ── BINARY SPLIT: divide images in half, create 2 sub-PDFs
│       ── Add sub-batches to queue with retries=0
│
└── await Promise.all(workers) → collect and flatten all results
```

**Binary Split Logic:**

```javascript
// If a batch permanently fails with >1 image:
const mid = Math.ceil(imgs.length / 2);
const halfA = imgs.slice(0, mid);
const halfB = imgs.slice(mid);
// Both halves are re-queued independently, isolating the problematic image
```

#### `dedupService.js` — Duplicate Detection

- Algorithm: N-gram Shingling (3-gram) → Jaccard pre-filter → LCS-based similarity
- Combined score: `question_ratio * 0.6 + answer_ratio * 0.4`
- Default threshold: `0.85`
- Optimized with `Uint16Array` and inverted index for large decks (500+ cards)

### 4.5 Backend API Reference (Express.js)

**Base URL:** `https://flashcard-ai-bs67.onrender.com`

**`/ping`**

| Method | Path | Description |
| :--- | :--- | :--- |
| GET | `/ping` | Keep-alive endpoint pinged by Google Apps Script |

**`/auth` routes**

| Method | Path | Request | Response | Notes |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/auth/google` | — | `302 Redirect` to Google OAuth | Starts OAuth flow. Scopes: drive.appdata, drive.file, email |
| GET | `/auth/callback` | Query: `code` | `302 Redirect` to frontend with tokens | Exchanges code for tokens, upserts user to Supabase |
| POST | `/auth/refresh` | Body: `{ google_id }` | `{ access_token, expiry }` | Refreshes token using stored refresh_token from Supabase |

**`/scan` routes**

| Method | Path | Header | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/scan/validate` | `x-gemini-key` | — | `{ valid: bool, msg: string }` |
| POST | `/scan/process` | `x-gemini-key` | `{ pdf_base64, batch_index, total_batches, page_count, model_index }` | `{ cards[], batch_index, model_used, parse_error }` |

**`/admin` routes**

Gated by `isAdmin` middleware (Identity check via `x-user-email` header).

| Method | Path | Request Body | Response | Notes |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/admin/dashboard` | — | `{ total_users, api_keys, keys_updated_at }` | Overview stats and keys |
| GET | `/admin/users` | — | `{ users: [ {google_id, email, created_at, updated_at}, ... ] }` | Full user list, sorted by Newest |
| POST | `/admin/settings/keys` | `{ keys: string[] }` | `{ success: true }` | Upsert full API key list |
| DELETE | `/admin/settings/keys/:idx`| — | `{ success, api_keys, keys_updated_at }` | Server-side deletion of a specific key index |

> The `/scan/process` endpoint uses a 4-layer JSON recovery strategy:
> 1. Direct `JSON.parse()`
> 2. Regex extract `[...array...]`
> 3. Auto-fix (trailing commas, missing brackets)
> 4. Partial object extraction (regex on individual `{...}` objects)

**`/chat` routes**

| Method | Path | Request Body | Response | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/chat/ask` | `{ messages[], user_question(legacy), card_context, system_prompt }` | `{ reply: string, provider: 'groq' }` | Accepts full conversation history. Uses rotated Groq keys exclusively. |

> The `/chat/ask` endpoint features an **automatic API key rotation system**. It pulls an array of Groq API keys from the Supabase `system_settings` table, shuffles them randomly for load balancing, and iterates through them until one succeeds. The previous Gemini fallback has been strictly removed to enforce usage of the Groq (Llama 3) models.

**`/progress` routes**

| Method | Path | Request | Response |
| :--- | :--- | :--- | :--- |
| POST | `/progress/save` | `{ google_id, deck_id, percent }` | `{ message }` |
| GET | `/progress` | Query: `google_id` | `{ data: [...] }` |
| POST | `/progress/quiz/save` | `{ google_id, deck_id, session_id, question_order, current_index, answers, ... }` | `{ message }` |
| GET | `/progress/quiz/:deck_id` | Query: `google_id` | `{ data: session \| null }` |
| POST | `/progress/cards/save` | `{ google_id, deck_id, cards_map }` | `{ message }` — calls `merge_deck_progress()` RPC |
| GET | `/progress/cards/:deck_id` | Query: `google_id` | `{ data: { card_id: status, ... } }` |
| POST | `/progress/deck/on-modified` | `{ google_id, deck_id, card_id?, action }` | `{ message }` — deletes `quiz_sessions`, resets card status in `deck_progress` |

**`/share` routes**

| Method | Path | Request Body | Response | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/share/create` | `{ google_id, deck_id, deck_data, receiver_emails[] }` | `{ message, newlySharedCount }` | Upserts deck snapshot to `shared_decks`. Filters out existing emails to prevent spam resending. Fire Gmail API invitations under `Bcc` AND inserts alert records into the `notifications` table for real-time app delivery. |
| GET | `/share/invites/:deck_id` | Query: `google_id` | `{ invites: [...] }` | Retrieves the list of currently shared email invitations. Validates that the requested `google_id` matches the deck owner. |
| GET | `/share/view/:deck_id` | Query: `email` | `{ deck_data }` | Returns the JSONB snapshot for the given `deck_id` if the `email` exists in `deck_invites`. Used by `ImportSharedDeckModal`. |
| DELETE | `/share/invite` | `{ deck_id, receiver_email, google_id }` | `{ message }` | Removes a specific email's access to the shared deck (deletes from `deck_invites`). Validates ownership via `google_id`. |
| GET | `/share/notifications` | Query: `email` | `{ notifications: [...] }` | Fetches personalized alerts for received decks, returning newest first. |
| PATCH | `/share/notifications/read`| `{ ids: string[] }` | `{ success: true }` | Marks an array of database-stored notifications as `is_read = true`. |

> **Email Invitation Detail:** `POST /share/create` queries the `users` table to resolve the sender's email (`google_id → email`), then constructs an RFC 2822 HTML email encoded as `base64url` and sends it via `gmail.users.messages.send`.
> - **Opt-in Privacy:** Only registered users with an active `user_settings` record and `receive_email_enabled = true` will be added to the `Bcc` broadcast list. New or opted-out users will never receive emails, but their decks will still seamlessly sync via in-app notifications.
> - **Privacy (BCC):** To prevent recipients from seeing each other's addresses, the list of emails is placed in the `Bcc` header. The `To` header is set to the system's `EMAIL_NOTIFY` address.
> - **Quick Access:** The email body includes a prominent call-to-action button and a text link pointing to `https://lhb16-flashcard-ai.pages.dev/`.
> - **Protocol:** This approach uses HTTPS instead of SMTP, bypassing Render Free Tier's outbound port block.

**`/settings` routes**

| Method | Path | Request Body | Response | Notes |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/settings/email` | Query: `google_id` | `{ receive_email_enabled, send_email_enabled }` | Returns email preferences. Defaults to `false` for receive if no record exists. |
| POST | `/settings/email` | `{ google_id, receive_email_enabled, send_email_enabled }` | `{ message }` | Upserts user preferences. Debounced on the frontend. |
| DELETE | `/settings/delete-all-data`| `{ google_id }` | `{ message }` | Nukes all relational progress, sessions, invites, and notifications linked to the `google_id`. Used by Danger Zone. |

### 4.6 Google OAuth Flow (Step-by-Step)

```
User clicks "Sign in with Google"
  │
  ▼
Frontend: window.location = /auth/google
  │
  ▼
Backend (auth.js): oauth2Client.generateAuthUrl()
  → Scopes: drive.appdata, drive.file, userinfo.email
  │
  ▼
Google Consent Screen
  │
  ▼
Google redirects to: /auth/callback?code=...
  │
  ▼
Backend (auth.js):
  1. oauth2Client.getToken(code) → { tokens }
  2. googleapis.oauth2.userinfo.get() → { email, googleId }
  3. Supabase UPSERT: users(google_id, email, refresh_token)
  4. Redirect to FRONTEND_CALLBACK_URL?access_token=...&google_id=...&expiry=...&email=...
  │
  ▼
Frontend (driveSync.js: initGoogleIdentity):
  1. Parse URL params → save to localStorage (g_token, g_id, g_expiry, g_email)
  2. Clean URL with history.replaceState()
  3. Call handleSyncFromDrive() → fetch decks from Drive
```

### 4.7 Drive Sync Flow (Step-by-Step)

```
handleSyncFromDrive():
  │
  ├─ fetchDecksFromDrive()
  │   ├── getValidToken() → check expiry, refresh if needed
  │   ├── GET /drive/v3/files?spaces=appDataFolder&q=name='decks.json'
  │   ├── GET /drive/v3/files/{id}?alt=media → download JSON
  │   └── Merge Supabase card_progress into each deck's cards
  │
  ├─ setData(mergedDecks)
  │   └── Merge: Drive data is source of truth, local card statuses applied on top
  │
  └─ After any deck mutation:
      uploadDecksToDrive(newData, fileId)
        ├── PATCH if fileId exists (update)
        └── POST if new (create in appDataFolder)
```

### 4.8 AI Scan Flow (Step-by-Step)

```
User selects folder → filterImageFiles() → setImageFiles()
  │
  ▼
"Start AI Scan" button
  │
  ├── Phase 0: Validate API Keys
  │   └── validateKeysParallel(keys) → parallel GET /scan/validate
  │       Returns only alive keys
  │
  ├── Phase 1: Generate PDFs
  │   └── For each batch of images: imagesToPdf(files) → base64 PDF string
  │       (Uses pdf-lib in browser, no server needed)
  │
  ├── Phase 2: Worker Pool (geminiService.processBatches)
  │   ├── N workers (one per alive API key) pull from shared queue
  │   ├── Each worker: POST /scan/process → backend proxies to Gemini
  │   ├── On failure: retry up to 2 times (with 429 backoff)
  │   └── On permanent failure + >1 image: Binary Split re-queue
  │
  └── Phase 3: Save
      └── "Save Deck & Sync" → onScanComplete(newDeck) → uploadDecksToDrive()
```

### 4.9 Environment Variables

**Backend (`appBackend/.env`)**

| Variable | Example Value | Purpose |
| :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | `900559...apps.googleusercontent.com` | OAuth2 client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | `.../auth/callback` | Must match exactly what's registered in Google Cloud |
| `FRONTEND_URL` | `https://lhb16-flashcard-ai.pages.dev` | CORS origin whitelist |
| `FRONTEND_CALLBACK_URL` | same as above | Where backend redirects after OAuth |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase project URL |
| `SUPABASE_KEY` | `sb_publishable_...` | Supabase anon/publishable key |
| `PORT` | `3000` | Express server port (Render overrides this) |
| `EMAIL_NOTIFY` | `flashcardai.notify@gmail.com` | Gmail address used as the sender for deck invitation emails |
| `GMAIL_REFRESH_TOKEN` | `1//0gcDLW0-...` | OAuth2 Refresh Token for the notify Gmail account. Used by Gmail API to send emails via HTTPS (bypasses Render SMTP port blocking). Generated once via `get-gmail-token.js`. |

**Frontend (`appWeb/.env`)**

| Variable | Example Value | Purpose |
| :--- | :--- | :--- |
| `VITE_BACKEND_URL` | `https://flashcard-ai-bs67.onrender.com` | Backend URL for all API calls |

### 4.10 Performance & UX Optimization (Core Web Vitals)

The web application is engineered for high performance, focusing on **Core Web Vitals (CWV)** to ensure a professional, zero-jank user experience on both desktop and mobile platforms.

#### Optimization Matrix

| Metric | Mitigation Strategy | Implementation |
| :--- | :--- | :--- |
| **LCP** (Largest Contentful Paint) | Strategic Font Preloading | `<link rel="preconnect">` and `<link rel="stylesheet">` in `index.html`. |
| **CLS** (Cumulative Layout Shift) | Predictive Skeleton Placeholders | Shimmering `Skeleton.jsx` components mirroring real UI structure. |
| **FID** (First Input Delay) | Priority Management | Critical CSS variables and `font-display: swap` in `index.css`. |
| **Stability** | Layout Anchors | `min-height` and fixed aspect ratios for dynamic containers. |

#### Layout Stability Logic (CLS Prevention)

Layout shift is mitigated by maintaining a consistent component structure during asynchronous operations (Google Drive sync, AI Scans). 

```
[Component Entry]
│
├── Render Structure (App-Main > Home-Container)
│   ├── Column A: UserState/SyncState
│   │   ├── IF (loading) → <HomeSkeleton /> (Fixed Height)
│   │   └── IF (ready)   → <ActionPanel /> (Dynamic Content)
│   │
│   └── Column B: FileLoader/AIResult
│       ├── IF (loading) → <Skeleton height="200px" />
│       └── IF (ready)   → <FileLoader />
│
└── [Result] → No structural collapse during state transitions.
```

#### `Skeleton.jsx` Interface

A reusable component that provides shimmering placeholders for nearly all UI elements.

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `width` | `string` | `"100%"` | Width of the placeholder container. |
| `height` | `string` | `"20px"` | Height of the placeholder container. |
| `borderRadius` | `string` | `"8px"` | Corner radius for shape matching. |
| `className` | `string` | `""` | Additional CSS classes for custom styling. |

**Animation System:** Uses a high-performance CSS `@keyframes shimmer` (linear gradient shift) to provide visual feedback without CPU-heavy operations.

#### Resource Priority Strategy

To achieve sub-1.5s LCP targets, resource discovery is moved as early as possible in the document lifecycle.

1.  **Font Preconnect**: `index.html` initiates a handshake with Google Fonts infrastructure (`fonts.gstatic.com`) immediately.
2.  **CSS Decoupling**: Removed `@import` from `index.css` to eliminate the "import-chain" load delay, replacing it with a parallelized `<link>` tag in the `<head>`.
3.  **Container Anchoring**: Strategic `min-height: 480px` (HomeContainer) and `380px` (HomeColumn) in `index.css` ensure that the "above-the-fold" coordinates remain stable throughout the entire paint cycle.

### 4.11 DeckManager — Card Editing Engine

Added in **2026-04-02**, `DeckManager.jsx` was extended with a full card creation and editing workflow, alongside a series of correctness and data-consistency fixes.

#### 4.11.1 Add Card & Merge Deck Features

A new **Add Card** button in the `view` tab opens the edit form pre-populated with a blank card template. The workflow is identical to editing an existing card.

```javascript
// Correct implementation: both state transitions must fire together
setEditingCard({
  index: -1,
  isNew: true,
  data: {
    card_id: uuidv4(),       // unique identity for Supabase progress
    question: '',
    options: ['A. ', 'B. ', 'C. ', 'D. '],
    correct_answers: [],
    question_type: 'single_choice',
    status: 0,
    notes: ''
  }
});
setTab('edit'); // ← was missing; without this, the form never renders
```

> **Bug fixed:** The original `onClick` handler called `setEditingCard(...)` but omitted `setTab('edit')`, so clicking "Add Card" silently set state without rendering the editor.

**Merge / Import Deck:** (Added 2026-04-05) The Add Card action was upgraded into a dropdown that also includes "Import from Deck". This opens a dedicated `tab === 'import'` view. When merging, `handleMergeDeck` creates a deep copy of the selected deck's cards, assigns new UUIDs to prevent ID collisions, and forces `status: 0` (Unlearned) so progress is cleanly reset for newly imported cards. Existing cards in the current deck retain their progress.

#### 4.11.2 Card Validation Before Save

Before committing a card to the deck, the save handler enforces the following rules in order:

| Rule | Condition | Alert Message |
| :--- | :--- | :--- |
| Non-empty question | `question.trim() === ''` | `"Question content cannot be empty!"` |
| At least one correct answer | `correct_answers.length === 0` | `"Please select at least one correct answer!"` |
| Single-choice: exactly 1 answer | `type === 'single_choice' && count !== 1` | `"Single Choice questions must have exactly 1 correct answer!"` |
| Multiple-choice: at least 2 answers | `type === 'multiple_choice' && count < 2` | `"Multiple Choice questions must have at least 2 correct answers!"` |

#### 4.11.3 Deck ID Fallback for Legacy Decks

Older decks created before `deck_id` was introduced may not carry this field. All structure-change notifications now use a resolved identifier:

```javascript
// Resolves the best available identifier for the deck
const deckIdToSync = deck?.deck_id || deck?.title || deck?.name;
```

This ensures `notifyDeckStructureChanged()` always delivers a valid `deck_id` to the backend, regardless of the deck's origin.

#### 4.11.4 Deck Structure Change Notification Flow

Whenever a card is added, edited, or deleted, the frontend must synchronize the backend database to maintain study-session consistency.

```
User saves card edit
  │
  ├── await notifyDeckStructureChanged(deckIdToSync, card_id, 'edit')
  │     │
  │     └── POST /progress/deck/on-modified
  │           ├── DELETE quiz_sessions WHERE deck_id = deckId
  │           │     → Forces Quiz Mode to restart with the new question set
  │           │
  │           └── UPDATE deck_progress SET cards_status[card_id] = 0
  │                 → Resets the edited card's Flashcard status to "New"
  │
  ├── deck.cards = newCards   (local mutation)
  ├── onDeckModified()        (triggers Drive upload + React re-render)
  └── setTab('view')
```

> The `await` before `notifyDeckStructureChanged()` is critical. Without it, the user can navigate back to Quiz Mode before the `quiz_sessions` deletion completes on the backend, causing the stale session to be loaded one last time.

#### 4.11.5 Progress Sync Fix in `handleDeckModified`

`handleDeckModified` in `App.jsx` is the central callback fired after any deck mutation. Two correctness issues were resolved:

**Issue 1 — Shallow Copy:** The original `setSelectedDeck(prev => ({ ...prev }))` only created a shallow copy of the deck object. Since `prev.cards` still pointed to the mutated array, React's reconciler could not detect changes in child components that depended on `deck.cards`.

```javascript
// Before: shallow copy — children may not re-render
setSelectedDeck(prev => prev ? { ...prev } : prev);

// After: deep copy of cards array triggers correct re-render
setSelectedDeck(prev => {
  if (!prev) return prev;
  return { ...prev, cards: [...(prev.cards || [])] };
});
```

**Issue 2 — Stale Closure:** `handleDeckModified` is memoized with `useCallback`. When it read `selectedDeck.cards` to compute the progress percentage for Supabase, it used the version of `selectedDeck` captured at memoization time — which was the *pre-mutation* state.

```javascript
// Before: reads stale selectedDeck from closure
const known = selectedDeck.cards.filter(c => c.status === 2).length;

#### 4.11.6 Shuffle Functionality (Added 2026-04-07)

`DeckManager.jsx` now provides two randomization tools to help users vary their study materials: **Shuffle Questions** and **Shuffle Options**.

**1. Shuffle Questions:**
Randomizes the entire `deck.cards` array using the Fisher-Yates shuffle algorithm. This permanently changes the order of cards in the deck stored in Google Drive.
- **Icon**: `Shuffle` (color: `var(--warning)`)
- **Trigger**: Menu "Add Card" -> "Shuffle Questions"

**2. Shuffle Options:**
Randomizes the order of options (A, B, C, D...) for selected cards or all cards if none are selected.
- **Icon**: `Shuffle` (color: `#3b82f6`)
- **Preservation of Correct Answers**: The logic extracts the raw text of the correct answer before shuffling, randomizes the options, and then re-maps the `correct_answers` array to the new letters (A, B, C, D) tương ứng với nội dung đáp án đúng.
- **Trigger**: Menu "Add Card" -> "Shuffle Options"

```javascript
// Mapping correct answers after option shuffle
const correctTexts = card.correct_answers.map(ans => {
  const matchingOpt = card.options.find(o => o.startsWith(ans + '.') || o === ans);
  return matchingOpt ? getRaw(matchingOpt) : ans;
});
// ... shuffle rawOptions ...
card.options = rawOptions.map((text, i) => `${String.fromCharCode(65 + i)}. ${text}`);
card.correct_answers = card.options
  .filter(opt => correctTexts.some(txt => getRaw(opt) === txt))
  .map(opt => opt.charAt(0));
```

// After: finds the fresh deck from the always-current dataRef
const freshDeck = freshData.find(d => d.deck_id === selectedDeck?.deck_id);
const known = freshDeck.cards.filter(c => c.status === 2).length;
```

The `useCallback` dependency was also narrowed from `selectedDeck` (entire object) to `selectedDeck?.deck_id` (scalar string) to avoid unnecessary callback recreation on every card-status update.

#### 4.11.6 Critical Bug: Mis-Routed API Endpoint

All calls to `notifyDeckStructureChanged()` were silently returning HTTP `404` because the target URL was incorrect.

| | URL |
| :--- | :--- |
| **Incorrect (before)** | `POST ${BACKEND_URL}/deck/on-modified` |
| **Correct (after)** | `POST ${BACKEND_URL}/progress/deck/on-modified` |

The handler is defined in `routes/progress.js`, which is mounted by `index.js` under the `/progress` prefix (`app.use('/progress', progressRoutes)`). The missing prefix segment caused every structure-change notification to fail with a 404, meaning:

- Quiz sessions were **never deleted** after card edits → stale quiz state persisted across page reloads.
- Card statuses in `deck_progress` were **never reset** → the edited card appeared as already-learned on the next Flashcard session.

---

### 4.12 Share & Clone Deck Feature

Added in **2026-04-02**. Extended with **Gmail API email invitation** on **2026-04-05**. Allows users to share any deck via email or a sharable Deck ID. Recipients receive a fully independent clone that does not affect the original.

#### 4.12.1 Design Principles

- **Snapshot model, not live link:** When a user shares a deck, the entire `deck_data` JSON is written to Supabase at that moment. If the owner later edits or deletes their deck, recipients are unaffected.
- **Clone on import:** When a recipient imports via Deck ID, the app fetches `deck_data` from `shared_decks`, assigns a fresh `uuidv4()` as the new `deck_id`, resets all `card.status` to `0`, and clears timestamps. The cloned deck is uploaded to the recipient's Drive as a completely new, independent entry.
- **No forced navigation on load:** After importing, the app sets `selectedDeck(null)` and `mode(null)` so the user always lands on the deck list — never silently dropped into study mode.
- **Gmail API over SMTP:** Email sending uses `googleapis` (`gmail.users.messages.send`) via HTTPS, not Nodemailer/SMTP. This is required because Render Free Tier blocks outbound SMTP ports (465/587).

#### 4.12.2 Share Flow

```
User opens DeckManager → clicks "Share Deck" tab
  │
  ├── ShareDeckView.jsx renders:
  │     ├── Deck ID display + "Copy ID" button (copies deck.deck_id to clipboard)
  │     ├── Textarea for recipient email addresses (comma, newline, or semicolon separated)
  │     └── "Share Now" button
  │
  ▼
POST /share/create
  Body: { google_id, deck_id, deck_data (full JSON), receiver_emails[] }
  │
  ├── Supabase UPSERT → shared_decks (deck_id, owner_id, deck_data)
  ├── Supabase DELETE + INSERT → deck_invites (deck_id, receiver_email) × N emails
  ├── Supabase SELECT → users WHERE google_id = ? → resolve senderEmail
  │
  └── Gmail API (fire-and-forget, không block response)
        ├── Build RFC 2822 HTML email (base64url encoded)
        │     Subject: "${senderEmail} shared the Flashcard Deck "${deckName}" with you"
        │     Body: Header banner (blue #2563eb) + Deck ID highlight box + CTA + Footer
        └── gmail.users.messages.send({ userId: 'me', raw: ... })
              → Uses GMAIL_REFRESH_TOKEN to auto-obtain Access Token via HTTPS
```

#### 4.12.2.1 Gmail Token Setup (One-Time)

The `get-gmail-token.js` script (located in `appBackend/`) provides a one-time OAuth2 flow to obtain the `GMAIL_REFRESH_TOKEN` for the notify Gmail account:

1. Add `http://localhost:3456/callback` to Authorized Redirect URIs in Google Cloud Console
2. Run: `node get-gmail-token.js`
3. Open the printed URL, sign in with the notify account, grant `gmail.send` scope
4. Copy the Refresh Token printed in terminal → set as `GMAIL_REFRESH_TOKEN` on Render
5. Token does not expire unless revoked; no need to repeat this step
```

#### 4.12.3 Import (Clone) Flow

```
User clicks "Add Deck" → clicks "Import" button in modal header
  │
  ├── ImportSharedDeckModal opens
  │     └── User pastes a Deck ID
  │
  ▼
GET /share/view/:deck_id
  Response: { deck_data: { ...original deck JSON... } }
  │
  ▼
handleDeckImported(clonedDeck) in App.jsx:
  1. Assign new deck_id: uuidv4()
  2. Reset created_at / updated_at to now
  3. Reset all card.status = 0, clear card notes
  4. setData([...data, clonedDeck])
  5. setSelectedDeck(null) + setMode(null)  ← user lands on deck list
  6. uploadDecksToDrive(updated, driveFileId) ← syncs clone to Drive
```

#### 4.12.4 Navigation Fix — No Auto-Select for Single-Deck Users

Before this feature, `handleDataLoaded()` would auto-select the deck and jump to `mode: 'home'` if the user only had one deck. This broke the flow for new users who import a shared deck — they had no way to reach the deck list, switch decks, or log out.

```javascript
// Before: bypassed deck selection for single-deck users
if (decksData && decksData.length === 1) {
  setSelectedDeck(decksData[0]);
  setMode('home');
}

// After: always show the selection list
setSelectedDeck(null);
setMode(null);
```

#### 4.12.5 Global Logout Button

All rendering branches in `App.jsx` (login screen, deck list, study mode) now display a `<LogOut>` button in the header with `color: var(--danger)` (red), ensuring the user always has an escape route regardless of their navigation state.

Clicking Logout opens a `ConfirmationModal` (type `danger`) instead of a native `window.confirm` dialog, consistent with the unified modal system described in **Section 4.13**.

---

### 4.13 ConfirmationModal — Unified Dialog System

Added in **2026-04-02**, `ConfirmationModal.jsx` replaces all native browser dialogs (`window.confirm`, `alert`) across the entire application with a consistent, themed glassmorphism modal.

#### 4.13.1 Component Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `isOpen` | `boolean` | — | Controls visibility. Gate with `if (!isOpen) return null`. |
| `onClose` | `() => void` | — | Called when user clicks Cancel. |
| `onConfirm` | `() => void` | — | Called when user clicks the confirm button. |
| `title` | `string` | — | Bold heading displayed inside the modal. |
| `description` | `string` | — | Body text (subtitle). |
| `confirmText` | `string` | `"Confirm"` | Label for the confirm button. |
| `cancelText` | `string` | `"Cancel"` | Label for the cancel button. |
| `icon` | `LucideIcon` | `AlertTriangle` | Lucide icon component rendered in the colored circle. |
| `type` | `'warning'` \| `'danger'` \| `'info'` | `'warning'` | Controls the color scheme of the modal. |
| `isLoading` | `boolean` | `false` | Shows a `<Loader2>` spinner and disables buttons during async operations. |

#### 4.13.2 Color Scheme by Type

| `type` | Background Tint | Border | Button Color | Typical Use |
| :--- | :--- | :--- | :--- | :--- |
| `warning` | `rgba(251, 191, 36, 0.1)` | `rgba(251, 191, 36, 0.2)` | `#fbbf24` (yellow) | Discard changes, save confirmation |
| `danger` | `rgba(239, 68, 68, 0.1)` | `rgba(239, 68, 68, 0.2)` | `#ef4444` (red) | Delete deck/card, logout |
| `info` | `rgba(59, 130, 246, 0.1)` | `rgba(59, 130, 246, 0.2)` | `#3b82f6` (blue) | Save card edits |

#### 4.13.3 Usage Patterns

Two patterns are used throughout the app:

**Pattern A — Dedicated boolean state** (for deck delete, which needs `isLoading`):

```jsx
// App.jsx
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [isDeleting, setIsDeleting] = useState(false);

<ConfirmationModal
  isOpen={showDeleteConfirm}
  onClose={() => setShowDeleteConfirm(false)}
  onConfirm={confirmDeleteDeck}       // async function, sets isDeleting
  title={`Delete ${selectedDecks.size} Deck(s)?`}
  description="This action cannot be undone. All cards will be lost."
  confirmText="Delete"
  type="danger"
  icon={Trash2}
  isLoading={isDeleting}
/>
```

**Pattern B — Generic `confirmConfig` object** (for all other dialogs):

```jsx
// App.jsx — generic modal driven by confirmConfig state
const [confirmConfig, setConfirmConfig] = useState({
  isOpen: false, title: '', description: '',
  confirmText: '', type: 'warning',
  icon: AlertTriangle, onConfirm: () => {}
});

// To trigger any dialog from anywhere in App.jsx:
setConfirmConfig({
  isOpen: true,
  title: "Logout / Disconnect?",
  description: "Are you sure you want to log out?",
  confirmText: "Logout",
  type: "danger",
  icon: LogOut,
  onConfirm: () => {
    logoutGoogle();
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
  }
});

// JSX at root of App return:
<ConfirmationModal
  isOpen={confirmConfig.isOpen}
  onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
  onConfirm={confirmConfig.onConfirm}
  title={confirmConfig.title}
  description={confirmConfig.description}
  confirmText={confirmConfig.confirmText}
  type={confirmConfig.type}
  icon={confirmConfig.icon}
/>
```

**Pattern C — Early Return Fragment** (used in `QuizMode.jsx` and `FlashcardMode.jsx`):

Because these components return a completely different screen when the study session is finished, the `ConfirmationModal` must be rendered within a fragment alongside both the main UI and the results screen.

```jsx
// QuizMode.jsx simplified
if (isFinished) {
  return (
    <>
      <ResultsUI score={score} onReset={resetQuiz} />
      <ConfirmationModal {...confirmConfig} />
    </>
  );
}

return (
  <>
    <StudyUI onReset={resetQuiz} />
    <ConfirmationModal {...confirmConfig} />
  </>
);
```

> [!WARNING]
> **Modal Rule**: `ConfirmationModal` instances must be mounted at the root level of the component's (or app's) return block. For components with early returns (like `QuizMode`), the modal **must** be duplicated in both return paths or wrapped in a higher-order fragment to ensure it remains functional.

#### 4.13.4 Locations Replaced

| Component | Old Dialog | Trigger |
| :--- | :--- | :--- |
| `App.jsx` | `window.confirm` (logout) | Logout button |
| `App.jsx` | `window.confirm` (bulk delete) | Delete button in selection mode |
| `App.jsx` | `alert` (sync failed) | Drive sync error |
| `AdminDashboard.jsx` | `window.confirm` | Deleting a Groq API key |
| `AddDeckView.jsx` | `window.confirm` (discard new deck) | Cancel button |
| `AddDeckView.jsx` | `alert` (empty name / no cards) | Save validation (e.g. "Missing Name") |
| `AddDeckView.jsx` | `alert` (empty card question) | Manual entry - "Empty Question" |
| `DeckManager.jsx` | `window.confirm` (delete card) | Trash icon on card |
| `DeckManager.jsx` | `window.confirm` (discard edit) | Back arrow in edit form |
| `DeckManager.jsx` | `alert` (invalid card data) | Multiple validations (Empty Question, No Correct Answer, etc.) |
| `QuizMode.jsx` | `window.confirm` | Reset / Study again |
| `FlashcardMode.jsx` | `window.confirm` | Reset / Study again |

---

### 4.14 Mobile UI & Responsive Design

Implemented comprehensively on **2026-04-06**, the frontend layout is fully adaptable to mobile viewports using advanced CSS media queries, structural class abstractions, and viewport optimizations.

#### 4.14.1 Breakpoint Strategy

The mobile UI applies the following distinct breaking points:

| Breakpoint | Target Device Focus | CSS Rule | Implementation Effect |
| :--- | :--- | :--- | :--- |
| **900px** | Tablet/Desktop | `min-width: 900px` | Full multi-column grids and full feature visibility. |
| **768px** | iPad/Vertical Tablet | `max-width: 768px` | Tighter containers, slimmer scrollbars. |
| **640px** | Large Phone | `max-width: 640px` | `deck-grid` collapses to a safe 1-column layout. Editor features are compacted. |
| **480px** | Phone (Portrait) | `max-width: 480px` | Heaviest adjustments: `login-header` splits, `span.hide-on-mobile` elements are hidden (icons-only buttons), flashcard actions become full-width touch targets. |
| **375px** | iPhone SE/Compact Phone | `max-width: 375px` | Reduced font-sizes across H1s/H2s, reduced border-radii (`16px`), smaller paddings to prevent overflow. |

#### 4.14.2 Touch Targets & CSS Best Practices

- **Minimal Dom Interference**: All mobile optimizations were achieved through **CSS Media Queries** and strategic `className` propagation without affecting React's component state or JavaScript logic tree.
- **Mobile Action Buttons**: Buttons have a guaranteed minimum touch target of `44px - 56px` vertically.
- **`.hide-on-mobile`**: An aggressive utility class that completely sets `display: none !important;` on text labels inside buttons on small screens (`<= 480px`). This transforms dual text/icon buttons (e.g. `<RotateCcw> Reset`) into clean, space-saving icon-only buttons (just `<RotateCcw>`).

#### 4.14.3 Safe Layout Wraps

Container overflows are strictly prevented through modern flexbox/grid adjustments:
- E.g. **Share Deck Modal**: Addresses long email overflows by combining `whiteSpace: 'nowrap'`, `textOverflow: 'ellipsis'` with an adjacent explicit `flexShrink: 0` assigned strictly to the delete (Trash) button, ensuring the delete action is never pushed outside the viewport bounds.
- Tab Bars (like `deck-manager-tabs`) leverage sideways momentum-scrolling without wrapping to maintain vertical real-estate on mobile.

---

### 4.15 Frontend Developer Guidelines & Pitfalls

This section documents critical development rules established on **2026-04-03** to ensure application stability and proper cross-device synchronization.

#### 4.15.1 Explicit Hook Imports (Avoiding "White Screen" Crashes)

While the automatic JSX transform handles `<JSX />` syntax without requiring `import React`, it **does not** provide React's globals or hooks.

- **The Pitfall**: Using `React.memo()`, `useState`, `useEffect`, `useRef`, or `useCallback` without an explicit import from the `'react'` package. This causes a `ReferenceError` at module evaluation scope, crashing the entire React tree before it can mount (resulting in a blank page with no errors in the console).
- **The Rule**: Every component file **must** include an explicit import for every React feature it uses:
  ```js
  import React, { useState, useEffect, useCallback, useRef } from 'react';
  ```

#### 4.15.2 Modal Awareness Across UI Branches

The application uses multiple top-level `return` branches (e.g., for Login, Deck List, and Study Modes).

- **The Pitfall**: Global UI elements like `<ConfirmationModal />` (confirmConfig) must be rendered in **every** branch to remain functional. In earlier versions, clicking "Logout" in a study mode did nothing because the modal was only rendered in the "Select a Deck" branch.
- **The Rule**: Any global modal state (Logout, bulk delete, etc.) **must** have its component instances duplicated across all main `return` fragments of `App.jsx`. This ensures the modal animates correctly over the *current* active screen instead of requiring a transition back to the home screen.

#### 4.14.3 Study Session Reset Logic (Sync Integrity)

Clearing local state is insufficient for features that rely on persistent backend synchronization (Supabase).

- **The Pitfall**: Resetting only the local state variables when the user restarts a study session. Upon page refresh, the component will re-fetch the previous (completed) session from the database and immediately lock the user back into the "Finished" state.
- **The Rule**: When resetting a study session, you **must** call the backend reset endpoint to clear the remote record:
  ```js
  // Example in QuizMode.jsx resetQuiz()
  fetch(`${BACKEND_URL}/progress/deck/on-modified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ google_id, deck_id, action: 'reset' })
  });
  ```

---

### 4.15 Access Control & Guest (Offline) Mode

Added on **2026-04-05**, the app shifted from a strict login gate to a permissive, offline-friendly access model. 

#### 4.15.1 Null-Deck Initialization
Previously, if an authenticated user had no `decks.json` in their Google Drive, they were met with an error message and stopped at the Landing screen. Now, the `handleSyncFromDrive` logic intercepts a `null` file result and explicitly triggers `handleDataLoaded([], false)` instead of throwing an error. This drops users directly into an empty Dashboard where they can begin working.

#### 4.15.2 Feature Restrictions (`userLoggedIn: false`)
A user can access the app offline (Guest mode) by uploading a JSON file via the FileLoader on the Landing Screen. Since they cannot sync changes to Google Drive without an OAuth token, modifying the deck structure visually causes data sync divergence.

To safely accommodate offline access while protecting data integrity, core deck mutations and external features are **disabled** (rendered with `opacity: 0.5` and `cursor: not-allowed` instead of completely hidden to manage user expectations):

| Feature | Component | Condition | Rule |
| :--- | :--- | :--- | :--- |
| **Add Deck** | `App.jsx` (Taskbar) | `!userLoggedIn` | Disabled. Prevents users from drafting decks that will be lost on refresh. |
| **Share Deck** | `DeckManager.jsx` (Tab btn) | `!userLoggedIn` | Disabled. Sharing requires inserting data into Supabase bound to a Google ID. |
| **AI Chat** | `ChatBubble.jsx` (Toggle) | `!userLoggedIn` | Disabled. Chat history and AI API requests are tied to user session continuity. |
| **AI Scan** | `App.jsx` (Tab btn) | `!userLoggedIn` | Disabled. Requires Drive authentication for API key resolution. |

When disabled, all restricted buttons display a standard HTML title tooltip: *"Login to Google Drive first"*.

#### 4.15.3 The Empty State Dashboard
When `processedDecks.length === 0` (e.g., brand new users, or users who have cleared their account), the dashboard clears the Grid display and drops an explicit inline CTA:

> *"You don't have any decks yet. Try clicking the **+ Add Deck** or **AI Scan** button to get started!"*

This ensures users aren't left staring at a blank UI while awaiting structure creation.

---

### 4.16 Gooey Taskbar & Global Widget Positioning

Introduced on **2026-04-07**, the application features a modern, fluid `Gooey Taskbar` and a globally accessible `ChatBubble` widget, resolving longstanding architectural challenges related to fixed positioning inside CSS-transformed containers.

#### 4.16.1 Two-Layer Gooey SVG Architecture
The `Taskbar` implements a liquid-like "gooey" animation when merging blobs (the toggle button, connector, and menu strip).
- **The Filter Problem**: SVG filters like `feGaussianBlur` combined with `feColorMatrix` natively destroy standard CSS properties such as `border` and `box-shadow` because they intercept and alter the alpha channel, creating artifacts (inner rings and visual gaps).
- **The Solution**: 
  1. **Layer 1 (The Geometric Shell)**: Contains the pure css blobs without any styling. It sits behind everything and receives the `url(#gooey)` filter to merge the shapes seamlessly.
  2. **Layer 2 (The Content)**: Contains the text, icons, and transparent hitboxes, completely immune to the blur filter.
  3. **Global Drop Shadow**: To apply a clean border or glow around the liquid effect without mangling the shapes, a chained native CSS `drop-shadow()` is mapped *after* the SVG gooey filter on the entire container: `filter: url(#gooey) drop-shadow(...)`.

#### 4.16.2 Portal-Based Sub-rendering (Overcoming the Transform Trap)
A critical issue occurred where `position: fixed` elements (like the `Taskbar` and `ChatBubble`) would erroneously latch onto their parent containers instead of the actual screen viewport whenever the parent layer had a CSS `transform` applied (e.g., `<div className="animate-fade-in">` in `DeckManager.jsx` or `FlashcardMode.jsx`).

- **Taskbar Resolution**: Instead of returning the component DOM directly into the virtual React hierarchy where it's deeply vulnerable to localized bounding grids, the entire Taskbar structure is ported using `ReactDOM.createPortal(..., document.body)`. This forces the fixed absolute blobs to permanently bind to the uncompromised margins of the root layout document.
- **Perfect Alignment Math**: Blobs use mathematically exact Cartesian center-points (`Center Y = 70px` on PC, `Center Y = 50px` on mobile). The expansion button forces a static `left: -40px` off-screen pull against a matching `width: 80px` geometric bounding box, organically snapping to a flush left edge monitor split.

---

## 11. Internationalization (i18n)

The application uses `react-i18next` for full multi-language support (English and Vietnamese).

#### 11.1 Architecture

- **Config File**: `src/i18n.js` contains the dictionary of all translation keys.
- **Hook Usage**: Components use the `useTranslation()` hook to access the `t()` function.
- **Labels**: All UI labels, tooltips, and confirmation messages are assigned unique keys (e.g., `app.title`, `common.cancel`).

#### 11.2 Core Language Updates (2026-04-07)

- **Consolidation**: Fixed a critical bug where duplicate `aiscan` objects in `i18n.js` caused keys to be overwritten, resulting in raw keys showing in the UI. All `aiscan` keys are now merged into a single source of truth.
- **Home Branding**: The main landing screen was renamed from "Select a Deck" to **"Home" (English)** and **"Trang chủ" (Vietnamese)** to create a more intuitive entry point.
- **Taskbar Integration**: Navigation icons in the Taskbar use dynamic labels provided by the i18n system.

---

---

### 4.17 Web Backend Structure and Roles

The Node.js backend operates as a scalable, stateless Express REST API deployed on Render, managing database interactions (Supabase) and proxying integrations with Google's services safely outside the frontend context. 

#### 4.17.1 Root Core Files (`appWeb/appBackend/`)
- `index.js`: The Express entry point. It bootstraps CORS policies and applies strict JSON body limits (e.g., `15MB`) to proactively prevent server OOM crashes under high load. It mounts all API routes and exposes a `/ping` route used to keep the Render free-tier instance awake.
- `supabaseClient.js`: Singleton configuration for the Supabase (PostgreSQL) database client, ensuring efficient connection reusability across all API endpoint handlers.
- `database_setup.sql`: Stores the entire source-of-truth SQL commands to regenerate the underlying PostgreSQL schemas, RPC functions, and Row Level Security definitions for features like `users`, `progress`, `quiz_sessions`, and `shared_decks`.
- `get-gmail-token.js`: A helper script run locally via command-line to manually authorize and retrieve the `GMAIL_REFRESH_TOKEN` necessary for the backend's email sender service.

#### 4.17.2 API Controllers (`appWeb/appBackend/routes/`)
- `auth.js`: Implements the Google OAuth 2.0 authorization code flow. Handles consent redirecting, callback processing, and refresh token exchange. Built optimally using the lightweight `google-auth-library` and direct REST API calls instead of importing the memory-heavy full `googleapis` library.
- `scan.js`: The `/process` endpoint acts as the AI processing workhorse. It parses incoming base64 PDFs and streams them to the Google Gemini AI. To preserve memory integrity during intense processing, this file features a robust **Concurrency Limiter** variable mechanism restricting parallel scans.
- `share.js`: Orchestrates the "Deck Sharing" workflow. On sharing, it persists relationships into the `shared_decks` table and executes direct HTTPS REST API fetch calls to Gmail's `/messages/send` endpoint to deliver customized email invitations independently of bulky dependencies.
- `progress.js`: Acts as the synchronization gateway between the frontend state and Supabase DB. Focuses heavily on managing JSONB columns to securely save, restore, and update incomplete `quiz_sessions` and flashcard mastery variables over persistent remote contexts.
- `admin.js`: Secures system endpoints exclusively for authorized administrators (based on hardcoded email matches). Capabilities include assigning pool-based general API Keys, broadcasting announcements into `system_settings`, and reviewing broad user statistics.
- `chat.js`: The AI Tutor proxy routing `/chat` requests. Manages API Key rotation logic locally, randomly shuffling across pre-defined global keys before hitting the Groq API (e.g., Llama-3) to balance the request load and sidestep strict public rate limits.
- `settings.js`: A user-focused management endpoint handling email-notification preferences toggles and containing a secure "Nuclear Delete" service that completely wipes a matched user profile and all their tracked table entries simultaneously.

---

## 5. appDotNet — C# WPF Desktop

### 5.1 Project Structure

```
appDotNet/
├── build_exe.bat                # Build script → single-file EXE
└── FlashcardAI/
    ├── App.xaml / App.xaml.cs   # Application entry + global resources
    ├── MainWindow.xaml/.cs      # Shell window with navigation frame
    ├── GlobalUsings.cs          # Global using statements
    ├── Models/                  # Deck, Flashcard, Settings, QuizSession
    ├── Services/
    │   ├── AuthService.cs       # Google OAuth + credential management
    │   ├── DedupService.cs      # Duplicate detection (port of Python)
    │   ├── ExportService.cs     # Quizlet/TXT export
    │   ├── GeminiService.cs     # REST API + round-robin + parallel
    │   ├── StorageService.cs    # JSON file read/write
    │   ├── SyncService.cs       # Drive sync + Smart Merge algorithm
    │   └── VideoService.cs      # Video frame extraction (for future use)
    ├── Views/                   # XAML UI Pages
    └── Converters/              # IValueConverter implementations
```

### 5.2 MVVM Architecture

```
┌──────────────┐    binds    ┌──────────────┐    uses    ┌──────────────────┐
│  View (.xaml │◄────────────│  ViewModel   │───────────►│  Services        │
│  + code-bd)  │             │  (Properties │            │  (AuthService    │
│              │  commands   │   Commands   │            │  GeminiService   │
│              │◄────────────│   State)     │            │  SyncService     │
└──────────────┘             └──────────────┘            │  StorageService  │ 
                                   │                     └──────────────────┘
                              INotifyPropertyChanged          │
                                                        ┌─────▼─────────────┐
                                                        │  Models           │
                                                        │  Deck, Flashcard  │
                                                        └───────────────────┘
```

### 5.3 StorageService.cs — File Management

All data stored as JSON files next to the EXE:

| File | Description |
| :--- | :--- |
| `decks.json` | All decks (universal format) |
| `settings.json` | API keys, theme, export format |
| `quiz_sessions.json` | Quiz resume state per deck |

Key methods:

```csharp
StorageService.LoadDecks()         // → List<Deck>
StorageService.SaveDecks(decks)    // Bumps updated_at on all decks
StorageService.SaveDecksRaw(decks) // Does NOT bump updated_at (used by sync)
StorageService.LoadQuizSessions()  // → Dictionary<string, QuizSession>
StorageService.SaveQuizSession(session)
StorageService.DeleteQuizSession(deckId)
```

### 5.4 SyncService.cs — Smart Merge Algorithm

The Smart Merge resolves conflicts between local and remote (Google Drive) versions of `decks.json` using `updated_at` timestamps.

**Pseudocode:**

```
SyncDecksAsync():
  IF no internet → return (false, "No connection")

  remoteDecks = download decks.json from Drive (or [] if not found)
  localDecks  = StorageService.LoadDecks()
  merged = {}

  FOR each remoteDeck in remoteDecks:
    IF localDecks contains remoteDeck.deck_id:
      IF remoteDeck.updated_at > localDeck.updated_at:
        // Remote is newer → use remote, but PRESERVE local ImagePath values
        FOR each localCard WHERE localCard.ImagePath != null:
          remoteCard.ImagePath = localCard.ImagePath
        merged[deck_id] = remoteDeck
      ELSE:
        // Local is newer or equal → keep local
        merged[deck_id] = localDeck
    ELSE:
      // Deck only exists remotely → add it locally
      merged[deck_id] = Deck.FromDict(remoteDeck)

  FOR each localDeck NOT in merged:
    // Deck only exists locally → keep it
    merged[deck_id] = localDeck

  StorageService.SaveDecksRaw(merged.Values)  // No updated_at bump
  UploadJson("decks.json", fileId, merged.Values)
```

> **Why `SaveDecksRaw`?** After merging, we write the merged result without bumping `updated_at`. If we bumped it, the next sync would think local is always newer, breaking the two-way sync.

### 5.5 GeminiService.cs — Key Features

- **Round-robin rotation:** Thread-safe `GetNextKey()` with `lock(_lock)` wrapping `_keyIndex`
- **Model fallback list:** `gemini-2.5-flash` → `gemini-2.5-flash-lite` → ... (6 models)
- **Parallel processing:** `ProcessImagesParallel()` splits images into N packs, one `Task.Run()` per key
- **Error handling by category:**
  - `429` / `quota` → `InterruptibleDelay(60 * (attempt+1))` up to 120s
  - `404` / `not found` → advance `modelIdx` to next fallback
  - `500` / `503` → `InterruptibleDelay(5s)`
- **PdfSharpCore** for image-to-PDF conversion (no Python dependency)
- **5-minute timeout:** `HttpClient.Timeout = TimeSpan.FromMinutes(5)`

### 5.6 Build Instructions

```bat
# build_exe.bat
dotnet publish FlashcardAI/FlashcardAI.csproj ^
  -c Release ^
  -r win-x64 ^
  --self-contained true ^
  -p:PublishSingleFile=true ^
  -p:IncludeNativeLibrariesForSelfExtract=true
```

**Output:** `FlashcardAI/bin/Release/net8.0-windows/win-x64/publish/FlashcardAI.exe`

**Requirements:** .NET 8 SDK installed on build machine (runtime is bundled in the EXE).

---

## 6. appPython — Legacy Python Desktop

### 6.1 Project Structure

```
appPython/
├── app.py                       # CustomTkinter UI entry point
├── build_exe.bat                # PyInstaller build script
├── FlashcardAI.spec             # PyInstaller spec file
├── decks.json                   # Local deck store
├── settings.json                # API keys + settings
├── quiz_sessions.json           # Quiz sessions
├── models/
│   └── flashcard.py             # Deck, Flashcard, QuizSession dataclasses
├── services/
│   ├── __init__.py
│   ├── auth_service.py          # Google OAuth (InstalledAppFlow)
│   ├── dedup_service.py         # Duplicate detection
│   ├── export_service.py        # Quizlet/TXT export
│   ├── gemini_service.py        # AI scan + worker pool
│   ├── storage_service.py       # JSON file I/O
│   ├── sync_service.py          # Drive sync + Smart Merge
│   └── video_service.py         # Video frame extraction
└── ui/                          # CustomTkinter UI screens
```

### 6.2 GeminiService — Processing Modes

The Python implementation offers three scanning modes:

**Mode 1: Single Image** (`process_image`)
- Sends one image at a time to Gemini
- Uses `EXTRACTION_PROMPT` (single-question extraction)

**Mode 2: PDF Batch Sequential** (`process_images_as_pdf_batches`)
- Merges 50 images into one PDF per batch
- Sends PDF with `PDF_BATCH_PROMPT` (extracts all questions at once)
- Sequential: one batch at a time per key

**Mode 3: PDF Batch Parallel** (`process_images_parallel`)
- Splits images into N equal packs (one per key)
- Each pack runs in a dedicated `threading.Thread`
- Shared `progress_lock` for thread-safe progress reporting

### 6.3 Round-Robin Key Rotation

```python
class GeminiService:
    def __init__(self):
        self._keys = []     # List of API keys
        self._key_index = 0 # Current position
        self._lock = threading.Lock()

    def _get_next_key(self):
        with self._lock:
            key = self._keys[self._key_index % len(self._keys)]
            self._key_index = (self._key_index + 1) % len(self._keys)
            return key

    @property
    def request_delay(self):
        # Safe RPM = 8 per key. If 3 keys: delay = 60/8/3 = 2.5s per request
        n = max(len(self._keys), 1)
        return max(60 / SAFE_RPM / n, 1.0)
```

### 6.4 PDF_BATCH_PROMPT Explained

The `PDF_BATCH_PROMPT` instructs Gemini to process a multi-page PDF where **each page = one question**. Key directives:

1. **Ignore:** logos, watermarks, page numbers — prevents noise in extracted text
2. **Look for explicit answer clues first:** highlighted/bold options, checkmarks, filled bubbles
3. **Infer if no clue found:** Gemini reasons using domain knowledge, sets `"inferred": true`
4. **Never return `["Unknown"]`:** always provide best guess, never leave blank
5. **Handle special characters:** code (`==`, `!=`, `&&`), math (λ, Σ, ≥), preserve exactly
6. **Return JSON array:** one object per page in order, including `NOT_A_QUESTION` pages

### 6.5 Worker Pool + Shared Queue Pattern (Parallel Mode)

```python
def process_images_parallel(self, image_paths, keys, batch_size=50, ...):
    # Split images into N packs (one per key)
    packs = [image_paths[i:i+pack_size] for i in range(0, total, pack_size)]

    all_results = [None] * total   # Pre-allocated result array
    progress_lock = threading.Lock()
    shared_progress = {"count": 0}

    def worker(pack_idx, pack_images, api_key):
        # Each worker has its own GeminiService instance with ONE key
        worker_svc = GeminiService()
        worker_svc.set_keys([api_key])
        # Process sub-batches, write to all_results[global_idx]
        ...

    threads = [Thread(target=worker, args=(i, pack, key))
               for i, (pack, key) in enumerate(zip(packs, keys))]
    for t in threads: t.start()
    for t in threads: t.join()
```

> **Key insight:** Each thread writes to a unique, pre-calculated slice of `all_results`. No locking is needed for writes, only for the shared progress counter.

### 6.6 Build Instructions

```bat
# build_exe.bat
pyinstaller FlashcardAI.spec --clean --noconfirm
```

**Spec file key settings:**
- `onefile=True` → single EXE
- `windowed=True` → no console window
- `datas=[("assets/", "assets/")]` → bundle UI assets

---

## 7. appAndroid — React Native Mobile

### 7.1 Project Structure

```
appAndroid/
├── App.js                       # Root: NavigationContainer + Stack.Navigator
├── index.js                     # Expo entry point
├── app.json                     # Expo config (package name, icons, splash)
├── eas.json                     # EAS Build config (dev/preview/production)
├── src/
│   ├── theme.js                 # Colors, Spacing, Radius constants
│   ├── screens/
│   │   ├── HomeScreen.js        # Deck list + import + Drive sync
│   │   ├── DeckDetailScreen.js  # Deck info + navigate to Flashcard/Quiz
│   │   ├── FlashcardScreen.js   # Swipe-to-score + 3D flip card
│   │   └── QuizScreen.js        # Multiple-choice quiz with session resume
│   └── utils/
│       ├── storage.js           # AsyncStorage CRUD (decks + sessions)
│       ├── googleAuth.js        # Google OAuth (Expo AuthSession)
│       ├── googleDrive.js       # Drive API calls
│       └── syncService.js       # Drive sync + Smart Merge
└── android/                     # Native Android build files
```

### 7.2 Navigation Stack

```javascript
// App.js
<NavigationContainer>
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Home"       component={HomeScreen} />
    <Stack.Screen name="DeckDetail" component={DeckDetailScreen} />
    <Stack.Screen name="Flashcard"  component={FlashcardScreen} />
    <Stack.Screen name="Quiz"       component={QuizScreen} />
  </Stack.Navigator>
</NavigationContainer>
```

**Navigation Params:**

| Route | Params Received | Params Passed On |
| :--- | :--- | :--- |
| `Home` | — | `deck` → DeckDetail |
| `DeckDetail` | `{ deck }` | `{ deck }` → Flashcard or Quiz |
| `Flashcard` | `{ deck }` | — |
| `Quiz` | `{ deck }` | — |

### 7.3 Screen Flow Diagram

```
HomeScreen
  │ tap deck card
  ▼
DeckDetailScreen
  │ tap "Flashcard Mode"         tap "Quiz Mode"
  ▼                              ▼
FlashcardScreen            QuizScreen
  │ swipe right (Known)       │ select options → Confirm
  │ swipe left (Unknown)      │ → auto-save session
  │ tap card → flip           │ → Next →
  ▼ all done                  ▼ all done
Results Screen             Results Screen (QuizDone)
```

### 7.4 FlashcardScreen — Gesture System

**PanResponder Setup:**

```javascript
onMoveShouldSetPanResponder: (_, g) => {
  const adx = Math.abs(g.dx), ady = Math.abs(g.dy);
  // Only capture gesture if clearly horizontal AND past dead zone
  return adx > 12 && adx > ady * 1.5;
}
```

> This condition ensures the PanResponder does not compete with vertical ScrollView. If the user scrolls the long question text, `ady > adx / 1.5`, so the condition is false and the scroll wins.

**Swipe Decision:**

```javascript
onPanResponderRelease: (_, g) => {
  const isRight = g.dx > SWIPE_THRESHOLD || g.vx > VELOCITY_THR;  // Known ✅
  const isLeft  = g.dx < -SWIPE_THRESHOLD || g.vx < -VELOCITY_THR; // Unknown ❌

  if (isRight) advanceCard(true);
  else if (isLeft) advanceCard(false);
  else {
    // Snap back with spring animation
    Animated.spring(swipeX, { toValue: 0, friction: 6, tension: 50 }).start();
  }
}
```

- `SWIPE_THRESHOLD = screen_width * 0.30` (30% of screen width)
- `VELOCITY_THR = 1.2` (fast flick overrides distance threshold)

**Visual Feedback During Swipe:**

```javascript
// Card rotation follows swipe position
const cardRotate = swipeX.interpolate({
  inputRange: [-SCREEN_W, 0, SCREEN_W],
  outputRange: ['-18deg', '0deg', '18deg']
});

// Green "Known" overlay fades in on right swipe
const rightOverlay = swipeX.interpolate({
  inputRange: [20, 90], outputRange: [0, 1], extrapolate: 'clamp'
});

// Underline indicator activates at threshold
const rightUnderline = swipeX.interpolate({
  inputRange: [SWIPE_THRESHOLD - 5, SWIPE_THRESHOLD + 5],
  outputRange: [0, 1], extrapolate: 'clamp'
});
```

### 7.5 3D Card Flip Animation

```javascript
// Single Animated.Value drives both sides
const flipAnim = useRef(new Animated.Value(0)).current;

// Front: 0° → 180°
const frontRotateY = flipAnim.interpolate({
  inputRange: [0, 1], outputRange: ['0deg', '180deg']
});

// Back: 180° → 360° — appears as card flips to front side
const backRotateY = flipAnim.interpolate({
  inputRange: [0, 1], outputRange: ['180deg', '360deg']
});

// Run spring animation on tap
function doFlip() {
  Animated.spring(flipAnim, {
    toValue: flipped ? 0 : 1,
    friction: 8, tension: 10, useNativeDriver: false
  }).start();
}
```

> Both front and back sides use `backfaceVisibility: 'hidden'`. At 90° rotation, the visible face transitions to the back face, creating a seamless 3D flip effect.

### 7.6 QuizScreen — Answer Validation

Two answer formats are supported:

```javascript
// Format detection: check if all correct_answers are single letters
const isLetterFmt = correct_answers.every(a => /^[A-Za-z]$/.test(a.trim()));

// Letter format: compare by extracting first character from option text
if (isLetterFmt) {
  const optLetter = optText[0] === 'A' && (optText[1] === '.' || optText[1] === ')')
    ? optText[0].toUpperCase() : fallbackLabel;
  isCorrectOpt = correctAnswers.some(a => a === optLetter);
}

// Full-text format: compare normalized full option text
else {
  isCorrectOpt = correctAnswers.some(a => 
    a.trim().toLowerCase() === opt.trim().toLowerCase()
  );
}
```

### 7.7 `storage.js` — AsyncStorage API

```javascript
// All data stored in AsyncStorage (SQLite-backed on Android)
const DECKS_KEY    = 'flashcard_decks';   // Array of decks
const SESSIONS_KEY = 'quiz_sessions';     // Object: { deck_id: session }

// Key functions:
saveDecks(decks)           // Stringify + set with auto updated_at
loadDecks()                // Parse + return
updateDeck(updatedDeck)    // Load → find by deck_id → replace → save
saveSession(deckId, sess)  // Merge into sessions object → save
loadSessions()             // Return full sessions object
deleteSession(deckId)      // Delete key from sessions → save
```

### 7.8 Build Instructions

**Debug APK (local USB testing):**

```bat
# build_apk_debug.bat
cd appAndroid
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleDebug
```

**Release APK:**

```bat
# build_apk_release.bat
cd appAndroid
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease
```

**Output:** `android/app/build/outputs/apk/release/app-release.apk`

> For release signing, configure `android/app/build.gradle` with your keystore in `signingConfigs.release`.

---

## 8. Shared Infrastructure

### 8.1 Google Cloud Console Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project (e.g., `FlashcardAI`)
3. **Enable APIs:**
   - `Google Drive API`
   - `Generative Language API` (for Gemini direct calls — Desktop apps)
   - `Google Identity` (OAuth)
4. **OAuth Consent Screen:**
   - User Type: External
   - Add scopes: `drive.appdata`, `drive.file`, `userinfo.email`, `openid`
5. **Create Credentials:**
   - Type: `Web application` (for appWeb backend)
   - Authorized redirect URI: `https://flashcard-ai-bs67.onrender.com/auth/callback`
   - Type: `Desktop app` (for appDotNet and appPython)

### 8.2 Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full `appWeb/appBackend/database_setup.sql`
3. Copy **Project URL** and **anon key** → add to backend `.env`
4. RLS Policies (optional but recommended for production):
   ```sql
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE deck_progress ENABLE ROW LEVEL SECURITY;
   ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
   -- Note: Backend uses Supabase service_role key to bypass RLS
   ```

### 8.3 Render.com Backend Setup

1. Connect GitHub repository
2. **Build Command:** `npm install` (in `appWeb/appBackend/`)
3. **Start Command:** `node index.js`
4. **Root Directory:** `appWeb/appBackend`
5. Add all environment variables from the table in [Section 4.9](#49-environment-variables)
6. **Free tier note:** Service sleeps after 15 minutes. Use the Google Apps Script keep-alive:

```javascript
// Google Apps Script (runs every 14 minutes via trigger)
function keepAlive() {
  UrlFetchApp.fetch('https://flashcard-ai-bs67.onrender.com/ping');
}
```

### 8.4 Cloudflare Pages Setup (Frontend)

1. Connect GitHub repository
2. **Build Command:** `npm run build`
3. **Build Output:** `dist`
4. **Root Directory:** `appWeb`
5. Add Environment Variable: `VITE_BACKEND_URL = https://flashcard-ai-bs67.onrender.com`

---

## 9. Development Guide

### 9.1 Prerequisites

| Tool | Version | Used by |
| :--- | :--- | :--- |
| Node.js | v18+ | appWeb, appAndroid |
| npm | v9+ | appWeb, appAndroid |
| .NET SDK | v8.0 | appDotNet |
| Python | v3.10+ | appPython |
| Expo CLI | latest | appAndroid |
| Java JDK | v17+ | appAndroid (Android build) |
| Android SDK | API 31+ | appAndroid |
| Visual Studio | 2022 | appDotNet (WPF designer) |

### 9.2 Setup from Scratch

**appWeb (Frontend):**
```bash
cd appWeb
npm install
# Create src/.env with:
# VITE_BACKEND_URL=http://localhost:3000
npm run dev    # → http://localhost:5173
```

**appWeb (Backend):**
```bash
cd appWeb/appBackend
npm install
# Copy .env.example → .env and fill in all values
node index.js  # → http://localhost:3000
```

**appDotNet:**
```bash
# Open Visual Studio 2022
# File → Open → Project
# Navigate to: appDotNet/FlashcardAI/FlashcardAI.csproj
# Press F5 to run (Debug) or Ctrl+F5 (Release without debugger)
```

**appPython:**
```bash
cd appPython
pip install -r requirements.txt   # (create if missing: google-genai, customtkinter, Pillow)
python app.py
```

**appAndroid:**
```bash
cd appAndroid
npm install
npx expo start
# Press 'a' to open in Android emulator or 'r' to run on connected device
```

### 9.3 Adding New Features — Guidelines

1. **New API endpoint:** Add to the appropriate route file in `appBackend/routes/`. Update this documentation's API table.
2. **New React component:** Create in `src/components/`. Ensure it handles both `dark` and `light` theme via CSS variables.
3. **New data field:** Add to `decks.json` schema (Section 3.1), update `Deck.FromDict()` in .NET and `Deck.from_dict()` in Python, and update Android's `storage.js`.
4. **New notification:** Insert the notification into the database `system_settings` (for global system notifications) or `notifications` table (for user-specific alerts).
### 9.4 Coding Conventions

- **Commit messages:** Conventional Commits format (`feat:`, `fix:`, `docs:`, `refactor:`)
- **CSS:** Use CSS variables from `index.css` (`var(--primary)`, `var(--bg-main)`, etc.)
- **State management:** Local component state only (no Redux). Shared state lives in `App.jsx`.
- **Z-index layers:** `Header (200) > Toggle Button (106) > Search/Tabs (50) < Notification Dropdown (9999)`

### 9.5 Using Context7 for Up-to-date Documentation

For the most accurate and up-to-date technical documentation of core libraries (React, Vite, Supabase, .NET, Python), use the **Context7** tool. This helps avoid AI hallucinations and ensures compatibility with the latest library versions.

**Example command:**
```bash
npx ctx7 docs /facebook/react "useActionState"
```

Refer to `AGENTS.md` for a full list of supported Library IDs.

---

## 10. Deployment Guide

### 10.1 Web: GitHub → Cloudflare Pages (CI/CD)

```
git push main
  │
  ├── Cloudflare Pages detects push → auto-build
  │   cd appWeb && npm install && npm run build
  │   Deploy dist/ to *.pages.dev
  │
  └── Render.com detects push → auto-deploy Backend
      cd appWeb/appBackend && npm install && node index.js
```

No manual steps needed after initial configuration.

### 10.2 Desktop: Build EXE → GitHub Release

```bat
# Step 1: Build .NET EXE
cd appDotNet
build_exe.bat

# Step 2: Build Python EXE
cd ..\appPython
build_exe.bat

# Step 3: Create GitHub Release
# Use: releaseApp/release_gh.bat (auto-creates tag + uploads EXEs)
```

### 10.3 Android: Build APK → Manual Distribution

```bat
cd appAndroid
build_apk_release.bat
# Output: android/app/build/outputs/apk/release/app-release.apk
# Upload to GitHub Releases or distribute directly
```

### 10.4 Pre-Release Checklist

- [ ] All deck edits bump `updated_at` to ISO format
- [ ] `decks.json` schema is backward-compatible (no removed fields)
- [ ] Test Drive Sync round-trip: modify on Web → sync on Desktop → verify match
- [ ] Test AI Scan with both 1 key and multiple keys (parallel mode)
- [ ] Verify both dark and light themes render correctly on all changed components
- [ ] Run `git status` and confirm no accidental files staged
- [ ] Backend `.env` secrets are NOT committed to git
- [ ] Android APK tested on physical device before release
- [ ] Bump version in `app.json` and tag commit with `vX.Y.Z`

---

*Flashcard AI — Technical Documentation | Generated: 2026-04-07 | Author: [LHB16](https://github.com/LHB16)*

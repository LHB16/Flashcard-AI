# Architecture

## High-Level Structure
- `app.py`: Desktop application entry point and main window shell
- `ui/`: Desktop UI modules divided into `screens/`, `dialogs/`, and utilities
- `models/`: core domain models (`Flashcard`, `Deck`, `QuizSession`)
- `services/`: Gemini integration, persistence, Google Drive sync, dedup logic, export formatting
- `appAndroid/`: React Native app for mobile study/quiz consumption
- `appWeb/`: React + Vite web app (frontend) with Node.js backend
- `build_*.bat`, `FlashcardAI.spec`: build/release automation

## Folder Map

### Desktop (Python)
- `models/flashcard.py`: data schema + serialization + Quizlet row rendering
- `services/gemini_service.py`: OCR/extraction orchestration, retries, model fallback, key rotation, parallel batch scan
- `services/storage_service.py`: JSON persistence for decks/settings/quiz sessions
- `services/auth_service.py`: Google OAuth 2.0 flow securely storing `token.json`
- `services/sync_service.py`: Background Smart Merge sync with Google Drive AppData
- `services/export_service.py`: Quizlet text export + preview
- `services/dedup_service.py`: near-duplicate detection using shingling + SequenceMatcher

### Mobile (Android)
- `appAndroid/src/utils/storage.js`: AsyncStorage CRUD + session persistence + timestamp injection
- `appAndroid/src/utils/syncService.js`: Mobile implementation of Smart Merge with Google Drive AppData
- `appAndroid/src/utils/googleAuth.js`: OAuth flow using `iOS Client ID` bypass for Android Redirect URIs
- `appAndroid/src/utils/googleDrive.js`: REST API interactions for `appDataFolder`

### Web App
- `appWeb/src/App.jsx`: Main application shell, routing, theme, Google Drive sync orchestration
- `appWeb/src/services/driveSync.js`: Backend-based OAuth flow — login redirect, silent token refresh, Drive fetch/upload
- `appWeb/src/components/FlashcardMode.jsx`: Swipe/keyboard flashcard study with rate-limiting and undo
- `appWeb/src/components/QuizMode.jsx`: Interactive quiz with auto-save to Supabase and session resume
- `appWeb/src/components/FileLoader.jsx`: Local JSON file import

### Web Backend (Node.js)
- `appWeb/appBackend/index.js`: Express server entry, CORS, ping route
- `appWeb/appBackend/routes/auth.js`: Google OAuth 2.0 (redirect → callback → refresh token)
- `appWeb/appBackend/routes/progress.js`: Flashcard progress + quiz session CRUD via Supabase
- `appWeb/appBackend/supabaseClient.js`: Supabase PostgreSQL client initialization
- `appWeb/appBackend/database_setup.sql`: SQL schema for `users`, `progress`, `quiz_sessions` tables

## Main Desktop Modules (ui/)
- `ui/screens/scan_frame.py` + `ui/dialogs/scan_assign_dialog.py`: scan setup and key assignment
- `ui/background_scan.py`: threaded scan worker, progress/log state, pause/resume/stop
- `ui/screens/home_frame.py`: active scans dashboard + deck list/search
- `ui/screens/deck_frame.py`: card browser, dedup trigger, export trigger, card-level deletion/reset
- `ui/screens/study_frame.py`: flip-card session with undo and keyboard shortcuts
- `ui/screens/quiz_frame.py`: single/multi answer quiz with progress persistence and resume
- `ui/dialogs/api_key_dialog.py`: key lifecycle and health checks

## Interaction Flow
1. User selects image folder and deck name.
2. Assigned API keys are validated; scan runs sequentially or parallel.
3. Gemini returns card JSON; valid cards become a `Deck`.
4. Deck is persisted to `decks.json` and rendered in home/deck views.
5. User studies/quizzes; card `status` and quiz sessions persist locally.
6. Optional dedup removes similar cards; export writes Quizlet-compatible `.txt`.
7. **Cloud Sync**: User initiates sync from either Desktop or Mobile. Both clients use the same `appDataFolder` and "Smart Merge" logic (checking `updated_at` per individual deck/session) to ensure consistency.
8. **Mobile Sync Implementation**: Uses `expo-auth-session` with a manual Redirect URI scheme registered in `AndroidManifest.xml`.
9. **Web OAuth Flow**: Frontend redirects to Backend `/auth/google` → Google consent → Backend receives code, exchanges for tokens, stores refresh token in Supabase → redirects back to frontend with access token.
10. **Web Session Persistence**: Quiz and flashcard progress auto-saves to Supabase via debounced API calls. On reload, sessions resume from the cloud.

## Data Contracts
- `Flashcard.status`: `0` unseen, `1` learning/wrong, `2` mastered/correct
- `Flashcard.question_type`: `single_choice` or `multiple_choice`
- `QuizSession`: circular navigation (`currentIndex -1 / +1`) with wrap-around support.
- `QuizSession.answers`: JSONB mapping of `question_index` to `{ selected: ..., correct: boolean }`.

## Database Schema (Supabase)
- `users`: `google_id` (unique), `email`, `last_login`, `refresh_token`, `created_at`, `updated_at`
- `progress`: `google_id`, `deck_id`, `percent`, `last_studied` (unique per user-deck)
- `quiz_sessions`: `google_id`, `deck_id`, `session_id`, `question_order` (JSONB), `current_index`, `answers` (JSONB), `correct_count`, `wrong_count`, `started_at`, `updated_at`

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
The Node.js backend serves as a stateless API server (highly scalable on Render), communicating with the Supabase Database and Google APIs.

#### Root Directory (`appWeb/appBackend/`)
- `index.js`: Express application entry point. Configures CORS, limits JSON payload sizes (recently reduced to 15MB to prevent OOM), mounts sub-routes, and provides a `/ping` route for health-checking/keep-alive on Render.
- `supabaseClient.js`: Initializes and configures the Supabase PostgreSQL client connecting to the database, ensuring instance reuse across routes.
- `database_setup.sql`: Stores SQL schema scripts covering all table structures (`users`, `progress`, `quiz_sessions`, `shared_decks`, `notifications`), along with Row Level Security (RLS) policies and RPC logic.
- `get-gmail-token.js`: A CLI utility script to manually obtain the `GMAIL_REFRESH_TOKEN` needed to configure the system email sender via Google OAuth.

#### API Routes (`appWeb/appBackend/routes/`)
- `auth.js`: Handles Google OAuth 2.0 flow (redirecting for consent, code-to-token callback, and token refresh). Highly optimized by replacing the massive `googleapis` dependency with `google-auth-library` and direct REST API calls.
- `scan.js`: Gemini AI orchestrator serving as a proxy. Receives base64 PDFs from the frontend and extracts them into flashcards. Includes a **Concurrency Limiter** to limit active processing requests and protect the underpowered server from Out-Of-Memory crashes.
- `share.js`: Manages the "Share Deck" feature. Upserts shared content to the `shared_decks` table and dispatches email invitations via Gmail REST API calls.
- `progress.js`: Interacts with Supabase DB to track learning outcomes (correct/wrong cards) and handles unfinished quiz instances (`quiz_sessions`). Deals heavily with JSONB operations and RPC syncing.
- `admin.js`: Exposes administrative system-wide endpoints enforcing hardcoded admin email checks. It handles shared API keys pool management, system notifications, and overall user statistics.
- `chat.js`: Forwards user queries to an AI Tutor system (e.g., Groq API Llama-3). Relies on a random proxy key rotation scheme across available global keys to balance loads and avoid rate limits.
- `settings.js`: Handles personalized account settings such as email notification preferences (send/receive email flags) and hosts a nuclear data deletion utility route that completely cleanses a user's progress.

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

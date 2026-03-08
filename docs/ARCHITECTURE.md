# Architecture

## High-Level Structure
- `app.py`: Desktop application entry point and main window shell
- `ui/`: Desktop UI modules divided into `screens/`, `dialogs/`, and utilities
- `models/`: core domain models (`Flashcard`, `Deck`, `QuizSession`)
- `services/`: Gemini integration, persistence, Google Drive sync, dedup logic, export formatting
- `androidApp/`: React Native app for mobile study/quiz consumption
- `build_*.bat`, `FlashcardAI.spec`: build/release automation

## Folder Map
- `models/flashcard.py`: data schema + serialization + Quizlet row rendering
- `services/gemini_service.py`: OCR/extraction orchestration, retries, model fallback, key rotation, parallel batch scan
- `services/storage_service.py`: JSON persistence for decks/settings/quiz sessions
- `services/auth_service.py`: Google OAuth 2.0 flow securely storing `token.json`
- `services/sync_service.py`: Background Smart Merge sync with Google Drive AppData
- `services/export_service.py`: Quizlet text export + preview
- `services/dedup_service.py`: near-duplicate detection using shingling + SequenceMatcher
- `androidApp/src/screens/*`: Home, Deck detail, Flashcard mode, Quiz mode
- `androidApp/src/utils/storage.js`: AsyncStorage CRUD + session persistence

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
7. **Cloud Sync**: User initiates sync. Sync service fetches remote JSON, merges with local based on `updated_at`, and pushes the combined state back.
8. Mobile app imports `decks.json` (exported manually or via drive) and continues study/quiz with local persistence.

## Data Contracts
- `Flashcard.status`: `0` unseen, `1` learning/wrong, `2` mastered/correct
- `Flashcard.question_type`: `single_choice` or `multiple_choice`
- `QuizSession`: per-deck progress (`question_order`, `current_index`, score, answers)

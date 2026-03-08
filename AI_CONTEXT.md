# AI Context

Flashcard AI is a dual-client, local-first learning system:
- Desktop (Python + CustomTkinter) generates flashcard decks from image folders via Gemini.
- Mobile (React Native + Expo) consumes/imports decks for study and quiz practice.

Core entities:
- `Flashcard(question, options, correct_answers, question_type, status, notes, image_path, card_id)`
- `Deck(name, cards, deck_id, created_at, source_folder, description)`
- `QuizSession(deck_id, question_order, current_index, answers, correct_count, wrong_count)`

Persistence:
- Desktop JSON: `decks.json`, `settings.json`, `quiz_sessions.json`, `token.json` (Google OAuth)
- Multi-device Sync: Google Drive AppData folder (`decks.json`, `quiz_sessions.json` with Smart Merge based on `updated_at`)
- Mobile AsyncStorage: deck list + quiz session map + Google Drive sync local state
- Security: `credentials.json`, `token.json`, and `Flashcard-Sync-Client-*` files are excluded via `.gitignore`.

Primary flows:
1. Scan images -> Gemini extraction -> deck creation
2. Manage decks -> study mode (flip + self-score) -> status updates
3. Google Drive Sync: pull JSON -> merge (newer `updated_at` wins) -> push JSON -> update UI
4. Quiz mode (single/multi answers) -> session save/resume
5. Deduplicate similar questions
6. Export to Quizlet text formats (`simple`, `full`, `compact`, `safe`)

Architecture notes:
- Desktop UI orchestration is concentrated in `app.py` with service/model separation.
- Gemini service supports multi-key rotation, retry/fallback logic, and parallel batching.
- Sync service handles intermittent connection issues gracefully and bypasses image path overwrites.
- Mobile app is navigation-based with four screens: Home, DeckDetail, Flashcard, Quiz.
- Mobile app interface is fully localized to English (v1.0.2).
- Mobile Google Auth (via `expo-auth-session`) uses iOS Client ID bypass to support custom URI scheme redirects on Android.

Risk areas for edits:
- Cross-client data-contract drift (desktop Python vs mobile JS)
- Breaking status/question_type semantics
- UI thread blocking during scan operations
- Export format regressions

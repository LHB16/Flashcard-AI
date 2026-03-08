# Features

## Implemented Features
- AI image-to-flashcard extraction via Google Gemini
- Multi-key API management with key validation and rotation
- Sequential and parallel PDF-batch scan modes
- Live scan logs, progress bars, pause/resume/stop controls
- Deck CRUD and search on desktop home screen
- Card list view with status-aware progress indicators
- Study mode (flip answer, know/don't-know scoring, undo, keyboard shortcuts)
- Quiz mode (single + multi answer, correctness reveal, score summary, resume)
- Question deduplication with similarity thresholding and selective removal
- Quizlet export in 4 formats + preview
- Windows toast notifications for scan events
- Mobile: React Native 0.83 + Expo 55, React Navigation, AsyncStorage, English UI (v1.0.2)
- Data: local JSON files (`decks.json`, `settings.json`, `quiz_sessions.json`, `token.json`) and Google Drive AppData Sync
- **Google Drive Sync (Smart Merge)**: Bidirectional sync using AppData folder (v1.0.2). Mobile implementation uses `iOS Client ID` bypass to support custom URI scheme redirects on Android.

## Incomplete / Planned Signals
- No explicit roadmap file, but structure suggests future extraction:
  - Desktop `app.py` is modularized into `ui/` directory screens and frames.
- Some generated/build folders exist (`build/`, `dist/`, `releaseApp/`) indicating active packaging/release workflow evolution

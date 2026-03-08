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
- Android app: import `decks.json` safely (BOM-handled), deck stats/progress, flashcard mode with swipe + undo, quiz mode with session resume, reset actions
- Android app update check against GitHub Releases + APK download/install intent
- **Google Drive Sync (Smart Merge)**: Bidirectional sync using AppData folder to keep Desktop and Mobile data consistent across multiple devices without file conflicts.

## Incomplete / Planned Signals
- No explicit roadmap file, but structure suggests future extraction:
  - Desktop `app.py` is modularized into `ui/` directory screens and frames.
- Some generated/build folders exist (`build/`, `dist/`, `releaseApp/`) indicating active packaging/release workflow evolution

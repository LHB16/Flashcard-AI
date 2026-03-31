# Features

## Implemented Features

### Desktop
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

### Mobile
- React Native 0.83 + Expo 55, React Navigation, AsyncStorage, English UI (v1.0.2)
- Gesture-based flashcard swiping (Know/Don't Know)
- 3D card flip animations
- Quiz and study session resume
- Google Drive AppData Smart Merge sync
- Restructured UI for better mobile navigation

### Web App
- **Flashcard Mode**: Swipe gestures, keyboard shortcuts (Space/Up/Down to flip, Left/Right to score, R to undo)
- **Quiz Mode**: Circular navigation (currentIndex -1 / +1) with wrap-around, jump to first unanswered, and answered-count based progress bar
- **Rate Limiting**: 1-second cooldown per card action to prevent rapid-click state desync
- **Google Drive Sync**: Bidirectional sync with debounced background auto-save (3s delay)
- **Backend OAuth**: Server-side Google login with persistent refresh tokens in Supabase and email display
- **Session Resume**: Both flashcard and quiz sessions auto-resume from Supabase on page load
- **Progress Isolation**: Flashcard progress and quiz sessions are handled independently to preserve data integrity
- **Cloud Progress**: Study percentage and quiz sessions synced to PostgreSQL for cross-device access
- **Responsive Design**: Glassmorphism UI with dark/light theme, fully mobile-optimized

### Data & Sync
- Local JSON files (`decks.json`, `settings.json`, `quiz_sessions.json`, `token.json`)
- Google Drive AppData Sync (Smart Merge) across Desktop, Mobile, and Web
- Supabase PostgreSQL for web session persistence (users, progress, quiz_sessions)

## Planned / Upcoming
- Multi-language support for quiz content
- Spaced repetition algorithm integration
- Desktop → Web real-time sync notifications

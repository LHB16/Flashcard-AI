# appWeb - React Web App

## Tech Stack
- React 18 + Vite
- Firebase (auth + Firestore)
- Gemini API (AI scan feature)

## Structure
- src/components/   UI components
- src/services/     Business logic and API calls
- public/           Static assets

## Key Components
- DeckManager.jsx       Main deck management UI
- QuizMode.jsx          Quiz functionality
- FlashcardMode.jsx     Flashcard study mode
- AIScan.jsx            AI image scanning
- SettingsPage.jsx      User settings
- ShareDeckView.jsx     Deck sharing

## Key Services
- geminiService.js      Gemini AI integration
- driveSync.js          Google Drive sync
- configService.js      App configuration
- dedupService.js       Deduplication logic

## Git Commit Rules
Format: type: short description in english, lowercase
No Co-Authored-By lines. Subject line only.

## Dev Commands
- npm run dev       Start dev server
- npm run build     Build for production

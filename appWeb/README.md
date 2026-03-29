# Flashcard AI — Web App

React + Vite frontend with Node.js Express backend for the Flashcard AI learning platform.

## 🌐 Live URL
- **Frontend**: [https://lhb16-flashcard-ai.pages.dev](https://lhb16-flashcard-ai.pages.dev) (Cloudflare Pages)
- **Backend**: [https://flashcard-ai-bs67.onrender.com](https://flashcard-ai-bs67.onrender.com) (Render)

## 📂 Structure
```
appWeb/
├── src/                    # React frontend source
│   ├── App.jsx             # Main app shell & routing
│   ├── components/         # FlashcardMode, QuizMode, FileLoader
│   ├── services/           # driveSync.js (OAuth + Drive API)
│   └── index.css           # Global styles (glassmorphism theme)
├── appBackend/             # Node.js Express backend
│   ├── index.js            # Server entry, CORS, /ping
│   ├── routes/auth.js      # Google OAuth2 flow
│   ├── routes/progress.js  # Flashcard & quiz progress API
│   ├── supabaseClient.js   # Supabase DB connection
│   └── database_setup.sql  # SQL schema for Supabase
├── dist/                   # Production build (Cloudflare upload)
└── .env                    # VITE_BACKEND_URL (build-time)
```

## 🚀 Local Development
```bash
# Frontend
npm install
npm run dev          # → http://localhost:5173

# Backend
cd appBackend
npm install
cp .env.example .env # Fill in credentials
node index.js        # → http://localhost:3000
```

## 🔑 Environment Variables

### Frontend (.env)
| Variable | Value |
|:---|:---|
| `VITE_BACKEND_URL` | `https://flashcard-ai-bs67.onrender.com` |

### Backend (.env / Render Dashboard)
| Variable | Description |
|:---|:---|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://<backend>/auth/callback` |
| `FRONTEND_URL` | Frontend origin (CORS) |
| `FRONTEND_CALLBACK_URL` | Frontend URL after login redirect |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

## 📊 Database (Supabase)
Run `appBackend/database_setup.sql` in Supabase SQL Editor to create tables:
- **users** — Google ID, email, refresh tokens
- **progress** — Flashcard study percentage per deck
- **quiz_sessions** — Full quiz state (answers, score, current index)

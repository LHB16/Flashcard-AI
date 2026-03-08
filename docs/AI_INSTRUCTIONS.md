# AI Instructions

## Mission
When modifying this project, preserve local-first behavior, deck compatibility, and study/quiz semantics across desktop and mobile apps.

## Non-Negotiable Rules
- Do not break JSON compatibility for existing `decks.json`, `settings.json`, `quiz_sessions.json`.
- Keep `Flashcard`, `Deck`, and `QuizSession` field names stable unless adding backward-compatible migrations.
- Preserve status mapping: `0=unseen`, `1=learning/wrong`, `2=mastered/correct`.
- Keep `question_type` values compatible with both Python and React Native clients.
- Keep long-running scan/network work off the desktop UI thread.

## Change Placement Rules
- Business logic/integrations belong in `services/`.
- Data shape logic belongs in `models/`.
- UI event wiring belongs in screen/frame classes.
- Mobile persistence changes must go through `androidApp/src/utils/storage.js`.

## Safety Checklist Before Finalizing
- Verify deck load/save still works on desktop.
- Verify study and quiz flows still update card status correctly.
- Verify quiz session resume still functions.
- Verify Quizlet export output remains parseable for all 4 formats.
- If model fields changed, add compatibility handling in both desktop and mobile.

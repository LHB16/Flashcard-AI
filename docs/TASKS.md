# Tasks

- Introduce automated tests for:
  - `services/sync_service.py` Smart Merge logic
  - `services/dedup_service.py`
  - `models/flashcard.py` serialization/export behavior
  - `services/export_service.py` format correctness
- [x] Build native Google Drive auto-sync pipeline directly within the Android App.
- [x] Centralize i18n/language strings (Android UI is now English).
- [ ] Add structured logging and crash-safe error reporting around scan threads.
- [ ] User testing for new navigation flow (Circular navigation & Smart Jump)
- [ ] Verify sync speed on poor connections for Supabase session persistence

## Technical Debt
- Duplicate style keys and repeated UI patterns in mobile screens.
- Weak validation around imported deck JSON shape in mobile.
- Some broad `except Exception` paths hide root causes.
- Quiz progress vs Flashcard status sync edge cases.

## Missing Features (Likely Valuable)
- Multi-language support for quiz content.
- Spaced repetition algorithm integration.


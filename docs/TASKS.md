# Tasks

- Introduce automated tests for:
  - `services/sync_service.py` Smart Merge logic
  - `services/dedup_service.py`
  - `models/flashcard.py` serialization/export behavior
  - `services/export_service.py` format correctness
- Build native Google Drive auto-sync pipeline directly within the Android App (so the app fetches from AppData itself).
- Centralize i18n/language strings (current UI mixes English and Vietnamese text).
- Add structured logging and crash-safe error reporting around scan threads.

## Technical Debt
- Duplicate style keys and repeated UI patterns in mobile screens.
- Weak validation around imported deck JSON shape in mobile.
- Some broad `except Exception` paths hide root causes.

## Missing Features (Likely Valuable)


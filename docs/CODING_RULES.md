# Coding Rules

## Conventions Inferred
- Python uses `snake_case` for functions/variables and `PascalCase` for classes.
- React Native uses `camelCase` for functions/state and `PascalCase` for components.
- Domain models rely on dataclasses + `to_dict/from_dict` serialization boundaries.
- UI state is explicit and event-driven; async work runs in threads (desktop) or async functions (mobile).

## Architectural Patterns
- Desktop: layered modular architecture
  - UI layer in `ui/` module and `app.py` (entry point)
  - Service layer in `services/`
  - Domain layer in `models/`
- Mobile: screen-driven navigation with shared local-storage utility
- Local-first persistence; no central backend

## Practical Rules For Changes
- Keep model schema backward-compatible with existing `decks.json`/session files.
- Add new external integrations in `services/`, not directly inside UI handlers.
- Preserve card status semantics (`0/1/2`) and question type values.
- Keep long-running operations off UI thread; use callbacks for progress updates.
- Maintain export format compatibility (`simple`, `full`, `compact`, `safe`).

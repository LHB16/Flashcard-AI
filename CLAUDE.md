# PNGToQuizlet - Project Overview

## Project Structure
- appWeb/       React + Vite web app (main product)
- appAndroid/   React Native + Expo mobile app
- desktopApp/   Desktop executables (Python/DotNet)
- docs/         Architecture and technical documentation
- .claude/skills/gitnexus/  Git workflow skills

## Key Files
- docs/CODING_RULES.md     Coding standards
- docs/ARCHITECTURE.md     System architecture
- docs/TECHNICAL_DOC.md    Technical details
- docs/TASKS.md            Current tasks
- AI_CONTEXT.md            AI-specific context

---

## Language Rules
- Always respond in Vietnamese
- Keep technical terms in English if no natural Vietnamese equivalent
- Understand English input but always reply in Vietnamese

## Response Rules
- Before coding anything, confirm the plan with the user first
- Always provide a clear Action Plan listing each step before executing
- After build completes, provide the exact path to the output file/folder

## Git Commit Rules
- Format: type: short description in english, lowercase
- Types: feat, fix, style, docs, refactor, chore, test
- Subject line only, no body
- No Co-Authored-By lines
- Example: "feat: add shuffle functionality to DeckManager"

## UI & Dependencies Rules
- Icons: ONLY use lucide-react, outline/stroke style, no fill icons, no mixing icon libraries
- Set appropriate strokeWidth for clean appearance

## Build Rules
- Build to single .exe file if platform supports it
- Always provide output path after build completes

## Scope Rules
- ONLY operate within the current project folder
- Never read, edit, delete or move files outside the project scope

## Self-Check (before every response)
- Response in Vietnamese? Yes
- Action Plan provided? Yes
- Commit message in English + conventional format? Yes
- Icons from lucide-react only? Yes
- Staying within project scope? Yes

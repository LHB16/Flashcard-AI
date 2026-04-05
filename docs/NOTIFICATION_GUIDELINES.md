# Notification Style Guide — Admin Dashboard

This document defines the standard format for all system notifications sent via the Admin Dashboard. Maintaining a consistent style ensures a professional and cohesive user experience.

---

## 🏗️ Structure Components

Every notification consists of four mandatory/optional fields as seen in the Admin UI:

### 1. TITLE
- **Format:** `Standard English Sentence Case`
- **Rule:** Keep it under 5-7 words. Do NOT include emojis in the Title field (emojis go in the Icon field).
- **Goal:** Immediately identify the feature or update.

### 2. DESCRIPTION
- **Format:** `Brief 1-2 sentence explanation.`
- **Rule:** Focus on the value to the user. Start with "You can now..." or "New: ...".
- **Tone:** Professional yet welcoming.

### 3. ICON (EMOJI)
- **Format:** `Single Emoji`
- **Selection:** Use an emoji that logically represents the content (e.g., 🚀 for new features, 💬 for chat, 📚 for guides, 🧬 for technical updates).

### 4. LINK (OPTIONAL)
- **Format:** Relative or absolute URL.
- **Best Practice:** Always use anchor IDs (`#id`) to point to specific sections of the User Guide if possible.
- **Example:** `/guide.html#merge-guide`

---

## 🌟 Best Practice Examples

| Feature | Title | Description | Icon | Link |
| :--- | :--- | :--- | :---: | :--- |
| **New AI Chat** | AI Learning Assistant | Our shiny new AI Chat is here to explain concepts and break down answers. | 🤖 | `/guide.html#ai-chat` |
| **Merge Deck** | Merge Multiple Decks | You can now import cards from other decks into your current one with ease. | 🚀 | `/guide.html#merge-guide` |
| **Sharing** | Share & Clone Decks | You can now share decks via email! Click here to learn how it works in the guide. | 📤 | `/guide.html#share-deck` |
| **User Guide** | User Guide Available | Check out the full guide to get started. Click here to view. | 📖 | `/guide.html` |

---

## 🛠️ Internal Rules
1. **Language:** Always use **English** for the front-facing notifications.
2. **Frequency:** Do not spam. Send notifications only for meaningful updates or critical system changes.
3. **Consistency:** Check this document before creating a new notification to ensure the icon and tone match existing ones.

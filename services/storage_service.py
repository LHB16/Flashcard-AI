"""
services/storage_service.py - Save/load decks, settings, quiz sessions
"""
import json
import os
import sys
from typing import List, Dict, Optional
from models.flashcard import Deck, QuizSession


def get_app_root():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


STORAGE_DIR = get_app_root()
DECKS_FILE = os.path.join(STORAGE_DIR, "decks.json")
SETTINGS_FILE = os.path.join(STORAGE_DIR, "settings.json")
QUIZ_SESSIONS_FILE = os.path.join(STORAGE_DIR, "quiz_sessions.json")


def _ensure_dir():
    os.makedirs(STORAGE_DIR, exist_ok=True)


# ─────────────── Decks ───────────────
def load_decks() -> List[Deck]:
    _ensure_dir()
    if not os.path.exists(DECKS_FILE):
        return []
    try:
        with open(DECKS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return [Deck.from_dict(d) for d in data]
    except Exception:
        return []


def save_decks(decks: List[Deck]):
    _ensure_dir()
    with open(DECKS_FILE, "w", encoding="utf-8") as f:
        json.dump([d.to_dict() for d in decks], f, ensure_ascii=False, indent=2)


def delete_deck(deck_id: str, decks: List[Deck]) -> List[Deck]:
    return [d for d in decks if d.deck_id != deck_id]


# ─────────────── Settings ───────────────
def load_settings() -> dict:
    _ensure_dir()
    if not os.path.exists(SETTINGS_FILE):
        return {"api_keys": [], "theme": "dark", "quizlet_format": "full"}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"api_keys": [], "theme": "dark", "quizlet_format": "full"}


def save_settings(settings: dict):
    _ensure_dir()
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)


# ─────────────── Quiz Sessions ───────────────
def load_quiz_sessions() -> Dict[str, QuizSession]:
    """Returns a dict of {deck_id: QuizSession}."""
    _ensure_dir()
    if not os.path.exists(QUIZ_SESSIONS_FILE):
        return {}
    try:
        with open(QUIZ_SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {k: QuizSession.from_dict(v) for k, v in data.items()}
    except Exception:
        return {}


def save_quiz_session(session: QuizSession):
    sessions = load_quiz_sessions()
    sessions[session.deck_id] = session
    _ensure_dir()
    with open(QUIZ_SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump({k: v.to_dict() for k, v in sessions.items()}, f, ensure_ascii=False, indent=2)


def delete_quiz_session(deck_id: str):
    sessions = load_quiz_sessions()
    sessions.pop(deck_id, None)
    _ensure_dir()
    with open(QUIZ_SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump({k: v.to_dict() for k, v in sessions.items()}, f, ensure_ascii=False, indent=2)

"""
models/flashcard.py - Data models for the flashcard app
"""
import json
import uuid
import random
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict



class QuestionType(Enum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    UNKNOWN = "unknown"


@dataclass
class Flashcard:
    question: str
    options: List[str]                    # ["A. 255", "B. 128", "C. 1024"]
    correct_answers: List[str]            # ["A"] or ["A", "C"] for multi-answer
    question_type: QuestionType = QuestionType.SINGLE_CHOICE
    image_path: Optional[str] = None
    card_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    notes: str = ""

    def to_dict(self) -> dict:
        return {
            "card_id": self.card_id,
            "question": self.question,
            "options": self.options,
            "correct_answers": self.correct_answers,
            "question_type": self.question_type.value,
            "image_path": self.image_path,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Flashcard":
        return cls(
            card_id=data.get("card_id", str(uuid.uuid4())),
            question=data.get("question", ""),
            options=data.get("options", []),
            correct_answers=data.get("correct_answers", []),
            question_type=QuestionType(data.get("question_type", "unknown")),
            image_path=data.get("image_path"),
            notes=data.get("notes", ""),
        )

    def get_correct_answer_text(self) -> str:
        """Return the full text of correct answers."""
        result = []
        for letter in self.correct_answers:
            for opt in self.options:
                if opt.startswith(f"{letter}.") or opt.startswith(f"{letter})"):
                    result.append(opt)
                    break
            else:
                result.append(letter)
        return " | ".join(result) if result else "Unknown"

    # Safe format separators — unique enough to never appear in real content
    SAFE_TERM_SEP = "{[(DapAn)]}"   # between question and answer
    SAFE_CARD_SEP = "{[(CauHoi)]}"  # between cards (replaces newline)

    def to_quizlet_row(self, format_type: str = "full") -> str:
        """
        Export to Quizlet tab-separated row.
        IMPORTANT: Must NOT use \\n inside term or definition.

        format_type:
          - 'simple' : Question [TAB] Correct answer
          - 'full'   : Question >> A | B | C [TAB] Correct answer (full text)
          - 'compact': Question [A | B | C] [TAB] Answer letter(s)
          - 'safe'   : {[(CauHoi)]}Question >> A / B / C{[(DapAn)]}Answer
                       In Quizlet custom import:
                         Giua thuat ngu va dinh nghia → {[(DapAn)]}
                         Giua cac the → {[(CauHoi)]}
        """
        if format_type == "simple":
            term = self.question
            definition = self.get_correct_answer_text()
            return f"{term}\t{definition}"

        elif format_type == "full":
            opts = " | ".join(self.options)
            term = f"{self.question}  >>  {opts}"
            definition = self.get_correct_answer_text()
            return f"{term}\t{definition}"

        elif format_type == "safe":
            # Each option on its own line, no >> or / separators
            opts_lines = "\n".join(self.options)
            term = f"{self.question}\n{opts_lines}"
            definition = self.get_correct_answer_text()
            return f"{self.SAFE_CARD_SEP}{term}{self.SAFE_TERM_SEP}{definition}"

        else:  # compact
            opts = " | ".join(self.options)
            term = f"{self.question} [{opts}]"
            definition = ", ".join(self.correct_answers)
            return f"{term}\t{definition}"



@dataclass
class Deck:
    name: str
    cards: List[Flashcard] = field(default_factory=list)
    deck_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    source_folder: str = ""
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "deck_id": self.deck_id,
            "name": self.name,
            "created_at": self.created_at,
            "source_folder": self.source_folder,
            "description": self.description,
            "cards": [c.to_dict() for c in self.cards],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Deck":
        cards = [Flashcard.from_dict(c) for c in data.get("cards", [])]
        return cls(
            deck_id=data.get("deck_id", str(uuid.uuid4())),
            name=data.get("name", "Unnamed Deck"),
            created_at=data.get("created_at", datetime.now().isoformat()),
            source_folder=data.get("source_folder", ""),
            description=data.get("description", ""),
            cards=cards,
        )

    @property
    def card_count(self) -> int:
        return len(self.cards)


@dataclass
class QuizSession:
    """Tracks progress for an in-progress quiz on a deck."""
    deck_id: str
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    question_order: List[int] = field(default_factory=list)  # shuffled card indices
    current_index: int = 0                 # which question we're on
    answers: Dict[str, List[str]] = field(default_factory=dict)  # card_id -> chosen answers
    correct_count: int = 0
    wrong_count: int = 0
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())

    @property
    def is_complete(self) -> bool:
        return self.current_index >= len(self.question_order)

    @property
    def progress_frac(self) -> float:
        if not self.question_order:
            return 0.0
        return self.current_index / len(self.question_order)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "deck_id": self.deck_id,
            "question_order": self.question_order,
            "current_index": self.current_index,
            "answers": self.answers,
            "correct_count": self.correct_count,
            "wrong_count": self.wrong_count,
            "started_at": self.started_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "QuizSession":
        return cls(
            session_id=data.get("session_id", str(uuid.uuid4())),
            deck_id=data.get("deck_id", ""),
            question_order=data.get("question_order", []),
            current_index=data.get("current_index", 0),
            answers=data.get("answers", {}),
            correct_count=data.get("correct_count", 0),
            wrong_count=data.get("wrong_count", 0),
            started_at=data.get("started_at", datetime.now().isoformat()),
        )

    @classmethod
    def new_for_deck(cls, deck: "Deck") -> "QuizSession":
        order = list(range(len(deck.cards)))
        random.shuffle(order)
        return cls(deck_id=deck.deck_id, question_order=order)


# cv_pipeline/core/database.py
# ─────────────────────────────────────────────────────────────
# SQLite store for: enrolled persons, scores, event log.
# Call init_db() once on startup. Thread-safe for FastAPI.
# ─────────────────────────────────────────────────────────────

import sqlite3
import numpy as np
from datetime import datetime
from .config import DB_PATH, SCORE_FLOOR, SCORE_CEIL


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    """Create schema. Safe to call on every startup."""
    with _conn() as c:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS persons (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT    NOT NULL UNIQUE,
                embedding    BLOB    NOT NULL,
                enrolled_at  TEXT    NOT NULL,
                score        INTEGER NOT NULL DEFAULT 100
            );
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS events (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               person_name TEXT NOT NULL,
               activity TEXT NOT NULL,
               score_delta INTEGER NOT NULL,
               id_confidence REAL DEFAULT 0.0,
               activity_conf REAL DEFAULT 0.0,
               timestamp TEXT NOT NULL,
               evidence_path TEXT
            )
        """)
        # Migration: Add activity_conf if it doesn't exist
        try:
            c.execute("ALTER TABLE events ADD COLUMN activity_conf REAL DEFAULT 0.0")
        except:
            pass


# ── Enrollment ─────────────────────────────────────────────

def enroll_person(name: str, embedding: np.ndarray) -> bool:
    """Returns False if name already exists."""
    try:
        with _conn() as c:
            c.execute(
                "INSERT INTO persons (name, embedding, enrolled_at) VALUES (?,?,?)",
                (name.strip(), embedding.astype(np.float32).tobytes(),
                 datetime.now().isoformat())
            )
        return True
    except sqlite3.IntegrityError:
        return False


def update_embedding(name: str, embedding: np.ndarray) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE persons SET embedding=?, enrolled_at=? WHERE name=?",
            (embedding.astype(np.float32).tobytes(),
             datetime.now().isoformat(), name)
        )


def delete_person(name: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM persons WHERE name=?", (name,))


def load_database() -> dict[str, np.ndarray]:
    """Returns {name: embedding} ready for FaceRecognizer."""
    with _conn() as c:
        rows = c.execute("SELECT name, embedding FROM persons").fetchall()
    return {r["name"]: np.frombuffer(r["embedding"], dtype=np.float32)
            for r in rows}


def list_persons() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT name, enrolled_at, score FROM persons ORDER BY score DESC"
        ).fetchall()
    return [dict(r) for r in rows]


# ── Scoring ────────────────────────────────────────────────

def update_score(name: str, delta: int) -> int:
    """Clamps to [SCORE_FLOOR, SCORE_CEIL]. Returns new score."""
    with _conn() as c:
        c.execute(
            """UPDATE persons
               SET score = MAX(?, MIN(?, score + ?))
               WHERE name = ?""",
            (SCORE_FLOOR, SCORE_CEIL, delta, name)
        )
        row = c.execute(
            "SELECT score FROM persons WHERE name=?", (name,)
        ).fetchone()
    return row["score"] if row else 0


def reset_all_scores(default: int = 100) -> None:
    with _conn() as c:
        c.execute("UPDATE persons SET score=?", (default,))


# ── Event log ──────────────────────────────────────────────

def log_event(person_name: str, activity: str, score_delta: int,
              id_confidence: float, activity_conf: float = 0.0,
              evidence_path: str | None = None) -> None:
    with _conn() as c:
        c.execute(
            """INSERT INTO events
               (person_name, activity, score_delta, id_confidence, activity_conf, timestamp, evidence_path)
               VALUES (?,?,?,?,?,?,?)""",
            (person_name, activity, score_delta,
             round(id_confidence, 4), round(activity_conf, 4),
             datetime.now().isoformat(), evidence_path)
        )


def get_event_log(limit: int = 100) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT person_name, activity, score_delta, id_confidence, activity_conf, timestamp, evidence_path
               FROM events ORDER BY id DESC LIMIT ?""", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]

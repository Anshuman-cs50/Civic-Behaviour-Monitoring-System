# cv_pipeline/core/database.py
# ─────────────────────────────────────────────────────────────
# SQLite store for: enrolled persons, scores, event log.
# Call init_db() once on startup. Thread-safe for FastAPI.
# ─────────────────────────────────────────────────────────────

import sqlite3
import numpy as np
from datetime import datetime, timedelta
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
               evidence_path TEXT,
               camera_id TEXT DEFAULT 'Camera 0',
               pipeline_type TEXT DEFAULT 'activity'
            )
        """)
        # Migrations
        try: c.execute("ALTER TABLE events ADD COLUMN activity_conf REAL DEFAULT 0.0")
        except: pass
        try: c.execute("ALTER TABLE events ADD COLUMN camera_id TEXT DEFAULT 'Camera 0'")
        except: pass
        try: c.execute("ALTER TABLE events ADD COLUMN pipeline_type TEXT DEFAULT 'activity'")
        except: pass


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
              evidence_path: str | None = None,
              camera_id: str = "Camera 0",
              pipeline_type: str = "activity") -> None:
    with _conn() as c:
        c.execute(
            """INSERT INTO events
               (person_name, activity, score_delta, id_confidence, activity_conf,
                timestamp, evidence_path, camera_id, pipeline_type)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (person_name, activity, score_delta,
             round(id_confidence, 4), round(activity_conf, 4),
             datetime.now().isoformat(), evidence_path, camera_id, pipeline_type)
        )


def get_event_log(limit: int = 100) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT person_name, activity, score_delta, id_confidence, activity_conf,
                      timestamp, evidence_path, camera_id, pipeline_type
               FROM events ORDER BY id DESC LIMIT ?""", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_top_hotspots(limit: int = 5) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT camera_id, COUNT(*) as incidents
               FROM events GROUP BY camera_id
               ORDER BY incidents DESC LIMIT ?""", (limit,)
        ).fetchall()
    return [{"name": r["camera_id"], "incidents": r["incidents"]} for r in rows]


# ── Analytics ──────────────────────────────────────────────

def get_overview_stats() -> dict:
    """Aggregate stats for the admin overview tile row."""
    with _conn() as c:
        total = c.execute("SELECT COUNT(*) as n FROM events").fetchone()["n"]

        # Critical = negative score events in the last 10 minutes
        cutoff = (datetime.now() - timedelta(minutes=10)).isoformat()
        critical = c.execute(
            "SELECT COUNT(*) as n FROM events WHERE score_delta < -5 AND timestamp > ?",
            (cutoff,)
        ).fetchone()["n"]

        # Detection rate = fraction of events where person was identified (not UNKNOWN)
        identified = c.execute(
            "SELECT COUNT(*) as n FROM events WHERE person_name NOT LIKE 'UNKNOWN%'"
        ).fetchone()["n"]
        detection_rate = round((identified / total * 100) if total > 0 else 0, 1)

        # Active cameras (seen an event in last 60s)
        active_cutoff = (datetime.now() - timedelta(seconds=60)).isoformat()
        active_cams = c.execute(
            "SELECT COUNT(DISTINCT camera_id) as n FROM events WHERE timestamp > ?",
            (active_cutoff,)
        ).fetchone()["n"]

        # All distinct cameras ever seen
        total_cams = c.execute(
            "SELECT COUNT(DISTINCT camera_id) as n FROM events"
        ).fetchone()["n"]

    return {
        "total_incidents": total,
        "critical_alerts": critical,
        "detection_rate": detection_rate,
        "active_cameras": active_cams,
        "total_cameras": max(total_cams, 1),
    }


def get_hourly_trends(hours: int = 24) -> list[dict]:
    """Incident counts per hour for the last N hours, broken down by pipeline_type."""
    with _conn() as c:
        cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()
        rows = c.execute(
            """SELECT strftime('%H:00', timestamp) as hour,
                      pipeline_type,
                      COUNT(*) as count
               FROM events
               WHERE timestamp > ?
               GROUP BY hour, pipeline_type
               ORDER BY hour""",
            (cutoff,)
        ).fetchall()

    # Pivot into [{hour, activity, smoking, roadSafety}, ...]
    pivot: dict[str, dict] = {}
    for r in rows:
        h = r["hour"]
        if h not in pivot:
            pivot[h] = {"time": h, "activity": 0, "smoking": 0, "roadSafety": 0}
        pt = r["pipeline_type"]
        if pt in pivot[h]:
            pivot[h][pt] = r["count"]

    return sorted(pivot.values(), key=lambda x: x["time"])


def get_critical_alerts(limit: int = 10) -> list[dict]:
    """Recent negative-score events for the Critical Alerts feed."""
    with _conn() as c:
        rows = c.execute(
            """SELECT person_name, activity, score_delta, camera_id, timestamp, pipeline_type
               FROM events
               WHERE score_delta < 0
               ORDER BY id DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_activity_breakdown() -> list[dict]:
    """Counts per activity for the Activity Detection stats row."""
    with _conn() as c:
        rows = c.execute(
            """SELECT activity, COUNT(*) as count
               FROM events WHERE pipeline_type = 'activity'
               GROUP BY activity"""
        ).fetchall()
    return [dict(r) for r in rows]


def get_pipeline_distribution() -> list[dict]:
    """Counts per pipeline_type for the donut chart."""
    with _conn() as c:
        rows = c.execute(
            "SELECT pipeline_type, COUNT(*) as count FROM events GROUP BY pipeline_type"
        ).fetchall()
    return [{"name": r["pipeline_type"], "value": r["count"]} for r in rows]


def get_person_profile(name: str) -> dict:
    """Per-person analytics for the User Dashboard radar chart."""
    with _conn() as c:
        events = c.execute(
            "SELECT activity, score_delta, timestamp FROM events WHERE person_name = ?",
            (name,)
        ).fetchall()

        score_row = c.execute(
            "SELECT score FROM persons WHERE name = ?", (name,)
        ).fetchone()

    total = len(events)
    if total == 0:
        return {"radar": [], "trend": [], "score": 100}

    current_score = score_row["score"] if score_row else 100
    positive = sum(1 for e in events if e["score_delta"] >= 0)
    helping  = sum(1 for e in events if e["activity"] == "helping")
    littering = sum(1 for e in events if e["activity"] == "littering")
    spitting  = sum(1 for e in events if e["activity"] == "spitting")

    # Scale all values 0-150 for the radar chart
    radar = [
        {"subject": "Rule Adherence",    "A": round((positive / total) * 150)},
        {"subject": "Civic Actions",      "A": min(helping * 30, 150)},
        {"subject": "Non-Littering",      "A": max(0, 150 - littering * 25)},
        {"subject": "Non-Spitting",       "A": max(0, 150 - spitting * 25)},
        {"subject": "Overall Score",      "A": min(current_score, 150)},
    ]

    # Build score trend from individual events in chronological order
    running = 100
    trend = []
    for e in reversed(list(events)):
        running = max(SCORE_FLOOR, min(SCORE_CEIL, running + e["score_delta"]))
        trend.append({"timestamp": e["timestamp"], "score": running})

    return {
        "radar": radar,
        "trend": trend[-50:],  # last 50 events
        "score": current_score,
    }

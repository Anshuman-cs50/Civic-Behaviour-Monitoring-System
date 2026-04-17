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

            CREATE TABLE IF NOT EXISTS person_embeddings (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                person_name  TEXT    NOT NULL,
                embedding    BLOB    NOT NULL,
                label        TEXT    DEFAULT '',
                enrolled_at  TEXT    NOT NULL,
                FOREIGN KEY (person_name) REFERENCES persons(name) ON DELETE CASCADE
            );

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
            );

            CREATE TABLE IF NOT EXISTS cameras (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL DEFAULT 30.336542,
                lng REAL NOT NULL DEFAULT 77.869149,
                last_seen TEXT
            );
        """)
        # ── Column migrations ──────────────────────────────────────
        for col_sql in [
            "ALTER TABLE events ADD COLUMN activity_conf REAL DEFAULT 0.0",
            "ALTER TABLE events ADD COLUMN camera_id TEXT DEFAULT 'Camera 0'",
            "ALTER TABLE events ADD COLUMN pipeline_type TEXT DEFAULT 'activity'",
        ]:
            try: c.execute(col_sql)
            except: pass

        # ── Migrate legacy single-embedding rows into person_embeddings ─
        # If a person exists in 'persons' but has no rows in person_embeddings,
        # copy the legacy embedding blob across so old enrollments still work.
        legacy = c.execute(
            """SELECT p.name, p.embedding, p.enrolled_at
               FROM persons p
               WHERE NOT EXISTS (
                   SELECT 1 FROM person_embeddings pe WHERE pe.person_name = p.name
               )"""
        ).fetchall()
        for row in legacy:
            c.execute(
                """INSERT INTO person_embeddings (person_name, embedding, label, enrolled_at)
                   VALUES (?, ?, 'front', ?)""",
                (row["name"], row["embedding"], row["enrolled_at"])
            )
        if legacy:
            print(f"[DB] Migrated {len(legacy)} legacy single-embedding person(s) to gallery table.")


# ── Enrollment ─────────────────────────────────────────────

def enroll_person(name: str, embedding: np.ndarray, label: str = "photo_1") -> bool:
    """
    Enroll a new person with their first embedding.
    - Creates a 'persons' record (with a copy of the embedding for legacy compat).
    - Also inserts into person_embeddings for gallery matching.
    Returns True if created, False if the name already existed.
    In both cases, call add_person_embedding() if you want to add MORE photos.
    """
    now = datetime.now().isoformat()
    blob = embedding.astype(np.float32).tobytes()
    created = False
    try:
        with _conn() as c:
            c.execute(
                "INSERT INTO persons (name, embedding, enrolled_at) VALUES (?,?,?)",
                (name.strip(), blob, now)
            )
            created = True
    except sqlite3.IntegrityError:
        pass   # person already exists — that's fine, we still add the photo below

    # Always add this embedding to the gallery
    add_person_embedding(name.strip(), embedding, label)
    return created


def add_person_embedding(name: str, embedding: np.ndarray, label: str = "") -> int:
    """
    Add one more photo-embedding to an existing person's gallery.
    Returns the new row id.
    Auto-labels as 'photo_N' if label is empty.
    """
    with _conn() as c:
        # Auto-label
        if not label:
            count = c.execute(
                "SELECT COUNT(*) FROM person_embeddings WHERE person_name=?", (name,)
            ).fetchone()[0]
            label = f"photo_{count + 1}"

        cur = c.execute(
            """INSERT INTO person_embeddings (person_name, embedding, label, enrolled_at)
               VALUES (?, ?, ?, ?)""",
            (name, embedding.astype(np.float32).tobytes(), label, datetime.now().isoformat())
        )
        # Also keep the persons.embedding column in sync (set to this latest embedding)
        c.execute(
            """UPDATE persons SET embedding=?, enrolled_at=? WHERE name=?""",
            (embedding.astype(np.float32).tobytes(), datetime.now().isoformat(), name)
        )
        return cur.lastrowid


def update_embedding(name: str, embedding: np.ndarray) -> None:
    """Legacy compat: replaces the primary embedding and adds it to the gallery."""
    add_person_embedding(name, embedding, label="updated")


def delete_person_photo(name: str, photo_id: int) -> bool:
    """Remove one specific embedding from a person's gallery by its row id."""
    with _conn() as c:
        cur = c.execute(
            "DELETE FROM person_embeddings WHERE id=? AND person_name=?",
            (photo_id, name)
        )
        return cur.rowcount > 0


def delete_person(name: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM person_embeddings WHERE person_name=?", (name,))
        c.execute("DELETE FROM persons WHERE name=?", (name,))


def list_person_photos(name: str) -> list[dict]:
    """Return all photo-embeddings for a person (id, label, enrolled_at)."""
    with _conn() as c:
        rows = c.execute(
            """SELECT id, label, enrolled_at FROM person_embeddings
               WHERE person_name=? ORDER BY id""",
            (name,)
        ).fetchall()
    return [dict(r) for r in rows]


def load_database() -> dict[str, list[np.ndarray]]:
    """
    Returns {name: [emb1, emb2, ...]} — a gallery of embeddings per person.
    FaceRecognizer._match() takes the MAX cosine similarity across all embeddings
    for each person, which is the standard nearest-neighbour gallery strategy.
    """
    with _conn() as c:
        rows = c.execute(
            """SELECT person_name, embedding FROM person_embeddings ORDER BY person_name, id"""
        ).fetchall()

    db: dict[str, list[np.ndarray]] = {}
    for r in rows:
        emb = np.frombuffer(r["embedding"], dtype=np.float32).copy()
        db.setdefault(r["person_name"], []).append(emb)

    # Fallback: if person_embeddings is empty, load from legacy persons.embedding
    if not db:
        with _conn() as c:
            legacy = c.execute("SELECT name, embedding FROM persons").fetchall()
        for r in legacy:
            emb = np.frombuffer(r["embedding"], dtype=np.float32).copy()
            db[r["name"]] = [emb]
    return db


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
    now = datetime.now().isoformat()
    with _conn() as c:
        # Register camera if not exists
        c.execute(
            """INSERT OR IGNORE INTO cameras (id, name, last_seen)
               VALUES (?, ?, ?)""", (camera_id, camera_id, now)
        )
        c.execute(
            """UPDATE cameras SET last_seen = ? WHERE id = ?""", (now, camera_id)
        )

        c.execute(
            """INSERT INTO events
               (person_name, activity, score_delta, id_confidence, activity_conf,
                timestamp, evidence_path, camera_id, pipeline_type)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (person_name, activity, score_delta,
             round(id_confidence, 4), round(activity_conf, 4),
             now, evidence_path, camera_id, pipeline_type)
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


    # Scale all values 0-150 for the radar chart
    radar = [
        {"subject": "Rule Adherence",    "A": round((positive / total) * 150)},
        {"subject": "Civic Actions",      "A": min(helping * 30, 150)},
        {"subject": "Non-Littering",      "A": max(0, 150 - littering * 25)},

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


# ── Cameras ────────────────────────────────────────────────

def get_all_cameras() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT id, name, lat, lng, last_seen FROM cameras").fetchall()
    return [dict(r) for r in rows]

def update_camera(cam_id: str, name: str, lat: float, lng: float) -> None:
    with _conn() as c:
        c.execute(
            """INSERT INTO cameras (id, name, lat, lng, last_seen)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, lat=excluded.lat, lng=excluded.lng""",
            (cam_id, name, lat, lng, datetime.now().isoformat())
        )

def get_heatmap_data() -> list[dict]:
    """Returns camera coordinates and incident-weighted intensity for the map."""
    with _conn() as c:
        rows = c.execute(
            """SELECT c.id, c.name, c.lat, c.lng, COUNT(e.id) as incidents
               FROM cameras c
               LEFT JOIN events e ON c.id = e.camera_id
               GROUP BY c.id"""
        ).fetchall()
    return [dict(r) for r in rows]

def get_smoking_stats() -> dict:
    """Aggregated metrics for the Smoking Detection dashboard."""
    with _conn() as c:
        total = c.execute(
            "SELECT COUNT(*) as n FROM events WHERE pipeline_type = 'smoking'"
        ).fetchone()["n"]

        identified = c.execute(
            """SELECT COUNT(*) as n FROM events
               WHERE pipeline_type = 'smoking' AND person_name NOT LIKE 'UNKNOWN%'"""
        ).fetchone()["n"]

        cutoff_10m = (datetime.now() - timedelta(minutes=10)).isoformat()
        recent = c.execute(
            "SELECT COUNT(*) as n FROM events WHERE pipeline_type='smoking' AND timestamp > ?",
            (cutoff_10m,)
        ).fetchone()["n"]

        unique_people = c.execute(
            """SELECT COUNT(DISTINCT person_name) as n FROM events
               WHERE pipeline_type = 'smoking' AND person_name NOT LIKE 'UNKNOWN%'"""
        ).fetchone()["n"]

        events_feed = c.execute(
            """SELECT person_name, camera_id, timestamp, activity_conf, score_delta
               FROM events WHERE pipeline_type='smoking'
               ORDER BY id DESC LIMIT 20"""
        ).fetchall()

        per_camera = c.execute(
            """SELECT camera_id, COUNT(*) as count
               FROM events WHERE pipeline_type='smoking'
               GROUP BY camera_id ORDER BY count DESC LIMIT 8"""
        ).fetchall()

        cutoff_12h = (datetime.now() - timedelta(hours=12)).isoformat()
        hourly = c.execute(
            """SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as count
               FROM events WHERE pipeline_type='smoking' AND timestamp > ?
               GROUP BY hour ORDER BY hour""",
            (cutoff_12h,)
        ).fetchall()

    return {
        "total_detections":   total,
        "identified_persons": identified,
        "recent_10min":       recent,
        "unique_offenders":   unique_people,
        "detection_rate":     round((identified / total * 100) if total > 0 else 0, 1),
        "events":             [dict(r) for r in events_feed],
        "per_camera":         [dict(r) for r in per_camera],
        "hourly":             [dict(r) for r in hourly],
    }

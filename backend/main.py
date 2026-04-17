# backend/main.py
# ─────────────────────────────────────────────────────────────
# FastAPI application — central orchestrator.
#
# Endpoints:
#   POST /auth/login             — returns {role, token}
#   POST /auth/logout            — clears session
#   GET  /auth/me                — returns current session
#
#   POST /stream/start           — start Kaggle stream
#   POST /stream/stop            — stop stream
#   GET  /stream/status          — stream stats
#   GET  /stream/clips           — list available test clips
#
#   POST /enroll                 — enroll a face
#   GET  /persons                — list persons + scores
#   GET  /events                 — event log
#   POST /reset-scores           — reset all scores
#   GET  /status                 — global status
#
#   WS   /ws/video               — annotated JPEG frames (base64)
#   WS   /ws/alerts              — JSON alert objects
#
#   POST /ingest/frame           — push frame from kaggle_client (legacy)
#   POST /ingest/alert           — push alert from kaggle_client (legacy)
# ─────────────────────────────────────────────────────────────

import asyncio
import base64
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import psutil
import cv2
import numpy as np
from fastapi import (
    Depends, FastAPI, File, Form, HTTPException,
    UploadFile, WebSocket, WebSocketDisconnect,
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

# ── Backend modules ────────────────────────────────────────
from cv_pipeline.core.config import VIDEO_FPS_CAP, LOGS_DIR
from cv_pipeline.core.config import PROCESSED_DIR   # Path object: Stream/processed_clips/
from cv_pipeline.core.database import (
    get_event_log, init_db, list_persons, load_database,
    log_event, reset_all_scores,
    enroll_person, update_embedding,
    add_person_embedding, delete_person, delete_person_photo, list_person_photos,
    get_top_hotspots,
    get_overview_stats, get_hourly_trends, get_critical_alerts,
    get_activity_breakdown, get_pipeline_distribution, get_person_profile,
    get_all_cameras, update_camera, get_heatmap_data, get_smoking_stats,
)
from cv_pipeline.modules.face_recognizer import FaceRecognizer
from cv_pipeline.modules.rule_engine import RuleEngine
from cv_pipeline.modules.evidence_buffer import EvidenceBuffer
from stream_manager import StreamManager


# ── Auth config ────────────────────────────────────────────
# Change these via environment variables in production.
ADMIN_USER = os.getenv("CBMS_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("CBMS_ADMIN_PASS", "cbms2026")
USER_PASS  = os.getenv("CBMS_USER_PASS",  "civic2026")

# In-memory session store: { token: {role, username} }
_sessions: dict[str, dict] = {
    "admin-token": {"role": "admin", "username": "admin"}
}
_api_header = APIKeyHeader(name="X-Auth-Token", auto_error=False)


def _get_session(token: str | None = Depends(_api_header)) -> dict:
    if token == "admin-token":
        return {"role": "admin", "username": "admin"}
    if token and token in _sessions:
        return _sessions[token]
    raise HTTPException(status_code=401, detail="Not authenticated")


def _get_admin(session: dict = Depends(_get_session)) -> dict:
    if session.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return session


# ── Pydantic models ────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str
    consent:  bool = False          # required for 'user' role

class StreamStartRequest(BaseModel):
    ngrok_url: str
    source:    str  = "0"           # "0" = webcam, or a filename in unprocessed_clips
    chunk_sec: int  = 10
    fps:       int  = 15

class PlayRequest(BaseModel):
    speed: float = 1.0

class IngestFrameRequest(BaseModel):
    frame_b64: str

class CameraUpdateRequest(BaseModel):
    id: str
    name: str
    lat: float
    lng: float

class IngestAlertRequest(BaseModel):
    person_name:       str
    activity:          str
    score_delta:       int  = 0
    new_score:         int  = 0
    id_confidence:     float = 0.0
    activity_conf:     float = 0.0
    evidence_grid_b64: Optional[str] = None
    frame_index:       Optional[int] = None
    # Routing fields (sent by the refactored kaggle_client.py)
    pipeline_type:     str = "activity"     # "activity" | "smoking" | "roadSafety"
    camera_id:         str = "Camera 0"
    location_label:    str = ""


# ── App state ──────────────────────────────────────────────

class AppState:
    face_recognizer  : FaceRecognizer   = None
    rule_engine      : RuleEngine       = None
    evidence_buffer  : EvidenceBuffer   = None
    face_db          : dict             = {}
    video_clients    : list[WebSocket]  = []
    alert_clients    : list[WebSocket]  = []
    stream_manager   : StreamManager    = None
    mode             : str              = "idle"
    # bridge: asyncio loop reference so sync callbacks can schedule coroutines
    loop             : asyncio.AbstractEventLoop = None


state = AppState()


# ── Lifespan ───────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    state.face_recognizer = FaceRecognizer()
    state.rule_engine     = RuleEngine()
    state.evidence_buffer = EvidenceBuffer()
    state.face_db         = load_database()
    state.stream_manager  = StreamManager()
    # IMPORTANT: get_running_loop() — not get_event_loop() — returns the
    # actual uvicorn event loop that is currently running.  get_event_loop()
    # can silently return a *different* loop in Python 3.10+, which causes
    # run_coroutine_threadsafe to schedule onto the wrong loop and frames
    # never reach the WebSocket clients.
    state.loop = asyncio.get_running_loop()
    yield
    state.stream_manager.stop()


app = FastAPI(title="CBMS Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve evidence frames/clips
app.mount("/evidence", StaticFiles(directory=str(LOGS_DIR)), name="evidence")
app.mount("/processed-clips", StaticFiles(directory=str(PROCESSED_DIR)), name="processed_clips")

TEST_CLIPS_DIR = Path(PROCESSED_DIR).parent / "Test Clips"
TEST_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/test-clips", StaticFiles(directory=str(TEST_CLIPS_DIR)), name="test_clips")


# ══════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════

@app.post("/auth/login")
async def login(body: LoginRequest):
    role = None
    if body.username == ADMIN_USER and body.password == ADMIN_PASS:
        role = "admin"
    elif body.password == USER_PASS:
        if not body.consent:
            raise HTTPException(
                status_code=400,
                detail="You must accept the consent agreement to access the system.",
            )
        role = "user"
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = str(uuid.uuid4())
    _sessions[token] = {"role": role, "username": body.username}
    return {"token": token, "role": role, "username": body.username}


@app.post("/auth/logout")
async def logout(token: str | None = Depends(_api_header)):
    if token and token in _sessions:
        del _sessions[token]
    return {"status": "ok"}


@app.get("/auth/me")
async def me(session: dict = Depends(_get_session)):
    return session


# ══════════════════════════════════════════════════════════
# STREAM CONTROL ENDPOINTS  (admin only)
# ══════════════════════════════════════════════════════════

@app.post("/stream/start")
async def stream_start(
    body: StreamStartRequest,
    _: dict = Depends(_get_admin),
):
    """Start the Kaggle-remote stream."""
    # Resolve source: "0" → webcam, else look in UNPROCESSED_DIR
    source: int | str
    if body.source == "0":
        source = 0
    elif body.source.startswith("processed:"):
        # Resolve relative path from PROCESSED_DIR (handles session subdirs)
        rel_path = body.source[len("processed:"):]
        clip_path = PROCESSED_DIR / rel_path
        if not clip_path.exists():
            raise HTTPException(404, f"Processed clip not found: {rel_path}")
        source = str(clip_path)
    else:
        clip_path = Path(PROCESSED_DIR).parent / "Test Clips" / body.source
        if not clip_path.exists():
            raise HTTPException(404, f"Clip not found: {body.source}")
        source = str(clip_path)

    def on_frame_sync(b64: str):
        """Called from the StreamManager playback thread.
        Returns the concurrent.futures.Future so the caller can block on it,
        providing backpressure and preventing event-loop flooding."""
        coro = _broadcast_raw_frame(b64)
        return asyncio.run_coroutine_threadsafe(coro, state.loop)

    def on_alert_sync(alert: dict):
        """Called from the StreamManager upload thread — fire and forget."""
        coro = _broadcast_and_log_alert(alert)
        asyncio.run_coroutine_threadsafe(coro, state.loop)

    state.stream_manager.start(
        source    = source,
        ngrok_url = body.ngrok_url,
        on_frame  = on_frame_sync,
        on_alert  = on_alert_sync,
        chunk_sec = body.chunk_sec,
        fps       = body.fps,
    )
    state.mode = "live"
    return {"status": "started"}


@app.post("/stream/stop")
async def stream_stop(_: dict = Depends(_get_admin)):
    state.stream_manager.stop()
    state.mode = "idle"
    return {"status": "stopped"}


@app.get("/stream/status")
async def stream_status(_: dict = Depends(_get_session)):
    return state.stream_manager.status()


@app.get("/stream/clips")
async def stream_clips(_: dict = Depends(_get_session)):
    """List .mp4 files from Test Clips and all session subdirs of processed_clips."""
    results: list[dict] = []

    # Test clips (original/unprocessed videos)
    test_dir = PROCESSED_DIR.parent / "Test Clips"
    test_dir.mkdir(parents=True, exist_ok=True)
    for p in sorted(test_dir.glob("*.mp4")):
        results.append({"value": p.name, "label": p.name, "group": "Test Clips"})

    # Annotated clips in session subdirs (rglob walks all subdirectories)
    proc_clips = sorted(PROCESSED_DIR.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)[:50]
    for p in proc_clips:
        # Store relative path from PROCESSED_DIR using forward slashes for URLs
        rel = p.relative_to(PROCESSED_DIR).as_posix()
        results.append({"value": f"processed:{rel}", "label": p.name, "group": "Processed"})

    return {"clips": [r["value"] for r in results], "clips_detailed": results}


# ══════════════════════════════════════════════════════════
# PERSON / ENROLLMENT ENDPOINTS
# ══════════════════════════════════════════════════════════

def _extract_face_or_400(frame: np.ndarray) -> np.ndarray:
    """Helper: extract embedding or raise 400."""
    if frame is None:
        raise HTTPException(400, "Could not decode image — send a valid JPEG or PNG")
    embedding = state.face_recognizer.extract_embedding(frame)
    if embedding is None:
        raise HTTPException(400, "No face detected in the image — try a clearer photo with good lighting")
    return embedding


@app.post("/enroll")
async def enroll(
    name: str = Form(...),
    file: UploadFile = File(...),
    label: str = Form(default=""),          # optional: 'front', 'left', 'right', etc.
    _: dict = Depends(_get_admin),
):
    """
    Enroll a new person OR add a first photo.
    For additional photos of the same person, use POST /persons/{name}/add-photo.
    """
    contents = await file.read()
    frame     = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    embedding = _extract_face_or_400(frame)

    created = enroll_person(name, embedding, label or "photo_1")
    state.face_db = load_database()
    photo_count = len(state.face_db.get(name, []))
    return {
        "status":      "enrolled" if created else "photo_added",
        "name":        name,
        "photo_count": photo_count,
        "db_size":     len(state.face_db),
    }


@app.post("/persons/{name}/add-photo")
async def add_photo(
    name: str,
    file: UploadFile = File(...),
    label: str = Form(default=""),          # optional angle label
    _: dict = Depends(_get_admin),
):
    """Add an additional photo to an already-enrolled person's gallery."""
    # Ensure person exists
    existing = list_person_photos(name)
    if not existing:
        raise HTTPException(404, f"Person '{name}' not enrolled yet. Use POST /enroll first.")

    contents = await file.read()
    frame     = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    embedding = _extract_face_or_400(frame)

    photo_id = add_person_embedding(name, embedding, label)
    state.face_db = load_database()
    return {
        "status":      "photo_added",
        "name":        name,
        "photo_id":    photo_id,
        "photo_count": len(state.face_db.get(name, [])),
    }


@app.get("/persons/{name}/photos")
async def get_photos(name: str, _: dict = Depends(_get_session)):
    """List all enrolled photos for a person (id, label, enrolled_at)."""
    photos = list_person_photos(name)
    if not photos:
        raise HTTPException(404, f"Person '{name}' not found or has no photos.")
    return {"name": name, "photos": photos}


@app.delete("/persons/{name}/photos/{photo_id}")
async def remove_photo(
    name: str, photo_id: int, _: dict = Depends(_get_admin)
):
    """Delete a specific photo from a person's gallery by photo_id."""
    deleted = delete_person_photo(name, photo_id)
    if not deleted:
        raise HTTPException(404, "Photo not found or doesn't belong to this person")
    state.face_db = load_database()
    remaining = len(state.face_db.get(name, []))
    return {"status": "deleted", "name": name, "remaining_photos": remaining}


@app.get("/persons")
async def persons(_: dict = Depends(_get_session)):
    rows = list_persons()
    # Annotate each person with their photo count
    db = state.face_db
    for row in rows:
        row["photo_count"] = len(db.get(row["name"], []))
    return rows



@app.get("/events")
async def events(limit: int = 100, _: dict = Depends(_get_session)):
    return get_event_log(limit)


@app.post("/reset-scores")
async def reset_scores(_: dict = Depends(_get_admin)):
    reset_all_scores()
    state.face_db = load_database()
    return {"status": "reset"}

@app.get("/events/hotspots")
async def hotspots(limit: int = 5, _: dict = Depends(_get_session)):
    return get_top_hotspots(limit)

@app.get("/system-health")
async def system_health(_: dict = Depends(_get_session)):
    return {
        "cpu": psutil.cpu_percent(interval=None),
        "memory": psutil.virtual_memory().percent,
        "gpu": 0
    }

# ── Analytics ────────────────────────────────────────────────

@app.get("/analytics/overview")
async def analytics_overview(_: dict = Depends(_get_session)):
    """Unified admin overview tile row — combines DB stats + live stream latency."""
    db_stats = get_overview_stats()
    sm = state.stream_manager.status() if state.stream_manager else {}
    return {
        **db_stats,
        "avg_latency_ms": round(sm.get("last_latency_s", 0) * 1000),
        "is_streaming": sm.get("is_streaming", False),
    }

@app.get("/analytics/trends/hourly")
async def analytics_hourly_trends(hours: int = 24, _: dict = Depends(_get_session)):
    return get_hourly_trends(hours)

@app.get("/analytics/alerts/critical")
async def analytics_critical_alerts(limit: int = 10, _: dict = Depends(_get_session)):
    return get_critical_alerts(limit)

@app.get("/analytics/activity")
async def analytics_activity(_: dict = Depends(_get_session)):
    return get_activity_breakdown()

@app.get("/analytics/pipelines")
async def analytics_pipelines(_: dict = Depends(_get_session)):
    return get_pipeline_distribution()

@app.get("/analytics/smoking")
async def analytics_smoking(_: dict = Depends(_get_session)):
    return get_smoking_stats()

@app.get("/analytics/user/{username}")
async def analytics_user(username: str, _: dict = Depends(_get_session)):
    return get_person_profile(username)

@app.post("/api/ingest/push-chunk")
async def push_chunk(
    file: UploadFile = File(...),
    camera_id: str = Form("Mobile_Cam"),
    _: dict = Depends(_get_session)
):
    """Receives a video chunk from a mobile device and injects it into the pipeline."""
    if not state.stream_manager or not state.stream_manager.status().get("is_streaming"):
        raise HTTPException(status_code=400, detail="Stream session not active. Start stream first.")

    session_dir = Path("data/unprocessed") / state.stream_manager.status().get("session_name", "")
    session_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = session_dir / f"pushed_{uuid.uuid4().hex[:8]}_{file.filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    state.stream_manager.inject_external_chunk(str(file_path), camera_id)
    return {"status": "injected", "path": str(file_path)}

@app.get("/analytics/heatmap")
async def analytics_heatmap(_: dict = Depends(_get_session)):
    return get_heatmap_data()

@app.get("/api/cameras")
async def api_get_cameras(_: dict = Depends(_get_session)):
    return get_all_cameras()

@app.post("/api/cameras")
async def api_update_camera(data: CameraUpdateRequest, _: dict = Depends(_get_admin)):
    update_camera(data.id, data.name, data.lat, data.lng)
    return {"status": "ok"}



@app.get("/status")
async def get_status():
    """Public — used by frontend polling before auth."""
    sm = state.stream_manager.status() if state.stream_manager else {}
    return {
        "mode":     state.mode,
        "enrolled": len(state.face_db),
        **sm,
    }


# ══════════════════════════════════════════════════════════
# LEGACY INGEST ENDPOINTS  (from standalone kaggle_client.py)
# ══════════════════════════════════════════════════════════

@app.post("/ingest/frame")
async def ingest_frame(data: IngestFrameRequest):
    state.mode = "live"
    await _broadcast_raw_frame(data.frame_b64)
    return {"status": "ok"}


@app.post("/ingest/alert")
async def ingest_alert(body: IngestAlertRequest):
    alert = body.dict()
    await _broadcast_and_log_alert(alert)
    return {"status": "ok"}


# ══════════════════════════════════════════════════════════
# WEBSOCKET ENDPOINTS
# ══════════════════════════════════════════════════════════

@app.websocket("/ws/video")
async def ws_video(ws: WebSocket):
    await ws.accept()
    state.video_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in state.video_clients:
            state.video_clients.remove(ws)


@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    await ws.accept()
    state.alert_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in state.alert_clients:
            state.alert_clients.remove(ws)


# ══════════════════════════════════════════════════════════
# INTERNAL — broadcast helpers
# ══════════════════════════════════════════════════════════

async def _broadcast_raw_frame(b64: str):
    if not state.video_clients:
        return
    payload = json.dumps({"type": "frame", "data": b64})
    dead = []
    for ws in state.video_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in state.video_clients:
            state.video_clients.remove(ws)


async def _broadcast_alert(alert: dict):
    if not state.alert_clients:
        return
    payload = json.dumps({"type": "alert", **alert})
    dead = []
    for ws in state.alert_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in state.alert_clients:
            state.alert_clients.remove(ws)


async def _broadcast_and_log_alert(alert: dict):
    """Broadcast over WS and persist to SQLite."""
    # 1. Consolidate evidence keys (Kaggle pipeline uses b64, Local uses path)
    ep = alert.get("evidence_path") or alert.get("evidence_grid_b64")
    
    if ep:
        # 2. If it's pure base64 (from Kaggle), add the data URI prefix for the frontend
        if not ep.startswith("data:") and not ep.startswith("/") and len(ep) > 200:
            ep = f"data:image/jpeg;base64,{ep}"
        
        # 3. If it's an absolute disk path, convert to just the filename for the /evidence route
        elif not ep.startswith("data:") and os.path.isabs(ep):
            ep = os.path.basename(ep)
        
        alert["evidence_path"] = ep

    # Infer camera source if not provided in alert
    camera_id = alert.get("camera_id")
    if not camera_id:
        if state.stream_manager:
            camera_id = state.stream_manager.status().get("source", "Camera 0")
        else:
            camera_id = "Camera 0"

    await _broadcast_alert(alert)
    try:
        log_event(
            person_name  = alert.get("person_name", "UNKNOWN"),
            activity     = alert.get("activity", "unknown"),
            score_delta  = int(alert.get("score_delta", 0)),
            id_confidence= float(alert.get("id_confidence", 0.0)),
            activity_conf= float(alert.get("activity_conf", 0.0)),
            evidence_path= alert.get("evidence_path"),
            camera_id    = camera_id,
            pipeline_type= alert.get("pipeline_type", "activity"),
        )
    except Exception as e:
        print(f"[main] log_event error: {e}")


# ══════════════════════════════════════════════════════════
# INTERNAL — evidence pipeline (wired from EvidenceBuffer)
# ══════════════════════════════════════════════════════════

async def _process_evidence(track_id: int, activity: str):
    """
    Finalises evidence, runs face ID, evaluates rules, broadcasts alert.
    Called when EvidenceBuffer reports is_complete() for a track.
    """
    try:
        crops, evidence_path = state.evidence_buffer.finalise(track_id)

        person_name, id_conf = state.face_recognizer.identify_from_crops(
            crops, state.face_db
        )

        result = state.rule_engine.evaluate(
            person_name or f"UNKNOWN-{track_id}",
            activity,
            id_conf,
            evidence_path,
        )

        if result.fired:
            alert = result.to_alert_dict()
            alert["evidence_path"] = evidence_path
            await _broadcast_and_log_alert(alert)

    except Exception as e:
        print(f"[main] _process_evidence error (track {track_id}): {e}")

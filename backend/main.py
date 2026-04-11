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

import cv2
import numpy as np
from fastapi import (
    Depends, FastAPI, File, Form, HTTPException,
    UploadFile, WebSocket, WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

# ── Backend modules ────────────────────────────────────────
from cv_pipeline.core.config import PROCESSED_DIR, VIDEO_FPS_CAP
from cv_pipeline.core.database import (
    get_event_log, init_db, list_persons, load_database,
    log_event, reset_all_scores,
    enroll_person, update_embedding,
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
_sessions: dict[str, dict] = {}
_api_header = APIKeyHeader(name="X-Auth-Token", auto_error=False)


def _get_session(token: str | None = Depends(_api_header)) -> dict:
    if token and token in _sessions:
        return _sessions[token]
    raise HTTPException(status_code=401, detail="Not authenticated")


def _require_admin(session: dict = Depends(_get_session)) -> dict:
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

class IngestAlertRequest(BaseModel):
    person_name:       str
    activity:          str
    score_delta:       int  = 0
    new_score:         int  = 0
    id_confidence:     float = 0.0
    evidence_grid_b64: Optional[str] = None
    frame_index:       Optional[int] = None


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
    _: dict = Depends(_require_admin),
):
    """Start the Kaggle-remote stream."""
    # Resolve source: "0" → webcam, else look in UNPROCESSED_DIR
    source: int | str
    if body.source == "0":
        source = 0
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
async def stream_stop(_: dict = Depends(_require_admin)):
    state.stream_manager.stop()
    state.mode = "idle"
    return {"status": "stopped"}


@app.get("/stream/status")
async def stream_status(_: dict = Depends(_get_session)):
    return state.stream_manager.status()


@app.get("/stream/clips")
async def stream_clips(_: dict = Depends(_get_session)):
    """List .mp4 files available as test clips (from Stream/Test Clips/)."""
    clips_dir = Path(PROCESSED_DIR).parent / "Test Clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    clips = sorted(p.name for p in clips_dir.glob("*.mp4"))
    return {"clips": clips}


# ══════════════════════════════════════════════════════════
# PERSON / ENROLLMENT ENDPOINTS
# ══════════════════════════════════════════════════════════

@app.post("/enroll")
async def enroll(
    name: str = Form(...),
    file: UploadFile = File(...),
    _: dict = Depends(_require_admin),
):
    contents = await file.read()
    np_arr   = np.frombuffer(contents, np.uint8)
    frame    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(400, "Could not decode image — send a valid JPEG or PNG")

    embedding = state.face_recognizer.extract_embedding(frame)
    if embedding is None:
        raise HTTPException(400, "No face detected in the image — try a clearer photo")

    enrolled = enroll_person(name, embedding)
    if not enrolled:
        update_embedding(name, embedding)

    state.face_db = load_database()
    return {"status": "enrolled", "name": name, "db_size": len(state.face_db)}


@app.get("/persons")
async def persons(_: dict = Depends(_get_session)):
    return list_persons()


@app.get("/events")
async def events(limit: int = 100, _: dict = Depends(_get_session)):
    return get_event_log(limit)


@app.post("/reset-scores")
async def reset_scores(_: dict = Depends(_require_admin)):
    reset_all_scores()
    state.face_db = load_database()
    return {"status": "reset"}


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
    await _broadcast_alert(alert)
    try:
        log_event(
            person_name  = alert.get("person_name", "UNKNOWN"),
            activity     = alert.get("activity", "unknown"),
            score_delta  = int(alert.get("score_delta", 0)),
            id_confidence= float(alert.get("id_confidence", 0.0)),
            evidence_path= alert.get("evidence_grid_b64") or alert.get("evidence_path"),
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

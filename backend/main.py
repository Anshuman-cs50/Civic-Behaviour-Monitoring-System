# backend/main.py
# ─────────────────────────────────────────────────────────────
# FastAPI application — central orchestrator.
#
# Endpoints:
#   POST /enroll                — enroll a new face
#   GET  /persons               — list all persons + scores
#   GET  /events                — recent event log
#   POST /reset-scores          — reset all scores to 100
#   WS   /ws/video              — annotated JPEG frames (base64)
#   WS   /ws/alerts             — JSON alert objects
#
# TODO (Day 1): Fill enroll() endpoint logic
# TODO (Day 2): Fill _pipeline_loop()
# TODO (Day 3): Fill _process_evidence() wiring
# ─────────────────────────────────────────────────────────────

import asyncio
import base64
import json
import cv2
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import zipfile
import io
from pydantic import BaseModel
from typing import Optional

class PlayRequest(BaseModel):
    speed: float = 1.0

class IngestFrameRequest(BaseModel):
    frame_b64: str

class IngestAlertRequest(BaseModel):
    person_name: str
    activity: str
    score_delta: int
    new_score: int
    id_confidence: float
    evidence_grid_b64: Optional[str] = None
    frame_index: Optional[int] = None

from cv_pipeline.core.config  import (
    CAMERA_INDEX, CAMERA_WIDTH, CAMERA_HEIGHT, VIDEO_FPS_CAP
)
from cv_pipeline.core.database import (
    init_db, enroll_person, update_embedding,
    load_database, list_persons, get_event_log, reset_all_scores, log_event
)
from cv_pipeline.modules.scene_monitor    import SceneMonitor
from cv_pipeline.modules.tracker          import Tracker
from cv_pipeline.modules.activity_detector import ActivityDetector
from cv_pipeline.modules.evidence_buffer  import EvidenceBuffer
from cv_pipeline.modules.face_recognizer  import FaceRecognizer
from cv_pipeline.modules.rule_engine      import RuleEngine


# ── App state ──────────────────────────────────────────────

class AppState:
    scene_monitor    : SceneMonitor     = None
    tracker          : Tracker          = None
    activity_detector: ActivityDetector = None
    evidence_buffer  : EvidenceBuffer   = None
    face_recognizer  : FaceRecognizer   = None
    rule_engine      : RuleEngine       = None
    face_db          : dict             = {}
    video_clients    : list[WebSocket]  = []
    alert_clients    : list[WebSocket]  = []
    pipeline_task    : asyncio.Task | None = None
    replay_frames    : list             = []
    replay_alerts    : dict             = {}
    replay_task      : asyncio.Task | None = None
    mode             : str              = "idle"


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    state.scene_monitor     = SceneMonitor()
    state.tracker           = Tracker()
    state.activity_detector = ActivityDetector()
    state.evidence_buffer   = EvidenceBuffer()
    state.face_recognizer   = FaceRecognizer()
    state.rule_engine       = RuleEngine()
    state.face_db           = load_database()
    state.pipeline_task     = asyncio.create_task(_pipeline_loop())
    yield
    # Shutdown
    if state.pipeline_task is not None:
        state.pipeline_task.cancel()


app = FastAPI(title="CBMS Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST endpoints ─────────────────────────────────────────

@app.post("/enroll")
async def enroll(name: str = Form(...), file: UploadFile = File(...)):
    # Read uploaded image → BGR numpy array
    contents = await file.read()
    np_arr   = np.frombuffer(contents, np.uint8)
    frame    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(400, "Could not decode image — send a valid JPEG or PNG")

    # Extract face embedding
    embedding = state.face_recognizer.extract_embedding(frame)
    if embedding is None:
        raise HTTPException(400, "No face detected in the image — try a clearer photo")

    # Enroll or re-enroll
    enrolled = enroll_person(name, embedding)
    if not enrolled:
        update_embedding(name, embedding)   # name exists → refresh embedding

    # Reload the in-memory face DB so recognition picks it up immediately
    state.face_db = load_database()

    return {"status": "enrolled", "name": name, "db_size": len(state.face_db)}


@app.get("/persons")
async def persons():
    return list_persons()


@app.get("/events")
async def events(limit: int = 50):
    return get_event_log(limit)


@app.post("/reset-scores")
async def reset_scores():
    reset_all_scores()
    state.face_db = load_database()
    return {"status": "reset"}


# ── Replay & Ingest Endpoints ──────────────────────────────

@app.post("/replay/load")
async def replay_load(file: UploadFile = File(...)):
    """Accepts the cbms_results.zip from Kaggle."""
    content = await file.read()
    
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            # 1. Load frames.jsonl
            with z.open("frames.jsonl") as f:
                state.replay_frames = [json.loads(line) for line in f if line.strip()]
            
            # 2. Load alerts.json
            with z.open("alerts.json") as f:
                alerts_list = json.load(f)
                state.replay_alerts = {a["frame_index"]: a for a in alerts_list}
                
        return {
            "status": "loaded",
            "frame_count": len(state.replay_frames),
            "alert_count": len(state.replay_alerts)
        }
    except Exception as e:
        raise HTTPException(400, f"Failed to load replay ZIP: {e}")


@app.post("/replay/play")
async def replay_play(req: PlayRequest = PlayRequest()):
    # Cancel any existing task
    if state.replay_task is not None:
        state.replay_task.cancel()
    
    if not state.replay_frames:
        raise HTTPException(400, "No replay data loaded. Use /replay/load first.")
        
    state.replay_task = asyncio.create_task(_replay_loop(req.speed))
    state.mode = "replay"
    return {"status": "playing"}


@app.post("/replay/pause")
async def replay_pause():
    if state.replay_task is not None:
        state.replay_task.cancel()
        state.replay_task = None
    state.mode = "idle"
    return {"status": "paused"}


@app.post("/ingest/frame")
async def ingest_frame(data: IngestFrameRequest):
    """For live streaming from Kaggle."""
    state.mode = "live"
    await _broadcast_raw_frame(data.frame_b64)
    return {"status": "ok"}


@app.post("/ingest/alert")
async def ingest_alert(body: IngestAlertRequest):
    """For live alerts from Kaggle."""
    alert_dict = body.dict()
    # Broadcast to WS
    await _broadcast_alert(alert_dict)
    
    log_event(
        person_name=body.person_name,
        activity=body.activity,
        score_delta=body.score_delta,
        id_conf=body.id_confidence,
        evidence_path=body.evidence_grid_b64 # Use b64 as path/marker
    )
    return {"status": "ok"}


@app.get("/status")
async def get_status():
    return {
        "mode": state.mode,
        "enrolled": len(state.face_db),
        "replay_loaded": len(state.replay_frames) > 0,
        "frame_count": len(state.replay_frames),
        "alert_count": len(state.replay_alerts)
    }


# ── Internal Looping ───────────────────────────────────────

async def _replay_loop(speed: float = 1.0):
    interval = 1.0 / (VIDEO_FPS_CAP * speed)
    
    try:
        for frame_data in state.replay_frames:
            f_idx = frame_data["frame_index"]
            b64 = frame_data["annotated_frame_b64"]
            
            # Broadcast frame
            await _broadcast_raw_frame(b64)
            
            # Check for alerts
            if f_idx in state.replay_alerts:
                alert = state.replay_alerts[f_idx]
                await _broadcast_alert(alert)
                
                # Write to DB
                log_event(
                    person_name=alert.get("person_name"),
                    activity=alert.get("activity"),
                    score_delta=alert.get("score_delta"),
                    id_conf=alert.get("id_confidence"),
                    evidence_path=alert.get("evidence_grid_b64")
                )
            
            await asyncio.sleep(interval)
            
    except asyncio.CancelledError:
        pass
    finally:
        state.mode = "idle"


# ── Main pipeline loop ─────────────────────────────────────


@app.websocket("/ws/video")
async def ws_video(ws: WebSocket):
    await ws.accept()
    state.video_clients.append(ws)
    try:
        while True:
            await ws.receive_text()   # keep-alive
    except WebSocketDisconnect:
        state.video_clients.remove(ws)


@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    await ws.accept()
    state.alert_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        state.alert_clients.remove(ws)


# ── Broadcast helpers ──────────────────────────────────────

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
        state.video_clients.remove(ws)


async def _broadcast_frame(frame: np.ndarray):
    if not state.video_clients:
        return
    _, buf  = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    b64     = base64.b64encode(buf).decode()
    payload = json.dumps({"type": "frame", "data": b64})
    dead = []
    for ws in state.video_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
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
        state.alert_clients.remove(ws)


# ── Main pipeline loop ─────────────────────────────────────

async def _pipeline_loop():
    import time
    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)

    if not cap.isOpened():
        print("ERROR: Could not open camera. Check CAMERA_INDEX in config.py")
        return

    frame_interval = 1.0 / VIDEO_FPS_CAP
    last_broadcast = 0.0

    print("Pipeline running — camera open")

    while True:
        ret, frame = cap.read()
        if not ret:
            await asyncio.sleep(0.05)
            continue

        # ── Stage 1: Scene monitor gate ────────────────
        triggered, detections = state.scene_monitor.should_trigger(frame)

        if triggered:
            # ── Stage 2: Track persons ─────────────────
            tracks = state.tracker.update(frame, detections)

            for track in tracks:
                # Push frame into evidence pre-buffer for this track
                state.evidence_buffer.push(track.id, frame, track.bbox)

                # Skip if we're already mid-capture for this track
                if state.evidence_buffer.is_capturing(track.id):
                    if state.evidence_buffer.is_complete(track.id):
                        await _process_evidence(track.id,
                            state.evidence_buffer._collecting[track.id]["activity"])
                    continue

                # ── Stage 3: Detect activity ───────────
                activity, conf = state.activity_detector.detect(
                    frame, track.id, track.bbox
                )

                if activity != "normal":
                    state.evidence_buffer.start_capture(track.id, activity)

                # ── Annotate frame ─────────────────────
                x1, y1, x2, y2 = [int(v) for v in track.bbox]
                color = (0, 255, 100) if activity == "normal" else (0, 80, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"ID:{track.id}  {activity} {conf:.0%}" \
                        if activity != "normal" else f"ID:{track.id}"
                cv2.putText(frame, label, (x1, y1 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

        # ── Broadcast frame (throttled) ────────────────
        now = time.time()
        if now - last_broadcast >= frame_interval:
            await _broadcast_frame(frame)
            last_broadcast = now

        # Yield control back to the event loop
        await asyncio.sleep(0)


async def _process_evidence(track_id: int, activity: str):
    """
    Finalises evidence, runs face ID, evaluates rules, broadcasts alert.

    TODO (Day 3):
    1. crops, evidence_path = state.evidence_buffer.finalise(track_id)
    2. person_name, id_conf = state.face_recognizer.identify_from_crops(crops, state.face_db)
    3. result = state.rule_engine.evaluate(person_name, activity, id_conf, evidence_path)
    4. If result.fired: await _broadcast_alert(result.to_alert_dict())

    Prompt template:
    "Async function. Finalise evidence buffer. Run multi-frame face ID.
     Pass to rule engine. If rule fired, broadcast alert over WebSocket."
    """
    # TODO: replace this stub
    pass

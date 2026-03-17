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

from cv_pipeline.core.config  import (
    CAMERA_INDEX, CAMERA_WIDTH, CAMERA_HEIGHT, VIDEO_FPS_CAP
)
from cv_pipeline.core.database import (
    init_db, enroll_person, update_embedding,
    load_database, list_persons, get_event_log, reset_all_scores
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
    pipeline_task    : asyncio.Task     = None

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
    if state.pipeline_task:
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
    """
    Enroll a new person.
    Accepts a multipart form with `name` (str) and `file` (image).

    TODO (Day 1):
    1. Read image bytes from `file`, decode with OpenCV
    2. Call state.face_recognizer.extract_embedding(frame)
    3. If None → raise HTTPException(400, "No face detected")
    4. Call enroll_person(name, embedding) — if False, call update_embedding instead
    5. Reload state.face_db = load_database()
    6. Return {"status": "enrolled", "name": name}

    Prompt template:
    "FastAPI endpoint. Read UploadFile bytes, decode to BGR numpy array with cv2.imdecode.
     Call extract_embedding(). If None raise 400. Enroll or update. Reload face_db. Return JSON."
    """
    # TODO: replace this stub
    raise HTTPException(501, "Enroll endpoint not yet implemented — see TODO in main.py")


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


# ── WebSocket endpoints ────────────────────────────────────

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
    """
    Runs as a background asyncio task.
    Reads frames from camera, runs all CV stages, broadcasts results.

    TODO (Day 2) — Wire the pipeline:
    1. Open cv2.VideoCapture(CAMERA_INDEX)
    2. Set width/height to CAMERA_WIDTH/CAMERA_HEIGHT
    3. Loop: ret, frame = cap.read()
    4. triggered, detections = state.scene_monitor.should_trigger(frame)
    5. If triggered:
         tracks = state.tracker.update(frame, detections)
         For each track:
           a. Push frame to evidence buffer
           b. activity, conf = state.activity_detector.detect(frame, track.id, track.bbox)
           c. If activity != "normal":
                state.evidence_buffer.start_capture(track.id, activity)
           d. If evidence_buffer.is_complete(track.id):
                await _process_evidence(track.id, activity)
    6. Draw bounding boxes + track IDs on frame
    7. Every (1/VIDEO_FPS_CAP) seconds: await _broadcast_frame(frame)
    8. await asyncio.sleep(0) to yield to event loop

    Prompt template:
    "Async function with OpenCV camera loop. Uses state.scene_monitor,
     state.tracker, state.activity_detector, state.evidence_buffer.
     Annotates frame with cv2.rectangle + cv2.putText per track.
     Throttles broadcast to VIDEO_FPS_CAP using time.time()."
    """
    # TODO: replace this stub
    while True:
        await asyncio.sleep(1)


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

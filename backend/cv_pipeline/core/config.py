# cv_pipeline/core/config.py
# ─────────────────────────────────────────────────────────────
# Single source of truth for every tunable constant.
# Change values here — nothing else needs to be touched.
# ─────────────────────────────────────────────────────────────

from pathlib import Path

# ── Paths ──────────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent.parent          # cv_pipeline/
DATA_DIR        = BASE_DIR / "data"
FACES_DIR       = DATA_DIR / "faces"                    # reference face images
LOGS_DIR        = DATA_DIR / "logs"                     # evidence frame grids
DB_PATH         = DATA_DIR / "cbms_logs.db"

# ── Stream directories (shared with stream_manager) ─────────
STREAM_DIR           = BASE_DIR.parent.parent / "Stream"   # project root / Stream
UNPROCESSED_DIR      = STREAM_DIR / "unprocessed_clips"    # raw camera chunks
PROCESSED_DIR        = STREAM_DIR / "processed_clips"      # annotated clips from Kaggle
KEEP_UNPROCESSED     = False     # delete raw chunks after successful upload
KEEP_PROCESSED       = True      # keep annotated clips for evidence review
PROCESSED_MAX_FILES  = 200       # rotate oldest processed clips beyond this count

# Create dirs on import
for _d in [FACES_DIR, LOGS_DIR, UNPROCESSED_DIR, PROCESSED_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

# ── Camera ─────────────────────────────────────────────────
CAMERA_INDEX    = 0                 # 0 = default webcam
CAMERA_WIDTH    = 1280
CAMERA_HEIGHT   = 720
VIDEO_FPS_CAP   = 15                # max FPS sent over /ws/video
                                    # drop to 10 on weak hardware

# ── Scene monitor ──────────────────────────────────────────
SCENE_MOG_HISTORY       = 200       # MoG2 background history frames
SCENE_MOG_THRESHOLD     = 50        # MoG2 pixel variance threshold
SCENE_MOTION_MIN_AREA   = 1500      # ignore tiny motion blobs (px²)
YOLO_MODEL_PATH         = "yolov8n.pt"   # auto-downloaded on first run
YOLO_CONF_THRESHOLD     = 0.45
YOLO_PERSON_CLASS_ID    = 0         # COCO class 0 = person
DET_SIZE                = (640, 640) # reduce to (320,320) on weak CPU

# ── Tracker ────────────────────────────────────────────────
TRACKER_CONF_THRESHOLD  = 0.45
TRACKER_IOU_THRESHOLD   = 0.45
TRACKER_MAX_AGE         = 30        # frames before a lost track is dropped

# ── Activity detector (MediaPipe heuristics) ───────────────
# These values were tuned for "spitting" detection.
# Adjust thresholds after testing with your own gestures.
ACTIVITY_MOUTH_OPEN_RATIO       = 0.08   # lip distance / face height
ACTIVITY_HEAD_FORWARD_FRAMES    = 3      # consecutive frames of forward lean
ACTIVITY_CONFIDENCE_THRESHOLD   = 0.60  # min score to fire an event

# ── Evidence buffer ────────────────────────────────────────
EVIDENCE_PRE_FRAMES     = 3         # frames captured BEFORE detection fires
EVIDENCE_POST_FRAMES    = 7         # frames captured AFTER
EVIDENCE_TOTAL          = EVIDENCE_PRE_FRAMES + EVIDENCE_POST_FRAMES  # = 10

# ── Face recognition ───────────────────────────────────────
INSIGHTFACE_MODEL_PACK  = "buffalo_s"    # smaller/faster than buffalo_l
FACE_MATCH_THRESHOLD    = 0.40           # cosine similarity — raise for stricter
FACE_MIN_DETECTION_CONF = 0.50           # ignore low-quality face crops
FACE_ID_MIN_CONFIDENCE  = 0.45           # minimum aggregated confidence to act

# ── Rule engine ────────────────────────────────────────────
# { activity_label: (score_delta, min_identity_confidence, log_evidence) }
ACTIVITY_RULES: dict[str, tuple[int, float, bool]] = {
    "spitting":     (-10,  0.75,  True),
    "littering":    (-15,  0.80,  True),
    "fighting":     (-25,  0.80,  True),
    "helping":      (+10,  0.70,  True),
    "normal":       (  0,  0.00,  False),
}

SCORE_FLOOR = 0      # score cannot go below this
SCORE_CEIL  = 200    # score cannot go above this

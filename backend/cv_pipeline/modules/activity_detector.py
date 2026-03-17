# cv_pipeline/modules/activity_detector.py
# ─────────────────────────────────────────────────────────────
# Stage 3: Detects activities using MediaPipe Face Mesh +
# Pose landmarks. No GPU needed — runs well on CPU.
#
# Current activities:
#   "spitting"  — mouth-open ratio + forward head lean sustained
#                 across ACTIVITY_HEAD_FORWARD_FRAMES consecutive frames
#   "normal"    — default
#
# This is the placeholder that will be replaced by a fine-tuned
# X3D/SlowFast model after the hackathon demo.
#
# TODO (Day 2): Fill in the MediaPipe landmark extraction block.
# ─────────────────────────────────────────────────────────────

import cv2
import numpy as np
from collections import defaultdict, deque
from ..core.config import (
    ACTIVITY_MOUTH_OPEN_RATIO,
    ACTIVITY_HEAD_FORWARD_FRAMES,
    ACTIVITY_CONFIDENCE_THRESHOLD,
)


class ActivityDetector:
    def __init__(self):
        self._face_mesh   = None   # lazy-loaded
        self._pose        = None   # lazy-loaded
        # Per-track rolling window of (mouth_open, head_forward) booleans
        self._history: dict[int, deque] = defaultdict(
            lambda: deque(maxlen=ACTIVITY_HEAD_FORWARD_FRAMES + 2)
        )

    # ── Public API ─────────────────────────────────────────

    def detect(self, frame: np.ndarray, track_id: int,
               bbox: list[float]) -> tuple[str, float]:
        """
        Analyse the crop of a single tracked person.

        Args:
            frame:    full BGR frame
            track_id: stable track id from Tracker
            bbox:     [x1, y1, x2, y2] bounding box of the person

        Returns:
            (activity_label: str, confidence: float)
            e.g. ("spitting", 0.82) or ("normal", 0.0)
        """
        crop = self._crop(frame, bbox)
        if crop is None:
            return "normal", 0.0

        features = self._extract_features(crop)
        return self._classify(track_id, features)

    # ── Feature extraction ─────────────────────────────────

    def _load_mediapipe(self):
        # TODO (Day 2):
        # Import mediapipe and create:
        #   self._face_mesh = mp.solutions.face_mesh.FaceMesh(
        #       static_image_mode=False, max_num_faces=1,
        #       refine_landmarks=True, min_detection_confidence=0.5)
        #   self._pose = mp.solutions.pose.Pose(
        #       static_image_mode=False, min_detection_confidence=0.5)
        #
        # Prompt template:
        # "Initialise MediaPipe FaceMesh and Pose in Python.
        #  FaceMesh: static_image_mode=False, max_num_faces=1,
        #  refine_landmarks=True, min_detection_confidence=0.5.
        #  Pose: static_image_mode=False, min_detection_confidence=0.5."
        raise NotImplementedError("Fill in _load_mediapipe — see TODO above")

    def _extract_features(self, crop: np.ndarray) -> dict:
        """
        Returns {"mouth_open": bool, "head_forward": bool}

        TODO (Day 2):
        Use self._face_mesh to get face landmarks on `crop` (RGB).
        Compute mouth_open_ratio = vertical lip distance / face height.
        Use self._pose to get nose Z vs shoulder Z for head_forward.

        Prompt template:
        "Given a BGR crop, run MediaPipe FaceMesh to get landmarks.
         Compute mouth open ratio = distance(upper_lip, lower_lip) / face_height.
         Return {'mouth_open': ratio > ACTIVITY_MOUTH_OPEN_RATIO,
                 'head_forward': bool_from_nose_z_vs_shoulder_z}."
        """
        if self._face_mesh is None:
            self._load_mediapipe()

        # TODO: replace this stub with real MediaPipe extraction
        return {"mouth_open": False, "head_forward": False}

    # ── Classification ─────────────────────────────────────

    def _classify(self, track_id: int,
                  features: dict) -> tuple[str, float]:
        """
        Spitting heuristic:
          mouth_open AND head_forward sustained for N consecutive frames
        """
        self._history[track_id].append(
            features.get("mouth_open") and features.get("head_forward")
        )
        window = list(self._history[track_id])

        if len(window) >= ACTIVITY_HEAD_FORWARD_FRAMES:
            consecutive = sum(
                1 for v in window[-ACTIVITY_HEAD_FORWARD_FRAMES:] if v
            )
            if consecutive >= ACTIVITY_HEAD_FORWARD_FRAMES:
                conf = consecutive / ACTIVITY_HEAD_FORWARD_FRAMES
                if conf >= ACTIVITY_CONFIDENCE_THRESHOLD:
                    # Clear history to avoid repeated firing on same gesture
                    self._history[track_id].clear()
                    return "spitting", round(conf, 2)

        return "normal", 0.0

    # ── Utilities ──────────────────────────────────────────

    def _crop(self, frame: np.ndarray,
              bbox: list[float]) -> np.ndarray | None:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            return None
        return frame[y1:y2, x1:x2].copy()

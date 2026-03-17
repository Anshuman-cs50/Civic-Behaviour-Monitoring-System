# cv_pipeline/modules/scene_monitor.py
# ─────────────────────────────────────────────────────────────
# Stage 1: Low-cost gate that decides whether to wake the
# heavier pipeline stages. Runs on EVERY frame.
#
# Logic:
#   1. MoG2 background subtraction detects any pixel motion
#   2. Only if motion area > threshold: run YOLOv8-nano
#   3. Return True (trigger pipeline) if ≥1 person is detected
#
# TODO (Day 2): Fill in the YOLOv8 inference block below.
# ─────────────────────────────────────────────────────────────

import cv2
import numpy as np
from ..core.config import (
    SCENE_MOG_HISTORY, SCENE_MOG_THRESHOLD, SCENE_MOTION_MIN_AREA,
    YOLO_MODEL_PATH, YOLO_CONF_THRESHOLD, YOLO_PERSON_CLASS_ID, DET_SIZE
)


class SceneMonitor:
    def __init__(self):
        # MoG2 background subtractor — no GPU needed
        self.mog = cv2.createBackgroundSubtractorMOG2(
            history=SCENE_MOG_HISTORY,
            varThreshold=SCENE_MOG_THRESHOLD,
            detectShadows=False
        )
        self.model = None   # lazy-loaded on first person-check
        self._motion_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (5, 5)
        )

    # ── Public API ─────────────────────────────────────────

    def should_trigger(self, frame: np.ndarray) -> tuple[bool, list]:
        """
        Args:
            frame: BGR frame from OpenCV

        Returns:
            (trigger: bool, detections: list[dict])
            detections = [{"bbox": [x1,y1,x2,y2], "conf": float}, ...]
        """
        if not self._has_motion(frame):
            return False, []

        detections = self._detect_persons(frame)
        return len(detections) > 0, detections

    # ── Motion check (MoG2) ────────────────────────────────

    def _has_motion(self, frame: np.ndarray) -> bool:
        mask = self.mog.apply(frame)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self._motion_kernel)
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        return any(cv2.contourArea(c) > SCENE_MOTION_MIN_AREA
                   for c in contours)

    # ── Person detection (YOLOv8-nano) ────────────────────

    def _load_model(self):
        # TODO (Day 2):
        # Import and load YOLOv8-nano from ultralytics.
        # Store in self.model. This runs once (lazy load).
        #
        # Prompt template:
        # "Load a YOLOv8 model from ultralytics using the path
        #  YOLO_MODEL_PATH and set self.model to it."
        #
        # Expected: from ultralytics import YOLO
        #           self.model = YOLO(YOLO_MODEL_PATH)
        raise NotImplementedError("Fill in _load_model — see TODO above")

    def _detect_persons(self, frame: np.ndarray) -> list[dict]:
        if self.model is None:
            self._load_model()

        # TODO (Day 2):
        # Run self.model on the frame. Filter results to only
        # class YOLO_PERSON_CLASS_ID with confidence > YOLO_CONF_THRESHOLD.
        # Return a list of dicts: [{"bbox": [x1,y1,x2,y2], "conf": float}]
        #
        # Prompt template:
        # "Run YOLOv8 inference on `frame` (BGR numpy array).
        #  Filter to class id YOLO_PERSON_CLASS_ID, conf > YOLO_CONF_THRESHOLD.
        #  Return [{'bbox': [x1,y1,x2,y2], 'conf': float}]."
        raise NotImplementedError("Fill in _detect_persons — see TODO above")

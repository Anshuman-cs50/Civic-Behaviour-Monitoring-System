# cv_pipeline/modules/activity_detector.py
# ─────────────────────────────────────────────────────────────
# Stage 3: Detects activities using MediaPipe Face Mesh +
# Pose landmarks. No GPU needed — runs well on CPU.
#
# Current activities:
# Current activities:
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
            e.g. ("normal", 0.0)
        """
        crop = self._crop(frame, bbox)
        if crop is None:
            return "normal", 0.0

        features = self._extract_features(crop)
        return self._classify(track_id, features)

    # ── Feature extraction ─────────────────────────────────

    def _load_mediapipe(self):
        import mediapipe as mp
        self._face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        

    def _extract_features(self, crop: np.ndarray) -> dict:
        if self._face_mesh is None:
            self._load_mediapipe()

        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        h, w = crop.shape[:2]

        mouth_open   = False
        head_forward = False

        # ── Mouth open ratio via FaceMesh ──────────────────
        face_result = self._face_mesh.process(rgb)
        if face_result.multi_face_landmarks:
            lm = face_result.multi_face_landmarks[0].landmark

            # Upper lip: landmark 13, Lower lip: landmark 14
            # Nose tip: 1, Chin: 152  (for face height normalisation)
            upper_lip = lm[13].y * h
            lower_lip = lm[14].y * h
            nose_tip  = lm[1].y  * h
            chin      = lm[152].y * h

            face_height      = abs(chin - nose_tip) + 1e-6
            mouth_open_ratio = abs(lower_lip - upper_lip) / face_height
            mouth_open       = mouth_open_ratio > ACTIVITY_MOUTH_OPEN_RATIO

        # ── Head forward lean via Pose ──────────────────────
        pose_result = self._pose.process(rgb)
        if pose_result.pose_landmarks:
            lm = pose_result.pose_landmarks.landmark
            import mediapipe as mp
            PL = mp.solutions.pose.PoseLandmark

            nose      = lm[PL.NOSE]
            l_shoulder = lm[PL.LEFT_SHOULDER]
            r_shoulder = lm[PL.RIGHT_SHOULDER]

            # If nose Z is significantly less than shoulder Z
            # the person is leaning their head forward
            shoulder_z   = (l_shoulder.z + r_shoulder.z) / 2
            head_forward = (nose.z - shoulder_z) < -0.15

        return {"mouth_open": mouth_open, "head_forward": head_forward}

    # ── Classification ─────────────────────────────────────

    def _classify(self, track_id: int,
                  features: dict) -> tuple[str, float]:
        """
        Activity heuristic (no spitting):
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
                    # Default removed spitting

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

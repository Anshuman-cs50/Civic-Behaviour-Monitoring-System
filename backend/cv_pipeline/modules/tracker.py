# cv_pipeline/modules/tracker.py
# ─────────────────────────────────────────────────────────────
# Stage 2: Assigns persistent track IDs to each detected person
# across frames using ByteTrack (via ultralytics).
#
# Each track has a stable integer ID so downstream stages can
# accumulate evidence per person across frames.
#
# TODO (Day 2): Fill in the ByteTrack update call.
# ─────────────────────────────────────────────────────────────

import numpy as np
from ..core.config import (
    TRACKER_CONF_THRESHOLD, TRACKER_IOU_THRESHOLD, TRACKER_MAX_AGE
)


class Track:
    """Lightweight container for a single active track."""
    __slots__ = ("id", "bbox", "conf")

    def __init__(self, track_id: int, bbox: list[float], conf: float):
        self.id   = track_id
        self.bbox = bbox    # [x1, y1, x2, y2]
        self.conf = conf


class Tracker:
    def __init__(self):
        self._tracker = None  # lazy-loaded

    # ── Public API ─────────────────────────────────────────

    def update(self, frame: np.ndarray, detections: list[dict]) -> list[Track]:
        """
        Args:
            frame:      BGR frame (needed by ByteTrack internally)
            detections: output of SceneMonitor — list of {"bbox", "conf"}

        Returns:
            list of Track objects with stable .id values
        """
        if not detections:
            return []

        if self._tracker is None:
            self._load_tracker()

        # TODO (Day 2):
        # Convert `detections` list into the format ByteTrack expects,
        # call self._tracker.update(), and return a list of Track objects.
        #
        # Prompt template:
        # "I'm using ultralytics ByteTrack. My detections are a list of
        #  {'bbox': [x1,y1,x2,y2], 'conf': float}. Convert them to the
        #  format ByteTrack.update() expects, call update, then convert
        #  results back to a list of Track(id, bbox, conf) objects."
        raise NotImplementedError("Fill in update() — see TODO above")

    # ── Helpers ────────────────────────────────────────────

    def _load_tracker(self):
        # TODO (Day 2):
        # Import and instantiate ByteTrack from ultralytics.
        # Store in self._tracker.
        #
        # Prompt template:
        # "Instantiate a ByteTrack tracker from ultralytics with
        #  track_high_thresh=TRACKER_CONF_THRESHOLD,
        #  track_buffer=TRACKER_MAX_AGE."
        raise NotImplementedError("Fill in _load_tracker — see TODO above")

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

    def _load_tracker(self):
        """
        Import and instantiate ByteTrack from ultralytics.
        Store in self._tracker.
        """
        from ultralytics.trackers.byte_tracker import BYTETracker
        from types import SimpleNamespace
        
        # ByteTrack expects an args object
        args = SimpleNamespace(
            track_high_thresh=TRACKER_CONF_THRESHOLD,
            track_low_thresh=0.1,
            new_track_thresh=TRACKER_CONF_THRESHOLD,
            track_buffer=TRACKER_MAX_AGE,
            match_thresh=TRACKER_IOU_THRESHOLD,
            mot20=False,
        )
        self._tracker = BYTETracker(args, frame_rate=15)

    def update(self, frame: np.ndarray, detections: list[dict]) -> list[Track]:
        import numpy as np

        if not detections:
            return []

        if self._tracker is None:
            self._load_tracker()

        h, w = frame.shape[:2]

        # BYTETracker expects [x1, y1, x2, y2, conf] as float32 numpy array
        det_array = np.array(
            [[*d["bbox"], d["conf"]] for d in detections],
            dtype=np.float32,
        )

        tracks = self._tracker.update(det_array, (h, w), (h, w))

        results = []
        for t in tracks:
            x1, y1, x2, y2 = t.tlbr  # top-left bottom-right
            results.append(Track(
                track_id=int(t.track_id),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
                conf=float(t.score),
            ))
        return results

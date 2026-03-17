# cv_pipeline/modules/evidence_buffer.py
# ─────────────────────────────────────────────────────────────
# Maintains a rolling pre-event frame buffer per track.
# When an activity fires, captures PRE + POST frames,
# saves a grid image as visual evidence, returns the crops.
#
# Fully implemented — no TODOs needed.
# ─────────────────────────────────────────────────────────────

import cv2
import numpy as np
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from ..core.config import (
    EVIDENCE_PRE_FRAMES, EVIDENCE_POST_FRAMES,
    EVIDENCE_TOTAL, LOGS_DIR
)


class EvidenceBuffer:
    def __init__(self):
        # { track_id: deque of (frame_bgr, bbox) }
        self._pre_buffer: dict[int, deque] = defaultdict(
            lambda: deque(maxlen=EVIDENCE_PRE_FRAMES)
        )
        # Tracks actively collecting post-event frames
        # { track_id: {"frames": [], "bbox_list": [], "activity": str} }
        self._collecting: dict[int, dict] = {}

    # ── Per-frame update ───────────────────────────────────

    def push(self, track_id: int, frame: np.ndarray,
             bbox: list[float]) -> None:
        """Call every frame for every active track."""
        # Feed the pre-buffer
        self._pre_buffer[track_id].append((frame.copy(), bbox))

        # If this track is mid-collection, add to post frames
        if track_id in self._collecting:
            col = self._collecting[track_id]
            col["frames"].append(frame.copy())
            col["bbox_list"].append(bbox)

    def start_capture(self, track_id: int, activity: str) -> None:
        """
        Call when an activity fires for a track.
        Seeds post-frame collection with existing pre-frames.
        """
        if track_id in self._collecting:
            return  # already capturing, ignore duplicate trigger

        pre_frames  = [f for f, _ in self._pre_buffer[track_id]]
        pre_bboxes  = [b for _, b in self._pre_buffer[track_id]]

        self._collecting[track_id] = {
            "activity":   activity,
            "frames":     pre_frames,
            "bbox_list":  pre_bboxes,
        }

    def is_capturing(self, track_id: int) -> bool:
        return track_id in self._collecting

    def is_complete(self, track_id: int) -> bool:
        if track_id not in self._collecting:
            return False
        return len(self._collecting[track_id]["frames"]) >= EVIDENCE_TOTAL

    def finalise(self, track_id: int) -> tuple[list[np.ndarray], str]:
        """
        Finalises an evidence bundle once EVIDENCE_TOTAL frames collected.

        Returns:
            (crops, evidence_path)
            crops = list of face-region crops, one per frame
            evidence_path = path to saved grid image
        """
        col      = self._collecting.pop(track_id)
        frames   = col["frames"][:EVIDENCE_TOTAL]
        bboxes   = col["bbox_list"][:EVIDENCE_TOTAL]
        activity = col["activity"]

        crops = [self._crop(f, b) for f, b in zip(frames, bboxes)]
        crops = [c for c in crops if c is not None]

        path = self._save_grid(crops, track_id, activity)
        return crops, path

    # ── Utilities ──────────────────────────────────────────

    def _crop(self, frame: np.ndarray,
              bbox: list[float]) -> np.ndarray | None:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        # Add 20% padding around the bbox for better face visibility
        pw = int((x2 - x1) * 0.20)
        ph = int((y2 - y1) * 0.20)
        x1, y1 = max(0, x1 - pw), max(0, y1 - ph)
        x2, y2 = min(w, x2 + pw), min(h, y2 + ph)
        if x2 <= x1 or y2 <= y1:
            return None
        crop = frame[y1:y2, x1:x2]
        return cv2.resize(crop, (128, 128))

    def _save_grid(self, crops: list[np.ndarray],
                   track_id: int, activity: str) -> str:
        """Save a 2×5 grid of evidence crops as a JPEG."""
        if not crops:
            return ""

        # Pad to exactly EVIDENCE_TOTAL frames with black
        blank = np.zeros((128, 128, 3), dtype=np.uint8)
        while len(crops) < EVIDENCE_TOTAL:
            crops.append(blank)

        row1 = np.hstack(crops[:5])
        row2 = np.hstack(crops[5:10])
        grid = np.vstack([row1, row2])

        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        fname = f"{ts}_track{track_id}_{activity}.jpg"
        path  = str(LOGS_DIR / fname)
        cv2.imwrite(path, grid)
        return path

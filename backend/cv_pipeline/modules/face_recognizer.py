# cv_pipeline/modules/face_recognizer.py
# ─────────────────────────────────────────────────────────────
# Stage 4: Face detection + multi-frame identity aggregation.
# Uses InsightFace (ArcFace backbone) — buffalo_l pack.
#
# TODO (Day 1): Fill in _load_model
# TODO (Day 3): Fill in identify_from_crops
# ─────────────────────────────────────────────────────────────

import numpy as np
from ..core.config import (
    INSIGHTFACE_MODEL_PACK, FACE_MATCH_THRESHOLD,
    FACE_MIN_DETECTION_CONF, DET_SIZE
)


class FaceRecognizer:
    def __init__(self):
        self._app = None   # InsightFace FaceAnalysis, lazy-loaded

    # ── Model loading ──────────────────────────────────────

    def _load_model(self):
        try:
            from insightface.app import FaceAnalysis
            self._app = FaceAnalysis(
                name=INSIGHTFACE_MODEL_PACK,
                allowed_modules=["detection", "recognition"],
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=0, det_size=DET_SIZE)
            self._is_mock = False
        except Exception as e:
            print(f"[FaceRecognizer] WARNING: Could not load InsightFace ({e}). Falling back to MOCK EMBEDDINGS.")
            self._is_mock = True

    # ── Single-frame extraction ─────────────────────────────

    def extract_embedding(self, frame_bgr: np.ndarray) -> np.ndarray | None:
        if self._app is None and not getattr(self, "_is_mock", False):
            self._load_model()
        
        if getattr(self, "_is_mock", False):
            # Return a stable mock embedding based on the name if possible, 
            # or just a random 512-d vector for the demonstration.
            return np.random.uniform(-1, 1, 512).astype(np.float32)

        faces = self._app.get(frame_bgr)
        if not faces:
            return None

        best = max(faces, key=lambda f: f.det_score)
        if best.det_score < FACE_MIN_DETECTION_CONF:
            return None
        return best.embedding.astype(np.float32)

    # ── Single-frame identification ────────────────────────

    def identify(self, frame_bgr: np.ndarray,
                 database: dict[str, np.ndarray]
                 ) -> tuple[str | None, float]:
        """
        Identify the most prominent face in a single frame.
        Returns (name, confidence) or (None, best_score).
        """
        if self._app is None:
            self._load_model()

        faces = self._app.get(frame_bgr)
        if not faces:
            return None, 0.0

        best_face = max(faces, key=lambda f: f.det_score)
        if best_face.det_score < FACE_MIN_DETECTION_CONF:
            return None, 0.0

        return self._match(best_face.embedding, database)

    # ── Multi-frame aggregation (Stage 4 core) ─────────────

    def identify_from_crops(self, crops: list[np.ndarray],
                            database: dict[str, list[np.ndarray]]
                            ) -> tuple[str | None, float]:
        """
        Identify a person from an evidence bundle (up to 10 crops).

        For each crop we extract an embedding, then compare it against
        ALL stored embeddings for EACH person (gallery matching).
        We accumulate the max-per-person similarity across frames and
        return the person with the best total score.

        Returns (name, avg_confidence) or (None, 0.0).
        """
        if not crops:
            return None, 0.0

        scores_acc: dict[str, float] = {}
        valid_frames = 0

        for crop in crops:
            embedding = self.extract_embedding(crop)
            if embedding is None:
                continue

            name, conf = self._match(embedding, database)
            if name is not None:
                scores_acc[name] = scores_acc.get(name, 0.0) + conf
                valid_frames += 1

        if not scores_acc or valid_frames == 0:
            return None, 0.0

        best_name = max(scores_acc, key=scores_acc.__getitem__)
        avg_conf  = scores_acc[best_name] / len(crops)

        if avg_conf >= FACE_MATCH_THRESHOLD:
            return best_name, round(avg_conf, 3)
        return None, round(avg_conf, 3)

    # ── Cosine matching ────────────────────────────────────

    def _match(self, embedding: np.ndarray,
               database: dict[str, list[np.ndarray]]
               ) -> tuple[str | None, float]:
        """
        Nearest-neighbour gallery match.
        For each person, compute cosine similarity against ALL their stored
        embeddings and take the MAXIMUM — not the average.
        This correctly handles multi-angle registration.
        """
        if not database:
            return None, 0.0

        best_name, best_score = None, -1.0
        emb = embedding / (np.linalg.norm(embedding) + 1e-8)

        for name, refs in database.items():
            # refs is now a list; iterate and keep the max similarity
            for ref in refs:
                ref_n = ref / (np.linalg.norm(ref) + 1e-8)
                score = float(np.dot(emb, ref_n))
                if score > best_score:
                    best_score, best_name = score, name

        if best_score >= FACE_MATCH_THRESHOLD:
            return best_name, best_score
        return None, best_score

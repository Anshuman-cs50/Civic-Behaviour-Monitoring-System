# cv_pipeline/modules/rule_engine.py
# ─────────────────────────────────────────────────────────────
# Stage 5: Maps (activity, identity_confidence) → score delta.
# Applies the confidence gate — events below the minimum
# identity confidence are silently dropped.
#
# Fully implemented — no TODOs needed.
# ─────────────────────────────────────────────────────────────

from ..core.config import ACTIVITY_RULES, FACE_ID_MIN_CONFIDENCE
from ..core.database import update_score, log_event


class RuleEngineResult:
    __slots__ = ("fired", "person_name", "activity",
                 "score_delta", "new_score", "id_confidence")

    def __init__(self, fired=False, person_name="", activity="",
                 score_delta=0, new_score=0, id_confidence=0.0):
        self.fired          = fired
        self.person_name    = person_name
        self.activity       = activity
        self.score_delta    = score_delta
        self.new_score      = new_score
        self.id_confidence  = id_confidence

    def to_alert_dict(self) -> dict:
        """Shape matches the /ws/alerts WebSocket payload."""
        return {
            "person_name":   self.person_name,
            "activity":      self.activity,
            "score_delta":   self.score_delta,
            "new_score":     self.new_score,
            "id_confidence": round(self.id_confidence, 3),
        }


class RuleEngine:
    def evaluate(self, person_name: str | None, activity: str,
                 id_confidence: float,
                 evidence_path: str | None = None) -> RuleEngineResult:
        """
        Evaluate an activity event.

        Args:
            person_name:    Identified name (None = unknown)
            activity:       Activity label from ActivityDetector
            id_confidence:  Aggregated identity confidence (0–1)
            evidence_path:  Path to saved evidence grid image

        Returns:
            RuleEngineResult — check .fired to see if the rule applied.
        """
        result = RuleEngineResult()

        # Drop "normal" immediately — no rule to apply
        if activity == "normal" or activity not in ACTIVITY_RULES:
            return result

        # Drop events without a confirmed identity
        if not person_name:
            return result

        score_delta, min_conf, should_log = ACTIVITY_RULES[activity]

        # Confidence gate — don't penalise uncertain identifications
        if id_confidence < min_conf:
            return result

        # Apply score change
        new_score = update_score(person_name, score_delta)

        # Log to DB
        if should_log:
            log_event(person_name, activity, score_delta,
                      id_confidence, evidence_path)

        result.fired          = True
        result.person_name    = person_name
        result.activity       = activity
        result.score_delta    = score_delta
        result.new_score      = new_score
        result.id_confidence  = id_confidence
        return result

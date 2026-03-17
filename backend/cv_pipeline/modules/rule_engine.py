"""
Stage 5: Rule Engine
Maps activities to score deltas and logs results.
"""
from core.database import log_activity

class RuleEngine:
    def __init__(self):
        print("[RuleEngine] Loaded scoring rules...")
        self.rules = {
            "littering": -10,
            "spitting": -15,
            "loitering": -5,
            "helping": +20
        }
        
    def process_event(self, citizen_id, activity, evidence_path):
        delta = self.rules.get(activity, 0)
        log_activity(citizen_id, activity, delta, evidence_path)
        return delta

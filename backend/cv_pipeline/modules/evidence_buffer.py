"""
Stage 3: Evidence Capture
Buffers 10 frames around an event and crops the subject.
"""
from collections import deque
import cv2
import os
from core.config import EVIDENCE_BUFFER_SIZE, LOGS_DIR

class EvidenceBuffer:
    def __init__(self):
        print(f"[EvidenceBuffer] Initialized buffer of size {EVIDENCE_BUFFER_SIZE}...")
        self.buffer = deque(maxlen=EVIDENCE_BUFFER_SIZE)
        os.makedirs(LOGS_DIR, exist_ok=True)
        
    def add_frame(self, frame, tracked_objects):
        # Store frame and current tracked subjects
        self.buffer.append({"frame": frame.copy(), "objects": tracked_objects})
        
    def capture_evidence(self, event):
        """
        Triggers when an event is detected.
        Saves cropped frames of the subject from the buffer.
        """
        person_track_id = event['id']
        activity = event['activity']
        
        # Mock crop and save logic
        evidence_path = os.path.join(LOGS_DIR, f"evidence_{person_track_id}_{activity}.jpg")
        # In reality, iterate over self.buffer, find the person's bbox, crop and save as gif/video
        print(f"[EvidenceBuffer] Secured evidence for track {person_track_id} at {evidence_path}")
        return evidence_path

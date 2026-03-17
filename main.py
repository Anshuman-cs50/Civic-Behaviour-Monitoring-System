"""
Civic Behaviour Monitoring System
Central Orchestrator
"""
import cv2
import time
from core.database import init_db
from modules.scene_monitor import SceneMonitor
from modules.tracker import Tracker
from modules.activity_detector import ActivityDetector
from modules.evidence_buffer import EvidenceBuffer
from modules.face_recognizer import FaceRecognizer
from modules.rule_engine import RuleEngine

def main():
    print("Initializing CBMS Pipeline...")
    init_db()
    
    # Initialize all loosely decoupled stages
    scene_monitor = SceneMonitor()
    tracker = Tracker()
    activity_detector = ActivityDetector()
    evidence_buffer = EvidenceBuffer()
    face_recognizer = FaceRecognizer()
    rule_engine = RuleEngine()
    
    # For standalone test, we can capture from webcam
    # stream = cv2.VideoCapture(0)
    
    print("Pipeline ready. (Mock run)")
    
    # --- MOCK PIPELINE EXECUTION ---
    # To run with a real webcam, use a standard cv2 while loop:
    # while True:
    #     ret, frame = stream.read()
    #     if not ret: break
    
    for i in range(5): # run 5 iterations for test
        # mock black frame
        import numpy as np
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # Stage 1
        processed_frame, bboxes = scene_monitor.process_frame(frame)
        
        # Stage 2a
        tracked_objects = tracker.update(bboxes, processed_frame)
        
        # Stage 3 - Buffer current frame and context
        evidence_buffer.add_frame(processed_frame, tracked_objects)
        
        # Stage 2b
        events = activity_detector.detect_activity(processed_frame, tracked_objects)
        
        # Mocking an event detection for testing Stage 3-5
        if i == 2:
            events.append({"id": "track_1", "activity": "littering"})
            
        for event in events:
            # Stage 3 capture
            evidence_path = evidence_buffer.capture_evidence(event)
            
            # Stage 4
            citizen_id = face_recognizer.identify_person(evidence_path)
            
            # Stage 5
            rule_engine.process_event(citizen_id, event['activity'], evidence_path)
            
        time.sleep(0.1)
        
    print("Mock run complete.")

if __name__ == "__main__":
    main()

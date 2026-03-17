"""
Stage 1: Scene Monitor
OpenCV background subtraction (MoG2) + YOLOv8-nano
"""
import cv2

class SceneMonitor:
    def __init__(self):
        # Initialize YOLOv8 and MoG2 here
        print("[SceneMonitor] Initializing YOLOv8-nano and MoG2...")
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2()
        # Mock load of YOLOv8
        # from ultralytics import YOLO
        # self.model = YOLO('yolov8n.pt')
    
    def process_frame(self, frame):
        """
        Takes raw frame, returns frame and list of person bounding boxes
        """
        # Apply background subtraction (optional step for motion masking)
        fg_mask = self.bg_subtractor.apply(frame)
        
        # In a real scenario, use YOLO to detect persons
        # results = self.model(frame)
        # boxes = results[0].boxes.xyxy.cpu().numpy()
        
        # Mock output: no persons detected
        bboxes = [] 
        return frame, bboxes

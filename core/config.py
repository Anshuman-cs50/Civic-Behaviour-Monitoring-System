"""
Global Configuration for Civic Behaviour Monitoring System
"""

import os

# Base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
FACES_DIR = os.path.join(DATA_DIR, "faces")
LOGS_DIR = os.path.join(DATA_DIR, "logs")
DB_PATH = os.path.join(DATA_DIR, "cbms_logs.db")

# Model Thresholds
MIN_FACE_CONFIDENCE = 0.6
YOLO_CONFIDENCE = 0.5
TRACKER_MAX_AGE = 30

# Buffer settings
EVIDENCE_BUFFER_SIZE = 10

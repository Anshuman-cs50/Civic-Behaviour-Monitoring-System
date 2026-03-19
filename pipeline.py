# %% [markdown]
# # Civic Behaviour Monitoring System (CBMS) - Kaggle Pipeline
# This notebook runs the full CV pipeline on videos, detects activities, performs face recognition, and calculates credit scores.

# %% [markdown]
# ## CELL 1 — Install dependencies
# !pip install --upgrade mediapipe insightface onnxruntime-gpu ultralytics opencv-python-headless httpx
# import mediapipe as mp; print(f"MediaPipe version: {mp.__version__}"); print(f"MediaPipe path: {mp.__file__}")

# %% [code]
import os
import cv2
import json
import time
import base64
import zipfile
import numpy as np
import httpx
from pathlib import Path
from collections import defaultdict, deque
from types import SimpleNamespace
from datetime import datetime

# %% [markdown]
# ## CELL 2 — Configuration block
# %% [code]
MODE = "replay"   # "replay" saves a results zip | "live" streams to ngrok URL
NGROK_URL = ""    # paste ngrok URL here when switching to live mode
VIDEO_PATH = "/kaggle/input/cbms-videos/demo.mp4"
FACES_DIR  = "/kaggle/input/cbms-faces/"  # folder of enrolled face photos
                                           # filename = person name, e.g. anshuman.jpg
OUTPUT_ZIP = "/kaggle/working/cbms_results.zip"
VIDEO_FPS_OUTPUT = 15   # FPS for output annotated video

# Pipeline thresholds (same as local config.py)
YOLO_CONF = 0.45
FACE_MATCH_THRESHOLD = 0.40
FACE_ID_MIN_CONFIDENCE = 0.45
ACTIVITY_MOUTH_OPEN_RATIO = 0.08
ACTIVITY_HEAD_FORWARD_FRAMES = 3
ACTIVITY_RULES = {
    "spitting":  {"score_delta": -10, "min_conf": 0.75},
    "littering": {"score_delta": -15, "min_conf": 0.80},
    "helping":   {"score_delta": +10, "min_conf": 0.70},
}

# Internal constants
EVIDENCE_PRE_FRAMES = 3
EVIDENCE_POST_FRAMES = 7
EVIDENCE_TOTAL = EVIDENCE_PRE_FRAMES + EVIDENCE_POST_FRAMES

# %% [markdown]
# ## CELL 3 — Face enrollment loader
# %% [code]
from insightface.app import FaceAnalysis

def load_face_db(faces_dir):
    print(f"Loading face database from {faces_dir}...")
    app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    
    face_db = {}
    if not os.path.exists(faces_dir):
        print(f"Directory {faces_dir} not found. Starting with empty DB.")
        return face_db
        
    for filename in os.listdir(faces_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            name = os.path.splitext(filename)[0]
            img_path = os.path.join(faces_dir, filename)
            img = cv2.imread(img_path)
            if img is None: continue
            
            faces = app.get(img)
            if faces:
                # Store the most prominent face embedding
                best_face = max(faces, key=lambda f: f.det_score)
                face_db[name] = best_face.embedding.astype(np.float32)
                print(f"Enrolled: {name}")
            else:
                print(f"Warning: No face found in {filename}")
                
    print(f"Enrollment complete. Total persons: {len(face_db)}")
    return face_db

# %% [markdown]
# ## CELL 4 — Full pipeline class: CBMSPipeline
# %% [code]
from ultralytics import YOLO
from ultralytics.trackers.byte_tracker import BYTETracker
import mediapipe as mp
try:
    import mediapipe.solutions.face_mesh as mp_face_mesh
    import mediapipe.solutions.pose as mp_pose
except (AttributeError, ImportError):
    print("Warning: Standard mediapipe.solutions not found, trying alternate path...")
    try:
        from mediapipe.python.solutions import face_mesh as mp_face_mesh
        from mediapipe.python.solutions import pose as mp_pose
    except:
        print("ERROR: MediaPipe solutions totally missing. Ensure 'pip install mediapipe' succeeded.")
        # Fallbacks to None to avoid crash at import time
        mp_face_mesh = None
        mp_pose = None

class CBMSPipeline:
    def __init__(self):
        print("Initializing CBMS Pipeline...")
        # Models
        self.yolo = YOLO("yolov8n.pt")
        try:
            self.yolo.to("cuda")
            print("YOLO moved to GPU.")
        except:
            print("GPU not available for YOLO, using CPU.")
        
        # Tracker args
        tracker_args = SimpleNamespace(
            track_thresh=YOLO_CONF,
            track_buffer=30,
            match_thresh=0.8,
            mot20=False
        )
        self.tracker = BYTETracker(args=tracker_args, frame_rate=VIDEO_FPS_OUTPUT)
        
        # InsightFace
        self.face_app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider"])
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))
        
        # MediaPipe
        self.face_mesh = mp_face_mesh.FaceMesh(
            static_image_mode=False, max_num_faces=1, refine_landmarks=True
        )
        self.pose = mp_pose.Pose(static_image_mode=False)
        
        # State
        self.history = defaultdict(lambda: deque(maxlen=ACTIVITY_HEAD_FORWARD_FRAMES))
        self.pre_buffers = defaultdict(lambda: deque(maxlen=EVIDENCE_PRE_FRAMES))
        self.capture_state = defaultdict(lambda: {"active": False, "count": 0, "activity": None, "crops": []})
        self.scores = defaultdict(lambda: 100) # person_name -> score
        
    def _extract_activity_features(self, crop):
        h, w = crop.shape[:2]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        mouth_open = False
        head_forward = False
        
        # Face Mesh
        fm_res = self.face_mesh.process(rgb)
        if fm_res.multi_face_landmarks:
            lm = fm_res.multi_face_landmarks[0].landmark
            # 13: upper, 14: lower, 1: nose tip, 152: chin
            upper_y, lower_y = lm[13].y * h, lm[14].y * h
            nose_y, chin_y = lm[1].y * h, lm[152].y * h
            face_height = abs(chin_y - nose_y) + 1e-6
            mouth_open = (abs(lower_y - upper_y) / face_height) > ACTIVITY_MOUTH_OPEN_RATIO
            
        # Pose
        pose_res = self.pose.process(rgb)
        if pose_res.pose_landmarks:
            lm = pose_res.pose_landmarks.landmark
            nose_z = lm[mp_pose.PoseLandmark.NOSE].z
            l_sh_z = lm[mp_pose.PoseLandmark.LEFT_SHOULDER].z
            r_sh_z = lm[mp_pose.PoseLandmark.RIGHT_SHOULDER].z
            sh_z = (l_sh_z + r_sh_z) / 2
            head_forward = (nose_z - sh_z) < -0.15
            
        return mouth_open, head_forward

    def _identify_person(self, crops, face_db):
        if not face_db: return "Unknown", 0.0
        
        embeddings = []
        for crop in crops:
            faces = self.face_app.get(crop)
            if faces:
                best = max(faces, key=lambda f: f.det_score)
                embeddings.append(best.embedding.astype(np.float32))
        
        if not embeddings: return "Unknown", 0.0
        
        # Mean embedding for multi-frame ID
        mean_emb = np.mean(embeddings, axis=0)
        mean_emb /= (np.linalg.norm(mean_emb) + 1e-8)
        
        best_name, best_score = "Unknown", 0.0
        for name, ref_emb in face_db.items():
            # Support both numpy from load_database and list from elsewhere
            ref_n = ref_emb / (np.linalg.norm(ref_emb) + 1e-8)
            score = float(np.dot(mean_emb, ref_n))
            if score > best_score:
                best_score, best_name = score, name
                
        if best_score < FACE_MATCH_THRESHOLD:
            return "Unknown", best_score
        return best_name, best_score

    def _create_evidence_grid(self, crops):
        grid_rows = []
        for i in range(2):
            cols = []
            for j in range(5):
                idx = i * 5 + j
                if idx < len(crops):
                    cols.append(cv2.resize(crops[idx], (160, 160)))
                else:
                    cols.append(np.zeros((160, 160, 3), dtype=np.uint8))
            grid_rows.append(np.hstack(cols))
        grid = np.vstack(grid_rows)
        _, buf = cv2.imencode(".jpg", grid, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return base64.b64encode(buf).decode()

    def process_video(self, video_path, face_db):
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 15
        frame_idx = 0
        
        print(f"Opening video {video_path}...")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            
            timestamp_ms = int(frame_idx * (1000/fps))
            
            # 1. YOLO Detection
            results = self.yolo(frame, classes=[0], conf=YOLO_CONF, verbose=False)[0]
            
            # 2. ByteTrack
            tracks = self.tracker.update(results.boxes.data.cpu().numpy(), frame)
            
            alert = None
            for track in tracks:
                track_id = int(track[4])
                bbox = track[:4]
                
                # Crop for activity detection
                x1, y1, x2, y2 = [int(v) for v in bbox]
                h_img, w_img = frame.shape[:2]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w_img, x2), min(h_img, y2)
                crop = frame[y1:y2, x1:x2].copy()
                
                if crop.size == 0: continue
                
                # Store in pre-buffer
                self.pre_buffers[track_id].append(crop.copy())
                
                # Activity detection
                mouth_open, head_forward = self._extract_activity_features(crop)
                self.history[track_id].append(mouth_open and head_forward)
                
                # Heuristic
                activity = "normal"
                if list(self.history[track_id]).count(True) >= ACTIVITY_HEAD_FORWARD_FRAMES:
                    activity = "spitting"
                
                # Cycle
                state = self.capture_state[track_id]
                if activity != "normal" and not state["active"]:
                    state["active"] = True
                    state["count"] = 0
                    state["activity"] = activity
                    state["crops"] = list(self.pre_buffers[track_id])
                
                if state["active"]:
                    state["crops"].append(crop.copy())
                    state["count"] += 1
                    
                    if len(state["crops"]) >= EVIDENCE_TOTAL:
                        name, id_conf = self._identify_person(state["crops"], face_db)
                        rule = ACTIVITY_RULES.get(state["activity"], {"score_delta": 0, "min_conf": 1.0})
                        
                        if id_conf >= rule.get("min_conf", 0.5):
                            self.scores[name] += rule.get("score_delta", 0)
                            alert = {
                                "person_name": name,
                                "activity": state["activity"],
                                "score_delta": rule.get("score_delta", 0),
                                "new_score": self.scores[name],
                                "id_confidence": float(id_conf),
                                "evidence_grid_b64": self._create_evidence_grid(state["crops"])
                            }
                        
                        state["active"] = False
                        self.history[track_id].clear()

                # Annotate
                color = (0, 0, 255) if activity != "normal" else (0, 255, 0)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"ID:{track_id} {activity}"
                cv2.putText(frame, label, (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Ready
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            b64_frame = base64.b64encode(buf).decode()
            
            yield {
                "frame_index": frame_idx,
                "timestamp_ms": timestamp_ms,
                "annotated_frame_b64": b64_frame,
                "alert": alert
            }
            
            frame_idx += 1
            if frame_idx % 100 == 0:
                print(f"Processed {frame_idx} frames...")

        cap.release()

# %% [markdown]
# ## CELL 5 — Mode runner
# %% [code]
def run_cbms():
    face_db = load_face_db(FACES_DIR)
    pipeline = CBMSPipeline()
    
    if MODE == "replay":
        alerts_out = []
        print(f"Starting REPLAY mode on {VIDEO_PATH}...")
        
        with open("frames.jsonl", "w") as f_frames:
            for res in pipeline.process_video(VIDEO_PATH, face_db):
                frame_item = {
                    "frame_index": res["frame_index"],
                    "timestamp_ms": res["timestamp_ms"],
                    "annotated_frame_b64": res["annotated_frame_b64"]
                }
                f_frames.write(json.dumps(frame_item) + "\n")
                
                if res["alert"]:
                    alert_copy = res["alert"].copy()
                    alert_copy["frame_index"] = res["frame_index"]
                    alerts_out.append(alert_copy)
        
        print("Saving ZIP...")
        with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
            z.write("frames.jsonl")
            with open("alerts.json", "w") as f:
                json.dump(alerts_out, f)
            z.write("alerts.json")
        
        if os.path.exists("frames.jsonl"): os.remove("frames.jsonl")
        if os.path.exists("alerts.json"): os.remove("alerts.json")
        print(f"Done. Download {OUTPUT_ZIP}")
        
    elif MODE == "live":
        if not NGROK_URL:
            print("ERROR: NGROK_URL is empty!")
            return
        
        print(f"Starting LIVE mode, streaming to {NGROK_URL}...")
        with httpx.Client() as client:
            for res in pipeline.process_video(VIDEO_PATH, face_db):
                try:
                    client.post(f"{NGROK_URL}/ingest/frame", json={"frame_b64": res["annotated_frame_b64"]}, timeout=0.05)
                    if res["alert"]:
                        client.post(f"{NGROK_URL}/ingest/alert", json=res["alert"], timeout=0.05)
                except:
                    pass 

if __name__ == "__main__":
    run_cbms()

# %% [markdown]
# ## CELL 6 — Re-enrollment helper
# %% [code]
def export_embeddings(new_faces_dir, output_dir="/kaggle/working/"):
    app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    for filename in os.listdir(new_faces_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            name = os.path.splitext(filename)[0]
            img = cv2.imread(os.path.join(new_faces_dir, filename))
            if img is None: continue
            faces = app.get(img)
            if faces:
                best = max(faces, key=lambda f: f.det_score)
                np.save(os.path.join(output_dir, f"{name}.npy"), best.embedding.astype(np.float32))
                print(f"Exported {name}.npy")

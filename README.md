# CBMS — Civic Behaviour Monitoring System

## Quick start

### Backend
```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# Mac/Linux: source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

First run downloads:
- `yolov8n.pt`  (~6 MB)
- InsightFace `buffalo_l` pack  (~300 MB)
- MediaPipe models  (auto, ~30 MB)

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens on http://localhost:3000
```

---

## Enroll your face (Day 1 test)
```bash
curl -X POST http://localhost:8000/enroll \
  -F "name=YourName" \
  -F "file=@/path/to/your/photo.jpg"
```

Or use any REST client (Postman, Thunder Client in VSCode).

---

## TODO map — where to spend each day

| Day | File | TODO |
|-----|------|------|
| 1 | `backend/cv_pipeline/modules/face_recognizer.py` | `_load_model` |
| 1 | `backend/main.py` | `enroll()` endpoint |
| 2 | `backend/cv_pipeline/modules/scene_monitor.py` | `_load_model`, `_detect_persons` |
| 2 | `backend/cv_pipeline/modules/tracker.py` | `_load_tracker`, `update` |
| 2 | `backend/cv_pipeline/modules/activity_detector.py` | `_load_mediapipe`, `_extract_features` |
| 2 | `backend/main.py` | `_pipeline_loop` |
| 3 | `backend/cv_pipeline/modules/face_recognizer.py` | `identify_from_crops` |
| 3 | `backend/main.py` | `_process_evidence` |
| 4 | `frontend/src/components/ui/Leaderboard.tsx` | REST fetch + polling |
| 4 | `frontend/src/app/page.tsx` | Recharts wiring |

---

## WebSocket message shapes

### `/ws/video`  →  browser
```json
{ "type": "frame", "data": "<base64 JPEG string>" }
```

### `/ws/alerts`  →  browser
```json
{
  "type":          "alert",
  "person_name":   "Anshuman",
  "activity":      "spitting",
  "score_delta":   -10,
  "new_score":     90,
  "id_confidence": 0.821
}
```

---

## Swap-in checklist (post-hackathon)
- [ ] Replace MediaPipe heuristics with fine-tuned X3D model in `activity_detector.py`
- [ ] Switch `onnxruntime` → `onnxruntime-gpu` in `requirements.txt` for NVIDIA GPU
- [ ] Change `det_size` in `config.py` from `(640,640)` to `(320,320)` if FPS is low on CPU
- [ ] Add multi-camera support by running multiple `_pipeline_loop` tasks

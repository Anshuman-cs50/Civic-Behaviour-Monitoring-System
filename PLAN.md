# CBMS — 4-Day Execution Plan

## Ground rules
- Every day ends with a **runnable system** — nothing left half-wired
- Each file below is fully scaffolded. Your job per day is to fill the marked `# TODO` blocks
- Use AI prompts for each TODO — the context comment above every TODO tells the AI exactly what to generate

---

## Day 1 — Foundation (Backend boots, enrollment works)
**Goal:** `uvicorn main:app` runs, you can enroll your face via REST, DB persists it.

| File | What to do |
|------|-----------|
| `backend/cv_pipeline/core/config.py` | Ready — review constants, adjust paths if needed |
| `backend/cv_pipeline/core/database.py` | Ready — run once to init DB |
| `backend/cv_pipeline/modules/face_recognizer.py` | Fill `TODO: load InsightFace model` |
| `backend/main.py` | Fill `TODO: enroll endpoint logic` |

**End-of-day check:** `POST /enroll` with a photo returns 200, face appears in `GET /persons`

---

## Day 2 — CV Pipeline (Camera feed flows through all stages)
**Goal:** Camera opens, scene monitor gates, tracker assigns IDs, activity placeholder fires.

| File | What to do |
|------|-----------|
| `backend/cv_pipeline/modules/scene_monitor.py` | Fill `TODO: YOLOv8 inference call` |
| `backend/cv_pipeline/modules/tracker.py` | Fill `TODO: ByteTrack update call` |
| `backend/cv_pipeline/modules/activity_detector.py` | Fill `TODO: MediaPipe landmark extraction` |
| `backend/cv_pipeline/modules/evidence_buffer.py` | Ready — no TODOs |
| `backend/main.py` | Fill `TODO: pipeline loop` |

**End-of-day check:** `/ws/video` streams annotated frames in browser. Console logs show track IDs.

---

## Day 3 — Identity + Scoring (Real detections hit the DB)
**Goal:** Activity fires → face identified → score updated → alert emitted over WebSocket.

| File | What to do |
|------|-----------|
| `backend/cv_pipeline/modules/face_recognizer.py` | Fill `TODO: multi-frame aggregation` |
| `backend/cv_pipeline/modules/rule_engine.py` | Ready — add custom activity rules if needed |
| `backend/main.py` | Fill `TODO: wire rule engine + emit alert` |

**End-of-day check:** Act out spitting in front of camera → alert JSON appears on `/ws/alerts`, score updates in DB.

---

## Day 4 — Frontend (Dashboard shows everything live)
**Goal:** Next.js dashboard shows live video, alert feed, leaderboard, score trend chart.

| File | What to do |
|------|-----------|
| `frontend/src/lib/useWebSocket.ts` | Ready — no TODOs |
| `frontend/src/store/useCBMSStore.ts` | Ready — no TODOs |
| `frontend/src/app/page.tsx` | Fill `TODO: wire Recharts data` |
| `frontend/src/components/ui/AlertFeed.tsx` | Ready — no TODOs |
| `frontend/src/components/ui/Leaderboard.tsx` | Fill `TODO: fetch /persons REST endpoint` |

**End-of-day check:** Full end-to-end — act in front of camera, watch score update live in browser.

---

## Day 5 — Polish & Demo Prep
- Record 2-3 demo scenarios (spitting, littering, helping)
- Add a "Reset scores" button on the dashboard for clean demo resets
- Test on friend's laptop — if FPS < 5, reduce `det_size` in `config.py` to `(320, 320)`
- Prepare a 2-min walkthrough script

---

## Key prompt templates for your AI sessions

**For a TODO block:**
> "I'm building a FastAPI CV pipeline. Here is my [filename] with a TODO at line X.
> Context: [paste the comment above the TODO]. Fill in only that block using [library name]."

**For a bug:**
> "This is my [filename]. When I run it I get [error]. The relevant section is [paste]. Fix it."

**For the frontend:**
> "I'm using Next.js App Router + Tailwind + ShadCN + Recharts + Zustand.
> My WebSocket emits this JSON: [paste alert shape]. Build me a [component name] that [description]."

import cv2
import time
import httpx
import os
import threading
import json
import queue
import numpy as np

# ── Config — Main pipeline ─────────────────────────────────────────────────────
NGROK_URL    = "https://malapportioned-synostotic-freeda.ngrok-free.dev"
API_ENDPOINT = f"{NGROK_URL}/process_chunk"

# ── Config — Smoking pipeline (port 8001) ──────────────────────────────────────
# Set this to the URL shown by Cell 8 of cbms_smoking_pipeline.ipynb.
# Leave as "" to disable the smoking pipeline client-side.
SMOKING_NGROK_URL    = "YOUR_SMOKING_NGROK_URL_HERE"
SMOKING_API_ENDPOINT = f"{SMOKING_NGROK_URL}/process_chunk" if SMOKING_NGROK_URL else ""

# ── Config — Helmet pipeline (port 8001 in helmet notebook) ───────────────────
# Set this to the URL printed by the 'Helmet API — Cell G' cell in
# helmet-detector (2).ipynb after you start the ngrok tunnel there.
# Leave as "" to disable helmet detection client-side.
HELMET_NGROK_URL    = ""   # e.g. "https://xxxx-xxxx.ngrok-free.app"
HELMET_API_ENDPOINT = f"{HELMET_NGROK_URL}/process_chunk" if HELMET_NGROK_URL else ""

# 0 for webcam, or path to a local video file
VIDEO_SOURCE = "Stream/unprocessed_clips/cctv_smoking_clip.mp4"

CHUNK_DURATION_SEC = 10
FPS                = 15

# ── Directories ────────────────────────────────────────────────────────────────
UNPROCESSED_DIR  = "Stream/unprocessed_clips"
PROCESSED_DIR    = "Stream/processed_clips"
KEEP_UNPROCESSED = True
KEEP_PROCESSED   = True

os.makedirs(UNPROCESSED_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR,   exist_ok=True)

# ── Playback queue ─────────────────────────────────────────────────────────────
PLAYBACK_QUEUE = queue.Queue()

# ── Local FastAPI dashboard forwarding ────────────────────────────────────────
LOCAL_FASTAPI_URL = "http://localhost:8000"   # set to "" to disable forwarding
import requests as _req


def forward_alert_to_local(alert: dict):
    """Forward an alert from Kaggle to your local FastAPI dashboard.
    Also injects 'pipeline_type' and 'camera_id' fields so the local DB
    correctly classifies this event under the right analytics pipeline.
    """
    if not LOCAL_FASTAPI_URL:
        return

    def _post():
        try:
            # Map the pipeline header tag to the DB field value
            pipeline_tag  = alert.get("pipeline", "main")
            if pipeline_tag == "smoking":
                pipeline_type = "smoking"
            elif pipeline_tag == "helmet":
                pipeline_type = "helmet"
            else:
                pipeline_type = "activity"

            payload = {
                "person_name":       alert.get("person_name", "UNKNOWN"),
                "activity":          alert.get("activity", "unknown"),
                "score_delta":       alert.get("score_delta", 0),
                "new_score":         alert.get("new_score", 0),
                "id_confidence":     alert.get("id_confidence", 0.0),
                "activity_conf":     alert.get("activity_conf", 0.0),
                "evidence_grid_b64": alert.get("evidence_grid_b64"),
                "frame_index":       alert.get("frame_index"),
                # ── NEW FIELDS for dashboard routing ──────────────────────
                "pipeline_type":     pipeline_type,
                "location_label":    alert.get("location_label", ""),
                "camera_id":         alert.get("camera_id", "Camera 0"),
            }
            _req.post(f"{LOCAL_FASTAPI_URL}/ingest/alert", json=payload, timeout=1.0)
        except Exception:
            pass

    threading.Thread(target=_post, daemon=True).start()


def forward_frame_to_local(frame_bgr: np.ndarray):
    """Forward an annotated frame to the local dashboard /ingest/frame endpoint."""
    if not LOCAL_FASTAPI_URL:
        return

    def _post():
        try:
            _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
            b64    = __import__("base64").b64encode(buf).decode()
            _req.post(f"{LOCAL_FASTAPI_URL}/ingest/frame",
                      json={"frame_b64": b64}, timeout=0.5)
        except Exception:
            pass

    threading.Thread(target=_post, daemon=True).start()


# ── Server management helpers ─────────────────────────────────────────────────

def health_check(base_url: str, label: str = "server") -> bool:
    """
    GET /health — returns True if server is reachable and healthy.
    Mirrors the same endpoint on both the main and smoking pipelines.
    """
    try:
        r = httpx.get(f"{base_url}/health", timeout=10.0)
        if r.status_code == 200:
            info = r.json()
            print(f"[OK] {label} reachable. "
                  f"pipeline={info.get('pipeline', 'main')}  "
                  f"enrolled={info.get('enrolled', '?')}  "
                  f"frame={info.get('global_frame', 0)}  "
                  f"expected_chunk={info.get('expected_chunk', '?')}")
            return True
        else:
            print(f"[WARN] {label} responded with {r.status_code}")
            return False
    except Exception as e:
        print(f"[WARN] {label} health check failed: {e}")
        return False


def get_scores(base_url: str, label: str = "server") -> dict:
    """
    GET /scores — fetch per-person cumulative behaviour scores.
    Available on both the main pipeline (port 8000) and the smoking
    pipeline (port 8001).

    Example:
        scores = get_scores(NGROK_URL, "main pipeline")
        smoking_scores = get_scores(SMOKING_NGROK_URL, "smoking pipeline")
    """
    try:
        r = httpx.get(f"{base_url}/scores", timeout=10.0)
        if r.status_code == 200:
            scores = r.json()
            print(f"[SCORES] {label}:")
            for name, score in scores.items():
                print(f"  {name:<25} score={score}")
            return scores
        else:
            print(f"[WARN] /scores returned {r.status_code}")
            return {}
    except Exception as e:
        print(f"[ERROR] /scores request failed: {e}")
        return {}


def reset_pipeline(base_url: str, label: str = "server") -> bool:
    """
    POST /reset_pipeline — tear down and re-create the pipeline on the server.
    Also resets the sequential chunk counter back to 0.
    Works on both main pipeline (StatefulPipeline) and smoking pipeline
    (SmokingPipeline) — both expose this endpoint with the same interface.

    Call this when you restart the client mid-stream and want the server
    to forget all existing track state.

    Example:
        reset_pipeline(NGROK_URL, "main pipeline")
        reset_pipeline(SMOKING_NGROK_URL, "smoking pipeline")
    """
    try:
        r = httpx.post(f"{base_url}/reset_pipeline", timeout=15.0)
        if r.status_code == 200:
            info = r.json()
            print(f"[RESET] {label}: {info}")
            return True
        else:
            print(f"[WARN] /reset_pipeline returned {r.status_code}")
            return False
    except Exception as e:
        print(f"[ERROR] /reset_pipeline request failed: {e}")
        return False


def resync_server(base_url: str, chunk_idx: int, label: str = "server") -> bool:
    """
    POST /set_expected_chunk/{idx} — tell the server which chunk to expect next.

    Use after a client restart when the server has already processed some
    chunks (and therefore has a non-zero expected_chunk counter). Without
    resyncing, the server would wait forever for chunk_0000 that will never
    arrive.

    Works on both pipelines — both expose /set_expected_chunk/{idx}.

    Example:
        # Client crashed after chunk 7; resume from chunk 8:
        resync_server(NGROK_URL, chunk_idx=8, label="main pipeline")
        resync_server(SMOKING_NGROK_URL, chunk_idx=8, label="smoking pipeline")
    """
    try:
        r = httpx.post(f"{base_url}/set_expected_chunk/{chunk_idx}", timeout=10.0)
        if r.status_code == 200:
            info = r.json()
            print(f"[RESYNC] {label}: {info}")
            return True
        else:
            print(f"[WARN] /set_expected_chunk returned {r.status_code}")
            return False
    except Exception as e:
        print(f"[ERROR] /set_expected_chunk request failed: {e}")
        return False


# ── Playback worker ────────────────────────────────────────────────────────────

def playback_worker():
    """Background thread — plays processed video clips as they arrive."""
    print("[INFO] Playback worker started.")

    status_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(status_frame, "Waiting for Kaggle to process...", (60, 240),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    while True:
        try:
            try:
                msg = PLAYBACK_QUEUE.get(timeout=1.0)
            except queue.Empty:
                cv2.imshow("CBMS — Processed Output", status_frame)
                cv2.waitKey(1)
                continue

            if msg is None:
                break   # shutdown signal

            video_path, alerts = msg
            # Tag pipeline source in the window title if available
            pipeline_tag = alerts[0].get("pipeline", "") if alerts else ""
            win_title    = f"CBMS — {pipeline_tag.upper()} Output" if pipeline_tag else "CBMS — Processed Output"

            cap = cv2.VideoCapture(video_path)
            frame_count = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if alerts:
                    h, w = frame.shape[:2]
                    cv2.rectangle(frame, (0, 0), (w, 40), (0, 0, 200), -1)
                    texts = [
                        f"{a.get('person_name')} - {a.get('activity')} "
                        f"(score: {a.get('new_score', 'N/A')}) "
                        f"[{a.get('location_label', '')}]"
                        for a in alerts
                    ]
                    cv2.putText(frame, "  |  ".join(texts), (10, 28),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

                cv2.imshow(win_title, frame)

                if frame_count % 2 == 0:
                    forward_frame_to_local(frame)

                frame_count += 1
                if cv2.waitKey(int(1000 / FPS)) & 0xFF == ord('q'):
                    break

            cap.release()
            print(f"[INFO] Playback done: {os.path.basename(video_path)}")

        except Exception as e:
            print(f"[ERROR] Playback error: {e}")


# ── Chunk upload ───────────────────────────────────────────────────────────────

def send_chunk(file_path: str, chunk_idx: int, api_endpoint: str = None,
               pipeline_label: str = "main"):
    """
    Upload one chunk to a Kaggle pipeline server.

    Parameters
    ----------
    file_path     : local path to the .mp4 chunk
    chunk_idx     : sequential index used for server-side ordering
    api_endpoint  : full URL of the /process_chunk endpoint.
                    Defaults to the main pipeline's API_ENDPOINT.
    pipeline_label: human-readable tag shown in log output ("main" / "smoking")

    Response headers consumed:
      X-Global-Frame   — server's running frame counter
      X-Alerts         — JSON list of alert dicts (evidence grid stripped)
      X-Chunk-Idx      — echo of the chunk index (both pipelines)
      X-Pipeline       — "smoking" | absent (main pipeline)
      X-Location-Type  — location context (smoking pipeline only)
      X-Location-Label — location label  (smoking pipeline only)
    """
    if api_endpoint is None:
        api_endpoint = API_ENDPOINT

    print(f"[UPLOAD:{pipeline_label}] Sending chunk_{chunk_idx} "
          f"({os.path.getsize(file_path) // 1024} KB) → {api_endpoint} ...")
    t0 = time.time()

    try:
        with open(file_path, "rb") as f:
            response = httpx.post(
                api_endpoint,
                files={"file": (os.path.basename(file_path), f, "video/mp4")},
                timeout=120.0,
            )

        elapsed = time.time() - t0

        if response.status_code == 200:
            global_frame   = response.headers.get("X-Global-Frame", "?")
            alerts_str     = response.headers.get("X-Alerts", "[]")
            pipeline_hdr   = response.headers.get("X-Pipeline", "main")
            location_label = response.headers.get("X-Location-Label", "")

            try:
                alerts = json.loads(alerts_str)
            except json.JSONDecodeError:
                alerts = []

            # Attach pipeline tag to each alert for the playback worker
            for a in alerts:
                a["pipeline"] = pipeline_hdr

            print(f"[OK:{pipeline_label}] chunk_{chunk_idx} in {elapsed:.1f}s  "
                  f"global_frame={global_frame}  alerts={len(alerts)}")

            for a in alerts:
                loc = f" [{location_label}]" if location_label else ""
                print(f"  ALERT: {a.get('person_name')} → {a.get('activity')}"
                      f"  conf={a.get('activity_conf', 0):.0%}"
                      f"  score={a.get('new_score', 'N/A')}{loc}")
                forward_alert_to_local(a)

            # Save annotated video
            processed_name = f"{pipeline_label}_processed_chunk_{chunk_idx:04d}.mp4"
            processed_path = os.path.join(PROCESSED_DIR, processed_name)
            with open(processed_path, "wb") as pf:
                pf.write(response.content)

            PLAYBACK_QUEUE.put((processed_path, alerts))

        else:
            print(f"[ERROR:{pipeline_label}] HTTP {response.status_code}: "
                  f"{response.text[:200]}")

    except httpx.ConnectError:
        print(f"[ERROR:{pipeline_label}] Cannot reach {api_endpoint} — "
              f"is the Kaggle server running?")
    except httpx.TimeoutException:
        print(f"[ERROR:{pipeline_label}] Timeout on chunk_{chunk_idx} — "
              f"server took > 120s")
    except Exception as e:
        print(f"[ERROR:{pipeline_label}] Unexpected error: {e}")
    finally:
        if not KEEP_UNPROCESSED and os.path.exists(file_path):
            os.remove(file_path)


# ── Main capture loop ──────────────────────────────────────────────────────────

def record_and_stream():
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video source: {VIDEO_SOURCE}")
        return

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    print(f"[INFO] Capture started  {width}x{height} @ {FPS}fps")
    print(f"[INFO] Chunk size: {CHUNK_DURATION_SEC}s = {CHUNK_DURATION_SEC * FPS} frames")

    chunk_idx     = 0
    target_frames = CHUNK_DURATION_SEC * FPS

    while cap.isOpened():
        chunk_path = os.path.join(UNPROCESSED_DIR, f"chunk_{chunk_idx:04d}.mp4")
        out        = cv2.VideoWriter(chunk_path, fourcc, FPS, (width, height))

        frames_written = 0
        while frames_written < target_frames:
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)
            frames_written += 1

            cv2.imshow("CBMS — Local Feed", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                cap.release()
                out.release()
                cv2.destroyAllWindows()
                return

        out.release()

        if frames_written == 0:
            print("[INFO] Source exhausted.")
            break

        print(f"\n[CHUNK] chunk_{chunk_idx} ready ({frames_written} frames). "
              f"Dispatching upload thread(s)...")

        # ── Main pipeline upload ──────────────────────────────────────────────
        threading.Thread(
            target=send_chunk,
            args=(chunk_path, chunk_idx, API_ENDPOINT, "main"),
            daemon=True,
        ).start()

        # ── Smoking pipeline upload (parallel, if configured) ─────────────────
        if SMOKING_API_ENDPOINT:
            threading.Thread(
                target=send_chunk,
                args=(chunk_path, chunk_idx, SMOKING_API_ENDPOINT, "smoking"),
                daemon=True,
            ).start()

        # ── Helmet pipeline upload (parallel, if configured) ──────────────────
        if HELMET_API_ENDPOINT:
            threading.Thread(
                target=send_chunk,
                args=(chunk_path, chunk_idx, HELMET_API_ENDPOINT, "helmet"),
                daemon=True,
            ).start()

        chunk_idx += 1

    cap.release()
    cv2.destroyAllWindows()
    print("[INFO] Capture finished.")


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "YOUR-NGROK-URL" in NGROK_URL:
        print("Set NGROK_URL at the top of this file first.")
        print("You get the URL from Cell 8 output in the Kaggle notebook.")
    else:
        # ── Verify connectivity ───────────────────────────────────────────────
        print(f"[INFO] Checking main pipeline at {NGROK_URL}/health ...")
        health_check(NGROK_URL, "main pipeline")

        if SMOKING_NGROK_URL:
            print(f"\n[INFO] Checking smoking pipeline at {SMOKING_NGROK_URL}/health ...")
            health_check(SMOKING_NGROK_URL, "smoking pipeline")

        if HELMET_NGROK_URL:
            print(f"\n[INFO] Checking helmet pipeline at {HELMET_NGROK_URL}/health ...")
            health_check(HELMET_NGROK_URL, "helmet pipeline")

        # ── Optional: resync servers if resuming a session ────────────────────
        # Uncomment and set RESUME_FROM_CHUNK if the client crashed mid-stream:
        # RESUME_FROM_CHUNK = 12
        # resync_server(NGROK_URL,         RESUME_FROM_CHUNK, "main pipeline")
        # resync_server(SMOKING_NGROK_URL, RESUME_FROM_CHUNK, "smoking pipeline")

        # ── Optional: fetch scores before starting ────────────────────────────
        # get_scores(NGROK_URL,         "main pipeline")
        # get_scores(SMOKING_NGROK_URL, "smoking pipeline")

        # ── Start playback worker ─────────────────────────────────────────────
        pb_thread = threading.Thread(target=playback_worker, daemon=True)
        pb_thread.start()

        try:
            record_and_stream()
        except KeyboardInterrupt:
            print("\n[INFO] Shutting down...")
            # Print final scores on exit
            print("\n── Final Scores ──────────────────────────")
            get_scores(NGROK_URL, "main pipeline")
            if SMOKING_NGROK_URL:
                get_scores(SMOKING_NGROK_URL, "smoking pipeline")
            if HELMET_NGROK_URL:
                get_scores(HELMET_NGROK_URL, "helmet pipeline")
        finally:
            PLAYBACK_QUEUE.put(None)
            cv2.destroyAllWindows()

import cv2
import time
import httpx
import os
import threading
import json
import queue
import numpy as np

# ── Config ─────────────────────────────────────────────────────────────────
NGROK_URL    = "https://malapportioned-synostotic-freeda.ngrok-free.dev"   # paste from Cell 8 output
API_ENDPOINT = f"{NGROK_URL}/process_chunk"

# 0 for webcam, or path to a local video file
VIDEO_SOURCE = 0

CHUNK_DURATION_SEC = 10
FPS                = 15

# ── Directories ────────────────────────────────────────────────────────────
UNPROCESSED_DIR = "Stream/unprocessed_clips"
PROCESSED_DIR   = "Stream/processed_clips"
KEEP_UNPROCESSED = True
KEEP_PROCESSED   = True

os.makedirs(UNPROCESSED_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR,   exist_ok=True)

# ── Playback queue ─────────────────────────────────────────────────────────
PLAYBACK_QUEUE = queue.Queue()

# ── Global alert store — for forwarding to local FastAPI (optional) ────────
LOCAL_FASTAPI_URL = "http://localhost:8000"   # set to "" to disable forwarding
import requests as _req


def forward_alert_to_local(alert: dict):
    """
    Forward an alert from Kaggle to your local FastAPI dashboard.
    The dashboard's /ingest/alert endpoint accepts the same alert shape.
    """
    if not LOCAL_FASTAPI_URL:
        return

    def _post():
        try:
            _req.post(
                f"{LOCAL_FASTAPI_URL}/ingest/alert",
                json=alert,
                timeout=1.0
            )
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
            _req.post(
                f"{LOCAL_FASTAPI_URL}/ingest/frame",
                json={"frame_b64": b64},
                timeout=0.5
            )
        except Exception:
            pass

    threading.Thread(target=_post, daemon=True).start()


# ── Playback worker ────────────────────────────────────────────────────────

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

            cap = cv2.VideoCapture(video_path)
            frame_count = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Draw alert banner if any alerts in this chunk
                if alerts:
                    h, w = frame.shape[:2]
                    cv2.rectangle(frame, (0, 0), (w, 40), (0, 0, 200), -1)
                    texts  = [
                        f"{a.get('person_name')} - {a.get('activity')} "
                        f"(score: {a.get('new_score', 'N/A')})"
                        for a in alerts
                    ]
                    cv2.putText(frame, "  |  ".join(texts), (10, 28),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

                cv2.imshow("CBMS — Processed Output", frame)

                # Also forward every Nth frame to the local dashboard
                if frame_count % 2 == 0:
                    forward_frame_to_local(frame)

                frame_count += 1
                if cv2.waitKey(int(1000 / FPS)) & 0xFF == ord('q'):
                    break

            cap.release()
            print(f"[INFO] Playback done: {os.path.basename(video_path)}")

        except Exception as e:
            print(f"[ERROR] Playback error: {e}")


# ── Chunk upload ───────────────────────────────────────────────────────────

def send_chunk(file_path: str, chunk_idx: int):
    """Upload one chunk to Kaggle, receive back the annotated video + alerts."""
    print(f"[UPLOAD] Sending chunk_{chunk_idx} ({os.path.getsize(file_path)//1024} KB)...")
    t0 = time.time()

    try:
        with open(file_path, "rb") as f:
            response = httpx.post(
                API_ENDPOINT,
                files={"file": (os.path.basename(file_path), f, "video/mp4")},
                timeout=120.0
            )

        elapsed = time.time() - t0

        if response.status_code == 200:
            # Parse metadata from response headers
            global_frame = response.headers.get("X-Global-Frame", "?")
            alerts_str   = response.headers.get("X-Alerts", "[]")

            try:
                alerts = json.loads(alerts_str)
            except json.JSONDecodeError:
                alerts = []

            print(f"[OK] chunk_{chunk_idx} processed in {elapsed:.1f}s  "
                  f"global_frame={global_frame}  alerts={len(alerts)}")

            for a in alerts:
                print(f"  ALERT: {a.get('person_name')} -> {a.get('activity')} "
                      f"(conf={a.get('activity_conf', 0):.0%}  "
                      f"score={a.get('new_score', 'N/A')})")
                # Forward to local FastAPI for the dashboard
                forward_alert_to_local(a)

            # Save the annotated video
            processed_name = f"processed_chunk_{chunk_idx:04d}.mp4"
            processed_path = os.path.join(PROCESSED_DIR, processed_name)
            with open(processed_path, "wb") as pf:
                pf.write(response.content)

            PLAYBACK_QUEUE.put((processed_path, alerts))

        else:
            print(f"[ERROR] HTTP {response.status_code}: {response.text[:200]}")

    except httpx.ConnectError:
        print(f"[ERROR] Cannot reach {NGROK_URL} — is the Kaggle server running?")
    except httpx.TimeoutException:
        print(f"[ERROR] Timeout on chunk_{chunk_idx} — Kaggle took > 120s")
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
    finally:
        if not KEEP_UNPROCESSED and os.path.exists(file_path):
            os.remove(file_path)


# ── Main capture loop ──────────────────────────────────────────────────────

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

            # Show local feed
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
              f"Dispatching upload thread...")

        # Fire and forget — capture continues while upload happens
        threading.Thread(
            target=send_chunk,
            args=(chunk_path, chunk_idx),
            daemon=True
        ).start()

        chunk_idx += 1

    cap.release()
    cv2.destroyAllWindows()
    print("[INFO] Capture finished.")


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "YOUR-NGROK-URL" in NGROK_URL:
        print("Set NGROK_URL at the top of this file first.")
        print("You get the URL from Cell 8 output in the Kaggle notebook.")
    else:
        # Verify connectivity before starting
        print(f"[INFO] Checking Kaggle server at {NGROK_URL}/health ...")
        try:
            r = httpx.get(f"{NGROK_URL}/health", timeout=10.0)
            if r.status_code == 200:
                info = r.json()
                print(f"[OK] Server reachable. "
                      f"enrolled={info.get('enrolled', '?')} "
                      f"frame={info.get('global_frame', 0)}")
            else:
                print(f"[WARN] Server responded with {r.status_code}")
        except Exception as e:
            print(f"[WARN] Health check failed: {e} — proceeding anyway")

        # Start playback worker thread
        pb_thread = threading.Thread(target=playback_worker, daemon=True)
        pb_thread.start()

        try:
            record_and_stream()
        except KeyboardInterrupt:
            print("\n[INFO] Shutting down...")
        finally:
            PLAYBACK_QUEUE.put(None)
            cv2.destroyAllWindows()

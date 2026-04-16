# backend/stream_manager.py
# ?????????????????????????????????????????????????????????????
# StreamManager ? Kaggle-remote pipeline controller.
#
# Key guarantees:
#   ? STRICT SEQUENTIAL UPLOAD AND RECEIVE.
#   ? If playback stalls, the client actively commands Kaggle 
#     to resync to the stalled chunk index via /set_expected_chunk
# ?????????????????????????????????????????????????????????????

import base64
import json
import os
import threading
import time
import cv2
import httpx
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from cv_pipeline.core.config import (
    KEEP_PROCESSED, KEEP_UNPROCESSED,
    PROCESSED_DIR, PROCESSED_MAX_FILES, UNPROCESSED_DIR,
)

# ?? Stats ??????????????????????????????????????????????????

class StreamStats:
    def __init__(self):
        self.chunks_sent      = 0
        self.chunks_processed = 0
        self.chunks_failed    = 0
        self.last_latency_s   = 0.0
        self.global_frame     = 0
        self.is_streaming     = False
        self.source           = ""
        self.ngrok_url        = ""
        self.session_name     = ""
        self._lock            = threading.Lock()

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "is_streaming":     self.is_streaming,
                "source":           self.source,
                "ngrok_url":        self.ngrok_url,
                "session_name":     self.session_name,
                "chunks_sent":      self.chunks_sent,
                "chunks_processed": self.chunks_processed,
                "chunks_failed":    self.chunks_failed,
                "last_latency_s":   round(self.last_latency_s, 1),
                "global_frame":     self.global_frame,
            }

# ?? Manager ????????????????????????????????????????????????

class StreamManager:
    def __init__(self):
        self.stats            = StreamStats()
        self._stop_event      = threading.Event()
        self._capture_thread  : Optional[threading.Thread] = None
        self._playback_thread : Optional[threading.Thread] = None
        self._upload_thread   : Optional[threading.Thread] = None

        self._unprocessed = {}
        self._pending = {}
        
        self._next_play_idx = 0
        self._current_upload_idx = 0
        self._needs_resync = False

        self._pending_cond  = threading.Condition(threading.Lock())
        self._upload_cond   = threading.Condition(threading.Lock())

        self._external_idx = 1000000 # Start external chunks at a high index to avoid collisions

        self._session_unproc_dir: Path = Path(UNPROCESSED_DIR)
        self._session_proc_dir:   Path = Path(PROCESSED_DIR)

    def start(
        self,
        source: int | str,
        ngrok_url: str,
        on_frame: Callable[[str], None],
        on_alert: Callable[[dict], None],
        chunk_sec: int = 10,
        fps:       int = 15,
    ) -> None:
        self.stop()

        session_ts = datetime.now().strftime("startedon_%Y%m%d_%H%M%S")
        self._session_unproc_dir = Path(UNPROCESSED_DIR) / session_ts
        self._session_proc_dir   = Path(PROCESSED_DIR)   / session_ts
        self._session_unproc_dir.mkdir(parents=True, exist_ok=True)
        self._session_proc_dir.mkdir(parents=True, exist_ok=True)
        print(f"[StreamManager] Session started: {session_ts}")

        self._stop_event.clear()
        with self._pending_cond:
            self._pending.clear()
            self._next_play_idx = 0
            
        with self._upload_cond:
            self._unprocessed.clear()
            self._current_upload_idx = 0
            self._needs_resync = False

        self.stats.is_streaming     = True
        self.stats.source           = str(source)
        self.stats.ngrok_url        = ngrok_url
        self.stats.session_name     = session_ts
        self.stats.chunks_sent      = 0
        self.stats.chunks_processed = 0
        self.stats.chunks_failed    = 0

        self._on_frame  = on_frame
        self._on_alert  = on_alert
        self._api_ep    = f"{ngrok_url}/process_chunk"
        self._ngrok_url = ngrok_url
        self._chunk_sec = chunk_sec
        self._fps       = fps
        self._source    = source

        try:
            httpx.post(f"{ngrok_url}/reset_pipeline", timeout=5.0)
            print("[StreamManager] Remote pipeline reset.")
        except Exception as e:
            print(f"[StreamManager] Warning: could not reset remote pipeline: {e}")

        self._playback_thread = threading.Thread(target=self._playback_worker, daemon=True, name="cbms-playback")
        self._playback_thread.start()

        self._upload_thread = threading.Thread(target=self._upload_worker, daemon=True, name="cbms-upload")
        self._upload_thread.start()

        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True, name="cbms-capture")
        self._capture_thread.start()

    def stop(self) -> None:
        if not self.stats.is_streaming: return
        self.stats.is_streaming = False
        self._stop_event.set()

        with self._pending_cond: self._pending_cond.notify_all()
        with self._upload_cond: self._upload_cond.notify_all()

        if self._capture_thread: self._capture_thread.join(timeout=3.0)
        if self._upload_thread: self._upload_thread.join(timeout=3.0)
        if self._playback_thread: self._playback_thread.join(timeout=3.0)
        print("[StreamManager] Stopped.")

    def status(self) -> dict:
        return self.stats.to_dict()

    def inject_external_chunk(self, chunk_path: str, camera_id: str = "Mobile_Cam"):
        """Allows pushing a video chunk from an external source (like a mobile app)."""
        print(f"[StreamManager] External chunk injected: {chunk_path} from {camera_id}")
        
        if not self.stats.is_streaming:
            print("[StreamManager] WARNING: Injection ignored. Stream not active.")
            return

        with self._upload_cond:
            idx = self._external_idx
            self._unprocessed[idx] = (chunk_path, camera_id)
            self._external_idx += 1
            self._upload_cond.notify_all()
        
        # Update source stats temporarily or per-chunk if needed
        # self.stats.source = f"Injected: {camera_id}"

    # ?? Internal ? Capture loop ????????????????????????????
    def _capture_loop(self):
        source = self._source
        if isinstance(source, str) and source.isdigit(): source = int(source)

        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"[StreamManager] ERROR: Cannot open source {source}")
            self.stats.is_streaming = False
            return

        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        target = self._chunk_sec * self._fps
        chunk_idx = 0

        while not self._stop_event.is_set():
            chunk_name = f"chunk_{chunk_idx:04d}.mp4"
            chunk_path = str(self._session_unproc_dir / chunk_name)
            out = cv2.VideoWriter(chunk_path, fourcc, self._fps, (width, height))
            written = 0

            while written < target and not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    if isinstance(source, str):
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    break
                out.write(frame)
                written += 1

            out.release()
            if written == 0: break

             print(f"[Capture] chunk_{chunk_idx:04d} ready.")
            with self._upload_cond:
                self._unprocessed[chunk_idx] = (chunk_path, self.stats.source or "Local_Cam")
                self._upload_cond.notify_all()

            chunk_idx += 1

        cap.release()
        self.stats.is_streaming = False

    # ?? Internal ? Sequential Upload worker ????????????????
    def _upload_worker(self):
        while not self._stop_event.is_set():
            with self._upload_cond:
                if self._needs_resync:
                    print(f"[Upload] RESYNC required! Re-targeting chunk_{self._next_play_idx:04d}")
                    try:
                        resync_url = f"{self._ngrok_url}/set_expected_chunk/{self._next_play_idx}"
                        resp = httpx.post(resync_url, timeout=5.0)
                        print(f"[Upload] Resync ACK from Server: {resp.status_code}")
                    except Exception as e:
                        print(f"[Upload] Kaggle Resync failed: {e}")
                    
                    self._current_upload_idx = self._next_play_idx
                    self._needs_resync = False

                if self._current_upload_idx not in self._unprocessed:
                    self._upload_cond.wait(timeout=1.0)
                    continue

                chunk_idx = self._current_upload_idx
                chunk_path, chunk_source = self._unprocessed[chunk_idx]

            t0 = time.time()
            try:
                print(f"[Upload] Sending chunk_{chunk_idx:04d} ({chunk_source}) -> {self._api_ep}")
                with open(chunk_path, "rb") as f:
                    response = httpx.post(
                        self._api_ep,
                        files={"file": (os.path.basename(chunk_path), f, "video/mp4")},
                        timeout=180.0
                    )
                elapsed = time.time() - t0

                if response.status_code == 200:
                    with self.stats._lock:
                        self.stats.chunks_sent += 1
                        self.stats.chunks_processed += 1
                        self.stats.last_latency_s = elapsed

                    try: alerts = json.loads(response.headers.get("X-Alerts", "[]"))
                    except: alerts = []

                    print(f"[Upload] ? chunk_{chunk_idx:04d} processed in {elapsed:.1f}s")

                    proc_name = f"processed_chunk_{chunk_idx:04d}.mp4"
                    proc_path = self._session_proc_dir / proc_name
                    proc_path.write_bytes(response.content)
                    self._rotate_processed_dir()

                    with self._pending_cond:
                        self._pending[chunk_idx] = (str(proc_path), alerts)
                        self._pending_cond.notify_all()

                    for a in alerts:
                        # Append the specific source of this chunk to the alert data
                        a["camera_id"] = chunk_source
                        threading.Thread(target=self._on_alert, args=(a,), daemon=True).start()

                    # Success, move to next!
                    with self._upload_cond:
                        self._current_upload_idx += 1
                else:
                    print(f"[Upload] Server error {response.status_code} for chunk_{chunk_idx:04d}, retrying...")
                    time.sleep(2)
            except Exception as e:
                print(f"[Upload] Network Error on chunk_{chunk_idx:04d}: {e}. Retrying...")
                time.sleep(2)

    # ?? Internal ? Ordered playback worker ????????????????
    def _playback_worker(self):
        stall_timer = 0
        frame_interval = 1.0 / max(1, self._fps)

        while not self._stop_event.is_set():
            with self._pending_cond:
                last_check = time.time()
                while self._next_play_idx not in self._pending and not self._stop_event.is_set():
                    self._pending_cond.wait(timeout=1.0)
                    dt = time.time() - last_check
                    
                    if dt >= 1.0:
                        stall_timer += int(dt)
                        last_check = time.time()
                        
                    if stall_timer >= 10:
                        print(f"[Playback] STALLED waiting for chunk_{self._next_play_idx:04d}. Requesting Resync!")
                        with self._upload_cond:
                            self._needs_resync = True
                            self._upload_cond.notify_all()
                        stall_timer = 0

                if self._stop_event.is_set() and self._next_play_idx not in self._pending:
                    break

                if self._next_play_idx not in self._pending:
                    continue

                video_path, _alerts = self._pending.pop(self._next_play_idx)
                play_idx = self._next_play_idx
                self._next_play_idx += 1
                stall_timer = 0

            if video_path is None: continue

            print(f"[Playback] ? Playing chunk_{play_idx:04d}")
            cap = cv2.VideoCapture(video_path)
            clip_fps = cap.get(cv2.CAP_PROP_FPS) or self._fps
            delay    = 1.0 / max(1, clip_fps * 1.5) # 1.5x artificially faster playback

            while cap.isOpened() and not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret: break

                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
                b64 = base64.b64encode(buf).decode()

                t_frame_start = time.monotonic()
                try:
                    fut = self._on_frame(b64)
                    if fut is not None:
                        try: fut.result(timeout=0.2)
                        except: pass
                except Exception as exc: pass

                elapsed_f = time.monotonic() - t_frame_start
                sleep_for = delay - elapsed_f
                if sleep_for > 0: time.sleep(sleep_for)

            cap.release()

            if not KEEP_PROCESSED and video_path:
                try: Path(video_path).unlink(missing_ok=True)
                except OSError: pass
            
            if not KEEP_UNPROCESSED:
                with self._upload_cond:
                    if play_idx in self._unprocessed:
                        path_to_delete, _ = self._unprocessed[play_idx]
                        try: Path(path_to_delete).unlink(missing_ok=True)
                        except: pass
                        del self._unprocessed[play_idx]

    def _rotate_processed_dir(self):
        all_clips = sorted(Path(PROCESSED_DIR).rglob("*.mp4"), key=lambda p: p.stat().st_mtime)
        while len(all_clips) > PROCESSED_MAX_FILES:
            try: all_clips.pop(0).unlink(missing_ok=True)
            except OSError: break

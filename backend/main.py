import cv2
import asyncio
import base64
import json
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import time

app = FastAPI()

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "CBMS Backend is running"}

@app.websocket("/ws/video")
async def video_stream(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Video client connected")
    try:
        while True:
            # Create a mock frame (black image with timestamp)
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, f"LIVE FEED - {time.strftime('%H:%M:%S')}", 
                        (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Encode as JPEG
            _, buffer = cv2.imencode('.jpg', frame)
            jpg_as_text = base64.b64encode(buffer).decode('utf-8')
            
            # Stream the frame
            await websocket.send_text(jpg_as_text)
            
            # Control frame rate (~10 FPS for demo)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        print("[WS] Video client disconnected")

@app.websocket("/ws/alerts")
async def alerts_stream(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Alert client connected")
    try:
        count = 0
        while True:
            # Simulate a negative activity every 10 seconds
            await asyncio.sleep(10)
            count += 1
            alert = {
                "id": f"alert_{count}",
                "person_id": "Unknown_001",
                "activity": "Littering",
                "confidence": 0.89,
                "timestamp": time.strftime('%H:%M:%S'),
                "score_delta": -10
            }
            await websocket.send_json(alert)
    except WebSocketDisconnect:
        print("[WS] Alert client disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

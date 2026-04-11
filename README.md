# Civic Behaviour Monitoring System (CBMS)

The Civic Behaviour Monitoring System (CBMS) is an advanced, hybrid-architecture computer vision pipeline. It is designed to track individuals in public environments, automatically detect specific civic offences (such as littering and spitting) in near real-time, generate indisputable visual evidence, and maintain a score-based leaderboard of identified persons.

## 🚀 Key Features

*   **Hybrid Cloud-Edge Architecture:** Runs a lightweight React/Next.js dashboard and Python relay backend locally, while offloading high-intensity GPU processing (YOLOv8, InsightFace, MediaPipe, LSTM classifiers) to a remote Kaggle server via Ngrok.
*   **Near Real-Time Video Streaming:** Implements a strictly sequential, sliding-window chunking protocol (`StreamManager`) that records, uploads, waits for processing, and smoothly plays back the annotated video feed with virtually zero out-of-order frames. Automatic stall-resync guarantees that deadlocks are recovered seamlessly.
*   **Deep Activity Classification:** Uses **YOLOv8** + **ByteTrack** to persistently track individuals, extracts 3D skeletal keypoints using **MediaPipe Pose**, and classifies behaviors using a custom **2-layer LSTM model**. Current targets include `littering`, `spitting`, and `normal`.
*   **Identity & Face Recognition:** Uses **InsightFace** to extract high-accuracy facial embeddings. Maintains a facial recognition database where registered "known" individuals are tracked and their civic scores dynamically updated based on detected behaviors.
*   **Automated Evidence Generation:** When an offence is confirmed over a sliding window frame buffer, the system captures a "thumbnail evidence grid" of the event sequence to prove the violation beyond doubt.
*   **Live Interactive Dashboard:** A highly polished Next.js Admin Panel equipped with live WebSocket feeds for dual video streams (Live Raw and Annotated Processed), instant alert notifications, evidence viewing, and an automated leaderboard showing civic scores.

### 🧠 Custom Activity Classifier Architecture
The behavior classification uses a lightweight, highly optimized 2-layer LSTM designed specifically for sequential 3D skeletal keypoints. The model was trained entirely in Kaggle (`train-classifier.ipynb`) and boasts an impressively small footprint of just **167,107 parameters**, allowing for lightning-fast inference on the server side (`cbms-pipeline.ipynb`).

```python
import torch.nn as nn

class PoseActivityClassifier(nn.Module):
    """
    2-layer LSTM reading pose keypoint sequences.

    Input:  (batch, n_frames, features)  — e.g. (16, 16, 99)
    Output: (batch, num_classes)         — raw logits, pass through softmax
    """

    def __init__(self, input_size: int, hidden1: int, hidden2: int,
                 num_classes: int, dropout: float):
        super().__init__()

        self.lstm1 = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden1,
            batch_first=True,   # input shape: (batch, seq, features)
        )
        self.lstm2 = nn.LSTM(
            input_size=hidden1,
            hidden_size=hidden2,
            batch_first=True,
        )
        self.dropout    = nn.Dropout(dropout)
        self.classifier = nn.Linear(hidden2, num_classes)

    def forward(self, x):
        # x: (batch, n_frames, features)
        out, _ = self.lstm1(x)           # (batch, n_frames, hidden1)
        out, _ = self.lstm2(out)         # (batch, n_frames, hidden2)
        out     = out[:, -1, :]          # take only final timestep: (batch, hidden2)
        out     = self.dropout(out)
        logits  = self.classifier(out)   # (batch, num_classes)
        return logits
```

---

## 🛠 Tech Stack

*   **Frontend:** Next.js, React, TailwindCSS, Recharts.
*   **Local Backend:** Python, FastAPI, Uvicorn, OpenCV (Chunk creation and playback manager).
*   **Remote Processing (Kaggle):** Python, FastAPI, PyTorch, YOLOv8 (Tracking), MediaPipe (Pose), InsightFace (Face ID), Ngrok (Tunnels).

---

## 🏃‍♂️ Quick Start Guide

### 1. Remote Server Setup (Kaggle)
1. Open the remote Jupyter Notebook (`cbms-pipeline (4).ipynb`) in your Kaggle/Colab instance.
2. Add your **Ngrok Auth Token** into your Kaggle secrets or configuration.
3. Run all cells to initialize models and start the Uvicorn endpoint.
4. Note the generated `https://[SUBDOMAIN].ngrok-free.app` URL.

### 2. Local Backend
1. Create and activate a virtual environment:
   ```bash
   cd backend
   python -m venv venv
   # Windows:  .\venv\Scripts\activate
   # Mac/Linux: source venv/bin/activate
   ```
2. Install dependencies and run:
   ```bash
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

### 3. Local Frontend
1. Navigate into the frontend and install packages:
   ```bash
   cd frontend
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000/admin` in your browser.
4. Input the Ngrok URL into the Stream Control panel and hit **Run Stream**.

---

## 📸 Face Enrollment
To add an identity into the civic scoring database, use the enrollment endpoint (or run the equivalent face-enrollment notebook code locally):

```bash
curl -X POST http://localhost:8000/enroll \
  -F "name=TargetName" \
  -F "file=@/path/to/your/photo.jpg"
```


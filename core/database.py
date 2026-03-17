"""
SQLite setup and logging functions
"""
import sqlite3
from core.config import DB_PATH
import os

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            person_id TEXT,
            activity TEXT,
            score_delta INTEGER,
            evidence_path TEXT
        )
    ''')
    conn.commit()
    conn.close()

def log_activity(person_id, activity, score_delta, evidence_path):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO activity_logs (person_id, activity, score_delta, evidence_path)
        VALUES (?, ?, ?, ?)
    ''', (person_id, activity, score_delta, evidence_path))
    conn.commit()
    conn.close()
    print(f"[DB] Logged: {activity} by {person_id} (Score: {score_delta})")

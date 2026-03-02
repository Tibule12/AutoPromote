# Python Media Worker (Microservice)

## Purpose

This is a dedicated Python service for **Phase 1 (Smart Edits)** and **Phase 2 (AI Processing)**.

## Why Separate?

Node.js is great for I/O and orchestration, but Python is best for:

- Video Frame Analysis (OpenCV)
- Complex Audio Analysis (Librosa)
- Heavy AI Libraries (PyTorch, Whisper, TensorFlow)

## Setup (Local)

1. Install Python 3.10+
2. Run `pip install -r requirements.txt`
3. Start: `uvicorn main_media_server:app --reload`
4. Access Docs: `http://localhost:8000/docs`

## Features Implemented Phase 1

- `POST /smart-crop`: Automatically tracks faces to convert 16:9 -> 9:16 vertical video.
- `POST /remove-silence`: Uses Librosa to trim dead air (Better than FFmpeg alone).
- `POST /enhance-audio`: Normalizes and compresses vocal tracks.

## Deployment

Build with `docker build -t media-worker .` and deploy to Cloud Run or Render.
Use `PORT=8000`.

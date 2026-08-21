FROM python:3.10-slim

# Prevent prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive \
    PORT=8080 \
    WHISPER_ENGINE=faster \
    PROMO_WHISPER_MODEL=small \
    FASTER_WHISPER_DEVICE=cpu \
    FASTER_WHISPER_COMPUTE_TYPE=int8 \
    FASTER_WHISPER_STRICT=true \
    ALLOW_RUNTIME_DEPENDENCY_INSTALL=false

# Install system dependencies (For OpenCV + FFmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Cache only the production transcription engine. Bundling openai-whisper as a
# second fallback added PyTorch and a duplicate model, making this image over
# 4 GiB compressed.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# Copy source code
COPY . .

# Create the shared tmp directory used by main_media_server.py
RUN mkdir -p /tmp

# Cloud Run uses PORT env var (default 8080)
EXPOSE 8080

# Start server (Using shell form to expand $PORT variable)
CMD sh -c "uvicorn main_media_server:app --host 0.0.0.0 --port ${PORT:-8080}"

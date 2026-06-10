# Use official Python runtime
FROM python:3.10-slim

# Prevent prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies (For OpenCV + FFmpeg)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    git \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper "small" model during build to avoid cold-start delay (~1GB)
RUN python -c "import whisper; whisper.load_model('small')"

# Pre-cache faster-whisper too; production Premium captions must not depend on
# a live Hugging Face model lookup during user renders.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# Copy source code
COPY . .

# Create tmp directory for video processing
RUN mkdir -p /app/tmp

# Cloud Run uses PORT env var (default 8080)
ENV PORT=8080
EXPOSE 8080

# Start server (Using shell form to expand $PORT variable)
CMD sh -c "uvicorn main_media_server:app --host 0.0.0.0 --port ${PORT:-8080}"

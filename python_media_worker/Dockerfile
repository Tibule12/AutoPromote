# Use official Python runtime
FROM python:3.10-slim

# Install system dependencies (For OpenCV + FFmpeg)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port (FastAPI default)
EXPOSE 8000

# Start server (Using shell form to expand $PORT variable)
CMD sh -c "uvicorn main_media_server:app --host 0.0.0.0 --port ${PORT:-8000}"

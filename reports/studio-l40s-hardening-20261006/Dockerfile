FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 python3-pip ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --upgrade pip==24.3.1
RUN pip3 install --no-cache-dir faster-whisper==1.2.1 av==17.1.0 ctranslate2==4.6.0 fastapi==0.115.12 python-multipart==0.0.20 numpy==1.26.4 opencv-python-headless==4.11.0.86 Pillow==11.2.1 ffmpeg-python==0.2.0 firebase-admin==6.8.0 python-dotenv==1.1.0 requests==2.32.3 scipy==1.15.3
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,video
ENV FASTER_WHISPER_DEVICE=cuda FASTER_WHISPER_COMPUTE_TYPE=float16 FASTER_WHISPER_STRICT=true WHISPER_ENGINE=faster FASTER_WHISPER_VAD_FILTER=true
ENV HF_HOME=/work/models VIRAL_CAPTION_TRANSCRIPTION_PROVIDER=local
WORKDIR /work

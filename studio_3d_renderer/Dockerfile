FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends blender ffmpeg python3 python3-pip python3-venv ca-certificates libegl1 libgl1 libx11-6 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/renderer-venv
COPY requirements.txt /app/requirements.txt
RUN /opt/renderer-venv/bin/pip install --no-cache-dir -r /app/requirements.txt
COPY spec.py blender_scene.py render.py /app/
WORKDIR /app
ENV PATH=/opt/renderer-venv/bin:$PATH
ENTRYPOINT ["python3", "/app/render.py"]

@echo off
echo ==========================================
echo STOPPING ANY EXISTING PYTHON WORKERS...
taskkill /F /IM python.exe /T 2>nul
echo ==========================================
echo INSTALLING DEPENDENCIES...
pip install -r python_media_worker/requirements.txt
pip install python-dotenv uvicorn fastapi scenedetect openai-whisper yt-dlp firebase-admin
echo ==========================================
echo STARTING PRODUCTION MEDIA WORKER...
echo Python Worker will be available at http://localhost:8000
echo Ensure your Firebase Admin credentials are set up if uploading to cloud.
cd python_media_worker
python main_media_server.py
pause

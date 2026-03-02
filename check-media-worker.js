const axios = require('axios');
const fs = require('fs');

const MEDIA_WORKER_URL = process.env.MEDIA_WORKER_URL || "http://localhost:8000";

async function checkMediaWorker() {
    console.log(`Checking Media Worker at ${MEDIA_WORKER_URL}...`);
    
    // Check Root
    try {
        const response = await axios.get(`${MEDIA_WORKER_URL}/`);
        console.log("Media Worker Root Health:", response.data);
    } catch (error) {
        console.error("Media Worker Root Check Failed:", error.message);
    }

    // Try a dummy analysis
    try {
        console.log("Attempting dummy analysis...");
        const response = await axios.post(`${MEDIA_WORKER_URL}/analyze-clips`, {
            video_url: "https://storage.googleapis.com/test-bucket/test.mp4", // This will fail inside the worker, but route should match
            target_aspect_ratio: "9:16"
        });
        console.log("Analysis Result:", response.data);
    } catch (error) {
        // Expected failure if video doesn't exist, but check if it's connection error or 404 (Route not found)
        if (error.response) {
            console.log(`Analysis call responded with status: ${error.response.status}`);
            console.log("Response data:", error.response.data);
            if(error.response.status === 404) {
                 console.error("CRITICAL: The /analyze-clips endpoint is NOT found on the server.");
            }
        } else {
            console.log("Analysis call failed with network error:", error.message);
        }
    }
}

checkMediaWorker();
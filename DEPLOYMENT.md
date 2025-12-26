Render deployment instructions

- Build Command: npm --prefix frontend run build
- Publish Directory: frontend/build

Notes:

- Ensure your Render service runs the Build Command during deploy so `frontend/build/index.html` exists and the server can serve the SPA.
- If you prefer server-side verification, enable the GitHub Action `.github/workflows/verify-frontend-build.yml` which runs on push and verifies `frontend/build/index.html` exists after a successful build.
- For quick testing, you can build locally and upload the `frontend/build` directory contents to the host as a temporary workaround.

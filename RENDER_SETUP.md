# NavDeck — Render deployment guide

This package retains the existing React UI and FastAPI application. The Emergent AI Co-pilot is temporarily disabled (HTTP 503); new PDF reports are stored in MongoDB GridFS. It has not been live-tested on your Render account.

## Important: use this exact updated repository

The backend requirements file contains only the direct runtime dependencies. If Render's logs still mention `google-api-core`, `grpcio-status`, or `protobuf`, Render is building an **older commit** or the **wrong requirements.txt**. Check the deployed commit hash, root directory and build command before changing packages.

## A. Upload files to GitHub

Replace your GitHub repository contents with the contents of this ZIP (the files inside `navdeck-main/`, not the outer folder). Keep `backend/`, `frontend/`, and `render.yaml` at the repository root. Commit to the branch Render deploys (usually `main`). Do not upload any `.env` files or credentials.

## B. Backend — existing Render web service

- Root Directory: `backend`
- Runtime: Python
- Python version environment variable: `PYTHON_VERSION=3.11.11`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Instance type: Free (if available)

Set these environment variables in Render (never in GitHub):
- `MONGO_URL`: MongoDB Atlas connection URI
- `DB_NAME`: `navdeck`
- `CLERK_PUBLISHABLE_KEY`: your Clerk publishable key
- `CLERK_SECRET_KEY`: your Clerk secret key
- `CORS_ORIGINS`: your Render frontend URL, e.g. `https://navdeck-frontend.onrender.com` (no trailing slash)

Make sure MongoDB Atlas network access allows the Render service to connect, with a least-privilege database user. Rotate any database password that has been shared or exposed.

Deploy the latest commit with **Clear build cache & deploy**. Test `https://YOUR-BACKEND.onrender.com/health`; expected response: `{"status":"ok"}`. A successful health response does not by itself prove MongoDB or Clerk are configured correctly; test authenticated routes too.

## C. Frontend — Render static site

Create a **Static Site** from the same GitHub repository:
- Root Directory: `frontend`
- Build command: `npm install --legacy-peer-deps && npm run build`
- Publish directory: `build`
- Build-time environment variable: `REACT_APP_BACKEND_URL=https://YOUR-BACKEND.onrender.com` (no trailing slash)
- Rewrite route: `/*` to `/index.html` (required for React client-side routes)

Set backend `CORS_ORIGINS` to the actual frontend URL and redeploy the backend if it changes. React environment variables are baked into the static build, so rebuild the frontend after updating its backend URL.

## D. Alternative: Render Blueprint

`render.yaml` is included at repository root for creating both services via **New > Blueprint**. If you already have a backend service, do not create a duplicate by accident; configuring your existing backend plus a new static site manually is also fine.

## Limitations

- AI Co-pilot is disabled temporarily; other features remain in code but require testing with live services.
- New PDF reports are stored in MongoDB GridFS. Existing reports previously stored in Emergent's object store are not migrated.
- Friend-landing cron requires `WEBHOOK_CRON_SECRET` and a separate scheduler; Emergent cron settings do not run on Render automatically.
- Free Render services can spin down and have resource limits; MongoDB Atlas and Clerk have separate quotas.
- The desktop simulator bridge is a separate local application, not hosted on Render.

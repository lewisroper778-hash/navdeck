# NavDeck on Render

## Deployment
1. Upload this repository to GitHub. In Render, choose **New > Blueprint** and select the repository, or update your existing backend service and create a static site using the settings in `render.yaml`. Avoid creating duplicate backend services.
2. Set backend `MONGO_URL` (Atlas URI with URL-encoded credentials), `DB_NAME=navdeck`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CORS_ORIGINS=https://YOUR-FRONTEND.onrender.com` (no trailing slash). Set `PYTHON_VERSION=3.11.11`.
3. Configure MongoDB Atlas Network Access to permit Render outbound connections, and use a least-privilege database account. Rotate any previously shared passwords.
4. Set frontend **build-time** environment variable `REACT_APP_BACKEND_URL=https://YOUR-BACKEND.onrender.com` (no trailing slash). Trigger a frontend rebuild after changing this value.
5. Backend check: `https://YOUR-BACKEND.onrender.com/health` should return `{"status":"ok"}`. Then open frontend URL and test Clerk sign-in, flight creation, SimBrief, VATSIM and PDF generation.

## Notes
- AI Co-pilot endpoint temporarily returns HTTP 503; no Emergent API key required.
- New PDFs use MongoDB GridFS. PDFs stored in the old Emergent object store are **not migrated** and cannot be downloaded with this version. Back up/migrate them separately if needed.
- VATSIM friend landing cron requires `WEBHOOK_CRON_SECRET` and an external scheduler; it will not run automatically from the old `.emergent/crons.yml`.
- Render free services may sleep and have usage limits. MongoDB Atlas and Clerk have their own limits and configuration.
- This configuration is a deployment starting point, not proof that every external integration works. Check live Render logs and external service settings.

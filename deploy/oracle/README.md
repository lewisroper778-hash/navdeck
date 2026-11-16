# NAVDECK public hosting on the existing Oracle server

This deployment uses the **existing** Ubuntu ARM64 Oracle VM at
`132.145.69.94` and the already-working HTTPS hostname
`https://test.navdeck.online`. It replaces the Render/Atlas desktop
connection with the Oracle-hosted FastAPI service and its **local MongoDB**
container. It does not create a new database, expose port 27017, or remove
existing MongoDB data.

## 1. Check the Oracle server

SSH from your PC using your existing private key (never paste it into chat):

```bash
ssh ubuntu@132.145.69.94
cd /opt/navdeck/app
df -h /
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

The safe update requires at least **6 GB free disk space**. Expand the Oracle
boot volume first if needed; **do not** use `docker system prune --volumes`
or delete the `navdeck-mongodb-data` volume to free space.

Expected containers: `navdeck-backend`, `navdeck-frontend`,
`navdeck-mongodb`; expected Docker network: `navdeck-network`.
The script checks that the existing backend's Mongo URL references
`navdeck-mongodb` without printing any credentials.

## 2. Update the website and API together

After the production PR has been merged into `main`, run:

```bash
cd /opt/navdeck/app
git pull --ff-only origin main
sudo bash deploy/oracle/deploy.sh
```

The script builds ARM64-compatible Docker images, tests the new backend
against **your existing MongoDB** before touching the running site, checks
the Clerk API through the new frontend, then replaces the two application
containers. It preserves the MongoDB container and volume, existing Ollama
environment, host Nginx/Certbot setup, and keeps the previous application
containers as rollback backups. A failed post-deployment health check
restores the old containers.

The existing host Nginx continues proxying
`test.navdeck.online` to `127.0.0.1:8080`; the frontend Nginx serves the
React app and proxies `/api/` to `navdeck-backend:8000` over the private
Docker network.

## 3. Verify public access

```bash
curl -fsS https://test.navdeck.online/health/ready
curl -fsS https://test.navdeck.online/api/clerk/config
curl -I https://test.navdeck.online/desktop/connect
```

Readiness must report `"database":"connected"`; Clerk configuration must
report `"enabled":true`. The desktop handoff route must return the React
app, not a 404. **Do not publish secret keys or desktop tokens** when
sharing diagnostics.

Install the new Windows build from GitHub Releases, sign out of any
old Render-backed desktop session in NAVDECK Settings, then use
**Sign in with Clerk** again. Existing Render bridge tokens cannot be used
with the separate Oracle MongoDB. Any flight data stored only in Atlas
must be migrated deliberately before switching accounts; the deployment
script does not copy or delete Atlas data.

## 4. Make the main domain public (separate DNS cutover)

`test.navdeck.online` is already a public HTTPS endpoint. To make
`navdeck.online` and `www.navdeck.online` serve the same Oracle website,
the domain owner must first approve replacing the existing DNS destination.
Then update the DNS A records to `132.145.69.94`, add a separate host Nginx
server block proxying to `127.0.0.1:8080`, verify
`sudo nginx -t`, and issue the production certificates with
`sudo certbot --nginx -d navdeck.online -d www.navdeck.online`.
Keep `test.navdeck.online` as a supported alias for installed desktop
versions until a later Windows release changes its canonical origin.

Only expose ports 80/443 publicly. Keep MongoDB and backend ports private.
Never put the database password, Clerk secret or SSH private key in GitHub
or a browser bundle.

## Rollback

If the script detects a failed deployment it restores the previous
application containers automatically. For a later manual rollback, inspect
the stopped `navdeck-backend-backup-<timestamp>` and
`navdeck-frontend-backup-<timestamp>` containers; keep the MongoDB
container and its data volume running. Do not delete the backups until the
new website, Clerk sign-in, SimBrief import and desktop sync have been
verified.

## Operational notes

- Both application containers restart automatically after a VM reboot.
- The MongoDB volume remains persistent and private.
- Nginx/Certbot continue handling HTTPS and renewal on the Oracle VM.
- GitHub Releases provide the publicly downloadable Windows installer.
- The GitHub repository is the source of truth, but **server updates still
  require running the deployment script over SSH**. No SSH key or Oracle
  deployment permission is stored in this repository.
- Render may be disabled after confirming the Oracle service and any
  required data migration. It is not automatically deleted or migrated.

## EFB journey logs by email

NAVDECK EFB uploads each signed journey log (PDF) to `/api/efb/reports`. The backend emails it to
`inflightreports@navdeck.online`. The mail login stays on this server only.

### Easy setup (recommended)

```bash
ssh ubuntu@132.145.69.94
cd /opt/navdeck/app
git pull --ff-only origin main
sudo bash deploy/oracle/setup-email.sh
```

The script:
1. works out which company hosts the navdeck.online mailboxes and suggests its outgoing (SMTP) server,
2. asks for the mailbox password (hidden as you type) and sends a **test email** to
   inflightreports@navdeck.online, saving nothing unless that test succeeds,
3. saves the settings in `/opt/navdeck/email.env`, readable by root only,
4. lets the host Nginx accept journey-log uploads (`client_max_body_size 12m;`, with a backup and an
   automatic undo if Nginx rejects it), and
5. deploys NAVDECK the usual way and checks `https://test.navdeck.online/api/efb/reports/status`.

Run it again at any time to change the password or provider.

Tips: Google Workspace needs an **app password**; Microsoft 365 needs **Authenticated SMTP** switched on for the
mailbox. Email-forwarding services (for example Cloudflare Email Routing) cannot send mail; use the SMTP details of
a real mailbox or a sending service.

### Manual setup

`/opt/navdeck/email.env` (mode 600) holds:

```
EFB_SMTP_HOST=smtp.your-provider.com
EFB_SMTP_PORT=587
EFB_SMTP_SECURITY=starttls
EFB_SMTP_USER=inflightreports@navdeck.online
EFB_SMTP_PASSWORD=your-mailbox-or-app-password
EFB_REPORTS_TO=inflightreports@navdeck.online
```

Use port 465 with `EFB_SMTP_SECURITY=ssl` if your provider asks for SSL. Add `client_max_body_size 12m;` to the host
Nginx site for test.navdeck.online, reload Nginx, then run `sudo bash deploy/oracle/deploy.sh`.

Until this is set up, the EFB keeps each journey log in its outbox and sends it once the server accepts it.

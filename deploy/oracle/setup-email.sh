#!/usr/bin/env bash
# One-time setup so NAVDECK can email EFB journey logs to inflightreports@navdeck.online.
# Run on the Oracle server:  cd /opt/navdeck/app && git pull --ff-only origin main
#                            sudo bash deploy/oracle/setup-email.sh
# It asks for the mailbox password, sends a test email, saves the settings privately,
# lets Nginx accept journey-log uploads, and deploys. Safe to run again to change settings.
set -Eeuo pipefail

DOMAIN="navdeck.online"
REPORTS_TO="${REPORTS_TO:-inflightreports@navdeck.online}"
SITE_HOST="${SITE_HOST:-test.navdeck.online}"
ENV_FILE="${ENV_FILE:-/opt/navdeck/email.env}"
NGINX_DIRS="${NGINX_DIRS:-/etc/nginx/sites-enabled /etc/nginx/conf.d}"
APP_DIR="${APP_DIR:-/opt/navdeck/app}"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

if [[ ${EUID} -ne 0 && -z "${ALLOW_NON_ROOT:-}" ]]; then
  echo "Run with sudo: sudo bash deploy/oracle/setup-email.sh" >&2
  exit 1
fi
command -v python3 >/dev/null || fail "python3 is missing"

# ------------------------------------------------------------------ 1. which email provider?
bold "1/4  Finding the email provider for ${DOMAIN}"
mx=""
if command -v dig >/dev/null; then mx="$(dig +short MX "$DOMAIN" 2>/dev/null || true)"; fi
if [[ -z "$mx" ]] && command -v host >/dev/null; then mx="$(host -t mx "$DOMAIN" 2>/dev/null || true)"; fi
if [[ -z "$mx" ]] && command -v nslookup >/dev/null; then mx="$(nslookup -type=mx "$DOMAIN" 2>/dev/null || true)"; fi
mx="$(tr '[:upper:]' '[:lower:]' <<<"${MX_OVERRIDE:-$mx}")"

provider="your email provider" smtp_host="" smtp_port="587" security="starttls" tip=""
case "$mx" in
  *google.com*|*googlemail.com*)
    provider="Google Workspace" smtp_host="smtp.gmail.com"
    tip="Use an app password (Google Account > Security > 2-Step Verification > App passwords)." ;;
  *outlook.com*|*office365*|*microsoft*)
    provider="Microsoft 365" smtp_host="smtp.office365.com"
    tip="SMTP sending (Authenticated SMTP) must be switched on for this mailbox in the Microsoft 365 admin centre." ;;
  *zoho.eu*)
    provider="Zoho Mail (EU)" smtp_host="smtp.zoho.eu" smtp_port="465" security="ssl"
    tip="If 2-factor sign-in is on, create an app-specific password in Zoho." ;;
  *zoho*)
    provider="Zoho Mail" smtp_host="smtp.zoho.com" smtp_port="465" security="ssl"
    tip="If 2-factor sign-in is on, create an app-specific password in Zoho." ;;
  *privateemail.com*)
    provider="Namecheap Private Email" smtp_host="mail.privateemail.com" smtp_port="465" security="ssl" ;;
  *hostinger*)
    provider="Hostinger" smtp_host="smtp.hostinger.com" smtp_port="465" security="ssl" ;;
  *ionos*|*1and1*)
    provider="IONOS" smtp_host="smtp.ionos.co.uk" ;;
  *mx.cloudflare.net*|*improvmx*|*forwardemail*)
    provider="an email forwarding service"
    tip="Forwarding services usually cannot SEND email. Enter the outgoing (SMTP) server of the mailbox you send from, or of a sending service such as Brevo, Mailgun or Amazon SES." ;;
esac
if [[ -n "$mx" ]]; then ok "Mail for ${DOMAIN} is handled by ${provider}"; else warn "Could not look up the mail servers for ${DOMAIN}"; fi
[[ -n "$tip" ]] && warn "$tip"

# ------------------------------------------------------------------ 2. settings and test email
bold "2/4  Outgoing mail settings (press Enter to keep the suggestion in brackets)"
current() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
d_host="$(current EFB_SMTP_HOST)"; d_host="${d_host:-${smtp_host:-smtp.example.com}}"
d_port="$(current EFB_SMTP_PORT)"; d_port="${d_port:-$smtp_port}"
d_security="$(current EFB_SMTP_SECURITY)"; d_security="${d_security:-$security}"
d_user="$(current EFB_SMTP_USER)"; d_user="${d_user:-$REPORTS_TO}"

ask() {  # ask VAR "Question" "default"
  local answer=""
  read -r -p "  $2 [${3}]: " answer || true
  printf -v "$1" '%s' "${answer:-$3}"
}
sent=0
for attempt in 1 2 3; do
  ask SMTP_HOST "SMTP server" "$d_host"
  ask SMTP_PORT "Port (587 or 465)" "$d_port"
  [[ "$SMTP_PORT" == "465" && "$d_security" == "starttls" ]] && d_security="ssl"
  ask SMTP_SECURITY "Encryption (starttls, ssl or none)" "$d_security"
  ask SMTP_USER "Mailbox to send from" "$d_user"
  d_host="$SMTP_HOST" d_port="$SMTP_PORT" d_security="$SMTP_SECURITY" d_user="$SMTP_USER"
  SMTP_PASSWORD=""
  read -r -s -p "  Password for ${SMTP_USER} (hidden): " SMTP_PASSWORD || true; echo
  if [[ -z "$SMTP_PASSWORD" ]]; then
    warn "The password cannot be empty."
    continue
  fi

  echo "  Sending a test email to ${REPORTS_TO}..."
  if EFB_SMTP_HOST="$SMTP_HOST" EFB_SMTP_PORT="$SMTP_PORT" EFB_SMTP_SECURITY="$SMTP_SECURITY" \
     EFB_SMTP_USER="$SMTP_USER" EFB_SMTP_PASSWORD="$SMTP_PASSWORD" EFB_REPORTS_TO="$REPORTS_TO" \
     python3 - <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage
from email.utils import formataddr, formatdate
host, port, security = os.environ["EFB_SMTP_HOST"], int(os.environ["EFB_SMTP_PORT"]), os.environ["EFB_SMTP_SECURITY"].lower()
user, password, to = os.environ["EFB_SMTP_USER"], os.environ["EFB_SMTP_PASSWORD"], os.environ["EFB_REPORTS_TO"]
msg = EmailMessage()
msg["Subject"] = "NAVDECK EFB test: journey log email is working"
msg["From"] = formataddr(("NAVDECK EFB", user))
msg["To"] = to
msg["Date"] = formatdate()
msg.set_content("This is a test from the NAVDECK server.\nSigned journey logs from NAVDECK EFB will arrive at this address as PDF attachments.\n")
try:
    context = ssl.create_default_context()
    server = smtplib.SMTP_SSL(host, port, context=context, timeout=30) if security == "ssl" else smtplib.SMTP(host, port, timeout=30)
    with server:
        if security == "starttls":
            server.starttls(context=context)
        server.login(user, password)
        server.send_message(msg)
except smtplib.SMTPAuthenticationError:
    print("    The mail server rejected the user name or password.", file=sys.stderr); sys.exit(2)
except Exception as e:
    print(f"    Could not send: {type(e).__name__}: {e}", file=sys.stderr); sys.exit(3)
PY
  then
    ok "Test email sent to ${REPORTS_TO}. Check that inbox (and its spam folder)."
    sent=1
    break
  fi
  [[ $attempt -lt 3 ]] && warn "Let's try again."
done
[[ $sent -eq 1 ]] || fail "The test email could not be sent, so nothing was changed. Check the settings with your email provider and run this again."

umask 077
mkdir -p "$(dirname "$ENV_FILE")"
cat > "$ENV_FILE.tmp" <<EOF
EFB_SMTP_HOST=${SMTP_HOST}
EFB_SMTP_PORT=${SMTP_PORT}
EFB_SMTP_SECURITY=${SMTP_SECURITY}
EFB_SMTP_USER=${SMTP_USER}
EFB_SMTP_PASSWORD=${SMTP_PASSWORD}
EFB_REPORTS_TO=${REPORTS_TO}
EOF
chmod 600 "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
ok "Settings saved privately in ${ENV_FILE} (only root can read it)"

# ------------------------------------------------------------------ 3. let Nginx accept journey-log uploads
bold "3/4  Allowing journey-log uploads (up to 12 MB) in Nginx"
site=""
for dir in $NGINX_DIRS; do
  [[ -d "$dir" ]] || continue
  site="$(grep -rlE "server_name[^;]*${SITE_HOST//./\\.}" "$dir" 2>/dev/null | head -1 || true)"
  [[ -n "$site" ]] && break
done
if [[ -z "$site" ]]; then
  warn "No Nginx site for ${SITE_HOST} was found. If uploads fail, add 'client_max_body_size 12m;' to its server block."
elif grep -q "client_max_body_size" "$site"; then
  ok "Upload size is already set in ${site}"
else
  real="$(readlink -f "$site")"
  backup="/root/nginx-$(basename "$real")-$(date -u +%Y%m%dT%H%M%SZ).bak"
  cp -p "$real" "$backup"
  sed -i -E "/server_name[^;]*${SITE_HOST//./\\.}[^;]*;/a\\    client_max_body_size 12m;" "$real"
  if command -v nginx >/dev/null && ! nginx -t >/dev/null 2>&1; then
    cp -p "$backup" "$real"
    warn "Nginx did not accept the change, so it was undone. Add 'client_max_body_size 12m;' to the ${SITE_HOST} server block by hand."
  else
    if command -v systemctl >/dev/null; then systemctl reload nginx 2>/dev/null || true; fi
    ok "Nginx updated and reloaded (backup: ${backup})"
  fi
fi

# ------------------------------------------------------------------ 4. deploy
bold "4/4  Deploying NAVDECK with the new settings"
if [[ -n "${SKIP_DEPLOY:-}" ]]; then
  warn "Skipped (SKIP_DEPLOY is set)."
elif [[ ! -f "$APP_DIR/backend/efb_reports.py" ]]; then
  warn "This copy of NAVDECK does not include journey-log email yet. Run: cd $APP_DIR && git pull --ff-only origin main, then this script again."
else
  answer=""
  read -r -p "  Deploy now? This rebuilds and restarts NAVDECK the usual way. [Y/n]: " answer || true
  if [[ ! "$answer" =~ ^[Nn] ]]; then
    bash "$APP_DIR/deploy/oracle/deploy.sh"
    status="$(curl -fsS "https://${SITE_HOST}/api/efb/reports/status" 2>/dev/null || true)"
    if [[ "$status" == *'"configured":true'* ]]; then
      ok "Done. Journey logs are now emailed to ${REPORTS_TO}."
    else
      warn "Deployed, but https://${SITE_HOST}/api/efb/reports/status did not answer as expected: ${status:-no reply}"
    fi
  else
    warn "Not deployed. When ready: sudo bash $APP_DIR/deploy/oracle/deploy.sh"
  fi
fi

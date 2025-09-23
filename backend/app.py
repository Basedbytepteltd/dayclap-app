from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from supabase import create_client, Client
import os
import sys
from functools import wraps
from typing import Optional, Tuple
from datetime import datetime, timezone, timedelta, date as dt_date
from dotenv import load_dotenv
import requests
import json
import re
import html
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from pywebpush import webpush, WebPushException

# -----------------------------------------------------------------------------
# App + Supabase setup
# -----------------------------------------------------------------------------
app = Flask(__name__)

load_dotenv()  # Load .env variables

# Explicit CORS configuration to allow admin dashboard calls from production domains
# Comma-separated exact origins
ALLOWED_ORIGINS = [
  o.strip() for o in (
    os.environ.get("CORS_ALLOW_ORIGINS")
    or "https://dayclap.com,https://www.dayclap.com,https://dayclap-app.vercel.app,https://dayclap30.vercel.app,http://localhost:5173"
  ).split(",")
  if o.strip()
]

# Comma-separated regex patterns (e.g., https://.*\.vercel\.app)
RAW_ORIGIN_REGEX = [p.strip() for p in (os.environ.get("CORS_ALLOW_ORIGIN_REGEX") or "").split(",") if p.strip()]
# Provide a sensible default regex to cover preview deployments if none was set
if not RAW_ORIGIN_REGEX:
  RAW_ORIGIN_REGEX = ["https://.*\.vercel\.app"] # Corrected: Single backslash for literal dot

# Compile regexes for internal checks
ALLOWED_ORIGIN_REGEX = []
for pattern in RAW_ORIGIN_REGEX:
  try:
    ALLOWED_ORIGIN_REGEX.append(re.compile(pattern))
  except re.error:
    print(f"WARNING: Invalid CORS regex skipped: {pattern}", file=sys.stderr)

# Whether to allow credentials (cookies/auth headers). Keep false by default.
CORS_ALLOW_CREDENTIALS = (os.environ.get("CORS_ALLOW_CREDENTIALS", "false").lower() == "true")

# Use Flask-CORS for /api/*, feeding both exact origins and regex patterns (as strings)
CORS(
  app,
  resources={r"/api/*": {"origins": ALLOWED_ORIGINS + RAW_ORIGIN_REGEX}},
  supports_credentials=CORS_ALLOW_CREDENTIALS,
  methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allow_headers=["Content-Type", "Authorization", "X-User-Email", "X-API-Key"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
INVITE_COOLDOWN_SECONDS = int(os.environ.get("INVITE_COOLDOWN_SECONDS", "300") or 300)
BACKEND_API_KEY = os.environ.get("BACKEND_API_KEY")  # For internal API calls (e.g., Supabase triggers)
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VITE_FRONTEND_URL = os.environ.get("VITE_FRONTEND_URL", "http://localhost:5173")  # For links in emails

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
  print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.", file=sys.stderr)

supabase: Optional[Client] = None
try:
  supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY else None
except Exception as e:
  print(f"ERROR: Failed to create Supabase client: {e}", file=sys.stderr)
  supabase = None

# VAPID claims for push notifications (subject should be a contact URI)
VAPID_CLAIMS = {"sub": f"mailto:{os.environ.get('VAPID_EMAIL', 'admin@example.com')}"}

# -----------------------------------------------------------------------------
# Preflight handler (guarantee a response for all /api/* OPTIONS)
# -----------------------------------------------------------------------------
@app.before_request
def handle_preflight():
  if request.method == "OPTIONS" and request.path.startswith("/api/"):
    # Empty 204; headers will be attached by after_request
    return ("", 204)

# -----------------------------------------------------------------------------
# Global CORS headers for all responses (including errors)
# This ensures CORS headers are always present and echo requested headers.
# REMOVED: The custom @app.after_request for CORS is removed.
# Flask-CORS handles Access-Control-Allow-Origin, Methods, and Headers.
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def parse_bearer_token(req) -> Optional[str]:
  """
  Extracts the Bearer token from Authorization header.
  """
  auth = req.headers.get("Authorization", "")
  if not auth.lower().startswith("bearer "):
    return None
  return auth.split(" ", 1)[1].strip() or None


def get_user_from_token(token: str) -> Tuple[Optional[str], Optional[str], Optional[dict]]:
  """
  Uses Supabase to get user from access token.
  Returns (user_id, email, raw_user_obj)
  """
  if not supabase:
    return None, None, None
  try:
    res = supabase.auth.get_user(token)
    user = getattr(res, "user", None) or (res.get("user") if isinstance(res, dict) else None)
    if not user:
      return None, None, None

    uid = getattr(user, "id", None) or user.get("id")
    email = getattr(user, "email", None) or user.get("email")
    return uid, email, user
  except Exception as e:
    print(f"get_user_from_token error: {e}", file=sys.stderr)
    return None, None, None

def _get_allowed_admin_emails() -> set:
  """
  Returns a set of allowed admin emails (lowercased) from ADMIN_EMAILS env.
  Defaults to {'admin@example.com'} if unset/empty.
  """
  raw = os.environ.get("ADMIN_EMAILS", "")
  emails = {e.strip().lower() for e in raw.split(",") if e and e.strip()}
  if not emails:
    emails = {"admin@example.com"}
  return emails


def require_auth(fn):
  @wraps(fn)
  def wrapper(*args, **kwargs):
    if request.method == "OPTIONS":  # Preflight: return early with 204, CORS will add headers
      return ("", 204)
    token = parse_bearer_token(request)
    if not token:
      return jsonify({"message": "Missing or invalid Authorization header"}), 401
    uid, email, raw = get_user_from_token(token)
    if not uid:
      return jsonify({"message": "Invalid or expired token"}), 401
    request._auth = {"id": uid, "email": email, "raw": raw, "token": token}
    return fn(*args, **kwargs)
  return wrapper

def require_api_key(fn):
  @wraps(fn)
  def wrapper(*args, **kwargs):
    if request.method == "OPTIONS":  # Preflight: return early with 204, CORS will add headers
      return ("", 204)
    api_key = request.headers.get("X-API-Key")
    if not api_key or api_key != BACKEND_API_KEY:
      return jsonify({"message": "Unauthorized: Invalid API Key"}), 401
    return fn(*args, **kwargs)
  return wrapper

def require_admin_email(fn):
  @wraps(fn)
  def wrapper(*args, **kwargs):
    if request.method == "OPTIONS":  # Preflight: return early with 204, CORS will add headers
      return ("", 204)

    allowed = _get_allowed_admin_emails()

    # 1) Prefer explicit X-User-Email header
    hdr_email = (request.headers.get("X-User-Email") or "").strip().lower()
    if hdr_email and hdr_email in allowed:
      return fn(*args, **kwargs)

    # 2) Fallback to Supabase Bearer token to derive email
    token = parse_bearer_token(request)
    if token:
      uid, email, raw = get_user_from_token(token)
      if email and email.strip().lower() in allowed:
        request._auth = {"id": uid, "email": email, "raw": raw, "token": token}
        return fn(*args, **kwargs)

    return jsonify({"message": "Forbidden: Admin access required"}), 403
  return wrapper


def user_role_for_company(user_profile: dict, company_id: str) -> Optional[str]:
  """
  Given a profiles row (JSON) and a company_id, return the user's role within that company (lowercased),
  or None if not a member.
  Expects 'companies' to be an array of objects: [{ id, name, role, createdAt }, ...]
  """
  if not user_profile or not company_id:
    return None
  companies = user_profile.get("companies", [])
  if not isinstance(companies, list):
    return None
  for c in companies:
    if isinstance(c, dict) and str(c.get("id")) == str(company_id):
      role = (c.get("role") or "").lower()
      return role
  return None


def is_owner_or_admin(role: Optional[str]) -> bool:
  return role in ("owner", "admin")


def fetch_profile(user_id: str) -> Optional[dict]:
  """
  Fetches the profiles row for a given user_id.
  """
  if not supabase:
    return None
  try:
    resp = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    data = getattr(resp, "data", None) or (resp.get("data") if isinstance(resp, dict) else None)
    if isinstance(data, list) and data:
      data = data[0]
    return data or None
  except Exception as e:
    print(f"fetch_profile error: {e}", file=sys.stderr)
    return None

def _utcnow_iso() -> str:
  try:
    return datetime.now(timezone.utc).isoformat()
  except Exception:
    return ""

def _parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
  if not dt_str:
    return None
  try:
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
  except Exception:
    return None

def _render_template(html_content: str, context: dict) -> str:
  rendered_content = html_content
  # Simple variable replacement for {{ key }}
  for key, value in context.items():
    rendered_content = rendered_content.replace(f"{{{{ {key} }}}}", str(value or ''))

  # Basic conditional replacement for {{#if var}}...{{/if}}
  for key, value in context.items():
    # Regex to find {{#if key}}...{{/if}} blocks
    # We need to escape the key for regex, and also the curly braces
    if_block_regex = re.compile(
      r'\{\{\s*#if\s+' + re.escape(key) + r'\s*\}\}(.*?)\{\{\s*/if\s*\}\}', # Corrected: Removed double backslashes
      re.DOTALL
    )
    if not value:  # If the variable is falsy, remove the block
      rendered_content = if_block_regex.sub('', rendered_content)
    else:  # If the variable is truthy, remove the {{#if}} and {{/if}} tags, keeping content
      rendered_content = if_block_regex.sub(r'\1', rendered_content) # Corrected: Single backslash for backreference
  return rendered_content

def _to_datetime_any(val: Optional[object]) -> Optional[datetime]:
  """
  Convert various date-like values to a datetime for formatting.
  Accepts: datetime, date, ISO string 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS'.
  """
  if val is None:
    return None
  try:
    if isinstance(val, datetime):
      return val
    if isinstance(val, dt_date):
      # Make a naive datetime (date only) for display
      return datetime(val.year, val.month, val.day)
    if isinstance(val, str):
      # Accepts 'YYYY-MM-DD' and full ISO datetimes
      return datetime.fromisoformat(val.replace("Z", "+00:00"))
  except Exception as e:
    print(f"_to_datetime_any: failed to parse date '{val}': {e}", file=sys.stderr)
    return None

def _fmt_event_date_display(val: Optional[object]) -> str:
  """
  Format event date for emails safely as 'Month DD, YYYY'.
  """
  d = _to_datetime_any(val)
  if not d:
    # Fallback to raw string if provided
    return str(val or "")
  try:
    return d.strftime("%B %d, %Y")
  except Exception:
    return str(val or "")

def _ensure_list_event_tasks(raw) -> list:
  """
  Ensure event_tasks is a list. Accepts list or JSON string representations.
  """
  if isinstance(raw, list):
    return raw
  if isinstance(raw, str):
    try:
      val = json.loads(raw)
      if isinstance(val, list):
        return val
    except Exception as e:
      print(f"_ensure_list_event_tasks: failed to json.loads tasks: {e}", file=sys.stderr)
  return []

def _get_email_settings() -> Optional[dict]:
  """
  Fetch email settings from DB (if available) and transparently fall back to environment variables
  for any missing values. This ensures email sending works even before UI saves settings.
  """
  db_settings = None
  if supabase:
    try:
      resp = supabase.table("email_settings").select("*").limit(1).single().execute()
      db_settings = resp.data
    except Exception as e:
      print(f"ERROR: Failed to fetch email settings from DB: {e}", file=sys.stderr)

  settings = dict(db_settings or {})

  # Transparent ENV fallbacks
  env_api_key = os.environ.get("MAILEROO_API_KEY")
  env_endpoint = os.environ.get("MAILEROO_API_ENDPOINT")
  env_sender = os.environ.get("MAIL_DEFAULT_SENDER")

  if not settings.get("maileroo_sending_key") and env_api_key:
    settings["maileroo_sending_key"] = env_api_key

  if not settings.get("maileroo_api_endpoint"):
    settings["maileroo_api_endpoint"] = env_endpoint or "https://smtp.maileroo.com/api/v2"
  if not settings.get("mail_default_sender") and env_sender:
    settings["mail_default_sender"] = env_sender

  # Scheduler-related sensible defaults
  if settings.get("scheduler_enabled") is None:
    env_sched = os.environ.get("SCHEDULER_ENABLED")
    settings["scheduler_enabled"] = (env_sched.lower() == "true") if isinstance(env_sched, str) else True

  if not settings.get("reminder_time"):
    settings["reminder_time"] = os.environ.get("REMINDER_TIME", "02:00")

  # If still empty overall, return None to signal unusable config
  if not any([settings.get("maileroo_sending_key"), settings.get("mail_default_sender"), settings.get("maileroo_api_endpoint")]):
    return None

  return settings

def _get_email_template(template_name: str) -> Optional[dict]:
  if not supabase:
    print(f"ERROR: Supabase client not configured for _get_email_template('{template_name}').", file=sys.stderr)
    return None
  try:
    resp = supabase.table("email_templates").select("*").eq("name", template_name).single().execute()
    return resp.data
  except Exception as e:
    print(f"ERROR: Failed to fetch email template '{template_name}' from DB: {e}", file=sys.stderr)
    return None

def _html_to_text(html_content: str) -> str:
  """
  Very basic HTML-to-text fallback for providers that require a text part.
  Strips tags, scripts/styles, unescapes entities, collapses whitespace.
  """
  try:
    # Remove script/style blocks
    txt = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', html_content or '')
    # Strip remaining tags
    txt = re.sub(r'(?s)<[^>]+>', ' ', txt)
    # Unescape HTML entities
    txt = html.unescape(txt)
    # Collapse whitespace
    txt = re.sub(r'\s+', ' ', txt).strip()
    # Limit to a reasonable length
    return txt[:10000]
  except Exception:
    return ""

def _resolved_maileroo_send_url(settings: dict) -> str:
  """
  Resolve final Maileroo send endpoint.
  Appends '/email' to the base endpoint provided in settings/environment.
  """
  base_endpoint = (settings.get("maileroo_api_endpoint") or "https://smtp.maileroo.com/api/v2").strip()
  # Ensure base_endpoint does not end with a slash before appending /email
  if base_endpoint.endswith('/'):
      base_endpoint = base_endpoint.rstrip('/')
  return f"{base_endpoint}/email"

def _send_email_via_maileroo(recipient_email: str, subject: str, html_content: str, sender_email: Optional[str] = None) -> bool:
  settings = _get_email_settings()
  if not settings:
    print("ERROR: Maileroo: Email settings not found in DB and no usable ENV fallback.", file=sys.stderr)
    return False

  maileroo_api_key = settings.get("maileroo_sending_key")
  base_or_full_endpoint = settings.get("maileroo_api_endpoint")
  default_sender = settings.get("mail_default_sender")

  if not maileroo_api_key:
    print("ERROR: Maileroo: Missing API key in settings or ENV.", file=sys.stderr)
    return False
  if not base_or_full_endpoint:
    print("ERROR: Maileroo: Missing API endpoint in settings or ENV.", file=sys.stderr)
    return False
  if not default_sender and not sender_email:
    print("ERROR: Maileroo: Missing default sender in settings or ENV.", file=sys.stderr)
    return False

  final_sender = sender_email if sender_email else default_sender
  send_url = _resolved_maileroo_send_url(settings)

  # Build payload in v2 shape
  payload = {
    "from": final_sender,
    "to": [recipient_email],
    "subject": subject or "",
    "html": html_content or "",
    "text": _html_to_text(html_content or ""),
  }

  try:
    # NEW DIAGNOSTIC PRINTS
    print(f"Maileroo DIAG: Final send_url: {send_url}", file=sys.stderr)
    print(f"Maileroo DIAG: Payload: {json.dumps(payload, indent=2)}", file=sys.stderr)
    if maileroo_api_key and len(maileroo_api_key) > 8:
        print(f"Maileroo DIAG: X-API-Key (masked): {maileroo_api_key[:4]}...{maileroo_api_key[-4:]}", file=sys.stderr)
    else:
        print(f"Maileroo DIAG: X-API-Key (masked): {maileroo_api_key}", file=sys.stderr)

    print(f"Maileroo: POST {send_url} (base: {base_or_full_endpoint})", file=sys.stderr)
    response = requests.post(
      send_url,
      headers={
        "Content-Type": "application/json",
        "X-API-Key": maileroo_api_key,
      },
      json=payload,
      timeout=15
    )

    status = response.status_code
    body_text = ""
    try:
      body_text = response.text
    except Exception:
      body_text = "<non-textual response>"

    # Log status and first 600 chars of response for diagnostics
    snippet = body_text[:600] if body_text else ""
    print(f"Maileroo: status={status}; resp_snippet={snippet}", file=sys.stderr)

    # Require success true in provider JSON when present
    try:
      data = response.json()
    except ValueError:
      data = None

    if 200 <= status < 300:
      if isinstance(data, dict):
        success_flag = data.get("success")
        if success_flag is True:
          return True
        # If provider didn't include a success flag, treat as failure per stricter policy
        print("Maileroo: 2xx without success:true in JSON; treating as failure for debugging.", file=sys.stderr)
        return False
      else:
        print("Maileroo: 2xx but response not JSON; treating as failure for debugging.", file=sys.stderr)
        return False
    else:
      print(f"ERROR: Maileroo non-2xx ({status}).", file=sys.stderr)
      return False

  except requests.exceptions.RequestException as e:
    print(f"ERROR: Maileroo: Request error while sending to {recipient_email}: {e}", file=sys.stderr)
    try:
      if getattr(e, "response", None) is not None:
        print(f"Maileroo Error Response: {e.response.text}", file=sys.stderr)
    except Exception:
      pass
    return False
  except Exception as e:
    print(f"ERROR: Maileroo: Unexpected error: {e}", file=sys.stderr)
    return False

def _send_push_notification(subscription_info: dict, title: str, body: str, url: str = VITE_FRONTEND_URL) -> bool:
  # Only private key is required to sign VAPID; public key is used by client to subscribe
  if not VAPID_PRIVATE_KEY:
    print("VAPID private key not configured for push notifications.", file=sys.stderr)
    return False
  try:
    payload = json.dumps({
      "title": title,
      "body": body,
      "url": url,
      "icon": f"{VITE_FRONTEND_URL}/favicon.svg",
      "badge": f"{VITE_FRONTEND_URL}/favicon.svg",
    })
    webpush(
      subscription_info=subscription_info,
      data=payload,
      vapid_private_key=VAPID_PRIVATE_KEY,
      vapid_claims=VAPID_CLAIMS
    )
    print(f"Push notification sent to {subscription_info.get('endpoint')}", file=sys.stderr)
    return True
  except WebPushException as e:
    print(f"Push notification failed: {e}", file=sys.stderr)
    # Some providers include response with status_code (e.g., 410 Gone)
    try:
      if e.response is not None and hasattr(e.response, "status_code") and e.response.status_code == 410:
        print("Subscription is no longer valid (410 Gone). Should remove from DB.", file=sys.stderr)
    except Exception:
      pass
    return False
  except Exception as e:
    print(f"An unexpected error occurred while sending push notification: {e}", file=sys.stderr)
    return False

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health():
  return jsonify({"ok": True, "service": "dayclap-backend"}), 200


@app.post("/api/subscribe-push")
@require_auth
def subscribe_push():
  """
  Save a push subscription for the authenticated user.
  Body: Web Push subscription JSON
  Behavior: sets profiles.push_subscription and notifications.push = true (if column exists)
  """
  if not supabase:
    return jsonify({"message": "Supabase client not configured"}), 500

  body = request.get_json(force=True, silent=True) or {}
  uid = request._auth["id"]

  updates = {
    "push_subscription": body,
    "last_activity_at": _utcnow_iso(),
  }

  profile = fetch_profile(uid)
  if profile and isinstance(profile.get("notifications"), dict):
    notif = dict(profile.get("notifications") or {}) # Corrected: Removed extraneous backslash
    notif["push"] = True
    updates["notifications"] = notif

  try:
    supabase.table("profiles").update(updates).eq("id", uid).execute()
    return jsonify({"message": "Subscription saved"}), 200
  except Exception as e:
    print(f"subscribe_push update error: {e}", file=sys.stderr)
    return jsonify({"message": "Subscription accepted"}), 200


@app.post("/api/unsubscribe-push")
@require_auth
def unsubscribe_push():
  """
  Remove a push subscription for the authenticated user.
  Body: { endpoint?: string }
  Behavior: sets profiles.push_subscription = null and notifications.push = false (best-effort)
  """
  if not supabase:
    return jsonify({"message": "Supabase client not configured"}), 500

  uid = request._auth["id"]

  updates = {
    "push_subscription": None,
    "last_activity_at": _utcnow_iso(),
  }

  profile = fetch_profile(uid)
  if profile and isinstance(profile.get("notifications"), dict):
    notif = dict(profile.get("notifications") or {}) # Corrected: Removed extraneous backslash
    notif["push"] = False
    updates["notifications"] = notif

  try:
    supabase.table("profiles").update(updates).eq("id", uid).execute()
    return jsonify({"message": "Subscription disabled"}), 200
  except Exception as e:
    print(f"unsubscribe_push update error: {e}", file=sys.stderr)
    return jsonify({"message": "Subscription disabled"}), 500


@app.post("/api/send-invitation")
@require_auth
def send_invitation():
  """
  Sends (records) an invitation to join a company.
  Security:
    - Requires Authorization: Bearer <token>
    - Derives sender_id and sender_email from token (ignores any spoofed fields)
    - Verifies that the sender has role owner/admin for company_id
  Body JSON:
    {
      "recipient_email": "member@example.com",   (required)
      "company_id": "uuid-or-string",           (required)
      "company_name": "Company Name",           (required)
      "role": "user" | "admin"                  (optional, defaults to "user")
    }
  Cooldown:
    - Enforces a cooldown between identical invitations (same sender, recipient, and company).
    - Duration is configured via INVITE_COOLDOS_SECONDS (default: 300).
    - Returns 429 with Retry-After header and JSON body if within cooldown.
  """
  if not supabase:
    return jsonify({"message": "Supabase client not configured"}), 500

  body = request.get_json(force=True, silent=True) or {}
  recipient = (body.get("recipient_email") or "").strip().lower()
  company_id = str(body.get("company_id") or "").strip()
  company_name = (body.get("company_name") or "").strip()
  role = (body.get("role") or "user").strip().lower()
  if role not in ("user", "admin"):
    role = "user"

  if not recipient or not company_id or not company_name:
    return jsonify({"message": "recipient_email, company_id and company_name are required"}), 400

  sender_id = request._auth["id"]
  sender_email = request._auth["email"]

  profile = fetch_profile(sender_id)
  sender_role = user_role_for_company(profile or {}, company_id)
  if not is_owner_or_admin(sender_role):
    return jsonify({"message": "Forbidden: only owner/admin can send invitations for this company"}), 403

  # Cooldown check for duplicate invitation (same sender -> recipient for same company)
  try:
    last_resp = (
      supabase.table("invitations")
      .select("id, created_at")
      .eq("sender_id", sender_id)
      .eq("recipient_email", recipient)
      .eq("company_id", company_id)
      .order("created_at", desc=True)
      .limit(1)
      .execute()
    )
    last_data = getattr(last_resp, "data", None) or (last_resp.get("data") if isinstance(last_resp, dict) else None)
    if isinstance(last_data, list) and len(last_data) > 0:
      last_inv = last_data[0]
      last_created_at = _parse_iso(last_inv.get("created_at"))
      now = datetime.now(timezone.utc)
      if last_created_at:
        elapsed = (now - last_created_at).total_seconds()
        if elapsed < INVITE_COOLDOWN_SECONDS:
          remaining = int(INVITE_COOLDOWN_SECONDS - elapsed)
          next_allowed = (now + timedelta(seconds=remaining)).isoformat()
          resp = jsonify({
            "message": "Please wait before sending another invite to this person for this company.",
            "retry_after_seconds": remaining,
            "next_allowed_at": next_allowed
          })
          resp.headers["Retry-After"] = str(remaining)
          return resp, 429
  except Exception as e:
    print(f"Cooldown check error: {e}", file=sys.stderr)

  payload = {
    "sender_id": sender_id,
    "sender_email": sender_email,
    "recipient_email": recipient,
    "company_id": company_id,
    "company_name": company_name,
    "role": role,
    "status": "pending",
  }

  try:
    supabase.table("invitations").insert(payload).execute()

    # Send invitation email
    template = _get_email_template("invitation_to_company")
    if template:
      context = {
        "sender_email": sender_email,
        "company_name": company_name,
        "role": role.capitalize(),
        "current_year": datetime.now().year,
        "frontend_url": VITE_FRONTEND_URL,
      }
      rendered_html = _render_template(template["html_content"], context)
      _send_email_via_maileroo(recipient, template["subject"], rendered_html, sender_email)
    else:
      print("Warning: 'invitation_to_company' email template not found.", file=sys.stderr)

    return jsonify({
      "message": "Invitation sent",
      "cooldown_seconds": INVITE_COOLDOWN_SECONDS
    }), 202
  except Exception as e:
    print(f"send_invitation insert/email error: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to send invitation"}), 500


@app.post("/api/notify-task-assigned")
def notify_task_assigned():
  """
  This endpoint is called by the frontend when a task is assigned.
  It should trigger an email notification to the assignee.
  """
  body = request.get_json(force=True, silent=True) or {}
  assigned_to_email = (body.get("assigned_to_email") or "").strip().lower()
  assigned_to_name = (body.get("assigned_to_name") or "there").strip()
  assigned_by_name = (body.get("assigned_by_name") or "Someone").strip()
  assigned_by_email = (body.get("assigned_by_email") or "").strip()
  event_title = (body.get("event_title") or "an event").strip()
  event_date = (body.get("event_date") or "").strip()
  event_time = (body.get("event_time") or "").strip()
  company_name = (body.get("company_name") or "").strip()
  task_title = (body.get("task_title") or "a task").strip()
  task_description = (body.get("task_description") or "").strip()
  due_date = (body.get("due_date") or "").strip()

  if not assigned_to_email or not task_title:
    return jsonify({"message": "Missing required fields for task notification"}), 400

  template = _get_email_template("task_assigned")
  if not template:
    print("Warning: 'task_assigned' email template not found.", file=sys.stderr)
    return jsonify({"message": "Email template not found"}), 500

  context = {
    "assignee_name": assigned_to_name,
    "assigned_by_name": assigned_by_name,
    "assigned_by_email": assigned_by_email,
    "event_title": event_title,
    "event_date": event_date,
    "event_time": event_time,
    "company_name": company_name,
    "task_title": task_title,
    "task_description": task_description,
    "due_date": due_date,
    "current_year": datetime.now().year,
    "frontend_url": VITE_FRONTEND_URL,
  }
  rendered_html = _render_template(template["html_content"], context)

  if _send_email_via_maileroo(assigned_to_email, template["subject"], rendered_html):
    return jsonify({"message": "Task assigned notification sent"}), 200
  else:
    return jsonify({"message": "Failed to send task assigned notification"}), 500

@app.post("/api/send-welcome-email")
@require_api_key  # Protected by API key from Supabase trigger
def send_welcome_email():
  body = request.get_json(force=True, silent=True) or {}
  email = (body.get("email") or "").strip().lower()
  user_name = (body.get("user_name") or "there").strip()

  if not email:
    return jsonify({"message": "Email is required"}), 400

  template = _get_email_template("welcome_email")
  if not template:
    print("Warning: 'welcome_email' email template not found.", file=sys.stderr)
    return jsonify({"message": "Email template not found"}), 500

  context = {
    "user_name": user_name,
    "current_year": datetime.now().year,
    "frontend_url": VITE_FRONTEND_URL,
  }
  rendered_html = _render_template(template["html_content"], context)

  if _send_email_via_maileroo(email, template["subject"], rendered_html):
    return jsonify({"message": "Welcome email sent"}), 200
  else:
    return jsonify({"message": "Failed to send welcome email"}), 500

# -----------------------------------------------------------------------------
# Scheduler Setup
# -----------------------------------------------------------------------------
scheduler = BackgroundScheduler()
scheduler_job_id = "daily_event_reminders"

def _schedule_daily_reminders_job():
  settings = _get_email_settings()
  if not settings or not settings.get("scheduler_enabled"):
    print("Scheduler is disabled or settings not found. Not scheduling job.", file=sys.stderr)
    return

  reminder_time_str = settings.get("reminder_time", "02:00")
  try:
    hour, minute = map(int, reminder_time_str.split(':'))
  except ValueError:
    print(f"Invalid reminder_time format: {reminder_time_str}. Defaulting to 02:00.", file=sys.stderr)
    hour, minute = 2, 0

  if scheduler.get_job(scheduler_job_id):
    scheduler.remove_job(scheduler_job_id)
    print(f"Removed existing scheduler job: {scheduler_job_id}", file=sys.stderr)

  scheduler.add_job(
    _send_1week_event_reminders_job,
    CronTrigger(hour=hour, minute=minute),
    id=scheduler_job_id,
    replace_existing=True
  )
  print(f"Scheduled daily event reminders for {reminder_time_str} UTC.", file=sys.stderr)

def _send_1week_event_reminders_job():
  """
  This function is called by the scheduler to send 1-week event reminders.
  It fetches events due in 7 days and sends notifications.
  """
  print(f"Running daily 1-week event reminder job at {datetime.now(timezone.utc)} UTC.", file=sys.stderr)
  if not supabase:
    print("Supabase client not configured for scheduler job.", file=sys.stderr)
    return

  settings = _get_email_settings()
  if not settings or not settings.get("scheduler_enabled"):
    print("Scheduler is now disabled. Skipping reminder job execution.", file=sys.stderr)
    return

  try:
    # Calculate 7 days from now (local date, ignoring time for comparison)
    seven_days_from_now = (datetime.now(timezone.utc) + timedelta(days=7)).date()
    seven_days_from_now_str = seven_days_from_now.isoformat()

    # Fetch events that are 7 days away and haven't had a 1-week reminder sent
    # Note: supabase-py .is_(..., None) translates to PostgREST is.null
    resp = supabase.table("events")\
      .select("id, user_id, company_id, title, date, time, location, description, event_tasks")\
      .eq("date", seven_days_from_now_str)\
      .is_("one_week_reminder_sent_at", None)\
      .execute()
    events_to_remind = resp.data

    count_events = len(events_to_remind or [])
    print(f"1-week reminder: {count_events} event(s) on {seven_days_from_now_str}", file=sys.stderr)
    if not events_to_remind:
      return

    reminder_template = _get_email_template("event_1week_reminder")
    if not reminder_template:
      print("Warning: 'event_1week_reminder' email template not found.", file=sys.stderr)
      return

    for event in events_to_remind:
      try:
        user_profile_resp = supabase.table("profiles").select("email, name, notifications").eq("id", event["user_id"]).single().execute()
        user_profile = user_profile_resp.data

        if not user_profile:
          print(f"User profile not found for event {event['id']}. Skipping reminder.", file=sys.stderr)
          continue

        user_email = user_profile.get("email")
        user_name = user_profile.get("name") or (user_email.split('@')[0] if user_email else "there")
        user_notifications = user_profile.get("notifications", {}) or {}

        if not user_notifications.get("email_1week_countdown", False):
          print(f"User {user_email} has 1-week countdown emails disabled. Skipping.", file=sys.stderr)
          continue

        # Calculate task completion for the event (defensively)
        event_tasks_raw = event.get("event_tasks")
        event_tasks = _ensure_list_event_tasks(event_tasks_raw)
        total_tasks = len(event_tasks)
        completed_tasks = sum(1 for task in event_tasks if isinstance(task, dict) and task.get("completed"))
        pending_tasks_count = total_tasks - completed_tasks
        task_completion_percentage = f"{int((completed_tasks / total_tasks) * 100)}%" if total_tasks > 0 else "0%"

        context = {
          "user_name": user_name,
          "event_title": event.get("title") or "",
          "event_date": _fmt_event_date_display(event.get("date")),
          "event_time": event.get("time") or "N/A",
          "event_location": event.get("location") or "",
          "event_description": event.get("description") or "",
          "has_tasks": "true" if total_tasks > 0 else "",
          "pending_tasks_count": pending_tasks_count,
          "task_completion_percentage": task_completion_percentage,
          "current_year": datetime.now().year,
          "frontend_url": VITE_FRONTEND_URL,
        }
        rendered_html = _render_template(reminder_template["html_content"], context)

        if _send_email_via_maileroo(user_email, reminder_template["subject"], rendered_html):
          # Mark reminder as sent
          supabase.table("events")\
            .update({"one_week_reminder_sent_at": datetime.now(timezone.utc).isoformat()})\
            .eq("id", event["id"])\
            .execute()
          print(f"Sent 1-week reminder for event {event['id']} to {user_email}", file=sys.stderr) # Corrected: Removed extraneous backslashes
        else:
          print(f"Failed to send 1-week reminder for event {event['id']} to {user_email}", file=sys.stderr) # Corrected: Removed extraneous backslashes
      except Exception as inner_e:
        print(f"Error processing event {event.get('id')}: {inner_e}", file=sys.stderr) # Corrected: Removed extraneous backslashes

  except Exception as e:
    print(f"Error in _send_1week_event_reminders_job: {e}", file=sys.stderr)

@app.post("/api/admin/scheduler-control")
@require_admin_email
def scheduler_control():
  action = request.json.get("action")
  if action == "start":
    if not scheduler.running:
      scheduler.start()
      _schedule_daily_reminders_job()  # Schedule immediately on start
      return jsonify({"message": "Scheduler started and job scheduled."}), 200
    else:
      _schedule_daily_reminders_job()  # Re-schedule if already running (e.g., settings changed)
      return jsonify({"message": "Scheduler already running, job re-scheduled."}), 200
  elif action == "stop":
    if scheduler.running:
      scheduler.shutdown(wait=False)
      return jsonify({"message": "Scheduler stopped."}), 200
    else:
      return jsonify({"message": "Scheduler not running."}), 200
  else:
    return jsonify({"message": "Invalid action"}), 400

@app.get("/api/admin/scheduler-status")
@require_admin_email
def scheduler_status():
  job = scheduler.get_job(scheduler_job_id)
  status = {
    "is_running": scheduler.running,
    "job_scheduled": job is not None,
    "next_run_time": job.next_run_time.isoformat() if job and job.next_run_time else None
  }
  return jsonify(status), 200

# Initial scheduling when app starts
# This will be called once when the Flask app starts
# The scheduler will then manage the job based on settings
if not scheduler.running:
  scheduler.start()
_schedule_daily_reminders_job()

# Manual (API-key protected) trigger for the 1-week reminder job (useful for testing/cron over HTTP)
@app.post("/api/send-1week-event-reminders")
@require_api_key
def trigger_1week_event_reminders():
  try:
    _send_1week_event_reminders_job()
    return jsonify({"message": "Triggered 1-week reminder job"}), 200
  except Exception as e:
    return jsonify({"message": f"Failed to trigger: {e}"}), 500

# -----------------------------------------------------------------------------
# Admin Email Settings Routes
# -----------------------------------------------------------------------------
@app.get("/api/admin/email-settings")
@require_admin_email
def get_email_settings_admin():
  settings = _get_email_settings()
  if settings:
    # Mask the key for display
    if settings.get("maileroo_sending_key"):
      settings["maileroo_sending_key"] = "********"
    return jsonify(settings), 200
  return jsonify({"message": "Email settings not found or DB/ENV error."}), 500

@app.put("/api/admin/email-settings")
@require_admin_email
def update_email_settings_admin():
  body = request.get_json(force=True, silent=True) or {}
  settings_id = body.get("id")
  maileroo_sending_key = body.get("maileroo_sending_key")
  mail_default_sender = body.get("mail_default_sender")
  scheduler_enabled = body.get("scheduler_enabled", True)
  reminder_time = body.get("reminder_time", "02:00")

  if not settings_id:
    return jsonify({"message": "Settings ID is required"}), 400

  updates = {
    "mail_default_sender": mail_default_sender,
    "updated_at": _utcnow_iso(),
    "scheduler_enabled": scheduler_enabled,
    "reminder_time": reminder_time,
  }
  if maileroo_sending_key and maileroo_sending_key != "********":  # Only update if not masked
    updates["maileroo_sending_key"] = maileroo_sending_key

  try:
    # Execute update first (no .select() chaining)
    supabase.table("email_settings").update(updates).eq("id", settings_id).execute()
    # Re-fetch the updated row
    refetch = supabase.table("email_settings").select("*").eq("id", settings_id).single().execute()
    _schedule_daily_reminders_job()  # Re-schedule if settings changed
    return jsonify({"message": "Email settings updated", "settings": refetch.data}), 200
  except Exception as e:
    print(f"Error updating email settings: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to update email settings"}), 500

# -----------------------------------------------------------------------------
# Admin Email Templates Routes
# -----------------------------------------------------------------------------
@app.get("/api/admin/email-templates")
@require_admin_email
def get_email_templates_admin():
  if not supabase: return jsonify({"message": "Supabase client not configured"}), 500
  try:
    resp = supabase.table("email_templates").select("*").order("name").execute()
    return jsonify(resp.data), 200
  except Exception as e:
    print(f"Error fetching email templates: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to fetch email templates"}), 500

@app.post("/api/admin/email-templates")
@require_admin_email
def create_email_template_admin():
  if not supabase: return jsonify({"message": "Supabase client not configured"}), 500
  body = request.get_json(force=True, silent=True) or {}
  name = body.get("name")
  subject = body.get("subject")
  html_content = body.get("html_content")

  if not name or not subject or not html_content:
    return jsonify({"message": "Name, subject, and HTML content are required"}), 400

  try:
    # Insert without chaining .select()
    supabase.table("email_templates").insert({
      "name": name,
      "subject": subject,
      "html_content": html_content,
      "created_at": _utcnow_iso(),
      "updated_at": _utcnow_iso(),
    }).execute()
    # Re-fetch the inserted row by unique name
    refetch = supabase.table("email_templates").select("*").eq("name", name).single().execute()
    return jsonify({"message": "Template created", "template": refetch.data}), 201
  except Exception as e:
    print(f"Error creating email template: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to create template"}), 500

# Legacy/bad route shims (kept to avoid confusing 404s if anything cached the wrong path)
@app.put("/api/admin/email-templates/<template_id>")
@require_admin_email
def update_email_template_admin_bad(template_id):
  # This shim keeps compatibility if any client cached the wrong route; returns 404 with hint.
  return jsonify({"message": "Bad route. Use /api/admin/email-templates/<template_id>"}), 404

@app.delete("/api/admin/email-templates/<template_id>")
@require_admin_email
def delete_email_template_admin_bad(template_id):
  return jsonify({"message": "Bad route. Use /api/admin/email-templates/<template_id>"}), 404

# Correct implementation:
@app.put("/api/admin/email-templates/<template_id>")
@require_admin_email
def update_email_template_admin(template_id):
  if not supabase: return jsonify({"message": "Supabase client not configured"}), 500
  body = request.get_json(force=True, silent=True) or {}
  subject = body.get("subject")
  html_content = body.get("html_content")

  if not subject or not html_content:
    return jsonify({"message": "Subject and HTML content are required"}), 400

  try:
    # Update without chaining .select()
    supabase.table("email_templates").update({
      "subject": subject,
      "html_content": html_content,
      "updated_at": _utcnow_iso(),
    }).eq("id", template_id).execute()
    # Re-fetch the updated row
    refetch = supabase.table("email_templates").select("*").eq("id", template_id).single().execute()
    return jsonify({"message": "Template updated", "template": refetch.data}), 200
  except Exception as e:
    print(f"Error updating email template: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to update email settings"}), 500

@app.delete("/api/admin/email-templates/<template_id>")
@require_admin_email
def delete_email_template_admin(template_id):
  if not supabase: return jsonify({"message": "Supabase client not configured"}), 500
  try:
    supabase.table("email_templates").delete().eq("id", template_id).execute()
    return jsonify({"message": "Template deleted"}), 204
  except Exception as e:
    print(f"Error deleting email template: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to delete template"}), 500

# -----------------------------------------------------------------------------
# Admin Test Sending Routes
# -----------------------------------------------------------------------------
@app.post("/api/admin/send-test-email")
@require_admin_email
def send_test_email_admin():
  body = request.get_json(force=True, silent=True) or {}
  recipient_email = body.get("recipient_email")
  if not recipient_email:
    return jsonify({"message": "Recipient email is required"}), 400

  test_template = _get_email_template("welcome_email")  # Use welcome email as a generic test
  if not test_template:
    # _get_email_template already logs the error
    return jsonify({"message": "Test email template not found (welcome_email) or DB error."}), 500

  context = {
    "user_name": "Test User",
    "current_year": datetime.now().year,
    "frontend_url": VITE_FRONTEND_URL,
  }
  rendered_html = _render_template(test_template["html_content"], context)

  if _send_email_via_maileroo(recipient_email, f"[TEST] {test_template['subject']}", rendered_html):
    return jsonify({"message": "Test email sent successfully"}), 200
  else:
    # _send_email_via_maileroo already logs the error
    return jsonify({"message": "Failed to send test email. Check backend logs for details."}), 500

@app.post("/api/admin/send-test-push")
@require_admin_email
def send_test_push_admin():
  body = request.get_json(force=True, silent=True) or {}
  recipient_email = body.get("recipient_email")
  title = body.get("title", "Test Push Notification")
  message_body = body.get("body", "This is a test push notification from DayClap.")
  url = body.get("url", VITE_FRONTEND_URL)

  if not recipient_email:
    return jsonify({"message": "Recipient email is required"}), 400

  try:
    resp = supabase.table("profiles").select("push_subscription").eq("email", recipient_email).single().execute()
    profile = resp.data
    if not profile or not profile.get("push_subscription"):
      return jsonify({"message": f"No active push subscription found for {recipient_email}"}), 404

    subscription_info = profile["push_subscription"]
    if _send_push_notification(subscription_info, title, message_body, url):
      return jsonify({"message": "Test push notification sent successfully"}), 200
    else:
      return jsonify({"message": "Failed to send test push notification"}), 500
  except Exception as e:
    print(f"Error sending test push: {e}", file=sys.stderr)
    return jsonify({"message": f"An error occurred: {e}"}), 500

# -----------------------------------------------------------------------------
# Admin Diagnostics (read-only)
# -----------------------------------------------------------------------------
@app.get("/api/admin/diagnostics")
@require_admin_email
def diagnostics():
  origin = request.headers.get("Origin")
  job = scheduler.get_job(scheduler_job_id)
  settings = _get_email_settings() or {}
  di = {
    "request_origin": origin,
    "origin_allowed": origin in ALLOWED_ORIGINS or any(rx.match(origin) for rx in ALLOWED_ORIGIN_REGEX) if origin else False,
    "allowed_origins": ALLOWED_ORIGINS,
    "allowed_origin_regex": RAW_ORIGIN_REGEX,
    "allow_credentials": CORS_ALLOW_CREDENTIALS,
    "scheduler": {
      "running": scheduler.running,
      "job_scheduled": job is not None,
      "next_run_time": job.next_run_time.isoformat() if job and job.next_run_time else None,
    },
    "email_config": {
      "has_db_row": bool(settings.get("id")),
      "has_env_maileroo_api_key": bool(os.environ.get("MAILEROO_API_KEY")),
      "resolved": {
        "has_sending_key": bool(settings.get("maileroo_sending_key")),
        "has_default_sender": bool(settings.get("mail_default_sender")),
        "api_endpoint": (settings.get("maileroo_api_endpoint") or "")[:80],
        "send_endpoint": (_resolved_maileroo_send_url(settings) or "")[:120],
      },
    },
    "admin_emails_count": len(_get_allowed_admin_emails() or []),
  }
  return jsonify(di), 200

# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
  port = int(os.environ.get("PORT", "5001"))
  app.run(host="0.0.0.0", port=port, debug=True)

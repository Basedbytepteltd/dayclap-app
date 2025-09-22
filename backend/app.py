import os
import sys
from functools import wraps
from typing import Optional, Tuple
from datetime import datetime, timezone, timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client

# -----------------------------------------------------------------------------
# App + Supabase setup
# -----------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
INVITE_COOLDOWN_SECONDS = int(os.environ.get("INVITE_COOLDOWN_SECONDS", "300") or 300)

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
  print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.", file=sys.stderr)

supabase: Optional[Client] = None
try:
  supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY else None
except Exception as e:
  print(f"ERROR: Failed to create Supabase client: {e}", file=sys.stderr)
  supabase = None

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
    # supabase.auth.get_user(jwt) returns object with .user
    res = supabase.auth.get_user(token)
    # Try attribute and dict access for safety
    user = getattr(res, "user", None) or (res.get("user") if isinstance(res, dict) else None)
    if not user:
      return None, None, None

    # Supabase python client user fields
    uid = getattr(user, "id", None) or user.get("id")
    email = getattr(user, "email", None) or user.get("email")
    return uid, email, user
  except Exception as e:
    print(f"get_user_from_token error: {e}", file=sys.stderr)
    return None, None, None


def require_auth(fn):
  @wraps(fn)
  def wrapper(*args, **kwargs):
    token = parse_bearer_token(request)
    if not token:
      return jsonify({"message": "Missing or invalid Authorization header"}), 401
    uid, email, raw = get_user_from_token(token)
    if not uid:
      return jsonify({"message": "Invalid or expired token"}), 401
    request._auth = {"id": uid, "email": email, "raw": raw, "token": token}
    return fn(*args, **kwargs)
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
    # Support 'Z' suffix and +00:00 offsets
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
  except Exception:
    return None

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

  # Attempt to set push_subscription; if column doesn't exist, we still return success to not block UI.
  updates = {
    "push_subscription": body,
    "last_activity_at": _utcnow_iso(),
  }

  # Try to also toggle notifications.push if notifications is jsonb
  profile = fetch_profile(uid)
  if profile and isinstance(profile.get("notifications"), dict):
    notif = dict(profile.get("notifications") or {})
    notif["push"] = True
    updates["notifications"] = notif

  try:
    supabase.table("profiles").update(updates).eq("id", uid).execute()
    # Best-effort update; don't fail hard if supabase returns unexpected structure
    return jsonify({"message": "Subscription saved"}), 200
  except Exception as e:
    print(f"subscribe_push update error: {e}", file=sys.stderr)
    # Still return OK so UI doesn't break if column is missing
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
    notif = dict(profile.get("notifications") or {})
    notif["push"] = False
    updates["notifications"] = notif

  try:
    supabase.table("profiles").update(updates).eq("id", uid).execute()
    return jsonify({"message": "Subscription disabled"}), 200
  except Exception as e:
    print(f"unsubscribe_push update error: {e}", file=sys.stderr)
    # Still return success
    return jsonify({"message": "Subscription disabled"}), 200


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
    - Duration is configured via INVITE_COOLDOWN_SECONDS (default: 300).
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

  # Authorization: only owner/admin of the company can invite
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
    # Do not block on cooldown query errors; log and continue
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
    # Optionally, async email dispatch could be queued here.
    return jsonify({
      "message": "Invitation sent",
      "cooldown_seconds": INVITE_COOLDOWN_SECONDS
    }), 202
  except Exception as e:
    print(f"send_invitation insert error: {e}", file=sys.stderr)
    return jsonify({"message": "Failed to send invitation"}), 500


@app.post("/api/notify-task-assigned")
def notify_task_assigned():
  """
  Minimal endpoint used by frontend to signal a 'task assigned' notification.
  For now, this is a no-op that accepts the request to avoid blocking the UI.
  In production, you can use this to send an email using your templates.
  """
  # Accept whatever the frontend sends; do not block UX.
  return jsonify({"message": "accepted"}), 202


# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
  # Default to 5001 to match common local dev .env
  port = int(os.environ.get("PORT", "5001"))
  app.run(host="0.0.0.0", port=port, debug=True)

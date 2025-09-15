import os
import sys
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize Supabase client (service role)
supabase_url = os.environ.get("SUPABASE_URL")
supabase_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# --- NEW DEBUG PRINTS FOR SUPABASE KEYS ---
print(f"DEBUG: SUPABASE_URL (from os.environ): {supabase_url}", file=sys.stderr)
print(f"DEBUG: SUPABASE_SERVICE_ROLE_KEY (from os.environ): {'<PRESENT>' if supabase_service_key else '<MISSING>'}", file=sys.stderr)
# --- END NEW DEBUG PRINTS ---

if not supabase_url or not supabase_service_key:
    print("ERROR: Supabase URL and/or service role key missing in environment.", file=sys.stderr)
    print("Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.", file=sys.stderr)
    # Exit early if critical Supabase keys are missing to prevent further errors
    sys.exit(1) # Added an exit here to make the error more explicit and stop execution

supabase: Client = create_client(supabase_url, supabase_service_key)

SUPER_ADMIN_EMAIL = 'admin@example.com'


def is_super_admin(email):
    """Check if the provided email belongs to the super admin."""
    return email == SUPER_ADMIN_EMAIL


def _fetch_email_settings_row():
    """
    Returns a dict with settings or None.
    Handles different response shapes from supabase client gracefully.
    """
    try:
        resp = supabase.table('email_settings').select('*').limit(1).single().execute()
        # supabase-py may return object with .data or dict-like
        settings = None
        if hasattr(resp, "data"):
            settings = resp.data
        elif isinstance(resp, dict):
            settings = resp.get("data")
        # If settings is a list or tuple or contains nested result, normalize:
        if isinstance(settings, list) and len(settings) > 0:
            settings = settings[0]
        return settings
    except Exception as e:
        print("Error fetching email_settings row:", str(e), file=sys.stderr)
        traceback.print_exc()
        return None


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "DayClap API is running"}), 200


@app.route('/api/admin/email-settings', methods=['GET', 'PUT'])
def email_settings():
    """Endpoint to get or update email settings. Restricted to super admin."""
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    if request.method == 'GET':
        try:
            settings = _fetch_email_settings_row()
            
            # Fallback to environment variables if DB settings are not found or empty
            maileroo_sending_key = (settings.get("maileroo_sending_key") or 
                                    settings.get("maileroo_api_key") or 
                                    os.environ.get("MAILEROO_API_KEY") or 
                                    os.environ.get("MAILEROO_SENDING_KEY") or "")
            
            maileroo_api_endpoint = (settings.get("maileroo_api_endpoint") or 
                                     os.environ.get("MAILEROO_API_ENDPOINT") or 
                                     "https://api.maileroo.com/v1/send")
            
            mail_default_sender = (settings.get("mail_default_sender") or 
                                   settings.get("mail_default_from") or 
                                   os.environ.get("MAIL_DEFAULT_SENDER") or "")

            # --- DEBUG PRINTS FOR EMAIL SETTINGS ---
            print(f"DEBUG: Email settings from DB: {settings}", file=sys.stderr)
            print(f"DEBUG: MAILEROO_API_KEY from env: {os.environ.get('MAILEROO_API_KEY')}", file=sys.stderr)
            print(f"DEBUG: MAILEROO_SENDING_KEY from env: {os.environ.get('MAILEROO_SENDING_KEY')}", file=sys.stderr)
            print(f"DEBUG: MAIL_DEFAULT_SENDER from env: {os.environ.get('MAIL_DEFAULT_SENDER')}", file=sys.stderr)
            print(f"DEBUG: Final maileroo_sending_key: {maileroo_sending_key}", file=sys.stderr)
            print(f"DEBUG: Final mail_default_sender: {mail_default_sender}", file=sys.stderr)
            # --- END DEBUG PRINTS ---

            result = {
                "id": settings.get("id") if settings else None,
                "maileroo_sending_key": maileroo_sending_key,
                "maileroo_api_endpoint": maileroo_api_endpoint,
                "mail_default_sender": mail_default_sender
            }
            return jsonify(result), 200
        except Exception as e:
            print("GET /api/admin/email-settings error:", str(e), file=sys.stderr)
            traceback.print_exc()
            return jsonify({"message": f"Error fetching settings: {str(e)}"}), 500

    if request.method == 'PUT':
        try:
            settings_data = request.get_json() or {}
            # Accept either id or if missing, attempt to update the single row (singleton table)
            settings_id = settings_data.get('id')

            # Normalize incoming keys: accept maileroo_api_key or maileroo_sending_key
            if 'maileroo_api_key' in settings_data and 'maileroo_sending_key' not in settings_data:
                settings_data['maileroo_sending_key'] = settings_data.get('maileroo_api_key')

            # Remove id before update payload
            update_payload = {k: v for k, v in settings_data.items() if k != 'id'}
            # Update timestamp (use server-side now via text expression supported in Postgres)
            update_payload['updated_at'] = 'now()'

            # If no id provided, try to fetch existing row id; if none, insert new row
            if not settings_id:
                existing = _fetch_email_settings_row()
                if existing and existing.get('id'):
                    settings_id = existing.get('id')
                else:
                    # Insert new row
                    # Prepare insertion payload: prefer maileroo_sending_key or maileroo_api_key
                    insert_payload = {
                        "maileroo_api_key": update_payload.get("maileroo_sending_key") or update_payload.get("maileroo_api_key") or os.environ.get("MAILEROO_API_KEY"),
                        "maileroo_api_endpoint": update_payload.get("maileroo_api_endpoint") or os.environ.get("MAILEROO_API_ENDPOINT") or "https://api.maileroo.com/v1/send",
                        "mail_default_sender": update_payload.get("mail_default_sender") or os.environ.get("MAIL_DEFAULT_SENDER") or ""
                    }
                    ins_resp = supabase.table('email_settings').insert(insert_payload).execute()
                    inserted = None
                    if hasattr(ins_resp, "data"):
                        inserted = ins_resp.data
                    elif isinstance(ins_resp, dict):
                        inserted = ins_resp.get("data")
                    if inserted:
                        # If insert returns list, take first
                        if isinstance(inserted, list):
                            inserted = inserted[0]
                        return jsonify({"message": "Settings created successfully", "settings": {
                            "id": inserted.get("id"),
                            "maileroo_sending_key": inserted.get("maileroo_api_key") or inserted.get("maileroo_sending_key"),
                            "mail_default_sender": inserted.get("mail_default_sender")
                        }}), 201
                    else:
                        return jsonify({"message": "Failed to create email settings"}), 400

            # If we have an id now, perform update
            resp = supabase.table('email_settings').update(update_payload).eq('id', settings_id).execute()
            updated = None
            if hasattr(resp, "data"):
                updated = resp.data
            elif isinstance(resp, dict):
                updated = resp.get("data")
            if updated:
                # If updated is a list, take first
                if isinstance(updated, list):
                    updated_item = updated[0]
                else:
                    updated_item = updated
                # Normalize returned settings
                settings_result = {
                    "id": updated_item.get("id"),
                    "maileroo_sending_key": updated_item.get("maileroo_sending_key") or updated_item.get("maileroo_api_key"),
                    "mail_default_sender": updated_item.get("mail_default_sender")
                }
                return jsonify({"message": "Settings updated successfully", "settings": settings_result}), 200
            else:
                return jsonify({"message": "Failed to update settings or settings not found"}), 400

        except Exception as e:
            print("PUT /api/admin/email-settings error:", str(e), file=sys.stderr)
            traceback.print_exc()
            return jsonify({"message": f"Error updating settings: {str(e)}"}), 500


# NEW: Endpoint to send a test email
@app.route('/api/admin/send-test-email', methods=['POST'])
def send_test_email():
    """Endpoint to send a test email using configured Maileroo settings. Restricted to super admin."""
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    data = request.get_json() or {}
    recipient_email = data.get('recipient_email')

    if not recipient_email:
        return jsonify({"message": "Recipient email is required"}), 400

    try:
        # Fetch Maileroo settings from DB or environment fallbacks
        settings = _fetch_email_settings_row() or {}
        api_key = (settings.get('maileroo_sending_key') or settings.get('maileroo_api_key') or
                   os.environ.get('MAILEROO_API_KEY') or os.environ.get('MAILEROO_SENDING_KEY'))
        api_endpoint = (settings.get('maileroo_api_endpoint') or
                        os.environ.get('MAILEROO_API_ENDPOINT') or
                        "https://api.maileroo.com/v1/send")
        default_sender = (settings.get('mail_default_sender') or
                          os.environ.get('MAIL_DEFAULT_SENDER') or
                          "")

        if not api_key or not default_sender:
            return jsonify({"message": "Maileroo Sending Key or Default Sender is not configured."}), 400

        # Construct and send the test email via Maileroo
        email_subject = "DayClap Test Email"
        email_html_body = """
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Hello from DayClap!</h2>
            <p>This is a test email sent from your DayClap Super Admin Dashboard.</p>
            <p>If you received this, your Maileroo integration is working correctly.</p>
            <p>Best,<br>The DayClap Team</p>
        </div>
        """

        maileroo_payload = {
            "from": default_sender,
            "to": recipient_email,
            "subject": email_subject,
            "html": email_html_body
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        mail_response = requests.post(api_endpoint, json=maileroo_payload, headers=headers, timeout=15)

        if mail_response.status_code in (200, 201, 202):
            return jsonify({"message": "Test email sent successfully!", "maileroo_status": mail_response.status_code}), 200
        else:
            print(f"Maileroo Test Email Error: {mail_response.status_code} - {mail_response.text}", file=sys.stderr)
            return jsonify({
                "message": f"Failed to send test email via Maileroo. Status: {mail_response.status_code}",
                "maileroo_status": mail_response.status_code,
                "maileroo_response": mail_response.text
            }), 500

    except requests.exceptions.RequestException as re:
        print(f"Network error sending test email: {str(re)}", file=sys.stderr)
        traceback.print_exc()
        return jsonify({"message": f"Network error while contacting Maileroo: {str(re)}"}), 502
    except Exception as e:
        print(f"Error in send_test_email: {str(e)}", file=sys.stderr)
        traceback.print_exc()
        return jsonify({"message": f"An unexpected error occurred: {str(e)}"}), 500


@app.route('/api/send-invitation', methods=['POST'])
def send_invitation():
    """Endpoint to send a company invitation email."""
    data = request.get_json() or {}

    # Basic validation
    required_fields = ['sender_id', 'sender_email', 'recipient_email', 'company_id', 'company_name', 'role']
    if not all(field in data for field in required_fields):
        return jsonify({"message": "Missing required fields in invitation data"}), 400

    try:
        # 1. Insert the invitation record into the database
        invitation_payload = {
            'sender_id': data['sender_id'],
            'sender_email': data['sender_email'],
            'recipient_email': data['recipient_email'].lower(),
            'company_id': data['company_id'],
            'company_name': data['company_name'],
            'role': data['role'],
            'status': 'pending'
        }
        invitation_resp = supabase.table('invitations').insert(invitation_payload).execute()
        invitation_data = None
        if hasattr(invitation_resp, "data"):
            invitation_data = invitation_resp.data
        elif isinstance(invitation_resp, dict):
            invitation_data = invitation_resp.get("data")

        if not invitation_data:
            raise Exception("Failed to save invitation to the database.")

        # 2. Fetch Maileroo settings from the database (with fallbacks)
        settings = _fetch_email_settings_row() or {}
        api_key = (settings.get('maileroo_sending_key') or settings.get('maileroo_api_key') or
                   os.environ.get('MAILEROO_API_KEY') or os.environ.get('MAILEROO_SENDING_KEY'))
        api_endpoint = (settings.get('maileroo_api_endpoint') or
                        os.environ.get('MAILEROO_API_ENDPOINT') or
                        "https://api.maileroo.com/v1/send")
        default_sender = (settings.get('mail_default_sender') or
                          os.environ.get('MAIL_DEFAULT_SENDER') or
                          "")

        if not api_key or not default_sender:
            # Invitation saved but emailing not configured
            return jsonify({"message": "Maileroo settings are not configured. Invitation saved but not sent."}), 202

        # 3. Construct and send the email via Maileroo
        email_subject = f"You're invited to join {data['company_name']} on DayClap"
        email_html_body = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>You're Invited!</h2>
            <p>Hello,</p>
            <p><b>{data['sender_email']}</b> has invited you to join the company <b>'{data['company_name']}'</b> on DayClap as a <b>{data['role']}</b>.</p>
            <p>DayClap is a smart calendar to help you and your team stay organized and productive.</p>
            <p>To accept this invitation, please sign up or log in to your DayClap account with this email address.</p>
            <a href="{os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')}" style="display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 5px;">
                Go to DayClap
            </a>
            <p>If you were not expecting this invitation, you can safely ignore this email.</p>
            <p>Best,<br>The DayClap Team</p>
        </div>
        """

        maileroo_payload = {
            "from": default_sender,
            "to": data['recipient_email'],
            "subject": email_subject,
            "html": email_html_body
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        mail_response = requests.post(api_endpoint, json=maileroo_payload, headers=headers, timeout=15)

        if mail_response.status_code in (200, 201, 202):
            return jsonify({"message": "Invitation sent successfully!"}), 200
        else:
            # Log the error but still return a success-ish response because invite saved
            print(f"Maileroo Error: {mail_response.status_code} - {mail_response.text}", file=sys.stderr)
            return jsonify({
                "message": "Invitation saved, but failed to send email. Please check Maileroo configuration.",
                "maileroo_error": mail_response.text
            }), 202

    except requests.exceptions.RequestException as re:
        print(f"Network error sending invitation: {str(re)}", file=sys.stderr)
        traceback.print_exc()
        return jsonify({"message": f"Network error while contacting Maileroo: {str(re)}"}), 502
    except Exception as e:
        print(f"Error in send_invitation: {str(e)}", file=sys.stderr)
        traceback.print_exc()
        return jsonify({"message": f"An unexpected error occurred: {str(e)}"}), 500


if __name__ == '__main__':
    # Use the PORT environment variable if available, otherwise default to 5000
    port = int(os.environ.get('PORT', 5000))
    # Provide a small startup log so it's easier to debug missing env vars
    print(f"Starting DayClap backend on port {port}...\n")
    print(f"Supabase URL present: {'YES' if bool(supabase_url) else 'NO'}\n")
    print(f"Supabase service role key present: {'YES' if bool(supabase_service_key) else 'NO'}\n")
    print(f"Maileroo env key present: {'YES' if bool(os.environ.get('MAILEROO_API_KEY') or os.environ.get('MAILEROO_SENDING_KEY')) else 'NO (will attempt DB)'}\n")
    print(f"Frontend URL for emails: {os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')}\n")
    app.run(debug=True, port=port)

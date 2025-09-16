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

print(f"DEBUG: SUPABASE_URL (from os.environ): {supabase_url}", file=sys.stderr)
print(f"DEBUG: SUPABASE_SERVICE_ROLE_KEY (from os.environ): {'<PRESENT>' if supabase_service_key else '<MISSING>'}", file=sys.stderr)

if not supabase_url or not supabase_service_key:
    print("ERROR: Supabase URL and/or service role key missing.", file=sys.stderr)
    sys.exit(1)

supabase: Client = create_client(supabase_url, supabase_service_key)

SUPER_ADMIN_EMAIL = 'admin@example.com'

def is_super_admin(email):
    return email == SUPER_ADMIN_EMAIL

def _fetch_email_settings_row():
    try:
        resp = supabase.table('email_settings').select('*').limit(1).single().execute()
        settings = resp.data if hasattr(resp, "data") else resp.get("data")
        if isinstance(settings, list) and len(settings) > 0:
            settings = settings[0]
        return settings
    except Exception as e:
        print(f"Error fetching email_settings row: {e}", file=sys.stderr)
        return None

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "DayClap API is running"}), 200

@app.route('/api/admin/email-settings', methods=['GET', 'PUT'])
def email_settings():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    if request.method == 'GET':
        try:
            settings = _fetch_email_settings_row() or {}
            
            maileroo_sending_key = (settings.get("maileroo_sending_key") or 
                                    os.environ.get("MAILEROO_SENDING_KEY") or 
                                    os.environ.get("MAILEROO_API_KEY") or "")
            
            maileroo_api_endpoint = (settings.get("maileroo_api_endpoint") or 
                                     os.environ.get("MAILEROO_API_ENDPOINT") or 
                                     "https://smtp.maileroo.com/api/v2")
            
            mail_default_sender = (settings.get("mail_default_sender") or 
                                   os.environ.get("MAIL_DEFAULT_SENDER") or 
                                   "no-reply@team.dayclap.com")

            result = {
                "id": settings.get("id"),
                "maileroo_sending_key": maileroo_sending_key,
                "maileroo_api_endpoint": maileroo_api_endpoint,
                "mail_default_sender": mail_default_sender
            }
            return jsonify(result), 200
        except Exception as e:
            print(f"GET /api/admin/email-settings error: {e}", file=sys.stderr)
            return jsonify({"message": f"Error fetching settings: {e}"}), 500

    if request.method == 'PUT':
        try:
            settings_data = request.get_json() or {}
            settings_id = settings_data.get('id')

            # Standardize the key to always use 'maileroo_sending_key'
            sending_key = settings_data.get('maileroo_sending_key') or settings_data.get('maileroo_api_key')

            update_payload = {'updated_at': 'now()'}
            if sending_key is not None:
                update_payload['maileroo_sending_key'] = sending_key
            if 'mail_default_sender' in settings_data:
                update_payload['mail_default_sender'] = settings_data['mail_default_sender']
            
            # Ensure we have a settings row to update, or create one if none exists
            existing_settings = _fetch_email_settings_row()
            if not existing_settings:
                # Insert a new row
                insert_payload = {
                    "maileroo_sending_key": update_payload.get("maileroo_sending_key", ""),
                    "mail_default_sender": update_payload.get("mail_default_sender", "no-reply@team.dayclap.com")
                }
                ins_resp = supabase.table('email_settings').insert(insert_payload).execute()
                inserted = ins_resp.data[0] if hasattr(ins_resp, "data") and ins_resp.data else {}
                return jsonify({"message": "Settings created successfully", "settings": inserted}), 201
            else:
                # Update the existing row
                settings_id = existing_settings.get('id')
                resp = supabase.table('email_settings').update(update_payload).eq('id', settings_id).execute()
                updated = resp.data[0] if hasattr(resp, "data") and resp.data else {}
                return jsonify({"message": "Settings updated successfully", "settings": updated}), 200

        except Exception as e:
            print(f"PUT /api/admin/email-settings error: {e}", file=sys.stderr)
            return jsonify({"message": f"Error updating settings: {e}"}), 500

@app.route('/api/admin/send-test-email', methods=['POST'])
def send_test_email():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    data = request.get_json() or {}
    recipient_email = data.get('recipient_email')
    if not recipient_email:
        return jsonify({"message": "Recipient email is required"}), 400

    try:
        settings = _fetch_email_settings_row() or {}
        api_key = (settings.get('maileroo_sending_key') or
                   os.environ.get('MAILEROO_SENDING_KEY') or
                   os.environ.get('MAILEROO_API_KEY'))
        api_endpoint = (settings.get('maileroo_api_endpoint') or
                        os.environ.get('MAILEROO_API_ENDPOINT') or
                        "https://smtp.maileroo.com/api/v2")
        default_sender = (settings.get('mail_default_sender') or
                          os.environ.get('MAIL_DEFAULT_SENDER') or
                          "no-reply@team.dayclap.com")

        if not api_key or not default_sender:
            return jsonify({"message": "Maileroo Sending Key or Default Sender is not configured."}), 400

        email_subject = "DayClap Test Email"
        email_html_body = "<p>This is a test email from your DayClap Super Admin Dashboard. If you received this, your Maileroo integration is working correctly.</p>"
        
        # **FIX**: Format the 'from' field to include a sender name as per Maileroo docs.
        formatted_from = f"DayClap Team <{default_sender}>"
        
        maileroo_payload = {
            "from": formatted_from,
            "to": recipient_email,
            "subject": email_subject,
            "html": email_html_body
        }
        
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        mail_response = requests.post(api_endpoint, json=maileroo_payload, headers=headers, timeout=15)

        if mail_response.ok:
            return jsonify({"message": "Test email sent successfully!", "maileroo_status": mail_response.status_code}), 200
        else:
            print(f"Maileroo Test Email Error: {mail_response.status_code} - {mail_response.text}", file=sys.stderr)
            return jsonify({"message": f"Failed to send test email. Status: {mail_response.status_code}", "details": mail_response.text}), 500

    except Exception as e:
        print(f"Error in send_test_email: {e}", file=sys.stderr)
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

@app.route('/api/send-invitation', methods=['POST'])
def send_invitation():
    data = request.get_json() or {}
    required_fields = ['sender_id', 'sender_email', 'recipient_email', 'company_id', 'company_name', 'role']
    if not all(field in data for field in required_fields):
        return jsonify({"message": "Missing required fields"}), 400

    try:
        invitation_payload = {k: data[k] for k in required_fields}
        invitation_payload['status'] = 'pending'
        invitation_resp = supabase.table('invitations').insert(invitation_payload).execute()
        if not (hasattr(invitation_resp, "data") and invitation_resp.data):
            raise Exception("Failed to save invitation to the database.")

        settings = _fetch_email_settings_row() or {}
        api_key = (settings.get('maileroo_sending_key') or os.environ.get('MAILEROO_SENDING_KEY') or os.environ.get('MAILEROO_API_KEY'))
        api_endpoint = (settings.get('maileroo_api_endpoint') or os.environ.get('MAILEROO_API_ENDPOINT') or "https://smtp.maileroo.com/api/v2")
        default_sender = (settings.get('mail_default_sender') or os.environ.get('MAIL_DEFAULT_SENDER') or "no-reply@team.dayclap.com")

        if not api_key or not default_sender:
            return jsonify({"message": "Invitation saved but email not sent (email service not configured)."}), 202

        email_subject = f"You're invited to join {data['company_name']} on DayClap"
        frontend_url = os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')
        email_html_body = f"<p><b>{data['sender_email']}</b> has invited you to join <b>'{data['company_name']}'</b> on DayClap. <a href='{frontend_url}'>Accept here</a>.</p>"
        
        # **FIX**: Format the 'from' field to include a sender name as per Maileroo docs.
        formatted_from = f"DayClap Team <{default_sender}>"
        
        maileroo_payload = {
            "from": formatted_from,
            "to": data['recipient_email'],
            "subject": email_subject,
            "html": email_html_body
        }
        
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        mail_response = requests.post(api_endpoint, json=maileroo_payload, headers=headers, timeout=15)

        if mail_response.ok:
            return jsonify({"message": "Invitation sent successfully!"}), 200
        else:
            print(f"Maileroo Error: {mail_response.status_code} - {mail_response.text}", file=sys.stderr)
            return jsonify({"message": "Invitation saved, but failed to send email.", "details": mail_response.text}), 202

    except Exception as e:
        print(f"Error in send_invitation: {e}", file=sys.stderr)
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, port=port)

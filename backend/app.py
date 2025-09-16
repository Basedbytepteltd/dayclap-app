import os
import sys
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import requests
from dotenv import load_dotenv
from datetime import datetime # Moved to the top for global availability

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

# NEW: Email Templates
EMAIL_TEMPLATES = {
    "welcome_email": """
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background-color: #3b82f6; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { padding: 20px; line-height: 1.6; color: #333333; }
            .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>Welcome to DayClap!</h2>
            </div>
            <div class="content">
                <p>Hello {{ user_name }},</p>
                <p>Your DayClap account is now active! We're thrilled to have you on board.</p>
                <p>DayClap helps you streamline your schedule, manage tasks effortlessly, and collaborate with your team. Get ready to boost your productivity!</p>
                <p style="text-align: center;">
                    <a href="{{ frontend_url }}" class="button">Go to Dashboard</a>
                </p>
                <p>If you have any questions, feel free to reach out to our support team.</p>
                <p>Best regards,<br>The DayClap Team</p>
            </div>
            <div class="footer">
                <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """,
    "invitation_to_company": """
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background-color: #3b82f6; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { padding: 20px; line-height: 1.6; color: #333333; }
            .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>You're Invited to Join a Team on DayClap!</h2>
            </div>
            <div class="content">
                <p>Hello,</p>
                <p><b>{{ sender_email }}</b> has invited you to join their team, <b>'{{ company_name }}'</b>, on DayClap as a <b>{{ role }}</b>.</p>
                <p>DayClap helps teams collaborate on schedules, manage tasks, and boost overall productivity.</p>
                <p style="text-align: center;">
                    <a href="{{ invitation_link }}" class="button">Accept Invitation</a>
                </p>
                <p>If you have any questions, please contact {{ sender_email }}.</p>
                <p>Best regards,<br>The DayClap Team</p>
            </div>
            <div class="footer">
                <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
}

# NEW: Helper function to render email templates
def render_email_template(template_name, data):
    template = EMAIL_TEMPLATES.get(template_name)
    if not template:
        raise ValueError(f"Email template '{template_name}' not found.")
    
    # Replace placeholders with actual data
    rendered_html = template
    for key, value in data.items():
        rendered_html = rendered_html.replace(f"{{{{ {key} }}}}", str(value))
    
    # Ensure current_year is always available
    if "{{ current_year }}" in rendered_html:
        rendered_html = rendered_html.replace("{{ current_year }}", str(datetime.now().year))

    return rendered_html

def send_email_api(recipient_email, subject, template_name, template_data=None):
    settings = _fetch_email_settings_row() or {}
    
    api_key = (settings.get('maileroo_sending_key') or
               os.environ.get('MAILEROO_SENDING_KEY') or
               os.environ.get('MAILEROO_API_KEY'))
    
    # Dynamically get the base API endpoint from settings or environment, then append '/emails'
    base_api_endpoint = (settings.get('maileroo_api_endpoint') or
                         os.environ.get('MAILEROO_API_ENDPOINT') or
                         "https://smtp.maileroo.com/api/v2")
    api_endpoint = f"{base_api_endpoint}/emails" # Append /emails for the sending endpoint
    
    sender_email = (settings.get('mail_default_sender') or
                    os.environ.get('MAIL_DEFAULT_SENDER') or
                    "no-reply@team.dayclap.com")

    if not api_key or not sender_email:
        raise ValueError("Maileroo Sending Key or Sender Email is not configured.")

    # Render the email template
    html_body = render_email_template(template_name, template_data or {})

    maileroo_payload = {
        "from": {
            "address": sender_email,
            "name": "DayClap Team"
        },
        "to": [
            {
                "address": recipient_email
            }
        ],
        "subject": subject,
        "html": html_body
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    try:
        print(f"DEBUG: Sending email via Maileroo API to {recipient_email} using template '{template_name}'", file=sys.stderr)
        print(f"DEBUG: Using API endpoint: {api_endpoint}", file=sys.stderr)
        print(f"DEBUG: Payload: {maileroo_payload}", file=sys.stderr)
        
        mail_response = requests.post(api_endpoint, json=maileroo_payload, headers=headers, timeout=15)

        # Keep detailed logging for success and failure
        print(f"DEBUG: Maileroo API Response Status: {mail_response.status_code}", file=sys.stderr)
        response_json = {}
        try:
            response_json = mail_response.json()
            print(f"DEBUG: Maileroo API Response Body: {response_json}\n", file=sys.stderr)
        except Exception:
            print(f"DEBUG: Maileroo API Response Body (not JSON): {mail_response.text}\n", file=sys.stderr)
            response_json = {"raw_text": mail_response.text}

        if mail_response.status_code == 200 or mail_response.status_code == 201:
            return True, response_json
        else:
            error_message = response_json.get('message', response_json.get('error', mail_response.text))
            return False, f"API Error ({mail_response.status_code}): {error_message}"

    except requests.exceptions.RequestException as e:
        print(f"CRITICAL API Request Error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False, str(e)

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
            maileroo_sending_key = (settings.get("maileroo_sending_key") or os.environ.get("MAILEROO_SENDING_KEY") or os.environ.get("MAILEROO_API_KEY") or "")
            mail_default_sender = (settings.get("mail_default_sender") or os.environ.get("MAIL_DEFAULT_SENDER") or "no-reply@team.dayclap.com")
            result = {"id": settings.get("id"), "maileroo_sending_key": maileroo_sending_key, "mail_default_sender": mail_default_sender}
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"message": f"Error fetching settings: {e}"}), 500

    if request.method == 'PUT':
        try:
            settings_data = request.get_json() or {}
            update_payload = {'updated_at': 'now()'}
            if 'maileroo_sending_key' in settings_data:
                update_payload['maileroo_sending_key'] = settings_data['maileroo_sending_key']
            if 'mail_default_sender' in settings_data:
                update_payload['mail_default_sender'] = settings_data['mail_default_sender']
            
            existing_settings = _fetch_email_settings_row()
            if not existing_settings:
                ins_resp = supabase.table('email_settings').insert(update_payload).execute()
                inserted = ins_resp.data[0] if hasattr(ins_resp, "data") and ins_resp.data else {}
                return jsonify({"message": "Settings created successfully", "settings": inserted}), 201
            else:
                settings_id = existing_settings.get('id')
                resp = supabase.table('email_settings').update(update_payload).eq('id', settings_id).execute()
                updated = resp.data[0] if hasattr(resp, "data") and resp.data else {}
                return jsonify({"message": "Settings updated successfully", "settings": updated}), 200
        except Exception as e:
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
        email_subject = "DayClap Test Email"
        # Use the welcome email template for testing purposes
        template_data = {
            "user_name": "DayClap User",
            "frontend_url": os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173'),
            "current_year": datetime.now().year
        }
        
        success, details = send_email_api(recipient_email, email_subject, "welcome_email", template_data)

        if success:
            return jsonify({"message": "Test email sent successfully via API! (using welcome template)", "details": details}), 200
        else:
            return jsonify({"message": "Failed to send test email via API.", "details": details}), 500

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

        email_subject = f"You're invited to join {data['company_name']} on DayClap"
        frontend_url = os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')
        
        # NEW: Use the invitation template
        template_data = {
            "sender_email": data['sender_email'],
            "company_name": data['company_name'],
            "role": data['role'],
            "invitation_link": frontend_url, # Assuming frontend handles invitation acceptance
            "current_year": datetime.now().year
        }
        
        success, details = send_email_api(data['recipient_email'], email_subject, "invitation_to_company", template_data)

        if success:
            return jsonify({"message": "Invitation sent successfully!", "details": details}), 200
        else:
            print(f"API Error on Invitation: {details}", file=sys.stderr)
            return jsonify({"message": "Invitation saved, but failed to send email.", "details": details}), 202

    except Exception as e:
        print(f"Error in send_invitation: {e}", file=sys.stderr)
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, port=port)

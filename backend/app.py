import os
import sys
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from supabase import create_client, Client
import requests
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize Supabase client (service role)
supabase_url = os.environ.get("SUPABASE_URL")
supabase_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_service_key:
    print("ERROR: Supabase URL and/or service role key missing.", file=sys.stderr)
    sys.exit(1)

supabase: Client = create_client(supabase_url, supabase_service_key)

SUPER_ADMIN_EMAIL = 'admin@example.com'
BACKEND_API_KEY = os.environ.get("BACKEND_API_KEY") # NEW: Fetch backend API key

if not BACKEND_API_KEY:
    print("WARNING: BACKEND_API_KEY is not set. Welcome email endpoint will be insecure.", file=sys.stderr)

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

# NEW: Helper function to fetch email template from DB
def _fetch_email_template(template_name):
    try:
        resp = supabase.table('email_templates').select('subject, html_content').eq('name', template_name).single().execute()
        template = resp.data if hasattr(resp, "data") else resp.get("data")
        if isinstance(template, list) and len(template) > 0:
            template = template[0]
        return template
    except Exception as e:
        print(f"Error fetching email template '{template_name}': {e}", file=sys.stderr)
        return None

# NEW: Helper function to render email templates
def render_email_template(template_name, data):
    template_data_from_db = _fetch_email_template(template_name)
    if not template_data_from_db:
        raise ValueError(f"Email template '{template_name}' not found in database.")
    
    html_body = template_data_from_db['html_content']
    subject = template_data_from_db['subject']

    # Replace placeholders with actual data
    rendered_html = html_body
    for key, value in data.items():
        rendered_html = rendered_html.replace(f"{{{{ {key} }}}}", str(value))
    
    # Ensure current_year is always available
    if "{{ current_year }}" in rendered_html:
        rendered_html = rendered_html.replace("{{ current_year }}", str(datetime.now().year))

    return subject, rendered_html

def send_email_api(recipient_email, template_name, template_data=None):
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
    email_subject, html_body = render_email_template(template_name, template_data or {})

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
        "subject": email_subject, # Use subject from rendered template
        "html": html_body
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    try:
        mail_response = requests.post(api_endpoint, json=maileroo_payload, headers=headers, timeout=15)
        response_json = {}
        try:
            response_json = mail_response.json()
        except Exception:
            response_json = {"raw_text": mail_response.text}

        if mail_response.status_code == 200 or mail_response.status_code == 201:
            return True, response_json
        else:
            error_message = response_json.get('message', response_json.get('error', mail_response.text))
            return False, f"API Error ({mail_response.status_code}): {error_message}"

    except requests.exceptions.RequestException as e:
        traceback.print_exc(file=sys.stderr)
        return False, str(e)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "DayClap API is running"}), 200

@app.route('/api/admin/email-settings', methods=['GET', 'PUT'])
@cross_origin() # Explicitly enable CORS for this route
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
@cross_origin() # Explicitly enable CORS for this route
def send_test_email():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    data = request.get_json() or {}
    recipient_email = data.get('recipient_email')
    if not recipient_email:
        return jsonify({"message": "Recipient email is required"}), 400

    try:
        template_data = {
            "user_name": "DayClap User",
            "frontend_url": os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173'),
            "current_year": datetime.now().year
        }
        
        success, details = send_email_api(recipient_email, "welcome_email", template_data)

        if success:
            return jsonify({"message": "Test email sent successfully via API! (using welcome template)", "details": details}), 200
        else:
            return jsonify({"message": "Failed to send test email via API.", "details": details}), 500

    except Exception as e:
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

@app.route('/api/send-invitation', methods=['POST'])
@cross_origin() # Explicitly enable CORS for this route
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

        frontend_url = os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')
        
        template_data = {
            "sender_email": data['sender_email'],
            "company_name": data['company_name'],
            "role": data['role'],
            "invitation_link": frontend_url,
            "current_year": datetime.now().year
        }
        
        success, details = send_email_api(data['recipient_email'], "invitation_to_company", template_data)

        if success:
            return jsonify({"message": "Invitation sent successfully!", "details": details}), 200
        else:
            return jsonify({"message": "Invitation saved, but failed to send email.", "details": details}), 202

    except Exception as e:
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

# NEW: Endpoint to send welcome email, called by Supabase trigger
@app.route('/api/send-welcome-email', methods=['POST'])
@cross_origin()
def send_welcome_email_endpoint():
    # Security check: Verify API Key
    api_key_header = request.headers.get('X-API-Key')
    if not BACKEND_API_KEY or api_key_header != BACKEND_API_KEY:
        print(f"Unauthorized access attempt to /api/send-welcome-email. Provided key: {api_key_header}", file=sys.stderr)
        return jsonify({"message": "Unauthorized"}), 403

    data = request.get_json() or {}
    recipient_email = data.get('email')
    user_name = data.get('user_name', 'New User') # Default name if not provided

    if not recipient_email:
        return jsonify({"message": "Recipient email is required"}), 400

    try:
        frontend_url = os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')
        template_data = {
            "user_name": user_name,
            "frontend_url": frontend_url,
            "current_year": datetime.now().year
        }
        
        success, details = send_email_api(recipient_email, "welcome_email", template_data)

        if success:
            return jsonify({"message": "Welcome email sent successfully!", "details": details}), 200
        else:
            return jsonify({"message": "Failed to send welcome email.", "details": details}), 500

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

# NEW: API Endpoints for Email Template Management
@app.route('/api/admin/email-templates', methods=['GET', 'POST'])
@cross_origin() # Explicitly enable CORS for this route
def email_templates_management():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    if request.method == 'GET':
        try:
            resp = supabase.table('email_templates').select('*').order('name').execute()
            templates = resp.data if hasattr(resp, "data") else resp.get("data")
            return jsonify(templates), 200
        except Exception as e:
            print(f"Error fetching email templates: {e}", file=sys.stderr) # Log the specific error
            return jsonify({"message": f"Error fetching email templates: {e}"}), 500

    if request.method == 'POST':
        try:
            template_data = request.get_json() or {}
            required_fields = ['name', 'subject', 'html_content']
            if not all(field in template_data for field in required_fields):
                return jsonify({"message": "Missing required fields: name, subject, html_content"}), 400
            
            # Check for existing template with the same name
            existing_template = supabase.table('email_templates').select('id').eq('name', template_data['name']).execute()
            if existing_template.data:
                return jsonify({"message": f"Template with name '{template_data['name']}' already exists."}), 409

            insert_payload = {
                'name': template_data['name'],
                'subject': template_data['subject'],
                'html_content': template_data['html_content'],
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            resp = supabase.table('email_templates').insert(insert_payload).execute()
            inserted_template = resp.data[0] if hasattr(resp, "data") and resp.data else {}
            return jsonify({"message": "Email template created successfully", "template": inserted_template}), 201
        except Exception as e:
            return jsonify({"message": f"Error creating email template: {e}"}), 500

@app.route('/api/admin/email-templates/<uuid:template_id>', methods=['GET', 'PUT', 'DELETE'])
@cross_origin() # Explicitly enable CORS for this route
def email_template_detail_management(template_id):
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    if request.method == 'GET':
        try:
            resp = supabase.table('email_templates').select('*').eq('id', str(template_id)).single().execute()
            template = resp.data if hasattr(resp, "data") else resp.get("data")
            if not template:
                return jsonify({"message": "Email template not found"}), 404
            return jsonify(template), 200
        except Exception as e:
            return jsonify({"message": f"Error fetching email template: {e}"}), 500

    if request.method == 'PUT':
        try:
            template_data = request.get_json() or {}
            update_payload = {'updated_at': datetime.now().isoformat()}
            if 'name' in template_data:
                update_payload['name'] = template_data['name']
            if 'subject' in template_data:
                update_payload['subject'] = template_data['subject']
            if 'html_content' in template_data:
                update_payload['html_content'] = template_data['html_content']
            
            resp = supabase.table('email_templates').update(update_payload).eq('id', str(template_id)).execute()
            updated_template = resp.data[0] if hasattr(resp, "data") and resp.data else {}
            return jsonify({"message": "Email template updated successfully", "template": updated_template}), 200
        except Exception as e:
            return jsonify({"message": f"Error updating email template: {e}"}), 500

    if request.method == 'DELETE':
        try:
            resp = supabase.table('email_templates').delete().eq('id', str(template_id)).execute()
            if not (hasattr(resp, "data") and resp.data):
                return jsonify({"message": "Email template not found or already deleted"}), 404
            return jsonify({"message": "Email template deleted successfully"}), 204
        except Exception as e:
            return jsonify({"message": f"Error deleting email template: {e}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, port=port)

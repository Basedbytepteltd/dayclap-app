import os
import sys
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from supabase import create_client, Client
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit

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
BACKEND_API_KEY = os.environ.get("BACKEND_API_KEY") # Fetch backend API key

if not BACKEND_API_KEY:
    print("WARNING: BACKEND_API_KEY is not set. Welcome email endpoint will be insecure.", file=sys.stderr)

# Initialize APScheduler
scheduler = BackgroundScheduler()

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

# Helper function to fetch email template from DB
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

# Helper function to render email templates
def render_email_template(template_name, data):
    template_data_from_db = _fetch_email_template(template_name)
    if not template_data_from_db:
        raise ValueError(f"Email template '{template_name}' not found in database.")
    
    html_body = template_data_from_db['html_content']
    subject = template_data_from_db['subject']

    # Simple placeholder replacement for now. For more complex logic (like #if),
    # a proper templating engine (Jinja2) would be needed.
    # For this task, we'll assume simple string replacements.
    rendered_html = html_body
    for key, value in data.items():
        # Handle conditional blocks for 'has_tasks'
        if key == 'has_tasks':
            if value:
                rendered_html = rendered_html.replace("{{#if has_tasks}}", "").replace("{{/if}}", "")
            else:
                # Remove the entire conditional block if has_tasks is false
                start_tag = "{{#if has_tasks}}"
                end_tag = "{{/if}}"
                if start_tag in rendered_html and end_tag in rendered_html:
                    start_index = rendered_html.find(start_tag)
                    end_index = rendered_html.find(end_tag) + len(end_tag)
                    rendered_html = rendered_html[:start_index] + rendered_html[end_index:]
        elif key.startswith('event_'): # Handle optional event fields
            if value is None or value == '':
                # Remove the entire line if the optional field is empty
                rendered_html = '\n'.join([line for line in rendered_html.split('\n') if f"{{{{ {key} }}}}" not in line])
            else:
                rendered_html = rendered_html.replace(f"{{{{ {key} }}}}", str(value))
        else:
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

# NEW: Function to be scheduled by APScheduler
def _send_1week_event_reminders_scheduled():
    """
    This function is called by the APScheduler job.
    It performs the logic of sending 1-week event reminders.
    """
    print(f"Running scheduled 1-week event reminders at {datetime.now()}", file=sys.stdout)
    try:
        today = datetime.now().date()
        one_week_from_now = today + timedelta(days=7)
        one_week_from_now_str = one_week_from_now.isoformat()

        # Fetch events scheduled for exactly one week from now, where reminder hasn't been sent
        events_resp = supabase.table('events').select('*, profiles(email, name, notifications)').eq('date', one_week_from_now_str).is_('one_week_reminder_sent_at', None).execute()
        events_to_remind = events_resp.data if hasattr(events_resp, "data") else events_resp.get("data")

        if not events_to_remind:
            print("No events found for 1-week reminder.", file=sys.stdout)
            return {"message": "No events found for 1-week reminder."}

        sent_count = 0
        failed_sends = []

        for event in events_to_remind:
            user_profile = event.get('profiles')
            if not user_profile:
                print(f"Skipping event {event['id']}: User profile not found.", file=sys.stderr)
                continue

            user_email = user_profile.get('email')
            user_name = user_profile.get('name', user_email.split('@')[0])
            notifications = user_profile.get('notifications', {})

            # Check if 1-week countdown notification is enabled for the user
            if not notifications.get('email_1week_countdown', False):
                print(f"Skipping event {event['id']}: 1-week reminder disabled for user {user_email}.", file=sys.stderr)
                continue

            # Calculate pending task percentage
            event_tasks = event.get('event_tasks', [])
            total_tasks = len(event_tasks)
            pending_tasks = sum(1 for task in event_tasks if not task.get('completed'))
            completed_tasks = total_tasks - pending_tasks
            
            task_completion_percentage = 0
            if total_tasks > 0:
                task_completion_percentage = round((completed_tasks / total_tasks) * 100)

            frontend_url = os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')

            template_data = {
                "user_name": user_name,
                "event_title": event['title'],
                "event_date": datetime.strptime(event['date'], '%Y-%m-%d').strftime('%A, %B %d, %Y'),
                "event_time": event['time'] if event['time'] else 'All Day',
                "event_location": event['location'],
                "event_description": event['description'],
                "has_tasks": total_tasks > 0,
                "pending_tasks_count": pending_tasks,
                "task_completion_percentage": f"{task_completion_percentage}%",
                "frontend_url": frontend_url,
                "current_year": datetime.now().year
            }

            success, details = send_email_api(user_email, "event_1week_reminder", template_data)

            if success:
                # Mark reminder as sent in the database
                supabase.table('events').update({'one_week_reminder_sent_at': datetime.now().isoformat()}).eq('id', event['id']).execute()
                print(f"Sent 1-week reminder for event '{event['title']}' to {user_email}.", file=sys.stdout)
                sent_count += 1
            else:
                failed_sends.append({"event_id": event['id'], "user_email": user_email, "reason": details})
                print(f"Failed to send 1-week reminder for event '{event['title']}' to {user_email}: {details}", file=sys.stderr)

        if failed_sends:
            return {"message": f"Sent {sent_count} reminders, {len(failed_sends)} failed.", "failed_sends": failed_sends}
        else:
            return {"message": f"Successfully sent {sent_count} 1-week event reminders."}

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return {"message": f"An unexpected error occurred while sending 1-week event reminders: {e}"}

# NEW: Function to configure the APScheduler job
def configure_scheduler_job(enabled, reminder_time_str):
    scheduler.remove_all_jobs() # Remove existing jobs to reconfigure

    if enabled:
        try:
            hour, minute = map(int, reminder_time_str.split(':'))
            scheduler.add_job(
                _send_1week_event_reminders_scheduled,
                CronTrigger(hour=hour, minute=minute),
                id='daily_1week_event_reminder',
                replace_existing=True
            )
            print(f"Scheduler: Daily 1-week event reminder job configured for {reminder_time_str}.", file=sys.stdout)
        except ValueError:
            print(f"Scheduler: Invalid reminder_time format: {reminder_time_str}. Job not scheduled.", file=sys.stderr)
    else:
        print("Scheduler: Daily 1-week event reminder job disabled.", file=sys.stdout)

# Flask app lifecycle hooks
@app.before_first_request
def initialize_scheduler():
    print("Initializing APScheduler...", file=sys.stdout)
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown()) # Ensure scheduler shuts down cleanly

    # Load initial settings from DB and configure the job
    settings = _fetch_email_settings_row()
    if settings:
        configure_scheduler_job(settings.get('scheduler_enabled', True), settings.get('reminder_time', '02:00'))
    else:
        # If no settings in DB, use defaults
        configure_scheduler_job(True, '02:00')

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
            scheduler_enabled = settings.get("scheduler_enabled", True) # NEW
            reminder_time = settings.get("reminder_time", "02:00") # NEW

            result = {
                "id": settings.get("id"),
                "maileroo_sending_key": maileroo_sending_key,
                "mail_default_sender": mail_default_sender,
                "scheduler_enabled": scheduler_enabled, # NEW
                "reminder_time": reminder_time # NEW
            }
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
            if 'scheduler_enabled' in settings_data: # NEW
                update_payload['scheduler_enabled'] = settings_data['scheduler_enabled']
            if 'reminder_time' in settings_data: # NEW
                update_payload['reminder_time'] = settings_data['reminder_time']
            
            existing_settings = _fetch_email_settings_row()
            if not existing_settings:
                ins_resp = supabase.table('email_settings').insert(update_payload).execute()
                inserted = ins_resp.data[0] if hasattr(ins_resp, "data") and ins_resp.data else {}
                # Configure scheduler immediately after insert
                configure_scheduler_job(inserted.get('scheduler_enabled', True), inserted.get('reminder_time', '02:00'))
                return jsonify({"message": "Settings created successfully", "settings": inserted}), 201
            else:
                settings_id = existing_settings.get('id')
                resp = supabase.table('email_settings').update(update_payload).eq('id', settings_id).execute()
                updated = resp.data[0] if hasattr(resp, "data") and resp.data else {}
                # Reconfigure scheduler immediately after update
                configure_scheduler_job(updated.get('scheduler_enabled', True), updated.get('reminder_time', '02:00'))
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
        frontend_url = os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173')
        template_data = {
            "user_name": "DayClap User",
            "frontend_url": frontend_url,
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

# Endpoint to send welcome email, called by Supabase trigger
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

# API Endpoints for Email Template Management
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

# NEW: Endpoint to get scheduler status
@app.route('/api/admin/scheduler-status', methods=['GET'])
@cross_origin()
def get_scheduler_status():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    try:
        job = scheduler.get_job('daily_1week_event_reminder')
        status = {
            "is_running": scheduler.running,
            "job_scheduled": job is not None,
            "next_run_time": job.next_run_time.isoformat() if job and job.next_run_time else None
        }
        return jsonify(status), 200
    except Exception as e:
        print(f"Error getting scheduler status: {e}", file=sys.stderr)
        return jsonify({"message": f"Error getting scheduler status: {e}"}), 500

# NEW: Endpoint to control scheduler (start/stop)
@app.route('/api/admin/scheduler-control', methods=['POST'])
@cross_origin()
def control_scheduler():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):
        return jsonify({"message": "Unauthorized access"}), 403

    data = request.get_json() or {}
    action = data.get('action') # 'start' or 'stop'

    if action == 'start':
        if not scheduler.running:
            scheduler.start()
            print("Scheduler started via API.", file=sys.stdout)
            return jsonify({"message": "Scheduler started."}), 200
        else:
            return jsonify({"message": "Scheduler is already running."}), 200
    elif action == 'stop':
        if scheduler.running:
            scheduler.shutdown(wait=False) # Don't wait for running jobs
            print("Scheduler stopped via API.", file=sys.stdout)
            return jsonify({"message": "Scheduler stopped."}), 200
        else:
            return jsonify({"message": "Scheduler is already stopped."}), 200
    else:
        return jsonify({"message": "Invalid action. Must be 'start' or 'stop'."}), 400

# This endpoint is no longer needed as the function is called internally by APScheduler
# @app.route('/api/send-1week-event-reminders', methods=['POST'])
# @cross_origin()
# def send_1week_event_reminders():
#     # Security check: Verify API Key
#     api_key_header = request.headers.get('X-API-Key')
#     if not BACKEND_API_KEY or api_key_header != BACKEND_API_KEY:
#         print(f"Unauthorized access attempt to /api/send-1week-event-reminders. Provided key: {api_key_header}", file=sys.stderr)
#         return jsonify({"message": "Unauthorized"}), 403
#     
#     # Call the internal scheduled function
#     result = _send_1week_event_reminders_scheduled()
#     return jsonify(result), 200


if __name__ == '__main__':
    # Ensure scheduler is initialized before running the app
    with app.app_context():
        initialize_scheduler()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, port=port)

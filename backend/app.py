import os
import sys
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from supabase import create_client, Client
import requests
from dotenv import load_dotenv, find_dotenv # NEW: Import find_dotenv
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit
from pywebpush import webpush, WebPushException
import json

# Load environment variables from .env file
# CRITICAL FIX: Explicitly specify the path to the .env file in the same directory as app.py
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=dotenv_path)

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

# NEW: VAPID Keys for Push Notifications
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_CLAIMS = {"sub": "mailto:admin@example.com"} # Replace with a real email for production

if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
    print("WARNING: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set. Push notifications will not work.", file=sys.stderr)

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
                # CRITICAL FIX: Use '\n' for splitting and joining, not '\\n'
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

    # CORRECTED: maileroo_payload as a proper Python dictionary
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
        "subject": email_subject,
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

# NEW: Helper function to send a web push notification
def send_push_notification(subscription_info, message_payload):
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        print("VAPID keys not configured. Cannot send push notification.", file=sys.stderr)
        return False, "VAPID keys not configured."

    try:
        # CRITICAL FIX: Ensure message_payload is a JSON string before passing to webpush
        json_payload = json.dumps(message_payload)

        webpush(
            subscription_info=subscription_info,
            data=json_payload, # Pass the JSON string here
            vapid_private_key=VAPID_PRIVATE_KEY,
            # REMOVED: vapid_public_key=VAPID_PUBLIC_KEY, # This argument is not expected by pywebpush
            vapid_claims=VAPID_CLAIMS,
            timeout=10
        )
        return True, "Push notification sent."
    except WebPushException as e:
        print(f"WebPush Error: {e}", file=sys.stderr)
        # Handle specific errors like GCMTooManyRegistrations, GCMNotRegistered, etc.
        # For GCMNotRegistered, you might want to delete the subscription from your DB.
        if e.response and e.response.status_code == 410: # GCMNotRegistered / Gone
            print(f"Subscription {subscription_info.get('endpoint')} is no longer valid. Consider deleting it.", file=sys.stderr)
            return False, "Subscription no longer valid."
        return False, f"Failed to send push notification: {e}"
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return False, f"An unexpected error occurred sending push: {e}"

# NEW: Function to be scheduled by APScheduler
def _send_1week_event_reminders_scheduled():
    """
    This function is called by the APScheduler job.
    It performs the logic of sending 1-week event reminders (email and push).
    """
    print(f"Running scheduled 1-week event reminders at {datetime.now()}", file=sys.stdout)
    try:
        today = datetime.now().date()
        one_week_from_now = today + timedelta(days=7)
        one_week_from_now_str = one_week_from_now.isoformat()

        # Fetch events scheduled for exactly one week from now, where reminder hasn't been sent
        events_resp = supabase.table('events').select('*, profiles(email, name, notifications, push_subscription)').eq('date', one_week_from_now_str).is_('one_week_reminder_sent_at', None).execute()
        events_to_remind = events_resp.data if hasattr(events_resp, "data") else events_resp.get("data")

        if not events_to_remind:
            print("No events found for 1-week reminder.", file=sys.stdout)
            return {"message": "No events found for 1-week reminder."}

        sent_email_count = 0
        sent_push_count = 0
        failed_sends = []

        for event in events_to_remind:
            user_profile = event.get('profiles')
            if not user_profile:
                print(f"Skipping event {event['id']}: User profile not found.", file=sys.stderr)
                continue

            user_email = user_profile.get('email')
            user_name = user_profile.get('name', user_email.split('@')[0])
            notifications = user_profile.get('notifications', {})
            push_subscription_info = user_profile.get('push_subscription')

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

            # Send Email Reminder if enabled
            if notifications.get('email_1week_countdown', False):
                email_success, email_details = send_email_api(user_email, "event_1week_reminder", template_data)
                if email_success:
                    print(f"Sent 1-week EMAIL reminder for event '{event['title']}' to {user_email}.", file=sys.stdout)
                    sent_email_count += 1
                else:
                    failed_sends.append({"type": "email", "event_id": event['id'], "user_email": user_email, "reason": email_details})
                    print(f"Failed to send 1-week EMAIL reminder for event '{event['title']}' to {user_email}: {email_details}", file=sys.stderr)
            else:
                print(f"Skipping email reminder for event {event['id']}: 1-week email reminder disabled for user {user_email}.", file=sys.stdout)

            # Send Push Notification if enabled and subscription exists
            if notifications.get('push', False) and push_subscription_info:
                push_payload = {
                    "title": f"Upcoming Event: {event['title']}",
                    "body": f"Your event '{event['title']}' is one week away on {template_data['event_date']} at {template_data['event_time']}.",
                    "icon": "/icon-192.png", # Ensure this path is correct for your frontend
                    "url": frontend_url # Link to open when notification is clicked
                }
                push_success, push_details = send_push_notification(push_subscription_info, push_payload)
                if push_success:
                    print(f"Sent 1-week PUSH reminder for event '{event['title']}' to {user_email}.", file=sys.stdout)
                    sent_push_count += 1
                else:
                    failed_sends.append({"type": "push", "event_id": event['id'], "user_email": user_email, "reason": push_details})
                    print(f"Failed to send 1-week PUSH reminder for event '{event['title']}' to {user_email}: {push_details}", file=sys.stderr)
                    # If subscription is no longer valid (410 Gone), remove it from DB
                    if "Subscription no longer valid" in push_details:
                        supabase.table('profiles').update({'push_subscription': None}).eq('id', user_profile['id']).execute()
                        print(f"Removed invalid push subscription for user {user_email}.", file=sys.stderr)
            else:
                print(f"Skipping push reminder for event {event['id']}: Push notifications disabled or no subscription for user {user_email}.", file=sys.stdout)

            # Mark reminder as sent in the database if at least one notification type was sent successfully
            if (notifications.get('email_1week_countdown', False) and email_success) or \
               (notifications.get('push', False) and push_subscription_info and push_success):
                supabase.table('events').update({'one_week_reminder_sent_at': datetime.now().isoformat()}).eq('id', event['id']).execute()


        if failed_sends:
            return {"message": f"Sent {sent_email_count} email reminders, {sent_push_count} push reminders. {len(failed_sends)} failed.", "failed_sends": failed_sends}
        else:
            return {"message": f"Successfully sent {sent_email_count} email and {sent_push_count} push 1-week event reminders."}

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
            print(f"Scheduler: Daily 1-week event reminder job configured for {reminder_time_str}. (UTC)", file=sys.stdout)
        except ValueError:
            print(f"Scheduler: Invalid reminder_time format: {reminder_time_str}. Job not scheduled.", file=sys.stderr)
    else:
        print("Scheduler: Daily 1-week event reminder job disabled.", file=sys.stdout)

# NEW: Function to initialize and configure APScheduler
def initialize_and_configure_scheduler():
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

# Call the scheduler initialization function when the module is loaded.
# This will run once per Gunicorn worker process.
initialize_and_configure_scheduler()

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "DayClap API is running"}), 200

# NEW: Endpoint to fetch VAPID Public Key for frontend
@app.route('/api/vapid-public-key', methods=['GET'])
@cross_origin()
def get_vapid_public_key():
    if not VAPID_PUBLIC_KEY:
        return jsonify({"message": "VAPID public key not configured on backend."}), 500
    return jsonify({"publicKey": VAPID_PUBLIC_KEY}), 200

# NEW: Endpoint to subscribe to push notifications
@app.route('/api/subscribe-push', methods=['POST'])
@cross_origin()
def subscribe_push():
    data = request.get_json()
    if not data or not data.get('endpoint') or not data.get('keys'):
        return jsonify({"message": "Invalid subscription data"}), 400

    # Get user ID from Authorization header (assuming JWT is passed)
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):\
        return jsonify({"message": "Authorization token required"}), 401
    
    # In a real app, you'd verify the JWT and extract user_id.
    # For simplicity here, we'll assume the user ID is passed or derived securely.
    # For now, we'll rely on the frontend passing the access_token, so we can use it to get the user ID.
    try:
        session_resp = supabase.auth.get_user(auth_header.split(' ')[1])
        user_id = session_resp.user.id
    except Exception as e:
        print(f"Error getting user from token: {e}", file=sys.stderr)
        return jsonify({"message": "Invalid or expired token"}), 401

    try:
        # Update the user's profile with the push subscription
        resp = supabase.table('profiles').update({'push_subscription': data}).eq('id', user_id).execute()
        if hasattr(resp, "data") and resp.data:
            return jsonify({"message": "Push subscription saved successfully"}), 200
        else:
            return jsonify({"message": "Failed to save push subscription to profile"}), 500
    except Exception as e:
        print(f"Error saving push subscription: {e}", file=sys.stderr)
        return jsonify({"message": f"Error saving push subscription: {e}"}), 500

# NEW: Endpoint to unsubscribe from push notifications
@app.route('/api/unsubscribe-push', methods=['POST'])
@cross_origin()
def unsubscribe_push():
    data = request.get_json()
    if not data or not data.get('endpoint'):
        return jsonify({"message": "Endpoint is required"}), 400

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):\
        return jsonify({"message": "Authorization token required"}), 401
    
    try:
        session_resp = supabase.auth.get_user(auth_header.split(' ')[1])
        user_id = session_resp.user.id
    except Exception as e:
        print(f"Error getting user from token: {e}", file=sys.stderr)
        return jsonify({"message": "Invalid or expired token"}), 401

    try:
        # Set push_subscription to NULL for the user
        resp = supabase.table('profiles').update({'push_subscription': None}).eq('id', user_id).execute()
        if hasattr(resp, "data") and resp.data:
            return jsonify({"message": "Push subscription removed successfully"}), 200
        else:
            return jsonify({"message": "Failed to remove push subscription from profile"}), 500
    except Exception as e:
        print(f"Error removing push subscription: {e}", file=sys.stderr)
        return jsonify({"message": f"Error removing push subscription: {e}"}), 500

# NEW: Admin endpoint to send a test push notification to a specific user
@app.route('/api/admin/send-test-push', methods=['POST'])
@cross_origin()
def send_test_push():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):\
        return jsonify({"message": "Unauthorized access"}), 403

    data = request.get_json() or {}
    recipient_email = data.get('recipient_email')
    message_title = data.get('title', 'Test Push Notification')
    message_body = data.get('body', 'This is a test push notification from DayClap backend.')
    message_url = data.get('url', os.environ.get('VITE_FRONTEND_URL', '/'))

    if not recipient_email:
        return jsonify({"message": "Recipient email is required"}), 400

    try:
        # Fetch the user's profile to get their push subscription
        # CRITICAL FIX: Use maybe_single() to handle cases where no profile or subscription is found gracefully
        profile_resp = supabase.table('profiles').select('push_subscription').eq('email', recipient_email).maybe_single().execute()
        profile = profile_resp.data if hasattr(profile_resp, "data") else profile_resp.get("data")

        if not profile or not profile.get('push_subscription'):
            return jsonify({"message": f"User {recipient_email} has no active push subscription. Please ensure the user exists and has enabled push notifications in their settings."}), 404

        push_subscription_info = profile['push_subscription']
        push_payload = {
            "title": message_title,
            "body": message_body,
            "icon": "/icon-192.png",
            "url": message_url
        }

        success, details = send_push_notification(push_subscription_info, push_payload)

        if success:
            return jsonify({"message": "Test push notification sent successfully!", "details": details}), 200
        else:
            return jsonify({"message": "Failed to send test push notification.", "details": details}), 500

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

@app.route('/api/admin/email-settings', methods=['GET', 'PUT'])
@cross_origin()
def email_settings():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):\
        return jsonify({"message": "Unauthorized access"}), 403

    if request.method == 'GET':
        try:
            settings = _fetch_email_settings_row() or {}
            maileroo_sending_key = (settings.get("maileroo_sending_key") or os.environ.get("MAILEROO_SENDING_KEY") or os.environ.get("MAILEROO_API_KEY") or "")
            mail_default_sender = (settings.get("mail_default_sender") or os.environ.get("MAIL_DEFAULT_SENDER") or "no-reply@team.dayclap.com")
            scheduler_enabled = settings.get("scheduler_enabled", True) # NEW
            reminder_time = settings.get("reminder_time", "02:00") # NEW

            result = {\
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
@cross_origin()
def send_test_email():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):\
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
@cross_origin()
def send_invitation():
    data = request.get_json() or {}
    required_fields = ['sender_id', 'sender_email', 'recipient_email', 'company_id', 'company_name', 'role']
    if not all(field in data for field in required_fields):
        return jsonify({"message": "Missing required fields"}), 400

    # NEW: Prevent user from inviting themselves
    if data['sender_email'].lower() == data['recipient_email'].lower():
        return jsonify({"message": "You cannot invite yourself to a company."}), 400

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

# NEW: Endpoint to send "Task Assigned" email notification
@app.route('/api/notify-task-assigned', methods=['POST'])
@cross_origin()
def notify_task_assigned():
    """
    Body JSON:
    {
      assigned_to_email: string (required),
      assigned_to_name: string,
      assigned_by_email: string,
      assigned_by_name: string,
      event_title: string (required),
      event_date: string (YYYY-MM-DD),
      event_time: string,
      company_name: string,
      task_title: string,
      task_description: string,
      due_date: string (YYYY-MM-DD)
    }
    """
    try:
      data = request.get_json() or {}
      assigned_to_email = (data.get('assigned_to_email') or '').strip().lower()
      if not assigned_to_email:
          return jsonify({"message": "assigned_to_email is required"}), 400
      if not data.get('event_title'):
          return jsonify({"message": "event_title is required"}), 400

      # Prepare template data with sensible fallbacks
      template_data = {
          "assignee_name": data.get("assigned_to_name") or assigned_to_email.split('@')[0],
          "assignee_email": assigned_to_email,
          "assigned_by_name": data.get("assigned_by_name") or "A teammate",
          "assigned_by_email": data.get("assigned_by_email") or "",
          "event_title": data.get("event_title") or "Event",
          "event_date": data.get("event_date") or "",
          "event_time": data.get("event_time") or "",
          "company_name": data.get("company_name") or "",
          "task_title": data.get("task_title") or "",
          "task_description": data.get("task_description") or "",
          "due_date": data.get("due_date") or "",
          "frontend_url": os.environ.get('VITE_FRONTEND_URL', 'http://localhost:5173'),
          "current_year": datetime.now().year
      }

      ok, details = send_email_api(assigned_to_email, "task_assigned", template_data)
      if ok:
          return jsonify({"message": "Task assignment email sent.", "details": details}), 200
      return jsonify({"message": "Failed to send task assignment email.", "details": details}), 500
    except Exception as e:
      traceback.print_exc(file=sys.stderr)
      return jsonify({"message": f"Unexpected error: {e}"}), 500

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
            return jsonify({"message": "Welcome email sent successfully! (via trigger)", "details": details}), 200
        else:
            return jsonify({"message": "Failed to send welcome email (via trigger).", "details": details}), 500

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

# API Endpoints for Email Template Management
@app.route('/api/admin/email-templates', methods=['GET', 'POST'])
@cross_origin()
def email_templates_management():
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):\
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
@cross_origin()
def email_template_detail_management(template_id):
    user_email = request.headers.get('X-User-Email')
    if not is_super_admin(user_email):\
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
    if not is_super_admin(user_email):\
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
    if not is_super_admin(user_email):\
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
#     # api_key_header = request.headers.get('X-API-Key')
#     # if not BACKEND_API_KEY or api_key_header != BACKEND_API_KEY:
#     #     print(f"Unauthorized access attempt to /api/send-1week-event-reminders. Provided key: {api_key_header}", file=sys.stderr)
#     #     return jsonify({"message": "Unauthorized"}), 403
#     
#     # Call the internal scheduled function
#     # result = _send_1week_event_reminders_scheduled()
#     # return jsonify(result), 200


if __name__ == '__main__':
    # When running directly (e.g., `python app.py`), the scheduler is already initialized
    # by the call to `initialize_and_configure_scheduler()` above.
    # We just need to run the Flask app.
    port = int(os.environ.get('PORT', 5001)) # Changed port to 5001
    app.run(debug=True, port=port)

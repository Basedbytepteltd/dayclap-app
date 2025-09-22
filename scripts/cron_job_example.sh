#!/bin/bash

# This script is an example of how you might set up a cron job
# to trigger the daily 1-week event reminders.

# IMPORTANT:
# 1. Replace YOUR_BACKEND_URL with the actual URL of your deployed Flask backend.
# 2. Replace YOUR_BACKEND_API_KEY with the value you set for BACKEND_API_KEY in backend/.env.
# 3. Ensure your backend is deployed and accessible at the specified URL.
# 4. This script should be run on a server where you can configure cron jobs.

BACKEND_URL="https://dayclap-backend-api.onrender.com" # Example: Your deployed backend URL
API_KEY="your_strong_unique_key_for_supabase_trigger_calls" # Must match BACKEND_API_KEY in backend/.env

echo "Attempting to send 1-week event reminders at $(date)"

curl -X POST \
     -H "X-API-Key: ${API_KEY}" \
     -H "Content-Type: application/json" \
     "${BACKEND_URL}/api/send-1week-event-reminders"

echo "1-week event reminder request sent."

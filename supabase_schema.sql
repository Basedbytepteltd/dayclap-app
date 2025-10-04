-- This script sets up the database schema for the DayClap application.
-- It includes tables for user profiles, companies, events, tasks, invitations,
-- email settings, and email templates.
-- It also defines Row Level Security (RLS) policies for secure data access,
-- and database functions and triggers for automated actions.

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions; -- For HTTP requests from triggers
CREATE EXTENSION IF NOT EXISTS pg_cron; -- For scheduled jobs

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Profiles table to store additional user information
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  -- Store an array of company objects the user belongs to
  -- Example: [{ id: 'uuid', name: 'Company A', role: 'owner', createdAt: 'iso-date' }]
  companies JSONB DEFAULT '[]'::jsonb NOT NULL,
  current_company_id UUID, -- The ID of the company currently active for the user
  currency TEXT DEFAULT 'USD' NOT NULL, -- User's preferred currency
  theme TEXT DEFAULT 'system' NOT NULL, -- 'light', 'dark', or 'system'
  language TEXT DEFAULT 'en' NOT NULL, -- User's preferred language
  timezone TEXT DEFAULT 'UTC' NOT NULL, -- User's preferred IANA timezone
  -- Notification preferences (JSONB object)
  notifications JSONB DEFAULT '{"email_daily": true, "email_weekly": false, "email_monthly": false, "email_3day_countdown": false, "email_1week_countdown": true, "push": true, "reminders": true, "invitations": true}'::jsonb NOT NULL,
  -- Privacy settings (JSONB object)
  privacy JSONB DEFAULT '{"profileVisibility": "team", "calendarSharing": "private"}'::jsonb NOT NULL,
  account_type TEXT DEFAULT 'personal' NOT NULL, -- 'personal' or 'business'
  push_subscription JSONB, -- Web Push API subscription object
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL -- Track last user activity
);

-- Events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  company_id UUID, -- Optional: Link to a company if it's a company event
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  -- NEW: Use TIMESTAMP WITH TIME ZONE for event_datetime
  event_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60 NOT NULL, -- Duration in minutes
  -- Old 'date' and 'time' columns are removed after migration
  -- date DATE NOT NULL,
  -- time TEXT,
  event_tasks JSONB DEFAULT '[]'::jsonb NOT NULL, -- Embedded tasks for the event
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  one_week_reminder_sent_at TIMESTAMP WITH TIME ZONE -- To track if 1-week reminder was sent
);

-- Invitations table for inviting users to companies
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  sender_email TEXT NOT NULL, -- Store sender email for display
  recipient_email TEXT NOT NULL,
  company_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL, -- 'user' or 'admin'
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days') NOT NULL
);

-- Email Settings table (for Maileroo API key, default sender, etc.)
CREATE TABLE IF NOT EXISTS public.email_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  maileroo_sending_key TEXT,
  maileroo_api_endpoint TEXT DEFAULT 'https://smtp.maileroo.com/api/v2/emails' NOT NULL,
  mail_default_sender TEXT DEFAULT 'no-reply@team.dayclap.com' NOT NULL,
  scheduler_enabled BOOLEAN DEFAULT TRUE NOT NULL, -- Enable/disable daily reminder scheduler
  reminder_time TEXT DEFAULT '02:00' NOT NULL, -- HH:MM format for daily reminders (UTC)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Email Templates table
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL, -- e.g., 'welcome_email', 'invitation_to_company', 'task_assigned'
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

-- Enable RLS on tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete their own profile." ON public.profiles;
CREATE POLICY "Users can delete their own profile." ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- Events RLS
DROP POLICY IF EXISTS "Users can view their own events." ON public.events;
CREATE POLICY "Users can view their own events." ON public.events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own events." ON public.events;
CREATE POLICY "Users can insert their own events." ON public.events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own events." ON public.events;
CREATE POLICY "Users can update their own events." ON public.events
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own events." ON public.events;
CREATE POLICY "Users can delete their own events." ON public.events
  FOR DELETE USING (auth.uid() = user_id);

-- Invitations RLS
DROP POLICY IF EXISTS "Users can view their own sent and received invitations." ON public.invitations;
CREATE POLICY "Users can view their own sent and received invitations." ON public.invitations
  FOR SELECT USING (auth.uid() = sender_id OR auth.email() = recipient_email);

DROP POLICY IF EXISTS "Users can insert their own invitations." ON public.invitations;
CREATE POLICY "Users can insert their own invitations." ON public.invitations
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update their own invitations (e.g., status)." ON public.invitations;
CREATE POLICY "Users can update their own invitations (e.g., status)." ON public.invitations
  FOR UPDATE USING (auth.uid() = sender_id OR auth.email() = recipient_email);

DROP POLICY IF EXISTS "Users can delete their own invitations." ON public.invitations;
CREATE POLICY "Users can delete their own invitations." ON public.invitations
  FOR DELETE USING (auth.uid() = sender_id OR auth.email() = recipient_email);

-- Email Settings RLS (only service role can manage, or specific admin user)
DROP POLICY IF EXISTS "Allow service role to manage email settings." ON public.email_settings;
CREATE POLICY "Allow service role to manage email settings." ON public.email_settings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Email Templates RLS (only service role can manage, or specific admin user)
DROP POLICY IF EXISTS "Allow service role to manage email templates." ON public.email_templates;
CREATE POLICY "Allow service role to manage email templates." ON public.email_templates
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Function to update 'updated_at' column automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create a new profile for a new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _account_type TEXT;
    _name TEXT;
    _company_name TEXT;
    _company_id UUID;
    _companies JSONB;
BEGIN
    RAISE NOTICE 'handle_new_user: Processing new user % with email %', NEW.id, NEW.email;
    -- Extract metadata from new user (if available)
    _name := NEW.raw_user_meta_data->>'name';
    _account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'personal');
    _company_name := NEW.raw_user_meta_data->>'company_name_signup';

    _companies := '[]'::jsonb;
    _company_id := NULL;

    IF _account_type = 'business' AND _company_name IS NOT NULL AND _company_name != '' THEN
        _company_id := uuid_generate_v4();
        _companies := jsonb_build_array(jsonb_build_object(
            'id', _company_id,
            'name', _company_name,
            'role', 'owner',
            'createdAt', NOW()::text
        ));
        RAISE NOTICE 'handle_new_user: Created new company % for business account %', _company_name, NEW.email;
    END IF;

    INSERT INTO public.profiles (id, name, email, account_type, companies, current_company_id)
    VALUES (
        NEW.id,
        COALESCE(_name, NEW.email), -- Use name from metadata, fallback to email
        NEW.email,
        _account_type,
        _companies,
        _company_id
    );
    RAISE NOTICE 'handle_new_user: Profile created for user %', NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send welcome email via the Supabase Edge Function (direct Resend sender)
CREATE OR REPLACE FUNCTION public.send_welcome_email_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
    _edge_function_url TEXT;
    _supabase_url TEXT;
    _supabase_anon_key TEXT;
    _request_body JSONB;
    _response_status INT;
    _response_body TEXT;
    _user_name TEXT;
BEGIN
    RAISE NOTICE 'send_welcome_email_on_confirm: Function started for user % (OLD.email_confirmed_at: %, NEW.email_confirmed_at: %)', NEW.email, OLD.email_confirmed_at, NEW.email_confirmed_at;

    -- Only send if email is confirmed and it's a new user (INSERT)
    -- CRITICAL FIX: For OTP flow, email_confirmed_at is updated AFTER initial INSERT.
    -- This trigger should now be AFTER UPDATE ON auth.users and check for the transition.
    IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
        RAISE NOTICE 'send_welcome_email_on_confirm: User % email confirmed. Proceeding to invoke Edge Function (currently bypassed).', NEW.email;

        -- TEMPORARILY BYPASSING pg_net CALLS DUE TO `getenv` ERROR
        -- This section is commented out to allow user signup to proceed.
        -- We will re-enable and debug this once the primary auth flow is stable.

        -- _supabase_url := extensions.getenv('SUPABASE_URL');
        -- _supabase_anon_key := extensions.getenv('VITE_SUPABASE_ANON_KEY');

        -- RAISE NOTICE 'send_welcome_email_on_confirm: Retrieved SUPABASE_URL: %', COALESCE(_supabase_url, 'NULL');
        -- RAISE NOTICE 'send_welcome_email_on_confirm: Retrieved VITE_SUPABASE_ANON_KEY (masked): %', COALESCE(LEFT(_supabase_anon_key, 5) || '...', 'NULL');

        -- IF _supabase_url IS NULL OR _supabase_anon_key IS NULL THEN
        --     RAISE WARNING 'send_welcome_email_on_confirm: Supabase URL or Anon Key not set. Cannot invoke welcome email Edge Function.';
        --     RETURN NEW;
        -- END IF;

        -- _edge_function_url := _supabase_url || '/functions/v1/send-welcome-email-proxy'; -- Name of your Edge Function
        -- _user_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email);
        -- _request_body := jsonb_build_object(
        --     'email', NEW.email,
        --     'user_name', _user_name
        -- );

        -- RAISE NOTICE 'send_welcome_email_on_confirm: Preparing to call Edge Function: % with body: %', _edge_function_url, _request_body;

        -- -- Use pg_net to send HTTP POST request to the Edge Function
        -- SELECT
        --     status,
        --     content::text
        -- INTO
        --     _response_status,
        --     _response_body
        -- FROM
        --     extensions.http_post(
        --         _edge_function_url,
        --         _request_body,
        --         ARRAY[
        --             extensions.http_header('Content-Type', 'application/json'),
        --             extensions.http_header('Authorization', 'Bearer ' || _supabase_anon_key)
        --         ]
        --     );

        -- IF _response_status >= 200 AND _response_status < 300 THEN
        --     RAISE NOTICE 'send_welcome_email_on_confirm: Welcome email sent successfully via Edge Function for user % (status: %)', NEW.email, _response_status;
        -- ELSE
        --     RAISE WARNING 'send_welcome_email_on_confirm: Failed to send welcome email via Edge Function for user % (status: %, response: %)', NEW.email, _response_status, _response_body;
        --     -- CRITICAL: If the Edge Function fails, the trigger will cause a 500.
        --     -- To prevent this, we can catch the error and return, or re-raise a more specific error.
        --     -- For now, let's just log and return, allowing the user confirmation to proceed.
        --     -- If we want to *block* user confirmation on email failure, we'd need to RAISE EXCEPTION.
        --     -- For initial debugging, just logging is better.
        -- END IF;
        RAISE NOTICE 'send_welcome_email_on_confirm: Welcome email sending logic currently bypassed due to pg_net issue. User % confirmed.', NEW.email;
    ELSE
        RAISE NOTICE 'send_welcome_email_on_confirm: Condition not met for user % (email_confirmed_at not changed from NULL to NOT NULL).', NEW.email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept an invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    invitation_record RECORD;
    user_profile_record RECORD;
    current_user_id UUID := auth.uid();
    current_user_email TEXT := auth.email();
    updated_companies JSONB;
    company_exists BOOLEAN;
BEGIN
    -- Check if the current user is authenticated
    IF current_user_id IS NULL THEN
        RETURN 'Error: User not authenticated.';
    END IF;

    -- Fetch the invitation
    SELECT * INTO invitation_record FROM public.invitations WHERE id = invitation_id;

    IF NOT FOUND THEN
        RETURN 'Error: Invitation not found.';
    END IF;

    -- Check if the invitation is for the current user's email
    IF invitation_record.recipient_email IS DISTINCT FROM current_user_email THEN
        RETURN 'Error: This invitation is not for your email address.';
    END IF;

    -- Check if the invitation is still pending
    IF invitation_record.status != 'pending' THEN
        RETURN 'Error: Invitation is no longer pending (status: ' || invitation_record.status || ').';
    END IF;

    -- Check if the invitation has expired
    IF invitation_record.expires_at < NOW() THEN
        RETURN 'Error: Invitation has expired.';
    END IF;

    -- Fetch the current user's profile
    SELECT * INTO user_profile_record FROM public.profiles WHERE id = current_user_id;

    IF NOT FOUND THEN
        RETURN 'Error: User profile not found.';
    END IF;

    -- Check if the user is already part of this company
    company_exists := EXISTS (
        SELECT 1
        FROM jsonb_array_elements(user_profile_record.companies) AS company
        WHERE (company->>'id')::UUID = invitation_record.company_id
    );

    IF company_exists THEN
        -- If already a member, just update the invitation status
        UPDATE public.invitations
        SET status = 'accepted', updated_at = NOW()
        WHERE id = invitation_id;
        RETURN 'Success: You are already a member of this company. Invitation status updated.';
    ELSE
        -- Add the company to the user's companies array
        updated_companies := user_profile_record.companies || jsonb_build_object(
            'id', invitation_record.company_id,
            'name', invitation_record.company_name,
            'role', invitation_record.role,
            'createdAt', NOW()::text
        );

        UPDATE public.profiles
        SET
            companies = updated_companies,
            -- If user has no current company, or if this is their first company, set it as current
            current_company_id = COALESCE(user_profile_record.current_company_id, invitation_record.company_id),
            updated_at = NOW()
        WHERE id = current_user_id;

        -- Update invitation status
        UPDATE public.invitations
        SET status = 'accepted', updated_at = NOW()
        WHERE id = invitation_id;

        RETURN 'Success: You have joined ' || invitation_record.company_name || '.';
    END IF;
END;
$$;

-- Function to decline an invitation
CREATE OR REPLACE FUNCTION public.decline_invitation(invitation_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    invitation_record RECORD;
    current_user_email TEXT := auth.email();
BEGIN
    -- Check if the current user is authenticated
    IF auth.uid() IS NULL THEN
        RETURN 'Error: User not authenticated.';
    END IF;

    -- Fetch the invitation
    SELECT * INTO invitation_record FROM public.invitations WHERE id = invitation_id;

    IF NOT FOUND THEN
        RETURN 'Error: Invitation not found.';
    END IF;

    -- Check if the invitation is for the current user's email
    IF invitation_record.recipient_email IS DISTINCT FROM current_user_email THEN
        RETURN 'Error: This invitation is not for your email address.';
    END IF;

    -- Check if the invitation is still pending
    IF invitation_record.status != 'pending' THEN
        RETURN 'Error: Invitation is no longer pending (status: ' || invitation_record.status || ').';
    END IF;

    -- Update invitation status to declined
    UPDATE public.invitations
    SET status = 'declined', updated_at = NOW()
    WHERE id = invitation_id;

    RETURN 'Success: Invitation declined.';
END;
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Trigger to create a public.profile entry when a new user signs up in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to send welcome email after user is created and email is confirmed
-- CRITICAL FIX: Changed to AFTER UPDATE and modified function logic for OTP flow.
DROP TRIGGER IF EXISTS send_welcome_email_trigger ON auth.users;
CREATE TRIGGER send_welcome_email_trigger
AFTER UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.send_welcome_email_on_confirm();

-- Triggers to update 'updated_at' column
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;
CREATE TRIGGER set_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_invitations_updated_at ON public.invitations;
CREATE TRIGGER set_invitations_updated_at
BEFORE UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_email_settings_updated_at ON public.email_settings;
CREATE TRIGGER set_email_settings_updated_at
BEFORE UPDATE ON public.email_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER set_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Initial Data / Seed Data
-- -----------------------------------------------------------------------------\n
-- Insert default email settings if none exist
INSERT INTO public.email_settings (maileroo_sending_key, mail_default_sender, maileroo_api_endpoint, scheduler_enabled, reminder_time)
SELECT
    'YOUR_MAILEROO_API_KEY_HERE', -- Placeholder, should be updated via dashboard or ENV
    'DayClap Notifications <no-reply@team.dayclap.com>',
    'https://smtp.maileroo.com/api/v2/emails',
    TRUE,
    '02:00'
WHERE NOT EXISTS (SELECT 1 FROM public.email_settings);

-- Insert default email templates if they don't exist
INSERT INTO email_templates (name, subject, html_content)
SELECT 'welcome_email', 'Welcome to DayClap!',
$$<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 20px; line-height: 1.6; color: #333333; }
        .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; border-radius: 5px; text-decoration: none; margin-top: 15px; }
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
            <p>Welcome to DayClap, your smart calendar companion! We're excited to help you streamline your schedule, manage tasks effortlessly, and never miss important meetings.</p>
            <p>To get started, log in to your dashboard and explore all the features.</p>
            <a href="{{ frontend_url }}" class="button">Go to Dashboard</a>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Happy scheduling!</p>
        </div>
        <div class="footer">
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'welcome_email');

INSERT INTO email_templates (name, subject, html_content)
SELECT 'invitation_to_company', 'You''re Invited to Join {{ company_name }} on DayClap!',
$$<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 20px; line-height: 1.6; color: #333333; }
        .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; border-radius: 5px; text-decoration: none; margin-top: 15px; }
        .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Invitation to Join a Company</h2>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>You have been invited by <strong>{{ sender_email }}</strong> to join the company <strong>{{ company_name }}</strong> on DayClap as a <strong>{{ role }}</strong>.</p>
            <p>DayClap helps teams manage their schedules, events, and tasks collaboratively.</p>
            <p>To accept this invitation and join the company, please log in to your DayClap account and navigate to your company settings or simply click the button below:</p>
            <a href="{{ frontend_url }}/settings?tab=company-team&subtab=invitations" class="button">View Invitation</a>
            <p>If you don't have a DayClap account, you can sign up using this email address to accept the invitation.</p>
            <p>We look forward to having you!</p>
        </div>
        <div class="footer">
            <p>If you did not expect this invitation, please ignore this email.</p>
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'invitation_to_company');

INSERT INTO email_templates (name, subject, html_content)
SELECT 'task_assigned', 'You have been assigned a new task in DayClap!',
$$<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 20px; line-height: 1.6; color: #333333; }
        .task-details { background-color: #e7f3ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .task-details p { margin: 5px 0; }
        .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; border-radius: 5px; text-decoration: none; margin-top: 15px; }
        .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>New Task Assigned!</h2>
        </div>
        <div class="content">
            <p>Hello {{ assignee_name }},</p>
            <p><strong>{{ assigned_by_name }}</strong> ({{ assigned_by_email }}) has assigned you a new task in DayClap:</p>
            <div class="task-details">
                <p><strong>Task:</strong> {{ task_title }}</p>
                {{#if task_description}}<p><strong>Description:</strong> {{ task_description }}</p>{{/if}}
                {{#if due_date}}<p><strong>Due Date:</strong> {{ due_date }}</p>{{/if}}
                {{#if event_title}}<p><strong>Related Event:</strong> {{ event_title }} ({{ event_date }} {{ event_time }})</p>{{/if}}
                {{#if company_name}}<p><strong>Company:</strong> {{ company_name }}</p>{{/if}}
            </div>
            <p>Please log in to your DayClap dashboard to view and manage this task.</p>
            <a href="{{ frontend_url }}" class="button">Go to DayClap</a>
            <p>Stay productive!</p>
        </div>
        <div class="footer">
            <p>If you believe this is an error, please contact the sender.</p>
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'task_assigned');

INSERT INTO email_templates (name, subject, html_content)
SELECT 'event_1week_reminder', 'Reminder: Your Event "{{ event_title }}" is in 1 Week!',
$$<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 20px; line-height: 1.6; color: #333333; }
        .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; border-radius: 5px; text-decoration: none; margin-top: 15px; }
        .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Upcoming Event Reminder</h2>
        </div>
        <div class="content">
            <p>Hello {{ user_name }},</p>
            <p>This is a friendly reminder that your event <strong>"{{ event_title }}"</strong> is coming up in one week!</p>
            <div class="event-details">
                <p><strong>Event:</strong> {{ event_title }}</p>
                <p><strong>Date:</strong> {{ event_date }}</p>
                <p><strong>Time:</strong> {{ event_time }}</p>
                {{#if event_location}}<p><strong>Location:</strong> {{ event_location }}</p>{{/if}}
                {{#if event_description}}<p><strong>Description:</strong> {{ event_description }}</p>{{/if}}
                {{#if has_tasks}}
                    <p><strong>Tasks:</strong> You have {{ pending_tasks_count }} pending task(s) for this event. ({{ task_completion_percentage }} completed)</p>
                {{/if}}
            </div>
            <p>Make sure you're all set!</p>
            <a href="{{ frontend_url }}" class="button">View Event on DayClap</a>
            <p>See you there!</p>
        </div>
        <div class="footer">
            <p>This is an automated reminder. Please do not reply to this email.</p>
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'event_1week_reminder');

INSERT INTO email_templates (name, subject, html_content)
SELECT 'verification_email', 'Confirm Your DayClap Account',
$$<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 20px; line-height: 1.6; color: #333333; }
        .code { display: inline-block; background-color: #e7f3ff; color: #3b82f6; padding: 10px 15px; border-radius: 5px; font-size: 1.2em; font-weight: bold; margin: 10px 0; }
        .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Verification Code</h2>
        </div>
        <div class="content">
            <p>Thank you for choosing DayClap!</p>
            <p>To verify your account, please enter your OTP:</p>
            <p class="code">{{ .Token }}</p>
            <p>This code is valid for <strong>5 minutes</strong>.</p>
        </div>
        <div class="footer">
            <p>If you did not request this code, please ignore this email.</p>
            <p>&copy; {{ current_year }} Your Company. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'verification_email');

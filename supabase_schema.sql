-- This is the complete and consolidated Supabase schema for DayClap.
-- It is designed to be run multiple times safely, creating tables and adding columns only if they don't already exist,
-- and dropping/recreating policies and functions to ensure they are always up-to-date.

-- Enable pg_net extension for HTTP requests from triggers
-- IMPORTANT: You must enable this in your Supabase dashboard under Database -> Extensions first.
-- Also, configure network restrictions for pg_net to allow outbound requests to your backend URL.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a table for public profiles if it doesn't already exist.
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'en',
  timezone TEXT DEFAULT 'UTC',
  notifications JSONB DEFAULT '{"email_daily": true, "email_weekly": false, "email_monthly": false, "email_3day_countdown": false, "email_1week_countdown": true, "push": true, "reminders": true, "invitations": true}', -- UPDATED: Added "email_1week_countdown": true
  privacy JSONB DEFAULT '{"profileVisibility": "team", "calendarSharing": "private"}',
  company_name TEXT
);

-- Conditionally add new columns to the 'profiles' table if they don't exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'companies') THEN
        ALTER TABLE public.profiles ADD COLUMN companies JSONB DEFAULT '[]';
        RAISE NOTICE 'Column companies added to public.profiles table.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'current_company_id') THEN
        ALTER TABLE public.profiles ADD COLUMN current_company_id TEXT;
        RAISE NOTICE 'Column current_company_id added to public.profiles table.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_activity_at') THEN
        ALTER TABLE public.profiles ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Column last_activity_at added to public.profiles table.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'currency') THEN
        ALTER TABLE public.profiles ADD COLUMN currency TEXT DEFAULT 'USD';
        RAISE NOTICE 'Column currency added to public.profiles table.';
    END IF;

    -- NEW: Add account_type column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_type') THEN
        ALTER TABLE public.profiles ADD COLUMN account_type TEXT DEFAULT 'personal';
        RAISE NOTICE 'Column account_type added to public.profiles table.';
    END IF;

    -- NEW: Add push_subscription column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'push_subscription') THEN
        ALTER TABLE public.profiles ADD COLUMN push_subscription JSONB;
        RAISE NOTICE 'Column push_subscription added to public.profiles table.';
    END IF;
END
$$;

-- Enable Row Level Security (RLS) for the profiles table.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING ( TRUE );

DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
CREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update their own profile." ON profiles;
CREATE POLICY "Users can update their own profile." ON profiles FOR UPDATE USING ( auth.uid() = id );

-- Trigger function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_account_type TEXT;
    user_company_name_signup TEXT;
    user_name_signup TEXT;
    new_company_id TEXT;
    initial_companies JSONB;
BEGIN
    user_account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'personal');
    user_company_name_signup := NEW.raw_user_meta_data->>'company_name_signup';
    user_name_signup := NEW.raw_user_meta_data->>'name';

    initial_companies := '[]'::jsonb;
    new_company_id := NULL;

    -- NEW LOGIC START: Automatically create a default company for BOTH personal and business accounts
    new_company_id := gen_random_uuid();

    IF user_account_type = 'business' AND user_company_name_signup IS NOT NULL AND user_company_name_signup <> '' THEN
        -- For business accounts, use the provided company name
        initial_companies := jsonb_build_array(jsonb_build_object(
            'id', new_company_id,
            'name', user_company_name_signup,
            'role', 'owner',
            'createdAt', NOW()::text
        ));
    ELSE
        -- For personal accounts (or business without a name), create a default personal space
        initial_companies := jsonb_build_array(jsonb_build_object(
            'id', new_company_id,
            'name', user_name_signup || '''s Space',
            'role', 'owner',
            'createdAt', NOW()::text
        ));
    END IF;
    -- NEW LOGIC END

    INSERT INTO public.profiles (
        id,
        email,
        name,
        created_at,
        theme,
        language,
        timezone,
        notifications,
        privacy,
        company_name,
        companies,
        current_company_id,
        last_activity_at,
        currency,
        account_type
    )
    VALUES (
        NEW.id,
        NEW.email,
        user_name_signup,
        NOW(),
        'light',
        'en',
        'UTC',
        '{"email_daily": true, "email_weekly": false, "email_monthly": false, "email_3day_countdown": false, "email_1week_countdown": true, "push": true, "reminders": true, "invitations": true}'::jsonb, -- UPDATED: Added "email_1week_countdown": true
        '{"profileVisibility": "team", "calendarSharing": "private"}'::jsonb,
        CASE WHEN user_account_type = 'business' THEN user_company_name_signup ELSE NULL END,
        initial_companies,
        new_company_id,
        NOW(),
        'USD',
        user_account_type
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- NEW: Function to send welcome email via backend API after email confirmation
CREATE OR REPLACE FUNCTION public.send_welcome_email_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
    backend_url TEXT := 'https://dayclap-backend-api.onrender.com'; -- IMPORTANT: Update for deployment (e.g., 'https://your-backend-url.com')
    api_key TEXT := 'your_local_backend_api_key_for_supabase_trigger'; -- <<< IMPORTANT: REPLACE THIS WITH THE SAME KEY YOU SET FOR BACKEND_API_KEY IN backend/.env
    payload JSONB;
    headers JSONB;
    request_id BIGINT;
BEGIN
    -- Only send if email_confirmed_at was NULL and is now set (i.e., email just confirmed)
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
        payload := jsonb_build_object(
            'email', NEW.email,
            'user_name', NEW.raw_user_meta_data->>'name'
        );
        
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-API-Key', api_key
        );

        -- Make an asynchronous HTTP POST request to your Flask backend
        -- This will not block the database transaction.
        -- Ensure pg_net extension is enabled in Supabase (Database -> Extensions)
        -- And your backend URL is whitelisted in Supabase Network Restrictions.
        SELECT extensions.http_post(
            uri := backend_url || '/api/send-welcome-email',
            content := payload,
            headers := headers
        ) INTO request_id;

        RAISE NOTICE 'Sent welcome email request for user % (ID: %)', NEW.email, NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NEW: Trigger to call the welcome email function after auth.users update
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.send_welcome_email_on_confirm();


-- Create 'invitations' table
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_email TEXT NOT NULL,
  company_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add 'sender_email' column to 'invitations' if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'sender_email') THEN
        ALTER TABLE public.invitations ADD COLUMN sender_email TEXT NOT NULL DEFAULT 'unknown@example.com';
        RAISE NOTICE 'Column sender_email added to public.invitations table.';
    END IF;
END
$$;

-- RLS for 'invitations'
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their sent or received invitations." ON invitations;
CREATE POLICY "Users can view their sent or received invitations." ON invitations FOR SELECT USING ( auth.uid() = sender_id OR auth.email() = recipient_email );
DROP POLICY IF EXISTS "Users can send invitations." ON invitations;
CREATE POLICY "Users can send invitations." ON invitations FOR INSERT WITH CHECK ( auth.uid() = sender_id );
DROP POLICY IF EXISTS "Users can update their received invitations." ON invitations;
CREATE POLICY "Users can update their received invitations." ON invitations FOR UPDATE USING ( auth.email() = recipient_email );

-- Create 'events' table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT,
  description TEXT,
  location TEXT,
  event_tasks JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add/modify columns for 'events'
DO $$
BEGIN
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    -- NEW: Add notification_dismissed_at column to events
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'notification_dismissed_at') THEN
        ALTER TABLE public.events ADD COLUMN notification_dismissed_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Column notification_dismissed_at added to public.events table.';
    END IF;
    -- NEW: Add one_week_reminder_sent_at column to events
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'one_week_reminder_sent_at') THEN
        ALTER TABLE public.events ADD COLUMN one_week_reminder_sent_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Column one_week_reminder_sent_at added to public.events table.';
    END IF;
END
$$;

-- RLS for 'events'
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- Drop the old generic policy if it exists
DROP POLICY IF EXISTS "Users can manage events in their current company." ON events;
-- Drop specific policies if they exist before recreating
DROP POLICY IF EXISTS "Users can view events in companies they belong to." ON events;
DROP POLICY IF EXISTS "Users can insert events in their current company." ON events; -- ADDED
DROP POLICY IF EXISTS "Users can update events in their current company." ON events; -- ADDED
DROP POLICY IF EXISTS "Users can delete events in their current company." ON events; -- ADDED

-- Policy for SELECT: Users can view events in companies they belong to.
CREATE POLICY "Users can view events in companies they belong to." ON events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.companies @> jsonb_build_array(jsonb_build_object('id', events.company_id))
  )
);

-- Policy for INSERT: Users can insert events if the event's company is their current company
CREATE POLICY "Users can insert events in their current company." ON events FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = events.company_id
  )
);

-- Policy for UPDATE: Users can update events if the event's company is their current company
CREATE POLICY "Users can update events in their current company." ON events FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = events.company_id
  )
);

-- Policy for DELETE: Users can delete events if the event's company is their current company
CREATE POLICY "Users can delete events in their current company." ON events FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = events.company_id
  )
);


-- Create 'tasks' table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT DEFAULT 'medium' NOT NULL,
  category TEXT,
  completed BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add/modify columns for 'tasks'
DO $$
BEGIN
    ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS expenses NUMERIC(10, 2);
    ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS description TEXT;
    -- NEW: Add notification_dismissed_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'notification_dismissed_at') THEN
        ALTER TABLE public.tasks ADD COLUMN notification_dismissed_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Column notification_dismissed_at added to public.tasks table.';
    END IF;
END
$$;

-- RLS for 'tasks'
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- Drop the old generic policy if it exists
DROP POLICY IF EXISTS "Users can manage tasks in their current company." ON tasks;
-- Drop specific policies if they exist before recreating
DROP POLICY IF EXISTS "Users can view tasks in companies they belong to." ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks in their current company." ON tasks; -- ADDED
DROP POLICY IF EXISTS "Users can update tasks in their current company." ON tasks; -- ADDED
DROP POLICY IF EXISTS "Users can delete tasks in their current company." ON tasks; -- ADDED

-- Policy for SELECT: Users can view tasks in companies they belong to.
CREATE POLICY "Users can view tasks in companies they belong to." ON tasks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.companies @> jsonb_build_array(jsonb_build_object('id', tasks.company_id))
  )
);

-- Policy for INSERT: Users can insert tasks if the task's company is their current company
CREATE POLICY "Users can insert tasks in their current company." ON tasks FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = tasks.company_id
  )
);

-- Policy for UPDATE: Users can update tasks if the task's company is their current company
CREATE POLICY "Users can update tasks in their current company." ON tasks FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = tasks.company_id
  )
);

-- Policy for DELETE: Users can delete tasks if the task's company is their current company
CREATE POLICY "Users can delete tasks in their current company." ON tasks FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = tasks.company_id
  )
);

-- Create 'email_settings' table
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maileroo_api_endpoint TEXT DEFAULT 'https://smtp.maileroo.com/api/v2/emails', -- CORRECTED: Changed to /emails
  mail_default_sender TEXT DEFAULT 'no-reply@team.dayclap.com',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- NEW: Columns for internal scheduler control
  scheduler_enabled BOOLEAN DEFAULT TRUE,
  reminder_time TEXT DEFAULT '02:00' -- Stored as HH:MM string
);

-- Idempotently add or rename the sending key column
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_settings') THEN
        -- Rename emailit_api_key to maileroo_sending_key if it exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='emailit_api_key') THEN
            ALTER TABLE email_settings RENAME COLUMN emailit_api_key TO maileroo_sending_key;
            RAISE NOTICE 'Column "emailit_api_key" renamed to "maileroo_sending_key".';
        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='maileroo_sending_key') THEN
            ALTER TABLE email_settings ADD COLUMN maileroo_sending_key TEXT;
            RAISE NOTICE 'Column "maileroo_sending_key" added.';
        END IF;

        -- Rename emailit_api_endpoint to maileroo_api_endpoint if it exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='emailit_api_endpoint') THEN
            ALTER TABLE email_settings RENAME COLUMN emailit_api_endpoint TO maileroo_api_endpoint;
            RAISE NOTICE 'Column "emailit_api_endpoint" renamed to "maileroo_api_endpoint".';
        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='maileroo_api_endpoint') THEN
            ALTER TABLE email_settings ADD COLUMN maileroo_api_endpoint TEXT DEFAULT 'https://smtp.maileroo.com/api/v2/emails'; -- CORRECTED: Changed to /emails
            RAISE NOTICE 'Column "maileroo_api_endpoint" added.';
        END IF;

        -- NEW: Add scheduler_enabled column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_settings' AND column_name = 'scheduler_enabled') THEN
            ALTER TABLE public.email_settings ADD COLUMN scheduler_enabled BOOLEAN DEFAULT TRUE;
            RAISE NOTICE 'Column "scheduler_enabled" added.';
        END IF;
        -- NEW: Add reminder_time column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_settings' AND column_name = 'reminder_time') THEN
            ALTER TABLE public.email_settings ADD COLUMN reminder_time TEXT DEFAULT '02:00';
            RAISE NOTICE 'Column "reminder_time" added.';
        END IF;
    END IF;
END
$$;

-- RLS for 'email_settings'
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_settings_singleton ON email_settings ((id IS NOT NULL));
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin can manage email settings." ON email_settings;
CREATE POLICY "Super admin can manage email settings." ON email_settings FOR ALL USING ( auth.email() = 'admin@example.com' );

-- Insert default row if table is empty
INSERT INTO email_settings (id, maileroo_sending_key, maileroo_api_endpoint, mail_default_sender, scheduler_enabled, reminder_time)
SELECT gen_random_uuid(), '', 'https://smtp.maileroo.com/api/v2/emails', 'no-reply@team.dayclap.com', TRUE, '02:00' -- CORRECTED: Changed to /emails
WHERE NOT EXISTS (SELECT 1 FROM email_settings);

-- **FIX**: Correct any old, incorrect default sender email values.
DO $$
BEGIN
    UPDATE email_settings
    SET mail_default_sender = 'no-reply@team.dayclap.com'
    WHERE mail_default_sender = 'DayClap Notifications <noreply@dayclap.com>';
    -- RAISE NOTICE 'Corrected outdated mail_default_sender value.'; -- Optional: keep for debugging, remove for production
END
$$;

-- **FIX**: Correct any old, incorrect API endpoints to the new correct one.
DO $$
BEGIN
    UPDATE email_settings
    SET maileroo_api_endpoint = 'https://smtp.maileroo.com/api/v2/emails' -- CORRECTED: Changed to /emails
    WHERE maileroo_api_endpoint != 'https://smtp.maileroo.com/api/v2/emails'; -- CORRECTED: Changed to /emails
    -- RAISE NOTICE 'Corrected outdated maileroo_api_endpoint value to the correct URL.'; -- Optional: keep for debugging, remove for production
END
$$;

-- NEW: Create 'email_templates' table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for 'email_templates'
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin can manage email templates." ON email_templates;
CREATE POLICY "Super admin can manage email templates." ON email_templates FOR ALL USING ( auth.email() = 'admin@example.com' );

-- Insert default email templates if they don't exist
INSERT INTO email_templates (name, subject, html_content)
SELECT 'welcome_email', 'Welcome to DayClap!',
$$<!DOCTYPE html>
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
                <a href="https://dayclap-app.vercel.app" class="button">Go to Dashboard</a>
            </p>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Best regards,<br>The DayClap Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'welcome_email');

INSERT INTO email_templates (name, subject, html_content)
SELECT 'invitation_to_company', 'You''re Invited to Join a Team on DayClap!',
$$<!DOCTYPE html>
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
                <a href="https://dayclap-app.vercel.app" class="button">Accept Invitation</a>
            </p>
            <p>If you have any questions, please contact {{ sender_email }}.</p>
            <p>Best regards,<br>The DayClap Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'invitation_to_company');

-- NEW: Add default 'verification_email' template
-- NOTE: This template is for backend-initiated verification emails.
-- Supabase Auth's built-in signUp function uses the template configured in the Supabase Dashboard (Authentication -> Email Templates).
INSERT INTO email_templates (name, subject, html_content)
SELECT 'verification_email', 'Confirm Your DayClap Account',
$$<!DOCTYPE html>
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
            <h2>Confirm Your DayClap Account</h2>
        </div>
        <div class="content">
            <p>Hello {{ user_name }},</p>
            <p>Thank you for signing up for DayClap! Please click the button below to confirm your email address and activate your account:</p>
            <p style="text-align: center;">
                <a href="{{ .ConfirmationURL }}" class="button">Confirm Your Email</a>
            </p>
            <p>If you did not sign up for DayClap, please ignore this email.</p>
            <p>Best regards,<br>The DayClap Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'verification_email');

-- NEW: Add 'event_1week_reminder' template
INSERT INTO email_templates (name, subject, html_content)
SELECT 'event_1week_reminder', 'Reminder: Your Event is One Week Away!',
$$<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { padding: 20px; line-height: 1.6; color: #333333; }
        .event-details { background-color: #e7f3ff; border-left: 5px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .event-details h3 { color: #3b82f6; margin-top: 0; }
        .task-summary { background-color: #fffbe6; border-left: 5px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .task-summary p { margin: 0; }
        .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; font-size: 0.8em; color: #888888; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eeeeee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Event Reminder: {{ event_title }}</h2>
        </div>
        <div class="content">
            <p>Hello {{ user_name }},</p>
            <p>This is a friendly reminder that your event, <b>"{{ event_title }}"</b>, is scheduled for <b>{{ event_date }}</b> (one week from today!).</p>
            
            <div class="event-details">
                <h3>Event Details:</h3>
                <p><b>Title:</b> {{ event_title }}</p>
                <p><b>Date:</b> {{ event_date }}</p>
                <p><b>Time:</b> {{ event_time }}</p>
                {{#if event_location}}<p><b>Location:</b> {{ event_location }}</p>{{/if}}
                {{#if event_description}}<p><b>Description:</b> {{ event_description }}</p>{{/if}}
            </div>

            {{#if has_tasks}}
            <div class="task-summary">
                <h3>Task Progress:</h3>
                <p>You have <b>{{ pending_tasks_count }}</b> pending tasks for this event.</p>
                <p>Current completion: <b>{{ task_completion_percentage }}</b></p>
            </div>
            {{/if}}

            <p style="text-align: center;">
                <a href="https://dayclap-app.vercel.app" class="button">View Event in DayClap</a>
            </p>
            <p>Stay organized and have a productive week!</p>
            <p>Best regards,<br>The DayClap Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{ current_year }} DayClap. All rights reserved.</p>
        </div>
    </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'event_1week_reminder');

-- NEW: Add 'task_assigned' template
INSERT INTO email_templates (name, subject, html_content)
SELECT 'task_assigned', 'New Task Assigned: {{ task_title }}',
$$<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,.08); overflow: hidden; }
    .header { background: #3b82f6; color: #fff; padding: 16px 20px; }
    .content { padding: 20px; color: #333; line-height: 1.6; }
    .meta { background: #f7fafc; border-left: 4px solid #3b82f6; padding: 12px 14px; border-radius: 6px; margin: 12px 0; }
    .label { color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; display:block; margin-bottom: 4px; }
    .value { font-weight: 600; color: #111827; }
    .button { display: inline-block; margin-top: 16px; background: #3b82f6; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; }
    .footer { font-size: 12px; color: #888; padding: 16px 20px; border-top: 1px solid #eee; text-align: center;}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h2>New Task Assigned</h2></div>
    <div class="content">
      <p>Hello {{ assignee_name }},</p>
      <p>You have been assigned a new task{{ company_name ? ' in ' : '' }}<b>{{ company_name }}</b> for the event <b>"{{ event_title }}"</b>.</p>

      <div class="meta">
        <span class="label">Task</span>
        <span class="value">{{ task_title }}</span>
        {{#if task_description}}<div style="margin-top:6px;">{{ task_description }}</div>{{/if}}
      </div>

      <div class="meta">
        <span class="label">Assigned By</span>
        <span class="value">{{ assigned_by_name }} {{ assigned_by_email }}</span>
      </div>

      {{#if due_date}}
      <div class="meta">
        <span class="label">Task Due</span>
        <span class="value">{{ due_date }}</span>
      </div>
      {{#if event_date}}
      <div class="meta">
        <span class="label">Event Date</span>
        <span class="value">{{ event_date }} {{ event_time }}</span>
      </div>
      {{/if}}

      <p>
        <a href="https://dayclap-app.vercel.app" class="button">Open DayClap</a>
      </p>
      <p>Thanks,<br/>The DayClap Team</p>
    </div>
    <div class="footer">&copy; {{ current_year }} DayClap. All rights reserved.</div>
  </div>
</body>
</html>$$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'task_assigned');

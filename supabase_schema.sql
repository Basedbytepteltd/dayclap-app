-- This is the complete and consolidated Supabase schema for DayClap.
-- It is designed to be run multiple times safely, creating tables and adding columns only if they don't already exist,
-- and dropping/recreating policies and functions to ensure they are always up-to-date.

-- Create a table for public profiles if it doesn't already exist.
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'en',
  timezone TEXT DEFAULT 'UTC',
  notifications JSONB DEFAULT '{"email_daily": true, "email_weekly": false, "email_monthly": false, "email_3day_countdown": false, "push": true, "reminders": true, "invitations": true}',
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
END
$$;

-- Enable Row Level Security (RLS) for the profiles table.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING ( TRUE );

DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
CREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING ( auth.uid() = id );

-- Trigger function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_company_name TEXT;
    new_company_id TEXT;
    initial_companies JSONB;
BEGIN
  user_company_name := NEW.raw_user_meta_data->>'company';

  IF user_company_name IS NOT NULL AND user_company_name != '' THEN
      new_company_id := gen_random_uuid();
      initial_companies := jsonb_build_array(
          jsonb_build_object(
              'id', new_company_id,
              'name', user_company_name,
              'role', 'owner',
              'createdAt', NOW()::text
          )
      );
  ELSE
      initial_companies := '[]'::jsonb;
      new_company_id := NULL;
  END IF;

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
    currency
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name',
    NOW(), -- created_at
    'light', -- theme
    'en', -- language
    'UTC', -- timezone
    '{"email_daily": true, "email_weekly": false, "email_monthly": false, "email_3day_countdown": false, "push": true, "reminders": true, "invitations": true}', -- notifications
    '{"profileVisibility": "team", "calendarSharing": "private"}', -- privacy
    user_company_name, -- company_name (from signup options)
    initial_companies, -- dynamically set companies array
    new_company_id, -- dynamically set current_company_id
    NOW(), -- last_activity_at
    'USD' -- currency
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

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
END
$$;

-- RLS for 'events'
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage events in their current company." ON events;
CREATE POLICY "Users can manage events in their current company." ON events FOR ALL USING (
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
DROP POLICY IF EXISTS "Users can manage tasks in their current company." ON tasks;
CREATE POLICY "Users can manage tasks in their current company." ON tasks FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.current_company_id = tasks.company_id
  )
);

-- Create 'email_settings' table
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maileroo_api_endpoint TEXT DEFAULT 'https://smtp.maileroo.com/api/v2',
  mail_default_sender TEXT DEFAULT 'no-reply@team.dayclap.com',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Idempotently add or rename the sending key column
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_settings') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='maileroo_api_key') AND
           NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='maileroo_sending_key') THEN
            ALTER TABLE email_settings RENAME COLUMN maileroo_api_key TO maileroo_sending_key;
            RAISE NOTICE 'Column "maileroo_api_key" renamed to "maileroo_sending_key".';
        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_settings' AND column_name='maileroo_sending_key') THEN
            ALTER TABLE email_settings ADD COLUMN maileroo_sending_key TEXT;
            RAISE NOTICE 'Column "maileroo_sending_key" added.';
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
INSERT INTO email_settings (id, maileroo_sending_key, maileroo_api_endpoint, mail_default_sender)
SELECT gen_random_uuid(), '', 'https://smtp.maileroo.com/api/v2', 'no-reply@team.dayclap.com'
WHERE NOT EXISTS (SELECT 1 FROM email_settings);

-- **FIX**: Correct any old, incorrect default sender email values.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM email_settings WHERE mail_default_sender = 'DayClap Notifications <noreply@dayclap.com>') THEN
        UPDATE email_settings
        SET mail_default_sender = 'no-reply@team.dayclap.com'
        WHERE mail_default_sender = 'DayClap Notifications <noreply@dayclap.com>';
        RAISE NOTICE 'Corrected outdated mail_default_sender value.';
    END IF;
END
$$;

-- **FIX**: Correct any old, incorrect API endpoints to the new correct one.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM email_settings WHERE maileroo_api_endpoint != 'https://smtp.maileroo.com/api/v2') THEN
        UPDATE email_settings
        SET maileroo_api_endpoint = 'https://smtp.maileroo.com/api/v2'
        WHERE maileroo_api_endpoint != 'https://smtp.maileroo.com/api/v2';
        RAISE NOTICE 'Corrected outdated maileroo_api_endpoint value to the correct URL.';
    END IF;
END
$$;

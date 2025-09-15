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
  notifications JSONB DEFAULT '{\"email_daily\": true, \"email_weekly\": false, \"email_monthly\": false, \"email_3day_countdown\": false, \"push\": true, \"reminders\": true, \"invitations\": true}', -- UPDATED: New email notification types
  privacy JSONB DEFAULT '{\"profileVisibility\": \"team\", \"calendarSharing\": \"private\"}',
  company_name TEXT -- Kept for backward compatibility/initial migration
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

-- Drop existing RLS policies if they exist, then recreate them.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
CREATE POLICY "Public profiles are viewable by everyone."
  ON profiles FOR SELECT
  USING ( TRUE );

DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
CREATE POLICY "Users can insert their own profile."
  ON profiles FOR INSERT
  WITH CHECK ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
CREATE POLICY "Users can update own profile."
  ON profiles FOR UPDATE
  USING ( auth.uid() = id );

-- Create or replace the trigger function 'handle_new_user'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, theme, last_activity_at, currency, notifications) -- UPDATED: Added notifications
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name', 'light', NOW(), 'USD', '{\"email_daily\": true, \"email_weekly\": false, \"email_monthly\": false, \"email_3day_countdown\": false, \"push\": true, \"reminders\": true, \"invitations\": true}'); -- UPDATED: New default notifications
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the existing trigger if it exists, then recreate it.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create the 'invitations' table if it doesn't already exist.
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

-- Conditionally add 'sender_email' column to 'invitations' table if it doesn't exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'sender_email') THEN
        ALTER TABLE public.invitations ADD COLUMN sender_email TEXT NOT NULL DEFAULT 'unknown@example.com';
        RAISE NOTICE 'Column sender_email added to public.invitations table.';
    END IF;
END
$$;

-- Enable RLS for the 'invitations' table.
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy for SELECT: Users can view invitations they sent or received.
DROP POLICY IF EXISTS "Users can view their sent or received invitations." ON invitations;
CREATE POLICY "Users can view their sent or received invitations."
  ON invitations FOR SELECT
  USING (
    auth.uid() = sender_id OR auth.email() = recipient_email
  );

-- RLS Policy for INSERT: Users can send invitations.
DROP POLICY IF EXISTS "Users can send invitations." ON invitations;
CREATE POLICY "Users can send invitations."
  ON invitations FOR INSERT
  WITH CHECK ( auth.uid() = sender_id );

-- RLS Policy for UPDATE: Users can update invitations they received (to accept/decline).
DROP POLICY IF EXISTS "Users can update their received invitations." ON invitations;
CREATE POLICY "Users can update their received invitations."
  ON invitations FOR UPDATE
  USING ( auth.email() = recipient_email ); -- FIXED: Changed recipient_id to recipient_email

-- Create the 'events' table if it doesn't already exist.
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

-- Conditionally add 'last_activity_at' column to 'events' table if it doesn't exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'last_activity_at') THEN
        ALTER TABLE public.events ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Column last_activity_at added to public.events table.';
    END IF;
END
$$;

-- Enable RLS for the 'events' table.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- RLS Policy for SELECT: Users can view events belonging to their current company.
DROP POLICY IF EXISTS "Users can view events in their current company." ON events;
CREATE POLICY "Users can view events in their current company."
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = events.company_id
    )
  );

-- RLS Policy for INSERT: Users can insert events into their current company.
DROP POLICY IF EXISTS "Users can insert events into their current company." ON events;
CREATE POLICY "Users can insert events into their current company."
  ON events FOR INSERT
  WITH CHECK ( auth.uid() = user_id AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = events.company_id
    )
  );

-- RLS Policy for UPDATE: Users can update events in their current company.
DROP POLICY IF EXISTS "Users can update events in their current company." ON events;
CREATE POLICY "Users can update events in their current company."
  ON events FOR UPDATE
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = events.company_id
    )
  );

-- RLS Policy for DELETE: Users can delete events in their current company.
DROP POLICY IF EXISTS "Users can delete events in their current company." ON events;
CREATE POLICY "Users can delete events in their current company."
  ON events FOR DELETE
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = events.company_id
    )
  );

-- Create the 'tasks' table for general tasks (not tied to a specific event) if it doesn't already exist.
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

-- Conditionally add 'last_activity_at' and 'expenses' columns to 'tasks' table if they don't exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'last_activity_at') THEN
        ALTER TABLE public.tasks ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Column last_activity_at added to public.tasks table.';
    END IF;

    -- Check if 'budget' column exists and 'expenses' column does NOT exist, then rename.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'budget') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'expenses') THEN
        ALTER TABLE public.tasks RENAME COLUMN budget TO expenses;
        RAISE NOTICE 'Column budget renamed to expenses in public.tasks table.';
    END IF;

    -- If 'expenses' column still does not exist (e.g., neither budget nor expenses existed initially), add it.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'expenses') THEN
        ALTER TABLE public.tasks ADD COLUMN expenses NUMERIC(10, 2); -- NEW: Add expenses column
        RAISE NOTICE 'Column expenses added to public.tasks table.';
    END IF;

    -- NEW: Add 'description' column to 'tasks' table if it doesn't exist.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'description') THEN
        ALTER TABLE public.tasks ADD COLUMN description TEXT;
        RAISE NOTICE 'Column description added to public.tasks table.';
    END IF;
END
$$;

-- Enable RLS for the 'tasks' table.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy for SELECT: Users can view tasks belonging to their current company.
DROP POLICY IF EXISTS "Users can view their tasks in their current company." ON tasks;
CREATE POLICY "Users can view their tasks in their current company."
  ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = tasks.company_id
    )
  );

-- RLS Policy for INSERT: Users can insert tasks into their current company.
DROP POLICY IF EXISTS "Users can insert tasks into their current company." ON tasks;
CREATE POLICY "Users can insert tasks into their current company."
  ON tasks FOR INSERT
  WITH CHECK ( auth.uid() = user_id AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = tasks.company_id
    )
  );

-- RLS Policy for UPDATE: Users can update their tasks in their current company.
DROP POLICY IF EXISTS "Users can update their tasks in their current company." ON tasks;
CREATE POLICY "Users can update their tasks in their current company."
  ON tasks FOR UPDATE
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = tasks.company_id
    )
  );

-- RLS Policy for DELETE: Users can delete tasks in their current company.
DROP POLICY IF EXISTS "Users can delete their tasks in their current company." ON tasks;
CREATE POLICY "Users can delete their tasks in their current company."
  ON tasks FOR DELETE
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.current_company_id = tasks.company_id
    )
  );


DO $$
BEGIN
    -- Check if the 'sender_email' column exists in the 'invitations' table
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invitations'
          AND column_name = 'sender_email'
    ) THEN
        -- If it doesn't exist, add the column with a temporary default value
        ALTER TABLE public.invitations
        ADD COLUMN sender_email TEXT NOT NULL DEFAULT 'unknown@example.com';
        RAISE NOTICE 'Column sender_email added to public.invitations table.';
    ELSE
        RAISE NOTICE 'Column sender_email already exists in public.invitations table. No action taken.';
    END IF;
END
$$;

-- This script directly adds the 'last_activity_at' column to the necessary tables.
-- It uses 'IF NOT EXISTS' to prevent errors if the column already exists.

-- Add 'last_activity_at' to the 'profiles' table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add 'last_activity_at' to the 'events' table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add 'last_activity_at' to the 'tasks' table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- NEW: Create 'email_settings' table for Maileroo configuration
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maileroo_api_key TEXT,
  maileroo_api_endpoint TEXT DEFAULT 'https://api.maileroo.com/v1/send',
  mail_default_sender TEXT DEFAULT 'DayClap Notifications <noreply@dayclap.com>',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one row exists in email_settings (singleton table)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_settings_singleton ON email_settings ((id IS NOT NULL));

-- Enable RLS for 'email_settings'
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy for SELECT: Only super admin can view email settings
DROP POLICY IF EXISTS "Super admin can view email settings." ON email_settings;
CREATE POLICY "Super admin can view email settings."
  ON email_settings FOR SELECT
  USING ( auth.email() = 'admin@example.com' ); -- Assuming 'admin@example.com' is the super admin email

-- RLS Policy for INSERT: Only super admin can insert (if table is empty)
DROP POLICY IF EXISTS "Super admin can insert email settings." ON email_settings;
CREATE POLICY "Super admin can insert email settings."
  ON email_settings FOR INSERT
  WITH CHECK ( auth.email() = 'admin@example.com' AND (SELECT COUNT(*) FROM email_settings) = 0 );

-- RLS Policy for UPDATE: Only super admin can update email settings
DROP POLICY IF EXISTS "Super admin can update email settings." ON email_settings;
CREATE POLICY "Super admin can update email settings."
  ON email_settings FOR UPDATE
  USING ( auth.email() = 'admin@example.com' );

-- Insert a default row if the table is empty (for initial setup)
INSERT INTO email_settings (id, maileroo_api_key, maileroo_api_endpoint, mail_default_sender)
SELECT gen_random_uuid(), '', 'https://api.maileroo.com/v1/send', 'DayClap Notifications <noreply@dayclap.com>'
WHERE NOT EXISTS (SELECT 1 FROM email_settings);

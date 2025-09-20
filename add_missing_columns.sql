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
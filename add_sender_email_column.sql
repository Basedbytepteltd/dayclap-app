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
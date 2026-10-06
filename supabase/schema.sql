-- ============================================================================
-- Smart Library Seat Finder Database Schema
-- Supabase PostgreSQL + Row Level Security (RLS) + Concurrency-Safe Booking
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Profiles Table
-- Linked to Supabase auth.users
-- Roles: 'student' (default), 'admin'
-- Users CANNOT self-assign admin role via public registration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for role lookup
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ----------------------------------------------------------------------------
-- 2. Seats Table
-- 4 Seats: S01, S02, S03, S04
-- Physical occupancy (is_occupied) is strictly separate from reservation status
-- is_maintenance allows admin to take a seat out of service
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seats (
    id TEXT PRIMARY KEY, -- 'S01', 'S02', 'S03', 'S04'
    seat_number INT NOT NULL UNIQUE,
    is_occupied BOOLEAN NOT NULL DEFAULT false,
    is_maintenance BOOLEAN NOT NULL DEFAULT false,
    last_occupied_change TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Reservations Table
-- Consistent UTC timestamps.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_id TEXT NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'completed')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index ensuring no two active reservations can exist for the same seat
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_seat_reservation 
ON public.reservations (seat_id) 
WHERE status = 'active';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON public.reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_end_time ON public.reservations(end_time);

-- ----------------------------------------------------------------------------
-- 4. Devices Table
-- Tracks ESP8266 microcontroller status and heartbeat
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
    id TEXT PRIMARY KEY, -- e.g. 'ESP8266_DEV01'
    device_name TEXT NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_online BOOLEAN NOT NULL DEFAULT true,
    noise_warning_active BOOLEAN NOT NULL DEFAULT false,
    noise_warning_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    firmware_version TEXT DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. Noise Logs Table
-- Logs digital sound triggers for auditing and noise dashboard
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noise_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    noise_detected BOOLEAN NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details TEXT
);

CREATE INDEX IF NOT EXISTS idx_noise_logs_recorded_at ON public.noise_logs(recorded_at DESC);

-- ----------------------------------------------------------------------------
-- 6. Initial Seed Data
-- ----------------------------------------------------------------------------
INSERT INTO public.seats (id, seat_number, is_occupied, is_maintenance)
VALUES 
    ('S01', 1, false, false),
    ('S02', 2, false, false),
    ('S03', 3, false, false),
    ('S04', 4, false, false)
ON CONFLICT (id) DO UPDATE 
SET seat_number = EXCLUDED.seat_number;

INSERT INTO public.devices (id, device_name, last_seen, is_online, noise_warning_active, firmware_version)
VALUES 
    ('ESP8266_DEV01', 'Library Central Unit (NodeMCU)', NOW(), true, false, '1.0.0')
ON CONFLICT (id) DO UPDATE 
SET device_name = EXCLUDED.device_name;

-- ----------------------------------------------------------------------------
-- 7. Functions & Triggers
-- ----------------------------------------------------------------------------

-- A. Auto-create profile on signup with default role 'student'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'student' -- ALWAYS defaults to 'student'; admin cannot be self-assigned
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B. Periodic / Request-driven Expiry of Stale Reservations
CREATE OR REPLACE FUNCTION public.expire_stale_reservations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    UPDATE public.reservations
    SET status = 'expired'
    WHERE status = 'active' AND end_time <= NOW();
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

-- C. Concurrency-Safe Atomic Seat Reservation
-- Prevents race conditions and double bookings
CREATE OR REPLACE FUNCTION public.create_reservation(
    p_seat_id TEXT,
    p_user_id UUID,
    p_duration_minutes INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_maintenance BOOLEAN;
    v_active_seat_count INT;
    v_active_user_count INT;
    v_new_id UUID;
    v_start_time TIMESTAMPTZ := NOW();
    v_end_time TIMESTAMPTZ;
BEGIN
    -- Step 1: Clean up any expired reservations so they immediately unblock seats
    PERFORM public.expire_stale_reservations();

    -- Step 2: Lock seat row for update
    SELECT is_maintenance INTO v_is_maintenance
    FROM public.seats
    WHERE id = p_seat_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid seat code');
    END IF;

    IF v_is_maintenance THEN
        RETURN jsonb_build_object('success', false, 'error', 'Seat is currently in maintenance mode');
    END IF;

    -- Step 3: Check if this user already has an active reservation
    SELECT COUNT(*) INTO v_active_user_count
    FROM public.reservations
    WHERE user_id = p_user_id AND status = 'active' AND end_time > NOW();

    IF v_active_user_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'You already have an active seat reservation');
    END IF;

    -- Step 4: Check if the seat currently has an active reservation
    SELECT COUNT(*) INTO v_active_seat_count
    FROM public.reservations
    WHERE seat_id = p_seat_id AND status = 'active' AND end_time > NOW();

    IF v_active_seat_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Seat is already reserved by another student');
    END IF;

    -- Step 5: Insert reservation
    v_end_time := v_start_time + (p_duration_minutes || ' minutes')::INTERVAL;

    INSERT INTO public.reservations (seat_id, user_id, status, start_time, end_time)
    VALUES (p_seat_id, p_user_id, 'active', v_start_time, v_end_time)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_new_id,
        'seat_id', p_seat_id,
        'start_time', v_start_time,
        'end_time', v_end_time
    );
END;
$$;

-- D. Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noise_logs ENABLE ROW LEVEL SECURITY;

-- Profiles:
-- Any authenticated user can read profiles (needed for reservation display)
CREATE POLICY "Profiles readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Users can only update their own profile; cannot change role
CREATE POLICY "Users can update own profile except role"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id AND 
    role = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

-- Seats:
-- Public & students can read seats
CREATE POLICY "Seats readable by all"
ON public.seats FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can update seats (e.g. toggle maintenance)
CREATE POLICY "Admins can update seats"
ON public.seats FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Reservations:
-- Authenticated users can read their own reservations; Admins can read all
CREATE POLICY "Users can read own reservations, Admins can read all"
ON public.reservations FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- Public can also see active reservation seat mapping (without personal details)
CREATE POLICY "Public seat reservation visibility"
ON public.reservations FOR SELECT
TO anon
USING (status = 'active');

-- Students can insert reservations only for themselves (and functions bypass RLS when SECURITY DEFINER)
CREATE POLICY "Users can insert own reservations"
ON public.reservations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Students can cancel only their own reservation; Admins can cancel any
CREATE POLICY "Users can cancel own reservation or Admin any"
ON public.reservations FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Devices:
-- Authenticated users and anon can read device status (needed to show offline/online)
CREATE POLICY "Devices readable by all"
ON public.devices FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can update devices via dashboard
CREATE POLICY "Admins can update devices"
ON public.devices FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Noise Logs:
-- Authenticated users can view recent noise logs
CREATE POLICY "Noise logs readable by authenticated"
ON public.noise_logs FOR SELECT
TO authenticated
USING (true);

-- ----------------------------------------------------------------------------
-- 9. Realtime Publication
-- Enable Supabase Realtime for live updates on seats, devices, reservations
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.seats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

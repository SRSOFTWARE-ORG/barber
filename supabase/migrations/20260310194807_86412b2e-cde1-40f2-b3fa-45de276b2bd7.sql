
-- Add cliente_id to agendamentos (nullable for backward compat with existing bookings)
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.profiles(id);

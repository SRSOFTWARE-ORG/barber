-- Harden whatsapp_queue: stop exposing recipient phone numbers (destinatario) to barbers.
-- Barbers never read the queue from the browser (their WhatsApp UI uses edge functions only);
-- the queue monitor is CEO-only. Remove the barber SELECT policy and the anon column grant.

DROP POLICY IF EXISTS "Barbeiro read own queue" ON public.whatsapp_queue;

REVOKE SELECT (destinatario) ON public.whatsapp_queue FROM anon;
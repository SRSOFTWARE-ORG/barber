import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

/**
 * Entry point for invite links (/r/:code).
 * The actual gating + linking happens in <InviteGate>, which captures the
 * code from the URL, blocks the app until login, and then links the
 * client to the barber. Here we just persist the code and redirect home.
 */
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!code) { navigate('/', { replace: true }); return; }
    try { localStorage.setItem('pendingInviteCode', code); } catch {}
    navigate('/', { replace: true });
  }, [code, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Carregando convite...</p>
    </div>
  );
}

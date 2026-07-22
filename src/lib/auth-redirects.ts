const DEFAULT_PUBLIC_APP_URL = 'https://barber.srsoftwarestore.com';

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');

export const getPublicAppOrigin = () => {
  const configured = normalizeOrigin((import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || '');
  if (configured) return configured;

  if (typeof window === 'undefined') return DEFAULT_PUBLIC_APP_URL;

  const { origin, hostname } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  const isPreview = hostname.includes('lovable.app') || hostname.includes('lovableproject.com');

  if (isLocalhost || isPreview) return DEFAULT_PUBLIC_APP_URL;
  return origin;
};

export const getPasswordResetRedirectUrl = () => `${getPublicAppOrigin()}/reset-password`;
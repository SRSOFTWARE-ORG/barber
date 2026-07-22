import { useState, useEffect } from 'react';
import { ArrowLeft, Camera, Save, LogOut, Calendar, CheckCircle, Clock, Gift, Pencil, X, User, Phone, Cake, Scissors, Star, MapPin, Navigation, MessageCircle, Unlink, Ban } from 'lucide-react';
import RatingWidget from '@/components/RatingWidget';
import Seo from '@/components/Seo';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import IOSDateInput from '@/components/IOSDateInput';
import {
  MAX_AVATAR_IMAGE_BYTES,
  SUPPORTED_IMAGE_ACCEPT,
  buildScopedImagePath,
  extractStorageObjectPath,
  getUploadContentType,
  imageFileDebugInfo,
  isSupportedImageFile,
  prepareAvatarInlineDataUrl,
  prepareImageUpload,
  withImageCacheBust,
} from '@/lib/media';
import { formatDateLabel, formatDateShort } from '@/lib/date';
import { getCurrentPosition, distanceMeters, formatDistance, type Coords } from '@/lib/geo';
import ClientAuthForm from '@/components/ClientAuthForm';
import AvatarPreview from '@/components/AvatarPreview';
import { useT } from '@/contexts/LanguageContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface GeoBarber {
  user_id: string;
  display_name: string;
  shop_name: string;
  rating_avg: number;
  rating_count: number;
  distance: number | null;
}

interface Profile {
  full_name: string;
  avatar_url: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  adm_responsavel_id: string | null;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { services } = useBarbershop();
  const t = useT();

  const [profile, setProfile] = useState<Profile>({ full_name: '', avatar_url: null, data_nascimento: null, telefone: null, adm_responsavel_id: null });
  const [editProfile, setEditProfile] = useState<Profile>({ full_name: '', avatar_url: null, data_nascimento: null, telefone: null, adm_responsavel_id: null });
  const [barberName, setBarberName] = useState<string | null>(null);
  const [barberEndereco, setBarberEndereco] = useState<string | null>(null);
  const [barberMapsLink, setBarberMapsLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [tab, setTab] = useState<'pendentes' | 'concluidos'>('pendentes');
  const [pendingAppts, setPendingAppts] = useState<any[]>([]);
  const [completedAppts, setCompletedAppts] = useState<any[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showLinkBarber, setShowLinkBarber] = useState(false);
  const [geoBarbers, setGeoBarbers] = useState<GeoBarber[]>([]);
  const [linkingBarber, setLinkingBarber] = useState(false);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [clientCoords, setClientCoords] = useState<Coords | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadProfile();
    loadAppointments();

    const channel = supabase
      .channel('profile-appts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agendamentos' }, (payload) => {
        const a = payload.new as any;
        if (a.cliente_id === user.id) {
          loadAppointments();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('full_name, avatar_url, data_nascimento, telefone, adm_responsavel_id').eq('id', user.id).single();
    if (data && data.full_name) {
      const p = {
        full_name: data.full_name || '',
        avatar_url: data.avatar_url,
        data_nascimento: data.data_nascimento,
        telefone: data.telefone,
        adm_responsavel_id: (data as any).adm_responsavel_id || null,
      };
      setProfile(p);
      setEditProfile(p);
      if (data.avatar_url) setAvatarPreview(data.avatar_url);
      setIsNewProfile(false);

      // Fetch barber name and location
      if ((data as any).adm_responsavel_id) {
        const { data: nameData } = await supabase.rpc('get_barber_name', { _barber_id: (data as any).adm_responsavel_id });
        if (nameData) setBarberName(nameData);

        // Fetch barber location via RPC (bypasses RLS)
        const { data: locData } = await supabase.rpc('get_barber_location', { _barber_id: (data as any).adm_responsavel_id });
        if (locData && locData.length > 0) {
          setBarberEndereco(locData[0].endereco_completo || null);
          setBarberMapsLink(locData[0].link_google_maps || null);
        }
      }
    } else {
      setIsNewProfile(true);
      setEditing(true);
    }
  };

  const loadAppointments = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('agendamentos')
      .select('id, data, hora, servico_ids, status, barbeiro_id, eh_fracionado, fase1_duracao, espera_duracao, fase2_duracao')
      .eq('cliente_id', user.id)
      .order('data', { ascending: false });

    if (data) {
      setPendingAppts(data.filter(a => ['pending', 'confirmed'].includes(a.status)));
      setCompletedAppts(data.filter(a => a.status === 'finalizado'));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    let avatarUrl: string | null = editProfile.avatar_url ?? null;

    if (avatarFile) {
      const uploadTraceId = `avatar-${Date.now()}`;
      const preparedFile = await prepareImageUpload(avatarFile, { maxDimension: 1200, quality: 0.9 });
      const path = buildScopedImagePath(user.id, preparedFile, 'avatar', true);
      const contentType = getUploadContentType(preparedFile);
      const uploadContext = {
        traceId: uploadTraceId,
        bucket: 'avatars',
        path,
        userId: user.id,
        original: imageFileDebugInfo(avatarFile),
        prepared: imageFileDebugInfo(preparedFile),
        contentType,
      };

      console.info('[Profile][AvatarUpload] start', uploadContext);

      const uploadOnce = async (attempt: 'initial' | 'fresh-auth-retry') => {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        console.info('[Profile][AvatarUpload] auth context', {
          traceId: uploadTraceId,
          attempt,
          hasSession: Boolean(sessionData.session),
          sessionUserId: sessionData.session?.user?.id ?? null,
          expiresAt: sessionData.session?.expires_at ?? null,
          sessionError: sessionError?.message ?? null,
        });

        return supabase.storage
          .from('avatars')
          .upload(path, preparedFile, {
            upsert: true,
            contentType,
            cacheControl: '3600',
          });
      };

      let uploadResult = await uploadOnce('initial');

      if (uploadResult.error) {
        console.error('[Profile][AvatarUpload] storage error initial', {
          traceId: uploadTraceId,
          message: uploadResult.error.message,
          name: uploadResult.error.name,
          error: uploadResult.error,
        });

        const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
        console.info('[Profile][AvatarUpload] refreshed auth context before retry', {
          traceId: uploadTraceId,
          hasSession: Boolean(refreshedSession.session),
          sessionUserId: refreshedSession.session?.user?.id ?? null,
          expiresAt: refreshedSession.session?.expires_at ?? null,
          refreshError: refreshError?.message ?? null,
        });

        uploadResult = await uploadOnce('fresh-auth-retry');
      }

      if (uploadResult.error) {
        const exactMessage = uploadResult.error.message || 'Erro desconhecido do Supabase Storage';
        console.error('[Profile][AvatarUpload] storage error after retry', {
          traceId: uploadTraceId,
          message: exactMessage,
          name: uploadResult.error.name,
          error: uploadResult.error,
        });

        if (/can_access_comprovante|permission denied for function/i.test(exactMessage)) {
          console.warn('[Profile][AvatarUpload] falling back to inline profile avatar', {
            traceId: uploadTraceId,
            exactMessage,
          });
          try {
            avatarUrl = await prepareAvatarInlineDataUrl(avatarFile);
          } catch (inlineErr) {
            console.error('[Profile][AvatarUpload] inline fallback failed', inlineErr);
            toast.error(t('profile.photoError'), {
              description: 'Não foi possível preparar a imagem. Tente outra foto.',
              action: { label: 'Tentar novamente', onClick: () => handleSave() },
            });
            setSaving(false);
            return;
          }
        } else {
          toast.error(t('profile.photoError'), {
            description: 'Verifique sua conexão e tente novamente. Detalhes técnicos no console.',
            action: { label: 'Tentar novamente', onClick: () => handleSave() },
          });
          setSaving(false);
          return;
        }
      } else {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = urlData.publicUrl;
        console.info('[Profile][AvatarUpload] success', {
          traceId: uploadTraceId,
          path: uploadResult.data?.path ?? path,
          publicUrl: avatarUrl,
        });

        const oldPath = editProfile.avatar_url ? extractStorageObjectPath(editProfile.avatar_url, 'avatars') : null;
        if (oldPath && oldPath !== path) {
          const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath]);
          if (removeError) {
            console.warn('[Profile][AvatarUpload] old avatar remove failed', {
              traceId: uploadTraceId,
              oldPath,
              message: removeError.message,
              error: removeError,
            });
          }
        }
      }
    }

    const payload = {
      id: user.id,
      full_name: editProfile.full_name,
      avatar_url: avatarUrl,
      data_nascimento: editProfile.data_nascimento,
      telefone: editProfile.telefone,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await supabase
      .from('profiles')
      .upsert(payload)
      .select('avatar_url, full_name, data_nascimento, telefone, adm_responsavel_id')
      .single();

    if (error) {
      console.error('[Profile] Save error:', error);
      toast.error(t('profile.saveError', { msg: error.message }));
      setSaving(false);
      return;
    }

    const finalProfile = {
      full_name: saved?.full_name || editProfile.full_name,
      avatar_url: saved?.avatar_url ?? avatarUrl,
      data_nascimento: saved?.data_nascimento ?? editProfile.data_nascimento,
      telefone: saved?.telefone ?? editProfile.telefone,
      adm_responsavel_id: saved?.adm_responsavel_id ?? editProfile.adm_responsavel_id,
    };

    setProfile(finalProfile);
    setEditProfile(finalProfile);
    setAvatarPreview(withImageCacheBust(finalProfile.avatar_url));
    setAvatarFile(null);
    setEditing(false);
    setIsNewProfile(false);
    toast.success(t('profile.saveSuccess'));
    setSaving(false);
  };

  const handleCancelEdit = () => {
    setEditProfile(profile);
    setAvatarFile(null);
    setAvatarPreview(profile.avatar_url);
    setEditing(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.info('[Profile][AvatarUpload] file selected', imageFileDebugInfo(file));
    if (!isSupportedImageFile(file)) {
      toast.error(t('profile.photoInvalid'));
      e.target.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_IMAGE_BYTES) {
      toast.error(t('profile.photoTooLarge'));
      e.target.value = '';
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    toast.info(t('profile.photoSelected'));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Carrega barbearias com distância (mais perto → mais longe), nota como critério secundário.
  const loadGeoBarbers = async (coords: Coords | null) => {
    setLoadingBarbers(true);

    // 1) Tenta via RPC list_shops_geo (view otimizada com rating)
    let rows: GeoBarber[] = [];
    const { data: rpcData, error: rpcErr } = await supabase.rpc('list_shops_geo' as any);
    if (rpcErr) console.warn('[Profile] list_shops_geo falhou, usando fallback:', rpcErr.message);
    if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
      rows = (rpcData as any[]).map((b) => {
        const hasCoords = b.latitude != null && b.longitude != null && coords;
        const dist = hasCoords
          ? distanceMeters(coords!, { lat: Number(b.latitude), lng: Number(b.longitude) })
          : null;
        return {
          user_id: b.shop_owner_id,
          display_name: b.display_name || 'Barbeiro',
          shop_name: b.shop_name || 'Barbearia',
          rating_avg: Number(b.rating_avg) || 0,
          rating_count: Number(b.rating_count) || 0,
          distance: dist,
        } as GeoBarber;
      });
    }

    // 2) Fallback: consulta direta em user_roles + profiles — garante que
    //    barbearias sem lat/lng ou sem estatísticas ainda apareçam.
    if (rows.length === 0) {
      const { data: admins, error: adminsErr } = await supabase
        .from('user_roles')
        .select('user_id, display_name')
        .eq('role', 'admin');
      if (adminsErr) console.warn('[Profile] fallback user_roles falhou:', adminsErr.message);
      const ids = (admins ?? []).map((a: any) => a.user_id);
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, nome_barbearia, latitude, longitude')
          .in('id', ids);
        const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
        rows = (admins ?? []).map((a: any) => {
          const p = profMap.get(a.user_id) || {};
          const hasCoords = p.latitude != null && p.longitude != null && coords;
          const dist = hasCoords
            ? distanceMeters(coords!, { lat: Number(p.latitude), lng: Number(p.longitude) })
            : null;
          return {
            user_id: a.user_id,
            display_name: a.display_name || p.full_name || 'Barbeiro',
            shop_name: p.nome_barbearia || `Barbearia ${a.display_name || p.full_name || ''}`.trim(),
            rating_avg: 0,
            rating_count: 0,
            distance: dist,
          } as GeoBarber;
        });
      }
    }

    rows.sort((a, b) => {
      if (a.distance != null && b.distance != null && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      if (a.distance != null && b.distance == null) return -1;
      if (a.distance == null && b.distance != null) return 1;
      return b.rating_avg - a.rating_avg;
    });
    setGeoBarbers(rows);
    setLoadingBarbers(false);
  };

  // Ao abrir a seleção, pede permissão de localização e carrega a lista ordenada.
  useEffect(() => {
    if (!showLinkBarber) return;
    let active = true;
    (async () => {
      const coords = clientCoords ?? (await getCurrentPosition());
      if (!active) return;
      if (coords) setClientCoords(coords);
      else setGeoDenied(true);
      await loadGeoBarbers(coords);
    })();
    return () => { active = false; };
  }, [showLinkBarber]);

  const handleLinkBarber = async (barberId: string) => {
    if (!user) return;
    setLinkingBarber(true);
    let ok = false;
    const { error } = await supabase.rpc('link_self_to_barber' as any, { _barber_id: barberId } as any);
    if (error) {
      console.warn('[link_self_to_barber] RPC failed, falling back to direct update:', error);
      // Fallback: update profile directly (requires RLS to allow self-update of adm_responsavel_id)
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ adm_responsavel_id: barberId } as any)
        .eq('id', user.id);
      if (updErr) {
        console.error('[handleLinkBarber] fallback update failed:', updErr);
        toast.error(t('profile.linkError') + (updErr.message ? `: ${updErr.message}` : ''));
      } else {
        ok = true;
      }
    } else {
      ok = true;
    }
    if (ok) {
      toast.success(t('profile.linkSuccess'));
      setShowLinkBarber(false);
      loadProfile();
    }
    setLinkingBarber(false);
  };

  const handleUnlinkBarber = async () => {
    if (!user) return;
    if (!window.confirm(t('profile.unlinkConfirm'))) return;
    setUnlinking(true);
    const { error } = await supabase.rpc('unlink_self_from_barber' as any);
    if (error) {
      toast.error(t('profile.unlinkError'));
    } else {
      setBarberName(null);
      setBarberEndereco(null);
      setBarberMapsLink(null);
      setProfile(p => ({ ...p, adm_responsavel_id: null }));
      toast.success(t('profile.unlinkSuccess'));
      setShowLinkBarber(true);
      loadProfile();
    }
    setUnlinking(false);
  };

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const confirmCancelAppointment = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelled' }).eq('id', cancelTarget);
    setCancelling(false);
    setCancelTarget(null);
    if (error) {
      toast.error(t('profile.cancelError'));
    } else {
      toast.success(t('profile.cancelSuccess'));
      loadAppointments();
    }
  };

  const formatBirthDate = (date: string | null) => formatDateLabel(date);

  if (!user) {
    const handleLoginSuccess = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', u.id);
      if (roles?.some(r => r.role === 'ceo')) navigate('/ceo', { replace: true });
      else if (roles?.some(r => r.role === 'admin')) navigate('/admin', { replace: true });
      // clientes permanecem no próprio perfil (re-render automático)
    };
    return (
      <div className="min-h-screen pb-20 flex flex-col items-center justify-center px-4">
        <p className="text-muted-foreground text-center mb-4">{t('profile.loginPrompt')}</p>
        <ClientAuthForm title={t('profile.loginTitle')} onSuccess={handleLoginSuccess} />
      </div>
    );
  }


  return (
    <div className="page-shell min-h-screen">
      <Seo path="/profile" title="Meu Perfil — Agendamentos e Fidelidade" description="Acesse seu perfil: veja seus agendamentos, histórico de cortes, programa de fidelidade e gerencie seus dados na barbearia." />
      {/* Header */}
      <div className="page-header flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label="Voltar"><ArrowLeft size={24} /></button>
          <h1 className="font-heading text-xl text-foreground">{t('profile.headerTitle')}</h1>
        </div>
        <button onClick={handleSignOut} className="flex items-center gap-1.5 text-sm text-destructive border border-destructive/30 rounded-lg px-3 py-1.5 hover:bg-destructive/10 transition-colors">
          <LogOut size={16} /> {t('profile.logout')}
        </button>
      </div>

      {/* Profile Section */}
      <section className="px-4 space-y-4 mb-6">
        {editing ? (
          <>
            {/* Avatar editable */}
            <div className="flex justify-center">
              <label className="relative cursor-pointer">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary bg-muted flex items-center justify-center">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.warn('[Profile][AvatarUpload] preview failed to render, showing fallback icon', {
                          src: (e.currentTarget as HTMLImageElement).src.slice(0, 64),
                        });
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Camera size={32} className="text-muted-foreground" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 bg-primary rounded-full p-1.5">
                  <Camera size={14} className="text-primary-foreground" />
                </div>
                <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={handleAvatarChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </label>
            </div>

            <div className="wood-card px-4 py-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{t('profile.fullName')}</label>
                <input
                  value={editProfile.full_name}
                  onChange={e => setEditProfile(p => ({ ...p, full_name: e.target.value }))}
                  className="vintage-input w-full px-3 py-2 rounded-lg mt-1"
                  placeholder={t('profile.namePlaceholder')}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('profile.birthDate')}</label>
                <IOSDateInput
                  value={editProfile.data_nascimento || ''}
                  onChange={(value) => setEditProfile(p => ({ ...p, data_nascimento: value }))}
                  className="w-full mt-1"
                  max={new Date().toISOString().slice(0, 10)}
                  min="1900-01-01"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('profile.mobile')}</label>
                <input
                  value={editProfile.telefone || ''}
                  onChange={e => {
                    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                    if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
                    else if (v.length > 0) v = `(${v}`;
                    setEditProfile(p => ({ ...p, telefone: v }));
                  }}
                  className="vintage-input w-full px-3 py-2 rounded-lg mt-1"
                  placeholder={t('profile.phonePlaceholder')}
                />
              </div>
              <div className="flex gap-2">
                {!isNewProfile && (
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 py-2 rounded-lg text-sm border border-muted-foreground/30 text-muted-foreground flex items-center justify-center gap-1"
                  >
                    <X size={14} /> {t('common.cancel')}
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !editProfile.full_name}
                  className="vintage-btn flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40"
                >
                  <Save size={16} /> {saving ? t('profile.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Static profile view */
          <div className="wood-card px-4 py-5">
            <div className="flex items-center gap-4">
              <AvatarPreview
                src={avatarPreview}
                size={80}
                fallbackIconSize={28}
                className="border-2 border-primary shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-lg text-foreground truncate">{profile.full_name}</h2>
                  <button
                    onClick={() => { setEditProfile(profile); setEditing(true); }}
                    className="text-primary p-1.5 rounded-full hover:bg-primary/10 transition-colors"
                    title="Editar perfil"
                    aria-label="Editar perfil"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <div className="space-y-1 mt-1.5">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone size={13} className="text-primary/70" />
                    {profile.telefone || '—'}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Cake size={13} className="text-primary/70" />
                    {formatBirthDate(profile.data_nascimento)}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Scissors size={13} className="text-primary/70" />
                    {barberName ? (
                      <span className="flex items-center gap-2 flex-wrap">
                        <span>{barberName}</span>
                        <button
                          onClick={handleUnlinkBarber}
                          disabled={unlinking}
                          className="text-xs text-destructive inline-flex items-center gap-1 underline disabled:opacity-40"
                        >
                          <Unlink size={11} /> {t('profile.changeBarber')}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setShowLinkBarber(true)}
                        className="text-primary underline text-sm"
                      >
                        {t('profile.linkBarberCta')}
                      </button>
                    )}
                  </p>

                </div>
              </div>
            </div>

            {/* Chat button */}
            {barberName && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <button
                  onClick={() => navigate('/chat')}
                  className="vintage-btn w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                  <MessageCircle size={16} /> {t('profile.chatWith', { nome: barberName })}
                </button>
              </div>
            )}

            {barberEndereco && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                  <MapPin size={13} className="text-primary/70" />
                  <span className="font-medium text-foreground">{t('profile.whereWeAre')}</span>
                </p>
                <p className="text-sm text-muted-foreground ml-5 mb-2">{barberEndereco}</p>
                {barberMapsLink && (
                  <button
                    onClick={() => window.open(barberMapsLink, '_blank')}
                    className="vintage-btn ml-5 px-4 py-1.5 rounded-lg flex items-center gap-2 text-sm"
                  >
                    <Navigation size={14} /> {t('profile.howToGetThere')}
                  </button>
                )}
              </div>
            )}
            {!barberEndereco && barberName && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <p className="text-sm text-muted-foreground/60 flex items-center gap-2 italic">
                  <MapPin size={13} /> {t('profile.locationTbd')}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Loyalty Card */}
      <section className="px-4 mb-6">
        <h2 className="font-heading text-base text-primary mb-3 flex items-center gap-2">
          <Gift size={16} /> {t('profile.loyaltyCard')}
        </h2>
        <LoyaltyCard completedCount={completedAppts.length} t={t} />
      </section>

      {/* My Appointments */}
      <section className="px-4">
        <h2 className="font-heading text-base text-primary mb-3">{t('profile.myBookings')}</h2>
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setTab('pendentes')}
            className={`flex-1 py-2 rounded-lg text-sm font-heading transition-all ${tab === 'pendentes' ? 'slot-selected' : 'wood-card'}`}
          >
            <Clock size={14} className="inline mr-1" /> {t('profile.tabPending')} ({pendingAppts.length})
          </button>
          <button
            onClick={() => setTab('concluidos')}
            className={`flex-1 py-2 rounded-lg text-sm font-heading transition-all ${tab === 'concluidos' ? 'slot-selected' : 'wood-card'}`}
          >
            <CheckCircle size={14} className="inline mr-1" /> {t('profile.tabDone')} ({completedAppts.length})
          </button>
        </div>

        <div className="space-y-2">
          {(tab === 'pendentes' ? pendingAppts : completedAppts).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {tab === 'pendentes' ? t('profile.noPending') : t('profile.noDone')}
            </p>
          )}
          {(tab === 'pendentes' ? pendingAppts : completedAppts).map(appt => {
            const svcNames = (appt.servico_ids || [])
              .map((id: string) => services.find(s => s.id === id)?.name)
              .filter(Boolean)
              .join(', ');
            return (
              <div key={appt.id} className="wood-card px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-primary" />
                    <span className="font-heading text-sm text-foreground">
                      {formatDateShort(appt.data)}
                    </span>
                  </div>
                  <span className="font-heading text-primary">{appt.hora}</span>
                </div>
                <p className="text-sm text-muted-foreground">{svcNames || t('profile.service')}</p>
                {(() => {
                  const totalDuration = (appt.servico_ids || []).reduce((sum: number, id: string) => {
                    const svc = services.find(s => s.id === id);
                    return sum + (svc?.duration || 0);
                  }, 0);
                  return totalDuration > 0 ? (
                    <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                      <Clock size={10} /> {t('profile.minEstimated', { min: totalDuration })}
                    </p>
                  ) : null;
                })()}
                <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                  appt.status === 'confirmed' ? 'bg-accent/20 text-accent' :
                  appt.status === 'finalizado' ? 'bg-green-900/30 text-green-400' :
                  'bg-primary/20 text-primary'
                }`}>
                  {appt.status === 'confirmed' ? t('profile.statusConfirmed') : appt.status === 'finalizado' ? t('profile.statusDone') : t('profile.statusPending')}
                </span>
                {appt.status === 'finalizado' && user && (
                  <RatingWidget
                    agendamentoId={appt.id}
                    admId={appt.barbeiro_id}
                    clienteId={user.id}
                  />
                )}
                {(appt.status === 'pending' || appt.status === 'confirmed') && (
                  <button
                    onClick={() => setCancelTarget(appt.id)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Ban size={13} /> {t('profile.cancelBooking')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Modal de confirmação de cancelamento */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent className="wood-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading flex items-center gap-2 text-foreground">
              <Ban size={18} className="text-destructive" /> {t('profile.cancelTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t('profile.cancelDesc')}
              <span className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-primary text-xs font-medium">
                <Clock size={14} className="shrink-0" />
                {t('profile.cancelSlotNote')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{t('profile.keepBooking')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => { e.preventDefault(); confirmCancelAppointment(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? t('profile.cancelling') : t('profile.confirmCancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Link Barber Modal */}
      {showLinkBarber && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={() => setShowLinkBarber(false)}>
          <div className="wood-card w-full max-w-sm px-5 py-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg text-foreground">{t('profile.chooseShop')}</h3>
              <button onClick={() => setShowLinkBarber(false)} className="text-muted-foreground"><X size={20} /></button>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {geoDenied
                ? t('profile.geoDenied')
                : clientCoords
                  ? t('profile.geoNearest')
                  : t('profile.geoRequesting')}
            </p>
            {loadingBarbers ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('profile.loadingShops')}</p>
            ) : geoBarbers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('profile.noShops')}</p>
            ) : (
              <div className="space-y-2">
                {geoBarbers.map(b => (
                  <button
                    key={b.user_id}
                    onClick={() => handleLinkBarber(b.user_id)}
                    disabled={linkingBarber}
                    className="w-full wood-card px-4 py-3 flex items-center gap-3 hover:border-primary/50 transition-colors disabled:opacity-40 text-left"
                  >
                    <Scissors size={16} className="text-primary shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-heading text-foreground truncate">{b.shop_name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {b.rating_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Star size={11} className="text-primary" /> {b.rating_avg.toFixed(1)}
                          </span>
                        )}
                        {b.distance != null && (
                          <span className="flex items-center gap-0.5">
                            <MapPin size={11} className="text-primary" /> {formatDistance(b.distance)}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>

  );
}

const LOYALTY_GOAL = 10;

function LoyaltyCard({ completedCount, t }: { completedCount: number; t: (k: string, v?: Record<string, string | number>) => string }) {
  const currentCycle = completedCount % (LOYALTY_GOAL + 1);
  const cyclesCompleted = Math.floor(completedCount / (LOYALTY_GOAL + 1));
  const stamps = Math.min(currentCycle, LOYALTY_GOAL);
  const isRewardReady = stamps >= LOYALTY_GOAL;

  return (
    <div className="wood-card px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground font-medium">
          {isRewardReady ? t('profile.loyaltyNext') : t('profile.loyaltyProgress', { n: stamps, goal: LOYALTY_GOAL })}
        </p>
        {cyclesCompleted > 0 && (
          <span className="text-xs text-accent">{t('profile.loyaltyRedeemed', { n: cyclesCompleted })}</span>
        )}
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: LOYALTY_GOAL }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-8 rounded flex items-center justify-center text-xs font-bold transition-all ${
              i < stamps
                ? 'bg-primary text-primary-foreground'
                : i === stamps && !isRewardReady
                  ? 'bg-muted border border-dashed border-primary/50 text-muted-foreground'
                  : 'bg-muted text-muted-foreground/30'
            }`}
          >
            {i < stamps ? '✓' : i + 1}
          </div>
        ))}
      </div>
      {isRewardReady && (
        <p className="text-xs text-accent text-center font-medium">
          {t('profile.loyaltyReady')}
        </p>
      )}
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all rounded-full"
          style={{ width: `${(stamps / LOYALTY_GOAL) * 100}%` }}
        />
      </div>
    </div>
  );
}

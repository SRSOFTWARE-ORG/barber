import { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Trash2, Image as ImageIcon, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import LinkBarberPrompt from '@/components/LinkBarberPrompt';
import { buildScopedImagePath, prepareImageUpload } from '@/lib/media';
import Seo from '@/components/Seo';
import { useT } from '@/contexts/LanguageContext';

interface GalleryImage {
  id: string;
  adm_id: string;
  url_foto: string;
  descricao: string | null;
  created_at: string;
}

interface Barber {
  user_id: string;
  display_name: string;
}

export default function GalleryPage() {
  const navigate = useNavigate();
  const t = useT();
  const { role, user, barberId: linkedBarberId } = useAuth();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<string | 'all'>('all');
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryImage | null>(null);
  const isAdmin = role === 'admin' || role === 'ceo';
  const canSee = isAdmin || !!linkedBarberId;

  useEffect(() => {
    loadBarbers();
    loadGallery();
  }, []);

  const loadBarbers = async () => {
    // Show only barbers from the user's shop (multi-tenant isolation)
    const { data } = await supabase.rpc('list_my_shop_team');
    if (data) setBarbers((data as any[]).map(b => ({ user_id: b.user_id, display_name: b.display_name || t('gallery.barberFallback') })));
  };

  const loadGallery = async () => {
    // RLS scopes photos to the user's shop automatically.
    const { data } = await supabase
      .from('galeria_fotos')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setImages(data as GalleryImage[]);
  };

  const baseImages = images;
  const filteredImages = isAdmin && selectedBarber !== 'all'
    ? baseImages.filter(img => img.adm_id === selectedBarber)
    : baseImages;

  const getBarberName = (admId: string) => {
    return barbers.find(b => b.user_id === admId)?.display_name || t('gallery.barberFallback');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    const preparedFile = await prepareImageUpload(file, { maxDimension: 1800, quality: 0.9 });
    const path = buildScopedImagePath(user.id, preparedFile, 'gallery');

    const { error: uploadError } = await supabase.storage
      .from('gallery')
      .upload(path, preparedFile, {
        upsert: true,
        contentType: preparedFile.type || 'image/jpeg',
        cacheControl: '3600',
      });

    if (uploadError) {
      toast.error(t('gallery.uploadError', { msg: uploadError.message }));
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(path);

    const { error } = await supabase.from('galeria_fotos').insert({
      adm_id: user.id,
      url_foto: urlData.publicUrl,
      descricao: description || null,
    });

    if (error) {
      toast.error(t('gallery.saveError'));
    } else {
      toast.success(t('gallery.added'));
      setDescription('');
      loadGallery();
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('gallery.confirmDelete'))) return;
    await supabase.from('galeria_fotos').delete().eq('id', id);
    setImages(prev => prev.filter(i => i.id !== id));
    toast.success(t('gallery.removed'));
  };

  return (
    <div className="page-shell min-h-screen">
      <Seo path="/gallery" title="Galeria de Cortes de Cabelo Masculino" description="Veja nosso portfólio de cortes de cabelo masculino e barba realizados pelos nossos barbeiros. Inspire-se e agende seu próximo corte." jsonLd={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Galeria de Cortes de Cabelo Masculino",
        description: "Portfólio de cortes de cabelo masculino e barba realizados pelos nossos barbeiros.",
        url: "https://barber.srsoftwarestore.com/gallery",
      }} />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="text-primary" aria-label={t('common.back')}><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">{t('gallery.title')}</h1>
      </div>

      {!canSee ? (
        <LinkBarberPrompt feature={t('gallery.lockedFeature')} />
      ) : (
        <>
          {/* Barber filter (staff only) */}
          {isAdmin && barbers.length > 1 && (
        <div className="px-4 mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedBarber('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedBarber === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
            }`}
          >
            {t('common.all')}
          </button>
          {barbers.map(b => (
            <button
              key={b.user_id}
              onClick={() => setSelectedBarber(b.user_id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedBarber === b.user_id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {b.display_name}
            </button>
          ))}
        </div>
      )}

      {/* Admin upload */}
      {isAdmin && (
        <div className="px-4 mb-4">
          <div className="wood-card px-4 py-4 space-y-2">
            <input
              placeholder={t('gallery.descPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="vintage-input w-full px-3 py-2 rounded-lg"
            />
            <label className="vintage-btn w-full py-2 rounded-lg flex items-center justify-center gap-2 text-sm cursor-pointer">
              <Upload size={16} /> {uploading ? t('gallery.uploading') : t('gallery.addPhoto')}
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>
      )}

      {/* Gallery grid */}
      {filteredImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ImageIcon size={48} className="mb-2 opacity-30" />
          <p className="text-sm">{t('gallery.empty')}</p>
        </div>
      ) : (
        <div className="px-4 grid grid-cols-2 gap-2">
          {filteredImages.map(img => (
            <div key={img.id} className="wood-card overflow-hidden rounded-lg relative group">
              <button onClick={() => setSelectedPhoto(img)} className="w-full">
                <img src={img.url_foto} alt={img.descricao || 'Corte de cabelo masculino'} className="w-full h-40 object-cover" />
              </button>
              <div className="px-2 py-1.5">
                <p className="text-[10px] text-primary font-medium">{getBarberName(img.adm_id)}</p>
                {img.descricao && (
                  <p className="text-xs text-muted-foreground truncate">{img.descricao}</p>
                )}
              </div>
              {isAdmin && (user?.id === img.adm_id || role === 'ceo') && (
                <button
                  onClick={() => handleDelete(img.id)}
                  aria-label={t('gallery.deleteAria')}
                  className="absolute top-1 right-1 bg-destructive/80 text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button className="absolute top-4 right-4 text-white/80 z-10" onClick={() => setSelectedPhoto(null)} aria-label="Fechar">
            <X size={28} />
          </button>
          <img
            src={selectedPhoto.url_foto}
            alt={selectedPhoto.descricao || 'Corte de cabelo masculino'}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {selectedPhoto.descricao && (
            <p className="absolute bottom-6 text-center text-white/80 text-sm">{selectedPhoto.descricao}</p>
          )}
        </div>
      )}
    </div>
  );
}

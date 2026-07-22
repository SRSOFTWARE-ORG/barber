const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/x-tiff': 'tiff',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/vnd.microsoft.icon': 'ico',
  'image/x-icon': 'ico',
};

export const SUPPORTED_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'bmp',
  'tif',
  'tiff',
  'avif',
  'heic',
  'heif',
  'ico',
];

export const SUPPORTED_IMAGE_ACCEPT = [
  'image/*',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
  '.bmp',
  '.tif',
  '.tiff',
  '.avif',
  '.heic',
  '.heif',
  '.ico',
].join(',');

export const MAX_AVATAR_IMAGE_BYTES = 15 * 1024 * 1024;

// Formatos que o <canvas> não consegue re-encodar de forma confiável — enviamos como estão.
const PASSTHROUGH_TYPES = new Set([
  'image/gif',
  'image/svg+xml',
  'image/heic',
  'image/heif',
  'image/tiff',
  'image/x-tiff',
  'image/vnd.microsoft.icon',
  'image/x-icon',
]);

function replaceExtension(fileName: string, nextExtension: string) {
  return fileName.replace(/\.[^.]+$/, '') + `.${nextExtension}`;
}

function inferExtension(file: File) {
  const t = (file.type || '').toLowerCase();
  return MIME_EXTENSION_MAP[t] || file.name.split('.').pop()?.toLowerCase() || 'jpg';
}

// Aceita mesmo quando o browser não reporta o mime (ex.: iOS Safari em HEIC)
function looksLikeImage(file: File): boolean {
  if (file.type?.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

export function isSupportedImageFile(file: File): boolean {
  return looksLikeImage(file);
}

export function getUploadContentType(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type && type.startsWith('image/')) return type;

  const extension = inferExtension(file);
  const inferredMime = Object.entries(MIME_EXTENSION_MAP).find(([, ext]) => ext === extension)?.[0];
  return inferredMime || 'application/octet-stream';
}

export function imageFileDebugInfo(file: File) {
  return {
    name: file.name,
    size: file.size,
    type: file.type || '(sem mime informado pelo navegador)',
    inferredExtension: inferExtension(file),
    contentType: getUploadContentType(file),
  };
}

export function withImageCacheBust(src: string | null, stamp = Date.now()) {
  if (!src) return null;
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;

  try {
    const url = new URL(src, window.location.origin);
    url.searchParams.set('t', String(stamp));
    return url.toString();
  } catch {
    return src.includes('?') ? `${src}&t=${stamp}` : `${src}?t=${stamp}`;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

export async function prepareAvatarInlineDataUrl(file: File) {
  if (!looksLikeImage(file)) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }

  const preparedFile = await prepareImageUpload(file, { maxDimension: 720, quality: 0.82 });
  return readFileAsDataUrl(preparedFile);
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler a imagem selecionada.'));
    };
    image.src = objectUrl;
  });
}

export async function prepareImageUpload(
  file: File,
  options?: {
    maxDimension?: number;
    quality?: number;
  },
) {
  if (!looksLikeImage(file)) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }

  if (PASSTHROUGH_TYPES.has((file.type || '').toLowerCase())) {
    return file;
  }

  const maxDimension = options?.maxDimension ?? 1600;
  const quality = options?.quality ?? 0.88;

  try {
    const image = await loadImageElement(file);
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/jpeg', quality);
    });

    if (!blob) return file;

    return new File([blob], replaceExtension(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export function buildScopedImagePath(
  userId: string,
  file: File,
  prefix: string,
  stable = false,
) {
  const extension = inferExtension(file);
  return stable
    ? `${userId}/${prefix}.${extension}`
    : `${userId}/${prefix}-${Date.now()}.${extension}`;
}

export function extractStorageObjectPath(publicUrl: string, bucket: string) {
  try {
    const { pathname } = new URL(publicUrl);
    const marker = `/object/public/${bucket}/`;
    const start = pathname.indexOf(marker);
    if (start < 0) return null;
    return decodeURIComponent(pathname.slice(start + marker.length));
  } catch {
    return null;
  }
}
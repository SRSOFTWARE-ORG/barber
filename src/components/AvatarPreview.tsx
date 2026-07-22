import { useEffect, useState } from 'react';
import { User } from 'lucide-react';

interface AvatarPreviewProps {
  src: string | null | undefined;
  alt?: string;
  size?: number;
  className?: string;
  fallbackIconSize?: number;
}

/**
 * Renders an avatar image with a robust fallback:
 * - Works with `data:`, `blob:` and remote URLs
 * - Falls back to a user icon when the image fails to load
 * - Resets fallback state whenever `src` changes so a successful save
 *   after a broken preview shows the new image again
 */
export default function AvatarPreview({
  src,
  alt = 'Avatar',
  size = 96,
  className = '',
  fallbackIconSize,
}: AvatarPreviewProps) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const showImage = Boolean(src) && !broken;
  const iconSize = fallbackIconSize ?? Math.round(size * 0.4);

  return (
    <div
      data-testid="avatar-preview"
      className={`rounded-full overflow-hidden bg-muted flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
          data-testid="avatar-preview-img"
        />
      ) : (
        <User
          size={iconSize}
          className="text-muted-foreground"
          data-testid="avatar-preview-fallback"
        />
      )}
    </div>
  );
}

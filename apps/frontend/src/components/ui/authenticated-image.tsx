import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { openAuthenticatedFile } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

/**
 * Thumbnail for an image served through an authenticated API route (e.g.
 * `/files/patrol-checks/:id`) rather than the old unauthenticated `/uploads`
 * static mount — see docs/security/SECRET_INCIDENT_REMEDIATION.md P1. A plain
 * `<img src="/uploads/...">` can't attach the JWT bearer token, so this
 * fetches the image as a blob and renders that instead. Clicking opens the
 * full file in a new tab via the same authenticated fetch.
 */
export function AuthenticatedImage({
  src,
  alt,
  className,
  clickable = true,
}: {
  src: string;
  alt: string;
  className?: string;
  clickable?: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setFailed(false);
    api.get(src, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data as Blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) {
    return <div className={cn('flex items-center justify-center bg-gray-100 text-[10px] text-gray-400', className)}>—</div>;
  }
  if (!blobUrl) {
    return <div className={cn('animate-pulse bg-gray-200', className)} />;
  }

  const img = <img src={blobUrl} alt={alt} className={className} />;
  if (!clickable) return img;

  return (
    <button
      type="button"
      onClick={() => openAuthenticatedFile(src)}
      className="block"
    >
      {img}
    </button>
  );
}

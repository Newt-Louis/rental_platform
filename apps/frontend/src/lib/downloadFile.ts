import api from './axios';

/**
 * Fetches a file through the authenticated API (so the JWT bearer token —
 * stored in localStorage, attached by the axios interceptor — is actually
 * sent) and either opens it in a new tab or triggers a download, using a
 * short-lived object URL. A plain `<a href="/uploads/...">` cannot do this:
 * browser navigation doesn't attach the Authorization header, so once a
 * route requires auth (see docs/security/SECRET_INCIDENT_REMEDIATION.md P1 —
 * business documents moved off the old unauthenticated static /uploads
 * mount), links to it must go through this helper instead.
 */
export async function openAuthenticatedFile(url: string, opts?: { download?: string }) {
  const response = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(response.data as Blob);
  if (opts?.download) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = opts.download;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  }
  // Give the new tab / download time to actually read the blob before revoking.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

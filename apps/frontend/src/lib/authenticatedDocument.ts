import api from './axios';

const PREVIEWABLE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const PREVIEWABLE_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

export type AuthenticatedDocument = {
  fileName: string;
  mimeType?: string | null;
};

export function canPreviewAuthenticatedDocument(file: AuthenticatedDocument): boolean {
  const mimeType = file.mimeType?.toLowerCase().split(';', 1)[0]?.trim();
  if (mimeType && PREVIEWABLE_MIME_TYPES.has(mimeType)) return true;

  const extension = file.fileName.split('.').pop()?.toLowerCase();
  return !!extension && PREVIEWABLE_EXTENSIONS.has(extension);
}

async function fetchAuthenticatedBlob(url: string): Promise<Blob> {
  const response = await api.get(url, { responseType: 'blob' });
  return response.data as Blob;
}

function scheduleObjectUrlRevoke(objectUrl: string) {
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Private documents are fetched through the authenticated API. Previewable
 * files reserve their tab synchronously during the click event so browser
 * popup protection does not reject it after the awaited request finishes.
 */
export async function openOrDownloadAuthenticatedDocument(
  url: string,
  file: AuthenticatedDocument,
): Promise<'preview' | 'download'> {
  if (canPreviewAuthenticatedDocument(file)) {
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      throw new Error('Trình duyệt đã chặn cửa sổ xem trước. Vui lòng cho phép pop-up cho trang này rồi thử lại.');
    }
    previewWindow.opener = null;

    try {
      const blobUrl = URL.createObjectURL(await fetchAuthenticatedBlob(url));
      previewWindow.location.href = blobUrl;
      scheduleObjectUrlRevoke(blobUrl);
      return 'preview';
    } catch (error) {
      previewWindow.close();
      throw error;
    }
  }

  const blobUrl = URL.createObjectURL(await fetchAuthenticatedBlob(url));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  scheduleObjectUrlRevoke(blobUrl);
  return 'download';
}

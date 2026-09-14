import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './axios';
import {
  canPreviewAuthenticatedDocument,
  openOrDownloadAuthenticatedDocument,
} from './authenticatedDocument';

vi.mock('./axios', () => ({ default: { get: vi.fn() } }));

describe('authenticated document handling', () => {
  const createObjectURL = vi.fn(() => 'blob:authenticated-document');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  });

  it.each([
    [{ fileName: 'contract.pdf', mimeType: 'application/pdf' }, true],
    [{ fileName: 'photo.JPG', mimeType: 'image/jpeg' }, true],
    [{ fileName: 'legacy-image.png', mimeType: 'application/octet-stream' }, true],
    [{ fileName: 'agreement.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, false],
    [{ fileName: 'sheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, false],
  ])('classifies %s as previewable=%s', (document, expected) => {
    expect(canPreviewAuthenticatedDocument(document)).toBe(expected);
  });

  it('opens a PDF tab before fetching the authenticated blob', async () => {
    const previewWindow = { opener: window, location: { href: '' }, close: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(previewWindow);
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }) } as never);

    await expect(openOrDownloadAuthenticatedDocument('/files/contracts/pdf-1', {
      fileName: 'contract.pdf', mimeType: 'application/pdf',
    })).resolves.toBe('preview');

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(api.get).toHaveBeenCalledWith('/files/contracts/pdf-1', { responseType: 'blob' });
    expect(previewWindow.opener).toBeNull();
    expect(previewWindow.location.href).toBe('blob:authenticated-document');
  });

  it('downloads non-previewable documents using the original filename', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const appendChild = vi.spyOn(document.body, 'appendChild');
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(['docx']) } as never);

    await expect(openOrDownloadAuthenticatedDocument('/files/contracts/docx-1', {
      fileName: 'agreement.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })).resolves.toBe('download');

    expect(api.get).toHaveBeenCalledWith('/files/contracts/docx-1', { responseType: 'blob' });
    expect(click).toHaveBeenCalledOnce();
    expect((appendChild.mock.calls[0][0] as HTMLAnchorElement).download).toBe('agreement.docx');
  });

  it('reports a blocked preview tab instead of losing the click silently', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(openOrDownloadAuthenticatedDocument('/files/contracts/pdf-1', {
      fileName: 'contract.pdf', mimeType: 'application/pdf',
    })).rejects.toThrow('chặn cửa sổ xem trước');

    expect(api.get).not.toHaveBeenCalled();
  });
});

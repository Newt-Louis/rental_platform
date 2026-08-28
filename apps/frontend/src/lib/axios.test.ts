import { describe, it, expect, beforeEach } from 'vitest';
import api from './axios';

/**
 * The shared instance declares `Content-Type: application/json`. Axios reads
 * that header in `transformRequest` and, for a FormData body, serialises the
 * form to JSON — the attached File becomes `{}` and every upload reaches the
 * server with no file at all.
 */
describe('shared axios instance — request body handling', () => {
  let sent: any;

  beforeEach(() => {
    sent = undefined;
    api.defaults.adapter = async (config) => {
      sent = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config } as any;
    };
  });

  it('keeps a FormData body intact instead of serialising it to JSON', async () => {
    const form = new FormData();
    form.append('file', new Blob(['pdf-bytes'], { type: 'application/pdf' }), 'contract.pdf');
    form.append('documentType', 'CONTRACT');

    await api.post('/service-contracts/c1/documents', form);

    expect(sent.data).toBeInstanceOf(FormData);
    expect(typeof sent.data).not.toBe('string');
    expect((sent.data as FormData).get('file')).toBeInstanceOf(Blob);
  });

  it('leaves the content type unset for FormData so the browser adds the multipart boundary', async () => {
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.pdf');

    await api.post('/upload', form);

    expect(sent.headers.getContentType()).not.toBe('application/json');
  });

  it('still sends ordinary payloads as JSON', async () => {
    await api.post('/service-contracts', { title: 'Hợp đồng vệ sinh' });

    expect(sent.headers.getContentType()).toContain('application/json');
    expect(sent.data).toBe(JSON.stringify({ title: 'Hợp đồng vệ sinh' }));
  });
});

import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import { firstValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

function requestContext(url = '/api/example', requestId = 'request-1') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ url, requestId }) }),
  } as any;
}

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  it('keeps the standard response envelope for JSON API data', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      requestContext(),
      { handle: () => of({ id: 'item-1' }) },
    ));

    expect(result).toEqual({
      success: true,
      requestId: 'request-1',
      data: { id: 'item-1' },
    });
  });

  it('passes StreamableFile through unchanged so Nest sends its binary stream', async () => {
    const file = new StreamableFile(Readable.from(Buffer.from('%PDF-1.4')), {
      type: 'application/pdf',
      disposition: 'inline; filename="contract.pdf"',
    });

    const result = await firstValueFrom(interceptor.intercept(
      requestContext('/api/files/service-contract-documents/file-1'),
      { handle: () => of(file) },
    ));

    expect(result).toBe(file);
    expect(result).toBeInstanceOf(StreamableFile);
    expect((result as StreamableFile).getHeaders()).toEqual(expect.objectContaining({
      type: 'application/pdf',
      disposition: 'inline; filename="contract.pdf"',
    }));
  });

  it('continues to preserve the paginated response shape', async () => {
    const page = { data: [{ id: 'item-1' }], total: 1, page: 1, limit: 25 };
    const result = await firstValueFrom(interceptor.intercept(
      requestContext(),
      { handle: () => of(page) },
    ));

    expect(result).toEqual({ success: true, requestId: 'request-1', ...page });
  });
});

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — what the document-content endpoint accepts.
 * Mirrors the runtime ValidationPipe (whitelist + transform) from main.ts.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveProposalDocumentContentDto } from './proposal-document-content.dto';

const FP = 'a'.repeat(64);

async function throughPipe(body: Record<string, unknown>) {
  const instance = plainToInstance(SaveProposalDocumentContentDto, body);
  const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: false });
  return { instance: instance as any, errors };
}

const props = (errors: any[]): string[] =>
  errors.flatMap((e) => [e.property, ...props(e.children ?? [])]);

describe('SaveProposalDocumentContentDto', () => {
  it('strips business facts smuggled into the content', async () => {
    const { instance, errors } = await throughPipe({
      expectedContentVersion: 0,
      reviewedFingerprint: FP,
      content: {
        bodyIntro: 'ok', rentPerSqm: 1, area: 9999, editorContent: { anything: true },
        signatories: [{ name: 'X' }], sourceFingerprint: FP, contentVersion: 99,
      },
    });

    expect(errors).toHaveLength(0);
    for (const field of ['rentPerSqm', 'area', 'editorContent', 'signatories', 'sourceFingerprint', 'contentVersion']) {
      expect(instance.content).not.toHaveProperty(field);
    }
    expect(instance.content.bodyIntro).toBe('ok');
  });

  it('rejects an item key that is not part of the document', async () => {
    const { errors } = await throughPipe({
      expectedContentVersion: 0, reviewedFingerprint: FP, content: { items: [{ key: 'MONTHLY_RENT', narrativeText: 'x' }] },
    });
    expect(props(errors)).toContain('key');
  });

  it('accepts PNG/JPEG data URLs and refuses formats the PDF renderer cannot embed', async () => {
    const ok = await throughPipe({ expectedContentVersion: 0, reviewedFingerprint: FP, content: { logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } });
    expect(ok.errors).toHaveLength(0);

    for (const url of ['data:image/webp;base64,UklGRg==', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://evil.example/logo.png']) {
      const { errors } = await throughPipe({ expectedContentVersion: 0, reviewedFingerprint: FP, content: { logoDataUrl: url } });
      expect(props(errors)).toContain('logoDataUrl');
    }
  });

  it('requires the concurrency token and the reviewed fingerprint', async () => {
    const { errors } = await throughPipe({ content: {} });
    expect(props(errors)).toEqual(expect.arrayContaining(['expectedContentVersion', 'reviewedFingerprint']));

    const bad = await throughPipe({ expectedContentVersion: -1, reviewedFingerprint: 'not-a-hash', content: {} });
    expect(props(bad.errors)).toEqual(expect.arrayContaining(['expectedContentVersion', 'reviewedFingerprint']));
  });

  it('rejects a malformed document date and colour', async () => {
    const { errors } = await throughPipe({
      expectedContentVersion: 0, reviewedFingerprint: FP, content: { documentDate: '14/09/2026', primaryColor: 'red' },
    });
    expect(props(errors)).toEqual(expect.arrayContaining(['documentDate', 'primaryColor']));
  });
});

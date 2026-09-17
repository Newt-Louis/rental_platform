import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Generic email attachment support.
 *
 * Bytes are passed straight to Nodemailer when a message is sent, but they are
 * never stored in the EmailDelivery ledger: payloads are replayed by retry and
 * resend, and a PDF per row would bloat the table. The ledger keeps metadata
 * plus a `source` descriptor; whoever owns the document registers a resolver
 * that can produce the same bytes again, and the stored sha256 proves they are
 * the same bytes before anything is sent.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
  /** How to regenerate this content later (retry/resend/outbox delivery). */
  source?: EmailAttachmentSource;
}

export interface EmailAttachmentSource {
  kind: string;
  ref: Record<string, unknown>;
}

/** What EmailDelivery.payload.attachments stores for each attachment. */
export interface StoredEmailAttachment {
  filename: string;
  contentType: string | null;
  cid: string | null;
  size: number;
  sha256: string;
  source: EmailAttachmentSource | null;
}

export function sha256(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function describeAttachment(attachment: EmailAttachment): StoredEmailAttachment {
  return {
    filename: attachment.filename,
    contentType: attachment.contentType ?? null,
    cid: attachment.cid ?? null,
    size: attachment.content.length,
    sha256: sha256(attachment.content),
    source: attachment.source ?? null,
  };
}

export type EmailAttachmentResolver = (ref: Record<string, unknown>) => Promise<EmailAttachment>;

@Injectable()
export class EmailAttachmentRegistry {
  private readonly resolvers = new Map<string, EmailAttachmentResolver>();

  register(kind: string, resolver: EmailAttachmentResolver) {
    this.resolvers.set(kind, resolver);
  }

  /**
   * Regenerates stored attachments. Refuses to return anything that cannot be
   * resolved or no longer matches what was queued: sending the email without its
   * attachment, or with different content, would be a silent wrong send.
   */
  async resolve(stored: StoredEmailAttachment[] | null | undefined): Promise<EmailAttachment[]> {
    if (!stored?.length) return [];
    const resolved: EmailAttachment[] = [];
    for (const meta of stored) {
      const resolver = meta.source ? this.resolvers.get(meta.source.kind) : undefined;
      if (!meta.source || !resolver) {
        throw new Error(`Email attachment "${meta.filename}" has no resolvable source`);
      }
      const attachment = await resolver(meta.source.ref);
      const actual = sha256(attachment.content);
      if (actual !== meta.sha256) {
        throw new Error(`Email attachment "${meta.filename}" no longer matches the queued content`);
      }
      resolved.push({ ...attachment, filename: meta.filename, source: meta.source });
    }
    return resolved;
  }
}

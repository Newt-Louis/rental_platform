import { Injectable } from '@nestjs/common';
import { CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * SAP-004 — the amount tolerance for declaring two figures equal.
 *
 * It is a bare 1, and 1 is not a currency-neutral quantity: 1 VND is a rounding
 * speck, 1 USD is ~25,000 VND, 1 MMK is different again. Applying one number
 * across currencies is the same class of error as summing them.
 *
 * It is left at 1 rather than guessed per currency, because what an acceptable
 * reconciliation tolerance IS for each currency is a finance policy nobody has
 * stated. Tracked as SAP-REC-TOL-001. Today the tolerance is unreachable anyway:
 * no record can become comparable until the SAP currency contract exists.
 */
export const SAP_RECONCILIATION_TOLERANCE = 1;

/** Why a record could not be compared. Recorded so NEEDS_REVIEW is actionable. */
export type ReconciliationBlockReason =
  | 'OUR_AMOUNT_NOT_SOURCED'
  | 'SAP_AMOUNT_MISSING'
  | 'OUR_CURRENCY_UNKNOWN'
  | 'SAP_CURRENCY_UNKNOWN'
  | 'CURRENCY_MISMATCH';

export interface ComparabilityVerdict {
  comparable: boolean;
  reason: ReconciliationBlockReason | null;
}

/**
 * SAP-004 — two amounts may only be compared when both carry a unit of account
 * and those units are the same.
 *
 * Before this, status was `Math.abs(sapAmount - ourAmount) < 1 ? MATCHED : MISMATCH`
 * on two bare numbers, so 100 VND and 100 USD reconciled as equal.
 *
 * UNKNOWN can never become MATCHED. Exported so the rule is testable on its own
 * rather than only through the batch.
 */
export function assessComparability(input: {
  ourAmount: number | null;
  ourCurrencyCode: CurrencyCode | null;
  sapAmount: number | null;
  sapCurrencyCode: CurrencyCode | null;
}): ComparabilityVerdict {
  if (input.ourAmount === null || input.ourAmount === undefined) {
    return { comparable: false, reason: 'OUR_AMOUNT_NOT_SOURCED' };
  }
  if (input.sapAmount === null || input.sapAmount === undefined) {
    return { comparable: false, reason: 'SAP_AMOUNT_MISSING' };
  }
  if (!input.ourCurrencyCode) return { comparable: false, reason: 'OUR_CURRENCY_UNKNOWN' };
  if (!input.sapCurrencyCode) return { comparable: false, reason: 'SAP_CURRENCY_UNKNOWN' };
  if (input.ourCurrencyCode !== input.sapCurrencyCode) {
    return { comparable: false, reason: 'CURRENCY_MISMATCH' };
  }
  return { comparable: true, reason: null };
}

@Injectable()
export class SapReconciliationService {
  constructor(private prisma: PrismaService) {}

  private buildIdempotencyKey(entityType: string, entityId: string, action: string) {
    return `${entityType}:${entityId}:${action}`;
  }

  async listRecords(query: { status?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * +limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.sapReconciliationRecord.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sapReconciliationRecord.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async reconcilePending() {
    const logs = await this.prisma.sapIntegrationLog.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let matched = 0;
    let mismatched = 0;
    let needsReview = 0;

    for (const log of logs) {
      const idempotencyKey =
        log.idempotencyKey ?? this.buildIdempotencyKey(log.entityType, log.entityId, log.endpoint);

      const existing = await this.prisma.sapReconciliationRecord.findUnique({
        where: { idempotencyKey },
      });
      if (existing) continue;

      // SAP-004 -- our side is sourced only for INVOICE. Every other entity type
      // used to persist a fabricated 0, which could then MATCH a SAP zero on two
      // meaningless numbers. An unsourced side is null now, and null is never
      // comparable.
      let ourAmount: number | null = null;
      let ourCurrencyCode: CurrencyCode | null = null;
      if (log.entityType === 'INVOICE') {
        const invoice = await this.prisma.invoice.findUnique({
          where: { id: log.entityId },
          select: { totalAmount: true, currencyCode: true },
        });
        if (invoice) {
          ourAmount = invoice.totalAmount;
          ourCurrencyCode = invoice.currencyCode;
        }
      }

      let sapAmount: number | null = null;
      // SAP-004 -- BLOCKED, deliberately. log.response is raw text from the
      // external endpoint; no verified field carries a currency and no verified
      // meaning exists for one. Reading Invoice.currencyCode into this variable
      // would assert SAP answered in our currency. See SAP-004-EXT.
      const sapCurrencyCode: CurrencyCode | null = null;
      let parseFailed = false;
      try {
        const response = log.response ? JSON.parse(log.response) : null;
        sapAmount = response?.amount ?? response?.data?.amount ?? null;
      } catch {
        parseFailed = true;
      }

      const verdict = assessComparability({ ourAmount, ourCurrencyCode, sapAmount, sapCurrencyCode });
      let status: string;
      let note: string | null = null;

      if (parseFailed) {
        status = 'NEEDS_REVIEW';
        note = 'SAP response could not be parsed';
      } else if (!verdict.comparable) {
        // UNKNOWN never becomes MATCHED. It stays observable as NEEDS_REVIEW
        // carrying the reason, so the queue is actionable rather than silent.
        status = 'NEEDS_REVIEW';
        note = `Not comparable: ${verdict.reason}`;
      } else {
        status =
          Math.abs((sapAmount as number) - (ourAmount as number)) < SAP_RECONCILIATION_TOLERANCE
            ? 'MATCHED'
            : 'MISMATCH';
      }

      await this.prisma.sapReconciliationRecord.create({
        data: {
          entityType: log.entityType,
          entityId: log.entityId,
          sapRef: `SAP-${log.id.slice(0, 8)}`,
          ourAmount,
          ourCurrencyCode,
          sapAmount,
          sapCurrencyCode,
          status,
          notes: note,
          idempotencyKey,
          reconciledAt: status === 'MATCHED' ? new Date() : null,
        },
      });

      if (status === 'MATCHED') matched++;
      else if (status === 'MISMATCH') mismatched++;
      else if (status === 'NEEDS_REVIEW') needsReview++;
    }

    return { matched, mismatched, needsReview, processed: matched + mismatched + needsReview };
  }

  ensureIdempotencyKey(entityType: string, entityId: string, action: string) {
    return this.buildIdempotencyKey(entityType, entityId, action);
  }

  generateUniqueKey() {
    return crypto.randomUUID();
  }
}

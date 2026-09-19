import { BadRequestException } from '@nestjs/common';
import { HandoverReadinessLifecycle, Role } from '@prisma/client';
import { MODULE_PERMISSION_DEFAULTS } from '../../common/constants/module-permission-defaults';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import {
  businessToday,
  COMMITMENT_CONFLICT_MESSAGE,
  dueReminderSlot,
  evaluateReadiness,
  formatBusinessDate,
  isoWeekKey,
  parseBusinessDate,
} from './handover-readiness.policy';
import { validateEvidenceImage } from './handover-readiness-evidence';
import { HandoverReadinessNotifierService } from './handover-readiness-notifier.service';

const d = (iso: string) => parseBusinessDate(iso);
const base = {
  lifecycleStatus: HandoverReadinessLifecycle.TRACKING,
  originalTargetDate: d('2026-12-01'),
  targetReadyDate: d('2026-12-01'),
  dateChangeCount: 0,
  openHighRiskCount: 0,
  commitments: [],
};

describe('CR-UNIT-HANDOVER-READINESS policy', () => {
  describe('business dates (no timezone off-by-one)', () => {
    it('round-trips 2026-12-01 exactly', () => {
      expect(formatBusinessDate(d('2026-12-01'))).toBe('2026-12-01');
      expect(d('2026-12-01').toISOString()).toBe('2026-12-01T00:00:00.000Z');
    });
    it('rejects impossible or non-date input', () => {
      for (const bad of ['2026-02-30', '2026-13-01', '01/12/2026', '2026-12-01T10:00:00Z', '', null, 20261201]) {
        expect(() => parseBusinessDate(bad as any)).toThrow(BadRequestException);
      }
    });
    it('today is the Vietnam calendar date, not UTC', () => {
      // 2026-11-30T18:30Z is already 2026-12-01 01:30 in Asia/Ho_Chi_Minh.
      expect(formatBusinessDate(businessToday(new Date('2026-11-30T18:30:00Z')))).toBe('2026-12-01');
      expect(formatBusinessDate(businessToday(new Date('2026-12-01T16:59:00Z')))).toBe('2026-12-01');
    });
    it('ISO week key is stable within a week', () => {
      expect(isoWeekKey(d('2026-09-14'))).toBe(isoWeekKey(d('2026-09-20')));
      expect(isoWeekKey(d('2026-09-21'))).not.toBe(isoWeekKey(d('2026-09-20')));
    });
  });

  describe('reminder milestones (HANDOVER-013..019)', () => {
    it.each([
      [45, null], [31, null], [30, 'D-30'], [29, 'D-30'], [15, 'D-30'], [14, 'D-14'], [8, 'D-14'],
      [7, 'D-7'], [4, 'D-7'], [3, 'D-3'], [2, 'D-3'], [1, 'D-1'], [0, 'D0'],
    ])('%i days remaining -> %s', (days, key) => {
      expect(dueReminderSlot(days)?.key ?? null).toBe(key);
    });
    it('overdue reminders bucket by week (bounded, never daily)', () => {
      expect([-1, -3, -7].map((n) => dueReminderSlot(n)!.key)).toEqual(['OVERDUE-W0', 'OVERDUE-W0', 'OVERDUE-W0']);
      expect([-8, -14].map((n) => dueReminderSlot(n)!.key)).toEqual(['OVERDUE-W1', 'OVERDUE-W1']);
      expect(dueReminderSlot(-15)!.key).toBe('OVERDUE-W2');
    });
    it('over a full 40-day countdown produces exactly the six milestones', () => {
      const keys = new Set<string>();
      for (let days = 40; days >= 0; days--) {
        const slot = dueReminderSlot(days);
        if (slot) keys.add(slot.key);
      }
      expect([...keys]).toEqual(['D-30', 'D-14', 'D-7', 'D-3', 'D-1', 'D0']);
    });
  });

  describe('evaluateReadiness -- the single status authority', () => {
    const today = d('2026-11-01');
    it('TRACKING far from target; WARNING at <=30; AT_RISK at <=7; OVERDUE past target', () => {
      expect(evaluateReadiness({ ...base, targetReadyDate: d('2026-12-15'), originalTargetDate: d('2026-12-15') }, today))
        .toMatchObject({ status: 'TRACKING', deadlineLevel: 'NONE', daysRemaining: 44 });
      expect(evaluateReadiness({ ...base, targetReadyDate: d('2026-11-20'), originalTargetDate: d('2026-11-20') }, today))
        .toMatchObject({ status: 'TRACKING', deadlineLevel: 'WARNING', riskFlags: ['DEADLINE_WARNING'] });
      expect(evaluateReadiness({ ...base, targetReadyDate: d('2026-11-08'), originalTargetDate: d('2026-11-08') }, today))
        .toMatchObject({ status: 'AT_RISK', deadlineLevel: 'CRITICAL' });
      expect(evaluateReadiness({ ...base, targetReadyDate: d('2026-10-30'), originalTargetDate: d('2026-10-30') }, today))
        .toMatchObject({ status: 'OVERDUE', deadlineLevel: 'OVERDUE', daysRemaining: -2 });
    });
    it('slippage: >=2 changes OR >15 days later than the original', () => {
      expect(evaluateReadiness({ ...base, dateChangeCount: 2 }, today).slippage).toBe(true);
      expect(evaluateReadiness({ ...base, originalTargetDate: d('2026-11-15'), targetReadyDate: d('2026-12-01'), dateChangeCount: 1 }, today))
        .toMatchObject({ slippage: true, delayDays: 16, status: 'AT_RISK' });
      expect(evaluateReadiness({ ...base, originalTargetDate: d('2026-11-16'), targetReadyDate: d('2026-12-01'), dateChangeCount: 1 }, today).slippage).toBe(false);
    });
    it('an OPEN HIGH risk makes it AT_RISK', () => {
      expect(evaluateReadiness({ ...base, openHighRiskCount: 1 }, d('2026-10-01'))).toMatchObject({ status: 'AT_RISK', riskFlags: ['HIGH_RISK_OPEN'] });
    });
    it('customer commitment earlier than the Project target is a conflict (earliest wins)', () => {
      const e = evaluateReadiness({
        ...base,
        commitments: [
          { sourceType: 'FITOUT_PROJECT', sourceId: 'f1', sourceRef: 'HD-1', commitmentDate: d('2026-11-25') },
          { sourceType: 'PROPOSAL', sourceId: 'p1', sourceRef: 'TT-1', commitmentDate: d('2026-11-20') },
          { sourceType: 'PROPOSAL', sourceId: 'p2', sourceRef: 'TT-2', commitmentDate: d('2026-12-10') },
        ],
      }, today);
      expect(e.conflict).toEqual({
        sourceType: 'PROPOSAL', sourceId: 'p1', sourceRef: 'TT-1', commitmentDate: '2026-11-20',
        projectTargetDate: '2026-12-01', differenceDays: 11, message: COMMITMENT_CONFLICT_MESSAGE,
      });
      expect(e.status).toBe('AT_RISK');
      expect(evaluateReadiness({ ...base, commitments: [{ sourceType: 'PROPOSAL', sourceId: 'p', sourceRef: null, commitmentDate: d('2026-12-01') }] }, today).conflict).toBeNull();
    });
    it('CONFIRMED / CANCELLED are authoritative and carry no live risk flags', () => {
      for (const lifecycleStatus of [HandoverReadinessLifecycle.CONFIRMED, HandoverReadinessLifecycle.CANCELLED]) {
        const e = evaluateReadiness({ ...base, lifecycleStatus, targetReadyDate: d('2026-10-01'), openHighRiskCount: 3, dateChangeCount: 5 }, today);
        expect(e.status).toBe(lifecycleStatus);
        expect(e.riskFlags).toEqual([]);
        expect(e.deadlineLevel).toBe('NONE');
      }
    });
  });

  describe('confirmation evidence validation', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const file = (originalname: string, buffer: Buffer, mimetype: string) => ({ originalname, buffer, mimetype, size: buffer.length } as any);
    it('accepts a real PNG and hashes it', () => {
      expect(validateEvidenceImage(file('a.png', png, 'image/png'))).toMatchObject({ mimeType: 'image/png', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    });
    it('rejects renamed non-images, mismatched MIME, unsupported types and empty files', () => {
      expect(() => validateEvidenceImage(file('a.png', Buffer.from('%PDF-1.4'), 'image/png'))).toThrow(BadRequestException);
      expect(() => validateEvidenceImage(file('a.jpg', png, 'image/jpeg'))).toThrow(BadRequestException);
      expect(() => validateEvidenceImage(file('a.png', png, 'image/jpeg'))).toThrow(BadRequestException);
      expect(() => validateEvidenceImage(file('a.gif', Buffer.from('GIF89a'), 'image/gif'))).toThrow(BadRequestException);
      expect(() => validateEvidenceImage(file('a.png', Buffer.alloc(0), 'image/png'))).toThrow(BadRequestException);
    });
  });

  describe('email content', () => {
    it('escapes business strings and never renders storage paths', () => {
      const notifier = new HandoverReadinessNotifierService({} as any, {} as any, {} as any);
      const evaluation = evaluateReadiness(base, d('2026-11-01'));
      const out = notifier.compose({
        id: 'r1', mallId: 'm1', mallName: 'Mall <b>X</b>', unitId: 'u1', unitCode: 'A-<script>', unitName: null,
        targetReadyDate: d('2026-12-01'), originalTargetDate: d('2026-12-01'), projectOwnerId: null, projectOwnerLabel: null, evaluation,
      }, { kind: 'HIGH_RISK_ADDED', riskTitle: '<img src=x onerror=alert(1)>', actorName: 'Ops' });
      expect(out.html).not.toContain('<script>');
      expect(out.html).not.toContain('<img src=x');
      expect(out.html).toContain('01/12/2026');
      expect(out.html).not.toContain('uploads/');
    });
    it('an unsafe FRONTEND_URL drops the CTA instead of throwing (never rolls back a confirmation)', () => {
      const saved = { env: process.env.NODE_ENV, url: process.env.FRONTEND_URL, app: process.env.APP_ENV };
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'http://insecure.example';
      delete process.env.APP_ENV;
      try {
        const notifier = new HandoverReadinessNotifierService({} as any, {} as any, {} as any);
        const evaluation = evaluateReadiness({ ...base, lifecycleStatus: HandoverReadinessLifecycle.CONFIRMED }, d('2026-11-01'));
        const ctx = { id: 'r1', mallId: 'm1', mallName: 'Mall', unitId: 'u1', unitCode: 'A-1', unitName: null,
          targetReadyDate: d('2026-12-01'), originalTargetDate: d('2026-12-01'), projectOwnerId: null, projectOwnerLabel: null, evaluation };
        const out = notifier.compose(ctx, { kind: 'CONFIRMED', confirmedAt: new Date(), confirmedByName: 'Ops', note: 'Đạt', evidenceCount: 3, openRiskSummary: 'Không có' });
        expect(out.html).toContain('đủ điều kiện bàn giao');
        expect(out.html).not.toContain('insecure.example');
      } finally {
        process.env.NODE_ENV = saved.env;
        if (saved.url === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = saved.url;
        if (saved.app !== undefined) process.env.APP_ENV = saved.app;
      }
    });
  });

  describe('permission matrix invariants', () => {
    const defaults = (module: string) => MODULE_PERMISSION_DEFAULTS.find((m) => m.module === module)?.roles ?? [];
    it('confirm is Operation-only; ADMIN is not an implicit confirmer', () => {
      expect(defaults('handover-readiness-confirm')).toEqual([Role.OPERATION]);
      expect(MODULE_ROLES.handoverReadinessConfirm).toEqual([Role.OPERATION]);
    });
    it('FITOUT_BASIC_TEAM and TENANT get no handover authority by role', () => {
      for (const m of ['view', 'manage', 'risk-manage', 'confirm', 'reopen']) {
        expect(defaults(`handover-readiness-${m}`)).not.toContain(Role.FITOUT_BASIC_TEAM);
        expect(defaults(`handover-readiness-${m}`)).not.toContain(Role.TENANT);
      }
    });
    it('reopen is Mall Director (+ explicit ADMIN static grant)', () => {
      expect(defaults('handover-readiness-reopen')).toEqual([Role.MALL_DIRECTOR]);
      expect(MODULE_ROLES.handoverReadinessReopen).toEqual([Role.ADMIN, Role.MALL_DIRECTOR]);
    });
  });
});

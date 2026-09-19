import { Injectable } from '@nestjs/common';
import { ContractStatus, Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { businessToday, CustomerCommitment } from './handover-readiness.policy';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Which tenant-facing handover dates count as a LIVE commitment. Read-only:
 * this lifecycle never writes Proposal / Contract / FitoutProject.
 *
 * - Proposal.handoverDate, when the Proposal is active (isActive, not
 *   soft-deleted) and either in the approval pipeline (SUBMITTED /
 *   UNDER_REVIEW / APPROVED -- the date has been put to the business/tenant),
 *   or CONVERTED into a still-live Contract that has no FitoutProject yet.
 *   DRAFT (not yet committed), REJECTED and deleted Proposals are ignored.
 * - FitoutProject.handoverDate, when its Contract is live (ACTIVE, active,
 *   not deleted) and the tenant has not opened yet (actualOpenDate NULL). Once
 *   a FitoutProject exists it is the executed tenant-handover plan, so the
 *   converted Proposal it came from is no longer compared separately.
 */
const PIPELINE_PROPOSAL_STATUSES: ProposalStatus[] = [
  ProposalStatus.SUBMITTED,
  ProposalStatus.UNDER_REVIEW,
  ProposalStatus.APPROVED,
];
const PRE_FITOUT_CONTRACT_STATUSES: ContractStatus[] = [
  ContractStatus.DRAFT,
  ContractStatus.PENDING_LEGAL,
  ContractStatus.PENDING_SIGNATURE,
  ContractStatus.ACTIVE,
];
const FITOUT_CONTRACT_STATUSES: ContractStatus[] = [ContractStatus.ACTIVE];

/** A stored tenant handover timestamp -> the Vietnam business date it denotes. */
export function commitmentBusinessDate(value: Date): Date {
  return businessToday(value);
}

@Injectable()
export class HandoverReadinessCommitmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async forUnits(unitIds: string[], db: Db = this.prisma): Promise<Map<string, CustomerCommitment[]>> {
    const result = new Map<string, CustomerCommitment[]>();
    if (unitIds.length === 0) return result;
    const push = (unitId: string, c: CustomerCommitment) => {
      const list = result.get(unitId) ?? [];
      list.push(c);
      result.set(unitId, list);
    };

    const [proposals, projects] = await Promise.all([
      db.proposal.findMany({
        where: {
          unitId: { in: unitIds },
          isActive: true,
          deletedAt: null,
          handoverDate: { not: null },
          OR: [
            { status: { in: PIPELINE_PROPOSAL_STATUSES } },
            {
              status: ProposalStatus.CONVERTED,
              contract: {
                is: {
                  isActive: true,
                  deletedAt: null,
                  status: { in: PRE_FITOUT_CONTRACT_STATUSES },
                  fitoutProject: { is: null },
                },
              },
            },
          ],
        },
        select: { id: true, unitId: true, proposalNumber: true, handoverDate: true },
      }),
      db.fitoutProject.findMany({
        where: {
          unitId: { in: unitIds },
          handoverDate: { not: null },
          actualOpenDate: null,
          contract: { isActive: true, deletedAt: null, status: { in: FITOUT_CONTRACT_STATUSES } },
        },
        select: { id: true, unitId: true, handoverDate: true, contract: { select: { contractNumber: true } } },
      }),
    ]);

    for (const p of proposals) {
      push(p.unitId, {
        sourceType: 'PROPOSAL',
        sourceId: p.id,
        sourceRef: p.proposalNumber,
        commitmentDate: commitmentBusinessDate(p.handoverDate!),
      });
    }
    for (const f of projects) {
      push(f.unitId, {
        sourceType: 'FITOUT_PROJECT',
        sourceId: f.id,
        sourceRef: f.contract?.contractNumber ?? null,
        commitmentDate: commitmentBusinessDate(f.handoverDate!),
      });
    }
    return result;
  }

  async forUnit(unitId: string, db: Db = this.prisma): Promise<CustomerCommitment[]> {
    return (await this.forUnits([unitId], db)).get(unitId) ?? [];
  }
}

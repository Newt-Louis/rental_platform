import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildProposalSnapshot } from './proposal-version.util';

/**
 * Appends a ProposalVersion row. Shared by ProposalsService and
 * ProposalDocumentService so both write versions the same way inside whatever
 * transaction they already hold.
 */
export async function recordProposalVersion(
  client: PrismaService | Prisma.TransactionClient,
  proposal: Record<string, unknown>,
  createdById?: string,
  changeReason?: string,
) {
  const latest = await client.proposalVersion.findFirst({
    where: { proposalId: proposal.id as string },
    orderBy: { version: 'desc' },
  });
  const version = (latest?.version ?? 0) + 1;

  return client.proposalVersion.create({
    data: {
      proposalId: proposal.id as string,
      version,
      snapshot: buildProposalSnapshot(proposal) as object,
      createdById,
      changeReason,
    },
  });
}

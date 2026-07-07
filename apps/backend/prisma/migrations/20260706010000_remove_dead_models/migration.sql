-- DropForeignKey
ALTER TABLE "BankStatement" DROP CONSTRAINT "BankStatement_mallId_fkey";

-- DropForeignKey
ALTER TABLE "DepositAccount" DROP CONSTRAINT "DepositAccount_contractId_fkey";

-- DropForeignKey
ALTER TABLE "DepositAccount" DROP CONSTRAINT "DepositAccount_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentDownloadLog" DROP CONSTRAINT "DocumentDownloadLog_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentDownloadLog" DROP CONSTRAINT "DocumentDownloadLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "LeadContact" DROP CONSTRAINT "LeadContact_leadId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentReconciliation" DROP CONSTRAINT "PaymentReconciliation_bankStatementId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentReconciliation" DROP CONSTRAINT "PaymentReconciliation_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "ProposalNegotiationRound" DROP CONSTRAINT "ProposalNegotiationRound_proposalId_fkey";

-- DropForeignKey
ALTER TABLE "TicketFile" DROP CONSTRAINT "TicketFile_ticketId_fkey";

-- DropIndex
DROP INDEX "Tenant_portalEmail_key";

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "portalEmail",
DROP COLUMN "portalPassword";

-- DropTable
DROP TABLE "BankStatement";

-- DropTable
DROP TABLE "DepositAccount";

-- DropTable
DROP TABLE "DocumentDownloadLog";

-- DropTable
DROP TABLE "LeadContact";

-- DropTable
DROP TABLE "PaymentReconciliation";

-- DropTable
DROP TABLE "ProposalNegotiationRound";

-- DropTable
DROP TABLE "TicketFile";

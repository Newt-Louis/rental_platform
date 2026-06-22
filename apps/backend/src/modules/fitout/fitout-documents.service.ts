import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutDocumentStatus, FitoutDocumentType, FitoutStatus } from '@prisma/client';

@Injectable()
export class FitoutDocumentsService {
  constructor(private prisma: PrismaService) {}

  async listDocuments(projectId: string) {
    return this.prisma.fitoutDocument.findMany({
      where: { projectId },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async uploadDocument(data: {
    projectId: string;
    documentType: FitoutDocumentType;
    fileName: string;
    filePath: string;
    fileSizeKb?: number;
    uploadedById?: string;
  }) {
    const project = await this.prisma.fitoutProject.findUnique({
      where: { id: data.projectId },
    });
    if (!project) throw new NotFoundException('Fitout project not found');

    return this.prisma.fitoutDocument.create({
      data: {
        projectId: data.projectId,
        documentType: data.documentType,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSizeKb: data.fileSizeKb ?? 0,
        uploadedById: data.uploadedById,
        status: FitoutDocumentStatus.SUBMITTED,
        requiredFor: project.status,
      },
    });
  }

  async reviewDocument(
    documentId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNote?: string,
    reviewedById?: string,
  ) {
    const doc = await this.prisma.fitoutDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    return this.prisma.fitoutDocument.update({
      where: { id: documentId },
      data: {
        status: decision as FitoutDocumentStatus,
        reviewNote,
        reviewedById,
        reviewedAt: new Date(),
      },
    });
  }

  async checkGateRequirements(projectId: string, targetStatus: FitoutStatus) {
    const gates = await this.prisma.fitoutDocumentGate.findMany({
      where: { stage: targetStatus, isRequired: true, isActive: true },
    });

    if (!gates.length) return { canAdvance: true, missing: [] };

    const docs = await this.prisma.fitoutDocument.findMany({
      where: {
        projectId,
        documentType: { in: gates.map((g) => g.documentType) },
        status: FitoutDocumentStatus.APPROVED,
      },
    });

    const approvedTypes = new Set(docs.map((d) => d.documentType));
    const missing = gates
      .filter((g) => !approvedTypes.has(g.documentType))
      .map((g) => ({ documentType: g.documentType, description: g.description }));

    return {
      canAdvance: missing.length === 0,
      missing,
    };
  }

  async listGates() {
    return this.prisma.fitoutDocumentGate.findMany({
      where: { isActive: true },
      orderBy: [{ stage: 'asc' }, { order: 'asc' }],
    });
  }

  async upsertGate(data: {
    stage: FitoutStatus;
    documentType: FitoutDocumentType;
    isRequired?: boolean;
    description?: string;
    order?: number;
  }) {
    return this.prisma.fitoutDocumentGate.upsert({
      where: {
        stage_documentType: { stage: data.stage, documentType: data.documentType },
      },
      create: {
        stage: data.stage,
        documentType: data.documentType,
        isRequired: data.isRequired ?? true,
        description: data.description,
        order: data.order ?? 0,
      },
      update: {
        isRequired: data.isRequired,
        description: data.description,
        order: data.order,
      },
    });
  }
}

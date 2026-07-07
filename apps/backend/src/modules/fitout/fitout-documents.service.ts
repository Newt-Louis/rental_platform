import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutDocumentStatus } from '@prisma/client';

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
    documentType: string;
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

  /**
   * Nguồn dữ liệu kiểm tra gate là trạng thái Submittal (APPROVED/PUBLISHED) theo FitoutFormType,
   * không còn dựa vào FitoutDocument đơn giản nữa (từ khi có module Submittal đa cấp duyệt).
   */
  async checkGateRequirements(projectId: string, targetStatus: string) {
    const gates = await this.prisma.fitoutDocumentGate.findMany({
      where: { stage: targetStatus, isRequired: true, isActive: true },
    });

    if (!gates.length) return { canAdvance: true, missing: [] };

    const formTypes = await this.prisma.fitoutFormType.findMany({
      where: { code: { in: gates.map((g) => g.documentType) } },
    });
    const formTypeByCode = new Map(formTypes.map((f) => [f.code, f]));

    const approvedSubmittals = await this.prisma.fitoutSubmittal.findMany({
      where: {
        projectId,
        formTypeId: { in: formTypes.map((f) => f.id) },
        status: { in: ['APPROVED', 'PUBLISHED'] },
      },
      select: { formTypeId: true },
    });
    const approvedFormTypeIds = new Set(approvedSubmittals.map((s) => s.formTypeId));

    const missing = gates
      .filter((g) => {
        const formType = formTypeByCode.get(g.documentType);
        return !formType || !approvedFormTypeIds.has(formType.id);
      })
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
    stage: string;
    documentType: string;
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

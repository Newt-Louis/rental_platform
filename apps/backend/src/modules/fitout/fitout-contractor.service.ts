import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FitoutContractorService {
  constructor(private prisma: PrismaService) {}

  async listContractors(projectId: string) {
    return this.prisma.fitoutContractor.findMany({
      where: { projectId, isActive: true },
      include: { workers: { orderBy: { entryDate: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createContractor(projectId: string, dto: {
    companyName: string;
    licenseNo?: string;
    contactName: string;
    phone: string;
    email?: string;
    startDate: string;
    endDate?: string;
  }) {
    const project = await this.prisma.fitoutProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('FitoutProject not found');

    return this.prisma.fitoutContractor.create({
      data: {
        projectId,
        companyName: dto.companyName,
        licenseNo: dto.licenseNo,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  async updateContractor(projectId: string, contractorId: string, dto: Partial<{
    companyName: string;
    licenseNo: string;
    contactName: string;
    phone: string;
    email: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }>) {
    const existing = await this.prisma.fitoutContractor.findFirst({ where: { id: contractorId, projectId } });
    if (!existing) throw new NotFoundException('Contractor not found');

    return this.prisma.fitoutContractor.update({
      where: { id: contractorId },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async deleteContractor(projectId: string, contractorId: string) {
    const existing = await this.prisma.fitoutContractor.findFirst({ where: { id: contractorId, projectId } });
    if (!existing) throw new NotFoundException('Contractor not found');
    return this.prisma.fitoutContractor.update({ where: { id: contractorId }, data: { isActive: false } });
  }

  // ── WorkerAccessLog ──────────────────────────────────────────────────────────

  async listWorkerLogs(projectId: string) {
    return this.prisma.workerAccessLog.findMany({
      where: { projectId },
      include: { contractor: { select: { companyName: true } } },
      orderBy: { entryDate: 'desc' },
      take: 200,
    });
  }

  async logWorkerEntry(projectId: string, dto: {
    contractorId: string;
    workerName: string;
    idNumber: string;
    entryDate: string;
    purpose?: string;
  }) {
    const contractor = await this.prisma.fitoutContractor.findFirst({
      where: { id: dto.contractorId, projectId, isActive: true },
      select: { id: true },
    });
    if (!contractor) throw new BadRequestException('Contractor does not belong to this fitout project');

    return this.prisma.workerAccessLog.create({
      data: {
        projectId,
        contractorId: dto.contractorId,
        workerName: dto.workerName,
        idNumber: dto.idNumber,
        entryDate: new Date(dto.entryDate),
        purpose: dto.purpose,
      },
    });
  }

  async logWorkerExit(projectId: string, logId: string) {
    const existing = await this.prisma.workerAccessLog.findFirst({ where: { id: logId, projectId } });
    if (!existing) throw new NotFoundException('Worker log not found');
    return this.prisma.workerAccessLog.update({ where: { id: logId }, data: { exitDate: new Date() } });
  }
}

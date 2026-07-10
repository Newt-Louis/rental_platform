import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateCatalogItemDto {
  serviceCode: string;
  name: string;
  unit: string;
  defaultPrice: number;
  currency?: string;
  description?: string;
}

export interface UpdateCatalogItemDto {
  name?: string;
  unit?: string;
  defaultPrice?: number;
  currency?: string;
  description?: string;
  isActive?: boolean;
}

export interface ProposalServiceLineDto {
  serviceCatalogId?: string;
  serviceCode: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  currency?: string;
  notes?: string;
}

@Injectable()
export class ServiceCatalogService {
  constructor(private prisma: PrismaService) {}

  // ─── Catalog CRUD ─────────────────────────────────────────────────────────

  async getCatalog(mallId: string, onlyActive = false) {
    return this.prisma.servicePriceCatalog.findMany({
      where: {
        mallId,
        ...(onlyActive ? { isActive: true } : {}),
      },
      orderBy: { serviceCode: 'asc' },
    });
  }

  async getCatalogItem(id: string) {
    const item = await this.prisma.servicePriceCatalog.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Dịch vụ không tồn tại');
    return item;
  }

  async createCatalogItem(mallId: string, dto: CreateCatalogItemDto) {
    const exists = await this.prisma.servicePriceCatalog.findFirst({
      where: { mallId, serviceCode: dto.serviceCode },
    });
    if (exists) {
      throw new ConflictException(`Mã dịch vụ "${dto.serviceCode}" đã tồn tại trong mall này`);
    }

    return this.prisma.servicePriceCatalog.create({
      data: {
        mallId,
        serviceCode: dto.serviceCode,
        name: dto.name,
        unit: dto.unit,
        defaultPrice: dto.defaultPrice,
        currency: dto.currency ?? 'VND',
        description: dto.description,
      },
    });
  }

  async updateCatalogItem(id: string, dto: UpdateCatalogItemDto) {
    await this.getCatalogItem(id);
    return this.prisma.servicePriceCatalog.update({ where: { id }, data: dto });
  }

  async deactivateCatalogItem(id: string) {
    await this.getCatalogItem(id);
    return this.prisma.servicePriceCatalog.update({ where: { id }, data: { isActive: false } });
  }

  // ─── Proposal Services ────────────────────────────────────────────────────

  async getProposalServices(proposalId: string) {
    const services = await this.prisma.proposalService.findMany({
      where: { proposalId },
      include: { serviceCatalog: { select: { serviceCode: true, name: true, unit: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const totalVND = services
      .filter((s) => s.currency === 'VND')
      .reduce((sum, s) => sum + s.totalPrice, 0);

    const totalUSD = services
      .filter((s) => s.currency === 'USD')
      .reduce((sum, s) => sum + s.totalPrice, 0);

    return { services, totalVND, totalUSD };
  }

  async syncProposalServices(proposalId: string, lines: ProposalServiceLineDto[]) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id: proposalId } });
    if (!proposal || !proposal.isActive) throw new NotFoundException('Proposal không tồn tại');

    // Validate totalPrice = quantity × unitPrice (rounding tolerance 1)
    for (const line of lines) {
      const expected = Math.round(line.quantity * line.unitPrice);
      if (Math.abs(expected - line.totalPrice) > 1) {
        throw new BadRequestException(
          `Dòng dịch vụ "${line.name}": tổng tiền không khớp (${line.quantity} × ${line.unitPrice} ≠ ${line.totalPrice})`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.proposalService.deleteMany({ where: { proposalId } }),
      this.prisma.proposalService.createMany({
        data: lines.map((line) => ({
          proposalId,
          serviceCatalogId: line.serviceCatalogId ?? null,
          serviceCode: line.serviceCode,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          totalPrice: line.totalPrice,
          currency: line.currency ?? 'VND',
          notes: line.notes,
        })),
      }),
    ]);

    return this.getProposalServices(proposalId);
  }
}

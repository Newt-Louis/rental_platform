import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatus } from '@prisma/client';

@Injectable()
export class OccupancyAnalyticsService {
  private readonly logger = new Logger(OccupancyAnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async getOccupancyV2(mallId?: string, floorId?: string, category?: string) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;
    if (floorId) where.floorId = floorId;
    if (category) where.category = category;

    const units = await this.prisma.unit.findMany({
      where,
      select: {
        id: true,
        status: true,
        areaNLA: true,
        category: true,
        floor: { select: { id: true, name: true } },
        mall: { select: { id: true, name: true } },
      },
    });

    const totalUnits = units.length;
    const totalArea = units.reduce((s, u) => s + (u.areaNLA ?? 0), 0);

    const occupied = units.filter((u) => u.status === UnitStatus.OCCUPIED);
    const vacant = units.filter((u) => u.status === UnitStatus.VACANT);
    const booking = units.filter((u) => u.status === UnitStatus.BOOKING);
    const negotiating = units.filter((u) => u.status === UnitStatus.NEGOTIATING);
    const contracted = units.filter((u) => u.status === UnitStatus.CONTRACTED);
    const underFitout = units.filter((u) => u.status === UnitStatus.UNDER_FITOUT);

    const occupiedArea = occupied.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
    const vacantArea = vacant.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
    const underFitoutArea = underFitout.reduce((s, u) => s + (u.areaNLA ?? 0), 0);

    const occupancyRate = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0;
    const effectiveOccupancy = totalArea > 0
      ? Math.round(((occupiedArea + underFitoutArea) / totalArea) * 1000) / 10
      : 0;

    const byCategory = this.groupByField(units, 'category');
    const byFloor = this.groupByField(units, 'floor');

    return {
      summary: {
        totalUnits,
        totalArea,
        occupiedUnits: occupied.length,
        occupiedArea,
        vacantUnits: vacant.length,
        vacantArea,
        bookingUnits: booking.length,
        negotiatingUnits: negotiating.length,
        contractedUnits: contracted.length,
        underFitoutUnits: underFitout.length,
        underFitoutArea,
        occupancyRate,
        effectiveOccupancy,
      },
      byCategory,
      byFloor,
    };
  }

  private groupByField(units: any[], field: string) {
    const groups: Record<string, any> = {};

    for (const unit of units) {
      const key = field === 'floor' ? unit.floor?.name ?? 'Unknown' : unit[field] ?? 'Unknown';
      if (!groups[key]) {
        groups[key] = { total: 0, occupied: 0, vacant: 0, area: 0, occupiedArea: 0 };
      }
      groups[key].total++;
      groups[key].area += unit.areaNLA ?? 0;
      if (unit.status === UnitStatus.OCCUPIED) {
        groups[key].occupied++;
        groups[key].occupiedArea += unit.areaNLA ?? 0;
      } else if (unit.status === UnitStatus.VACANT) {
        groups[key].vacant++;
      }
    }

    return Object.entries(groups).map(([name, data]: [string, any]) => ({
      name,
      ...data,
      occupancyRate: data.area > 0 ? Math.round((data.occupiedArea / data.area) * 1000) / 10 : 0,
    }));
  }

  async getOccupancyTrend(mallId?: string, months = 12) {
    const snapshots = await this.prisma.occupancySnapshot.findMany({
      where: mallId ? { mallId, floorId: null, category: null } : { floorId: null, category: null },
      orderBy: { period: 'asc' },
      take: months,
    });

    return snapshots.map((s) => ({
      period: s.period,
      occupancyRate: s.occupancyRate,
      totalUnits: s.totalUnits,
      occupiedUnits: s.occupiedUnits,
      vacantUnits: s.vacantUnits,
      revenuePerSqm: s.revenuePerSqm,
    }));
  }

  @Cron('0 1 1 * *', { name: 'occupancy-snapshot', timeZone: 'Asia/Ho_Chi_Minh' })
  async takeMonthlySnapshot() {
    this.logger.log('Taking monthly occupancy snapshot...');
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const malls = await this.prisma.mall.findMany({ where: { isActive: true } });

    for (const mall of malls) {
      const units = await this.prisma.unit.findMany({
        where: { mallId: mall.id, isActive: true },
      });

      const totalUnits = units.length;
      const totalArea = units.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
      const occupied = units.filter((u) => u.status === UnitStatus.OCCUPIED);
      const occupiedArea = occupied.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
      const vacant = units.filter((u) => u.status === UnitStatus.VACANT);
      const underFitout = units.filter((u) => u.status === UnitStatus.UNDER_FITOUT);

      const monthInvoices = await this.prisma.invoice.aggregate({
        where: {
          contract: { unit: { mallId: mall.id } },
          period,
          status: { in: ['ISSUED', 'PAID', 'PARTIALLY_PAID'] },
        },
        _sum: { subtotal: true },
      });
      const monthlyRevenue = monthInvoices._sum.subtotal ?? 0;
      const revenuePerSqm = occupiedArea > 0 ? monthlyRevenue / occupiedArea : 0;

      await this.prisma.occupancySnapshot.upsert({
        where: {
          mallId_floorId_category_period: {
            mallId: mall.id,
            floorId: null as any,
            category: null as any,
            period,
          },
        },
        create: {
          mallId: mall.id,
          period,
          snapshotDate: now,
          totalUnits,
          occupiedUnits: occupied.length,
          vacantUnits: vacant.length,
          underFitout: underFitout.length,
          totalAreaSqm: totalArea,
          occupiedAreaSqm: occupiedArea,
          occupancyRate: totalArea > 0 ? (occupiedArea / totalArea) * 100 : 0,
          revenuePerSqm,
        },
        update: {
          snapshotDate: now,
          totalUnits,
          occupiedUnits: occupied.length,
          vacantUnits: vacant.length,
          underFitout: underFitout.length,
          totalAreaSqm: totalArea,
          occupiedAreaSqm: occupiedArea,
          occupancyRate: totalArea > 0 ? (occupiedArea / totalArea) * 100 : 0,
          revenuePerSqm,
        },
      });
    }

    this.logger.log(`Occupancy snapshot taken for ${malls.length} malls`);
  }

  async getVacancyAnalysis(mallId?: string) {
    const where: any = { isActive: true, status: UnitStatus.VACANT };
    if (mallId) where.mallId = mallId;

    const vacantUnits = await this.prisma.unit.findMany({
      where,
      select: {
        id: true,
        code: true,
        areaNLA: true,
        category: true,
        updatedAt: true,
        floor: { select: { name: true } },
      },
    });

    const now = new Date();
    const analysis = vacantUnits.map((u) => {
      const daysVacant = Math.floor((now.getTime() - u.updatedAt.getTime()) / 86400000);
      return {
        unitCode: u.code,
        floor: u.floor?.name,
        category: u.category,
        areaNLA: u.areaNLA,
        daysVacant,
        estimatedLoss: (u.areaNLA ?? 0) * 500000 * (daysVacant / 30),
      };
    });

    const totalVacantArea = analysis.reduce((s, a) => s + (a.areaNLA ?? 0), 0);
    const totalEstimatedLoss = analysis.reduce((s, a) => s + a.estimatedLoss, 0);
    const avgDaysVacant = analysis.length > 0
      ? Math.round(analysis.reduce((s, a) => s + a.daysVacant, 0) / analysis.length)
      : 0;

    return {
      summary: {
        totalVacantUnits: analysis.length,
        totalVacantArea,
        avgDaysVacant,
        totalEstimatedLoss,
      },
      units: analysis.sort((a, b) => b.daysVacant - a.daysVacant),
    };
  }
}

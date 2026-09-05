import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/services/redis.service';
import { PrismaParkingService } from '../prisma-parking/prisma-parking.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly parkingDb: PrismaParkingService,
  ) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness check (process is running)' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'THISO Leasing Platform API',
    };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Readiness check (required dependencies are available)' })
  async ready() {
    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const redisStatus = this.redis.isConfigured
      ? ((await this.redis.ping()) ? 'up' : 'down')
      : 'disabled';
    const parkingDbStatus = this.parkingDb.isConfigured
      ? ((await this.parkingDb.ping()) ? 'up' : 'down')
      : 'disabled';
    if (database === 'up' && redisStatus !== 'down' && parkingDbStatus !== 'down') {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        components: { database: 'up', redis: redisStatus, parkingDb: parkingDbStatus },
      };
    }
    throw new ServiceUnavailableException({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      components: { database, redis: redisStatus, parkingDb: parkingDbStatus },
    });
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const timestamp = new Date().toISOString();

    let dbStatus: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'down';
    }

    const aiEnabled = !!process.env.ANTHROPIC_API_KEY;
    const dbEmailSettings = await this.prisma.emailSettings.findFirst().catch(() => null);
    const emailEnabled = !!(dbEmailSettings?.isEnabled && dbEmailSettings.smtpHost && dbEmailSettings.smtpPassEncrypted)
      || !!process.env.SMTP_USER;
    const sapEnabled = process.env.SAP_ENABLED === 'true';
    const redisStatus = this.redis.isConfigured
      ? ((await this.redis.ping()) ? 'up' : 'down')
      : 'disabled';
    const parkingDbStatus = this.parkingDb.isConfigured
      ? ((await this.parkingDb.ping()) ? 'up' : 'down')
      : 'disabled';

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      timestamp,
      service: 'THISO Leasing Platform API',
      version: '1.0.0',
      components: {
        database: dbStatus,
        redis: redisStatus,
        parkingDb: parkingDbStatus,
        ai: aiEnabled ? 'configured' : 'disabled',
        email: emailEnabled ? 'configured' : 'disabled',
        sap: sapEnabled ? 'enabled' : 'disabled',
      },
    };
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
    const emailEnabled = !!process.env.SMTP_USER;
    const sapEnabled = process.env.SAP_ENABLED === 'true';

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      timestamp,
      service: 'THISO Leasing Platform API',
      version: '1.0.0',
      components: {
        database: dbStatus,
        ai: aiEnabled ? 'configured' : 'disabled',
        email: emailEnabled ? 'configured' : 'disabled',
        sap: sapEnabled ? 'enabled' : 'disabled',
      },
    };
  }
}

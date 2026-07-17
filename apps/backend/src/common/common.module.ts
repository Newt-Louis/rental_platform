import { Global, Module } from '@nestjs/common';
import { UnitStatusService } from './services/unit-status.service';
import { MallAccessService } from './services/mall-access.service';
import { RedisService } from './services/redis.service';
import { SchedulerLockService } from './services/scheduler-lock.service';
import { OperationalMetricsService } from './services/operational-metrics.service';
import { OperationalController } from './operational.controller';
import { OutboxService } from './services/outbox.service';

@Global()
@Module({
  controllers: [OperationalController],
  providers: [UnitStatusService, MallAccessService, RedisService, SchedulerLockService, OperationalMetricsService, OutboxService],
  exports: [UnitStatusService, MallAccessService, RedisService, SchedulerLockService, OperationalMetricsService, OutboxService],
})
export class CommonModule {}

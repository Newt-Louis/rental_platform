import { Global, Module } from '@nestjs/common';
import { UnitStatusService } from './services/unit-status.service';
import { MallAccessService } from './services/mall-access.service';
import { RedisService } from './services/redis.service';
import { SchedulerLockService } from './services/scheduler-lock.service';
import { OperationalMetricsService } from './services/operational-metrics.service';
import { OperationalController } from './operational.controller';
import { OutboxService } from './services/outbox.service';
import { EncryptionService } from './services/encryption.service';
import { PermissionsService } from './services/permissions.service';
import { FitoutDossierAccessService } from './services/fitout-dossier-access.service';
import { CategoryResolverService } from './services/category-resolver.service';

@Global()
@Module({
  controllers: [OperationalController],
  providers: [UnitStatusService, MallAccessService, RedisService, SchedulerLockService, OperationalMetricsService, OutboxService, EncryptionService, PermissionsService, FitoutDossierAccessService, CategoryResolverService],
  exports: [UnitStatusService, MallAccessService, RedisService, SchedulerLockService, OperationalMetricsService, OutboxService, EncryptionService, PermissionsService, FitoutDossierAccessService, CategoryResolverService],
})
export class CommonModule {}

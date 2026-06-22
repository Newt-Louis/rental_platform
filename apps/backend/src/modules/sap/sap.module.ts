import { Module } from '@nestjs/common';
import { SapController } from './sap.controller';
import { SapService } from './sap.service';
import { SapReconciliationService } from './sap-reconciliation.service';
import { SapEntityMappingService } from './sap-entity-mapping.service';

@Module({
  controllers: [SapController],
  providers: [SapService, SapReconciliationService, SapEntityMappingService],
  exports: [SapService, SapReconciliationService, SapEntityMappingService],
})
export class SapModule {}

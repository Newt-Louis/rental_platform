import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CrmBusinessEventService } from './crm-business-event.service';
import { LeadLifecycleService } from './lead-lifecycle.service';

@Module({
  controllers: [CrmController, CustomersController],
  providers: [CrmService, CustomersService, CrmBusinessEventService, LeadLifecycleService],
  exports: [CrmService, CustomersService, CrmBusinessEventService, LeadLifecycleService],
})
export class CrmModule {}

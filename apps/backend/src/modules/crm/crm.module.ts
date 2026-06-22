import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CrmController, CustomersController],
  providers: [CrmService, CustomersService],
  exports: [CrmService, CustomersService],
})
export class CrmModule {}

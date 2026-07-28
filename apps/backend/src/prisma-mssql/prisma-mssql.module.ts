import { Global, Module } from '@nestjs/common';
import { PrismaMssqlService } from './prisma-mssql.service';

@Global()
@Module({
  providers: [PrismaMssqlService],
  exports: [PrismaMssqlService],
})
export class PrismaMssqlModule {}

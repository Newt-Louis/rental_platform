import { Global, Module } from '@nestjs/common';
import { PrismaParkingService } from './prisma-parking.service';

@Global()
@Module({
  providers: [PrismaParkingService],
  exports: [PrismaParkingService],
})
export class PrismaParkingModule {}

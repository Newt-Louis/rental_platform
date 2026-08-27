import { Module } from '@nestjs/common';
import { ParkingDashboardController } from './parking-dashboard.controller';
import { ParkingDashboardService } from './parking-dashboard.service';

@Module({
  controllers: [ParkingDashboardController],
  providers: [ParkingDashboardService],
})
export class ParkingDashboardModule {}

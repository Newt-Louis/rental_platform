import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { StorageModule } from "../../storage/storage.module";
import { ParkingController } from "./parking.controller";
import { ParkingService } from "./parking.service";
@Module({
  imports: [StorageModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [ParkingController],
  providers: [ParkingService],
})
export class ParkingModule {}

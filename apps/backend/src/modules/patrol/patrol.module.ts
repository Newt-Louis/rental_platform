import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { StorageModule } from "../../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PatrolController } from "./patrol.controller";
import { PatrolService } from "./patrol.service";

@Module({
  imports: [
    StorageModule,
    NotificationsModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [PatrolController],
  providers: [PatrolService],
})
export class PatrolModule {}

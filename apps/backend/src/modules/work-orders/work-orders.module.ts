import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { StorageModule } from "../../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

@Module({
  imports: [
    StorageModule,
    NotificationsModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
})
export class WorkOrdersModule {}

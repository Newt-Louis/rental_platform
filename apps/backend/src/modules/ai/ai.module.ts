import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FloorPlanService } from './floor-plan.service';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [
    StorageModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [AiController],
  providers: [AiService, FloorPlanService],
})
export class AiModule {}

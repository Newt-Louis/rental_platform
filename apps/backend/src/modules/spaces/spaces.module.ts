import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { UnitMediaService } from './unit-media.service';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [SpacesController],
  providers: [SpacesService, UnitMediaService],
  exports: [SpacesService, UnitMediaService],
})
export class SpacesModule {}

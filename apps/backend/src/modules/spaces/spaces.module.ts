import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { UnitMediaService } from './unit-media.service';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceCatalogController } from './service-catalog.controller';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [SpacesController, ServiceCatalogController],
  providers: [SpacesService, UnitMediaService, ServiceCatalogService],
  exports: [SpacesService, UnitMediaService, ServiceCatalogService],
})
export class SpacesModule {}

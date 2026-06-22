import { Global, Module } from '@nestjs/common';
import { UnitStatusService } from './services/unit-status.service';
import { MallAccessService } from './services/mall-access.service';
import { RedisService } from './services/redis.service';

@Global()
@Module({
  providers: [UnitStatusService, MallAccessService, RedisService],
  exports: [UnitStatusService, MallAccessService, RedisService],
})
export class CommonModule {}

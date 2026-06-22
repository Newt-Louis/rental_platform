import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserMallAccessController } from './user-mall-access.controller';
import { UserMallAccessService } from './user-mall-access.service';

@Module({
  controllers: [UsersController, UserMallAccessController],
  providers: [UsersService, UserMallAccessService],
  exports: [UsersService, UserMallAccessService],
})
export class UsersModule {}

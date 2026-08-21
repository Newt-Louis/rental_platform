import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FloorPlanService } from './floor-plan.service';
import { MCPController } from './mcp.controller';
import { MCPServerService } from './mcp-server.service';
import { CodebaseChatController } from './codebase-chat.controller';
import { AiCodebaseService } from './ai-codebase.service';
import { StorageModule } from '../../storage/storage.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    StorageModule,
    PrismaModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [AiController, MCPController, CodebaseChatController],
  providers: [AiService, FloorPlanService, MCPServerService, AiCodebaseService],
})
export class AiModule {}

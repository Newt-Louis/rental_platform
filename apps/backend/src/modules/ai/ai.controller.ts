import {
  Controller, Post, Get, Body, UseGuards, Param, Query,
  UploadedFile, UseInterceptors, BadRequestException, Res, Sse,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, from } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { FloorPlanService } from './floor-plan.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';

// CR-101 Phase 3D (docs/changes/CR-101-PHASE-3D-AI-SCOPE-COMPLETION.md):
// every route below now derives its Mall-authorization context from the
// authenticated caller (@CurrentUser), never from client-supplied request
// data alone. chat/chatStream/getSuggestions build a server-derived
// AiRequestContext (authorizedMallIds, from the same MallAccessService.
// getAccessibleMallIds() used by every other Mall-scoped list endpoint in the
// codebase) and thread it through to AiService, which now filters every
// business-data query in buildContext()/getSuggestions() by it. The 5
// floor-plan routes now Mall-check the request's own mallId (create/list) or
// the analysis's own mallId via the new `floorPlanAnalysis` resolver
// (get/status/apply) -- previously 3 of the 5 had zero Mall check at all.
// `MODULE_ROLES.ai` does not include TENANT -- this controller is not
// Tenant-reachable, confirmed unchanged.
@ApiTags('AI Assistant')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.ai)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3D' })
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly floorPlanService: FloorPlanService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant (non-streaming)' })
  // Mỗi lần chat đều gọi Claude API thật (có phí) sau khi truy vấn context từ DB — giới hạn chặt hơn
  // mức mặc định toàn hệ thống để tránh spam/script lạm dụng chi phí LLM.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async chat(@Body() body: { message: string; history?: { role: string; content: string }[] }, @CurrentUser() user: any) {
    const authorizedMallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role, { crossMallRead: true });
    return this.aiService.chat(body.message, body.history ?? [], { userId: user.id, role: user.role, authorizedMallIds });
  }

  @Post('chat/stream')
  @ApiOperation({ summary: 'Chat with AI assistant (SSE streaming)' })
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async chatStream(
    @Body() body: { message: string; history?: { role: string; content: string }[] },
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const authorizedMallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role, { crossMallRead: true });
      await this.aiService.chatStream(body.message, body.history ?? [], (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }, { userId: user.id, role: user.role, authorizedMallIds });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get suggested questions' })
  async getSuggestions(@CurrentUser() user: any) {
    const authorizedMallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role, { crossMallRead: true });
    return this.aiService.getSuggestions({ userId: user.id, role: user.role, authorizedMallIds });
  }

  // ─── Floor Plan Analysis ───────────────────────────────────────────────────

  @Post('floor-plan/analyze')
  @ApiOperation({ summary: 'Upload floor plan PDF/image and start AI analysis' })
  // Phân tích ảnh bằng vision model — tốn kém hơn chat nhiều lần, giới hạn nghiêm ngặt hơn.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file:   { type: 'string', format: 'binary' },
        mallId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        cb(new Error('Only PDF and image files are allowed'), false);
      },
    }),
  )
  async analyzeFloorPlan(
    @UploadedFile() file: Express.Multer.File,
    @Body('mallId') mallId: string,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!mallId) throw new BadRequestException('mallId is required');
    // CR-101 Phase 3G: deliberately NOT given crossMallRead -- this creates a
    // new analysis (a write), and CEO's enterprise grant is read-only.
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.floorPlanService.uploadAndAnalyze(file, mallId);
  }

  @Get('floor-plan/analyses')
  @ApiOperation({ summary: 'List floor plan analyses for a mall' })
  async getAnalyses(@Query('mallId') mallId: string, @CurrentUser() user: any) {
    if (!mallId) throw new BadRequestException('mallId is required');
    // CR-101 Phase 3G: read-only, part of CEO's approved enterprise READ scope.
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId, { crossMallRead: true });
    return this.floorPlanService.getAnalyses(mallId);
  }

  @Get('floor-plan/analyses/:id')
  @ApiOperation({ summary: 'Get full analysis result' })
  async getAnalysis(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorPlanAnalysisId: id }, { crossMallRead: true });
    return this.floorPlanService.getAnalysis(id);
  }

  @Get('floor-plan/analyses/:id/status')
  @ApiOperation({ summary: 'Poll analysis status' })
  async getAnalysisStatus(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorPlanAnalysisId: id }, { crossMallRead: true });
    return this.floorPlanService.pollStatus(id);
  }

  @Post('floor-plan/analyses/:id/apply')
  @ApiOperation({ summary: 'Apply AI zone suggestions to system (create floors & zones)' })
  async applyAnalysis(@Param('id') id: string, @CurrentUser() user: any) {
    // File-first: Mall is resolved from the analysis's OWN mallId, not a
    // client-supplied parameter -- this is a write operation (creates real
    // Floor/Zone/Unit records), so this check matters even more than on the
    // read-only routes above. CR-101 Phase 3G: deliberately NOT given
    // crossMallRead -- CEO's enterprise grant is read-only (BC-CEO-SCOPE
    // Option A explicitly excludes CREATE), so this stays governed by CEO's
    // ordinary UserMallAccess grants like any other write.
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorPlanAnalysisId: id });
    return this.floorPlanService.applySuggestions(id);
  }
}

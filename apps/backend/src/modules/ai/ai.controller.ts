import {
  Controller, Post, Get, Body, UseGuards, Param, Query,
  UploadedFile, UseInterceptors, BadRequestException, Res, Sse,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, from } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { FloorPlanService } from './floor-plan.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';

@ApiTags('AI Assistant')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.ai)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly floorPlanService: FloorPlanService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant (non-streaming)' })
  chat(@Body() body: { message: string; history?: { role: string; content: string }[] }) {
    return this.aiService.chat(body.message, body.history ?? []);
  }

  @Post('chat/stream')
  @ApiOperation({ summary: 'Chat with AI assistant (SSE streaming)' })
  async chatStream(
    @Body() body: { message: string; history?: { role: string; content: string }[] },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await this.aiService.chatStream(body.message, body.history ?? [], (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get suggested questions' })
  getSuggestions() {
    return this.aiService.getSuggestions();
  }

  // ─── Floor Plan Analysis ───────────────────────────────────────────────────

  @Post('floor-plan/analyze')
  @ApiOperation({ summary: 'Upload floor plan PDF/image and start AI analysis' })
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
  analyzeFloorPlan(
    @UploadedFile() file: Express.Multer.File,
    @Body('mallId') mallId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.floorPlanService.uploadAndAnalyze(file, mallId);
  }

  @Get('floor-plan/analyses')
  @ApiOperation({ summary: 'List floor plan analyses for a mall' })
  getAnalyses(@Query('mallId') mallId: string) {
    return this.floorPlanService.getAnalyses(mallId);
  }

  @Get('floor-plan/analyses/:id')
  @ApiOperation({ summary: 'Get full analysis result' })
  getAnalysis(@Param('id') id: string) {
    return this.floorPlanService.getAnalysis(id);
  }

  @Get('floor-plan/analyses/:id/status')
  @ApiOperation({ summary: 'Poll analysis status' })
  getAnalysisStatus(@Param('id') id: string) {
    return this.floorPlanService.pollStatus(id);
  }

  @Post('floor-plan/analyses/:id/apply')
  @ApiOperation({ summary: 'Apply AI zone suggestions to system (create floors & zones)' })
  applyAnalysis(@Param('id') id: string) {
    return this.floorPlanService.applySuggestions(id);
  }
}

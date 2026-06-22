import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

const ANALYSIS_PROMPT = `Bạn là chuyên gia phân tích mặt bằng thương mại hàng đầu Việt Nam.

Phân tích bản vẽ sơ đồ mặt bằng và trả về JSON với ĐẦY ĐỦ tất cả các lô thuê (unit) theo thiết kế.

YÊU CẦU QUAN TRỌNG:
- Xác định TỪNG lô thuê riêng lẻ (unit) từ sơ đồ, không bỏ sót
- Mỗi unit cần đủ: code, areaGFA, areaNLA, category (tiếng Việt), baseRentPerSqm (VNĐ/m²/tháng)
- areaNLA = 85% areaGFA nếu không đọc được chính xác
- baseRentPerSqm ước tính theo vị trí: tầng trệt mặt tiền cao hơn, tầng cao hơn thấp hơn
- Nhóm units vào zones hợp lý theo ngành hàng và vị trí
- Chỉ trả về JSON hợp lệ, KHÔNG có text nào khác

Cấu trúc JSON:
{
  "mall": {
    "name": "tên mall",
    "totalFloors": <số>,
    "estimatedTotalArea": <m2>,
    "detectedFeatures": ["đặc điểm 1", "đặc điểm 2"]
  },
  "floors": [
    {
      "level": "GF",
      "name": "Tầng Trệt",
      "estimatedArea": <m2>,
      "highlight": "đặc điểm nổi bật",
      "zones": [
        {
          "code": "GF-A",
          "name": "tên khu vực",
          "category": "FASHION|FNB|ENTERTAINMENT|SERVICES|ANCHOR|BEAUTY|SUPERMARKET|MIXED",
          "categoryVi": "Thời trang|F&B|Giải trí|Dịch vụ|Anchor|Làm đẹp|Siêu thị|Hỗn hợp",
          "estimatedArea": <m2>,
          "trafficLevel": "HIGH|MEDIUM|LOW",
          "description": "mô tả ngắn",
          "units": [
            {
              "code": "GF-A-01",
              "areaGFA": <m2>,
              "areaNLA": <m2>,
              "category": "Thời trang",
              "baseRentPerSqm": <VNĐ>,
              "askingRentPerSqm": <VNĐ>,
              "notes": "Góc|Mặt tiền|Anchor|Kiosk|"
            }
          ]
        }
      ]
    }
  ],
  "insights": {
    "trafficFlow": "mô tả luồng khách",
    "keyFindings": ["phát hiện 1", "phát hiện 2"],
    "optimizationTips": ["gợi ý 1", "gợi ý 2"],
    "tenantMixRecommendation": "đề xuất cơ cấu ngành hàng"
  }
}`;

@Injectable()
export class FloorPlanService {
  private readonly logger = new Logger(FloorPlanService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async uploadAndAnalyze(file: Express.Multer.File, mallId: string) {
    if (!mallId) throw new BadRequestException('mallId is required');

    const mall = await this.prisma.mall.findUnique({ where: { id: mallId } });
    if (!mall) throw new NotFoundException('Mall not found');

    const saved = await this.storage.saveFile(file, 'floor-plans');

    const latestCount = await this.prisma.floorPlanAnalysis.count({
      where: { mallId, isActive: true },
    });

    const analysis = await this.prisma.floorPlanAnalysis.create({
      data: {
        mallId,
        fileName: file.originalname,
        filePath: saved.filePath,
        fileType: file.mimetype.includes('pdf') ? 'pdf' : 'image',
        fileSizeKb: Math.round(file.size / 1024),
        version: latestCount + 1,
        status: 'PROCESSING',
      },
    });

    this.analyzeAsync(analysis.id, file.buffer, saved.filePath, file.mimetype).catch((e) => {
      this.logger.error(`Analysis ${analysis.id} failed: ${e.message}`);
    });

    return {
      id: analysis.id,
      status: 'PROCESSING',
      version: analysis.version,
      fileName: file.originalname,
      message: 'Đang phân tích... Vui lòng kiểm tra lại sau vài giây.',
    };
  }

  private async analyzeAsync(analysisId: string, buffer: Buffer, filePath: string, mimeType: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      await this.prisma.floorPlanAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'FAILED',
          analysis: { error: 'ANTHROPIC_API_KEY chưa được cấu hình. Liên hệ Admin để cài đặt.' } as any,
        },
      });
      this.logger.warn(`Analysis ${analysisId} failed: ANTHROPIC_API_KEY not set`);
      return;
    }

    try {
      const base64Data = buffer.toString('base64');
      const isPdf = mimeType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf');

      const result = await this.callClaudeAPI(base64Data, mimeType, isPdf);

      await this.prisma.floorPlanAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
          analysis: result.analysis as any,
          suggestions: result.suggestions as any,
        },
      });

      const totalUnits = result.unitCount;
      this.logger.log(`Analysis ${analysisId} completed: ${result.floorCount} floors, ${result.zoneCount} zones, ${totalUnits} units`);
    } catch (error) {
      this.logger.error(`Claude API call failed for ${analysisId}: ${error.message}`);
      await this.prisma.floorPlanAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'FAILED',
          analysis: { error: `Lỗi phân tích: ${error.message}` } as any,
        },
      });
    }
  }

  private async callClaudeAPI(base64Data: string, mimeType: string, isPdf: boolean) {
    const apiKey = process.env.ANTHROPIC_API_KEY!;

    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } };

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 32000,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: ANALYSIS_PROMPT }] }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API ${response.status}: ${errText.substring(0, 300)}`);
    }

    const data = (await response.json()) as any;

    if (data.stop_reason === 'max_tokens') {
      this.logger.warn(`Response truncated at max_tokens — attempting partial parse`);
    }

    const textContent: string = data.content?.[0]?.text ?? '';
    const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) ?? textContent.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('Could not extract JSON from AI response');

    const parsed = this.safeParseJson(jsonMatch[1] ?? jsonMatch[0]);

    // Count units across all floors/zones
    let unitCount = 0;
    let zoneCount = 0;
    const floorCount = (parsed.floors ?? []).length;
    for (const floor of parsed.floors ?? []) {
      zoneCount += (floor.zones ?? []).length;
      for (const zone of floor.zones ?? []) {
        unitCount += (zone.units ?? []).length;
      }
    }

    return { analysis: parsed, suggestions: parsed.zoneSuggestions ?? [], floorCount, zoneCount, unitCount };
  }

  async getAnalyses(mallId: string) {
    return this.prisma.floorPlanAnalysis.findMany({
      where: { mallId, isActive: true },
      include: { mall: { select: { id: true, name: true, code: true } } },
      orderBy: { version: 'desc' },
    });
  }

  async getAnalysis(id: string) {
    const a = await this.prisma.floorPlanAnalysis.findUnique({
      where: { id },
      include: { mall: { select: { id: true, name: true, code: true } } },
    });
    if (!a) throw new NotFoundException('Analysis not found');
    return a;
  }

  async pollStatus(id: string) {
    const a = await this.prisma.floorPlanAnalysis.findUnique({
      where: { id },
      select: { id: true, status: true, version: true, fileName: true, createdAt: true },
    });
    if (!a) throw new NotFoundException('Analysis not found');
    return a;
  }

  async applySuggestions(analysisId: string) {
    const rec = await this.prisma.floorPlanAnalysis.findUnique({
      where: { id: analysisId },
      include: { mall: true },
    });
    if (!rec || !rec.analysis) throw new BadRequestException('Analysis not found or incomplete');

    const data = rec.analysis as any;
    const mallId = rec.mallId;
    let createdFloors = 0;
    let createdZones = 0;
    let createdUnits = 0;
    let skippedUnits = 0;

    for (const floor of data.floors ?? []) {
      let floorRec = await this.prisma.floor.findFirst({
        where: { mallId, level: floor.level, isActive: true },
      });

      if (!floorRec) {
        floorRec = await this.prisma.floor.create({
          data: {
            mallId,
            name: floor.name,
            level: floor.level,
            sortOrder: this.levelToSort(floor.level),
          },
        });
        createdFloors++;
      }

      for (const zone of floor.zones ?? []) {
        let zoneRec = await this.prisma.zone.findFirst({
          where: { mallId, code: zone.code, isActive: true },
        });

        if (!zoneRec) {
          zoneRec = await this.prisma.zone.create({
            data: {
              mallId,
              floorId: floorRec.id,
              name: zone.name,
              code: zone.code,
            },
          });
          createdZones++;
        }

        for (const unit of zone.units ?? []) {
          if (!unit.code || !unit.areaGFA) continue;

          const existingUnit = await this.prisma.unit.findFirst({
            where: { mallId, code: unit.code },
          });

          if (existingUnit) {
            skippedUnits++;
            continue;
          }

          const areaGFA = Number(unit.areaGFA) || 0;
          const areaNLA = Number(unit.areaNLA) || Math.round(areaGFA * 0.85);
          const baseRent = Number(unit.baseRentPerSqm) || 0;
          const askingRent = Number(unit.askingRentPerSqm) || (baseRent > 0 ? Math.round(baseRent * 0.9) : 0);

          await this.prisma.unit.create({
            data: {
              mallId,
              floorId: floorRec.id,
              zoneId: zoneRec.id,
              code: unit.code,
              name: unit.name || unit.code,
              areaGFA,
              areaNLA,
              category: unit.category || zone.categoryVi || zone.name,
              baseRentPerSqm: baseRent,
              askingRentPerSqm: askingRent > 0 ? askingRent : undefined,
              camPerSqm: 0,
              status: 'VACANT',
              description: unit.notes || undefined,
              vacantSince: new Date(),
            },
          });
          createdUnits++;
        }
      }
    }

    await this.prisma.floorPlanAnalysis.update({
      where: { id: analysisId },
      data: { appliedAt: new Date() },
    });

    this.logger.log(`Applied analysis ${analysisId}: ${createdFloors} floors, ${createdZones} zones, ${createdUnits} units (${skippedUnits} skipped)`);

    return {
      createdFloors,
      createdZones,
      createdUnits,
      skippedUnits,
      message: `Đã tạo: ${createdFloors} tầng, ${createdZones} khu vực, ${createdUnits} lô thuê${skippedUnits > 0 ? ` (${skippedUnits} lô đã tồn tại)` : ''}`,
    };
  }

  private safeParseJson(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      let cleaned = raw
        .replace(/,\s*([\]\}])/g, '$1')
        .trimEnd();

      const opens = (cleaned.match(/\{/g) || []).length;
      const closes = (cleaned.match(/\}/g) || []).length;
      const arrOpens = (cleaned.match(/\[/g) || []).length;
      const arrCloses = (cleaned.match(/\]/g) || []).length;

      for (let i = 0; i < arrOpens - arrCloses; i++) cleaned += ']';
      for (let i = 0; i < opens - closes; i++) cleaned += '}';

      try {
        return JSON.parse(cleaned);
      } catch (e2) {
        throw new Error(`JSON parse failed after cleanup: ${(e2 as Error).message}`);
      }
    }
  }

  private levelToSort(level: string): number {
    const m: Record<string, number> = { B3: -3, B2: -2, B1: -1, GF: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, RF: 9 };
    return m[level] ?? 0;
  }
}

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AiController } from './ai.controller';

// CR-101 Phase 3D: proves the controller derives Mall-authorization context
// from the authenticated caller (never client input) and threads it into
// AiService, and that all 5 floor-plan routes now call MallAccessService
// (previously 3 of 5 had zero check at all).
describe('AiController — CR-101 Phase 3D', () => {
  const aiService: any = { chat: jest.fn(), chatStream: jest.fn(), getSuggestions: jest.fn() };
  const floorPlanService: any = { uploadAndAnalyze: jest.fn(), getAnalyses: jest.fn(), getAnalysis: jest.fn(), pollStatus: jest.fn(), applySuggestions: jest.fn() };
  const mallAccess: any = { getAccessibleMallIds: jest.fn(), assertMallAccess: jest.fn(), extractAndValidateMallAccess: jest.fn() };
  const controller = new AiController(aiService, floorPlanService, mallAccess);
  const user = { id: 'u1', role: 'LEASING_MANAGER' };

  beforeEach(() => jest.resetAllMocks());

  describe('chat context propagation', () => {
    it('chat() derives authorizedMallIds from the authenticated user and passes it to AiService, never from request body', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-A']);
      aiService.chat.mockResolvedValue({ reply: 'ok' });

      await controller.chat({ message: 'hello' } as any, user);

      expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { crossMallRead: true });
      expect(aiService.chat).toHaveBeenCalledWith('hello', [], { userId: 'u1', role: 'LEASING_MANAGER', authorizedMallIds: ['mall-A'] });
    });

    it('getSuggestions() uses the identical scoping mechanism as chat()', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-A']);
      aiService.getSuggestions.mockResolvedValue([]);

      await controller.getSuggestions(user);

      expect(aiService.getSuggestions).toHaveBeenCalledWith({ userId: 'u1', role: 'LEASING_MANAGER', authorizedMallIds: ['mall-A'] });
    });

    it('unrestricted caller (ADMIN) gets authorizedMallIds: null, passed through unchanged -- not a new policy decision', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(null);
      aiService.chat.mockResolvedValue({ reply: 'ok' });

      await controller.chat({ message: 'hi' } as any, { id: 'admin-1', role: 'ADMIN' });

      expect(aiService.chat).toHaveBeenCalledWith('hi', [], { userId: 'admin-1', role: 'ADMIN', authorizedMallIds: null });
    });
  });

  describe('floor-plan authorization', () => {
    it('analyzeFloorPlan requires mallId and validates it against the caller before uploading', async () => {
      mallAccess.assertMallAccess.mockResolvedValue(undefined);
      floorPlanService.uploadAndAnalyze.mockResolvedValue({ id: 'a1' });

      await controller.analyzeFloorPlan({ originalname: 'x.pdf' } as any, 'mall-A', user);

      expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', 'mall-A');
      expect(floorPlanService.uploadAndAnalyze).toHaveBeenCalled();
    });

    it('analyzeFloorPlan rejects a Mall the caller is not authorized for, before upload/analysis ever starts', async () => {
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.analyzeFloorPlan({ originalname: 'x.pdf' } as any, 'mall-B', user),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(floorPlanService.uploadAndAnalyze).not.toHaveBeenCalled();
    });

    it('analyzeFloorPlan rejects a missing mallId outright (previously accepted, unvalidated)', async () => {
      await expect(
        controller.analyzeFloorPlan({ originalname: 'x.pdf' } as any, undefined as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mallAccess.assertMallAccess).not.toHaveBeenCalled();
    });

    it('getAnalyses validates the requested mallId against the caller', async () => {
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(controller.getAnalyses('mall-B', user)).rejects.toBeInstanceOf(ForbiddenException);
      expect(floorPlanService.getAnalyses).not.toHaveBeenCalled();
    });

    it.each([
      ['getAnalysis', () => controller.getAnalysis('analysis-1', user), floorPlanService.getAnalysis],
      ['getAnalysisStatus', () => controller.getAnalysisStatus('analysis-1', user), floorPlanService.pollStatus],
    ])('%s resolves Mall from the analysis\'s OWN id (floorPlanAnalysisId resolver), blocks the service on denial, and is part of CEO\'s enterprise-read scope (CR-101 Phase 3G)', async (_name, invoke) => {
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(invoke()).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { floorPlanAnalysisId: 'analysis-1' }, { crossMallRead: true });
      expect(floorPlanService.getAnalysis).not.toHaveBeenCalled();
      expect(floorPlanService.pollStatus).not.toHaveBeenCalled();
      expect(floorPlanService.applySuggestions).not.toHaveBeenCalled();
    });

    it('applyAnalysis resolves Mall from the analysis\'s OWN id and blocks the service on denial -- previously ZERO Mall check', async () => {
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(controller.applyAnalysis('analysis-1', user)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { floorPlanAnalysisId: 'analysis-1' });
      expect(floorPlanService.applySuggestions).not.toHaveBeenCalled();
    });

    it('applyAnalysis (a write operation creating real Floor/Zone/Unit records) is deliberately NOT part of CEO\'s enterprise-read grant (CR-101 Phase 3G: BC-CEO-SCOPE Option A excludes CREATE)', async () => {
      mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
      floorPlanService.applySuggestions.mockResolvedValue({ createdUnits: 3 });
      const result = await controller.applyAnalysis('analysis-1', user);
      expect(result).toEqual({ createdUnits: 3 });
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { floorPlanAnalysisId: 'analysis-1' });
    });
  });
});

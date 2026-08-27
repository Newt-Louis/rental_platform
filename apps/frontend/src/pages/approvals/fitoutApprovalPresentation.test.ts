import { describe, expect, it } from 'vitest';
import { formatFitoutAttachmentSize, getFitoutAttachmentDownloadPath, getFitoutStageName, getFitoutSubmittalFromApproval } from './fitoutApprovalPresentation';

describe('Fitout approval presentation', () => {
  const fitoutSubmittal = { id: 'submittal-1', title: 'Shop drawing', revisionNo: 2, status: 'IN_PROGRESS' };

  it('accepts only an exact FITOUT_SUBMITTAL workflow/entity match', () => {
    expect(getFitoutSubmittalFromApproval({ entityType: 'FITOUT_SUBMITTAL', entityId: 'submittal-1', fitoutSubmittal })).toEqual(fitoutSubmittal);
    expect(getFitoutSubmittalFromApproval({ workflow: { entityType: 'FITOUT_SUBMITTAL', entityId: 'submittal-1', fitoutSubmittal } })).toEqual(fitoutSubmittal);
    expect(getFitoutSubmittalFromApproval({ entityType: 'PROPOSAL', entityId: 'submittal-1', fitoutSubmittal })).toBeNull();
    expect(getFitoutSubmittalFromApproval({ entityType: 'FITOUT_SUBMITTAL', entityId: 'different', fitoutSubmittal })).toBeNull();
  });

  it('uses only the authenticated unified-document download route', () => {
    expect(getFitoutAttachmentDownloadPath('document/id')).toBe('/files/documents/document%2Fid');
  });

  it('formats attachment metadata without exposing storage paths', () => {
    expect(formatFitoutAttachmentSize(1536, 'en-US')).toBe('1.5 KB');
    expect(formatFitoutAttachmentSize(undefined)).toBe('—');
  });

  it('uses only a hydrated stage name and never exposes a raw stage code', () => {
    expect(getFitoutStageName({ ...fitoutSubmittal, stage: { code: 'CONCEPT', name: 'Concept Design' } })).toBe('Concept Design');
    expect(getFitoutStageName({ ...fitoutSubmittal, stageConfig: { code: 'DETAIL', name: '  Thiết kế chi tiết  ' } })).toBe('Thiết kế chi tiết');
    expect(getFitoutStageName({ ...fitoutSubmittal, stageCode: 'RAW_ENUM' })).toBeNull();
  });
});

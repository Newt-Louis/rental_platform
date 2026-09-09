import { describe, expect, it } from 'vitest';
import source from './TenantFitoutDossierArchive.tsx?raw';
import pageSource from '../fitout/FitoutDossiersPage.tsx?raw';
import tenantPageSource from './TenantsPage.tsx?raw';
import apiSource from '../../api/tenants.ts?raw';

describe('Tenant Fitout dossier archive contract', () => {
  it('reuses one read-only component and the authoritative tenant API', () => {
    expect(pageSource).toContain('<TenantFitoutDossierArchive />');
    expect(tenantPageSource).toContain('<TenantFitoutDossierArchive tenantId={tenantId} />');
    expect(apiSource).toContain("api.get('/tenants/fitout-archive'");
    expect(source).not.toMatch(/api\.(post|put|patch|delete)/);
  });

  it('DOSSIER-007 opens files only through the authenticated document route helper', () => {
    expect(source).toContain('openAuthenticatedFile(getFitoutSubmittalAttachmentPath(attachment.id))');
    expect(source).not.toMatch(/attachment\.(filePath|storagePath|url)/);
  });

  it('exposes search and pagination without mutation actions', () => {
    expect(source).toContain('setDebouncedSearch(search.trim())');
    expect(source).toContain('totalPages');
    expect(source).toContain('setPage((value) => Math.max(1, value - 1))');
    expect(source).not.toMatch(/action\.mutate|useMutation|api\.(post|put|patch|delete)/);
  });

  it('renders multiple versions and labels the authoritative latest version', () => {
    expect(source).toContain('attachment.version');
    expect(source).toContain('attachment.isLatest');
    expect(source).toContain('dossier.attachments.map');
  });
});

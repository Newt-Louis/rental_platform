import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import { TenantFitoutDossierArchive } from '@/pages/tenants/TenantFitoutDossierArchive';

export default function FitoutDossiersPage() {
  const { t } = useTranslation('tenants');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
          <Archive size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-950">{t('fitoutArchive.title')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t('fitoutArchive.description')}</p>
        </div>
      </div>
      <TenantFitoutDossierArchive />
    </div>
  );
}

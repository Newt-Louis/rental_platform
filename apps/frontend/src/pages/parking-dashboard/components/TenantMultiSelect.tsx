import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TenantOption {
  parkingCode: string;
  name: string;
}

interface TenantMultiSelectProps {
  tenants: TenantOption[];
  value: string[];
  onChange: (codes: string[]) => void;
}

export function TenantMultiSelect({ tenants, value, onChange }: TenantMultiSelectProps) {
  const { t } = useTranslation('parking');
  const allSelected = tenants.length > 0 && value.length === tenants.length;

  function toggle(code: string) {
    // Empty selection is allowed so the user can clear the only lot and pick another.
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  }

  const label =
    value.length === 0
      ? t('report.selectTenant', 'Chọn bãi đỗ')
      : allSelected
        ? t('report.allTenants', 'Tất cả bãi đỗ')
        : value.length === 1
          ? tenants.find((x) => x.parkingCode === value[0])?.name ?? value[0]
          : t('report.tenantsSelected', '{{count}} bãi đỗ', { count: value.length });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-[220px] justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown size={14} className="ml-2 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => onChange(c ? tenants.map((x) => x.parkingCode) : [])}
          />
          {t('report.allTenants', 'Tất cả bãi đỗ')}
        </label>
        <div className="my-1 h-px bg-border" />
        <div className="max-h-64 overflow-y-auto">
          {tenants.map((tenant) => (
            <label
              key={tenant.parkingCode}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox checked={value.includes(tenant.parkingCode)} onCheckedChange={() => toggle(tenant.parkingCode)} />
              <span className="truncate">{tenant.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

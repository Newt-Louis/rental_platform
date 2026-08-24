export type FitoutProjectPresentation = {
  status?: string | null;
  tenant?: { brandName?: string | null } | null;
  unit?: { code?: string | null; floor?: { name?: string | null } | null } | null;
  operationManager?: { fullName?: string | null } | null;
};

export function humanizeFitoutCode(value?: string | null) {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getFitoutPresentationLabel(
  translate: (key: string, options?: Record<string, unknown>) => string,
  keyPrefix: string,
  value?: string | null,
) {
  if (!value) return '—';
  const key = `${keyPrefix}.${value}`;
  const translated = translate(key, { defaultValue: '' });
  const unknown = translate('common:unknownValue', { defaultValue: 'Unknown' });
  return translated && translated !== key ? translated : unknown || 'Unknown';
}

export function filterFitoutProjects<T extends FitoutProjectPresentation>(
  projects: T[],
  search: string,
  status: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return projects.filter((project) => {
    if (status && project.status !== status) return false;
    if (!query) return true;
    return [
      project.tenant?.brandName,
      project.unit?.code,
      project.unit?.floor?.name,
      project.operationManager?.fullName,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

export function groupChangeOrderAmountsByCurrency(orders: Array<{
  currency?: string | null;
  status?: string | null;
  estimatedCost?: number | null;
  approvedCost?: number | null;
}>) {
  return orders.reduce<Record<string, { estimated: number; approved: number }>>((groups, order) => {
    const currency = order.currency ?? 'VND';
    const group = groups[currency] ?? { estimated: 0, approved: 0 };
    group.estimated += Number(order.estimatedCost || 0);
    if (order.status === 'APPROVED') group.approved += Number(order.approvedCost ?? order.estimatedCost ?? 0);
    groups[currency] = group;
    return groups;
  }, {});
}

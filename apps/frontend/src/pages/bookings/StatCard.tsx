import type { ElementType } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function StatCard({ title, value, sub, icon: Icon, color = 'blue', badge }: {
  title: string; value: string | number; sub?: string;
  icon: ElementType; color?: string; badge?: string;
}) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    yellow: 'bg-amber-50 text-amber-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-violet-50 text-violet-600',
    teal:   'bg-teal-50 text-teal-600',
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}><Icon size={18} /></div>
        </div>
        {badge && <Badge variant="secondary" className="mt-2 text-xs">{badge}</Badge>}
      </CardContent>
    </Card>
  );
}

import { Button } from '@/components/ui/button';
import { CheckSquare, X } from 'lucide-react';

interface BulkSelectionBarProps {
  selectedCount: number;
  totalCount?: number;
  onSelectAll?: () => void;
  onClear: () => void;
  children?: React.ReactNode;
}

export function BulkSelectionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  children,
}: BulkSelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div data-bulk-bar className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 z-50 max-w-[calc(100vw-2rem)] overflow-x-auto">
      <span className="text-sm font-medium shrink-0">{selectedCount} đã chọn</span>

      {onSelectAll && totalCount !== undefined && (
        <>
          <div className="h-6 w-px bg-gray-700 shrink-0" />
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-gray-800 gap-1.5 shrink-0"
            onClick={onSelectAll}
          >
            <CheckSquare size={14} /> Chọn tất cả ({totalCount})
          </Button>
        </>
      )}

      {children && (
        <>
          <div className="h-6 w-px bg-gray-700 shrink-0" />
          {children}
        </>
      )}

      <div className="h-6 w-px bg-gray-700 shrink-0" />
      <Button
        size="sm"
        variant="ghost"
        className="text-gray-400 hover:bg-gray-800 shrink-0"
        onClick={onClear}
      >
        <X size={14} />
      </Button>
    </div>
  );
}

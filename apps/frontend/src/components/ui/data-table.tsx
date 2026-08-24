import { Fragment, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { flexRender, getCoreRowModel, useReactTable, ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DataTableSort {
  field: string;
  dir: 'asc' | 'desc';
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  sort?: DataTableSort;
  onSortChange?: (field: string) => void;
  getRowId?: (row: TData) => string;
  /** When set, renders a zero-height sentinel row immediately after this row index (for infinite scroll). */
  sentinelAfterRowIndex?: number;
  sentinelRef?: Ref<HTMLTableRowElement>;
}

export function DataTable<TData>({
  columns,
  data,
  sort,
  onSortChange,
  getRowId,
  sentinelAfterRowIndex,
  sentinelRef,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  // Freeze column widths after first render so a later sort/refetch can't reflow the table.
  // Keyed by column id/header, not the `columns` reference — callers redefine it inline.
  const columnsKey = columns.map((c) => c.id ?? ('accessorKey' in c ? String(c.accessorKey) : String(c.header))).join('|');
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [colWidths, setColWidths] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    setColWidths(null);
  }, [columnsKey]);

  useLayoutEffect(() => {
    if (colWidths != null || data.length === 0 || !headerRowRef.current) return;
    const widths = Array.from(headerRowRef.current.children).map((th) => (th as HTMLElement).getBoundingClientRect().width);
    setColWidths(widths);
  }, [colWidths, data.length]);

  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', colWidths && 'table-fixed')}>
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}px` }} />
            ))}
          </colgroup>
        )}
        <thead className="sticky top-0 z-10 bg-white">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} ref={headerRowRef} className="border-b bg-white text-left text-xs text-gray-500">
              {headerGroup.headers.map((header) => {
                const sortField = header.column.columnDef.meta?.sortField as string | undefined;
                const isSorted = sortField && sort?.field === sortField;
                return (
                  <th
                    key={header.id}
                    className={cn(
                      'py-2 pr-3',
                      header.column.columnDef.meta?.align === 'right' && 'text-right',
                      header.column.columnDef.meta?.align === 'center' && 'text-center',
                      sortField && 'cursor-pointer select-none hover:text-gray-700',
                    )}
                    onClick={() => sortField && onSortChange?.(sortField)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortField && (isSorted ? (sort?.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-30" />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, rowIndex) => (
            <Fragment key={row.id}>
              <tr className="border-b last:border-0 hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      'py-2 pr-3',
                      cell.column.columnDef.meta?.align === 'right' && 'text-right',
                      cell.column.columnDef.meta?.align === 'center' && 'text-center',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {sentinelRef != null &&
                sentinelAfterRowIndex != null &&
                rowIndex === sentinelAfterRowIndex && (
                  <tr ref={sentinelRef} aria-hidden className="h-0 border-0">
                    <td colSpan={columns.length} className="h-0 p-0" />
                  </tr>
                )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    align?: 'left' | 'right' | 'center';
    sortField?: string;
  }
}

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
}

export function DataTable<TData>({ columns, data, sort, onSortChange, getRowId }: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b text-left text-xs text-gray-500">
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
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
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

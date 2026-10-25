'use client';

import type { ColumnDef, RowData } from '@tanstack/react-table';
import {
  columnVisibilityFeature,
  flexRender,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import { Trans } from '../makerkit/trans';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

// TanStack Table v9: core row model la tu dong (khong truyen
// getCoreRowModel nua). row.getIsSelected() can rowSelectionFeature,
// row.getVisibleCells() can columnVisibilityFeature. features dinh nghia
// 1 lan o module scope.
const features = tableFeatures({
  columnVisibilityFeature,
  rowSelectionFeature,
});

interface DataTableProps<TData extends RowData, TValue> {
  columns: ColumnDef<typeof features, TData, TValue>[];
  data: TData[];
}

export function DataTable<TData extends RowData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  // TODO: remove when https://github.com/TanStack/table/issues/5567 gets fixed
  'use no memo';

  // v9: CellData = unknown nen option columns cua useTable la
  // ColumnDef<..., unknown>[]; ColumnDef bat bien theo TValue (vua co vi
  // tri dong bien vua nghich bien) nen columns generic TValue khong truyen
  // thang duoc — cast qua any (chi anh huong type, runtime khong doi).
  const table = useTable({
    data,
    columns: columns as ColumnDef<typeof features, TData, any>[],
    features,
  });

  return (
    <div className="rounded-md">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-row-id={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <Trans i18nKey={'common.noData'} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

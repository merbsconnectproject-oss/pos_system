import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({ page, pageSize, total, onPageChange, onPageSizeChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-[11px] font-semibold text-slate-500">
    <span>{start}-{end} of {total}</span>
    <div className="flex items-center gap-2">
      {onPageSizeChange && <label className="flex items-center gap-1.5">Rows <select value={pageSize} onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700" aria-label="Rows per page">{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-md border border-slate-300 p-1.5 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
      <span className="min-w-16 text-center text-slate-600">Page {page} of {pageCount}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded-md border border-slate-300 p-1.5 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  </div>;
};

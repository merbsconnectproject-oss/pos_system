import React from 'react';
import { Info } from 'lucide-react';

interface InfoHintProps {
  text: string;
}

export const InfoHint: React.FC<InfoHintProps> = ({ text }) => (
  <span className="group relative inline-flex shrink-0" tabIndex={0} aria-label={text}>
    <Info className="h-4 w-4 text-slate-400 transition-colors group-hover:text-slate-600 group-focus:text-slate-600" />
    <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-6 z-50 w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-4 text-slate-600 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
      {text}
    </span>
  </span>
);

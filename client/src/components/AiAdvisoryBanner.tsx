import { Cpu, Info } from 'lucide-react';
import type { AiResponseSource } from '@shared/types';

interface AiAdvisoryHeaderProps {
  disclaimer: string;
  source: AiResponseSource;
  model: string | null;
  cached?: boolean;
  fallbackReason?: string;
  authorityNote: string;
}

export function AiAdvisoryHeader({
  disclaimer,
  source,
  model,
  cached,
  fallbackReason,
  authorityNote,
}: AiAdvisoryHeaderProps) {
  return (
    <div className="space-y-2 border-b border-slate-200 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-indigo-900">
          <Cpu className="h-3.5 w-3.5 text-indigo-700" aria-hidden="true" />
          <span>{disclaimer}</span>
        </span>
        <span
          className={`font-mono text-[11px] font-semibold ${
            source === 'ai' ? 'text-indigo-800' : 'text-slate-700'
          }`}
        >
          Source: {source === 'ai' ? `Gemini AI${model ? ` (${model})` : ''}` : 'Rule-Based Fallback'}
          {cached ? ' · Cached' : ''}
        </span>
      </div>

      {fallbackReason && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{fallbackReason}</span>
        </p>
      )}

      <p className="text-[11px] text-slate-600">{authorityNote}</p>
    </div>
  );
}

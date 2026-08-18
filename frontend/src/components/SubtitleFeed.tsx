import { useEffect, useRef } from 'react';
import { SubtitleEntry } from '../types';

interface Props {
  entries: SubtitleEntry[];
  interimText: string;
  showStats: boolean;
}

export function SubtitleFeed({ entries, interimText, showStats }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [entries, interimText]);

  if (entries.length === 0 && !interimText) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card flex items-center justify-center py-12">
        <p className="text-sm text-text-muted">Listening for audio...</p>
      </div>
    );
  }

  return (
    <div ref={feedRef} className="bg-surface border border-border rounded-xl shadow-card max-h-[400px] overflow-y-auto divide-y divide-border">
      {entries.map((entry) => (
        <div key={entry.id} className="px-4 py-3 hover:bg-surface-hover transition-colors group">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary font-medium leading-relaxed">{entry.translatedText}</p>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{entry.originalText}</p>
            </div>
            {showStats && (
              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                <span className="text-xs font-mono text-text-muted">{entry.latencyMs}ms</span>
                <span className="text-xs font-mono text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">{entry.provider}</span>
              </div>
            )}
          </div>
        </div>
      ))}
      {interimText && (
        <div className="px-4 py-3">
          <p className="text-sm text-text-muted italic">{interimText}</p>
        </div>
      )}
    </div>
  );
}

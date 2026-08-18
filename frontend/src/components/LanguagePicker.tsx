import { ChevronDown } from 'lucide-react';
import { LANGUAGES } from '../constants/languages';

interface Props {
  value: string;
  onChange: (code: string) => void;
  label: string;
}

export function LanguagePicker({ value, onChange, label }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-border bg-bg text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 min-w-[160px] cursor-pointer transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </div>
    </div>
  );
}

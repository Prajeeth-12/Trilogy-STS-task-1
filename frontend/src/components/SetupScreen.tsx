import { useState, useEffect } from 'react';
import { Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

interface Guide {
  name: string;
  url: string;
  steps: string[];
}

export function SetupScreen({ onComplete }: Props) {
  const [groqKey, setGroqKey] = useState('');
  const [nimKey, setNimKey] = useState('');
  const [showGroq, setShowGroq] = useState(false);
  const [showNim, setShowNim] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [guide, setGuide] = useState<{ groq: Guide; nim: Guide } | null>(null);

  useEffect(() => {
    fetch('/api/settings/guide')
      .then(r => r.json())
      .then(setGuide)
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!groqKey && !nimKey) {
      setErrors(['Please provide at least one API key']);
      return;
    }

    setSaving(true);
    setErrors([]);
    setSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groq_api_key: groqKey, nim_api_key: nimKey }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(onComplete, 1000);
      } else {
        setErrors(data.errors || ['Validation failed']);
      }
    } catch (err) {
      setErrors(['Could not connect to backend. Is it running?']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-bg">
      <div className="bg-surface border border-border rounded-xl shadow-card max-w-lg w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-text-primary mb-1.5">Set up EchoBridge</h1>
          <p className="text-text-secondary text-sm">Add your API keys to get started with live translation.</p>
        </div>

        {/* Groq Key */}
        <div className="mb-5">
          <label className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">Groq API Key</span>
            {guide && (
              <a href={guide.groq.url} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-brand hover:underline">
                Get free key <ExternalLink size={10} />
              </a>
            )}
          </label>
          <div className="relative">
            <input
              type={showGroq ? 'text' : 'password'}
              value={groqKey}
              onChange={e => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-colors pr-10"
            />
            <button onClick={() => setShowGroq(!showGroq)} className="absolute right-3 top-3.5 text-text-muted hover:text-text-secondary transition-colors" aria-label={showGroq ? 'Hide key' : 'Show key'}>
              {showGroq ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {guide && (
            <div className="mt-2 text-xs text-text-muted space-y-0.5">
              {guide.groq.steps.map((step, i) => (
                <p key={i}>{i + 1}. {step}</p>
              ))}
            </div>
          )}
        </div>

        {/* NIM Key */}
        <div className="mb-6">
          <label className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">NVIDIA NIM API Key</span>
            {guide && (
              <a href={guide.nim.url} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-brand hover:underline">
                Get free key <ExternalLink size={10} />
              </a>
            )}
          </label>
          <div className="relative">
            <input
              type={showNim ? 'text' : 'password'}
              value={nimKey}
              onChange={e => setNimKey(e.target.value)}
              placeholder="nvapi-..."
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-colors pr-10"
            />
            <button onClick={() => setShowNim(!showNim)} className="absolute right-3 top-3.5 text-text-muted hover:text-text-secondary transition-colors" aria-label={showNim ? 'Hide key' : 'Show key'}>
              {showNim ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {guide && (
            <div className="mt-2 text-xs text-text-muted space-y-0.5">
              {guide.nim.steps.map((step, i) => (
                <p key={i}>{i + 1}. {step}</p>
              ))}
            </div>
          )}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-danger-light border border-danger/20">
            {errors.map((err, i) => (
              <p key={i} className="text-danger text-xs flex items-center gap-1.5">
                <AlertCircle size={12} /> {err}
              </p>
            ))}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-success-light border border-success/20">
            <p className="text-success text-xs flex items-center gap-1.5">
              <CheckCircle size={12} /> Keys validated and saved. Starting app...
            </p>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-brand text-brand-text font-semibold text-sm hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          {saving ? 'Validating...' : 'Validate & Save Keys'}
        </button>

        <p className="text-xs text-text-muted text-center mt-4">
          Keys are stored locally on your machine. They are never sent to any third party.
        </p>
      </div>
    </div>
  );
}

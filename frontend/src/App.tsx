import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Monitor, MonitorOff, ExternalLink, Settings2, Download, RotateCcw, Moon, Sun, ChevronDown, ArrowRight } from 'lucide-react';
import { AudioVisualizer } from './components/AudioVisualizer';
import { SubtitleFeed } from './components/SubtitleFeed';
import { PIPContent } from './components/PIPContent';
import { SetupScreen } from './components/SetupScreen';
import { useWebSocket } from './hooks/useWebSocket';
import { useSTT } from './hooks/useSTT';
import { useSilenceDetector } from './hooks/useSilenceDetector';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useTabAudio } from './hooks/useTabAudio';
import { usePIP } from './hooks/usePIP';
import { punctuate, isDuplicate } from './services/sentenceBuffer';
import { LANGUAGES } from './constants/languages';
import { SubtitleEntry, TranslationResponse, WSMessage } from './types';

type AppMode = 'interpreter' | 'voice';

function App() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);

  useEffect(() => {
    fetch('/api/settings/status').then(r => r.json())
      .then(data => setNeedsSetup(!data.configured)).catch(() => setNeedsSetup(false));
  }, []);

  if (needsSetup === null) return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading...</div>;
  if (needsSetup) return <SetupScreen onComplete={() => setNeedsSetup(false)} />;
  return <MainApp dark={dark} setDark={setDark} />;
}

function MainApp({ dark, setDark }: { dark: boolean; setDark: (v: boolean) => void }) {
  const [appMode, setAppMode] = useState<AppMode>('interpreter');
  const [sourceLang, setSourceLang] = useState('ja');
  const [targetLang, setTargetLang] = useState('en-US');
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<SubtitleEntry[]>([]);
  const [interimText, setInterimText] = useState('');
  const [showDev, setShowDev] = useState(false);
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const [volume, setVolume] = useState(0);

  const seqNumRef = useRef(0);
  const lastFinalRef = useRef('');
  const sessionId = useRef(crypto.randomUUID()).current;

  const pip = usePIP();
  const tabAudio = useTabAudio();

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'translation') {
      const res = msg as TranslationResponse;
      setEntries(prev => [...prev, {
        id: `${res.seq_num}-${Date.now()}`, seqNum: res.seq_num,
        originalText: res.original_text, translatedText: res.translated_text,
        timestamp: Date.now(), latencyMs: res.latency_ms, provider: res.provider,
        source: appMode === 'interpreter' ? 'tab' as const : 'mic' as const,
      }].sort((a, b) => a.seqNum - b.seqNum));
    }
  }, [appMode]);

  const { connected, sendText, sendBinary } = useWebSocket({ sessionId, onMessage: handleWSMessage });
  const stt = useSTT();
  const silence = useSilenceDetector();
  const audio = useAudioCapture();

  const sendForTranslation = useCallback((text: string) => {
    const punctuated = punctuate(text);
    if (!punctuated || isDuplicate(lastFinalRef.current, punctuated)) return;
    lastFinalRef.current = punctuated; seqNumRef.current++; setInterimText('');
    sendText({ type: 'translate', text: punctuated, source_lang: sourceLang, target_lang: targetLang, session_id: sessionId, seq_num: seqNumRef.current, timestamp: Date.now() });
  }, [sendText, sourceLang, targetLang, sessionId]);

  const startVoiceMode = useCallback(async () => {
    const stream = await audio.startMic();
    silence.start(stream, { threshold: 0.02, silenceDuration: 700, onSilence: () => {}, onVolume: (v) => setVolume(v) });
    stt.start(sourceLang, { onInterim: (text) => setInterimText(text), onFinal: (text) => sendForTranslation(text) });
    setIsRecording(true);
  }, [audio, silence, stt, sourceLang, sendForTranslation]);

  const stopVoiceMode = useCallback(() => { stt.stop(); silence.stop(); audio.stop(); setIsRecording(false); setInterimText(''); setVolume(0); }, [stt, silence, audio]);

  const startInterpreterMode = useCallback(async () => {
    await tabAudio.start({
      onAudioChunk: (chunk) => { sendBinary(chunk); sendText({ type: 'flush_audio', source_lang: sourceLang, target_lang: targetLang, session_id: sessionId }); },
      onVolume: (v) => setVolume(v),
    });
    setIsRecording(true);
  }, [tabAudio, sendBinary, sendText, sourceLang, targetLang, sessionId]);

  const stopInterpreterMode = useCallback(() => { tabAudio.stop(); setIsRecording(false); setVolume(0); }, [tabAudio]);

  const handleStart = async () => { try { if (appMode === 'interpreter') await startInterpreterMode(); else await startVoiceMode(); } catch (err) { console.error(err); } };
  const handleStop = () => { if (appMode === 'interpreter') stopInterpreterMode(); else stopVoiceMode(); };

  useEffect(() => { if (isRecording && appMode === 'voice') { stt.stop(); stt.start(sourceLang, { onInterim: (t) => setInterimText(t), onFinal: (t) => sendForTranslation(t) }); } }, [sourceLang]);
  useEffect(() => { if (isRecording) handleStop(); }, [appMode]);

  const handleFloat = useCallback(async () => { const w = await pip.toggle(); if (w) setPipContainer(w.document.getElementById('pip-root')); else setPipContainer(null); }, [pip]);
  useEffect(() => { if (!pip.isActive) setPipContainer(null); }, [pip.isActive]);

  const handleExport = async () => { const res = await fetch(`/api/sessions/${sessionId}/export`); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `echobridge_log_${new Date().toISOString().slice(0, 10)}.md`; a.click(); URL.revokeObjectURL(url); };

  const latestEntry = entries[entries.length - 1] || null;
  const avgLatency = entries.length > 0 ? Math.round(entries.reduce((s, e) => s + e.latencyMs, 0) / entries.length) : 0;

  return (
    <>
      <div className="max-w-[900px] mx-auto px-5 py-6 min-h-screen flex flex-col">

        {/* Navigation bar */}
        <nav className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="EchoBridge logo" className="w-8 h-8 rounded-full" />
            <span className="text-base font-semibold text-text-primary">EchoBridge</span>
          </div>
          <div className="flex items-center gap-2">
            {isRecording && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-success bg-success-light px-2.5 py-1 rounded-full">
                <span className="inline-flex h-2 w-2 rounded-full bg-success" style={{ animation: 'live-pulse 2s ease-in-out infinite' }} />
                Live
              </div>
            )}
            {!connected && <span className="text-xs text-danger bg-danger-light px-2.5 py-1 rounded-full font-medium">Disconnected</span>}
            <button onClick={() => setDark(!dark)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </nav>

        {/* Main card */}
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden mb-4">
          {/* Mode tabs */}
          <div className="border-b border-border px-4">
            <div className="flex gap-0">
              <button onClick={() => setAppMode('interpreter')} className={`relative px-4 py-3 text-sm font-medium transition-colors ${appMode === 'interpreter' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                Meeting Interpreter
                {appMode === 'interpreter' && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-brand rounded-full" />}
              </button>
              <button onClick={() => setAppMode('voice')} className={`relative px-4 py-3 text-sm font-medium transition-colors ${appMode === 'voice' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                My Voice
                {appMode === 'voice' && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-brand rounded-full" />}
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="p-4 flex items-end gap-4 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{appMode === 'interpreter' ? 'Source' : 'I speak'}</label>
              <div className="relative">
                <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-border bg-bg text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 min-w-[160px] cursor-pointer transition-colors">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
            </div>

            <ArrowRight size={16} className="text-text-muted mb-2.5" />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{appMode === 'interpreter' ? 'Target' : 'Translate to'}</label>
              <div className="relative">
                <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-border bg-bg text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 min-w-[160px] cursor-pointer transition-colors">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <button onClick={isRecording ? handleStop : handleStart} className={`h-9 px-4 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${isRecording ? 'bg-danger-light text-danger border border-danger/20 hover:bg-danger/10' : 'bg-brand text-brand-text shadow-sm hover:opacity-90'}`}>
                {isRecording ? (appMode === 'interpreter' ? <MonitorOff size={14} /> : <MicOff size={14} />) : (appMode === 'interpreter' ? <Monitor size={14} /> : <Mic size={14} />)}
                {isRecording ? 'Stop' : (appMode === 'interpreter' ? 'Capture Tab' : 'Start')}
              </button>
              <button onClick={handleFloat} className={`h-9 w-9 rounded-lg flex items-center justify-center border transition-colors ${pip.isActive ? 'bg-brand-light text-brand border-brand/20' : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'}`} title="Float window">
                <ExternalLink size={14} />
              </button>
              <button onClick={() => setShowDev(!showDev)} className={`h-9 w-9 rounded-lg flex items-center justify-center border transition-colors ${showDev ? 'bg-brand-light text-brand border-brand/20' : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'}`} title="Diagnostics">
                <Settings2 size={14} />
              </button>
            </div>
          </div>

          {/* Audio viz */}
          <div className="px-4 pb-3">
            <AudioVisualizer volume={volume} isActive={isRecording} />
          </div>
        </div>

        {/* Dev diagnostics */}
        {showDev && (
          <div className="bg-surface border border-border rounded-xl shadow-card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Diagnostics</span>
              <div className="flex gap-2">
                <button onClick={handleExport} className="h-7 px-2.5 rounded-md text-xs font-medium border border-border text-text-secondary hover:bg-surface-hover flex items-center gap-1.5 transition-colors"><Download size={12} />Export</button>
                <button onClick={() => setEntries([])} className="h-7 px-2.5 rounded-md text-xs font-medium border border-danger/20 text-danger hover:bg-danger-light flex items-center gap-1.5 transition-colors"><RotateCcw size={12} />Reset</button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Latency', value: `${latestEntry?.latencyMs || 0}ms` },
                { label: 'Avg', value: `${avgLatency}ms` },
                { label: 'Total', value: `${entries.length}` },
                { label: 'Provider', value: latestEntry?.provider || '—' },
                { label: 'Source', value: appMode === 'interpreter' ? 'Tab' : 'Mic' },
              ].map(s => (
                <div key={s.label} className="bg-bg-subtle rounded-lg p-2.5 text-center border border-border/50">
                  <div className="text-xs text-text-secondary font-medium uppercase mb-0.5">{s.label}</div>
                  <div className="text-sm font-mono font-medium text-text-primary">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subtitle feed */}
        <div className="flex-1">
          <SubtitleFeed entries={entries} interimText={interimText} showStats={showDev} />
        </div>
      </div>

      {pipContainer && createPortal(<PIPContent latest={latestEntry} networkMode="online" />, pipContainer)}
    </>
  );
}

export default App;

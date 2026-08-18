import { SubtitleEntry } from '../types';

interface Props {
  latest: SubtitleEntry | null;
  networkMode: 'online' | 'offline';
}

const styles = {
  brand: 'var(--brand, #4F46E5)',
  success: 'var(--success, #059669)',
  warning: '#D97706',
  textPrimary: 'var(--text-primary, #F9FAFB)',
  textSecondary: 'var(--text-secondary, #D1D5DB)',
  textMuted: 'var(--text-muted, #9CA3AF)',
};

export function PIPContent({ latest, networkMode }: Props) {
  if (!latest) {
    return (
      <div style={{ opacity: 0.6, fontSize: '13px' }}>
        <div style={{ color: styles.textMuted, fontSize: '12px', marginBottom: '4px' }}>
          Waiting for input...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ color: styles.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Live
        </span>
        <span style={{ fontSize: '11px', color: networkMode === 'online' ? styles.success : styles.warning }}>
          {latest.latencyMs}ms
        </span>
      </div>
      <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.4, color: styles.textPrimary, marginBottom: '4px' }}>
        {latest.translatedText}
      </div>
      <div style={{ fontSize: '12px', color: styles.textSecondary }}>
        {latest.originalText.length > 60 ? latest.originalText.substring(0, 60) + '...' : latest.originalText}
      </div>
    </div>
  );
}

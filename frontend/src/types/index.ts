export interface TranslationRequest {
  type: 'translate';
  text: string;
  sourceLang: string;
  targetLang: string;
  sessionId: string;
  seqNum: number;
  timestamp: number;
}

export interface TranslationResponse {
  type: 'translation';
  original_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  latency_ms: number;
  provider: string;
  seq_num: number;
  timestamp: number;
}

export interface ErrorResponse {
  type: 'error';
  message: string;
  code: string;
}

export interface SessionConfig {
  sourceLang: string;
  targetLang: string;
  audioMode: 'mic' | 'tab';
  uiMode: 'user' | 'dev';
  networkMode: 'online' | 'offline';
}

export interface SubtitleEntry {
  id: string;
  seqNum: number;
  originalText: string;
  translatedText: string;
  timestamp: number;
  latencyMs: number;
  provider: string;
  source: 'mic' | 'tab';
}

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export type WSMessage = TranslationResponse | ErrorResponse | { type: 'mode_changed'; mode: string; status: string };

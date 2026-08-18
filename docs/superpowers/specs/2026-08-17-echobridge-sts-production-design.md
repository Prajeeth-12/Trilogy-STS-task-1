# EchoBridge STS — Production Design Spec (v2)

> Real-Time Speech Translation for Online Meetings
> Revised after architectural review — all blocking issues resolved.

---

## 1. Product Overview

### What It Is
A real-time speech translation web application that captures meeting audio (mic or tab), transcribes it, translates it via LLM, and displays subtitles in a floating overlay on top of Zoom/GMeet/Teams.

### Target User
A person in an online meeting who needs live translation of spoken words into another language.

### Success Criteria (from Trilogy PDF)
- Translated text in target language
- Detect silences and showcase punctuation
- Good UX — self-explanatory without additional explanation
- Demonstrable UI
- Real-time with minimal latency (<1 second end-to-end)
- Translate between any two languages

### Platform Constraint
Chrome or Edge only (Web Speech API + Document PIP API). Documented, not a bug.

---

## 2. High-Level Design (HLD)

### 2.1 System Architecture

```
┌──────────────────────── BROWSER (Chrome/Edge) ────────────────────────┐
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    React Frontend (Vite + TS)                     │ │
│  │                                                                  │ │
│  │  AUDIO PATH A (Mic — Online STT)                                │ │
│  │  getUserMedia → Web Audio API (VAD) → Web Speech API → text     │ │
│  │                                                                  │ │
│  │  AUDIO PATH B (Tab — Backend STT)                               │ │
│  │  getDisplayMedia → AudioWorklet → PCM chunks → WebSocket        │ │
│  │                                                                  │ │
│  │  UI: User Mode / Dev Mode / PIP floating window                 │ │
│  └────────────────────────────────┬─────────────────────────────────┘ │
│                                   │ WebSocket                         │
└───────────────────────────────────┼───────────────────────────────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                    FastAPI Backend (localhost:8000)                     │
│                                   │                                    │
│  ┌────────────────────────────────┼──────────────────────────────┐   │
│  │               WebSocket Hub                                    │   │
│  │  • Text messages: route to translation                        │   │
│  │  • Binary messages (Path B): route to local Whisper STT       │   │
│  └────────────────────────────────┼──────────────────────────────┘   │
│                                   │                                    │
│  ┌────────────────────────────────┼──────────────────────────────┐   │
│  │          Translation Service                                   │   │
│  │  Primary: Groq (Llama 3.1 70B) → Failover: NVIDIA NIM        │   │
│  │  Context: last 5 sentence pairs in system prompt              │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │          Offline Engine (loaded on toggle)                     │   │
│  │  faster-whisper (medium) + NLLB-600M on RTX 4050              │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │          Journey Logger + REST export endpoint                 │   │
│  └───────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Two STT paths** (browser vs backend) | Web Speech API CANNOT consume a `getDisplayMedia` stream — it always uses the system mic. Tab audio MUST go through backend Whisper. |
| **SpeechRecognition restart loop** | Chrome's Web Speech API auto-stops after 5-60s of continuous listening. Must auto-restart on `onend` event. |
| **One primary model + one failover** | Simple. No broker routing. Groq is fast and free. NIM is backup. If both fail, show error. |
| **Online is default, offline is toggle** | Online gives best quality. Offline is opt-in when user needs it (loads models to GPU). |
| **PIP via React portal + injected CSS** | Document PIP window has a separate document — must use `createPortal` and copy stylesheet into PIP document. |
| **HTTP endpoint for journey export** | Simpler than pushing large markdown over WebSocket. `GET /api/sessions/{id}/export` returns file download. |
| **Sequence numbers on translations** | Prevents out-of-order subtitle display when API latency varies between requests. |

---

## 3. Audio Paths: Critical Design

### Path A: Microphone (Online — Web Speech API)

```
getUserMedia({audio: true})
    → MediaStream
    → Web Audio API (AnalyserNode) — VAD, volume metering, silence detection
    → SpeechRecognition (browser-native, streams to Google servers)
        → interim results: show "typing..." in UI
        → final result OR silence (700ms): finalize sentence, add punctuation
        → send text to backend via WebSocket for translation
```

**Critical implementation detail:** Must set `recognition.lang = sourceLang` on every start. Must restart on `onend` event:
```
recognition.onend = () => { if (isListening) recognition.start(); }
```

### Path B: Tab Audio (Backend Whisper STT)

```
getDisplayMedia({audio: true, video: false})
    → MediaStream (tab audio only)
    → AudioWorklet (PCM resampling to 16kHz mono)
    → WebSocket binary frames (Float32Array chunks, 100ms intervals)
    → Backend: faster-whisper processes audio chunks
    → Backend returns transcribed text
    → Same translation pipeline as Path A
```

**Why Web Speech API won't work for tab audio:** The `SpeechRecognition` API opens its own internal microphone connection. It ignores any `MediaStream` you provide. There is no way to redirect it to a `getDisplayMedia` stream from JavaScript.

**Binary WebSocket frame format:**
```
Header (4 bytes): chunk sequence number (uint32, big-endian)
Payload: Float32Array PCM samples at 16kHz mono
```

### Path Selection in UI

| Audio Mode | STT Method | Available In |
|------------|-----------|--------------|
| "My Mic" | Web Speech API (browser) | User Mode + Dev Mode |
| "Meeting Tab" | Backend Whisper (via AudioWorklet) | Dev Mode only |

"My Mic" is the default and only option in User Mode. "Meeting Tab" requires Dev Mode because it's more complex (share tab prompt, backend processing).

---

## 4. Low-Level Design (LLD)

### 4.1 Frontend Module Structure

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/
│   │   └── index.ts                # All interfaces
│   ├── hooks/
│   │   ├── useAudioCapture.ts      # getUserMedia / getDisplayMedia
│   │   ├── useSilenceDetector.ts   # Web Audio AnalyserNode, VAD
│   │   ├── useSTT.ts              # Web Speech API + restart loop
│   │   ├── useWebSocket.ts        # WS connection + auto-reconnect
│   │   ├── useTabAudio.ts         # AudioWorklet → binary WS frames
│   │   └── usePIP.ts             # Document PIP + React portal + CSS inject
│   ├── components/
│   │   ├── UserMode.tsx           # Clean minimal UI
│   │   ├── DevMode.tsx            # Developer panel with stats
│   │   ├── LanguagePicker.tsx     # Source/target selectors
│   │   ├── SubtitleFeed.tsx       # Scrolling translation feed
│   │   ├── AudioVisualizer.tsx    # Canvas waveform
│   │   ├── StatusBar.tsx          # Online/Offline badge, connection
│   │   ├── PIPContent.tsx         # What renders inside floating window
│   │   └── ModeToggle.tsx         # User/Dev switch
│   ├── services/
│   │   ├── sentenceBuffer.ts      # Interim → final with punctuation
│   │   └── audioWorklet.ts        # PCM resampling processor
│   └── constants/
│       └── languages.ts           # 50+ language options
├── public/
│   └── audio-processor.js         # AudioWorklet processor (must be separate file)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── index.html
```

### 4.2 Backend Module Structure

```
backend/
├── main.py                        # FastAPI app entry
├── config.py                      # Settings, env vars, API keys
├── requirements.txt
├── .env.example
├── routers/
│   ├── websocket.py              # WS endpoint: text + binary frames
│   └── api.py                    # REST: GET /api/sessions/{id}/export
├── services/
│   ├── translator.py             # Primary (Groq) + failover (NIM)
│   ├── context_manager.py        # Per-session last 5 sentences
│   ├── groq_client.py            # Groq API (OpenAI-compatible)
│   ├── nim_client.py             # NVIDIA NIM API
│   ├── whisper_stt.py            # faster-whisper for tab audio + offline
│   ├── offline_translator.py     # NLLB-600M local inference
│   └── journey_logger.py         # Event log + Markdown export
├── models/
│   └── schemas.py                # Pydantic request/response models
└── audio/
    └── buffer.py                 # Audio chunk accumulator for Whisper
```

### 4.3 Data Models

```typescript
// Frontend (src/types/index.ts)

interface TranslationRequest {
  type: 'translate';
  text: string;
  sourceLang: string;
  targetLang: string;
  sessionId: string;
  seqNum: number;        // Sequence number for ordering
  timestamp: number;
}

interface TranslationResponse {
  type: 'translation';
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  latencyMs: number;
  provider: 'groq' | 'nim' | 'local';
  seqNum: number;        // Same seqNum as request — for ordering
  timestamp: number;
}

interface SessionConfig {
  sourceLang: string;
  targetLang: string;
  audioMode: 'mic' | 'tab';
  uiMode: 'user' | 'dev';
  networkMode: 'online' | 'offline';
}

interface SubtitleEntry {
  id: string;
  seqNum: number;
  originalText: string;
  translatedText: string;
  timestamp: number;
  latencyMs: number;
  provider: string;
  source: 'mic' | 'tab';
}
```

```python
# Backend (models/schemas.py)

class TranslationRequest(BaseModel):
    type: str = "translate"
    text: str
    source_lang: str
    target_lang: str
    session_id: str
    seq_num: int
    timestamp: float

class TranslationResponse(BaseModel):
    type: str = "translation"
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    latency_ms: int
    provider: str
    seq_num: int
    timestamp: float

class ModeSwitch(BaseModel):
    type: str = "switch_mode"
    mode: str  # "online" | "offline"
    session_id: str
```

### 4.4 Translation Prompt Design

```python
SYSTEM_PROMPT = """You are a real-time meeting translator.
Translate naturally. Maintain speaker's tone and terminology.
Reply ONLY with the translation — no explanations, no quotes, no prefixes.

{context_block}"""

def build_messages(text: str, src: str, tgt: str, context: list[str]) -> list[dict]:
    context_block = ""
    if context:
        context_block = "Recent conversation for context:\n" + "\n".join(context[-5:])
    
    system = SYSTEM_PROMPT.format(context_block=context_block)
    
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Translate from {src} to {tgt}:\n{text}"}
    ]
```

No artificial assistant acknowledgment turn — adds tokens with no benefit.

### 4.5 Translation Router

```python
async def translate(request: TranslationRequest, context: list[str]) -> TranslationResponse:
    start = time.perf_counter()
    messages = build_messages(request.text, request.source_lang, request.target_lang, context)
    
    # Primary: Groq
    try:
        result = await groq_client.translate(messages, timeout=3.0)
        latency = int((time.perf_counter() - start) * 1000)
        return TranslationResponse(
            original_text=request.text,
            translated_text=result,
            latency_ms=latency,
            provider="groq",
            seq_num=request.seq_num,
            ...
        )
    except (TimeoutError, GroqAPIError) as e:
        if isinstance(e, RateLimitError):
            # 429: wait, don't immediately failover-and-retry
            await asyncio.sleep(1.0)
        # Fall through to NIM
    
    # Failover: NVIDIA NIM
    try:
        result = await nim_client.translate(messages, timeout=5.0)
        latency = int((time.perf_counter() - start) * 1000)
        return TranslationResponse(..., provider="nim", ...)
    except (TimeoutError, NIMAPIError):
        pass
    
    raise AllProvidersFailedError()
```

---

## 5. Workflows

### 5.1 Core Translation Flow (Mic Audio — Online)

```
User speaks "Hello, can everyone hear me?"
    │
    ▼
getUserMedia → MediaStream → AudioContext created on START button click
    │                         (respects Chrome autoplay policy)
    ▼
AnalyserNode: getByteFrequencyData() every 50ms → compute RMS volume
    │
    ├── volume > threshold → voice active
    ├── volume < threshold for 700ms → silence event fires
    │
    ▼
SpeechRecognition (lang = sourceLang):
    │
    ├── onresult (interim): show gray text in UI, no translation
    ├── onresult (isFinal): buffer the final text
    ├── onend: auto-restart if isListening === true
    │
    ▼
Silence detected OR isFinal received:
    │
    ▼
Sentence Buffer: trim + add punctuation if missing (. ? !)
    │
    ▼
WebSocket send: {"type":"translate", "text":"Hello, can everyone hear me?", 
                  "sourceLang":"en", "targetLang":"es", "seqNum": 1, ...}
    │
    ▼
Backend: add to context → build prompt → call Groq API
    │
    ▼
WebSocket receive: {"type":"translation", "translatedText":"¿Hola, pueden todos escucharme?",
                     "latencyMs": 280, "provider":"groq", "seqNum": 1}
    │
    ▼
Frontend: insert into SubtitleFeed ordered by seqNum
    │
    ▼
If PIP active: update PIPContent with latest translation
```

### 5.2 Tab Audio Flow (Dev Mode — Backend Whisper)

```
User clicks "Meeting Tab" in Dev Mode
    │
    ▼
getDisplayMedia({audio: true, video: false})
    → Chrome shows tab picker → user selects Zoom/GMeet tab
    │
    ▼
MediaStream → AudioContext → AudioWorklet (audio-processor.js)
    │
    ▼
AudioWorklet resamples to 16kHz mono Float32Array
    → Posts 100ms chunks (1600 samples per chunk) to main thread
    │
    ▼
Main thread: WebSocket.send(binaryFrame)
    Header: 4 bytes (seqNum as uint32)
    Payload: Float32Array buffer
    │
    ▼
Backend receives binary frame:
    → Accumulates in audio buffer
    → Every 3 seconds (or on silence): runs faster-whisper on accumulated audio
    → Returns transcribed text as a text WebSocket message
    │
    ▼
Same translation pipeline as mic path (context → Groq → response)
    │
    ▼
Frontend renders subtitle labeled "Tab" instead of "Mic"
```

### 5.3 PIP Window Flow

```
User clicks "Float" button
    │
    ▼
const pipWindow = await documentPictureInPicture.requestWindow({
    width: 420, height: 120
});
    │
    ▼
Inject stylesheet into PIP document:
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/src/index.css';  // Vite serves this in dev
    pipWindow.document.head.appendChild(style);
    │
    ▼
Render React component into PIP window:
    createPortal(<PIPContent />, pipWindow.document.body)
    │
    ▼
PIPContent subscribes to same subtitle state → auto-updates
    │
    ▼
On close (user closes window OR clicks Float again):
    pipWindow.close();
    Remove portal reference;
```

### 5.4 Online/Offline Toggle

```
User toggles "Offline" in UI (available in both User and Dev mode)
    │
    ▼
Frontend sends: {"type":"switch_mode", "mode":"offline", "sessionId":"..."}
    │
    ▼
Backend:
    ├── Loads faster-whisper medium onto GPU (~800MB, int8)
    ├── Loads NLLB-600M onto GPU (~1.2GB, float16)
    ├── Total: ~2GB VRAM (fits easily in 6GB with headroom)
    ├── First load: ~10-15s. Cached: <1s.
    │
    ▼
Backend sends: {"type":"mode_changed", "mode":"offline", "status":"ready"}
    │
    ▼
Frontend:
    ├── Shows "OFFLINE" badge (replaces "ONLINE")
    ├── Mic STT: sends audio binary frames to backend (same as tab path)
    │   (Web Speech API won't work offline — it needs Google servers)
    ├── Translation: backend uses NLLB-600M instead of Groq
    │
    ▼
Toggle back to Online:
    ├── Backend unloads models (frees VRAM)
    ├── Frontend returns to Web Speech API for mic STT
    ├── Translation goes back to Groq
```

### 5.5 WebSocket Connection Management

```
On app start:
    │
    ▼
Connect to ws://localhost:8000/ws?sessionId={uuid}
    │
    ├── onopen: ready
    ├── onclose: auto-reconnect with exponential backoff
    │   (100ms → 200ms → 400ms → 800ms → 1600ms → cap at 5s)
    │   Max 10 attempts, then show "Connection lost" banner
    ├── onerror: log, trigger reconnect
    │
    ▼
On reconnect success:
    ├── Re-send session config (source/target lang, mode)
    ├── Backend restores session context (kept for 5 min after disconnect)
```

### 5.6 Journey Log Export

```
User clicks "Export Journey Log" (Dev Mode)
    │
    ▼
Frontend calls: GET /api/sessions/{sessionId}/export
    │
    ▼
Backend compiles journey_logger entries:
    ├── Session start/stop times
    ├── Every translation (original, translated, latency, provider)
    ├── Mode switches, errors, failovers
    │
    ▼
Returns: Content-Type: text/markdown, Content-Disposition: attachment
    │
    ▼
Browser downloads: JOURNEY_LOG_2026-08-17.md
```

---

## 6. User Interface Specification

### 6.1 User Mode (Default — Minimal)

```
┌──────────────────────────────────────────────────────────┐
│                                                           │
│   EchoBridge STS              [🟢 Online] [📌 Float]    │
│                                                           │
│   [English ▾]  →  [Spanish ▾]        [▶ Start]          │
│                                                           │
│   ═══════════════════════════════════════════════════════ │
│                                                           │
│   "Hello, can everyone hear me?"                         │
│    ¿Hola, pueden todos escucharme?                       │
│                                                           │
│   "The quarterly results look promising"                 │
│    Los resultados trimestrales se ven prometedores       │
│                                                           │
│   typing...                                    (gray)    │
│                                                           │
│                        ~~~  (waveform)  ~~~               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

Elements:
- Title + branding (top-left)
- Online/Offline toggle pill (top-right) — in BOTH modes
- Float button (top-right)
- Language pickers (source → target) with flag emojis
- Big Start/Stop button
- Subtitle feed (latest at bottom, auto-scroll)
- Subtle waveform visualizer at bottom
- "typing..." indicator when interim STT is active

### 6.2 Developer Mode (Toggle via corner icon)

Adds a panel below:

```
┌──────────────────────────────────────────────────────────┐
│  ┌─── Developer Panel ─────────────────────────────────┐ │
│  │                                                      │ │
│  │  Provider: [Groq ▾]    API Key: [••••••••••]        │ │
│  │  Audio: [🎤 Mic] [🖥 Meeting Tab]                    │ │
│  │                                                      │ │
│  │  ┌── Live Stats ──────────────────────────────────┐ │ │
│  │  │ STT: 95ms │ Translate: 185ms │ Total: 280ms   │ │ │
│  │  │ Provider: Groq │ Model: llama-3.1-70b          │ │ │
│  │  │ Context: 5/5 sentences │ SeqNum: 23            │ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  │                                                      │ │
│  │  Subtitles: +[provider badge] +[latency ms]          │ │
│  │                                                      │ │
│  │  [📄 Export Journey Log]  [🗑 Clear]                  │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Dev-only features:
- Provider selector (Groq / NIM)
- Custom API key input
- Audio source: Mic or Meeting Tab
- Live latency breakdown (STT, Translation, Total)
- Provider + model display
- Per-subtitle: provider badge + latency
- Journey Log export button
- Clear session button

### 6.3 PIP Floating Window

```
┌──────────────────────────────────────┐
│  EchoBridge • Live          [Online] │
│                                      │
│  Los resultados trimestrales         │
│  se ven prometedores                 │
│                              280ms   │
└──────────────────────────────────────┘
```

- 420px wide, ~100-120px tall
- Dark semi-transparent background (glassmorphism)
- Shows: latest translation + latency
- Updates in real-time via React portal
- Floats over ALL applications

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| Groq timeout (>3s) | Silent failover to NIM. Dev mode shows "Failover: NIM" |
| Groq 429 (rate limit) | Wait 1s, then failover to NIM. Don't retry Groq immediately |
| Both APIs fail | Banner: "Translation paused — check connection" |
| Mic denied | Modal with clear instructions to enable |
| Tab capture cancelled | Toast: "Tab capture cancelled" — stay in mic mode |
| Web Speech API stops (onend) | Auto-restart silently. No user-visible interruption |
| WebSocket disconnect | Auto-reconnect with backoff. Banner after 10 failed attempts |
| Offline model load fails | "Couldn't load models — ensure GPU has free memory" |
| AudioContext blocked (autoplay) | Only create AudioContext on user gesture (Start button click) |
| Out-of-order responses | Frontend sorts by seqNum before inserting into feed |
| PIP window closed externally | Detect null window, reset Float button state |

---

## 8. Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| End-to-end (online, mic) | <800ms | Speech end → subtitle visible |
| STT (Web Speech API) | <300ms | Google servers do the heavy lifting |
| Translation (Groq) | <400ms | Typical for Llama 3.1 70B on Groq |
| Translation (NIM failover) | <600ms | Slightly slower |
| WebSocket round-trip | <30ms | Localhost, negligible |
| End-to-end (offline) | <800ms | Whisper (~400ms) + NLLB (~200ms) |
| PIP render | <16ms | Single frame |
| Model load (offline, first) | <15s | From NVMe SSD |
| WS reconnect | <5s | 3 attempts within 5s |

---

## 9. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Backend | FastAPI + uvicorn (Python 3.11+) |
| Async HTTP | httpx |
| Primary LLM | Groq API (Llama 3.1 70B) |
| Failover LLM | NVIDIA NIM API |
| Offline STT | faster-whisper (medium, int8) |
| Offline Translation | NLLB-200 distilled 600M (float16) |
| Audio Capture | Web Audio API + AudioWorklet |
| Online STT | Web Speech API (Chrome/Edge) |
| PIP Overlay | Document Picture-in-Picture API |
| Communication | WebSocket (text + binary frames) |

---

## 10. Implementation Phases

### Phase 1: Backend Foundation
- FastAPI app with WebSocket endpoint (text + binary frame handling)
- Groq translation client
- NIM failover client
- Context manager (last 5 sentences)
- Pydantic schemas with seqNum
- Journey logger service
- REST endpoint: `GET /api/sessions/{id}/export`
- `.env` config loading

### Phase 2: Frontend Core + Mic STT
- React app with Vite + Tailwind
- WebSocket hook with auto-reconnect (exponential backoff)
- useSTT hook (Web Speech API + restart loop + `recognition.lang`)
- useSilenceDetector hook (Web Audio AnalyserNode, 700ms threshold)
- Sentence buffer (punctuation on silence/final)
- User Mode UI (language pickers, Start/Stop, subtitle feed)
- AudioContext created only on Start button click (autoplay policy)
- Online/Offline toggle in User Mode

### Phase 3: End-to-End Integration
- Mic STT → WebSocket → backend → Groq → WebSocket → subtitle display
- SeqNum ordering in subtitle feed
- Latency measurement (frontend timestamps)
- Audio waveform visualizer (canvas)
- Interim "typing..." display

### Phase 4: PIP + Dev Mode
- Document PIP window (React portal + stylesheet injection)
- Dev Mode panel (stats, provider picker, API key input)
- Per-subtitle latency + provider badges in Dev mode
- Tab audio capture (AudioWorklet → binary WebSocket → backend Whisper)

### Phase 5: Offline Mode
- Backend: faster-whisper integration (processes binary audio chunks)
- Backend: NLLB-600M integration
- Mode switch message handling (load/unload models)
- Frontend: offline toggle wiring, status indicators
- Mic audio streaming when offline (same binary path as tab)

### Phase 6: Polish
- Error handling for all cases in Section 7
- Responsive design
- Journey log completeness
- Performance testing against targets

---

## 11. Project Structure

```
echobridge-sts/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── public/
│   │   └── audio-processor.js      # AudioWorklet (separate file required)
│   └── src/
│       └── (structure per section 4.1)
├── backend/
│   ├── requirements.txt
│   ├── main.py
│   ├── config.py
│   ├── .env.example
│   └── (structure per section 4.2)
├── docs/
│   └── planning/
│       └── CONTEXT.md
├── .gitignore
└── README.md
```

---

## 12. Scope Boundaries

### In Scope (will build)
- Mic STT → translation → subtitles (core loop)
- Any language pair via LLM
- Silence detection + auto-punctuation
- User Mode (minimal, clean)
- Dev Mode (stats, provider, API key)
- PIP floating overlay
- Online/Offline toggle
- Tab audio via backend Whisper (Dev Mode)
- Journey Log export
- Groq primary + NIM failover

### Out of Scope (will not build)
- Simultaneous mic + tab ("Both" mode) — too complex for demo, no visual payoff
- Speaker diarization — nice but not required
- Auto language detection — manual selection is fine and reliable
- Meeting summary generation — out of scope for real-time translator
- Provider racing (fire multiple APIs) — unnecessary complexity
- Cloud deployment — localhost demo is sufficient
- Multi-user / auth — single user demo

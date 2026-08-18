# EchoBridge STS — Production Planning Context

## What This Is

Trilogy HR Round 2 interview challenge: "Unlock the Super Builder in You"
Build a real-time speech translator for online meetings (Zoom, GMeet, Teams).

---

## PDF Requirements (Hard)

1. **Translated text in target language** — core output
2. **Detect silences and showcase punctuation** — bonus
3. **Good UX** — self-explanatory without any additional explanation
4. **Demonstrable UI** — must demo live
5. **Real-time** — minimal latency
6. **Any two languages** — no language pair restrictions
7. **Free to use any model/tool/framework** — paid or free encouraged

## What Trilogy Actually Evaluates

- How you use LLMs to overcome knowledge limitations
- Journey doc (prompts, screenshots, LLM assessment, recovery from failures) — due 48hrs before interview
- Creative thinking beyond basics
- Not being limited by known tech stack
- Using LLMs throughout: design → coding → testing

---

## Hardware & API Access Available

| Resource | Details |
|----------|---------|
| GPU | NVIDIA RTX 4050, 6GB VRAM |
| Claude | Claude Code (Opus models) |
| Bedrock | AWS credentials, can access Claude Haiku/Sonnet via API |
| NVIDIA NIM | API keys available |
| Groq | Free tier (Llama 3.1 70B, ~150-300ms) |

---

## Architecture Decision: Option C — Hybrid Web App + Floating PIP

### Why Not Other Options

| Option | Rejected Because |
|--------|-----------------|
| Browser-only (old build) | Mock dictionary fails "any language" requirement; no backend = toy |
| Full local ML (whisper + NLLB) | NLLB-600M quality is mediocre for rare language pairs; 6GB VRAM too tight for large models |
| Chrome Extension | 12-16 hours build time, complex (manifest, content scripts, message passing), high demo risk |
| Pure API web app | No floating overlay, need to switch tabs, less impressive |

### Chosen: Hybrid (Web App + Document PIP + FastAPI Backend)

```
[Chrome Tab: EchoBridge STS] — main control panel
         │
         ├── Captures meeting tab audio (getDisplayMedia)
         ├── Captures microphone (getUserMedia)
         ├── Full UI with controls, subtitle feed, stats
         │
         ├── One-click "Float Mode" → Document Picture-in-Picture API
         │         → Real floating DOM window with live subtitles
         │         → Sits on top of ALL windows (Zoom desktop, GMeet, anything)
         │         → Draggable, resizable
         │
         └── WebSocket → FastAPI Backend → Translation APIs
```

### Why This Wins

- Same build effort as web app (~6-8 hours)
- PIP window floats over ANY application (not just Chrome tabs)
- Looks like a native tool/extension during demo
- Low demo risk (just open URL, click Float)
- Production-grade architecture story

---

## Latency Budget (Target: <1 second end-to-end)

```
Audio chunk streaming               ~0ms (continuous)
VAD / Silence detection              ~50ms
STT interim → final result           ~100-300ms (Web Speech API)
WebSocket to backend                 ~10-20ms
Groq/NIM translation API             ~150-300ms
WebSocket back + render              ~10-20ms
─────────────────────────────────────────────
TOTAL                                ~320-690ms ✅
```

---

## System Architecture

```
┌───────────────────── BROWSER (React + Vite + TypeScript) ─────────────────┐
│                                                                            │
│  ┌────────────────┐     ┌────────────────┐                                │
│  │ Tab Audio       │     │ Microphone      │                                │
│  │ getDisplayMedia │     │ getUserMedia    │                                │
│  └───────┬────────┘     └───────┬─────────┘                                │
│          └──────────┬───────────┘                                           │
│                     ▼                                                       │
│          ┌──────────────────────┐                                          │
│          │ Web Audio Context     │                                          │
│          │ ├─ AnalyserNode (VAD) │                                          │
│          │ └─ Volume Metering    │                                          │
│          └──────────┬───────────┘                                          │
│                     ▼                                                       │
│          ┌──────────────────────┐                                          │
│          │ STT Engine (streaming)│                                          │
│          │ • Web Speech API      │                                          │
│          │ • (Deepgram WS opt)   │                                          │
│          └──────────┬───────────┘                                          │
│                     ▼                                                       │
│          ┌──────────────────────┐                                          │
│          │ Sentence Buffer       │                                          │
│          │ + Silence Punctuation │                                          │
│          │ + Auto Lang Detection │                                          │
│          └──────────┬───────────┘                                          │
│                     │ WebSocket                                             │
│                     ▼                                                       │
│          ┌──────────────────────┐                                          │
│          │ PIP Floating Window   │ ← Document Picture-in-Picture API       │
│          │ (live subtitle overlay)│                                         │
│          └──────────────────────┘                                          │
└─────────────────────┼──────────────────────────────────────────────────────┘
                      │ WebSocket
                      ▼
┌───────────────────── FastAPI Backend (Python) ─────────────────────────────┐
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    WebSocket Hub                                      │  │
│  │  • Per-session state (source/target lang, context buffer)            │  │
│  │  • Queues incoming chunks, deduplicates                              │  │
│  └───────────────────────────┬─────────────────────────────────────────┘  │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │              Translation Router (failover chain)                      │  │
│  │                                                                       │  │
│  │   Priority 1: Groq (Llama 3.1 70B) ──── ~150-300ms, free            │  │
│  │   Priority 2: NVIDIA NIM (Llama 3.1) ── ~200-400ms, has keys        │  │
│  │   Priority 3: Bedrock (Claude Haiku) ── ~400-600ms, paid             │  │
│  │   Fallback:   Local NLLB-600M ────────── ~100ms, offline             │  │
│  │                                                                       │  │
│  │   • Auto failover on timeout (500ms) or error                        │  │
│  │   • Can race providers (fire 2 simultaneously, return fastest)       │  │
│  └───────────────────────────┬─────────────────────────────────────────┘  │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │              Context Enhancer                                         │  │
│  │  • Last 5 sentences as translation context                           │  │
│  │  • Meeting terminology memory                                        │  │
│  │  • Consistency tracking across sentences                             │  │
│  └───────────────────────────┬─────────────────────────────────────────┘  │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │              Journey Logger (server-side)                             │  │
│  │  • Every prompt, response, latency, provider used                    │  │
│  │  • Export as Markdown for evaluator submission                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack (Final)

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend | React 18 + Vite + TypeScript | Fast, modern, type-safe |
| Styling | Tailwind CSS + glassmorphism | Premium dark UI, rapid iteration |
| Real-time client | Native WebSocket | Lower latency than Socket.IO |
| Floating overlay | Document Picture-in-Picture API | Floats over any window |
| Backend | FastAPI (Python, async) | WebSocket native, ML-friendly |
| Primary translation | Groq (Llama 3.1 70B) | 150ms, free, any language |
| Failover translation | NVIDIA NIM (Llama 3.1) | Already has API keys |
| Deep analysis | Claude via Bedrock | Meeting summaries, journey analysis |
| STT | Web Speech API (browser-native) | Zero setup, streaming, free |
| Offline fallback | NLLB-600M on RTX 4050 | Optional bonus feature |
| Audio processing | Web Audio API (AnalyserNode) | VAD, silence detection, volume |

---

## Key Features (Priority Order)

### Must Have (Core)
1. Real-time mic STT → translation → subtitle display
2. Any language pair selection (50+ languages)
3. Silence detection + auto-punctuation
4. Sub-1-second latency pipeline
5. Self-explanatory UI (no instructions needed)

### Should Have (Differentiators)
6. Tab audio capture (translate meeting participants)
7. Floating PIP window (sits over Zoom/GMeet)
8. Multi-provider failover (Groq → NIM → Bedrock)
9. Context-aware translation (last N sentences as context)
10. Latency stats display per translation

### Nice to Have (Creative Extras)
11. Auto language detection (don't force source lang selection)
12. Provider racing (fire 2 APIs, return fastest)
13. Meeting summary generation (Claude Opus, end of session)
14. Speaker diarization labels ("You" vs "Others")
15. One-click Journey Log export (Markdown)

---

## Audio Capture Strategy

### Mode 1: "Translate My Speech" (Mic only)
- getUserMedia → your mic
- For when YOU speak and want others to see translation

### Mode 2: "Translate Meeting" (Tab audio)
- getDisplayMedia → select the Zoom/GMeet tab
- For translating what OTHERS are saying

### Mode 3: "Both" (Full meeting translation)
- Both streams simultaneously
- Labels chunks as "You" vs "Meeting Audio"

---

## Smart Chunking Strategy

```
Interim STT results     → Show gray "typing..." indicator
Silence (700ms)         → Finalize + punctuate → send to translate
Long utterance (>15s)   → Force-chunk at clause boundary → translate
Final STT result        → Immediate translate (don't wait for silence)
```

---

## Translation Prompt Template (Context-Aware)

```
System: You are a real-time meeting translator. Translate naturally and 
consistently. Maintain the speaker's tone and technical terminology.

Context (previous sentences in this conversation):
1. "{prev_1}" → "{prev_1_translated}"
2. "{prev_2}" → "{prev_2_translated}"

Translate from {source_language} to {target_language}:
"{current_text}"

Rules:
- Reply ONLY with the translation, nothing else
- Keep technical terms consistent with context above
- Maintain speaker's register (formal/informal)
- If unsure about a term, prefer the most common translation
```

---

## Next Steps

1. Confirm this architecture (user approval)
2. Write formal spec document
3. Create implementation plan (task-by-task)
4. Build the project fresh from scratch

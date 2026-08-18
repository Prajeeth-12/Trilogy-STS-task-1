# EchoBridge STS — AI Meeting Interpreter

Real-time AI meeting interpreter that captures incoming meeting audio and generates translated live subtitles in a floating overlay.

## Quick Start (Development)

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Add your API keys
python -m uvicorn main:app --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in Chrome.

## Quick Start (Packaged App)

1. Double-click `EchoBridge.exe`
2. Chrome opens → enter your API keys on first run
3. Select languages → Share Meeting Tab → see translations

## Getting API Keys

### Groq (Required — Free)
1. Go to https://console.groq.com/keys
2. Sign up (free)
3. Create API Key → copy (starts with `gsk_`)

### NVIDIA NIM (Failover — Free)
1. Go to https://build.nvidia.com
2. Sign up (free)
3. Click any model → "Get API Key" → copy (starts with `nvapi-`)

## How It Works

1. **Meeting Interpreter Mode** (primary): Share your Zoom/GMeet tab → app captures meeting audio → transcribes via Groq Whisper → translates via NVIDIA NIM → shows subtitles
2. **My Voice Mode**: Uses your mic → Web Speech API → translates → shows subtitles
3. **Float Mode**: Click the PIP button → subtitle window floats over any application

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Python 3.11+
- **STT**: Groq Whisper API (meeting audio) / Web Speech API (mic)
- **Translation**: NVIDIA NIM (primary), Groq (failover)
- **Overlay**: Document Picture-in-Picture API (Chrome 116+)

## Build Desktop App

```bash
build.bat
```

Output: `backend/dist/EchoBridge.exe`

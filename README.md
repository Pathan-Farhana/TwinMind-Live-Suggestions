# 🧠 TwinMind — AI Meeting Copilot

A real-time AI-powered meeting assistant built with **Next.js**, **Groq API**, and **Whisper**. TwinMind listens to your voice, transcribes it live, generates smart suggestion cards every 30 seconds, and lets you chat with an AI about anything discussed — all in one clean dark-themed interface.

---

## 📸 Features

- 🎙 **Live Transcription** — Records your voice continuously and transcribes every 30-second chunk using Groq's Whisper model. No need to stop and start — just press Start once and speak freely.
- 💡 **Auto Suggestions** — Every 30 seconds, 3 AI-generated suggestion cards appear based on the latest transcript. Older batches stay visible below (faded), newest batch always on top.
- 💬 **Chat (Detailed Answers)** — Click any suggestion card or type your own question to get a detailed AI answer. Full conversation history is maintained per session.
- 🔑 **Per-User Groq API Key** — Each user enters their own Groq API key directly in the UI. No shared keys, no `.env` needed by users.
- ↓ **Export Session** — Download the full session (transcript + suggestion batches with timestamps + chat history) as a `.txt` file.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Speech-to-Text | Groq Whisper (`whisper-large-v3`) |
| AI Completions | Groq Chat API (`openai/gpt-oss-120b`) |
| HTTP Client | Axios |
| Styling | Inline React styles (dark theme) |

---

## 📁 Project Structure

```
twinmind/
├── app/
│   ├── page.tsx                  # Main UI — Transcript, Suggestions, Chat
│   └── api/
│       ├── transcribe/
│       │   └── route.ts          # POST /api/transcribe — Whisper transcription
│       ├── suggestions/
│       │   └── route.ts          # POST /api/suggestions — AI suggestion cards
│       └── chat/
│           └── route.ts          # POST /api/chat — Detailed AI chat answers
├── public/
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/twinmind.git
cd twinmind
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **No `.env` file needed.** Each user enters their own Groq API key directly in the app UI.

---

## 🔑 Getting Your Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up or log in
3. Navigate to **API Keys** → **Create API Key**
4. Copy your key and paste it into the **Groq Key** field in the TwinMind UI

---

## 🖥 How to Use

1. **Enter your Groq API key** in the top bar — the border turns green when set
2. **Click the 🎤 mic button** to start recording
3. **Speak freely** — transcript appends automatically every 30 seconds
4. **Suggestion cards** appear every 30 seconds in the middle column based on what you've said
5. **Click a suggestion card** to get a detailed AI answer in the Chat column
6. **Type any question** in the chat input and press Send or Enter
7. **Click ↺ Reload** in suggestions to manually refresh cards at any time
8. **Click ↓ Export Session** to download the full session as a `.txt` file
9. **Click the ⏹ stop button** to end recording

---

## 🔌 API Routes

### `POST /api/transcribe`
Transcribes a base64-encoded audio chunk using Groq Whisper.

**Request body:**
```json
{
  "audioFile": "data:audio/webm;base64,...",
  "groqKey": "gsk_..."
}
```

**Response:**
```json
{ "text": "transcribed text here" }
```

---

### `POST /api/suggestions`
Generates 3 suggestion cards from the latest transcript.

**Request body:**
```json
{
  "transcript": "full transcript so far...",
  "groqKey": "gsk_..."
}
```

**Response:**
```json
{
  "content": "[{\"title\":\"...\",\"preview\":\"...\",\"fullAnswer\":\"...\"}]"
}
```

---

### `POST /api/chat`
Returns a detailed answer for a clicked suggestion or typed question.

**Request body:**
```json
{
  "transcript": "full transcript so far...",
  "suggestion": "user question or suggestion text",
  "groqKey": "gsk_..."
}
```

**Response:**
```json
{ "content": "detailed AI answer..." }
```

---

## ⚙️ Key Implementation Details

### Continuous Recording
`MediaRecorder.start(30000)` fires `ondataavailable` every 30 seconds automatically. Each chunk is sent to Groq Whisper immediately and the result is appended to the transcript — no need to stop and restart.

### Stale Closure Fix
`groqKeyRef` is a `useRef` kept in sync with `groqKey` state via `useEffect`. This ensures async callbacks like `ondataavailable` always read the latest API key, not a stale closure value.

### Suggestion Deduplication
`lastSuggestedTranscriptRef` tracks what transcript was last used for suggestions. New suggestion batches are only fetched when the transcript has actually grown, avoiding duplicate cards.

### Silent Chunk Errors
Audio chunks under 1KB (silence or empty) are silently skipped on both frontend and backend — no error alerts shown to the user mid-recording.

### Groq Key Validation
All three API routes (`transcribe`, `suggestions`, `chat`) validate the `groqKey` from the request body and return HTTP `401` with a clear message if it's missing or rejected by Groq. The frontend shows an alert and stops recording on `401`.

---

## 🐛 Known Limitations

- Transcription appears after each 30-second chunk completes, not word-by-word
- Requires a valid Groq API key with access to `whisper-large-v3` and `openai/gpt-oss-120b`
- Browser must support `MediaRecorder` API (all modern browsers supported)
- Audio format is `audio/webm` — may vary slightly across browsers

---

## 📄 License

This project was built as part of an assignment. Feel free to use and modify it for educational purposes.
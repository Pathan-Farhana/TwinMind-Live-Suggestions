"use client";
import { useState, useRef, useEffect } from "react";

function cleanText(text: string) {
  return text
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\*/g, "")
    .replace(/\|/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n\n");
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface SuggestionBatch {
  items: { title: string; preview: string; fullAnswer: string }[];
  timestamp: number;
}

interface ChatMessage {
  role: string;
  content: string;
  timestamp: number;
}

export default function Home() {
  const [groqKey, setGroqKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const suggestionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptAccumRef = useRef("");
  const lastSuggestedTranscriptRef = useRef(""); // track what was last sent for suggestions
  const groqKeyRef = useRef(""); // always-fresh ref so async callbacks get latest key

  // Keep groqKeyRef in sync
  useEffect(() => { groqKeyRef.current = groqKey; }, [groqKey]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatHistory]);

  async function transcribeChunk(audioBlob: Blob) {
    if (audioBlob.size < 1000) return; // skip tiny/silent chunks

    const base64Audio = await blobToBase64(audioBlob);
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioFile: base64Audio, groqKey: groqKeyRef.current }),
      });
      const data = await res.json();

      if (res.status === 401) {
        alert("❌ " + (data.error || "Invalid Groq API key."));
        stopRecording();
        return;
      }

      if (data.text && data.text.trim()) {
        transcriptAccumRef.current = transcriptAccumRef.current
          ? transcriptAccumRef.current + " " + data.text.trim()
          : data.text.trim();
        setTranscript(transcriptAccumRef.current);
      }
    } catch (err) {
      console.error("Transcription chunk error:", err);
    }
  }

  async function startRecording() {
    if (!groqKey.trim()) {
      alert("Please enter your Groq API key before recording.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert("Microphone access denied. Please allow microphone access.");
      return;
    }

    // Pick a supported MIME type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    transcriptAccumRef.current = transcript;
    lastSuggestedTranscriptRef.current = transcript;

    // Each 30s chunk arrives here and is immediately transcribed
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 1000) {
        transcribeChunk(event.data);
      }
    };

    recorder.onerror = (e) => {
      console.error("MediaRecorder error:", e);
    };

    // Start with 30s chunks — fires continuously until stop() is called
    recorder.start(30000);
    setIsRecording(true);

    // Every 30s, if transcript has grown since last suggestion fetch, fetch new suggestions
    suggestionIntervalRef.current = setInterval(() => {
      const current = transcriptAccumRef.current.trim();
      if (current && current !== lastSuggestedTranscriptRef.current) {
        lastSuggestedTranscriptRef.current = current;
        fetchSuggestions(current);
      }
    }, 30000);
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      // Request any buffered data before stopping
      try { mediaRecorderRef.current.requestData(); } catch (_) {}
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    if (suggestionIntervalRef.current) {
      clearInterval(suggestionIntervalRef.current);
      suggestionIntervalRef.current = null;
    }
    setIsRecording(false);
  }

  async function fetchSuggestions(text: string) {
    if (!text.trim() || !groqKeyRef.current.trim()) return;
    setIsLoadingSuggestions(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, groqKey: groqKeyRef.current }),
      });
      const data = await res.json();
      if (res.status === 401 || data.error) {
        alert("❌ " + (data.error || "Invalid Groq API key."));
        return;
      }
      // Strip markdown code fences if model wraps JSON in ```json ... ```
      const raw = data.content.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(raw);
      const newBatch: SuggestionBatch = {
        items: parsed.slice(0, 3),
        timestamp: Date.now(),
      };
      setSuggestionBatches((prev) => [newBatch, ...prev]);
    } catch (err) {
      console.error("Suggestions parse error:", err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }

  async function handleSuggestionClick(suggestion: any) {
    if (!groqKey.trim()) { alert("Please enter your Groq API key."); return; }
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        suggestion: suggestion.fullAnswer || suggestion.preview,
        groqKey,
      }),
    });
    const data = await res.json();
    if (res.status === 401 || data.error) {
      alert("❌ " + (data.error || "Invalid Groq API key."));
      return;
    }
    const now = Date.now();
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: suggestion.preview, timestamp: now },
      { role: "assistant", content: data.content, timestamp: Date.now() },
    ]);
  }

  async function handleChatSubmit() {
    if (!chatInput.trim()) return;
    if (!groqKey.trim()) { alert("Please enter your Groq API key."); return; }
    const userMsg = chatInput;
    setChatInput("");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, suggestion: userMsg, groqKey }),
    });
    const data = await res.json();
    if (res.status === 401 || data.error) {
      alert("❌ " + (data.error || "Invalid Groq API key."));
      return;
    }
    const now = Date.now();
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: userMsg, timestamp: now },
      { role: "assistant", content: data.content, timestamp: Date.now() },
    ]);
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function handleExportPlainText() {
    let text = "=== TRANSCRIPT ===\n";
    text += transcript + "\n\n";
    text += "=== SUGGESTION BATCHES ===\n";
    suggestionBatches.forEach((batch, bIdx) => {
      text += `Batch ${suggestionBatches.length - bIdx} — ${formatTime(batch.timestamp)}\n`;
      batch.items.forEach((s, idx) => {
        text += `  ${idx + 1}. ${s.title}\n     ${s.preview}\n`;
      });
      text += "\n";
    });
    text += "=== CHAT HISTORY ===\n";
    chatHistory.forEach((msg) => {
      text += `[${formatTime(msg.timestamp)}] ${msg.role === "user" ? "You" : "AI"}: ${cleanText(msg.content)}\n\n`;
    });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "twinmind_session.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#0d0f14", color: "#e2e8f0",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 24px", borderBottom: "1px solid #1e2330", background: "#0d0f14",
      }}>
        <span style={{ fontWeight: 700, fontSize: "18px", letterSpacing: "0.04em", color: "#60a5fa" }}>
          🧠 TwinMind
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, maxWidth: "420px", margin: "0 24px" }}>
          <span style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap", fontWeight: 600 }}>🔑 Groq Key:</span>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type={showKey ? "text" : "password"}
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="Enter your Groq API key…"
              style={{
                width: "100%", padding: "7px 36px 7px 12px", borderRadius: "8px",
                border: `1px solid ${groqKey ? "#22c55e" : "#2d3748"}`,
                background: "#131620", color: "#e2e8f0", fontSize: "13px",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <button onClick={() => setShowKey((v) => !v)} style={{
              position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: "14px", padding: 0,
            }}>
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
          {groqKey && <span style={{ fontSize: "11px", color: "#22c55e", whiteSpace: "nowrap", fontWeight: 600 }}>✓ Set</span>}
        </div>

        <button onClick={handleExportPlainText} style={{
          padding: "7px 18px", background: "#1e2330", color: "#93c5fd",
          border: "1px solid #2d3748", borderRadius: "8px", cursor: "pointer",
          fontWeight: 600, fontSize: "13px",
        }}>
          ↓ Export Session
        </button>
      </div>

      {/* Three columns */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Column 1: MIC & TRANSCRIPT */}
        <div style={{
          flex: 1, borderRight: "1px solid #1e2330", padding: "20px",
          display: "flex", flexDirection: "column", gap: "16px",
        }}>
          <h2 style={{ margin: 0, fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "#64748b", textTransform: "uppercase" }}>
            🎙 Mic &amp; Transcript
          </h2>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                width: "72px", height: "72px", borderRadius: "50%", border: "none",
                cursor: "pointer", fontSize: "28px",
                background: isRecording
                  ? "radial-gradient(circle, #ef4444, #b91c1c)"
                  : "radial-gradient(circle, #3b82f6, #1d4ed8)",
                boxShadow: isRecording
                  ? "0 0 0 6px rgba(239,68,68,0.25), 0 4px 20px rgba(239,68,68,0.4)"
                  : "0 0 0 6px rgba(59,130,246,0.2), 0 4px 20px rgba(59,130,246,0.3)",
                transition: "all 0.2s ease",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {isRecording ? "⏹" : "🎤"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {isRecording ? "Recording… (tap to stop)" : "Click mic to start"}
            </span>
            {isRecording && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#f87171", fontWeight: 600 }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite" }} />
                LIVE
              </span>
            )}
          </div>
          <div ref={transcriptRef} style={{
            flex: 1, overflowY: "auto", background: "#131620", borderRadius: "10px",
            padding: "14px", fontSize: "14px", lineHeight: "1.7", color: "#cbd5e1",
            border: "1px solid #1e2330", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {transcript || <span style={{ color: "#3f4a5e", fontStyle: "italic" }}>Transcript will appear here…</span>}
          </div>
        </div>

        {/* Column 2: LIVE SUGGESTIONS */}
        <div style={{
          flex: 1, borderRight: "1px solid #1e2330", padding: "20px",
          display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "#64748b", textTransform: "uppercase" }}>
              💡 Live Suggestions
            </h2>
            <button
              onClick={() => fetchSuggestions(transcriptAccumRef.current || transcript)}
              disabled={isLoadingSuggestions || (!transcript && !transcriptAccumRef.current)}
              style={{
                padding: "5px 12px", background: "#1e2330",
                color: isLoadingSuggestions ? "#475569" : "#93c5fd",
                border: "1px solid #2d3748", borderRadius: "6px",
                cursor: "pointer", fontSize: "12px", fontWeight: 600,
              }}
            >
              {isLoadingSuggestions ? "Loading…" : "↺ Reload"}
            </button>
          </div>
          {suggestionBatches.length === 0 && (
            <p style={{ color: "#3f4a5e", fontStyle: "italic", fontSize: "13px" }}>
              Suggestions refresh every 30s while recording…
            </p>
          )}
          {suggestionBatches.map((batch, bIdx) => (
            <div key={bIdx} style={{ opacity: bIdx === 0 ? 1 : Math.max(0.35, 1 - bIdx * 0.25) }}>
              <div style={{ fontSize: "10px", color: "#475569", marginBottom: "6px", letterSpacing: "0.06em" }}>
                {bIdx === 0 ? "▲ LATEST" : `OLDER — ${formatTime(batch.timestamp)}`}
              </div>
              {batch.items.map((s, idx) => (
                <div key={idx} onClick={() => handleSuggestionClick(s)}
                  style={{
                    marginBottom: "8px", padding: "12px 14px",
                    background: bIdx === 0 ? "#131e30" : "#111418",
                    border: `1px solid ${bIdx === 0 ? "#1e3a5f" : "#1e2330"}`,
                    borderRadius: "10px", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2640")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = bIdx === 0 ? "#131e30" : "#111418")}
                >
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#93c5fd", marginBottom: "4px" }}>{s.title}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.5" }}>{s.preview}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Column 3: CHAT */}
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "#64748b", textTransform: "uppercase" }}>
            💬 Chat (Detailed Answers)
          </h2>
          <div ref={chatRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            {chatHistory.length === 0 && (
              <p style={{ color: "#3f4a5e", fontStyle: "italic", fontSize: "13px" }}>
                Click a suggestion or type a question to begin…
              </p>
            )}
            {chatHistory.map((msg, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: "3px" }}>
                <span style={{ fontSize: "10px", color: "#475569" }}>
                  {msg.role === "user" ? "You" : "AI"} · {formatTime(msg.timestamp)}
                </span>
                <div style={{
                  maxWidth: "85%",
                  background: msg.role === "user" ? "#1e3a5f" : "#131e2a",
                  border: `1px solid ${msg.role === "user" ? "#2d5a8e" : "#1e2d3d"}`,
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  fontSize: "13px", lineHeight: "1.6", color: "#cbd5e1",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {cleanText(msg.content)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text" value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChatSubmit()}
              placeholder="Ask a question about the transcript…"
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "8px",
                border: "1px solid #2d3748", background: "#131620",
                color: "#e2e8f0", fontSize: "13px", outline: "none",
              }}
            />
            <button onClick={handleChatSubmit} style={{
              padding: "10px 18px", borderRadius: "8px", border: "none",
              background: "#2563eb", color: "white", fontWeight: 700,
              fontSize: "13px", cursor: "pointer",
            }}>
              Send
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
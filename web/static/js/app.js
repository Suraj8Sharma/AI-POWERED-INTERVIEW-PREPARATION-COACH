/**
 * PrepLoom — Client-side logic for the practice room (MONACO-FIXED VERSION).
 *
 * Drives the SPA: role loading, interview flow, audio recording,
 * webcam capture, posture analysis, TTS, and report rendering.
 * 
 * FIXES:
 * - Proper Monaco loader initialization
 * - Container validation before creating editor
 * - Robust error handling with fallback UI
 * - CSS class management for visibility
 */

// ═══════════════════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

const roleSelect = $("roleSelect");
const candidateName = $("candidateName");
const ttsCheckbox = $("ttsCheckbox");
const startBtn = $("startBtn");
const endBtn = $("endBtn");
const statusDot = $("statusDot");
const statusLabel = $("statusLabel");

const welcomeView = $("welcomeView");
const interviewView = $("interviewView");
const reportView = $("reportView");

// KPIs
const kpiRole = $("kpiRole");
const kpiQ = $("kpiQ");
const kpiLevel = $("kpiLevel");
const kpiTopic = $("kpiTopic");

// Video
const videoPreview = $("videoPreview");
const snapshotCanvas = $("snapshotCanvas");
const postureBtn = $("postureBtn");
const continuousAnalysisBtn = $("continuousAnalysisBtn");
const liveStatusText = $("liveStatusText");
const bodyMetrics = $("bodyMetrics");
const metricOpenness = $("metricOpenness");
const metricFidgeting = $("metricFidgeting");
const metricEngage = $("metricEngage");
const metricPosture = $("metricPosture");
const blSummary = $("blSummary");

// Interview
const questionBubble = $("questionBubble");
const speakBtn = $("speakBtn");
const speakBtnText = $("speakBtnText");
const showIdealCheck = $("showIdealCheck");
const sttStatus = $("sttStatus");
const transcriptArea = $("transcriptArea");
const recordingIndicator = $("recordingIndicator");
const recordingTimer = $("recordingTimer");
const idealAnswer = $("idealAnswer");
const idealText = $("idealText");
const typeInput = $("typeInput");
const sendTypedBtn = $("sendTypedBtn");
const submitBtn = $("submitBtn");
const nextBtn = $("nextBtn");
const repeatBtn = $("repeatBtn");
const codeToggleBtn = $("codeToggleBtn");
const codingWorkspace = $("codingWorkspace");
const codeLangSelect = $("codeLangSelect");
const resetCodeBtn = $("resetCodeBtn");

// Feedback
const feedbackContent = $("feedbackContent");
const feedbackScores = $("feedbackScores");
const scoreRow = $("scoreRow");
const feedbackDetails = $("feedbackDetails");

// Report
const reportSub = $("reportSub");
const reportScores = $("reportScores");
const reportBreakdown = $("reportBreakdown");
const reportTips = $("reportTips");
const downloadReportBtn = $("downloadReportBtn");
const openReportsBtn = $("openReportsBtn");
const reportsHistoryView = $("reportsHistoryView");
const reportsList = $("reportsList");
const backToReportsBtn = $("backToReportsBtn");
const newInterviewBtn = $("newInterviewBtn");

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════
let sessionId = null;
let currentQuestion = null;
let totalQuestions = 0;
let lastAnswer = "";
let answerDuration = 0;
let bodyLanguageData = null;
let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = 0;
let recordingTimerInterval = null;
let liveRecognition = null;
let recognitionRestartRequested = false;
let liveTranscriptFinal = "";

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }
function scoreColor(s) { return s >= 70 ? "green" : s >= 45 ? "amber" : "red"; }
function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CODING QUESTION DETECTION
// ═══════════════════════════════════════════════════════════════════════════
function isCodingQuestion(q) {
    if (!q) return false;
    const text = (q.question_text || "").toLowerCase();
    const topic = (q.subtopic || "").toLowerCase();

    const codingTopics = [
        "arrays & hashing", "two pointers", "linked lists", "stacks",
        "dynamic programming", "binary search", "trees",
    ];
    if (codingTopics.some(ct => topic.includes(ct))) return true;

    const phrases = [
        "write a function", "given an array", "singly linked list",
        "given the root", "linked list", "integer array", "return an array",
        "implement a", "write code", "write a program", "write a method",
        "coding question", "algorithm",
    ];
    return phrases.some(p => text.includes(p));
}

// ═══════════════════════════════════════════════════════════════════════════
//  MONACO EDITOR — TEMPLATES & HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const CODE_TEMPLATES = {
    python: "# Write your solution here\ndef solution():\n    pass\n",
    javascript: "// Write your solution here\nfunction solution() {\n    \n}\n",
    java: "// Write your solution here\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n",
    cpp: "// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
    c: "// Write your solution here\n#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n",
    typescript: "// Write your solution here\nfunction solution(): void {\n    \n}\n",
    go: "// Write your solution here\npackage main\n\nfunc main() {\n    \n}\n",
    rust: "// Write your solution here\nfn main() {\n    \n}\n",
};

function getMonacoLang(value) {
    const map = {
        python: "python", javascript: "javascript", java: "java",
        cpp: "cpp", c: "c", typescript: "typescript", go: "go", rust: "rust",
    };
    return map[value] || "python";
}

// ─── Create / update the Monaco editor instance ───────────────────────────
async function createMonacoEditor(lang = "python") {
    const container = $("monacoEditorContainer");

    // CRITICAL: Validate container exists and is visible
    if (!container) {
        console.error("[PrepLoom] ❌ monacoEditorContainer not found in DOM");
        return false;
    }

    // Check if container is visible and has dimensions
    const rect = container.getBoundingClientRect();
    if (rect.height === 0) {
        console.warn("[PrepLoom] ⚠️ Container has zero height, waiting...");
        await new Promise(r => setTimeout(r, 100));
    }

    // Guard: Monaco must be loaded
    if (typeof window.monaco === "undefined" || !window.monaco.editor) {
        console.warn("[PrepLoom] ⚠️ Monaco not available yet");
        return false;
    }

    // If editor already exists, update language only
    if (preploomCodeEditor && preploomCodeEditor.dispose && typeof preploomCodeEditor.dispose === 'function') {
        console.log("[PrepLoom] 📝 Updating existing editor to language:", lang);
        try {
            const model = preploomCodeEditor.getModel();
            if (model) {
                window.monaco.editor.setModelLanguage(model, getMonacoLang(lang));
            }
            if (preploomCodeEditor.layout) {
                preploomCodeEditor.layout();
            }
        } catch (e) {
            console.error("[PrepLoom] Error updating editor:", e);
        }
        return true;
    }

    // Detect dark mode
    const isDark =
        document.documentElement.classList.contains("theme-dark") ||
        !document.documentElement.classList.contains("theme-light");

    const theme = isDark ? "vs-dark" : "vs";
    const template = CODE_TEMPLATES[lang] || CODE_TEMPLATES.python;

    console.log("[PrepLoom] 🎨 Creating Monaco editor, theme:", theme, "lang:", lang);

    try {
        preploomCodeEditor = window.monaco.editor.create(container, {
            value: template,
            language: getMonacoLang(lang),
            theme: theme,
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            roundedSelection: true,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            wordWrap: "on",
            tabSize: 4,
            insertSpaces: true,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            folding: true,
            lineDecorationsWidth: 10,
            glyphMargin: true,
        });

        monacoEditorReady = true;
        console.log("[PrepLoom] ✅ Monaco editor instance created successfully");

        // Listen for content changes to update submit state
        preploomCodeEditor.onDidChangeModelContent(() => {
            updateSubmitState();
        });

        // Force a layout pass after initial render
        setTimeout(() => {
            if (preploomCodeEditor && preploomCodeEditor.layout) {
                preploomCodeEditor.layout();
                console.log("[PrepLoom] 📐 Editor layout refreshed");
            }
        }, 20);

        return true;
    } catch (e) {
        console.error("[PrepLoom] ❌ Failed to create Monaco editor:", e);
        showMonacoFallback(e);
        return false;
    }
}

// ─── Show the coding workspace ────────────────────────────────────────────
async function showCodeEditor() {
    if (!codingWorkspace) {
        console.warn("[PrepLoom] codingWorkspace element not found");
        return;
    }

    console.log("[PrepLoom] 📂 Showing code editor");

    codingWorkspace.classList.remove("hidden");
    codingWorkspace.classList.add("slide-in");
    isCodeEditorVisible = true;

    if (codeToggleBtn) {
        codeToggleBtn.classList.add("code-editor-active");
    }

    const lang = codeLangSelect ? codeLangSelect.value : "python";

    try {
        // Wait for Monaco with a timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Monaco load timeout")), 5000)
        );

        await Promise.race([monacoReady, timeoutPromise]);
        console.log("[PrepLoom] Monaco ready, initializing editor");
    } catch (e) {
        console.error("[PrepLoom] ⏱️ Monaco timeout:", e.message);
        return;
    }

    // Give the DOM time to settle
    await new Promise(r => setTimeout(r, 50));

    // Create the editor
    const success = await createMonacoEditor(lang);
    if (!success) {
        console.error("[PrepLoom] Failed to create editor");
        return;
    }

    // Force layout again after slide-in animation
    setTimeout(() => {
        if (preploomCodeEditor && preploomCodeEditor.layout) {
            preploomCodeEditor.layout();
            console.log("[PrepLoom] 📐 Final layout after animation");
        }
    }, 350);
}

// ─── Hide the coding workspace ────────────────────────────────────────────
function hideCodeEditor() {
    if (!codingWorkspace) return;
    console.log("[PrepLoom] 🚫 Hiding code editor");

    codingWorkspace.classList.add("hidden");
    codingWorkspace.classList.remove("slide-in");
    isCodeEditorVisible = false;

    if (codeToggleBtn) {
        codeToggleBtn.classList.remove("code-editor-active");
    }
}

// ─── Reset editor to the language template ───────────────────────────────
function resetCodeEditor() {
    if (!preploomCodeEditor) return;
    const lang = codeLangSelect ? codeLangSelect.value : "python";
    console.log("[PrepLoom] 🔄 Resetting editor to template");
    preploomCodeEditor.setValue(CODE_TEMPLATES[lang] || CODE_TEMPLATES.python);
}

// ─── Language selector ────────────────────────────────────────────────────
if (codeLangSelect) {
    codeLangSelect.addEventListener("change", () => {
        const lang = codeLangSelect.value;
        console.log("[PrepLoom] 🔤 Language changed to:", lang);

        if (preploomCodeEditor && typeof window.monaco !== "undefined") {
            const model = preploomCodeEditor.getModel();
            if (model && window.monaco.editor) {
                window.monaco.editor.setModelLanguage(model, getMonacoLang(lang));
            }

            // Check if current content is a template
            const currentVal = preploomCodeEditor.getValue().trim();
            const isTemplate = Object.values(CODE_TEMPLATES).some(t => t.trim() === currentVal);

            if (!currentVal || isTemplate) {
                preploomCodeEditor.setValue(CODE_TEMPLATES[lang] || CODE_TEMPLATES.python);
            }
        }
    });
}

// ─── Reset button ─────────────────────────────────────────────────────────
if (resetCodeBtn) {
    resetCodeBtn.addEventListener("click", () => {
        if (confirm("Reset editor to template code?")) {
            resetCodeEditor();
        }
    });
}

// ─── Toggle button ────────────────────────────────────────────────────────
if (codeToggleBtn) {
    codeToggleBtn.addEventListener("click", () => {
        console.log("[PrepLoom] Code toggle. Visible:", isCodeEditorVisible);
        if (isCodeEditorVisible) {
            hideCodeEditor();
        } else {
            showCodeEditor();
        }
    });
}

// ─── Sync Monaco theme whenever the page theme changes ───────────────────
function syncMonacoTheme() {
    if (!preploomCodeEditor || typeof window.monaco === "undefined") return;
    const isDark =
        document.documentElement.classList.contains("theme-dark") ||
        !document.documentElement.classList.contains("theme-light");
    const theme = isDark ? "vs-dark" : "vs";
    console.log("[PrepLoom] 🎨 Syncing Monaco theme:", theme);
    try {
        window.monaco.editor.setTheme(theme);
    } catch (e) {
        console.warn("[PrepLoom] Theme sync error:", e);
    }
}

new MutationObserver(syncMonacoTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
});

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH / API helpers
// ═══════════════════════════════════════════════════════════════════════════
const PREPLOOM_TOKEN_KEY = "preploom_token";

function getPreploomToken() {
    try {
        if (window.SB && typeof window.SB.getToken === "function") return window.SB.getToken();
        return localStorage.getItem(PREPLOOM_TOKEN_KEY);
    } catch (e) {
        return null;
    }
}

async function api(endpoint, options = {}) {
    const headers = new Headers(options.headers || {});
    const tok = getPreploomToken();
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const d = err.detail;
        const msg =
            typeof d === "string"
                ? d
                : Array.isArray(d)
                    ? d.map(x => x.msg || JSON.stringify(x)).join(" ")
                    : res.statusText;
        throw new Error(msg);
    }
    return res.json();
}

async function apiDownload(endpoint, options = {}) {
    const headers = new Headers(options.headers || {});
    const tok = getPreploomToken();
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(errText || res.statusText);
    }
    return res.blob();
}

// ═══════════════════════════════════════════════════════════════════════════
//  UI state helpers
// ═══════════════════════════════════════════════════════════════════════════
function setStatus(live) {
    statusDot.className = "status-dot" + (live ? " live" : "");
    statusLabel.textContent = live ? "🟢 Live" : "⚪ Idle";
}

function switchView(view) {
    [welcomeView, interviewView, reportView, reportsHistoryView].forEach(v => hide(v));
    show(view);
}

function setSpeakButtonState(recording = false, elapsedSeconds = 0) {
    speakBtn.classList.toggle("recording", recording);
    speakBtnText.textContent = recording
        ? `Stop Recording ${formatClock(elapsedSeconds)}`
        : "Speak Answer";
}

function setRecordingUI(recording = false, elapsedSeconds = 0) {
    isRecording = recording;
    setSpeakButtonState(recording, elapsedSeconds);
    speakBtn.disabled = !sessionId;
    nextBtn.disabled = recording || !sessionId;
    repeatBtn.disabled = recording || !sessionId;
    typeInput.disabled = recording || !sessionId;
    sendTypedBtn.disabled = recording || !sessionId;

    if (recording) {
        recordingTimer.textContent = formatClock(elapsedSeconds);
        show(recordingIndicator);
    } else {
        recordingTimer.textContent = "0:00";
        hide(recordingIndicator);
    }
}

function updateTranscript(text) {
    transcriptArea.value = text;
    if (text.trim()) show(transcriptArea);
}

async function blobToBase64(blob) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(reader.error || new Error("Could not read audio blob"));
        reader.readAsDataURL(blob);
    });
}

function startTranscriptionStream() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/transcribe-audio`;

    transcriptionSequence = 0;
    lastStreamingTranscript = "";
    lastStreamedSequence = -1;

    try {
        transcriptionSocket = new WebSocket(wsUrl);
    } catch (e) {
        transcriptionSocket = null;
        return false;
    }

    transcriptionSocket.onopen = () => {
        if (!audioChunks.length) return;
        const initialBlob = new Blob(audioChunks, { type: "audio/webm" });
        sendStreamingAudio(initialBlob, false).catch((err) => {
            console.warn("Initial streaming audio send skipped:", err);
        });
    };

    transcriptionSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.error) {
                console.warn("Streaming transcription error:", data.error);
                return;
            }

            const seq = Number(data.seq ?? -1);
            const transcript = (data.transcript || "").trim();
            if (seq < lastStreamedSequence || !transcript) return;

            lastStreamedSequence = seq;
            lastStreamingTranscript = transcript;
            lastAnswer = transcript;
            updateTranscript(transcript);
            updateSubmitState();

            if (isRecording) {
                sttStatus.className = "stt-status recording";
                sttStatus.textContent = "Recording now. Transcript is updating live.";
                show(sttStatus);
            } else {
                sttStatus.className = "stt-status done";
                sttStatus.textContent = data.final ? "Live transcript complete." : "Transcript refining…";
                show(sttStatus);
            }
        } catch (e) {
            console.error("Failed to parse transcription stream message:", e);
        }
    };

    transcriptionSocket.onclose = () => {
        transcriptionSocket = null;
    };

    transcriptionSocket.onerror = () => {
        console.warn("Audio transcription WebSocket connection error");
    };

    return true;
}

function stopTranscriptionStream() {
    if (transcriptionSocket) {
        transcriptionSocket.close();
        transcriptionSocket = null;
    }
}

async function sendStreamingAudio(blob, final = false) {
    if (!transcriptionSocket || transcriptionSocket.readyState !== WebSocket.OPEN) return;

    const audio = await blobToBase64(blob);
    transcriptionSequence += 1;
    transcriptionSocket.send(JSON.stringify({
        audio,
        mime_type: blob.type || "audio/webm",
        seq: transcriptionSequence,
        final,
    }));
}

function setLiveAnalysisState(active) {
    continuousAnalysisBtn.classList.toggle("active", active);
    continuousAnalysisBtn.disabled = !sessionId;
    liveStatusText.textContent = active ? "Live Posture On" : "Live Posture Ready";
}

function startRecordingTimer() {
    if (recordingTimerInterval) clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
        if (!isRecording || !recordingStartTime) return;
        const elapsed = Math.max(0, Math.floor((Date.now() - recordingStartTime) / 1000));
        setRecordingUI(true, elapsed);
    }, 250);
}

function stopRecordingTimer() {
    if (recordingTimerInterval) { clearInterval(recordingTimerInterval); recordingTimerInterval = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TTS (browser speechSynthesis)
// ═══════════════════════════════════════════════════════════════════════════
const tts = { supported: false, voices: [] };

function speak(text) {
    if (!tts.supported || !ttsCheckbox.checked || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);

    // Push browser TTS to full output volume and a slightly slower cadence
    // so interview questions sound clearer and stronger.
    utter.volume = 1.0;
    utter.rate = 0.92;
    utter.pitch = 1.0;
    // Prefer a female voice
    const voices = window.speechSynthesis.getVoices();
    const female = voices.find(v => /zira|female|samantha|karen/i.test(v.name));
    if (female) utter.voice = female;
    window.speechSynthesis.speak(utter);
}

function getVoices() {
    if (!tts.supported) return;
    try { tts.voices = window.speechSynthesis.getVoices(); } catch (e) { console.warn("TTS voices error:", e); }
}

function initTts() {
    if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
        tts.supported = true;
        window.speechSynthesis.onvoiceschanged = getVoices;
        getVoices();
    }
}
initTts();

// ═══════════════════════════════════════════════════════════════════════════
//  WEBCAM
// ═══════════════════════════════════════════════════════════════════════════
async function startWebcam() {
    const mediaError = $("mediaError");
    try {
        let videoConstraints = { facingMode: "user" };
        const resPref = window.__prefRes;
        if (resPref === "480p") videoConstraints = { facingMode: "user", width: { ideal: 854 }, height: { ideal: 480 } };
        else if (resPref === "1080p") videoConstraints = { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } };
        else videoConstraints = { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };

        mediaStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
        videoPreview.srcObject = mediaStream;
        if (mediaError) hide(mediaError);
        videoPreview.style.display = "block";
        videoPreview.play().catch(err => console.warn("Video play failed:", err));
    } catch (e) {
        console.warn("Webcam/mic access denied:", e);
        if (mediaError) {
            show(mediaError);
            videoPreview.style.display = "none";
            const errTitle = mediaError.querySelector(".media-error__title");
            const errText = mediaError.querySelector(".media-error__text");
            if (e.name === "NotAllowedError") {
                if (errTitle) errTitle.textContent = "Camera Access Denied";
                if (errText) errText.textContent = "You denied camera/microphone access. Please allow it in your browser settings and reload.";
            } else if (e.name === "NotFoundError") {
                if (errTitle) errTitle.textContent = "No Camera Found";
                if (errText) errText.textContent = "No camera or microphone detected. Please connect one and reload.";
            }
        }
    }
}

function stopWebcam() {
    stopTranscriptionStream();
    stopLiveTranscript();
    stopRecordingTimer();
    setRecordingUI(false);
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
        videoPreview.srcObject = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOAD ROLES ON PAGE LOAD
// ═══════════════════════════════════════════════════════════════════════════
(async function loadRoles() {
    if (!roleSelect) return;
    try {
        const data = await api("/api/roles");
        roleSelect.innerHTML = "";
        for (const r of data.roles) {
            const opt = document.createElement("option");
            opt.value = r; opt.textContent = r;
            roleSelect.appendChild(opt);
        }
        try {
            const prefs = JSON.parse(localStorage.getItem("preploom_prefs"));
            if (prefs && prefs.defaultRole) roleSelect.value = prefs.defaultRole;
        } catch (e) { /* ignore */ }
    } catch (e) {
        roleSelect.innerHTML =
            '<option value="Data Scientist">Data Scientist</option>' +
            '<option value="AI ML Engineer">AI ML Engineer</option>';
    }
})();

// ═══════════════════════════════════════════════════════════════════════════
//  APPLY SAVED PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════
function applyAppSettings() {
    try {
        const prefs = typeof PrepLoom !== "undefined"
            ? PrepLoom.getPrefs()
            : JSON.parse(localStorage.getItem("preploom_prefs") || "{}");

        if (prefs.defaultRole && roleSelect) roleSelect.value = prefs.defaultRole;
        if (prefs.prefTts !== undefined && ttsCheckbox) ttsCheckbox.checked = prefs.prefTts;
        if (prefs.prefIdeal !== undefined && showIdealCheck) showIdealCheck.checked = prefs.prefIdeal;
        if (prefs.prefCode !== undefined) window.__prefCodeEditor = prefs.prefCode;
        if (prefs.prefLiveTranscript !== undefined) window.__prefLiveTranscript = prefs.prefLiveTranscript;
        if (prefs.prefAutoPosture !== undefined) window.__prefAutoPosture = prefs.prefAutoPosture;
        if (prefs.prefSummary !== undefined) window.__prefSummary = prefs.prefSummary;
        if (prefs.prefRes) window.__prefRes = prefs.prefRes;
        if (prefs.prefFps) window.__prefFps = prefs.prefFps;
    } catch (e) {
        console.warn("PrepLoom: Could not apply app settings:", e);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    applyAppSettings();
});

// ═══════════════════════════════════════════════════════════════════════════
//  START INTERVIEW
// ═══════════════════════════════════════════════════════════════════════════
if (startBtn) {
    startBtn.addEventListener("click", async () => {
        const role = roleSelect.value;
        if (!role) return alert("Please select a role first.");

        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="spinner"></span> Starting…';

        try {
            const data = await api("/api/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, name: candidateName.value }),
            });

            sessionId = data.session_id;
            totalQuestions = data.total_questions;
            currentQuestion = data.question;

            resetInterviewUI();
            renderQuestion(currentQuestion);
            switchView(interviewView);
            setStatus(true);
            await startWebcam();
            if (window.__prefAutoPosture !== false) startContinuousAnalysis();
            enableControls(true);
            speak(currentQuestion.question_text);
        } catch (e) {
            alert("Could not start interview: " + e.message);
        } finally {
            startBtn.disabled = false;
            startBtn.innerHTML = "▶ Start";
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  END INTERVIEW
// ═══════════════════════════════════════════════════════════════════════════
if (endBtn) {
    endBtn.addEventListener("click", async () => {
        if (!sessionId) return;
        if (isRecording) await stopAnswerRecording();
        stopWebcam();
        if (isAnalyzingContinuous) stopContinuousAnalysis();
        window.speechSynthesis.cancel();
        setStatus(false);
        enableControls(false);
        await showReport();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER QUESTION
// ═══════════════════════════════════════════════════════════════════════════
function renderQuestion(q) {
    const bubbleText =
        questionBubble.querySelector(".q-bubble-text") ||
        questionBubble.querySelector(".q-card__text");

    if (bubbleText && bubbleText !== questionBubble) {
        bubbleText.textContent = q.question_text;
    } else {
        questionBubble.textContent = q.question_text;
    }

    kpiRole.textContent = q.role_tag;
    kpiQ.textContent = (q.index + 1) + "/" + totalQuestions;
    kpiLevel.textContent = q.difficulty_level;
    kpiTopic.textContent = q.subtopic;

    if (codeToggleBtn) {
        show(codeToggleBtn);
        codeToggleBtn.textContent = "💻 Code Editor";
    }

    // Auto-open editor for coding questions, close for others
    if (isCodingQuestion(q)) {
        showCodeEditor();
    } else {
        hideCodeEditor();
    }
}

function resetInterviewUI() {
    lastAnswer = "";
    answerDuration = 0;
    bodyLanguageData = null;
    liveTranscriptFinal = "";
    updateTranscript("");
    hide(transcriptArea); hide(sttStatus); hide(feedbackScores);
    nextBtn.disabled = true;
    show(feedbackContent);
    feedbackContent.innerHTML = '<p class="eval-panel__prompt">Speak or type your answer, then Submit for evaluation.</p>';
    hide(idealAnswer); hide(bodyMetrics); hide(blSummary);
    showIdealCheck.checked = false;
    typeInput.value = "";
    stopLiveTranscript();
    stopRecordingTimer();
    setRecordingUI(false);

    if (isAnalyzingContinuous) {
        stopContinuousAnalysis();
    }
    setLiveAnalysisState(false);
}

function enableControls(on) {
    speakBtn.disabled = !on;
    continuousAnalysisBtn.disabled = !on;
    typeInput.disabled = !on;
    sendTypedBtn.disabled = !on;
    submitBtn.disabled = true;
    nextBtn.disabled = true;
    repeatBtn.disabled = !on;
    setSpeakButtonState(false);
    setLiveAnalysisState(isAnalyzingContinuous);
    if (on && codeToggleBtn) show(codeToggleBtn);
    if (!on && codeToggleBtn) hide(codeToggleBtn);
}

function updateSubmitState() {
    let codeSubmission = "";
    if (isCodeEditorVisible && preploomCodeEditor) {
        codeSubmission = preploomCodeEditor.getValue();
        const isTemplate = Object.values(CODE_TEMPLATES).some(t => t.trim() === codeSubmission.trim());
        if (isTemplate) codeSubmission = "";
    }
    submitBtn.disabled = isRecording || (!lastAnswer.trim() && !codeSubmission.trim());
}

// ═══════════════════════════════════════════════════════════════════════════
//  LIVE SPEECH-TO-TEXT (Web Speech API)
// ═══════════════════════════════════════════════════════════════════════════
function startLiveTranscript() {
    if (!SpeechRecognitionCtor) return false;

    liveTranscriptFinal = "";
    recognitionRestartRequested = true;
    liveRecognition = new SpeechRecognitionCtor();
    liveRecognition.lang = "en-US";
    liveRecognition.continuous = true;
    liveRecognition.interimResults = true;

    liveRecognition.onresult = (event) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0]?.transcript || "";
            if (result.isFinal) liveTranscriptFinal = `${liveTranscriptFinal} ${text}`.trim();
            else interimTranscript += text;
        }
        const transcript = `${liveTranscriptFinal} ${interimTranscript}`.trim();
        if (!transcript) return;
        lastAnswer = transcript;
        updateTranscript(transcript);
        updateSubmitState();
    };

    liveRecognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            recognitionRestartRequested = false;
            sttStatus.className = "stt-status transcribing";
            sttStatus.textContent = "Live transcript preview is unavailable in this browser session.";
            show(sttStatus);
        }
    };

    liveRecognition.onend = () => {
        if (!isRecording || !recognitionRestartRequested) { liveRecognition = null; return; }
        try { liveRecognition.start(); } catch (e) { console.warn("Speech recognition restart skipped:", e); }
    };

    try { liveRecognition.start(); return true; }
    catch (e) { liveRecognition = null; return false; }
}

function stopLiveTranscript() {
    recognitionRestartRequested = false;
    if (!liveRecognition) return;
    try { liveRecognition.stop(); } catch (e) { console.warn("Speech recognition stop skipped:", e); }
    liveRecognition = null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIO RECORDING
// ═══════════════════════════════════════════════════════════════════════════
async function startAnswerRecording() {
    if (!mediaStream) { alert("Microphone not available. Please allow mic access."); return; }
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) { alert("Microphone track not found. Please refresh and allow mic access."); return; }

    audioChunks = []; answerDuration = 0; liveTranscriptFinal = ""; lastAnswer = "";
    updateTranscript(""); hide(transcriptArea); updateSubmitState();

    if (!isAnalyzingContinuous) startContinuousAnalysis();

    sttStatus.className = "stt-pill";
    sttStatus.textContent = "🎙️ Recording now. Speak naturally and click again to stop.";
    show(sttStatus);

    const liveTranscriptStarted = startLiveTranscript();
    if (!liveTranscriptStarted) {
        sttStatus.textContent = "Recording now. Live transcript preview is unavailable, but final transcription will still appear after you stop.";
    }

    const audioStream = new MediaStream([audioTrack]);
    try {
        mediaRecorder = new MediaRecorder(audioStream, { mimeType: "audio/webm" });
    } catch (e) {
        mediaRecorder = new MediaRecorder(audioStream);
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };

    recordingStartTime = Date.now();
    setRecordingUI(true, 0);
    startRecordingTimer();
    mediaRecorder.start(1000);
    updateSubmitState();
}

async function stopAnswerRecording() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;

    const recordingDone = new Promise(resolve => { mediaRecorder.onstop = resolve; });
    mediaRecorder.stop();
    stopLiveTranscript();
    stopRecordingTimer();
    await recordingDone;

    const vc = $("videoContainer");
    const recBadge = $("recBadge");
    if (vc) vc.classList.remove("recording-active");
    if (recBadge) hide(recBadge);

    answerDuration = Math.max(1, (Date.now() - recordingStartTime) / 1000);
    recordingStartTime = 0;
    setRecordingUI(false);

    sttStatus.className = "stt-status transcribing";
    sttStatus.textContent = "Transcribing with Whisper…";
    show(sttStatus);
    updateSubmitState();

    try {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const wavBlob = await convertToWav(audioBlob);

        const formData = new FormData();
        formData.append("audio", wavBlob, "recording.wav");

            const data = await api("/api/transcribe", { method: "POST", body: formData });
            if (requestId !== activeTranscriptionRequestId) return;

            const transcript = (data.transcript || "").trim();

        if (transcript) {
            lastAnswer = transcript;
            updateTranscript(transcript);
            sttStatus.className = "stt-status done";
            sttStatus.textContent = "Transcription complete.";
        } else if (lastAnswer.trim()) {
            sttStatus.className = "stt-status done";
            sttStatus.textContent = "Live transcript captured. Final transcription returned empty.";
        } else {
            sttStatus.className = "stt-status recording";
            sttStatus.textContent = "No speech detected. Try again and speak a bit louder.";
        }
    } catch (e) {
        sttStatus.className = "stt-status recording";
        sttStatus.textContent = "Transcription failed: " + e.message;
    } finally {
        mediaRecorder = null;
        updateSubmitState();
    }
}

// ─── Speak answer button ──────────────────────────────────────────────────
if (speakBtn) {
    speakBtn.addEventListener("click", async () => {
        if (isRecording) { await stopAnswerRecording(); return; }
        if (!mediaStream) { alert("Microphone not available. Please allow mic access."); return; }
        await startAnswerRecording();
    });
}

// ─── WAV conversion ───────────────────────────────────────────────────────
async function convertToWav(webmBlob) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await webmBlob.arrayBuffer();
    let audioBuffer;
    try { audioBuffer = await audioCtx.decodeAudioData(arrayBuffer); }
    catch { return webmBlob; }

    const sampleRate = 16000;
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * sampleRate, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    const samples = rendered.getChannelData(0);
    audioCtx.close();
    return new Blob([encodeWAV(samples, sampleRate)], { type: "audio/wav" });
}

function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const ws = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    ws(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true);
    ws(8, "WAVE"); ws(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ws(36, "data"); view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TYPE ANSWER
// ═══════════════════════════════════════════════════════════════════════════
function submitTypedAnswer() {
    const text = typeInput.value.trim();
    if (!text) return;
    lastAnswer = text;
    answerDuration = Math.max(1.0, text.split(/\s+/).length / 2.5);
    updateTranscript(text);
    typeInput.value = "";
    updateSubmitState();
}

if (sendTypedBtn) sendTypedBtn.addEventListener("click", submitTypedAnswer);
if (typeInput) {
    typeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitTypedAnswer(); } });
    typeInput.addEventListener("input", (e) => { lastAnswer = e.target.value; updateSubmitState(); });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHOW IDEAL ANSWER
// ═══════════════════════════════════════════════════════════════════════════
if (showIdealCheck) {
    showIdealCheck.addEventListener("change", () => {
        if (showIdealCheck.checked && currentQuestion && currentQuestion.ideal_answer) {
            idealText.textContent = currentQuestion.ideal_answer;
            idealText.classList.add("open");
            show(idealAnswer);
        } else {
            idealText.classList.remove("open");
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANALYZE POSTURE (snapshot)
// ═══════════════════════════════════════════════════════════════════════════
if (postureBtn) {
    postureBtn.addEventListener("click", async () => {
        if (!mediaStream) return;
        postureBtn.disabled = true;
        postureBtn.innerHTML = '<span class="spinner"></span> Analyzing…';
        try {
            const video = videoPreview;
            const targetWidth = 640;
            const targetHeight = video.videoWidth
                ? Math.floor(video.videoHeight * (targetWidth / video.videoWidth))
                : 480;
            snapshotCanvas.width = targetWidth;
            snapshotCanvas.height = targetHeight;
            snapshotCanvas.getContext("2d").drawImage(video, 0, 0, targetWidth, targetHeight);

            const blob = await new Promise(resolve => snapshotCanvas.toBlob(resolve, "image/jpeg", 0.9));
            const formData = new FormData();
            formData.append("image", blob, "snapshot.jpg");

            const data = await api("/api/analyze-posture", { method: "POST", body: formData });
            bodyLanguageData = data;

            if (data.error) {
                blSummary.textContent = "⚠️ " + (data.summary || data.error);
                show(blSummary); hide(bodyMetrics);
            } else {
                const pr = data.probabilities || data;
                metricOpenness.textContent = Math.round((pr.openness || 0) * 100) + "%";
                metricFidgeting.textContent = Math.round((pr.fidgeting || 0) * 100) + "%";
                metricEngage.textContent = Math.round((pr.engagement || 0) * 100) + "%";
                metricPosture.textContent = Math.round((pr.posture || 0) * 100) + "%";
                show(bodyMetrics);
                if (data.summary) { blSummary.textContent = data.summary; show(blSummary); }
            }
        } catch (e) {
            blSummary.textContent = "❌ " + e.message; show(blSummary);
        } finally {
            postureBtn.disabled = false;
            postureBtn.innerHTML = "📊 Snapshot";
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONTINUOUS POSTURE ANALYSIS (WebSocket)
// ═══════════════════════════════════════════════════════════════════════════
let continuousAnalysisSocket = null;
let isAnalyzingContinuous = false;
let frameIntervalId = null;
let isProcessingFrame = false;

async function startContinuousAnalysis() {
    if (isAnalyzingContinuous || !mediaStream) return;

    const video = videoPreview;
    if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
        blSummary.textContent = "⏳ Waiting for video feed…"; show(blSummary);
        let retries = 0;
        while (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA && retries < 30) {
            await new Promise(r => setTimeout(r, 100)); retries++;
        }
        if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
            blSummary.textContent = "❌ Video feed not ready"; return;
        }
    }

    isAnalyzingContinuous = true;
    setLiveAnalysisState(true);
    blSummary.textContent = "🔄 Starting continuous analysis…"; show(blSummary);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/analyze-posture`;

    try {
        continuousAnalysisSocket = new WebSocket(wsUrl);

        continuousAnalysisSocket.onopen = () => {
            console.log("[PrepLoom] Video analysis WebSocket opened");
            blSummary.textContent = "✅ Live analysis active";
            show(bodyMetrics); show(blSummary);
            isProcessingFrame = false;
            // Small delay to ensure everything is settled
            setTimeout(startFrameCapture, 200);
        };

        continuousAnalysisSocket.onmessage = (event) => {
            isProcessingFrame = false;
            try {
                const data = JSON.parse(event.data);
                if (data.error) { 
                    console.warn("[PrepLoom] Analysis error:", data.error); 
                    blSummary.textContent = "⚠️ " + data.error;
                    return; 
                }
                const pr = data.probabilities || data;
                if (pr.openness !== undefined) metricOpenness.textContent = Math.round((pr.openness || 0) * 100) + "%";
                if (pr.fidgeting !== undefined) metricFidgeting.textContent = Math.round((pr.fidgeting || 0) * 100) + "%";
                if (pr.engagement !== undefined) metricEngage.textContent = Math.round((pr.engagement || 0) * 100) + "%";
                if (pr.posture !== undefined) metricPosture.textContent = Math.round((pr.posture || 0) * 100) + "%";
                if (data.summary) blSummary.textContent = "✅ " + data.summary;
                bodyLanguageData = data;
            } catch (e) { console.error("[PrepLoom] Failed to parse WS message:", e); }
        };

        continuousAnalysisSocket.onerror = (error) => {
            isProcessingFrame = false;
            console.error("[PrepLoom] WebSocket error:", error);
            blSummary.textContent = "❌ Connection error";
        };

        continuousAnalysisSocket.onclose = (event) => {
            console.log("[PrepLoom] Video analysis WebSocket closed:", event.code, event.reason);
            if (isAnalyzingContinuous) {
                // If an error message is already displayed, don't overwrite it.
                if (blSummary.textContent.startsWith("⚠️")) {
                    stopContinuousAnalysis();
                    return;
                }
                // If it wasn't a clean close, show a message but don't loop rapidly
                if (event.code !== 1000 && event.code !== 1001) {
                    blSummary.textContent = "❌ Connection lost. Re-enabling...";
                    setTimeout(() => {
                        if (isAnalyzingContinuous) stopContinuousAnalysis();
                    }, 2000);
                } else {
                    stopContinuousAnalysis();
                }
            }
        };
    } catch (e) {
        blSummary.textContent = "❌ Could not connect: " + e.message;
        isAnalyzingContinuous = false;
        setLiveAnalysisState(false);
    }
}

function stopContinuousAnalysis() {
    isAnalyzingContinuous = false; isProcessingFrame = false;
    if (frameIntervalId) { clearInterval(frameIntervalId); frameIntervalId = null; }
    if (continuousAnalysisSocket) { continuousAnalysisSocket.close(); continuousAnalysisSocket = null; }
    blSummary.textContent = "⏸️ Analysis paused";
}

function startFrameCapture() {
    if (frameIntervalId) clearInterval(frameIntervalId);
    let intervalMs = 67;
    const fpsPref = window.__prefFps;
    if (fpsPref === "5 FPS (battery-saver)") intervalMs = 200;
    else if (fpsPref === "30 FPS (high detail)") intervalMs = 33;

    frameIntervalId = setInterval(() => {
        if (!mediaStream || !continuousAnalysisSocket || continuousAnalysisSocket.readyState !== WebSocket.OPEN) return;
        
        // Safety: reset processing lock if it's been held for more than 1 second
        if (isProcessingFrame && (Date.now() - (window._lastFrameSentTime || 0) > 1000)) {
            console.warn("[PrepLoom] Video analysis lock reset due to timeout");
            isProcessingFrame = false;
        }

        if (isProcessingFrame) return;
        isProcessingFrame = true;
        window._lastFrameSentTime = Date.now();

        try {
            const video = videoPreview;
            if (!video || video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA ||
                video.videoWidth === 0 || video.videoHeight === 0) {
                isProcessingFrame = false; return;
            }
            snapshotCanvas.width = 640;
            snapshotCanvas.height = 480;
            snapshotCanvas.getContext("2d").drawImage(video, 0, 0, 640, 480);

            snapshotCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(",")[1];
                    if (continuousAnalysisSocket && continuousAnalysisSocket.readyState === WebSocket.OPEN) {
                        continuousAnalysisSocket.send(JSON.stringify({ frame: base64 }));
                    } else {
                        isProcessingFrame = false;
                    }
                };
                reader.onerror = () => { isProcessingFrame = false; };
                reader.readAsDataURL(blob);
            }, "image/jpeg", 0.6);
        } catch (e) {
            console.error("Frame capture error:", e); isProcessingFrame = false;
        }
    }, intervalMs);
}

if (continuousAnalysisBtn) {
    continuousAnalysisBtn.addEventListener("click", () => {
        if (isAnalyzingContinuous) { stopContinuousAnalysis(); setLiveAnalysisState(false); }
        else { startContinuousAnalysis(); setLiveAnalysisState(true); }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBMIT ANSWER
// ═══════════════════════════════════════════════════════════════════════════
if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
        let codeSubmission = "";
        if (isCodeEditorVisible && preploomCodeEditor) {
            codeSubmission = preploomCodeEditor.getValue();
            const isTemplate = Object.values(CODE_TEMPLATES).some(t => t.trim() === codeSubmission.trim());
            if (isTemplate) codeSubmission = "";
        }

        if ((!lastAnswer.trim() && !codeSubmission.trim()) || !sessionId) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Evaluating…';

        try {
            const data = await api("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    answer: lastAnswer,
                    duration: answerDuration,
                    body_language: bodyLanguageData,
                    code_submission: codeSubmission,
                }),
            });
            renderFeedback(data.evaluation);
        } catch (e) {
            feedbackContent.innerHTML = `<p class="caption" style="color:var(--red);">❌ ${e.message}</p>`;
            show(feedbackContent);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "✅ Submit";
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEXT QUESTION
// ═══════════════════════════════════════════════════════════════════════════
if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
        if (!sessionId) return;
        nextBtn.disabled = true;
        try {
            const data = await api("/api/next", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });

            if (data.done) {
                stopWebcam(); setStatus(false); enableControls(false); await showReport();
            } else {
                currentQuestion = data.question;
                resetInterviewUI();
                renderQuestion(currentQuestion);
                updateSubmitState();
                speak(currentQuestion.question_text);
            }
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            nextBtn.disabled = false;
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  REPEAT QUESTION
// ═══════════════════════════════════════════════════════════════════════════
if (repeatBtn) repeatBtn.addEventListener("click", () => { if (currentQuestion) speak(currentQuestion.question_text); });

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════
function renderFeedback(ev) {
    hide(feedbackContent);
    show(feedbackScores);

    const ts = ev.technical_score || 0;
    const cs = ev.communication_score || 0;
    const cfs = ev.confidence_score;
    const parts = [ts, cs];
    if (cfs != null) parts.push(cfs);
    const ov = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

    scoreRow.innerHTML = `
        <span class="score-pill ${scoreColor(ov)}" style="font-size:0.9rem;padding:10px 24px;border-width:2px;">
            🎯 Final Assessment: ${ov}% Overall Match
        </span>`;

    const techGrowth = [
        ...(ev.missing_points || []).map(m => ({ icon: "❓", text: m, type: "neg" })),
        ...(ev.improvements || []).map(imp => ({ icon: "🚀", text: imp, type: "warn" })),
    ];

    feedbackDetails.innerHTML = `
        <div style="margin-bottom:20px;">
            <p style="font-style:italic;color:var(--text);font-size:1.05rem;line-height:1.6;">"${ev.short_feedback || ""}"</p>
        </div>
        <div class="fb-table-wrap">
            <table class="fb-table">
                <thead>
                    <tr>
                        <th style="width:150px;">Evaluation Criteria</th>
                        <th style="text-align:center;border-left:1px solid var(--border-md);">📚 Technical Depth</th>
                        <th style="text-align:center;border-left:1px solid var(--border-md);">🗣️ Communication</th>
                        <th style="text-align:center;border-left:1px solid var(--border-md);">📹 Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="fb-dim-cell">Performance Score</td>
                        <td style="text-align:center;border-left:1px solid var(--border);">
                            <span class="score-pill ${scoreColor(ts)}" style="font-size:1.1rem;min-width:60px;justify-content:center;">${ts}%</span>
                        </td>
                        <td style="text-align:center;border-left:1px solid var(--border);">
                            <span class="score-pill ${scoreColor(cs)}" style="font-size:1.1rem;min-width:60px;justify-content:center;">${cs}%</span>
                        </td>
                        <td style="text-align:center;border-left:1px solid var(--border);">
                            <span class="score-pill ${cfs != null ? scoreColor(cfs) : ""}" style="font-size:1.1rem;min-width:60px;justify-content:center;">${cfs != null ? cfs + "%" : "—"}</span>
                        </td>
                    </tr>
                    <tr>
                        <td class="fb-dim-cell">Key Strengths</td>
                        <td style="border-left:1px solid var(--border);">
                            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                ${(ev.strengths || []).map(s => `
                                    <div class="fb-pill-item" style="background:rgba(34,197,94,0.06);padding:5px 10px;border-radius:6px;border:1px solid rgba(34,197,94,0.12);">
                                        <span class="fb-pill-icon">✅</span>
                                        <span class="fb-pill-text pos">${s}</span>
                                    </div>`).join("") || "—"}
                            </div>
                        </td>
                        <td style="border-left:1px solid var(--border);">
                            <div style="display:flex;flex-direction:column;gap:8px;">
                                <div class="fb-pill-item"><span class="fb-pill-icon">⚡</span><span class="fb-pill-text neu">Pace: <b>${ev.wpm || 0} WPM</b></span></div>
                                <div class="fb-pill-item"><span class="fb-pill-icon">📉</span><span class="fb-pill-text neu">Fillers: <b>${ev.filler_count || 0}</b></span></div>
                            </div>
                        </td>
                        <td style="border-left:1px solid var(--border);">
                            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                ${(ev.bl_observations || []).slice(0, 2).map(ob => `
                                    <div class="fb-pill-item" style="background:rgba(108,99,255,0.06);padding:5px 10px;border-radius:6px;border:1px solid rgba(108,99,255,0.12);">
                                        <span class="fb-pill-icon">👁️</span>
                                        <span class="fb-pill-text neu">${ob}</span>
                                    </div>`).join("") || (cfs != null ? "✅ Stable presence" : "—")}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td class="fb-dim-cell">Areas for Growth</td>
                        <td style="border-left:1px solid var(--border);">
                            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                ${techGrowth.map(g => `
                                    <div class="fb-pill-item" style="background:rgba(255,255,255,0.03);padding:5px 10px;border-radius:6px;border:1px solid var(--border);">
                                        <span class="fb-pill-icon">${g.icon}</span>
                                        <span class="fb-pill-text ${g.type}">${g.text}</span>
                                    </div>`).join("") || "—"}
                            </div>
                        </td>
                        <td style="border-left:1px solid var(--border);">
                            ${ev.comm_details ? `
                                <div class="fb-pill-item" style="background:rgba(255,255,255,0.03);padding:5px 10px;border-radius:6px;border:1px solid var(--border);">
                                    <span class="fb-pill-icon">💬</span>
                                    <span class="fb-pill-text neu">${ev.comm_details}</span>
                                </div>` : "—"}
                        </td>
                        <td style="border-left:1px solid var(--border);">
                            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                ${(ev.bl_observations || []).slice(2, 4).map(ob => `
                                    <div class="fb-pill-item" style="background:rgba(245,158,11,0.06);padding:5px 10px;border-radius:6px;border:1px solid rgba(245,158,11,0.12);">
                                        <span class="fb-pill-icon">👁️</span>
                                        <span class="fb-pill-text warn">${ob}</span>
                                    </div>`).join("") || (ev.bl_summary ? `
                                    <div class="fb-pill-item" style="background:rgba(255,255,255,0.03);padding:5px 10px;border-radius:6px;border:1px solid var(--border);">
                                        <span class="fb-pill-icon">📹</span>
                                        <span class="fb-pill-text neu">${ev.bl_summary}</span>
                                    </div>` : "—")}
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>`;

    nextBtn.disabled = false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  REPORT
// ═══════════════════════════════════════════════════════════════════════════
async function showReport() {
    try {
        const data = await api(`/api/report/${sessionId}`);
        renderReport(data);
        switchView(reportView);
    } catch (e) {
        alert("Could not load report: " + e.message);
    }
}

function renderReport(r) {
    currentReportId = r.report_id || null;
    reportSub.textContent = `Candidate: ${r.name || "—"} | Role: ${r.role} | Questions answered: ${r.total_answered}`;
    if (downloadReportBtn) {
        downloadReportBtn.classList.toggle("hidden", !r.pdf_available);
        downloadReportBtn.dataset.reportId = r.report_id || "";
    }
    reportScores.innerHTML = `
        <div class="score-card"><div class="value" style="color:var(--accent)">${r.overall}</div><div class="label">Overall Score</div></div>
        <div class="score-card"><div class="value" style="color:var(--green)">${r.avg_technical}</div><div class="label">Technical</div></div>
        <div class="score-card"><div class="value" style="color:var(--amber)">${r.avg_communication}</div><div class="label">Communication</div></div>
        <div class="score-card"><div class="value" style="color:#818cf8">${r.avg_confidence}</div><div class="label">Confidence</div></div>`;

    reportBreakdown.innerHTML = r.evaluations.map((ev, i) => {
        const qText = (ev.question_text || "—").slice(0, 80);
        return `
        <div class="breakdown-card">
            <div class="breakdown-header" onclick="toggleBreakdown(this)">
                <span>Q${i + 1}: ${qText}…</span>
                <span class="arrow">▼</span>
            </div>
            <div class="breakdown-body">
                <div class="breakdown-scores">
                    <div class="bs-item"><div class="bs-val" style="color:var(--green)">${ev.technical_score ?? "—"}</div><div class="bs-lbl">Technical</div></div>
                    <div class="bs-item"><div class="bs-val" style="color:var(--amber)">${ev.communication_score ?? "—"}</div><div class="bs-lbl">Communication</div></div>
                    <div class="bs-item"><div class="bs-val" style="color:#818cf8">${ev.confidence_score ?? "—"}</div><div class="bs-lbl">Confidence</div></div>
                </div>
                ${ev.short_feedback ? `<p class="caption">💬 ${ev.short_feedback}</p>` : ""}
                ${ev.strengths?.length ? `<p><strong>Strengths:</strong> ${ev.strengths.slice(0, 3).join(", ")}</p>` : ""}
                ${ev.improvements?.length ? `<p><strong>Improvements:</strong> ${ev.improvements.slice(0, 3).join(", ")}</p>` : ""}
                ${ev.comm_details ? `<p class="caption">🗣️ ${ev.comm_details}</p>` : ""}
                ${ev.bl_summary ? `<p class="caption">📹 ${ev.bl_summary}</p>` : ""}
            </div>
        </div>`;
    }).join("");

    reportTips.innerHTML = r.tips.map(t => `<div class="tip-item">${t}</div>`).join("");

    const reportAuthMessage = document.getElementById("reportAuthMessage");
    if (reportAuthMessage) {
        if (!getPreploomToken()) {
            reportAuthMessage.innerHTML = "This report is not saved. Sign in to save future reports.";
            reportAuthMessage.style.display = "block";
        } else {
            reportAuthMessage.style.display = "none";
        }
    }
}

function toggleBreakdown(header) {
    header.classList.toggle("open");
    header.nextElementSibling.classList.toggle("open");
}

async function downloadReportPdf(reportId) {
    if (!reportId) return alert("Report download is not available.");
    try {
        const blob = await apiDownload(`/api/user/reports/${reportId}/download`);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = `interview_report_${reportId}.pdf`;
        document.body.appendChild(link); link.click(); link.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Could not download PDF: " + e.message);
    }
}

function renderReportsHistory(reports) {
    if (!reports || !reports.length) {
        reportsList.innerHTML = `<div class="panel" style="padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);">No saved reports found. Complete an interview while signed in to see them here.</div>`;
        return;
    }
    reportsList.innerHTML = reports.map(report => {
        const date = report.created_at ? new Date(report.created_at).toLocaleString() : "Unknown date";
        return `
        <div class="panel" style="padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);">
            <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap;">
                <div>
                    <div style="font-weight:700;margin-bottom:0.25rem;">${report.role || "Interview Report"}</div>
                    <div style="font-size:0.9rem;color:var(--muted);">${report.candidate_name || "Candidate"} · ${date}</div>
                </div>
                <div style="text-align:right;min-width:150px;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent);">${report.overall_score ?? "—"}</div>
                    <div style="font-size:0.85rem;color:var(--muted);">Overall Score</div>
                </div>
            </div>
            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1rem;">
                <button class="act-btn act-btn--submit download-saved-report" data-report-id="${report.id}" style="min-width:150px;">Download PDF</button>
                <div style="padding:0.75rem 1rem;background:rgba(255,255,255,0.04);border-radius:var(--r-sm);flex:1;min-width:220px;">
                    <div style="font-size:0.85rem;color:var(--muted);">Tech ${report.avg_technical ?? "—"} · Comm ${report.avg_communication ?? "—"} · Conf ${report.avg_confidence ?? "—"}</div>
                </div>
            </div>
        </div>`;
    }).join("");
}

async function showSavedReports() {
    try {
        const data = await api("/api/user/reports");
        renderReportsHistory(data.reports || []);
        switchView(reportsHistoryView);
    } catch (e) {
        reportsList.innerHTML = `<div class="panel" style="padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);">Error loading reports: ${e.message}</div>`;
        switchView(reportsHistoryView);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEW INTERVIEW & misc buttons
// ═══════════════════════════════════════════════════════════════════════════
if (newInterviewBtn) {
    newInterviewBtn.addEventListener("click", () => {
        sessionId = null; currentQuestion = null; lastAnswer = ""; bodyLanguageData = null;
        switchView(welcomeView); setStatus(false);
    });
}

if (downloadReportBtn) downloadReportBtn.addEventListener("click", () => downloadReportPdf(downloadReportBtn.dataset.reportId));
if (openReportsBtn) openReportsBtn.addEventListener("click", showSavedReports);
if (backToReportsBtn) backToReportsBtn.addEventListener("click", () => switchView(reportView));

if (reportsList) {
    reportsList.addEventListener("click", (event) => {
        const button = event.target.closest(".download-saved-report");
        if (button) downloadReportPdf(button.dataset.reportId);
    });
}
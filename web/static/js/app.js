/**
 * PrepLoom — Client-side logic for the practice room.
 *
 * Drives the SPA: role loading, interview flow, audio recording,
 * webcam capture, posture analysis, TTS, and report rendering.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  DOM References
// ═══════════════════════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

const roleSelect      = $("roleSelect");
const candidateName   = $("candidateName");
const ttsCheckbox     = $("ttsCheckbox");
const startBtn        = $("startBtn");
const endBtn          = $("endBtn");
const statusDot       = $("statusDot");
const statusLabel     = $("statusLabel");

const welcomeView     = $("welcomeView");
const interviewView   = $("interviewView");
const reportView      = $("reportView");

// KPIs
const kpiRole  = $("kpiRole");
const kpiQ     = $("kpiQ");
const kpiLevel = $("kpiLevel");
const kpiTopic = $("kpiTopic");

// Video
const videoPreview    = $("videoPreview");
const snapshotCanvas  = $("snapshotCanvas");
const postureBtn      = $("postureBtn");
const continuousAnalysisBtn = $("continuousAnalysisBtn");
const liveStatusText  = $("liveStatusText");
const bodyMetrics     = $("bodyMetrics");
const metricOpenness  = $("metricOpenness");
const metricFidgeting = $("metricFidgeting");
const metricEngage    = $("metricEngage");
const metricPosture   = $("metricPosture");
const blSummary       = $("blSummary");

// Interview
const questionBubble  = $("questionBubble");
const speakBtn        = $("speakBtn");
const speakBtnText    = $("speakBtnText");
const showIdealCheck  = $("showIdealCheck");
const sttStatus       = $("sttStatus");
const transcriptArea  = $("transcriptArea");
const recordingIndicator = $("recordingIndicator");
const recordingTimer  = $("recordingTimer");
const idealAnswer     = $("idealAnswer");
const idealText       = $("idealText");
const typeInput       = $("typeInput");
const sendTypedBtn    = $("sendTypedBtn");
const submitBtn       = $("submitBtn");
const nextBtn         = $("nextBtn");
const repeatBtn       = $("repeatBtn");
const codeToggleBtn   = $("codeToggleBtn");
const codingWorkspace = $("codingWorkspace");
const codeLangSelect  = $("codeLangSelect");
const resetCodeBtn    = $("resetCodeBtn");
const monacoContainer = $("monacoEditorContainer");

// Feedback
const feedbackContent = $("feedbackContent");
const feedbackScores  = $("feedbackScores");
const scoreRow        = $("scoreRow");
const feedbackDetails = $("feedbackDetails");

// Report
const reportSub       = $("reportSub");
const reportScores    = $("reportScores");
const reportBreakdown = $("reportBreakdown");
const reportTips      = $("reportTips");
const downloadReportBtn = $("downloadReportBtn");
const openReportsBtn  = $("openReportsBtn");
const reportsHistoryView = $("reportsHistoryView");
const reportsList     = $("reportsList");
const backToReportsBtn = $("backToReportsBtn");
const newInterviewBtn = $("newInterviewBtn");

// ═══════════════════════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════════════════════
let sessionId       = null;
let currentQuestion = null;
let totalQuestions  = 0;
let lastAnswer      = "";
let answerDuration  = 0;
let bodyLanguageData= null;
let mediaStream     = null;
let mediaRecorder   = null;
let audioChunks     = [];
let isRecording     = false;
let recordingStartTime = 0;
let recordingTimerInterval = null;
let liveRecognition = null;
let recognitionRestartRequested = false;
let liveTranscriptFinal = "";
let currentReportId = null;

// Monaco Editor state
let preploomCodeEditor = null;
let monacoEditorReady = false;
let isCodeEditorVisible = false;

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════
function show(el)   { if (el) el.classList.remove("hidden"); }
function hide(el)   { if (el) el.classList.add("hidden"); }
function scoreColor(s) { return s >= 70 ? "green" : s >= 45 ? "amber" : "red"; }
function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Coding Question Detection (mirrors backend _is_coding logic)
// ═══════════════════════════════════════════════════════════════════════════
function isCodingQuestion(q) {
    if (!q) return false;
    const text = (q.question_text || "").toLowerCase();
    const topic = (q.subtopic || "").toLowerCase();

    const codingTopics = [
        "arrays & hashing", "two pointers", "linked lists", "stacks",
        "dynamic programming", "binary search", "trees"
    ];
    if (codingTopics.some(ct => topic.includes(ct))) return true;

    const phrases = [
        "write a function", "given an array", "singly linked list",
        "given the root", "linked list", "integer array", "return an array",
        "implement a", "write code", "write a program", "write a method",
        "coding question", "algorithm"
    ];
    return phrases.some(p => text.includes(p));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Monaco Editor Initialization & Controls
// ═══════════════════════════════════════════════════════════════════════════
const CODE_TEMPLATES = {
    python: '# Write your solution here\ndef solution():\n    pass\n',
    javascript: '// Write your solution here\nfunction solution() {\n    \n}\n',
    java: '// Write your solution here\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n',
    cpp: '// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    c: '// Write your solution here\n#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
    typescript: '// Write your solution here\nfunction solution(): void {\n    \n}\n',
    go: '// Write your solution here\npackage main\n\nfunc main() {\n    \n}\n',
    rust: '// Write your solution here\nfn main() {\n    \n}\n',
};

function getMonacoLang(value) {
    const map = { python: 'python', javascript: 'javascript', java: 'java', cpp: 'cpp', c: 'c', typescript: 'typescript', go: 'go', rust: 'rust' };
    return map[value] || 'python';
}

function initMonacoEditor(lang = 'python') {
    if (!monacoContainer) return;
    if (typeof monaco === 'undefined') {
        console.warn('Monaco editor not loaded yet');
        return;
    }

    if (preploomCodeEditor) {
        // Editor already exists, just update language
        const model = preploomCodeEditor.getModel();
        if (model) monaco.editor.setModelLanguage(model, getMonacoLang(lang));
        return;
    }

    const isDark = document.documentElement.classList.contains('theme-dark') ||
                   !document.documentElement.classList.contains('theme-light');

    preploomCodeEditor = monaco.editor.create(monacoContainer, {
        value: CODE_TEMPLATES[lang] || CODE_TEMPLATES.python,
        language: getMonacoLang(lang),
        theme: isDark ? 'vs-dark' : 'vs',
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        roundedSelection: true,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        wordWrap: 'on',
        tabSize: 4,
        insertSpaces: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
    });

    monacoEditorReady = true;

    // Update submit state when code changes
    preploomCodeEditor.onDidChangeModelContent(() => {
        updateSubmitState();
    });
}

function showCodeEditor() {
    if (!codingWorkspace) return;
    codingWorkspace.classList.remove('hidden');
    codingWorkspace.classList.add('slide-in');
    isCodeEditorVisible = true;
    if (codeToggleBtn) codeToggleBtn.classList.add('code-editor-active');

    const lang = codeLangSelect ? codeLangSelect.value : 'python';
    // Initialize Monaco after a brief delay to let the container become visible
    setTimeout(() => {
        initMonacoEditor(lang);
        if (preploomCodeEditor) preploomCodeEditor.layout();
    }, 100);
}

function hideCodeEditor() {
    if (!codingWorkspace) return;
    codingWorkspace.classList.add('hidden');
    codingWorkspace.classList.remove('slide-in');
    isCodeEditorVisible = false;
    if (codeToggleBtn) codeToggleBtn.classList.remove('code-editor-active');
}

function resetCodeEditor() {
    if (!preploomCodeEditor) return;
    const lang = codeLangSelect ? codeLangSelect.value : 'python';
    preploomCodeEditor.setValue(CODE_TEMPLATES[lang] || CODE_TEMPLATES.python);
}

// Language selector change
if (codeLangSelect) {
    codeLangSelect.addEventListener('change', () => {
        const lang = codeLangSelect.value;
        if (preploomCodeEditor) {
            const model = preploomCodeEditor.getModel();
            if (model && typeof monaco !== 'undefined') {
                monaco.editor.setModelLanguage(model, getMonacoLang(lang));
            }
            // Only reset if the editor has default/template content
            const currentVal = preploomCodeEditor.getValue().trim();
            const isTemplate = Object.values(CODE_TEMPLATES).some(t => t.trim() === currentVal);
            if (!currentVal || isTemplate) {
                preploomCodeEditor.setValue(CODE_TEMPLATES[lang] || CODE_TEMPLATES.python);
            }
        }
    });
}

// Reset button
if (resetCodeBtn) {
    resetCodeBtn.addEventListener('click', () => {
        if (confirm('Reset editor to template code?')) {
            resetCodeEditor();
        }
    });
}

// Code editor toggle button
if (codeToggleBtn) {
    codeToggleBtn.addEventListener('click', () => {
        if (isCodeEditorVisible) {
            hideCodeEditor();
        } else {
            showCodeEditor();
        }
    });
}

// Theme sync for Monaco
function syncMonacoTheme() {
    if (!preploomCodeEditor || typeof monaco === 'undefined') return;
    const isDark = document.documentElement.classList.contains('theme-dark') ||
                   !document.documentElement.classList.contains('theme-light');
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
}

// Watch for theme changes
const themeObserver = new MutationObserver(() => syncMonacoTheme());
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

const PREPLOOM_TOKEN_KEY = "preploom_token";

function getPreploomToken() {
    try {
        if (window.SB && typeof window.SB.getToken === "function") {
            return window.SB.getToken();
        }
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
                  ? d.map((x) => x.msg || JSON.stringify(x)).join(" ")
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
    if (text.trim()) {
        show(transcriptArea);
    }
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
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - recordingStartTime) / 1000));
        setRecordingUI(true, elapsedSeconds);
    }, 250);
}

function stopRecordingTimer() {
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TTS (browser speechSynthesis)
// ═══════════════════════════════════════════════════════════════════════════
const tts = {
  supported: false,
  voices: [],
};

function speak(text) {
  if (!tts.supported || !ttsCheckbox.checked || !text) return;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;

  if (tts.voices.length === 0) {
    getVoices();
  }

  const femaleVoice = tts.voices.find(v => /zira|female|samantha|karen/i.test(v.name));
  if (femaleVoice) {
    utter.voice = femaleVoice;
  }

  window.speechSynthesis.speak(utter);
}

function getVoices() {
  if (!tts.supported) return;
  try {
    tts.voices = window.speechSynthesis.getVoices();
  } catch (e) {
    console.warn("TTS: Could not get voices.", e);
  }
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
//  Webcam
// ═══════════════════════════════════════════════════════════════════════════
async function startWebcam() {
    const mediaError = document.getElementById('mediaError');
    try {
        let videoConstraints = { facingMode: "user" };
        // Apply saved resolution preference
        const resPref = window.__prefRes;
        if (resPref === '480p') {
            videoConstraints = { facingMode: "user", width: { ideal: 854 }, height: { ideal: 480 } };
        } else if (resPref === '1080p') {
            videoConstraints = { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } };
        } else {
            // 720p default
            videoConstraints = { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };
        }
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: true,
        });
        videoPreview.srcObject = mediaStream;
        if (mediaError) hide(mediaError);
        videoPreview.style.display = 'block';
        // Ensure video plays
        videoPreview.play().catch(err => console.warn("Video play failed:", err));
    } catch (e) {
        console.warn("Webcam/mic access denied:", e);
        if (mediaError) {
            show(mediaError);
            videoPreview.style.display = 'none';
            const errTitle = mediaError.querySelector('.media-error__title');
            const errText = mediaError.querySelector('.media-error__text');
            if (e.name === 'NotAllowedError') {
                if (errTitle) errTitle.textContent = 'Camera Access Denied';
                if (errText) errText.textContent = 'You denied camera/microphone access. Please allow it in your browser settings and reload.';
            } else if (e.name === 'NotFoundError') {
                if (errTitle) errTitle.textContent = 'No Camera Found';
                if (errText) errText.textContent = 'No camera or microphone detected. Please connect one and reload.';
            }
        }
    }
}

function stopWebcam() {
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
//  Load roles on page load
// ═══════════════════════════════════════════════════════════════════════════
(async function loadRoles() {
    if (!roleSelect) return;
    try {
        const data = await api("/api/roles");
        roleSelect.innerHTML = "";
        for (const r of data.roles) {
            const opt = document.createElement("option");
            opt.value = r;
            opt.textContent = r;
            roleSelect.appendChild(opt);
        }
        try {
            const prefs = JSON.parse(localStorage.getItem('preploom_prefs'));
            if (prefs && prefs.defaultRole) roleSelect.value = prefs.defaultRole;
        } catch(e) {}
    } catch (e) {
        roleSelect.innerHTML = '<option value="Data Scientist">Data Scientist</option><option value="AI ML Engineer">AI ML Engineer</option>';
    }
})();

// ═══════════════════════════════════════════════════════════════════════════
//  Apply App Settings
// ═══════════════════════════════════════════════════════════════════════════
function applyAppSettings() {
    try {
        const prefs = typeof PrepLoom !== 'undefined' ? PrepLoom.getPrefs() : JSON.parse(localStorage.getItem('preploom_prefs') || '{}');

        // 1. Role pre-selection
        if (prefs.defaultRole && roleSelect) {
            roleSelect.value = prefs.defaultRole;
        }

        // 2. TTS toggle
        if (prefs.prefTts !== undefined && ttsCheckbox) {
            ttsCheckbox.checked = prefs.prefTts;
        }

        // 3. Show ideal answers
        if (prefs.prefIdeal !== undefined && showIdealCheck) {
            showIdealCheck.checked = prefs.prefIdeal;
        }

        // 4. Code editor preference (stored for use when coding questions appear)
        if (prefs.prefCode !== undefined) {
            window.__prefCodeEditor = prefs.prefCode;
        }

        // 5. Live transcript preview
        if (prefs.prefLiveTranscript !== undefined) {
            window.__prefLiveTranscript = prefs.prefLiveTranscript;
        }

        // 6. Auto-enable posture
        if (prefs.prefAutoPosture !== undefined) {
            window.__prefAutoPosture = prefs.prefAutoPosture;
        }

        // 7. Body language summary display
        if (prefs.prefSummary !== undefined) {
            window.__prefSummary = prefs.prefSummary;
        }

        // 8. Camera resolution
        if (prefs.prefRes) {
            window.__prefRes = prefs.prefRes;
        }

        // 8b. Frame rate (FPS)
        if (prefs.prefFps) {
            window.__prefFps = prefs.prefFps;
        }

    } catch (e) {
        console.warn('PrepLoom: Could not apply app settings', e);
    }
}

window.addEventListener("DOMContentLoaded", applyAppSettings);
// ═══════════════════════════════════════════════════════════════════════════
//  START Interview
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
        if (window.__prefAutoPosture !== false) {
            startContinuousAnalysis();  // Auto-enable live video analysis unless disabled
        }
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
//  END Interview
// ═══════════════════════════════════════════════════════════════════════════
if (endBtn) {
    endBtn.addEventListener("click", async () => {
    if (!sessionId) return;
    if (isRecording) {
        await stopAnswerRecording();
    }
    stopWebcam();
    if (isAnalyzingContinuous) {
        stopContinuousAnalysis();
    }
    window.speechSynthesis.cancel();
    setStatus(false);
    enableControls(false);
    await showReport();
});
}

// ═══════════════════════════════════════════════════════════════════════════
//  Render question
// ═══════════════════════════════════════════════════════════════════════════
function renderQuestion(q) {
    // Support both old (.q-bubble-text child) and new (direct #questionBubble) DOM
    const bubbleText = questionBubble.querySelector(".q-bubble-text") || questionBubble.querySelector(".q-card__text");
    if (bubbleText && bubbleText !== questionBubble) {
        bubbleText.textContent = q.question_text;
    } else {
        questionBubble.textContent = q.question_text;
    }
    kpiRole.textContent  = q.role_tag;
    kpiQ.textContent     = (q.index + 1) + "/" + totalQuestions;
    kpiLevel.textContent = q.difficulty_level;
    kpiTopic.textContent = q.subtopic;

    // Always show the code editor toggle button so users can open it on any question
    if (codeToggleBtn) {
        show(codeToggleBtn);
        codeToggleBtn.textContent = '💻 Code Editor';
    }

    // Auto-detect coding questions and open the editor automatically
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
    hide(transcriptArea);
    hide(sttStatus);
    hide(feedbackScores);
    nextBtn.disabled = true;
    show(feedbackContent);
    feedbackContent.innerHTML = '<p class="eval-panel__prompt">Speak or type your answer, then Submit for evaluation.</p>';
    hide(idealAnswer);
    hide(bodyMetrics);
    hide(blSummary);
    showIdealCheck.checked = false;
    typeInput.value = "";
    stopLiveTranscript();
    stopRecordingTimer();
    setRecordingUI(false);

    // Reset code editor content but keep the toggle button visible
    hideCodeEditor();
    resetCodeEditor();

    if (isAnalyzingContinuous) {
        stopContinuousAnalysis();
    }
    setLiveAnalysisState(false);
}

function enableControls(on) {
    speakBtn.disabled   = !on;
    continuousAnalysisBtn.disabled = !on;
    typeInput.disabled   = !on;
    sendTypedBtn.disabled = !on;
    submitBtn.disabled  = true;
    nextBtn.disabled    = true;  // Enabled only after feedback is received
    repeatBtn.disabled  = !on;
    setSpeakButtonState(false);
    setLiveAnalysisState(isAnalyzingContinuous);

    // Always show the code editor toggle when interview is active
    if (on && codeToggleBtn) show(codeToggleBtn);
    if (!on && codeToggleBtn) hide(codeToggleBtn);
}

function updateSubmitState() {
    let codeSubmission = "";
    if (isCodeEditorVisible && preploomCodeEditor) {
        codeSubmission = preploomCodeEditor.getValue();
        // Don't count template code as a valid submission
        const isTemplate = Object.values(CODE_TEMPLATES).some(t => t.trim() === codeSubmission.trim());
        if (isTemplate) codeSubmission = "";
    }
    submitBtn.disabled = isRecording || (!lastAnswer.trim() && !codeSubmission.trim());
}

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
            if (result.isFinal) {
                liveTranscriptFinal = `${liveTranscriptFinal} ${text}`.trim();
            } else {
                interimTranscript += text;
            }
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
        if (!isRecording || !recognitionRestartRequested) {
            liveRecognition = null;
            return;
        }

        try {
            liveRecognition.start();
        } catch (e) {
            console.warn("Speech recognition restart skipped:", e);
        }
    };

    try {
        liveRecognition.start();
        return true;
    } catch (e) {
        liveRecognition = null;
        return false;
    }
}

function stopLiveTranscript() {
    recognitionRestartRequested = false;
    if (!liveRecognition) return;

    try {
        liveRecognition.stop();
    } catch (e) {
        console.warn("Speech recognition stop skipped:", e);
    }
    liveRecognition = null;
}

async function startAnswerRecording() {
    if (!mediaStream) {
        alert("Microphone not available. Please allow mic access.");
        return;
    }

    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) {
        alert("Microphone track not found. Please refresh and allow mic access.");
        return;
    }

    audioChunks = [];
    answerDuration = 0;
    liveTranscriptFinal = "";
    lastAnswer = "";
    updateTranscript("");
    hide(transcriptArea);
    updateSubmitState();

    if (!isAnalyzingContinuous) {
        startContinuousAnalysis();
    }

    sttStatus.className = "stt-pill";
    sttStatus.textContent = "🎙️ Recording now. Speak naturally and click again to stop.";
    show(sttStatus);

    // Visual feedback: glow the video container
    const vc = document.getElementById('videoContainer');
    const recBadge = document.getElementById('recBadge');
    if (vc) vc.classList.add('recording-active');
    if (recBadge) show(recBadge);

    const liveTranscriptStarted = startLiveTranscript();
    if (!liveTranscriptStarted) {
        sttStatus.textContent = "🎙️ Recording now. Final transcription will appear after you stop.";
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
    mediaRecorder.start();
    updateSubmitState();
}

async function stopAnswerRecording() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;

    const recordingDone = new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
    });

    mediaRecorder.stop();
    stopLiveTranscript();
    stopRecordingTimer();
    await recordingDone;

    // Remove visual feedback
    const vc = document.getElementById('videoContainer');
    const recBadge = document.getElementById('recBadge');
    if (vc) vc.classList.remove('recording-active');
    if (recBadge) hide(recBadge);

    answerDuration = Math.max(1, (Date.now() - recordingStartTime) / 1000);
    recordingStartTime = 0;
    setRecordingUI(false);

    sttStatus.className = "stt-pill";
    sttStatus.textContent = "🔄 Transcribing with Whisper…";
    show(sttStatus);

    try {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const wavBlob = await convertToWav(audioBlob);

        const formData = new FormData();
        formData.append("audio", wavBlob, "recording.wav");

        const data = await api("/api/transcribe", { method: "POST", body: formData });
        const transcript = (data.transcript || "").trim();

        if (transcript) {
            lastAnswer = transcript;
            updateTranscript(transcript);
            sttStatus.className = "stt-pill";
            sttStatus.textContent = "✅ Transcription complete.";
        } else if (lastAnswer.trim()) {
            sttStatus.className = "stt-pill";
            sttStatus.textContent = "✅ Live transcript captured.";
        } else {
            sttStatus.className = "stt-pill";
            sttStatus.textContent = "⚠️ No speech detected. Try again and speak louder.";
        }
    } catch (e) {
        sttStatus.className = "stt-pill";
        sttStatus.textContent = "❌ Transcription failed: " + e.message;
    } finally {
        mediaRecorder = null;
        updateSubmitState();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SPEAK ANSWER (Audio recording)
// ═══════════════════════════════════════════════════════════════════════════
if (speakBtn) {
    speakBtn.addEventListener("click", async () => {
    // Toggle: if already recording, stop. Otherwise start.
    if (isRecording) {
        await stopAnswerRecording();
        return;
    }

    if (!mediaStream) {
        alert("Microphone not available. Please allow mic access.");
        return;
    }

    // Start open-ended recording (no fixed duration — like a real interview)
    await startAnswerRecording();
});
}

// ── Convert webm to WAV ──────────────────────────────────────────────────
async function convertToWav(webmBlob) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await webmBlob.arrayBuffer();
    let audioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
        // If decoding fails, send the webm directly; backend will handle it
        return webmBlob;
    }

    const numChannels = 1;
    const sampleRate = 16000;

    // Resample to 16kHz mono
    const offlineCtx = new OfflineAudioContext(numChannels, audioBuffer.duration * sampleRate, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    const samples = rendered.getChannelData(0);

    // Encode WAV
    const wavBuffer = encodeWAV(samples, sampleRate);
    audioCtx.close();
    return new Blob([wavBuffer], { type: "audio/wav" });
}

function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);     // PCM
    view.setUint16(22, 1, true);     // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

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
    typeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submitTypedAnswer(); }
    });
    typeInput.addEventListener("input", (e) => {
        lastAnswer = e.target.value;
        updateSubmitState();
    });
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
//  ANALYZE POSTURE
// ═══════════════════════════════════════════════════════════════════════════
if (postureBtn) postureBtn.addEventListener("click", async () => {
    if (!mediaStream) return;

    postureBtn.disabled = true;
    postureBtn.innerHTML = '<span class="spinner"></span> Analyzing…';

        try {
        // Capture frame from video
        const video = videoPreview;
        const targetWidth = 640;
        const targetHeight = video.videoWidth ? Math.floor(video.videoHeight * (targetWidth / video.videoWidth)) : 480;
        snapshotCanvas.width = targetWidth;
        snapshotCanvas.height = targetHeight;
        const ctx = snapshotCanvas.getContext("2d");
        ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);



        const blob = await new Promise(resolve => snapshotCanvas.toBlob(resolve, "image/jpeg", 0.9));
        const formData = new FormData();
        formData.append("image", blob, "snapshot.jpg");

        const data = await api("/api/analyze-posture", { method: "POST", body: formData });
        bodyLanguageData = data;

        if (data.error) {
            blSummary.textContent = "⚠️ " + (data.summary || data.error);
            show(blSummary);
            hide(bodyMetrics);
        } else {
            const pr = data.probabilities || data;
            metricOpenness.textContent  = Math.round((pr.openness || 0) * 100) + "%";
            metricFidgeting.textContent = Math.round((pr.fidgeting || 0) * 100) + "%";
            metricEngage.textContent    = Math.round((pr.engagement || 0) * 100) + "%";
            metricPosture.textContent   = Math.round((pr.posture || 0) * 100) + "%";
            show(bodyMetrics);

            if (data.summary) {
                blSummary.textContent = data.summary;
                show(blSummary);
            }
        }
    } catch (e) {
        blSummary.textContent = "❌ " + e.message;
        show(blSummary);
    } finally {
        postureBtn.disabled = false;
        postureBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze Posture';
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CONTINUOUS POSTURE ANALYSIS (WebSocket)
// ═══════════════════════════════════════════════════════════════════════════
let continuousAnalysisSocket = null;
let isAnalyzingContinuous = false;
let frameIntervalId = null;
let isProcessingFrame = false;

async function startContinuousAnalysis() {
    if (isAnalyzingContinuous || !mediaStream) return;
    
    // Wait for video to be ready
    const video = videoPreview;
    if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
        blSummary.textContent = "⏳ Waiting for video feed…";
        show(blSummary);
        
        let retries = 0;
        while (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA && retries < 30) {
            await new Promise(r => setTimeout(r, 100));
            retries++;
        }
        
        if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
            blSummary.textContent = "❌ Video feed not ready";
            return;
        }
    }
    
    isAnalyzingContinuous = true;
    setLiveAnalysisState(true);
    blSummary.textContent = "🔄 Starting continuous analysis…";
    show(blSummary);
    
    // Get protocol (ws or wss depending on page protocol)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/analyze-posture`;
    
    try {
        continuousAnalysisSocket = new WebSocket(wsUrl);
        
        continuousAnalysisSocket.onopen = () => {
            blSummary.textContent = "✅ Live analysis active";
            show(bodyMetrics);
            show(blSummary);
            isProcessingFrame = false;
            startFrameCapture();
        };
        
        continuousAnalysisSocket.onmessage = (event) => {
            isProcessingFrame = false;
            try {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    console.warn("Analysis error:", data.error);
                    return;
                }
                
                // Update metrics in real-time
                const pr = data.probabilities || data;
                if (pr.openness !== undefined) {
                    metricOpenness.textContent = Math.round((pr.openness || 0) * 100) + "%";
                }
                if (pr.fidgeting !== undefined) {
                    metricFidgeting.textContent = Math.round((pr.fidgeting || 0) * 100) + "%";
                }
                if (pr.engagement !== undefined) {
                    metricEngage.textContent = Math.round((pr.engagement || 0) * 100) + "%";
                }
                if (pr.posture !== undefined) {
                    metricPosture.textContent = Math.round((pr.posture || 0) * 100) + "%";
                }
                
                // Update summary if available
                if (data.summary) {
                    blSummary.textContent = "✅ " + data.summary;
                }
                
                // Store latest data
                bodyLanguageData = data;
            } catch (e) {
                console.error("Failed to parse message:", e);
            }
        };
        
        continuousAnalysisSocket.onerror = (error) => {
            isProcessingFrame = false;
            blSummary.textContent = "❌ Connection error";
            console.error("WebSocket error:", error);
        };
        
        continuousAnalysisSocket.onclose = () => {
            if (isAnalyzingContinuous) {
                stopContinuousAnalysis();
            }
        };
    } catch (e) {
        blSummary.textContent = "❌ Could not connect: " + e.message;
        isAnalyzingContinuous = false;
        setLiveAnalysisState(false);
    }
}

function stopContinuousAnalysis() {
    isAnalyzingContinuous = false;
    isProcessingFrame = false;
    
    if (frameIntervalId) {
        clearInterval(frameIntervalId);
        frameIntervalId = null;
    }
    
    if (continuousAnalysisSocket) {
        continuousAnalysisSocket.close();
        continuousAnalysisSocket = null;
    }
    
    blSummary.textContent = "⏸️ Analysis paused";
}

function startFrameCapture() {
    if (frameIntervalId) clearInterval(frameIntervalId);
    
    // Determine interval from saved FPS preference
    let intervalMs = 67; // default 15 FPS
    const fpsPref = window.__prefFps;
    if (fpsPref === '5 FPS (battery-saver)') {
        intervalMs = 200; // 5 FPS
    } else if (fpsPref === '30 FPS (high detail)') {
        intervalMs = 33; // 30 FPS
    }
    
    frameIntervalId = setInterval(() => {
        if (!mediaStream || !continuousAnalysisSocket || continuousAnalysisSocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        if (isProcessingFrame) return;
        isProcessingFrame = true;
        
        try {
            const video = videoPreview;
            if (!video || video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
                isProcessingFrame = false;
                return;
            }
            snapshotCanvas.width = 640;
            snapshotCanvas.height = 480;
            const ctx = snapshotCanvas.getContext("2d");
            ctx.drawImage(video, 0, 0, 640, 480);
            
            // Convert to base64 and send
            snapshotCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
                    if (continuousAnalysisSocket && continuousAnalysisSocket.readyState === WebSocket.OPEN) {
                        continuousAnalysisSocket.send(JSON.stringify({ frame: base64 }));
                    }
                };
                reader.onerror = () => { isProcessingFrame = false; };
                reader.readAsDataURL(blob);
            }, "image/jpeg", 0.6);  // Optimized quality for latency
        } catch (e) {
            console.error("Frame capture error:", e);
            isProcessingFrame = false;
        }
    }, intervalMs);

}

// Event listener for continuous analysis toggle
if (continuousAnalysisBtn) {
    continuousAnalysisBtn.addEventListener("click", () => {
    if (isAnalyzingContinuous) {
        stopContinuousAnalysis();
        setLiveAnalysisState(false);
    } else {
        startContinuousAnalysis();
        setLiveAnalysisState(true);
    }
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
        // Don't count template code as actual submission
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
            stopWebcam();
            setStatus(false);
            enableControls(false);
            await showReport();
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
//  REPEAT QUESTION (TTS)
// ═══════════════════════════════════════════════════════════════════════════
if (repeatBtn) {
    repeatBtn.addEventListener("click", () => {
        if (currentQuestion) speak(currentQuestion.question_text);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════
function renderFeedback(ev) {
    hide(feedbackContent);
    show(feedbackScores);

    const ts  = ev.technical_score || 0;
    const cs  = ev.communication_score || 0;
    const cfs = ev.confidence_score;
    const parts = [ts, cs];
    if (cfs != null) parts.push(cfs);
    const ov = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

    // Header Summary
    scoreRow.innerHTML = `
        <span class="score-pill ${scoreColor(ov)}" style="font-size: 0.9rem; padding: 10px 24px; border-width: 2px;">
            🎯 Final Assessment: ${ov}% Overall Match
        </span>
    `;

    // Map Technical Growth Items
    const techGrowth = [
        ...(ev.missing_points || []).map(m => ({ icon: '❓', text: m, type: 'neg' })),
        ...(ev.improvements || []).map(imp => ({ icon: '🚀', text: imp, type: 'warn' }))
    ];

    // Build the Horizontal Evaluation Table
    let tableHTML = `
        <div style="margin-bottom: 20px;">
            <p style="font-style: italic; color: var(--text); font-size: 1.05rem; line-height: 1.6;">"${ev.short_feedback || ""}"</p>
        </div>
        
        <div class="fb-table-wrap">
            <table class="fb-table">
                <thead>
                    <tr>
                        <th style="width: 150px;">Evaluation Criteria</th>
                        <th style="text-align: center; border-left: 1px solid var(--border-md);">📚 Technical Depth</th>
                        <th style="text-align: center; border-left: 1px solid var(--border-md);">🗣️ Communication</th>
                        <th style="text-align: center; border-left: 1px solid var(--border-md);">📹 Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Row 1: Score -->
                    <tr>
                        <td class="fb-dim-cell">Performance Score</td>
                        <td style="text-align: center; border-left: 1px solid var(--border);">
                            <span class="score-pill ${scoreColor(ts)}" style="font-size: 1.1rem; min-width: 60px; justify-content: center;">${ts}%</span>
                        </td>
                        <td style="text-align: center; border-left: 1px solid var(--border);">
                            <span class="score-pill ${scoreColor(cs)}" style="font-size: 1.1rem; min-width: 60px; justify-content: center;">${cs}%</span>
                        </td>
                        <td style="text-align: center; border-left: 1px solid var(--border);">
                            <span class="score-pill ${cfs != null ? scoreColor(cfs) : ''}" style="font-size: 1.1rem; min-width: 60px; justify-content: center;">${cfs != null ? cfs + '%' : '—'}</span>
                        </td>
                    </tr>
                    
                    <!-- Row 2: Strengths -->
                    <tr>
                        <td class="fb-dim-cell">Key Strengths</td>
                        <td style="border-left: 1px solid var(--border);">
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${(ev.strengths || []).map(s => `
                                    <div class="fb-pill-item" style="background: rgba(34,197,94,0.06); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(34,197,94,0.12);">
                                        <span class="fb-pill-icon">✅</span>
                                        <span class="fb-pill-text pos">${s}</span>
                                    </div>
                                `).join('') || "—"}
                            </div>
                        </td>
                        <td style="border-left: 1px solid var(--border);">
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div class="fb-pill-item">
                                    <span class="fb-pill-icon">⚡</span>
                                    <span class="fb-pill-text neu">Pace: <b>${ev.wpm || 0} WPM</b></span>
                                </div>
                                <div class="fb-pill-item">
                                    <span class="fb-pill-icon">📉</span>
                                    <span class="fb-pill-text neu">Fillers: <b>${ev.filler_count || 0}</b></span>
                                </div>
                            </div>
                        </td>
                        <td style="border-left: 1px solid var(--border);">
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${(ev.bl_observations || []).slice(0, 2).map(ob => `
                                    <div class="fb-pill-item" style="background: rgba(108,99,255,0.06); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(108,99,255,0.12);">
                                        <span class="fb-pill-icon">👁️</span>
                                        <span class="fb-pill-text neu">${ob}</span>
                                    </div>
                                `).join('') || (cfs != null ? "✅ Stable presence" : "—")}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Row 3: Growth -->
                    <tr>
                        <td class="fb-dim-cell">Areas for Growth</td>
                        <td style="border-left: 1px solid var(--border);">
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${techGrowth.map(g => `
                                    <div class="fb-pill-item" style="background: rgba(255,255,255,0.03); padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border);">
                                        <span class="fb-pill-icon">${g.icon}</span>
                                        <span class="fb-pill-text ${g.type}">${g.text}</span>
                                    </div>
                                `).join('') || "—"}
                            </div>
                        </td>
                        <td style="border-left: 1px solid var(--border);">
                             ${ev.comm_details ? `
                                <div class="fb-pill-item" style="background: rgba(255,255,255,0.03); padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border);">
                                    <span class="fb-pill-icon">💬</span>
                                    <span class="fb-pill-text neu">${ev.comm_details}</span>
                                </div>
                            ` : "—"}
                        </td>
                        <td style="border-left: 1px solid var(--border);">
                             <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${(ev.bl_observations || []).slice(2, 4).map(ob => `
                                    <div class="fb-pill-item" style="background: rgba(245,158,11,0.06); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(245,158,11,0.12);">
                                        <span class="fb-pill-icon">👁️</span>
                                        <span class="fb-pill-text warn">${ob}</span>
                                    </div>
                                `).join('') || (ev.bl_summary ? `
                                    <div class="fb-pill-item" style="background: rgba(255,255,255,0.03); padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border);">
                                        <span class="fb-pill-icon">📹</span>
                                        <span class="fb-pill-text neu">${ev.bl_summary}</span>
                                    </div>
                                ` : "—")}
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    feedbackDetails.innerHTML = tableHTML;

    // Show the "Next" button so the user can advance to the next question
    // Enable the Next button now that feedback is visible
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
        <div class="score-card">
            <div class="value" style="color:var(--accent)">${r.overall}</div>
            <div class="label">Overall Score</div>
        </div>
        <div class="score-card">
            <div class="value" style="color:var(--green)">${r.avg_technical}</div>
            <div class="label">Technical</div>
        </div>
        <div class="score-card">
            <div class="value" style="color:var(--amber)">${r.avg_communication}</div>
            <div class="label">Communication</div>
        </div>
        <div class="score-card">
            <div class="value" style="color:#818cf8">${r.avg_confidence}</div>
            <div class="label">Confidence</div>
        </div>
    `;

    let bdHTML = "";
    for (let i = 0; i < r.evaluations.length; i++) {
        const ev = r.evaluations[i];
        const qText = (ev.question_text || "—").slice(0, 80);
        bdHTML += `
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
    }
    reportBreakdown.innerHTML = bdHTML;

    reportTips.innerHTML = r.tips.map(t => `<div class="tip-item">${t}</div>`).join("");
}

function toggleBreakdown(header) {
    const body = header.nextElementSibling;
    header.classList.toggle("open");
    body.classList.toggle("open");
}

async function downloadReportPdf(reportId) {
    if (!reportId) {
        return alert("Report download is not available.");
    }
    try {
        const blob = await apiDownload(`/api/user/reports/${reportId}/download`);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `interview_report_${reportId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Could not download PDF: " + e.message);
    }
}

function renderReportsHistory(reports) {
    if (!reports || !reports.length) {
        reportsList.innerHTML = `<div class="panel" style="padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm);">No saved reports were found. Complete an interview while signed in and return to see your reports here.</div>`;
        return;
    }

    reportsList.innerHTML = reports
        .map((report) => {
            const date = report.created_at ? new Date(report.created_at).toLocaleString() : "Unknown date";
            return `
            <div class="panel" style="padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm);">
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:center; flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; margin-bottom:0.25rem;">${report.role || "Interview Report"}</div>
                        <div style="font-size:0.9rem; color:var(--muted);">${report.candidate_name || "Candidate"} · ${date}</div>
                    </div>
                    <div style="text-align:right; min-width:150px;">
                        <div style="font-size:1.4rem; font-weight:700; color:var(--accent);">${report.overall_score ?? "—"}</div>
                        <div style="font-size:0.85rem; color:var(--muted);">Overall Score</div>
                    </div>
                </div>
                <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1rem;">
                    <button class="act-btn act-btn--submit download-saved-report" data-report-id="${report.id}" style="min-width:150px;">Download PDF</button>
                    <div style="padding:0.75rem 1rem; background: rgba(255,255,255,0.04); border-radius: var(--r-sm); flex:1; min-width:220px;">
                        <div style="font-size:0.85rem; color:var(--muted);">Tech ${report.avg_technical ?? "—"} · Comm ${report.avg_communication ?? "—"} · Conf ${report.avg_confidence ?? "—"}</div>
                    </div>
                </div>
            </div>`;
        })
        .join("");
}

async function showSavedReports() {
    try {
        const data = await api("/api/user/reports");
        renderReportsHistory(data.reports || []);
        switchView(reportsHistoryView);
    } catch (e) {
        alert("Could not load saved reports: " + e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEW INTERVIEW
// ═══════════════════════════════════════════════════════════════════════════
if (newInterviewBtn) {
    newInterviewBtn.addEventListener("click", () => {
        sessionId = null;
        currentQuestion = null;
        lastAnswer = "";
        bodyLanguageData = null;
        switchView(welcomeView);
        setStatus(false);
    });
}

if (downloadReportBtn) {
    downloadReportBtn.addEventListener("click", () => {
        const reportId = downloadReportBtn.dataset.reportId;
        downloadReportPdf(reportId);
    });
}

if (openReportsBtn) {
    openReportsBtn.addEventListener("click", showSavedReports);
}

if (backToReportsBtn) {
    backToReportsBtn.addEventListener("click", () => {
        switchView(reportView);
    });
}

if (reportsList) {
    reportsList.addEventListener("click", (event) => {
        const button = event.target.closest(".download-saved-report");
        if (!button) return;
        const reportId = button.dataset.reportId;
        downloadReportPdf(reportId);
    });
}

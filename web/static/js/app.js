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

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════
function show(el)   { el.classList.remove("hidden"); }
function hide(el)   { el.classList.add("hidden"); }
function scoreColor(s) { return s >= 70 ? "green" : s >= 45 ? "amber" : "red"; }
function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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

function setStatus(live) {
    statusDot.className = "status-dot" + (live ? " live" : "");
    statusLabel.textContent = live ? "🟢 Live" : "⚪ Idle";
}

function switchView(view) {
    [welcomeView, interviewView, reportView].forEach(v => hide(v));
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
    } catch (e) {
        console.warn("Webcam/mic access denied:", e);
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
//  Apply Settings (comprehensive — reads all settings saved in settings.html)
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener("DOMContentLoaded", () => {
    try {
        const prefs = JSON.parse(localStorage.getItem('preploom_prefs'));
        if (!prefs) return;

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

        // 4. Code editor
        if (prefs.prefCode !== undefined) {
            const editorCheck = $("showEditorCheck");
            if (editorCheck) editorCheck.checked = prefs.prefCode;
            const codingWorkspace = $("codingWorkspace");
            if (codingWorkspace) codingWorkspace.classList.toggle('hidden', !prefs.prefCode);
        }

        // 5. Live transcript preview
        if (prefs.prefLiveTranscript !== undefined) {
            // Stored for use in startAnswerRecording
            window.__prefLiveTranscript = prefs.prefLiveTranscript;
        }

        // 6. Auto-enable posture (stored for use when interview starts)
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

        // 9. Font size
        if (prefs.fontSizeRange) {
            document.documentElement.style.fontSize = prefs.fontSizeRange + 'px';
        }

        // 10. Reduce motion
        if (prefs.reduceMotion) {
            document.documentElement.style.setProperty('--transition-theme', '0s');
            const style = document.createElement('style');
            style.id = 'reduce-motion-style';
            style.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }';
            document.head.appendChild(style);
        }

        // 11. Ambient orbs
        if (prefs.prefAmbientOrbs === false) {
            const ambient = document.querySelector('.ambient');
            if (ambient) ambient.style.display = 'none';
        }

        // 12. Accent color
        if (prefs.accent) {
            const color = prefs.accent;
            document.documentElement.style.setProperty('--accent', color);
            const root = document.documentElement;
            function lightenHex(hex, pct) {
                if (!hex || !hex.startsWith('#')) return hex;
                let h = hex.length === 4 ? '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3] : hex;
                const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
                const li = v => Math.min(255, Math.floor(v + (255 - v) * pct/100));
                return '#' + [li(r),li(g),li(b)].map(v => v.toString(16).padStart(2,'0')).join('');
            }
            function hexToRgba(hex, alpha) {
                if (!hex || !hex.startsWith('#')) return hex;
                let h = hex.length === 4 ? '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3] : hex;
                const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
                return `rgba(${r},${g},${b},${alpha})`;
            }
            root.style.setProperty('--accent-2', lightenHex(color, 20));
            root.style.setProperty('--accent-glow', hexToRgba(color, 0.25));
            root.style.setProperty('--accent-soft', hexToRgba(color, 0.12));
            root.style.setProperty('--accent-text', lightenHex(color, 30));
        }

        // 13. Theme
        const theme = prefs.theme || localStorage.getItem('preploom_theme') || 'system';
        const applied = theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : theme;
        document.documentElement.setAttribute('data-theme', applied);

    } catch (e) {
        console.warn('PrepLoom: Could not apply settings', e);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Settings Page Logic & Slider Updates
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    const isSettingsPage = window.location.pathname.includes('settings');
    const prefs = JSON.parse(localStorage.getItem('preploom_prefs')) || {};

    // 1. Helper to safely set UI input values
    const setUIVal = (id, value) => {
        if (value === undefined) return;
        const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el && el.tagName !== 'META') {
            if (el.type === 'checkbox') el.checked = value === true;
            else el.value = value;
            // trigger event for live listeners
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    // 2. Populate UI elements with stored values
    const currentTheme = (prefs.theme || localStorage.getItem('preploom_theme') || 'system').toLowerCase();
    setUIVal('themeSelect', currentTheme);
    setUIVal('theme', currentTheme);
    setUIVal('accentColor', prefs.accent || '#6c63ff');
    setUIVal('accent', prefs.accent || '#6c63ff');
    setUIVal('fontSizeRange', prefs.fontSizeRange || '16');
    setUIVal('fontSize', prefs.fontSizeRange || '16');
    setUIVal('ttsRateRange', prefs.ttsRateRange || '0.95');
    setUIVal('ttsRate', prefs.ttsRateRange || '0.95');
    setUIVal('voiceSelect', prefs.prefTtsVoice || 'Female');
    setUIVal('voice', prefs.prefTtsVoice || 'Female');
    setUIVal('defaultRoleSelect', prefs.defaultRole || 'Software Engineer');
    
    if (isSettingsPage) {
        setUIVal('roleSelect', prefs.defaultRole || 'Software Engineer'); // Only apply if actually on settings page
        setUIVal('prefTts', prefs.prefTts !== false);
        setUIVal('prefIdeal', prefs.prefIdeal !== false);
        setUIVal('prefCode', prefs.prefCode === true);
    }

    // 3. Connect Sliders to Display values
    ['fontSizeRange', 'fontSize', 'ttsRateRange', 'ttsRate'].forEach(id => {
        const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        const disp = document.getElementById(id + "Val") || document.getElementById(id + "Display") || document.querySelector(`output[for="${id}"]`);
        if (el && disp) {
            disp.textContent = el.value;
            el.addEventListener('input', () => disp.textContent = el.value);
        }
    });

    // 4. Bulletproof Save logic
    function saveSettings(e) {
        e.preventDefault(); // Stop the form from wiping out the page immediately
        const newPrefs = { ...prefs };

        const getVal = (id) => {
            const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
            return (el && el.tagName !== 'META') ? (el.type === 'checkbox' ? el.checked : el.value) : undefined;
        };

        const theme = getVal('themeSelect') ?? getVal('theme');
        if (theme !== undefined) {
            newPrefs.theme = theme.toLowerCase();
            localStorage.setItem('preploom_theme', theme.toLowerCase());
        }

        const accent = getVal('accentColor') ?? getVal('accent');
        if (accent !== undefined) newPrefs.accent = accent;

        const font = getVal('fontSizeRange') ?? getVal('fontSize');
        if (font !== undefined) newPrefs.fontSizeRange = font;

        const rate = getVal('ttsRateRange') ?? getVal('ttsRate');
        if (rate !== undefined) newPrefs.ttsRateRange = rate;

        const voice = getVal('voiceSelect') ?? getVal('voice');
        if (voice !== undefined) newPrefs.prefTtsVoice = voice;

        const role = getVal('defaultRoleSelect') ?? (isSettingsPage ? getVal('roleSelect') : undefined);
        if (role !== undefined) newPrefs.defaultRole = role;

        const tts = getVal('prefTts') ?? getVal('ttsCheckbox');
        if (tts !== undefined) newPrefs.prefTts = tts;

        const ideal = getVal('prefIdeal') ?? getVal('showIdealCheck');
        if (ideal !== undefined) newPrefs.prefIdeal = ideal;

        const code = getVal('prefCode') ?? getVal('showEditorCheck');
        if (code !== undefined) newPrefs.prefCode = code;

        localStorage.setItem('preploom_prefs', JSON.stringify(newPrefs));

        // Show Success UI and Reload
        let btn = e.target.tagName === 'BUTTON' ? e.target : (e.submitter || e.target.querySelector('button[type="submit"]'));
        if (btn) {
            const origText = btn.innerHTML;
            btn.innerHTML = "✅ Saved!";
            setTimeout(() => { btn.innerHTML = origText; window.location.reload(); }, 600);
        } else {
            window.location.reload();
        }
    }

    // 5. Attach to forms AND buttons to guarantee it intercepts the action
    const formsToIntercept = new Set();
    
    document.querySelectorAll('form').forEach(f => {
        const id = (f.id || "").toLowerCase();
        const action = (f.action || "").toLowerCase();
        if (id.includes('setting') || action.includes('setting') || id.includes('pref') || isSettingsPage) {
            formsToIntercept.add(f);
        }
    });

    document.querySelectorAll('button, .btn, input[type="submit"]').forEach(b => {
        const text = (b.textContent || b.value || "").toLowerCase();
        if (text.includes('keep changes') || text.includes('save settings') || text.includes('save changes')) {
            const form = b.closest('form');
            if (form) formsToIntercept.add(form);
            else b.addEventListener('click', saveSettings);
        }
    });

    formsToIntercept.forEach(f => f.addEventListener('submit', saveSettings));
});
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
    const bubbleText = questionBubble.querySelector(".q-bubble-text");
    if (bubbleText) {
        bubbleText.textContent = q.question_text;
    } else {
        questionBubble.textContent = "🤖 " + q.question_text;
    }
    kpiRole.textContent  = q.role_tag;
    kpiQ.textContent     = (q.index + 1) + "/" + totalQuestions;
    kpiLevel.textContent = q.difficulty_level;
    kpiTopic.textContent = q.subtopic;
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
    show(feedbackContent);
    feedbackContent.innerHTML = '<p class="caption">Speak or type your answer, then Submit for evaluation.</p>';
    hide(idealAnswer);
    hide(bodyMetrics);
    hide(blSummary);
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
    speakBtn.disabled   = !on;
    continuousAnalysisBtn.disabled = !on;
    typeInput.disabled   = !on;
    sendTypedBtn.disabled = !on;
    submitBtn.disabled  = true;
    nextBtn.disabled    = !on;
    repeatBtn.disabled  = !on;
    setSpeakButtonState(false);
    setLiveAnalysisState(isAnalyzingContinuous);
}

function updateSubmitState() {
    let codeSubmission = "";
    const codingWorkspace = document.getElementById('codingWorkspace');
    if (codingWorkspace && !codingWorkspace.classList.contains('hidden') && typeof preploomCodeEditor !== 'undefined') {
        codeSubmission = preploomCodeEditor.getValue();
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

    sttStatus.className = "stt-status recording";
    sttStatus.textContent = "Recording now. Speak naturally and click again to stop.";
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

    answerDuration = Math.max(1, (Date.now() - recordingStartTime) / 1000);
    recordingStartTime = 0;
    setRecordingUI(false);

    sttStatus.className = "stt-status transcribing";
    sttStatus.textContent = "Transcribing with Whisper…";
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

// ═══════════════════════════════════════════════════════════════════════════
//  SPEAK ANSWER (Audio recording)
// ═══════════════════════════════════════════════════════════════════════════
if (speakBtn) {
    speakBtn.addEventListener("click", async () => {
    if (isRecording) {
        await stopAnswerRecording();
        return;
    }

    await startAnswerRecording();
    return;

    if (!mediaStream) {
        alert("Microphone not available. Please allow mic access.");
        return;
    }

    const seconds = 7;
    speakBtn.disabled = true;

    // Show recording status
    sttStatus.className = "stt-status recording";
    sttStatus.textContent = `🎙️ Recording for ${seconds}s — speak now!`;
    show(sttStatus);

    // Record audio
    audioChunks = [];
    const audioTrack = mediaStream.getAudioTracks()[0];
    const audioStream = new MediaStream([audioTrack]);

    try {
        mediaRecorder = new MediaRecorder(audioStream, { mimeType: "audio/webm" });
    } catch (e) {
        mediaRecorder = new MediaRecorder(audioStream);
    }

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

    const recordingStartTime = Date.now();

    const recordingDone = new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
    });

    mediaRecorder.start();
    setTimeout(() => { if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop(); }, seconds * 1000);
    await recordingDone;

    answerDuration = (Date.now() - recordingStartTime) / 1000;

    // Convert to WAV and send
    sttStatus.className = "stt-status transcribing";
    sttStatus.textContent = "🔄 Transcribing with Whisper…";

    try {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const wavBlob = await convertToWav(audioBlob);

        const formData = new FormData();
        formData.append("audio", wavBlob, "recording.wav");

        const data = await api("/api/transcribe", { method: "POST", body: formData });
        const transcript = data.transcript || "";

        if (transcript) {
            lastAnswer = transcript;
            transcriptArea.value = transcript;
            show(transcriptArea);
            sttStatus.className = "stt-status done";
            sttStatus.textContent = "✅ Transcription complete";
            updateSubmitState();
        } else {
            sttStatus.className = "stt-status recording";
            sttStatus.textContent = "⚠️ No speech detected. Try speaking louder.";
        }
    } catch (e) {
        sttStatus.className = "stt-status recording";
        sttStatus.textContent = "❌ Transcription failed: " + e.message;
    }

    speakBtn.disabled = false;
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
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHOW IDEAL ANSWER
// ═══════════════════════════════════════════════════════════════════════════
if (showIdealCheck) {
    showIdealCheck.addEventListener("change", () => {
    if (showIdealCheck.checked && currentQuestion && currentQuestion.ideal_answer) {
        idealText.textContent = currentQuestion.ideal_answer;
        show(idealAnswer);
    } else {
        hide(idealAnswer);
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
            if (video.videoWidth === 0 || video.videoHeight === 0) {
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
    const codingWorkspace = document.getElementById('codingWorkspace');
    if (codingWorkspace && !codingWorkspace.classList.contains('hidden') && typeof preploomCodeEditor !== 'undefined') {
        codeSubmission = preploomCodeEditor.getValue();
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

    scoreRow.innerHTML = `
        <span class="score-pill ${scoreColor(ov)}">🎯 Overall: ${ov}/100</span>
        <span class="score-pill ${scoreColor(ts)}">📚 Technical: ${ts}/100</span>
        <span class="score-pill ${scoreColor(cs)}">🗣️ Communication: ${cs}/100</span>
        <span class="score-pill ${cfs != null ? scoreColor(cfs) : ''}">📹 Confidence: ${cfs != null ? cfs + '/100' : '—'}</span>
    `;

    let leftHTML = "";
    if (ev.short_feedback) leftHTML += `<p class="caption">💬 ${ev.short_feedback}</p>`;
    if (ev.strengths && ev.strengths.length)
        leftHTML += `<p><strong>Strengths:</strong> <span class="detail-text">${ev.strengths.slice(0, 3).join(" • ")}</span></p>`;
    if (ev.improvements && ev.improvements.length)
        leftHTML += `<p><strong>To improve:</strong> <span class="detail-text">${ev.improvements.slice(0, 3).join(" • ")}</span></p>`;
    if (ev.missing_points && ev.missing_points.length)
        leftHTML += `<p><strong>Missing:</strong> <span class="detail-text">${ev.missing_points.slice(0, 5).join(", ")}</span></p>`;

    let rightHTML = "";
    if (ev.comm_details) rightHTML += `<p class="caption">🗣️ ${ev.comm_details}</p>`;
    if (ev.filler_count || ev.wpm)
        rightHTML += `<p><strong>Fillers:</strong> ${ev.filler_count} &nbsp;|&nbsp; <strong>Pace:</strong> ${ev.wpm} WPM</p>`;
    if (ev.filler_words && ev.filler_words.length)
        rightHTML += `<p><strong>Filler words:</strong> <span class="detail-text">${ev.filler_words.join(", ")}</span></p>`;
    if (ev.bl_summary) rightHTML += `<p class="caption">📹 ${ev.bl_summary}</p>`;

    feedbackDetails.innerHTML = `
        <div class="detail-col">${leftHTML}</div>
        <div class="detail-col">${rightHTML}</div>
    `;
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
    reportSub.textContent = `Candidate: ${r.name || "—"} | Role: ${r.role} | Questions answered: ${r.total_answered}`;

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

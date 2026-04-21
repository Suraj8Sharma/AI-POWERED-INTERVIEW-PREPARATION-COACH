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
function speak(text) {
    if (!ttsCheckbox.checked || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    utter.pitch = 1.0;
    // Prefer a female voice
    const voices = window.speechSynthesis.getVoices();
    const female = voices.find(v => /zira|female|samantha|karen/i.test(v.name));
    if (female) utter.voice = female;
    window.speechSynthesis.speak(utter);
}

// Pre-load voices
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Webcam
// ═══════════════════════════════════════════════════════════════════════════
async function startWebcam() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
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
    try {
        const data = await api("/api/roles");
        roleSelect.innerHTML = "";
        for (const r of data.roles) {
            const opt = document.createElement("option");
            opt.value = r;
            opt.textContent = r;
            roleSelect.appendChild(opt);
        }
    } catch (e) {
        roleSelect.innerHTML = '<option value="Data Scientist">Data Scientist</option><option value="AI ML Engineer">AI ML Engineer</option>';
    }
})();

// ═══════════════════════════════════════════════════════════════════════════
//  Slider update
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//  START Interview
// ═══════════════════════════════════════════════════════════════════════════
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
        enableControls(true);
        speak(currentQuestion.question_text);
    } catch (e) {
        alert("Could not start interview: " + e.message);
    } finally {
        startBtn.disabled = false;
        startBtn.innerHTML = "▶ Start";
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  END Interview
// ═══════════════════════════════════════════════════════════════════════════
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
    submitBtn.disabled = isRecording || !lastAnswer.trim();
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

sendTypedBtn.addEventListener("click", submitTypedAnswer);
typeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitTypedAnswer(); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SHOW IDEAL ANSWER
// ═══════════════════════════════════════════════════════════════════════════
showIdealCheck.addEventListener("change", () => {
    if (showIdealCheck.checked && currentQuestion && currentQuestion.ideal_answer) {
        idealText.textContent = currentQuestion.ideal_answer;
        show(idealAnswer);
    } else {
        hide(idealAnswer);
    }
});

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
        snapshotCanvas.width = video.videoWidth || 640;
        snapshotCanvas.height = video.videoHeight || 480;
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
            startFrameCapture();
        };
        
        continuousAnalysisSocket.onmessage = (event) => {
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
    
    // Capture frames at ~15 FPS (every 67ms)
    frameIntervalId = setInterval(() => {
        if (!mediaStream || !continuousAnalysisSocket || continuousAnalysisSocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        try {
            const video = videoPreview;
            snapshotCanvas.width = video.videoWidth || 640;
            snapshotCanvas.height = video.videoHeight || 480;
            const ctx = snapshotCanvas.getContext("2d");
            ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
            
            // Convert to base64 and send
            snapshotCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
                    if (continuousAnalysisSocket && continuousAnalysisSocket.readyState === WebSocket.OPEN) {
                        continuousAnalysisSocket.send(JSON.stringify({ frame: base64 }));
                    }
                };
                reader.readAsDataURL(blob);
            }, "image/jpeg", 0.8);
        } catch (e) {
            console.error("Frame capture error:", e);
        }
    }, 67); // ~15 FPS
}

// Event listener for continuous analysis toggle
continuousAnalysisBtn.addEventListener("click", () => {
    if (isAnalyzingContinuous) {
        stopContinuousAnalysis();
        setLiveAnalysisState(false);
    } else {
        startContinuousAnalysis();
        setLiveAnalysisState(true);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUBMIT ANSWER
// ═══════════════════════════════════════════════════════════════════════════
submitBtn.addEventListener("click", async () => {
    if (!lastAnswer.trim() || !sessionId) return;

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

// ═══════════════════════════════════════════════════════════════════════════
//  NEXT QUESTION
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
//  REPEAT QUESTION (TTS)
// ═══════════════════════════════════════════════════════════════════════════
repeatBtn.addEventListener("click", () => {
    if (currentQuestion) speak(currentQuestion.question_text);
});

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
newInterviewBtn.addEventListener("click", () => {
    sessionId = null;
    currentQuestion = null;
    lastAnswer = "";
    bodyLanguageData = null;
    switchView(welcomeView);
    setStatus(false);
});

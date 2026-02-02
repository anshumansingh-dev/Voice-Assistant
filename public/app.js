const socket = new WebSocket("ws://localhost:3000");

const orb = document.getElementById("orb");
const status = document.getElementById("status");
const toggleBtn = document.getElementById("toggleBtn");

let mediaRecorder;
let audioChunks = [];

let isActive = false;
let isSpeaking = false;
let isWaitingForResponse = false;

let audioContext;
let audioSource;
let currentAudio = null;

/* ---------------- WebSocket ---------------- */

socket.onopen = () => {
  console.log("🔌 WebSocket connected");
  status.textContent = "Connected. Ready.";
};

socket.onclose = () => {
  console.log("❌ WebSocket disconnected");
  stopConversation();
};

socket.onmessage = async (event) => {
  if (!isActive || isSpeaking) return;

  isSpeaking = true;
  isWaitingForResponse = true;

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }

  const audioBlob = event.data;
  console.log("🔊 Audio size:", audioBlob.size);

  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  currentAudio = audio;

  orb.className = "speaking";
  status.textContent = "Speaking...";

  await audio.play();

  audio.onended = () => {
    console.log("✅ TTS playback finished");

    currentAudio = null;
    isSpeaking = false;
    isWaitingForResponse = false;

    setTimeout(() => {
      if (!isActive) return;
      orb.className = "listening";
      status.textContent = "Listening...";
      loopRecording();
    }, 500);
  };
};

/* ---------------- Toggle ---------------- */

toggleBtn.onclick = async () => {
  isActive = !isActive;

  if (isActive) {
    toggleBtn.textContent = "Stop Conversation";
    toggleBtn.classList.add("active");
    await startConversation();
  } else {
    toggleBtn.textContent = "Start Conversation";
    toggleBtn.classList.remove("active");
    stopConversation();
  }
};

/* ---------------- Conversation ---------------- */

async function startConversation() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    audioContext = new AudioContext();
    audioSource = audioContext.createMediaStreamSource(stream);

    const highpass = audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 200;

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 8000;

    audioSource.connect(highpass);
    highpass.connect(lowpass);

    const destination = audioContext.createMediaStreamDestination();
    lowpass.connect(destination);

    mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      if (!audioChunks.length || !isActive) return;

      const blob = new Blob(audioChunks, { type: "audio/webm" });
      socket.send(blob);
      audioChunks = [];
    };

    orb.className = "listening";
    status.textContent = "Listening...";
    loopRecording();
  } catch (err) {
    console.error(err);
    stopConversation();
  }
}

function stopConversation() {
  isActive = false;
  isSpeaking = false;
  isWaitingForResponse = false;

  currentAudio?.pause();
  currentAudio = null;

  if (mediaRecorder?.state !== "inactive") {
    mediaRecorder.stop();
  }

  audioContext?.close();
  audioContext = null;

  orb.className = "idle";
  status.textContent = "Conversation stopped.";
}

/* ---------------- Recording Loop ---------------- */

function loopRecording() {
  if (!isActive) return;

  // 🔥 User interrupts AI
  if (isSpeaking && currentAudio) {
    console.log("🛑 User interrupted AI");

    currentAudio.pause();
    currentAudio = null;

    socket.send(JSON.stringify({ type: "INTERRUPT" }));

    isSpeaking = false;
    isWaitingForResponse = false;
  }

  if (mediaRecorder.state === "inactive") {
    mediaRecorder.start();

    setTimeout(() => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, 3500);
  }
}

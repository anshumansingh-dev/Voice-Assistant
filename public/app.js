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

/* ---------------- WebSocket ---------------- */

socket.onopen = () => {
  console.log("🔌 WebSocket connected");
  status.textContent = "Connected. Ready.";
};

socket.onclose = () => {
  console.log("❌ WebSocket disconnected");
  status.textContent = "Disconnected.";
  stopConversation();
};

socket.onmessage = async (event) => {
  console.log("📥 Client received TTS audio");

  if (!isActive || isSpeaking) return;

  isSpeaking = true;
  isWaitingForResponse = true;

  // 🔇 HARD STOP mic
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }

  const audioBlob = event.data;
  console.log("🔊 Audio size:", audioBlob.size);

  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  orb.className = "speaking";
  status.textContent = "Speaking...";

  await audio.play();

  audio.onended = () => {
    console.log("✅ TTS playback finished");

    isSpeaking = false;
    isWaitingForResponse = false;

    // 🧠 Cooldown to avoid echo
    setTimeout(() => {
      if (!isActive) return;

      orb.className = "listening";
      status.textContent = "Listening...";
      loopRecording(); // 🎙️ resume ONLY here
    }, 800);
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
    console.log("🎙️ Requesting microphone");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
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
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        console.log("🎧 Chunk size:", e.data.size);
      }
    };

    mediaRecorder.onstop = () => {
      console.log("🛑 Recording stopped | chunks:", audioChunks.length);

      if (!audioChunks.length || !isActive) return;

      const blob = new Blob(audioChunks, { type: "audio/webm" });
      console.log("🚀 Sending audio | size:", blob.size);

      socket.send(blob);
      audioChunks = [];

      // ❌ DO NOT restart recording here
      console.log("⏸️ Waiting for LLM/TTS");
    };

    orb.className = "listening";
    status.textContent = "Listening...";
    loopRecording();
  } catch (err) {
    console.error(err);
    status.textContent = "Mic access failed.";
    stopConversation();
  }
}

function stopConversation() {
  isActive = false;
  isSpeaking = false;
  isWaitingForResponse = false;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  orb.className = "idle";
  status.textContent = "Conversation stopped.";
}

/* ---------------- Recording Loop ---------------- */

function loopRecording() {
  if (!isActive || isSpeaking || isWaitingForResponse) return;

  console.log("🎙️ Recording started");
  mediaRecorder.start();

  setTimeout(() => {
    if (!isActive || isSpeaking) return;

    console.log("🛑 Recording timeout");
    mediaRecorder.stop();
  }, 3500); // ⬅️ reduced window
}

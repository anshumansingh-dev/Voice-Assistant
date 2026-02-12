const socket = new WebSocket("ws://localhost:3000");

const orb = document.getElementById("orb");
const status = document.getElementById("status");
const toggleBtn = document.getElementById("toggleBtn");

/* ---------------- STATE ---------------- */

let mediaRecorder = null;
let isActive = false;

/* ---------------- AUDIO PLAYBACK ENGINE ---------------- */

// Cartesia sends 24kHz PCM
const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
  sampleRate: 24000
});

let playbackTime = 0;

function resetAudioPlayback() {
  playbackTime = audioCtx.currentTime;
}

/* ---------------- SOCKET EVENTS ---------------- */

socket.binaryType = "blob";

socket.onopen = () => {
  console.log("✅ WebSocket connected");
  status.textContent = "Connected";
};

socket.onerror = (e) => {
  console.error("❌ WebSocket error", e);
};

socket.onclose = () => {
  console.log("❌ WS closed");
  stopConversation();
};

/* ----------- AUDIO FROM SERVER (TTS) ----------- */

socket.onmessage = async (event) => {

  // Handle control messages
  if (typeof event.data === "string") {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "NEW_TURN") {
        console.log("🔄 NEW TURN → Reset playback");
        resetAudioPlayback();
        return;
      }

    } catch {}
    return;
  }

  /* ---------- PCM AUDIO STREAM ---------- */

  console.log("🎧 Received audio from server:", event.data.size);

  const arrayBuffer = await event.data.arrayBuffer();

  const pcm16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(pcm16.length);

  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }

  const audioBuffer = audioCtx.createBuffer(
    1,
    float32.length,
    24000
  );

  audioBuffer.getChannelData(0).set(float32);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (playbackTime < now) playbackTime = now;

  source.start(playbackTime);
  playbackTime += audioBuffer.duration;
};

/* ---------------- TOGGLE ---------------- */

toggleBtn.onclick = async () => {
  console.log("Button clicked");

  if (!isActive) {
    await startConversation();
  } else {
    stopConversation();
  }
};

/* ---------------- START ---------------- */

async function startConversation() {
  console.log("🎙 Starting conversation");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });

    console.log("✅ Mic granted");

    if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      alert("Browser does not support opus recording");
      return;
    }

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus"
    });

    /* -------- STREAM AUDIO CONTINUOUSLY -------- */

    mediaRecorder.ondataavailable = (e) => {
      if (!isActive) return;

      if (e.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        //console.log("📦 Audio chunk:", e.data.size);

        socket.send(e.data);

        //console.log("📡 SENT TO SERVER", e.data.size);
      }
    };

    mediaRecorder.start(250); // 250ms chunks

    console.log("🎬 Recorder started");

    orb.className = "listening";
    status.textContent = "Listening...";

    isActive = true;
    toggleBtn.textContent = "Stop Conversation";
    toggleBtn.classList.add("active");

  } catch (err) {
    console.error(err);
    stopConversation();
  }
}

/* ---------------- STOP ---------------- */

function stopConversation() {
  console.log("🛑 Stopping conversation");

  isActive = false;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  orb.className = "idle";
  status.textContent = "Conversation stopped.";

  toggleBtn.textContent = "Start Conversation";
  toggleBtn.classList.remove("active");
}
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
  status.textContent = "Connected. Ready.";
  console.log("WebSocket connected");
};

socket.onclose = () => {
  status.textContent = "Disconnected. Refresh the page.";
  console.log("WebSocket disconnected");
  stopConversation();
};

socket.onmessage = async (event) => {
  console.log("Received response from server");
  
  // Don't process if already speaking or waiting for response
  if (isSpeaking || isWaitingForResponse) {
    console.log("Skipping - already processing or waiting");
    return;
  }

  isWaitingForResponse = true;
  isSpeaking = true;
  
  // 🔇 Stop recording immediately
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }

  const audioBlob = event.data;
  console.log("Audio blob size:", audioBlob.size, "bytes");
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  orb.className = "speaking";
  status.textContent = "Speaking...";

  await audio.play();
  console.log("Playing audio response");

  audio.onended = () => {
  isSpeaking = false;
  isWaitingForResponse = false;

  // 🧠 IMPORTANT: cooldown to avoid feedback loop
  setTimeout(() => {
    if (!isActive) return;

    orb.className = "listening";
    status.textContent = "Listening...";
    loopRecording(); // 🎙️ resume ONLY after cooldown
  }, 800); // 👈 600–1000ms works best
};
};


/* ---------------- Toggle Button ---------------- */

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

/* ---------------- Conversation Control ---------------- */

async function startConversation() {
  try {
    status.textContent = "Starting microphone…";
    console.log("Starting conversation, requesting microphone access");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      }
    });
    console.log("Microphone access granted");

    audioContext = new AudioContext();
    audioSource = audioContext.createMediaStreamSource(stream);

    // Filters
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

    const cleanStream = new MediaStream([
      destination.stream.getAudioTracks()[0],
    ]);

    mediaRecorder = new MediaRecorder(cleanStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        console.log("Audio chunk received:", e.data.size, "bytes");
      }
    };

    mediaRecorder.onstop = () => {
      console.log("MediaRecorder stopped, isActive:", isActive, "chunks:", audioChunks.length);
      if (!audioChunks.length || !isActive) return;

      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      console.log("Sending audio to server, size:", audioBlob.size, "bytes");
      socket.send(audioBlob);
      audioChunks = [];
    };

    orb.className = "listening";
    status.textContent = "Listening…";

    loopRecording();

  } catch (err) {
    console.error(err);
    status.textContent = "Microphone access failed.";
    stopConversation();
  }
}

function stopConversation() {
  isActive = false;

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
  if (!isActive) return;

  console.log("Starting new recording");
  mediaRecorder.start();

  setTimeout(() => {
    if (!isActive) return;
    console.log("Stopping recording");
    mediaRecorder.stop();

    setTimeout(() => {
      if (isActive) loopRecording();
    }, 250); // gap
  }, 7000); // utterance window
}
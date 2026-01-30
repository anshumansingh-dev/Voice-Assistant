let mediaRecorder;
let audioChunks = [];
let silenceTimeout;
let audioContext;
let analyser;
let microphone;

const status = document.getElementById("status");

const SILENCE_THRESHOLD = 0.05; // Adjust sensitivity (lower = more sensitive)
const SILENCE_DURATION = 2000; // Stop after 2 seconds of silence

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Setup audio analysis for silence detection
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  microphone = audioContext.createMediaStreamSource(stream);
  microphone.connect(analyser);
  analyser.fftSize = 512;

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    // Cleanup
    clearTimeout(silenceTimeout);
    if (audioContext) audioContext.close();
    stream.getTracks().forEach(track => track.stop());

    status.textContent = "Transcribing...";

    // ❗ DO NOT force audio/wav
    const audioBlob = new Blob(audioChunks);

    const formData = new FormData();
    formData.append("audio", audioBlob, "speech.webm");

    // 🔤 STT
    const sttRes = await fetch("/stt", {
      method: "POST",
      body: formData,
    });

    const { text } = await sttRes.json();
    console.log("Transcribed text:", text);

    status.textContent = "Speaking...";

    // 🔊 TTS
    const ttsRes = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const audio = await ttsRes.blob();
    new Audio(URL.createObjectURL(audio)).play();

    status.textContent = "Done";
  };

  mediaRecorder.start();
  status.textContent = "Recording...";

  // Start monitoring for silence
  detectSilence();
}

function detectSilence() {
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);
  
  function checkAudio() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    
    analyser.getByteTimeDomainData(dataArray);
    
    // Calculate audio level
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    if (rms < SILENCE_THRESHOLD) {
      // Silence detected - start countdown if not already started
      if (!silenceTimeout) {
        silenceTimeout = setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
        }, SILENCE_DURATION);
      }
    } else {
      // Sound detected - reset silence timeout
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }
    }
    
    requestAnimationFrame(checkAudio);
  }
  
  checkAudio();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

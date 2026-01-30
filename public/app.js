let mediaRecorder;
let audioChunks = [];

const status = document.getElementById("status");
const textArea = document.getElementById("text");

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
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
    textArea.value = text;

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
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

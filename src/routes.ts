import express, { Router } from "express";
import multer from "multer";
//import { generateAnswer } from "./llm.js";
import { textToSpeech } from "./tts.js";
import { speechToText } from "./stt.js";

const upload = multer();
export const router: Router = express.Router();

router.post("/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Audio file required" });
    }

    const text = await speechToText(req.file.buffer);
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "STT failed" });
  }
});


/**
 * TTS → audio
 */
router.post("/tts", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "Text is required and must be a string",
      });
    }

    const audio = await textToSpeech(text);
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TTS failed" });
  }
});

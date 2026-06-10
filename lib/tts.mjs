import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openaiKey, outDir } from "./config.mjs";
import { segmentsOf } from "./schema.mjs";

export function probeDuration(file) {
  return parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
      .toString().trim(),
  );
}

async function speak(key, { model, voice, instructions, input }) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice, input, instructions, response_format: "wav" }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateAudio(m) {
  const key = openaiKey();
  const dir = path.join(outDir(m.id), "audio");
  fs.mkdirSync(dir, { recursive: true });
  const manifest = [];
  for (const seg of segmentsOf(m)) {
    const raw = path.join(dir, `${seg.id}.raw.wav`);
    const wav = path.join(dir, `${seg.id}.wav`);
    fs.writeFileSync(raw, await speak(key, { model: m.model, voice: m.voice, instructions: m.instructions, input: seg.text }));
    execFileSync("ffmpeg", ["-y", "-i", raw, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", wav], { stdio: "ignore" });
    fs.rmSync(raw, { force: true });
    const d = probeDuration(wav);
    manifest.push({ id: seg.id, wav: `audio/${seg.id}.wav`, durationSec: d });
    console.log(`${seg.id.padEnd(10)} ${d.toFixed(2)}s`);
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const total = manifest.reduce((a, b) => a + b.durationSec, 0);
  console.log(`Total narration: ${total.toFixed(1)}s`);
  return manifest;
}

// tools/voice.mjs: makes Grandfather Tuft's audio clips (assets/voice/<id>.mp3) from the lines in src/garden/voice.js.
// Speech by Kokoro, a local neural voice model (Apache 2.0; what it produces is ours to ship), in an older British
// man's voice, a little slow; ffmpeg then ages it (lower, a small room round it). Without Kokoro it falls back to
// espeak-ng, which sounds robotic.   node tools/voice.mjs [id ...]
//   KOKORO=<path to the kokoro command> (default: the one in ~/projects/td-assistant-jarvis-1/backtalk/.venv/bin)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LINES } from '../src/garden/voice.js';

import os from 'node:os';
const OUT = new URL('../assets/voice/', import.meta.url).pathname, only = process.argv.slice(2);
const kPath = process.env.KOKORO ?? `${os.homedir()}/projects/td-assistant-jarvis-1/backtalk/.venv/bin/kokoro`, KOKORO = fs.existsSync(kPath) ? kPath : null;
console.log(KOKORO ? 'voice: Kokoro' : 'voice: espeak-ng (Kokoro not found)');
fs.mkdirSync(OUT, { recursive: true });
const seconds = {};
for (const [id, text] of Object.entries(LINES)) {
  if (only.length && !only.includes(id)) continue;
  const wav = `${OUT}${id}.wav`, mp3 = `${OUT}${id}.mp3`;
  if (KOKORO) {
    execFileSync(KOKORO, ['-m', process.env.VOICE ?? 'bm_george', '-s', '0.9', '-t', text, '-o', wav], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'asetrate=24000*0.93,aresample=44100,atempo=1.03,highpass=f=90,aecho=0.8:0.5:32:0.16,loudnorm=I=-17:TP=-2', '-ac', '1', '-b:a', '64k', mp3]);
  } else {
    execFileSync('espeak-ng', ['-v', 'en-gb+grandpa', '-s', '158', '-p', '30', '-g', '4', '-a', '170', '-w', wav, text]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'asetrate=22050*0.93,aresample=44100,highpass=f=110,lowpass=f=4800,aecho=0.8:0.6:38:0.22,loudnorm=I=-17:TP=-2', '-ac', '1', '-b:a', '64k', mp3]);
  }
  fs.unlinkSync(wav);
  seconds[id] = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString().trim();
}
if (!only.length) fs.writeFileSync(`${OUT}lines.json`, JSON.stringify(Object.fromEntries(Object.entries(seconds).map(([k, v]) => [k, +v.toFixed(2)])), null, 1) + '\n');
console.log(Object.keys(seconds).length, 'clips,', (Object.values(seconds).reduce((a, b) => a + b, 0)).toFixed(0), 's of speech');

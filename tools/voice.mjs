// tools/voice.mjs: makes Grandfather Tuft's audio clips (assets/voice/<id>.mp3) from the lines in src/garden/voice.js.
// Speech by espeak-ng (free software; what it produces is ours to ship), then ffmpeg ages it: a little lower and
// slower, the hiss taken off, a small room round it.   node tools/voice.mjs [id ...]   (needs espeak-ng and ffmpeg)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LINES } from '../src/garden/voice.js';

const OUT = new URL('../assets/voice/', import.meta.url).pathname, VOICE = process.env.VOICE ?? 'en-gb+grandpa', only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const seconds = {};
for (const [id, text] of Object.entries(LINES)) {
  if (only.length && !only.includes(id)) continue;
  const wav = `${OUT}${id}.wav`, mp3 = `${OUT}${id}.mp3`;
  execFileSync('espeak-ng', ['-v', VOICE, '-s', '158', '-p', '30', '-g', '4', '-a', '170', '-w', wav, text]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'asetrate=22050*0.93,aresample=44100,highpass=f=110,lowpass=f=4800,aecho=0.8:0.6:38:0.22,loudnorm=I=-17:TP=-2', '-ac', '1', '-b:a', '64k', mp3]);
  fs.unlinkSync(wav);
  seconds[id] = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString().trim();
}
if (!only.length) fs.writeFileSync(`${OUT}lines.json`, JSON.stringify(Object.fromEntries(Object.entries(seconds).map(([k, v]) => [k, +v.toFixed(2)])), null, 1) + '\n');
console.log(Object.keys(seconds).length, 'clips,', (Object.values(seconds).reduce((a, b) => a + b, 0)).toFixed(0), 's of speech');

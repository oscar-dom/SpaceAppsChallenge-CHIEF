// Renders the storyboard to an MP4, frame by frame (`npm run video:render`).
// A hidden Chrome opens the storyboard; for every frame the page is set to that exact time and a
// screenshot is taken, so no frame is ever dropped, however heavy the scene. The voice-over and the
// music are rendered offline and muxed in with ffmpeg (ffmpeg-static, nothing to install).
//
//   npm run video:render                     1920x1080, 30 fps, subtitles on
//   npm run video:render -- --fps 60         smoother, twice the frames
//   npm run video:render -- --no-subs        clean picture
//   npm run video:render -- --no-music       voice-over only
//   npm run video:render -- --out my.mp4     output path (default video/renders/chief-pitch-video.mp4)
//
// It uses the Chrome or Edge already installed; set CHROME_PATH to use another browser.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import puppeteer from 'puppeteer-core';
import { serveVideo } from './video-server.mjs';

const { values: opts } = parseArgs({
  options: {
    fps: { type: 'string', default: '30' },
    out: { type: 'string', default: join('video', 'renders', 'chief-pitch-video.mp4') },
    'no-subs': { type: 'boolean', default: false },
    'no-music': { type: 'boolean', default: false },
  },
});
const fps = Number(opts.fps);
const out = resolve(opts.out);
const [W, H] = [1920, 1080];

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    ...(process.platform === 'win32'
      ? [
          `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']),
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome or Edge not found: set CHROME_PATH to the browser binary.');
  return found;
}

const { server, url } = await serveVideo(5190);
const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--mute-audio'],
});
try {
  const page = await browser.newPage();
  await page.goto(`${url}/storyboard/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    () => window.renderVideo && document.getElementById('chiefLayer').contentWindow?.chiefRender,
  );
  const { duration } = await page.evaluate(
    (subtitles) => window.renderVideo.setup({ subtitles }),
    !opts['no-subs'],
  );

  // Soundtrack first (a WAV in the temp folder).
  const wav = join(tmpdir(), `chief-render-${process.pid}.wav`);
  const audio = await page.evaluate(
    (music) => window.renderVideo.audio({ music }),
    !opts['no-music'],
  );
  writeFileSync(wav, Buffer.from(audio, 'base64'));

  // ffmpeg reads the frames from stdin and muxes the soundtrack.
  mkdirSync(dirname(out), { recursive: true });
  const enc = spawn(
    ffmpeg,
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-i',
      '-',
      '-i',
      wav,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const done = new Promise((ok, fail) =>
    enc.on('close', (code) => (code ? fail(new Error(`ffmpeg exited with ${code}`)) : ok())),
  );

  const frames = Math.round(duration * fps);
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.renderVideo.frame(t), f / fps);
    const shot = await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
    if (!enc.stdin.write(shot)) await new Promise((r) => enc.stdin.once('drain', r));
    if (f % fps === 0 || f === frames - 1) {
      const pct = Math.round(((f + 1) / frames) * 100);
      process.stdout.write(`\rRendering ${pct}% (frame ${f + 1}/${frames})`);
    }
  }
  enc.stdin.end();
  await done;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\nDone in ${secs} s: ${out}`);
} finally {
  await browser.close();
  server.close();
}

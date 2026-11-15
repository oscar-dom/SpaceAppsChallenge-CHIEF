// Serves video/ on http://localhost:5180 and opens the storyboard (`npm run video`).
// The storyboard needs a server, not a file:// page, to play and export the voice-over.
import { exec } from 'node:child_process';
import { serveVideo } from './video-server.mjs';

const { url } = await serveVideo();
const page = `${url}/storyboard/`;
console.log(`Storyboard: ${page}  (Ctrl+C to stop)`);
const open =
  process.platform === 'win32'
    ? `start "" "${page}"`
    : process.platform === 'darwin'
      ? `open "${page}"`
      : `xdg-open "${page}"`;
exec(open);

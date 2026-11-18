const { execFile, spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');

const execute = promisify(execFile);
const x11Keys = { Backspace: 'BackSpace', Enter: 'Return', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', 'Control+A': 'ctrl+a' };

async function startLoginDesktop({ width, height }) {
  const folder = await mkdtemp(join(tmpdir(), 'smm-login-'));
  const authority = join(folder, 'Xauthority');
  // Xauthority FamilyWild entry. Each session has a separate cookie and X display.
  const record = Buffer.concat([
    Buffer.from([255, 255, 0, 0, 0, 0, 0, 18]), Buffer.from('MIT-MAGIC-COOKIE-1'),
    Buffer.from([0, 16]), randomBytes(16)
  ]);
  let display;
  let closed = false;
  let xvfb;
  let exit;
  async function close() {
    if (closed) return;
    closed = true;
    if (xvfb && xvfb.exitCode === null && xvfb.signalCode === null) xvfb.kill();
    if (exit) await exit;
    await rm(folder, { recursive: true, force: true });
  }
  try {
    await writeFile(authority, record, { mode: 0o600 });
    xvfb = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', `${width}x${height}x24`, '-nolisten', 'tcp', '-auth', authority], {
      stdio: ['ignore', 'ignore', 'ignore', 'pipe']
    });
    exit = new Promise(resolve => xvfb.once('close', resolve));
    display = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Xvfb did not start')), 5000);
      const finish = (callback, value) => { clearTimeout(timer); callback(value); };
      xvfb.once('error', error => finish(reject, error));
      xvfb.once('exit', () => finish(reject, new Error('Xvfb closed')));
      xvfb.stdio[3].once('data', bytes => {
        const number = bytes.toString().trim();
        if (/^\d+$/.test(number)) finish(resolve, `:${number}`);
        else finish(reject, new Error('Xvfb returned an invalid display number'));
      });
    });
  } catch (error) {
    await close();
    throw error;
  }
  const env = { ...process.env, DISPLAY: display, XAUTHORITY: authority };
  const options = { env, timeout: 4500, maxBuffer: 2 * 1024 * 1024 };

  function runInput(args, text) {
    if (text === undefined) return execute('xdotool', args, options);
    return new Promise((resolve, reject) => {
      const command = execFile('xdotool', args, options, error => error ? reject(error) : resolve());
      command.stdin.on('error', reject);
      command.stdin.end(text);
    });
  }

  return {
    env,
    profile: join(folder, 'chrome'),
    async focus() {
      const { stdout } = await execute('xdotool', ['search', '--onlyvisible', '--maxdepth', '1', '--name', 'Google Chrome|Chromium'], options);
      const window = stdout.trim().split(/\s+/).at(-1);
      if (!/^\d+$/.test(window)) throw new Error('No visible Chrome window');
      await runInput(['windowfocus', '--sync', window]);
    },
    async capture() {
      const { stdout } = await execute('ffmpeg', [
        '-nostdin', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${width}x${height}`,
        '-i', display, '-frames:v', '1', '-threads', '1', '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'
      ], { ...options, encoding: 'buffer' });
      return stdout;
    },
    async send(events) {
      let args = [];
      const flush = async () => { if (args.length) { await runInput(args); args = []; } };
      for (const event of events) {
        if (event.type === 'text') {
          await flush();
          await runInput(['type', '--clearmodifiers', '--delay', '0', '--file', '-'], event.text);
          continue;
        }
        if (event.type === 'key') {
          args.push('key', '--clearmodifiers', x11Keys[event.key] || event.key);
          continue;
        }
        const x = Math.min(width - 1, Math.floor(event.x * width));
        const y = Math.min(height - 1, Math.floor(event.y * height));
        args.push('mousemove', String(x), String(y));
        if (event.type === 'click') args.push('click', '1');
        else if (event.type === 'down') args.push('mousedown', '1');
        else if (event.type === 'up') args.push('mouseup', '1');
      }
      await flush();
    },
    close
  };
}

module.exports = { startLoginDesktop };

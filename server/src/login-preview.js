const { chromium } = require('playwright');
const { startLoginDesktop } = require('./login-desktop');

const viewport = { width: 980, height: 760 };
const keys = new Set(['Backspace', 'Delete', 'Enter', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Control+A']);

function activeLoginPage(session) {
  return session?.globalCookie && ['pending', 'scanned'].includes(session.status) &&
    Date.now() < session.expiresAt ? session.page : null;
}

async function captureLoginPreview(session) {
  const page = activeLoginPage(session);
  if (!page) return null;
  if (!session.preview) {
    session.preview = (session.inputQueue || Promise.resolve())
      .then(() => session.desktop ? session.desktop.capture() : page.screenshot({ type: 'jpeg', quality: 82 }))
      .finally(() => { session.preview = null; });
  }
  const bytes = await session.preview;
  return activeLoginPage(session) ? Buffer.from(bytes) : null;
}

function validLoginInputs(events) {
  return Array.isArray(events) && events.length > 0 && events.length <= 100 && events.every(event => {
    if (!event || typeof event !== 'object') return false;
    if (event.type === 'text') return typeof event.text === 'string' && event.text.length > 0 && event.text.length <= 256;
    if (event.type === 'key') return keys.has(event.key);
    return ['click', 'down', 'move', 'up'].includes(event.type) && [event.x, event.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1);
  });
}

async function sendLoginInputs(session, events) {
  if (!activeLoginPage(session)) return false;
  const previousFrame = session.preview;
  const operation = (session.inputQueue || Promise.resolve()).then(async () => {
    if (previousFrame) await previousFrame.catch(() => {});
    const page = activeLoginPage(session);
    if (!page) return false;
    if (session.desktop) {
      await session.desktop.send(events);
      return true;
    }
    for (const event of events) {
      if (event.type === 'text') await page.keyboard.insertText(event.text);
      else if (event.type === 'key') {
        if (event.key === 'Control+A') {
          await page.keyboard.down('Control');
          try { await page.keyboard.press('a'); } finally { await page.keyboard.up('Control'); }
        } else await page.keyboard.press(event.key);
      } else {
        const x = Math.min(viewport.width - 1, event.x * viewport.width);
        const y = Math.min(viewport.height - 1, event.y * viewport.height);
        if (event.type === 'click') {
          if (session.pointerDown) {
            try { await page.mouse.up(); } finally { session.pointerDown = false; }
          }
          await page.mouse.click(x, y);
          continue;
        }
        await page.mouse.move(x, y);
        if (event.type === 'down' && !session.pointerDown) {
          await page.mouse.down();
          session.pointerDown = true;
        } else if (event.type === 'up' && session.pointerDown) {
          await page.mouse.up();
          session.pointerDown = false;
        }
      }
    }
    return true;
  });
  session.inputQueue = operation.catch(() => {});
  return operation;
}

async function createInteractivePage(session) {
  if (process.platform === 'linux') {
    const desktop = await startLoginDesktop(viewport);
    if (session.status !== 'opening') {
      await desktop.close();
      return null;
    }
    session.desktop = desktop;
    let context;
    session.browser = { close: async () => {
      try { if (context) await context.close(); }
      finally { await desktop.close(); }
    } };
    context = await chromium.launchPersistentContext(desktop.profile, {
      channel: 'chrome', headless: false, env: desktop.env, viewport: null,
      args: ['--no-proxy-server', '--kiosk', '--window-position=0,0', `--window-size=${viewport.width},${viewport.height}`, '--force-device-scale-factor=1']
    });
    if (session.status !== 'opening') {
      await context.close();
      return null;
    }
    return context.pages()[0] || context.newPage();
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  if (session.status !== 'opening') {
    await browser.close();
    return null;
  }
  session.browser = browser;
  return browser.newPage({ viewport });
}

async function openLoginPage(session, page, url) {
  // Navigation can finish rendering after DOMContentLoaded times out.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  if (session.status !== 'opening') return false;
  if (session.desktop) {
    await page.bringToFront();
    await session.desktop.focus();
  }
  if (session.status !== 'opening') return false;
  session.page = page;
  session.status = 'pending';
  return true;
}

async function cancelLogin(service, sessionId) {
  const session = service.sessions.get(sessionId);
  if (!session?.globalCookie || !['opening', 'pending', 'scanned'].includes(session.status)) return;
  session.status = 'expired';
  try { await service._closeSession(session); }
  finally { service.sessions.delete(sessionId); }
}

module.exports = { captureLoginPreview, activeLoginPage, validLoginInputs, sendLoginInputs, createInteractivePage, openLoginPage, cancelLogin };

const fs = require('fs');
const path = require('path');

// Windows Playwright can hit EPERM when creating artifacts in the system Temp.
// On Linux, keep the system temp directory for Chromium's short Unix socket paths.
if (process.platform === 'win32') {
  const browserTemp = path.join(__dirname, '..', 'tmp', 'playwright');
  fs.mkdirSync(browserTemp, { recursive: true });
  process.env.TEMP = browserTemp;
  process.env.TMP = browserTemp;
  process.env.TMPDIR = browserTemp;
}

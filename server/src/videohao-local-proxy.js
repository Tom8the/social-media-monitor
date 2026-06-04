const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const net = require('net');
const { Proxy } = require('http-mitm-proxy');
const { database } = require('./mysql-db');
const VideohaoScraper = require('./videohao-scraper');

const PLACEHOLDER_TITLE = '\u89c6\u9891\u53f7\u4f5c\u54c1\uff08\u5f85\u8865\u5168\uff09';
const PLACEHOLDER_DESCRIPTION = '\u901a\u8fc7\u672c\u5730\u5fae\u4fe1\u91c7\u96c6\u5230\u7684\u89c6\u9891\uff0c\u6807\u9898\u548c\u53d1\u5e03\u65f6\u95f4\u5f85\u8865\u5168';

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function parseCount(value) {
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  if (!value) return 0;
  const raw = String(value).replace(/,/g, '').replace(/[+\s]/g, '').trim();
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (raw.includes('亿')) return Math.round(num * 100000000);
  if (raw.includes('万') || /w$/i.test(raw)) return Math.round(num * 10000);
  if (raw.includes('千') || /k$/i.test(raw)) return Math.round(num * 1000);
  return Math.round(num);
}

class VideohaoLocalProxy {
  constructor() {
    this.proxy = null;
    this.port = Number(process.env.VIDEOHAO_PROXY_PORT || 8899);
    this.sslCaDir = path.join(__dirname, '..', 'tmp', 'videohao-proxy-ca');
    this.activeAccount = null;
    this.capturedCount = 0;
    this.bridgeChunks = new Map();
    this.bridgeClients = new Map();
    this.pendingBridgeCommands = [];
    this.bridgeTemplatePath = path.join(__dirname, '..', 'tmp', 'videohao-bridge-request-template.json');
    this.bridgeFailureLogPath = path.join(__dirname, '..', 'tmp', 'videohao-bridge-failures.jsonl');
    this.bridgeHealth = {
      attempts: 0,
      successes: 0,
      failures: 0,
      lastSuccessAt: null,
      lastFailure: null
    };
    this.lastEvents = [];
    this.bridgeRequestTemplate = this._loadBridgeRequestTemplate();
    this.lastResolvedProfile = null;
    this.scraperParser = new VideohaoScraper();
    this.suppressPostPersistence = false;
  }

  async start(accountId, port = this.port) {
    const accounts = await database.getAllAccounts({ platform: 'videohao' });
    const account = accounts.find(item => item.id === accountId);
    if (!account) {
      return { success: false, error: '视频号账号不存在' };
    }

    this.activeAccount = account;
    this.port = Number(port || this.port);
    if (!this.proxy) {
      await this._listen();
    }

    this._pushEvent('proxy:active-account', {
      accountId: account.id,
      nickname: account.nickname,
      port: this.port
    });

    return {
      success: true,
      data: this.getStatus()
    };
  }

  async stop() {
    if (this.proxy) {
      await new Promise(resolve => this.proxy.close(resolve));
      this.proxy = null;
    }
    this.activeAccount = null;
    this._pushEvent('proxy:stopped', {});
    return { success: true };
  }

  getStatus() {
    const caPath = path.join(this.sslCaDir, 'certs', 'ca.pem');
    return {
      running: !!this.proxy,
      port: this.port,
      activeAccount: this.activeAccount ? {
        id: this.activeAccount.id,
        nickname: this.activeAccount.nickname,
        unique_id: this.activeAccount.unique_id
      } : null,
      capturedCount: this.capturedCount,
      caPath,
      hasCa: fs.existsSync(caPath),
      backgroundBridge: this._getBackgroundBridgeStatus(),
      bridgeHealth: this.bridgeHealth,
      events: this.lastEvents.slice(-20)
    };
  }

  getCaPath() {
    return path.join(this.sslCaDir, 'certs', 'ca.pem');
  }

  async configureSystem(accountId, port = this.port) {
    const startResult = await this.start(accountId, port);
    if (!startResult.success) return startResult;

    const certResult = await this.installCertificate();
    const proxyResult = await this.enableSystemProxy();
    let automationResult = { success: true, skipped: true, reason: 'not-public-account' };
    if (this.activeAccount?.status === 'public') {
      automationResult = await this.autoOpenInDesktopWeChat(this.activeAccount);
    }
    return {
      success: certResult.success && proxyResult.success && automationResult.success,
      data: {
        ...this.getStatus(),
        certificate: certResult,
        systemProxy: proxyResult,
        automation: automationResult
      },
      error: certResult.error || proxyResult.error || automationResult.error || null
    };
  }

  async backgroundSync(accountId, options = {}) {
    return {
      success: false,
      unavailable: true,
      disabled: true,
      error: '后台桥采集方式已停用，请使用桌面微信采集'
    };
  }

  async syncWithDesktopFallback(accountId, options = {}) {
    return this.desktopSync(accountId, options);
  }

  async desktopSync(accountId, options = {}) {
    if (accountId && this.activeAccount?.id !== accountId) {
      const startResult = await this.start(accountId);
      if (!startResult.success) return startResult;
    }
    if (!this.activeAccount) {
      return { success: false, unavailable: true, error: '未找到待采集的视频号账号' };
    }

    await this.installCertificate();
    await this.enableSystemProxy();

    let automationResult = null;
    try {
      const beforeCapturedCount = this.capturedCount;
      automationResult = await this.autoOpenInDesktopWeChat(this.activeAccount);
      if (!automationResult.success) {
        return {
          success: false,
          unavailable: true,
          error: automationResult.error || '桌面微信采集失败',
          automation: automationResult
        };
      }

      const saved = await this._waitForCapturedIncrease(
        beforeCapturedCount,
        Number(options.timeout) || 30000
      );

      this._pushEvent('desktop-sync:completed', {
        accountId: this.activeAccount?.id,
        nickname: this.activeAccount?.nickname,
        saved
      });

      return {
        success: true,
        mode: 'desktop-wechat',
        saved,
        automation: automationResult
      };
    } finally {
      await this.closeDesktopWeChatSearchWindows().catch(error => {
        this._pushEvent('automation:search-windows-close-skipped', { error: error.message });
      });
    }
  }

  _recordBridgeSuccess(context = {}) {
    this.bridgeHealth.attempts += 1;
    this.bridgeHealth.successes += 1;
    this.bridgeHealth.lastSuccessAt = new Date().toISOString();
    this._pushEvent('background-bridge:success', context);
  }

  _recordBridgeFailure(result = {}, context = {}) {
    const bridgeStatus = this._getBackgroundBridgeStatus();
    const failure = {
      time: new Date().toISOString(),
      accountId: context.accountId || this.activeAccount?.id || null,
      nickname: context.nickname || this.activeAccount?.nickname || '',
      reason: result.error || 'unknown background bridge failure',
      stage: this._classifyBridgeFailure(result, bridgeStatus),
      fallbackAttempted: Boolean(context.fallbackAttempted),
      bridgeStatus,
      hasActiveAccount: Boolean(this.activeAccount),
      hasRequestTemplate: Boolean(this.bridgeRequestTemplate)
    };

    this.bridgeHealth.attempts += 1;
    this.bridgeHealth.failures += 1;
    this.bridgeHealth.lastFailure = failure;
    this._pushEvent('background-bridge:failure', failure);

    try {
      fs.mkdirSync(path.dirname(this.bridgeFailureLogPath), { recursive: true });
      fs.appendFileSync(this.bridgeFailureLogPath, `${JSON.stringify(failure)}\n`, 'utf8');
    } catch (error) {
      this._pushEvent('background-bridge:failure-log-write-failed', { message: error.message });
    }
  }

  _classifyBridgeFailure(result = {}, bridgeStatus = {}) {
    const reason = String(result.error || '');
    if (reason.includes('finder_username')) return 'missing-target-finder-username';
    if (reason.includes('尚未捕获') || reason.includes('请求模板')) return 'missing-request-template';
    if (reason.includes('尚未连接')) return 'bridge-client-unavailable';
    if (reason.includes('超时')) return bridgeStatus.clientCount > 0 ? 'bridge-command-timeout' : 'bridge-client-timeout';
    return result.unavailable ? 'bridge-unavailable' : 'bridge-error';
  }

  async _waitForCapturedIncrease(beforeCapturedCount, timeout = 30000) {
    const deadline = Date.now() + Math.max(1000, timeout);
    while (Date.now() < deadline) {
      const diff = Math.max(0, this.capturedCount - beforeCapturedCount);
      if (diff > 0) return diff;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return Math.max(0, this.capturedCount - beforeCapturedCount);
  }

  _resolveBackgroundTargetFinderUsername() {
    const current = this._normalizeFinderIdentity(
      this.activeAccount?.sec_uid || this.activeAccount?.unique_id
    );
    if (this.activeAccount?.status !== 'public') return current;
    const template = this.bridgeRequestTemplate;
    const login = this._normalizeFinderIdentity(template?.loginFinderUsername);
    const capturedTarget = this._normalizeFinderIdentity(template?.capturedTargetFinderUsername);
    if (current && current !== login) return current;
    return capturedTarget || current;
  }

  async _waitForBackgroundBridge(timeout = 3500) {
    const deadline = Date.now() + timeout;
    let status = this._getBackgroundBridgeStatus();
    while (!status.available && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 250));
      status = this._getBackgroundBridgeStatus();
    }
    return status;
  }

  async autoOpenInDesktopWeChat(account = this.activeAccount) {
    if (!account) {
      return { success: false, error: '未找到待采集的视频号账号' };
    }

    const keyword = String(account.nickname || account.unique_id || '').trim();
    if (!keyword) {
      return { success: false, error: '视频号账号缺少可搜索的名称' };
    }

    const scriptPath = path.join(__dirname, '..', 'wx_auto_open_videohao.py');
    if (!fs.existsSync(scriptPath)) {
      return {
        success: false,
        error: '未找到桌面微信自动化脚本，请先确认 wx_auto_open_videohao.py 已生成'
      };
    }

    const result = await this._execFile('python', [scriptPath, keyword], 60000);

    if (!result.success) {
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      const missingWindow = output.includes('__AUTO_WECHAT_NO_WINDOW__');
      const blueWindow = output.includes('__AUTO_WECHAT_SKIP_BLUE_WINDOW__');
      const loginRequired = output.includes('__AUTO_WECHAT_LOGIN_REQUIRED__');
      const openFailed = output.includes('__AUTO_WECHAT_OPEN_FAILED__');
      const error = loginRequired
        ? '桌面微信尚未登录，请先点击“进入微信”并完成登录'
        : missingWindow
        ? (blueWindow
          ? '检测到桌面微信窗口异常（蓝屏/空白），请完全关闭微信后重新打开并确认主界面可操作'
          : '未检测到已登录的桌面微信窗口，请先登录并打开微信主界面')
        : openFailed
          ? '桌面微信已打开，但没有成功切到目标视频号，请确认微信主窗口可操作'
          : '已启动采集代理，但自动操作桌面微信失败，请确认微信处于可操作状态';
      this._pushEvent('automation:failed', {
        accountId: account.id,
        nickname: account.nickname,
        error,
        stdout: (result.stdout || '').slice(-1000),
        stderr: (result.stderr || '').slice(-1000)
      });
      return { success: false, error, missingWindow, blueWindow, loginRequired };
    }

    this._pushEvent('automation:triggered', {
      accountId: account.id,
      nickname: account.nickname,
      keyword,
      stdout: (result.stdout || '').slice(-1000)
    });
    return { success: true, keyword };
  }

  async closeDesktopWeChatSearchWindows() {
    const scriptPath = path.join(__dirname, '..', 'wx_auto_open_videohao.py');
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: '未找到桌面微信自动化脚本' };
    }
    const result = await this._execFile('python', [scriptPath, '__close_search_windows__'], 10000);
    this._pushEvent(result.success ? 'automation:search-windows-closed' : 'automation:search-windows-close-failed', {
      stdout: (result.stdout || '').slice(-500),
      stderr: (result.stderr || '').slice(-500),
      error: result.error || ''
    });
    return result.success ? { success: true } : { success: false, error: result.error };
  }

  async checkDesktopWeChatStatus() {
    const scriptPath = path.join(__dirname, '..', 'wx_auto_open_videohao.py');
    if (!fs.existsSync(scriptPath)) {
      return { available: false, error: '未找到桌面微信自动化脚本' };
    }

    const result = await this._execFile('python', [scriptPath, '__check_status__'], 15000);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const loginRequired = output.includes('__AUTO_WECHAT_LOGIN_REQUIRED__');
    const missingWindow = output.includes('__AUTO_WECHAT_NO_WINDOW__');
    const processOnly = output.includes('__AUTO_WECHAT_STATUS_PROCESS_ONLY__');
    const minimized = output.includes('__AUTO_WECHAT_STATUS_MINIMIZED__');
    const available = result.success && (output.includes('__AUTO_WECHAT_STATUS_OK__') || processOnly || minimized);
    return {
      available,
      hasCookie: available,
      isValid: available,
      platform: 'videohao',
      mode: 'desktop-wechat',
      processOnly,
      minimized,
      loginRequired,
      missingWindow,
      updatedAt: new Date().toISOString(),
      message: available
        ? (processOnly || minimized ? '桌面微信已在后台运行' : '桌面微信已开启')
        : (loginRequired ? '桌面微信未登录' : missingWindow ? '未检测到桌面微信' : '桌面微信状态检测失败'),
      stdout: (result.stdout || '').slice(-1000),
      stderr: (result.stderr || '').slice(-1000)
    };
  }

  async resolvePublicAccountByDesktopWeChat(keyword, options = {}) {
    const nickname = String(keyword || '').trim();
    if (!nickname) {
      return { success: false, error: '请输入视频号名称' };
    }

    const probeAccount = {
      id: `resolve-${crypto.createHash('sha1').update(nickname).digest('hex').slice(0, 12)}`,
      platform_code: 'videohao',
      status: 'public',
      nickname,
      unique_id: `pending:${nickname}`,
      sec_uid: null
    };

    this.activeAccount = probeAccount;
    this.suppressPostPersistence = true;
    try {
      this.port = Number(options.port || this.port);
      if (!this.proxy) {
        await this._listen();
      }
      await this.enableSystemProxy();

      const before = Date.now();
      const automationResult = await this.autoOpenInDesktopWeChat(probeAccount);
      if (!automationResult.success) return automationResult;

      const deadline = Date.now() + (Number(options.timeout) || 20000);
      while (Date.now() < deadline) {
        const resolved = this._normalizeFinderIdentity(this.activeAccount?.unique_id);
        if (resolved && resolved.includes('@finder') && !resolved.startsWith('pending:')) {
          const data = this._buildResolvedAccountData({
            nickname,
            finderUsername: resolved,
            capturedAfter: before
          });
          await this.closeDesktopWeChatSearchWindows().catch(() => {});
          return {
            success: true,
            data
          };
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        success: false,
        error: '已打开目标视频号主页，但没有捕获到 finder_username，请稍后重试'
      };
    } finally {
      this.suppressPostPersistence = false;
    }
  }

  _buildResolvedAccountData({ nickname, finderUsername, capturedAfter = 0 }) {
    const profile = this.lastResolvedProfile || {};
    const useProfile = profile.capturedAt >= capturedAfter &&
      this._normalizeFinderIdentity(profile.username) === this._normalizeFinderIdentity(finderUsername);
    return {
      unique_id: finderUsername,
      sec_uid: finderUsername,
      nickname: (useProfile && profile.nickname) || nickname,
      avatar: (useProfile && profile.avatar) || '',
      signature: (useProfile && profile.signature) || '',
      follower_count: Number(useProfile && profile.follower_count) || 0,
      video_count: Number(useProfile && profile.video_count) || 0,
      verified: 0,
      status: 'public',
      source: 'desktop-wechat'
    };
  }

  async installCertificate() {
    const caPath = this.getCaPath();
    if (!fs.existsSync(caPath)) {
      return { success: false, error: 'CA证书尚未生成，请先启动本地采集代理' };
    }

    const result = await this._execFile('certutil.exe', ['-user', '-addstore', 'Root', caPath]);
    this._pushEvent(result.success ? 'system:cert-installed' : 'system:cert-install-failed', {
      caPath,
      message: result.error || result.stdout.slice(-200)
    });
    return result.success
      ? { success: true, caPath }
      : { success: false, caPath, error: result.error };
  }

  async enableSystemProxy() {
    const server = `127.0.0.1:${this.port}`;
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const enable = await this._execFile('reg.exe', ['add', key, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
    if (!enable.success) return { success: false, error: enable.error };

    const setServer = await this._execFile('reg.exe', ['add', key, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', server, '/f']);
    if (!setServer.success) return { success: false, error: setServer.error };

    await this._notifyProxyChanged();
    this._pushEvent('system:proxy-enabled', { server });
    return { success: true, server };
  }

  async disableSystemProxy() {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const result = await this._execFile('reg.exe', ['add', key, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
    await this._notifyProxyChanged();
    this._pushEvent(result.success ? 'system:proxy-disabled' : 'system:proxy-disable-failed', {
      message: result.error || result.stdout.slice(-200)
    });
    return result.success ? { success: true } : { success: false, error: result.error };
  }

  async _notifyProxyChanged() {
    const script = `
      $sig = '[DllImport("wininet.dll", SetLastError = true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);'
      $type = Add-Type -MemberDefinition $sig -Name WinInet -Namespace Native -PassThru
      $type::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
      $type::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
    `;
    await this._execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]).catch(() => {});
  }

  _execFile(file, args, timeout = 30000) {
    return new Promise(resolve => {
      execFile(file, args, { windowsHide: true, timeout }, (error, stdout = '', stderr = '') => {
        if (error) {
          resolve({ success: false, error: stderr || stdout || error.message, stdout, stderr });
          return;
        }
        resolve({ success: true, stdout, stderr });
      });
    });
  }

  _getBackgroundBridgeStatus() {
    const now = Date.now();
    for (const [clientId, client] of this.bridgeClients) {
      if (now - client.seenAt > 10000) this.bridgeClients.delete(clientId);
    }
    const clients = [...this.bridgeClients.values()];
    const lastSeenAt = clients.reduce((latest, client) => Math.max(latest, client.seenAt), 0);
    return {
      available: clients.length > 0 && Boolean(this.bridgeRequestTemplate),
      clientCount: clients.length,
      pendingCommands: this.pendingBridgeCommands.length,
      hasRequestTemplate: Boolean(this.bridgeRequestTemplate),
      lastClientSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null
    };
  }

  _loadBridgeRequestTemplate() {
    try {
      const template = JSON.parse(fs.readFileSync(this.bridgeTemplatePath, 'utf8'));
      return this._normalizeBridgeRequestTemplate(template, true);
    } catch (error) {
      return this._migrateCapturedBridgeRequestTemplate();
    }
  }

  _normalizeBridgeRequestTemplate(template, persist = false) {
    if (!template?.params) return template || null;
    const request = this._parseJsonLike(template.params.req_json);
    if (!request || typeof request !== 'object') return template;

    const normalized = {
      ...template,
      loginFinderUsername: this._normalizeFinderIdentity(request.finder_username),
      capturedTargetFinderUsername: this._normalizeFinderIdentity(request.username)
    };

    if (persist) {
      try {
        fs.mkdirSync(path.dirname(this.bridgeTemplatePath), { recursive: true });
        fs.writeFileSync(this.bridgeTemplatePath, JSON.stringify(normalized, null, 2));
      } catch (error) {
        this._pushEvent('background-sync:template-normalize-failed', { message: error.message });
      }
    }

    return normalized;
  }

  _migrateCapturedBridgeRequestTemplate() {
    const capturePath = path.join(
      __dirname,
      '..',
      'tmp',
      'videohao-proxy-captures',
      'bridge-jsapi-pc_finderuserpage.json'
    );
    try {
      const text = fs.readFileSync(capturePath, 'utf8');
      const match = text.match(
        /"params"\s*:\s*\{\s*"req_json"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"url"\s*:\s*"([^"]+)"\s*,\s*"cgi_cmdid"\s*:\s*(\d+)\s*,\s*"h5AuthToken"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"is_security_check"\s*:\s*(true|false)\s*,\s*"scope"\s*:\s*"([^"]+)"/
      );
      if (!match) return null;
      const reqJson = JSON.parse(`"${match[1]}"`);
      const request = JSON.parse(reqJson);
      const template = {
        name: 'finderH5ExtTransfer',
        params: {
          req_json: reqJson,
          url: match[2],
          cgi_cmdid: Number(match[3]),
          h5AuthToken: JSON.parse(`"${match[4]}"`),
          is_security_check: match[5] === 'true',
          scope: match[6]
        },
        loginFinderUsername: this._normalizeFinderIdentity(request.finder_username),
        capturedTargetFinderUsername: this._normalizeFinderIdentity(request.username),
        capturedAt: new Date().toISOString(),
        migratedFromCapture: true
      };
      fs.mkdirSync(path.dirname(this.bridgeTemplatePath), { recursive: true });
      fs.writeFileSync(this.bridgeTemplatePath, JSON.stringify(template, null, 2));
      return template;
    } catch (error) {
      return null;
    }
  }

  _cacheBridgeRequestTemplate(bridgePayload) {
    const kind = String(bridgePayload?.kind || '');
    if (!['jsapi-request', 'jsapi-response', 'background-jsapi-response'].includes(kind)) return;
    const payload = bridgePayload?.payload || {};
    const params = payload.params || {};
    const cgiPath = String(params.url || '');
    if (!cgiPath.includes('pc_finderuserpage')) return;
    const request = this._parseJsonLike(params.req_json);
    if (!request?.username || !request?.finder_username) return;

    this.bridgeRequestTemplate = {
      name: payload.name || 'finderH5ExtTransfer',
      params,
      loginFinderUsername: this._normalizeFinderIdentity(request.finder_username),
      capturedTargetFinderUsername: this._normalizeFinderIdentity(request.username),
      capturedAt: new Date().toISOString()
    };
    try {
      fs.mkdirSync(path.dirname(this.bridgeTemplatePath), { recursive: true });
      fs.writeFileSync(this.bridgeTemplatePath, JSON.stringify(this.bridgeRequestTemplate, null, 2));
    } catch (error) {
      this._pushEvent('background-sync:template-save-failed', { message: error.message });
    }
  }

  _createBridgeReplayRequest(targetFinderUsername) {
    const template = this.bridgeRequestTemplate;
    if (!template?.params) return null;
    const params = JSON.parse(JSON.stringify(template.params));
    const request = this._parseJsonLike(params.req_json);
    if (!request || typeof request !== 'object') return null;
    request.finder_basereq = request.finder_basereq || {};
    request.finder_basereq.request_id = `${Date.now()}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
    request.object_id = '0';
    request.username = targetFinderUsername;
    request.finder_username = template.loginFinderUsername || request.finder_username || '';
    request.last_buffer = '';
    request.need_fans_count = 0;
    params.req_json = JSON.stringify(request);
    params.url = '/cgi-bin/micromsg-bin/pc_finderuserpage';
    return {
      name: template.name || 'finderH5ExtTransfer',
      params
    };
  }

  _takeBridgeCommand(fullUrl) {
    try {
      const parsed = new URL(fullUrl);
      const clientId = String(parsed.searchParams.get('clientId') || '').trim();
      if (!clientId) return null;
      this.bridgeClients.set(clientId, { id: clientId, seenAt: Date.now() });
      const command = this.pendingBridgeCommands.find(item => !item.claimedAt);
      if (!command) return null;
      command.claimedAt = Date.now();
      this._pushEvent('background-sync:claimed', {
        commandId: command.id,
        accountId: command.accountId,
        targetFinderUsername: command.targetFinderUsername
      });
      return {
        id: command.id,
        name: command.name,
        params: command.params
      };
    } catch (error) {
      return null;
    }
  }

  _finishBridgeCommand(commandId, result) {
    const command = this.pendingBridgeCommands.find(item => item.id === commandId);
    if (!command) return;
    clearTimeout(command.timer);
    this.pendingBridgeCommands = this.pendingBridgeCommands.filter(item => item.id !== commandId);
    command.resolve(result);
  }

  async _listen() {
    fs.mkdirSync(this.sslCaDir, { recursive: true });
    this.proxy = new Proxy();
    this.proxy.use(Proxy.gunzip);    this.proxy.onConnect((req, socket, head, callback) => {
      const target = String(req.url || req.headers?.host || '');
      const host = target.split(':')[0];
      const port = Number(target.split(':')[1] || 443);
      const shouldIntercept = host.includes('channels.weixin.qq.com') ||
        host.includes('finder.video.qq.com') ||
        host.includes('weixin.qq.com');

      if (shouldIntercept) {
        return callback();
      }

      const conn = net.connect({ port, host, allowHalfOpen: true }, () => {
        socket.write('HTTP/1.1 200 OK\r\n\r\n', 'utf8', () => {
          conn.pipe(socket);
          socket.pipe(conn);
          if (head && head.length) {
            conn.write(head);
          }
        });
      });
      conn.on('error', err => {
        this._pushEvent('proxy:tunnel-error', { host: target, message: err.message });
        socket.destroy();
      });
      socket.on('error', () => conn.destroy());
    });

    this.proxy.onError((ctx, err, kind) => {
      const errorUrl = ctx?.clientToProxyRequest?.url || '';
      if (errorUrl) {
        const host = String(ctx?.clientToProxyRequest?.headers?.host || '');
        const fullUrl = errorUrl.startsWith('http') ? errorUrl : `https://${host}${errorUrl}`;
        this._processUrlCapture(fullUrl).catch(() => {});
      }
      this._pushEvent('proxy:error', {
        kind,
        message: err.message,
        url: errorUrl
      });
    });

    this.proxy.onRequest((ctx, callback) => {
      const host = String(ctx.clientToProxyRequest.headers.host || '');
      const url = String(ctx.clientToProxyRequest.url || '');
      if (!this._shouldCapture(host, url)) {
        return callback();
      }

      this._processRequestCapture(ctx).catch(error => {
        this._pushEvent('capture:request-failed', { message: error.message });
      });
      if (url.includes('/web/codex-command')) {
        const fullUrl = url.startsWith('http') ? url : `https://${host}${url}`;
        const command = this._takeBridgeCommand(fullUrl);
        const body = command ? JSON.stringify(command) : '';
        ctx.proxyToClientResponse.writeHead(command ? 200 : 204, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(body)
        });
        ctx.proxyToClientResponse.end(body);
        return;
      }
      if (url.includes('/web/codex-bridge')) {
        ctx.proxyToClientResponse.writeHead(204);
        ctx.proxyToClientResponse.end();
        return;
      }

      const chunks = [];
      const shouldInjectBridge = host.includes('channels.weixin.qq.com') && url.includes('/web/pages/profile');
      if (shouldInjectBridge) {
        ctx.onResponse((ctx, callback) => {
          delete ctx.serverToProxyResponse.headers['content-length'];
          return callback(null);
        });
      }
      ctx.onResponseData((ctx, chunk, callback) => {
        chunks.push(chunk);
        return callback(null, shouldInjectBridge ? undefined : chunk);
      });
      ctx.onResponseEnd((ctx, callback) => {
        const body = Buffer.concat(chunks);
        if (shouldInjectBridge) {
          ctx.proxyToClientResponse.write(this._injectBridgeScript(body));
        }
        this._processCapture(ctx, body).finally(() => callback());
      });

      return callback();
    });

    await new Promise((resolve, reject) => {
      this.proxy.listen({ port: this.port, host: '127.0.0.1', sslCaDir: this.sslCaDir }, err => {
        if (err) reject(err);
        else resolve();
      });
    });

    this._pushEvent('proxy:started', { port: this.port, caPath: this.getCaPath() });
  }

  _shouldCapture(host, url) {
    return host.includes('channels.weixin.qq.com') ||
      host.includes('finder.video.qq.com') ||
      host.includes('weixin.qq.com') ||
      url.includes('commonFinderJsApi') ||
      url.includes('openFinderFeed');
  }

  async _processCapture(ctx, bodyBuffer) {
    if (!this.activeAccount) return;
    const host = String(ctx.clientToProxyRequest.headers.host || '');
    const requestPath = String(ctx.clientToProxyRequest.url || '');
    const contentType = String(ctx.serverToProxyResponse?.headers?.['content-type'] || '');
    const fullUrl = requestPath.startsWith('http')
      ? requestPath
      : `https://${host}${requestPath}`;
    const posts = [];
    const linkPost = this._extractPostFromUrl(fullUrl);
    if (linkPost) posts.push(linkPost);

    if (bodyBuffer.length > 0 && bodyBuffer.length < 15 * 1024 * 1024) {
      const body = this._bufferToUsefulText(bodyBuffer, contentType, requestPath);
      const json = this._parseJsonLike(body);
      if (json) {
        posts.push(...this._extractPostsFromJson(json));
      }
      posts.push(...this._extractPostsFromText(body));
    }

    const saved = await this._savePosts(posts, fullUrl);
    if (saved > 0) {
      this._pushEvent('capture:saved', {
        accountId: this.activeAccount.id,
        nickname: this.activeAccount.nickname,
        count: saved,
        url: fullUrl.slice(0, 180)
      });
    }
  }

  async _processRequestCapture(ctx) {
    if (!this.activeAccount) return;
    const host = String(ctx.clientToProxyRequest.headers.host || '');
    const requestPath = String(ctx.clientToProxyRequest.url || '');
    const fullUrl = requestPath.startsWith('http')
      ? requestPath
      : `https://${host}${requestPath}`;

    await this._processUrlCapture(fullUrl);
  }

  async _processUrlCapture(fullUrl) {
    if (!this.activeAccount) return;
    const bridgePayload = this._collectBridgePayload(fullUrl);
    if (bridgePayload) {
      this._cacheBridgeRequestTemplate(bridgePayload);
      const bridgeTarget = this._resolveBridgePayloadTarget(bridgePayload);
      if (!bridgeTarget.shouldPersist) {
        this._pushEvent('capture:bridge-skipped', {
          accountId: this.activeAccount.id,
          kind: bridgePayload.kind || '',
          username: bridgeTarget.username || ''
        });
        if (bridgePayload.kind === 'background-jsapi-response') {
          this._finishBridgeCommand(bridgePayload?.payload?.commandId, {
            success: false,
            error: '后台桥返回的账号与待采集账号不匹配'
          });
        }
        return;
      }
      await this._refreshActiveAccountIdentity(bridgeTarget.username);
      this._rememberResolvedProfile(bridgePayload, bridgeTarget.username);
      const saved = await this._savePosts(this._extractPostsFromJson(bridgePayload), fullUrl);
      this._pushEvent('capture:bridge', {
        accountId: this.activeAccount.id,
        count: saved,
        kind: bridgePayload.kind || ''
      });
      if (bridgePayload.kind === 'background-jsapi-response') {
        this._finishBridgeCommand(bridgePayload?.payload?.commandId, {
          success: true,
          mode: 'background-bridge',
          saved
        });
      }
      return;
    }
    const posts = [];
    const linkPost = this._extractPostFromUrl(fullUrl);
    if (linkPost) posts.push(linkPost);
    if (posts.length === 0) return;

    const saved = await this._savePosts(posts, fullUrl);
    if (saved > 0) {
      this._pushEvent('capture:media-saved', {
        accountId: this.activeAccount.id,
        nickname: this.activeAccount.nickname,
        count: saved,
        url: fullUrl.slice(0, 180)
      });
    }
  }

  _resolveBridgePayloadTarget(bridgePayload) {
    const kind = String(bridgePayload?.kind || '');
    const targetIds = [
      this._normalizeFinderIdentity(this.activeAccount?.unique_id),
      this._normalizeFinderIdentity(this.activeAccount?.sec_uid)
    ].filter(Boolean);

    if (kind === 'profile-store') {
      const username = this._normalizeFinderIdentity(bridgePayload?.payload?.username);
      if (this.activeAccount?.status === 'public') {
        return {
          shouldPersist: true,
          username: ''
        };
      }
      return {
        shouldPersist: this._shouldPersistResolvedUsername(username, targetIds),
        username
      };
    }
    if (!['jsapi-response', 'background-jsapi-response'].includes(kind)) {
      return { shouldPersist: false, username: '' };
    }

    const params = bridgePayload?.payload?.params || {};
    const cgiPath = String(params.url || '');
    if (!cgiPath.includes('finderuserpage')) {
      return { shouldPersist: false, username: '' };
    }
    const responseProfile = this._extractBridgeResponseProfile(bridgePayload);
    const request = this._parseJsonLike(params.req_json);
    const username = this._normalizeFinderIdentity(firstPresent(
      responseProfile?.username,
      request?.username,
      request?.finderUsername,
      request?.finder_username
    ));
    return {
      shouldPersist: this._shouldPersistResolvedUsername(username, targetIds),
      username
    };
  }

  _shouldPersistResolvedUsername(username, targetIds) {
    if (!username) return false;
    if (targetIds.includes(username)) return true;
    if (this.activeAccount?.status === 'public' && this._looksLikeTemporaryFinderIdentity(this.activeAccount?.unique_id)) {
      return true;
    }
    return false;
  }

  _normalizeFinderIdentity(value) {
    return String(value || '').trim().replace(/^@/, '');
  }

  _looksLikeTemporaryFinderIdentity(value) {
    const raw = this._normalizeFinderIdentity(value);
    return !raw ||
      raw.startsWith('pending:') ||
      raw.startsWith('videohao_public_') ||
      raw.startsWith('vh_public_') ||
      raw.startsWith('export/');
  }

  _extractBridgeResponseProfile(bridgePayload) {
    const response = bridgePayload?.payload?.response;
    const respJson = response?.jsapi_resp?.resp_json;
    const parsed = this._parseJsonLike(respJson);
    if (!parsed || typeof parsed !== 'object') return null;
    const contact = parsed.contact || parsed.finder_user_info?.contact || {};
    const objects = Array.isArray(parsed.object) ? parsed.object : [];
    const firstObject = objects.find(item => item && typeof item === 'object') || {};
    const firstContact = firstObject.contact || {};
    const username = this._normalizeFinderIdentity(firstPresent(
      contact.username,
      firstContact.username,
      firstObject.username,
      parsed.username
    ));
    if (!username) return null;
    return {
      username,
      nickname: firstPresent(contact.nickname, firstContact.nickname, firstObject.nickname) || '',
      avatar: firstPresent(contact.head_url, contact.headUrl, firstContact.head_url, firstContact.headUrl) || '',
      signature: firstPresent(contact.signature, firstContact.signature) || '',
      video_count: parseCount(firstPresent(parsed.original_info?.original_count, parsed.finder_user_info?.original_count)),
      follower_count: parseCount(firstPresent(parsed.fans_count, parsed.fansCount, contact.fans_count, contact.fansCount))
    };
  }

  _rememberResolvedProfile(bridgePayload, username) {
    const profile = this._extractBridgeResponseProfile(bridgePayload);
    if (!profile) return;
    const normalized = this._normalizeFinderIdentity(username || profile.username);
    if (normalized && this._normalizeFinderIdentity(profile.username) !== normalized) return;
    this.lastResolvedProfile = {
      ...profile,
      capturedAt: Date.now()
    };
  }

  async _refreshActiveAccountIdentity(username) {
    const normalized = this._normalizeFinderIdentity(username);
    if (!normalized || !this.activeAccount) return;
    const currentUniqueId = this._normalizeFinderIdentity(this.activeAccount.unique_id);
    const currentSecUid = this._normalizeFinderIdentity(this.activeAccount.sec_uid);
    if (currentUniqueId === normalized && currentSecUid === normalized) return;
    if (!this._looksLikeTemporaryFinderIdentity(this.activeAccount.unique_id) && currentUniqueId) return;

    const updated = await database.updateAccount(this.activeAccount.id, {
      unique_id: normalized,
      sec_uid: normalized
    }).catch(() => null);

    this.activeAccount = {
      ...this.activeAccount,
      unique_id: normalized,
      sec_uid: normalized
    };

    this._pushEvent('account:identity-refreshed', {
      accountId: this.activeAccount.id,
      nickname: this.activeAccount.nickname,
      unique_id: normalized,
      persisted: Boolean(updated)
    });
  }

  _injectBridgeScript(bodyBuffer) {
    const html = bodyBuffer.toString('utf8');
    if (html.includes('__videohaoBridgeHooked')) return bodyBuffer;
    const script = `<script>
      (() => {
        if (window.__videohaoBridgeHooked) return;
        window.__videohaoBridgeHooked = true;
        const emit = (kind, payload) => {
          try {
            const text = JSON.stringify({ kind, payload });
            const data = btoa(unescape(encodeURIComponent(text))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            const size = 1400;
            const total = Math.ceil(data.length / size);
            const send = index => {
              if (index >= total) return;
              const url = '/web/codex-bridge?id=' + id + '&kind=' + encodeURIComponent(kind) + '&index=' + index + '&total=' + total + '&data=' + encodeURIComponent(data.slice(index * size, (index + 1) * size));
              fetch(url, { cache: 'no-store' })
                .catch(() => {})
                .finally(() => send(index + 1));
            };
            send(0);
          } catch {}
        };
        const hookWeixinBridge = () => {
          const bridge = window.WeixinJSBridge;
          if (!bridge || bridge.__videohaoBridgeHooked || typeof bridge.invoke !== 'function') return;
          bridge.__videohaoBridgeHooked = true;
          const originalInvoke = bridge.invoke.bind(bridge);
          bridge.__videohaoOriginalInvoke = originalInvoke;
          bridge.invoke = (name, params, callback) => {
            const shouldCapture = name === 'finderH5ExtTransfer' && String(params && params.url || '').includes('finderuserpage');
            if (shouldCapture) emit('jsapi-request', { name, params });
            const wrappedCallback = typeof callback === 'function'
              ? response => {
                  if (shouldCapture) emit('jsapi-response', { name, params, response });
                  return callback(response);
                }
              : callback;
            return originalInvoke(name, params, wrappedCallback);
          };
        };
        hookWeixinBridge();
        setInterval(hookWeixinBridge, 50);
        const controlClientId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const pollCommand = async () => {
          try {
            const response = await fetch('/web/codex-command?clientId=' + encodeURIComponent(controlClientId), {
              cache: 'no-store'
            });
            if (response.status !== 200) return;
            const command = await response.json();
            const bridge = window.WeixinJSBridge;
            if (!command || !command.id || !bridge || typeof bridge.invoke !== 'function') return;
            const invoke = bridge.__videohaoOriginalInvoke || bridge.invoke.bind(bridge);
            invoke(command.name, command.params, result => {
              emit('background-jsapi-response', {
                commandId: command.id,
                name: command.name,
                params: command.params,
                response: result
              });
            });
          } catch {}
        };
        setInterval(pollCommand, 800);
        pollCommand();
        setTimeout(() => {
          try {
            const app = document.querySelector('#app') && document.querySelector('#app').__vue_app__;
            const provides = app && app._context && app._context.provides;
            const pinia = provides && Reflect.ownKeys(provides)
              .map(key => provides[key])
              .find(value => value && value._s instanceof Map);
            const state = pinia && pinia._s.get('profile') && pinia._s.get('profile').$state;
            if (!state) return;
            const contact = (state.profileData && state.profileData.contact) || {};
            const cards = state.cardObjects || [];
            const payload = {
              username: state.username,
              fansCount: state.fansCount,
              originalCount: state.originalCount,
              contact: {
                username: contact.username,
                nickname: contact.nickname,
                headUrl: contact.headUrl,
                signature: contact.signature
              },
              cardObjects: cards.map(card => {
                const desc = card.objectDesc || {};
                return {
                  id: card.id,
                  objectNonceId: card.objectNonceId,
                  nickname: card.nickname,
                  username: card.username,
                  objectDesc: {
                    description: desc.description,
                    mediaType: desc.mediaType,
                    media: (desc.media || []).map(media => ({
                      url: media.url,
                      coverUrl: media.coverUrl,
                      thumbUrl: media.thumbUrl,
                      fullCoverUrl: media.fullCoverUrl,
                      fullUrl: media.fullUrl,
                      videoPlayLen: media.videoPlayLen
                    }))
                  },
                  createtime: card.createtime,
                  likeCount: card.likeCount,
                  commentCount: card.commentCount,
                  forwardCount: card.forwardCount,
                  favCount: card.favCount,
                  collectCount: card.collectCount
                };
              })
            };
            emit('profile-store', payload);
          } catch (error) {
            emit('profile-store-error', { error: String(error && error.message || error) });
          }
        }, 5200);
      })();
    </script>`;
    return Buffer.from(html.replace('</head>', `${script}</head>`));
  }

  _collectBridgePayload(fullUrl) {
    try {
      const parsed = new URL(fullUrl);
      if (!parsed.pathname.includes('/web/codex-bridge')) return null;
      const id = parsed.searchParams.get('id') || '';
      const index = Number(parsed.searchParams.get('index'));
      const total = Number(parsed.searchParams.get('total'));
      const data = parsed.searchParams.get('data') || '';
      const kind = parsed.searchParams.get('kind') || '';
      if (!id || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 2000 || !data) return null;
      const existing = this.bridgeChunks.get(id) || { chunks: new Array(total), createdAt: Date.now(), kind };
      existing.chunks[index] = data;
      this.bridgeChunks.set(id, existing);
      for (const [chunkId, value] of this.bridgeChunks) {
        if (Date.now() - value.createdAt > 60000) this.bridgeChunks.delete(chunkId);
      }
      if (existing.chunks.filter(chunk => typeof chunk === 'string').length !== total) return null;
      this.bridgeChunks.delete(id);
      const encoded = existing.chunks.join('').replace(/-/g, '+').replace(/_/g, '/');
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
      const jsonText = Buffer.from(padded, 'base64').toString('utf8');
      try {
        return JSON.parse(jsonText);
      } catch (error) {
        this._pushEvent('capture:bridge-parse-failed', {
          kind,
          total,
          message: error.message
        });
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  _bufferToUsefulText(buffer, contentType, requestPath) {
    if (!buffer || buffer.length === 0) return '';
    const text = buffer.toString('utf8').replace(/\u0000/g, '');
    if (!text.trim()) return '';
    const shouldInspect = contentType.includes('json') ||
      contentType.includes('text') ||
      contentType.includes('javascript') ||
      requestPath.includes('cgi-bin') ||
      text.includes('export/') ||
      text.includes('objectId') ||
      text.includes('feedID') ||
      text.includes('finder.video.qq.com');
    if (!shouldInspect) return '';
    return text;
  }

  _parseJsonLike(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      const jsonp = raw.match(/^[^(]+\(([\s\S]+)\)\s*;?$/);
      if (jsonp) {
        try {
          return JSON.parse(jsonp[1]);
        } catch (ignored) {}
      }
      const match = raw.match(/cgiData\s*=\s*(\{[\s\S]*?\})\s*;?<\/script>/) ||
        raw.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?/);
      if (!match) return null;
      try {
        return JSON.parse(match[1]);
      } catch (ignored) {
        return null;
      }
    }
  }

  _extractPostsFromText(text) {
    const raw = String(text || '');
    if (!raw || (!raw.includes('export/') && !raw.includes('commonFinderJsApi'))) return [];
    const normalized = raw
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"');

    const posts = [];
    const urlMatches = normalized.match(/https?:\/\/channels\.weixin\.qq\.com\/[^\s"'<>]+/g) || [];
    for (const url of urlMatches) {
      const linkPost = this._extractPostFromUrl(url);
      if (linkPost) posts.push(linkPost);
    }

    const feedRegex = /export\/[A-Za-z0-9_@./+\-=]+/g;
    const seen = new Set();
    let match;
    while ((match = feedRegex.exec(normalized))) {
      const feedId = match[0].replace(/[\\",}\]\s]+$/, '');
      if (seen.has(feedId)) continue;
      seen.add(feedId);
      const start = Math.max(0, match.index - 3500);
      const end = Math.min(normalized.length, match.index + 5000);
      const windowText = normalized.slice(start, end);
      const title = this._readTextField(windowText, ['title', 'shortTitle', 'wording']);
      const description = this._readTextField(windowText, ['description', 'desc', 'content']);
      const coverUrl = this._readFinderUrl(windowText, true);
      const videoUrl = this._readFinderUrl(windowText, false);
      const publishedAt = this._readNumberField(windowText, ['publishTime', 'createTime', 'createtime', 'timestamp', 'postTime']);
      const hasMetadata = title || description || coverUrl || publishedAt;
      if (!hasMetadata) continue;
      posts.push({
        video_id: feedId,
        title: title || description || '',
        description: description || title || '',
        cover_url: coverUrl || '',
        video_url: videoUrl || '',
        published_at: publishedAt,
        play_count: this._readNumberField(windowText, ['playCount', 'readCount', 'viewCount']),
        like_count: this._readNumberField(windowText, ['likeCount', 'likedCount']),
        comment_count: this._readNumberField(windowText, ['commentCount']),
        share_count: this._readNumberField(windowText, ['shareCount', 'forwardCount', 'forwardAggregationCount']),
        collect_count: this._readNumberField(windowText, ['collectCount', 'favoriteCount', 'favCount'])
      });
    }
    return posts;
  }

  _readTextField(text, names) {
    for (const name of names) {
      const quoted = new RegExp(`"${name}"\\s*:\\s*"((?:\\\\.|[^"\\\\]){1,1200})"`, 'i').exec(text);
      if (quoted) return this._decodeTextValue(quoted[1]);
      const loose = new RegExp(`${name}\\s*[:=]\\s*"((?:\\\\.|[^"\\\\]){1,1200})"`, 'i').exec(text);
      if (loose) return this._decodeTextValue(loose[1]);
    }
    return '';
  }

  _readNumberField(text, names) {
    for (const name of names) {
      const match = new RegExp(`"${name}"\\s*:\\s*"?([0-9]{1,13})"?`, 'i').exec(text) ||
        new RegExp(`${name}\\s*[:=]\\s*"?([0-9]{1,13})"?`, 'i').exec(text);
      if (match) return match[1];
    }
    return null;
  }

  _readFinderUrl(text, preferCover) {
    const matches = text.match(/https?:\/\/finder\.video\.qq\.com\/[^\s"'<>]+/g) || [];
    const wanted = matches.find(url => preferCover ? url.includes('/20304/') : url.includes('/20302/'));
    return wanted || '';
  }

  _decodeTextValue(value) {
    const raw = String(value || '').replace(/\\"/g, '"').replace(/\\\//g, '/');
    try {
      return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`).trim();
    } catch (e) {
      return raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16))).trim();
    }
  }

  _extractPostFromUrl(url) {
    try {
      const parsed = new URL(url);
      const extInfo = parsed.searchParams.get('extInfo');
      if (!extInfo) return null;
      const info = JSON.parse(decodeURIComponent(extInfo));
      const feedId = firstPresent(info.feedID, info.feedId, info.objectId, info.object_id);
      if (!feedId) return null;
      const title = firstPresent(info.title, info.desc, info.description) || '';
      const description = firstPresent(info.desc, info.description, info.title) || '';
      const coverUrl = firstPresent(info.coverUrl, info.cover_url, info.thumbUrl) || '';
      return {
        video_id: String(feedId),
        title,
        description,
        cover_url: coverUrl,
        video_url: url,
        published_at: null,
        content_type: title || description || coverUrl ? 'video' : 'video_media'
      };
    } catch (e) {
      return null;
    }
  }

  _extractMediaPostFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('finder.video.qq.com')) return null;
      if (!parsed.pathname.includes('/stodownload')) return null;

      const encfilekey = parsed.searchParams.get('encfilekey') || '';
      const mediaHash = parsed.searchParams.get('m') || '';
      const taskid = parsed.searchParams.get('taskid') || '';
      const videoId = mediaHash ||
        (encfilekey ? `media_${crypto.createHash('sha1').update(encfilekey).digest('hex')}` : '') ||
        (taskid ? `media_${taskid}` : '') ||
        `media_${crypto.createHash('sha1').update(url).digest('hex')}`;
      const isVideoFile = parsed.pathname.includes('/20302/');

      return {
        video_id: videoId,
        title: isVideoFile ? PLACEHOLDER_TITLE : '',
        description: isVideoFile ? PLACEHOLDER_DESCRIPTION : '',
        cover_url: '',
        video_url: url,
        published_at: null,
        content_type: isVideoFile ? 'video' : 'video_media'
      };
    } catch (e) {
      return null;
    }
  }

  _extractPostsFromJson(json) {
    const posts = [];
    posts.push(...this.scraperParser._extractPostsFromJson(json));
    this._walk(json, value => {
      if (!value || typeof value !== 'object') return;
      for (const child of Object.values(value)) {
        if (typeof child === 'string' && (
          child.includes('export/') ||
          child.includes('objectId') ||
          child.includes('objectDesc') ||
          child.includes('feedID') ||
          /^[\s]*[\[{]/.test(child)
        )) {
          const nestedJson = this._parseJsonLike(child);
          if (nestedJson) {
            posts.push(...this.scraperParser._extractPostsFromJson(nestedJson));
            posts.push(...this._extractPostsFromJson(nestedJson));
          }
          posts.push(...this._extractPostsFromText(child));
        }
      }
      const feedId = firstPresent(
        value.feedID, value.feedId, value.feed_id, value.objectId, value.object_id,
        value.objectDesc ? value.id : undefined,
        value.exportId, value.export_id, value.objectNonceId, value.objectNonce
      );
      if (!feedId) return;
      const desc = typeof value.objectDesc === 'object' && value.objectDesc
        ? value.objectDesc
        : (typeof value.desc === 'object' && value.desc ? value.desc : {});
      const media = Array.isArray(desc.media) ? desc.media[0] : {};
      posts.push({
        video_id: String(feedId),
        title: firstPresent(value.title, value.shortTitle, value.wording, desc.description, value.description, value.desc) || '',
        description: firstPresent(desc.description, value.description, value.wording, value.title) || '',
        cover_url: firstPresent(value.coverUrl, value.thumbUrl, media?.coverUrl, media?.thumbUrl, media?.fullCoverUrl) || '',
        video_url: firstPresent(value.videoUrl, value.url, media?.url, media?.fullUrl) || '',
        published_at: firstPresent(value.publishTime, value.createTime, value.timestamp, value.createtime),
        play_count: parseCount(firstPresent(value.playCount, value.readCount, value.viewCount)),
        like_count: parseCount(firstPresent(value.likeCount, value.likedCount, value.favCount)),
        comment_count: parseCount(firstPresent(value.commentCount, value.comments)),
        share_count: parseCount(firstPresent(value.shareCount, value.forwardCount, value.forwardAggregationCount)),
        collect_count: parseCount(firstPresent(value.collectCount, value.favoriteCount, value.favCount)),
        duration: parseCount(firstPresent(value.duration, media?.videoPlayLen))
      });
    }, 7000);
    return posts;
  }

  async _savePosts(posts, sourceUrl) {
    if (this.suppressPostPersistence || String(this.activeAccount?.id || '').startsWith('resolve-')) {
      return 0;
    }

    const map = new Map();
    for (const post of posts || []) {
      const videoId = String(post.video_id || '').trim();
      if (!videoId || map.has(videoId)) continue;
      map.set(videoId, post);
    }

    let saved = 0;
    for (const rawPost of map.values()) {
      const post = this._normalizePost(rawPost);
      if (!post.video_id) continue;
      const contentType = rawPost.content_type || post.content_type || 'video';
      const existing = await database.getVideoById(post.video_id, 'videohao').catch(() => null);
      const hasUsefulExisting = existing && Boolean(
        existing.title || existing.description || existing.cover_url || existing.published_at
      );
      const incomingHasRealTitle = post.title && !this._isPlaceholderTitle(post.title);
      const existingHasRealTitle = existing?.title && !this._isPlaceholderTitle(existing.title);
      if (contentType === 'video_media' && hasUsefulExisting) {
        post.title = existing.title || post.title;
        post.description = existing.description || post.description;
        post.cover_url = existing.cover_url || post.cover_url;
        post.published_at = existing.published_at || post.published_at;
        post.content_type = existing.content_type || 'video';
      }
      if (existing && !incomingHasRealTitle && existingHasRealTitle) {
        post.title = existing.title || post.title;
        post.description = existing.description || post.description;
        post.cover_url = existing.cover_url || post.cover_url;
        post.published_at = existing.published_at || post.published_at;
      }
      await database.upsertVideo({
        account_id: this.activeAccount.id,
        platform: 'videohao',
        video_id: post.video_id,
        content_type: contentType === 'video_media' && hasUsefulExisting
          ? (existing.content_type || 'video')
          : contentType,
        title: post.title || rawPost.title || '',
        description: post.description || rawPost.description || '',
        cover_url: post.cover_url || rawPost.cover_url || '',
        video_url: post.video_url || rawPost.video_url || sourceUrl || '',
        duration: post.duration || 0,
        topic_tags: post.topic_tags || '',
        play_count: post.play_count || 0,
        like_count: post.like_count || 0,
        comment_count: post.comment_count || 0,
        share_count: post.share_count || 0,
        collect_count: post.collect_count || 0,
        published_at: post.published_at || null,
        is_deleted: 0
      });
      saved++;
    }

    if (saved > 0) {
      this.capturedCount += saved;
      await database.updateAccount(this.activeAccount.id, {
        last_fetch_at: new Date().toISOString()
      }).catch(() => {});
    }
    return saved;
  }


  _normalizePost(rawPost) {
    const publishedAt = this._formatTime(firstPresent(
      rawPost.published_at,
      rawPost.publish_time,
      rawPost.publishTime,
      rawPost.createTime,
      rawPost.createtime,
      rawPost.timestamp
    ));
    return {
      video_id: String(rawPost.video_id || rawPost.id || '').trim(),
      content_type: rawPost.content_type || 'video',
      title: String(rawPost.title || rawPost.description || '').trim(),
      description: String(rawPost.description || rawPost.title || '').trim(),
      cover_url: String(rawPost.cover_url || rawPost.coverUrl || rawPost.thumbUrl || '').trim(),
      video_url: String(rawPost.video_url || rawPost.videoUrl || rawPost.url || '').trim(),
      duration: parseCount(rawPost.duration),
      play_count: parseCount(rawPost.play_count || rawPost.playCount || rawPost.readCount),
      like_count: parseCount(rawPost.like_count || rawPost.likeCount || rawPost.likedCount),
      comment_count: parseCount(rawPost.comment_count || rawPost.commentCount),
      share_count: parseCount(rawPost.share_count || rawPost.shareCount || rawPost.forwardCount),
      collect_count: parseCount(rawPost.collect_count || rawPost.collectCount || rawPost.favoriteCount),
      published_at: publishedAt,
      topic_tags: rawPost.topic_tags || this._extractTopicTags(rawPost.description || rawPost.title || '')
    };
  }

  _formatTime(value) {
    if (!value) return null;
    if (typeof value === 'number') {
      const ms = value > 100000000000 ? value : value * 1000;
      return this._formatDate(new Date(ms));
    }
    const raw = String(value).trim();
    if (/^\d{10,13}$/.test(raw)) return this._formatTime(Number(raw));
    const absolute = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (absolute) {
      const [, y, m, d, hh = '0', mm = '0', ss = '0'] = absolute;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}`;
    }
    return null;
  }

  _formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }

  _extractTopicTags(text) {
    const matches = String(text || '').match(/#[^#\s]+/g) || [];
    return matches.map(tag => tag.replace(/^#/, '')).join(',');
  }
  _isPlaceholderTitle(title) {
    const raw = String(title || '').trim();
    return !raw || raw === PLACEHOLDER_TITLE || raw.includes('待补全') || raw.includes('???');
  }

  _walk(root, visitor, limit = 5000) {
    const queue = [root];
    const seen = new WeakSet();
    let visited = 0;
    while (queue.length && visited < limit) {
      const current = queue.shift();
      visited++;
      if (!current || typeof current !== 'object') continue;
      if (seen.has(current)) continue;
      seen.add(current);
      visitor(current);
      const values = Array.isArray(current) ? current : Object.values(current);
      values.forEach(item => {
        if (item && typeof item === 'object') queue.push(item);
      });
    }
  }

  _pushEvent(type, payload) {
    this.lastEvents.push({
      type,
      payload,
      time: new Date().toISOString()
    });
    this.lastEvents = this.lastEvents.slice(-50);
    console.log('[VideohaoLocalProxy]', type, payload);
  }
}

module.exports = new VideohaoLocalProxy();






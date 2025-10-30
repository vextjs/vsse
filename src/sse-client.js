/**
 * vsse - Very Simple SSE client with single-connection multiplexing
 * 中文注释：统一 SSE 长连接 + POST 发起与回调分发；支持全局/单次 POST 配置；
 * 浏览器端使用 EventSource（支持自定义 headers via event-source-polyfill）。
 */

import { EventSourcePolyfill } from 'event-source-polyfill';

/**
 * @typedef {('progress'|'done'|'error'|'ping'|string)} SSEEventName
 */

/**
 * @template T
 * @typedef {Object} SSEMessage
 * @property {string=} requestId
 * @property {SSEEventName} event
 * @property {T=} payload
 * @property {string=} type
 * @property {any=} code
 * @property {string=} message
 * @property {number=} sentAt
 * @property {number=} seq        // 可选：序号（若服务端提供）
 * @property {number=} total      // 可选：总数（若服务端提供）
 * @property {any=} meta          // 可选：元信息（若服务端提供）
 * // 说明：除上述常见字段外，其余顶层字段也会原样透传至回调参数
 */

/**
 * @typedef {Object} PostOptions
 * @property {Record<string,string>=} headers
 * @property {number=} timeout               // POST 超时（ms）
 * @property {RequestCredentials=} credentials // include/same-origin/omit
 * @property {string=} token                 // Authorization: Bearer <token>
 * @property {AbortSignal=} signal           // 可选外部取消
 */

/**
 * @typedef {Object} SSEClientOptions
 * @property {string} url                    // SSE 服务地址（可含查询参数，如 userId）
 * @property {number=} idleTimeout           // 用户无操作多久断开 SSE，默认 30_000ms
 * @property {Record<string,string>=} defaultHeaders
 * @property {number=} defaultTimeout        // POST 默认超时
 * @property {RequestCredentials=} credentials // POST 默认 credentials
 * @property {string=} token                 // 全局 Authorization token
 * @property {string=} eventName             // SSE 事件名，默认 "message"（如你的后端用 notify，设置为 notify）
 * @property {boolean=} withHeartbeat        // 是否启用心跳监测，默认 true
 * @property {number=} expectedPingInterval  // 预期心跳周期（ms），默认 15_000
 * @property {boolean=} sseWithCredentials   // SSE 是否携带 Cookie，默认 false；跨域未允许凭据时建议保持 false
 * @property {Record<string,string>=} sseHeaders // SSE 连接自定义请求头（需要 event-source-polyfill 支持）
 * @property {number=} maxListeners          // 防泄漏保护，默认 1000
 * @property {{ baseMs:number, maxMs:number, factor:number, jitter:number }=} reconnectBackoff
 */

/**
 * @typedef {Object} ListenerHandle
 * @property {string} requestId
 * @property {() => void} unsubscribe        // 手动取消监听
 */

export class SSEClient {
  /**
   * @param {SSEClientOptions} opts
   */
  constructor(opts) {
    this.opts = {
      idleTimeout: 30_000,
      defaultTimeout: 10_000,
      eventName: 'message',
      withHeartbeat: true,
      expectedPingInterval: 15_000,
      maxListeners: 1000,
      reconnectBackoff: { baseMs: 1000, maxMs: 15_000, factor: 1.8, jitter: 0.3 },
      ...opts,
    };
    /** @type {EventSource|undefined} */
    this.es = undefined;
    /** @type {Map<string,{ cb: Function, createdAt: number }>} */
    this.listeners = new Map();
    /** @type {Set<Function>} 全局广播监听（无 requestId） */
    this.globalListeners = new Set();
    this.backoffState = { attempts: 0 };
    /** @type {number|undefined} */
    this.idleTimer = undefined;
    this.lastActiveAt = Date.now();
    this.lastMessageAt = 0;
    this.lastHeartbeatAt = 0;
    /** @type {number|undefined} */
    this.heartbeatIntervalId = undefined;

    // ✅ 防重复连接保护：连接状态跟踪
    /** @type {'disconnected'|'connecting'|'connected'|'error'} */
    this.connectionState = 'disconnected';
    /** @type {boolean} 连接锁：防止并发连接 */
    this._connectLock = false;
    /** @type {number} 连接尝试计数器（用于调试） */
    this._connectAttempts = 0;
    /** @type {number} 最后一次连接尝试的时间戳 */
    this._lastConnectAttempt = 0;
    /** @type {number} 防抖：最小连接间隔（ms） */
    this._minConnectInterval = 500;

    this.setupActivityListeners();
    // 懒连接：只有在有监听器时才连接
  }

  /** 动态更新配置；如果 url 改变会自动重连 */
  updateConfig(patch) {
    const needReconnect = !!(patch.url && patch.url !== this.opts.url);
    this.opts = { ...this.opts, ...patch };
    if (needReconnect) this.reconnect('url changed');
  }

  /** 生成唯一 requestId（简易 UUID v4） */
  createRequestId() {
    // 参考：短 UUID v4 生成
    // eslint-disable-next-line no-bitwise
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      // eslint-disable-next-line no-bitwise
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> (c / 4)).toString(16)
    );
  }

  /**
   * 发起 POST，并注册 SSE 回调。返回 ListenerHandle。
   * @template T
   * @param {string} postUrl
   * @param {any} body
   * @param {(msg:SSEMessage<T>)=>void} onEvent
   * @param {(PostOptions & { requestId?: string })=} options
   * @returns {Promise<ListenerHandle>}
   */
  async postAndListen(postUrl, body, onEvent, options = {}) {
    const requestId = options.requestId || this.createRequestId();

    if (this.listeners.size >= (this.opts.maxListeners ?? 1000)) {
      throw new Error(`Too many listeners: ${this.listeners.size}`);
    }
    this.listeners.set(requestId, { cb: onEvent, createdAt: Date.now() });

    // 确保连接
    this.maybeConnect('post');

    // 发送 POST（带上 requestId）
    const headers = {
      'Content-Type': 'application/json',
      ...(this.opts.defaultHeaders || {}),
      ...(options.headers || {}),
    };
    const token = options.token ?? this.opts.token;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ctrl = new AbortController();
    const timeoutMs = options.timeout ?? this.opts.defaultTimeout ?? 10_000;
    const timeout = window.setTimeout(() => ctrl.abort(), timeoutMs);

    const postBody = JSON.stringify({ ...(body || {}), requestId });

    try {
      const res = await fetch(postUrl, {
        method: 'POST',
        headers,
        body: postBody,
        credentials: options.credentials ?? this.opts.credentials,
        signal: options.signal ?? ctrl.signal,
      });
      if (!res || !res.ok) {
        this.listeners.delete(requestId);
        this.checkIdle();
        const status = res ? `${res.status} ${res.statusText}` : 'no response';
        throw new Error(`POST failed: ${status}`);
      }
    } catch (e) {
      this.listeners.delete(requestId);
      this.checkIdle();
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    const unsubscribe = () => {
      this.listeners.delete(requestId);
      this.checkIdle();
    };

    return { requestId, unsubscribe };
  }

  /**
   * 订阅“无 requestId”的全局广播
   * @param {(evt:SSEMessage<any>)=>void} cb
   * @returns {() => void} unsubscribe
   */
  onBroadcast(cb) {
    if (typeof cb !== 'function') throw new Error('onBroadcast(cb) requires a function');
    this.globalListeners.add(cb);
    // 若当前尚未连接且已有任意监听，则尝试建立连接
    this.maybeConnect('onBroadcast');
    return () => {
      this.globalListeners.delete(cb);
      this.checkIdle();
    };
  }

  /** 主动关闭 SSE 连接 */
  close(reason = 'manual') {
    if (this.es) {
      console.log(`[vsse] 关闭连接 (reason: ${reason})`);
      this.es.close();
      this.es = undefined;
    }
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = undefined;
    }
    this.clearIdleTimer();
    // ✅ 重置状态
    this.connectionState = 'disconnected';
    this._connectLock = false;
  }

  /** 强制重连 */
  reconnect(reason = 'manual') {
    console.log(`[vsse] 执行重连 (reason: ${reason})`);
    this.close(reason);
    this.backoffState.attempts = 0;
    this.maybeConnect('reconnect');
  }

  /**
   * 主动建立 SSE 连接（无需监听器或 POST 请求）
   * 适用于纯服务端推送场景
   * @returns {boolean} 是否成功发起连接
   */
  connect() {
    if (this.es) {
      console.log('[vsse] connect() 被调用但连接已存在');
      return true; // 已连接
    }
    if (!this.opts.url) {
      console.warn('[vsse] connect() 失败: url 未配置');
      return false;
    }
    console.log('[vsse] 手动调用 connect()');
    this.forceConnect('manual connect');
    return true;
  }

  /**
   * 获取连接状态和诊断信息（用于调试）
   * @returns {Object} 连接状态信息
   */
  getConnectionInfo() {
    return {
      state: this.connectionState,
      isConnected: !!this.es,
      isLocked: this._connectLock,
      connectAttempts: this._connectAttempts,
      lastConnectAttempt: this._lastConnectAttempt,
      timeSinceLastAttempt: Date.now() - this._lastConnectAttempt,
      listenersCount: this.listeners.size,
      globalListenersCount: this.globalListeners.size,
      url: this.opts.url,
      lastMessageAt: this.lastMessageAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
    };
  }

  // ========== 内部实现 ==========
  setupActivityListeners() {
    // 绑定并保存引用，以便 destroy() 时移除
    this._boundBump = () => {
      this.lastActiveAt = Date.now();
      this.checkIdle();
      const hasAnyListener = this.listeners.size > 0 || this.globalListeners.size > 0;
      if (!this.es && hasAnyListener) this.maybeConnect('activity');
    };
    this._activityEvents = ['click','keydown','mousemove','scroll','touchstart','visibilitychange'];
    this._activityEvents.forEach(evt =>
      window.addEventListener(evt, this._boundBump, { passive: true })
    );

    this._onOnline = () => this.reconnect('online');
    this._onOffline = () => this.close('offline');
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
  }

  /** 销毁实例，移除全局事件监听并清理定时器 */
  destroy() {
    this.close('destroy');
    if (this._activityEvents && this._boundBump) {
      this._activityEvents.forEach(evt => window.removeEventListener(evt, this._boundBump));
    }
    if (this._onOnline) window.removeEventListener('online', this._onOnline);
    if (this._onOffline) window.removeEventListener('offline', this._onOffline);
    // 清理全局监听，防止内存泄漏
    if (this.globalListeners) this.globalListeners.clear();
  }

  maybeConnect(reason = 'unknown') {
    // ✅ 防重复保护 1: 已有连接直接返回
    if (this.es) {
      if (reason !== 'activity' && reason !== 'post' && reason !== 'onBroadcast') {
        console.warn(`[vsse] 连接已存在，忽略重复连接请求 (reason: ${reason})`);
      }
      return;
    }

    // ✅ 防重复保护 2: 连接中状态检查
    if (this.connectionState === 'connecting' || this._connectLock) {
      console.warn(`[vsse] 连接正在建立中，忽略重复连接请求 (reason: ${reason}, state: ${this.connectionState})`);
      return;
    }

    // ✅ 防重复保护 3: 防抖 - 检查最小连接间隔
    const now = Date.now();
    const timeSinceLastAttempt = now - this._lastConnectAttempt;
    if (timeSinceLastAttempt < this._minConnectInterval) {
      console.warn(`[vsse] 连接请求过于频繁，忽略 (距上次 ${timeSinceLastAttempt}ms < ${this._minConnectInterval}ms, reason: ${reason})`);
      return;
    }

    const hasAnyListener = this.listeners.size > 0 || this.globalListeners.size > 0;
    if (!hasAnyListener) return; // 懒连接：仅当存在任意监听时才连接

    this._lastConnectAttempt = now;
    this._connectAttempts++;
    this.forceConnect(reason);
  }

  /** 强制建立连接，跳过监听器检查 */
  forceConnect(reason) {
    // ✅ 双重检查：防止并发调用
    if (this.es) {
      console.warn(`[vsse] forceConnect 被调用但连接已存在 (reason: ${reason})`);
      return;
    }

    // ✅ 连接锁：防止并发
    if (this._connectLock) {
      console.warn(`[vsse] 连接锁已占用，忽略 forceConnect (reason: ${reason})`);
      return;
    }

    const url = this.opts.url;
    if (!url) {
      console.error('[vsse] 无法建立连接：url 未配置');
      return;
    }

    // ✅ 占用连接锁
    this._connectLock = true;
    this.connectionState = 'connecting';

    console.log(`[vsse] 开始建立连接 (reason: ${reason}, attempts: ${this._connectAttempts})`);

    try {
      // 构建 EventSourcePolyfill 配置选项
      const config = {
        withCredentials: this.opts.sseWithCredentials === true,
      };

      // 如果有自定义请求头或认证 token，添加到配置中
      if (this.opts.sseHeaders || this.opts.token) {
        config.headers = {
          ...(this.opts.sseHeaders || {}),
        };

        // 如果设置了全局 token，自动添加 Authorization 头
        if (this.opts.token) {
          config.headers['Authorization'] = `Bearer ${this.opts.token}`;
        }
      }

      // 使用 EventSourcePolyfill 支持自定义请求头
      this.es = new EventSourcePolyfill(url, config);
    } catch (e) {
      console.error(`[vsse] 创建 EventSource 失败 (reason: ${reason}):`, e);
      this.connectionState = 'error';
      this._connectLock = false; // ✅ 释放锁
      this.scheduleReconnect('ctor failed');
      return;
    }

    this.es.addEventListener('open', () => {
      console.log('[vsse] 连接已建立 ✓');
      this.connectionState = 'connected';
      this._connectLock = false; // ✅ 释放锁
      this.backoffState.attempts = 0;
      this.lastMessageAt = Date.now();
      this.lastHeartbeatAt = Date.now();
      this.checkIdle();
    });

    const onMessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        /** @type {SSEMessage} */
        const parsed = JSON.parse(ev.data);
        const data = parsed && typeof parsed === 'object' ? parsed : {};
        const evtName = (data.event || ev.type || 'message');
        if (evtName === 'ping') {
          this.lastHeartbeatAt = Date.now();
        }
        this.dispatch({ ...data, event: evtName });
      } catch {
        // 非 JSON 或注释 keep-alive 忽略
      }
      this.checkHeartbeat();
    };

    this.es.addEventListener(this.opts.eventName || 'message', onMessage);

    this.es.addEventListener('error', () => {
      console.warn('[vsse] 连接错误，准备重连');
      this.connectionState = 'error';
      this._connectLock = false; // ✅ 释放锁
      this.close('sse error');
      this.scheduleReconnect('sse error');
    });

    // 定期心跳检查（防重复）
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = undefined;
    }
    this.heartbeatIntervalId = window.setInterval(() => this.checkHeartbeat(), 5_000);
  }

  /**
   * @param {SSEMessage<any>} msg
   */
  dispatch(msg) {
    const { requestId, event } = msg;
    if (requestId && this.listeners.has(requestId)) {
      const l = this.listeners.get(requestId);
      // 全量透传：不丢弃任何顶层字段
      try { l.cb(msg); } catch (_) {}
      if (event === 'done' || event === 'error') {
        this.listeners.delete(requestId);
        this.checkIdle();
      }
    } else if (!requestId) {
      // 全局广播：无 requestId 的消息按顺序通知所有 onBroadcast 订阅者
      if (this.globalListeners && this.globalListeners.size > 0) {
        this.globalListeners.forEach(cb => {
          try { cb(msg); } catch(_) {}
        });
      }
    }
  }

  scheduleReconnect() {
    const b = this.opts.reconnectBackoff || { baseMs: 1000, maxMs: 15000, factor: 1.8, jitter: 0.3 };
    const attempt = this.backoffState.attempts++;
    const exp = Math.min(b.maxMs, b.baseMs * Math.pow(b.factor, attempt));
    const jitter = exp * ((Math.random()) * (b.jitter ?? 0.3));
    const delay = Math.round(exp + jitter);
    window.setTimeout(() => this.maybeConnect('backoff'), delay);
  }

  checkHeartbeat() {
    if (!this.opts.withHeartbeat || !this.es) return;
    const now = Date.now();
    const expected = (this.opts.expectedPingInterval ?? 15_000) * 2;
    const since = Math.min(now - this.lastHeartbeatAt, now - this.lastMessageAt);
    if (since > expected) {
      this.reconnect('heartbeat timeout');
    }
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  checkIdle() {
    this.clearIdleTimer();
    const idle = this.opts.idleTimeout ?? 30_000;
    if (!idle) return;
    if (!this.es) return; // 已关闭
    if (this.listeners.size === 0 && this.globalListeners.size === 0) {
      // 仅在“无任何监听器”时按 idle 关闭
      this.idleTimer = window.setTimeout(() => this.close('idle'), idle);
      return;
    }
    // 有监听时，不因“无交互”关闭；但仍保持一个自检定时器以便后续状态变化再评估
    const lastActive = Math.max(this.lastActiveAt, this.lastMessageAt);
    const remaining = idle - (Date.now() - lastActive);
    if (remaining > 0) {
      this.idleTimer = window.setTimeout(() => this.checkIdle(), remaining);
    }
  }
}

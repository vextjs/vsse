# vsse

Lightweight front-end SSE manager with single-connection multiplexing.

中文简介：统一 SSE 长连接、多任务共享；POST 发起任务并通过 requestId 路由 SSE 消息到对应回调；
支持全局与单次 POST 配置（headers/timeout/credentials/token）；**现已支持 SSE 连接自定义请求头**。

## 新特性 ✨

- **主动建立 SSE 连接**: 新增 `connect()` 方法，无需 POST 请求即可主动建立 SSE 连接
- **SSE 连接自定义请求头**: 通过 `event-source-polyfill` 支持在 SSE 连接中使用自定义请求头
- **自动认证头注入**: 设置 `token` 后自动为 SSE 连接添加 `Authorization: Bearer <token>` 头
- **向下兼容**: 原有 API 完全兼容，新功能为可选配置

## 安装

```shell
- npm i vsse
```

**注意**: 从 v0.1.4 开始，vsse 使用 `event-source-polyfill` 来支持 SSE 连接的自定义请求头功能。

## 快速开始

### 基础用法（与之前完全兼容）
```js
import { SSEClient } from "vsse";

const sse = new SSEClient({
  url: "/sse?userId=alice",
  eventName: "notify",
  idleTimeout: 30_000,
  withHeartbeat: true,
  expectedPingInterval: 15_000,
});

const { requestId, unsubscribe } = await sse.postAndListen(
  "/api/doA",
  { foo: "bar" },
  ({ phase, type, payload }) => {
    if (phase === 'progress' && type === 'chat') {
      // 处理流式文本
    }
  }
);
```

### 新功能：SSE 连接自定义请求头
```js
import { SSEClient } from "vsse";

const sse = new SSEClient({
  url: "/sse?userId=alice",
  eventName: "notify",

  // ✨ 新增：SSE 连接自定义请求头
  sseHeaders: {
    "X-API-Key": "your-api-key",
    "X-Client-Version": "1.0.0",
    "X-User-Agent": "MyApp/1.0"
  },

  // ✨ 新增：全局 token 自动注入到 SSE 连接
  token: "your-jwt-token", // 自动添加 Authorization: Bearer <token> 到 SSE 连接

  // 其他原有配置保持不变
  idleTimeout: 30_000,
  withHeartbeat: true,
  expectedPingInterval: 15_000,
});

// 使用方式完全不变
const { requestId, unsubscribe } = await sse.postAndListen(
  "/api/chat",
  { message: "Hello" },
  ({ phase, type, payload }) => {
    if (phase === 'progress' && type === 'chat') {
      console.log('收到消息:', payload.content);
    }
  }
);
```

### 主动建立 SSE 连接（无需 POST 请求）
```js
import { SSEClient } from "vsse";

const sse = new SSEClient({
  url: "/sse?userId=alice",
  eventName: "notify",
  token: "your-jwt-token",
  sseHeaders: {
    "X-API-Key": "your-api-key"
  }
});

// ✨ 新增：主动建立连接，无需 POST 或注册监听器
sse.connect();

// 然后可以使用 onBroadcast 接收服务端推送的消息
const unsubscribe = sse.onBroadcast((msg) => {
  console.log('收到服务端推送:', msg);
});

// 适用场景：
// 1. 纯服务端推送（不需要客户端发起任务）
// 2. 预先建立长连接以减少首次请求延迟
// 3. 接收实时通知、系统消息等
```

### 适用场景示例

**场景1：需要 API Key 认证的 SSE 连接**
```js
const sse = new SSEClient({
  url: "/api/sse/stream",
  sseHeaders: {
    "X-API-Key": process.env.API_KEY
  }
});
```

**场景2：跨域 SSE 连接需要自定义头部**
```js
const sse = new SSEClient({
  url: "https://api.example.com/sse",
  sseHeaders: {
    "Origin": "https://myapp.com",
    "X-Requested-With": "XMLHttpRequest"
  },
  sseWithCredentials: true
});
```

**场景3：微服务架构中的服务间认证**
```js
const sse = new SSEClient({
  url: "/internal/sse",
  token: await getServiceToken(), // JWT token
  sseHeaders: {
    "X-Service-Name": "frontend-client",
    "X-Trace-ID": generateTraceId()
  }
});
```

## 完整配置清单（包含新增选项）
```js
const sse = new SSEClient({
  // ========== 连接与事件 ==========
  url: '/sse?userId=alice',            // 必填：SSE 服务地址
  eventName: 'message',                // 默认 'message'；若服务端使用 'notify'，改为 'notify'

  // ========== SSE 连接配置（新增） ==========
  sseHeaders: {                        // ✨ 新增：SSE 连接自定义请求头
    'X-API-Key': 'your-api-key',
    'X-Client-Version': '1.0.0'
  },
  token: 'your-jwt-token',             // ✨ 增强：token 现在也会自动添加到 SSE 连接
  sseWithCredentials: false,           // 默认 false；SSE 连接是否携带 Cookie

  // ========== 空闲与心跳 ==========
  idleTimeout: 30_000,                 // 默认 30_000ms；仅在"没有任何监听器"时按此关闭
  withHeartbeat: true,                 // 默认 true；启用心跳监测
  expectedPingInterval: 15_000,        // 默认 15_000ms；超时判定为 2×该值内未收到消息⇒重连

  // ========== POST 全局默认（单次可覆盖） ==========
  defaultHeaders: {                    // 可选：POST 默认请求头
    'Content-Type': 'application/json',
    'X-App': 'demo',
  },
  defaultTimeout: 10_000,              // 默认 10_000ms；POST 超时
  credentials: 'include',              // 默认 undefined；POST 凭据

  // ========== 连接保护与重连 ==========
  maxListeners: 1000,                  // 默认 1000；监听器数量上限
  reconnectBackoff: {                  // 指数退避 + 抖动
    baseMs: 1000,
    maxMs: 15_000,
    factor: 1.8,
    jitter: 0.3,
  },
});
```

## 快速开始（含单次覆盖）
```js
// 发起 POST 并监听 SSE；第四个参数为“单次 options”，优先级高于全局默认
const controller = new AbortController();
const { requestId, unsubscribe } = await sse.postAndListen(
  '/api/doA',                          // POST URL
  { foo: 'bar' },                      // 请求体（库会附加 requestId）
  ({ phase, payload }) => {            // 事件回调：progress/done/error/ping/自定义
    if (phase === 'progress') {
      // 处理进度
    } else if (phase === 'done') {
      // 处理完成（自动取消该 requestId 的监听）
    } else if (phase === 'error') {
      // 处理错误（自动取消该 requestId 的监听）
    }
  },
  {
    headers: { 'X-Debug': '1' },       // 单次 POST 请求头，覆盖 defaultHeaders
    timeout: 5_000,                    // 单次 POST 超时（ms），覆盖 defaultTimeout
    credentials: 'include',            // 单次 POST 凭据，覆盖全局 credentials
    token: 'special-task-token',       // 单次 POST Authorization: Bearer <token>，覆盖全局 token
    signal: controller.signal,         // 外部取消控制；controller.abort() 可中断本次 POST
    requestId: crypto.randomUUID(),    // 可选：自定义请求 ID；不传则自动生成
  }
);

// 随时手动取消监听（仅影响前端回调路由；不影响其他任务）
// unsubscribe();

// 如需中断正在进行的 POST
// controller.abort();
```

## 选项与默认值总览（行为语义）
- url：SSE 服务地址（必填）。
- eventName：默认 "message"；后端若用 "notify"，需设为 "notify" 才能被 addEventListener 捕获。
- idleTimeout：默认 30_000ms；仅在“无任何监听器”时按此关闭；设 0 可关闭空闲断开。
- sseWithCredentials：默认 false；SSE 连接是否携带 Cookie。跨域需服务端返回：
  - Access-Control-Allow-Origin: https://your.app
  - Access-Control-Allow-Credentials: true
- defaultHeaders/defaultTimeout/credentials/token：仅作用于 POST。
- withHeartbeat：默认 true；启用心跳检测。
- expectedPingInterval：默认 15_000ms；超过 2×该值未收到“任何消息/心跳”即判定超时并重连。
- maxListeners：默认 1000；监听器上限。
- reconnectBackoff：默认 { baseMs: 1000, maxMs: 15_000, factor: 1.8, jitter: 0.3 }；控制断线后的重连延迟。

合并/优先级规则（POST）：
- headers：defaultHeaders < options.headers（单次覆盖全局）。
- token：this.opts.token < options.token（单次优先）。
- timeout：this.opts.defaultTimeout < options.timeout（单次优先）。
- credentials：this.opts.credentials < options.credentials（单次优先）。

## 心跳与重连（关键时序）
- 活动的定义：收到任意 SSE 消息或收到 event=ping。
- 超时阈值：2 × expectedPingInterval。超过此阈值未收到“任何消息”，触发重连。
- 检测粒度：内部每 5s 检查一次心跳超时，因此触发时刻可能存在最多 ~5s 的检测延迟。
- 重连退避：断开后按照 reconnectBackoff 进行指数退避并带抖动，避免雪崩；首次大约 baseMs。
- 注意：后台标签页可能被浏览器节流，表现为定时器/回调延迟。

### 如何让客户端断线重连每 2 秒一次
将重连退避配置为“固定 2000ms”即可（baseMs=maxMs=2000，factor=1，jitter=0）。
示例：
```js
const sse = new SSEClient({
    url: '/sse?userId=alice',
    reconnectBackoff: { baseMs: 2000, maxMs: 2000, factor: 1, jitter: 0 },
});
```
运行期动态调整：
```js
sse.updateConfig({ reconnectBackoff: { baseMs: 2000, maxMs: 2000, factor: 1, jitter: 0 } });
```

服务端心跳示例（建议每 expectedPingInterval 发送一次）：
```
event: notify
data: {"event":"ping"}
```

## 生命周期管理

### 公开方法

#### `connect()`
主动建立 SSE 连接，无需 POST 请求或注册监听器。

```js
const connected = sse.connect();
// 返回: boolean - true 表示成功发起连接，false 表示失败（通常因为缺少 url）
```

**使用场景**:
- 纯服务端推送（不需要客户端发起任务）
- 预先建立长连接以减少首次请求延迟
- 配合 `onBroadcast()` 接收实时通知

**示例**:
```js
const sse = new SSEClient({ url: '/sse/notifications' });
sse.connect(); // 主动建立连接
sse.onBroadcast((msg) => {
    console.log('收到推送:', msg);
});
```

#### `postAndListen(postUrl, body, onEvent, options)`
发起 POST 请求并注册 SSE 回调。

```js
const { requestId, unsubscribe } = await sse.postAndListen(
    '/api/chat',
    { message: 'Hello' },
    (msg) => { console.log(msg); },
    { timeout: 5000 }
);
```

**返回**: `Promise<{ requestId: string, unsubscribe: () => void }>`

#### `onBroadcast(callback)`
订阅全局广播消息（无 requestId 的消息）。

**重要**: `onBroadcast` 只订阅**当前 SSEClient 实例**的广播消息，不会接收其他实例的消息。每个实例独立管理自己的连接和监听器。

```js
const unsubscribe = sse.onBroadcast((msg) => {
    console.log('广播消息:', msg);
});
// 返回取消订阅函数
```

**示例 - 多实例独立订阅**:
```js
// 实例1：订阅通知频道
const notificationSSE = new SSEClient({ url: '/sse/notifications' });
notificationSSE.connect();
notificationSSE.onBroadcast((msg) => {
    console.log('通知:', msg);  // 只接收 /sse/notifications 的消息
});

// 实例2：订阅聊天频道
const chatSSE = new SSEClient({ url: '/sse/chat' });
chatSSE.connect();
chatSSE.onBroadcast((msg) => {
    console.log('聊天:', msg);  // 只接收 /sse/chat 的消息
});
```

#### `reconnect()`
强制重连 SSE 连接（仅在已有监听器时有效）。

```js
sse.reconnect();
```

**注意**: `reconnect()` 会检查是否有监听器，如果没有则不会重连。如果需要主动建立连接，请使用 `connect()`。

#### `close()`
关闭 SSE 连接。

```js
sse.close();
```

#### `updateConfig(patch)`
动态更新配置（变更 url 会自动重连）。

```js
// 动态更新配置（变更 url 会自动重连）
sse.updateConfig({ url: '/sse?userId=bob', expectedPingInterval: 20_000 });
```

#### `destroy()`
销毁实例，移除所有事件监听器并清理资源。

```js
sse.destroy();
```

### 使用示例

```js
// 手动重连（例如网络恢复后立即尝试）
sse.reconnect();

// 手动关闭（保留状态；未来有监听器时可再连）
sse.close();

// 完全销毁（组件卸载/页面离开时调用，移除全局事件监听与定时器）
sse.destroy();
```

## 全局广播（onBroadcast）
- 支持订阅"无 requestId"的系统级/会话级 SSE 消息。
- 使用 onBroadcast(cb) 注册监听；返回的函数可用于取消订阅。
- **作用域**: 每个 `SSEClient` 实例的 `onBroadcast` 只接收该实例连接的消息，多个实例之间相互独立。
- 懒连接与空闲关闭会同时考虑"按 requestId 监听器"和"全局监听器"。

示例：
```js
import { SSEClient } from 'vsse';
const sse = new SSEClient({ url: '/sse?userId=alice', eventName: 'notify' });

// 订阅全局广播（例如系统公告/会话状态）
const off = sse.onBroadcast(({ phase, type, payload }) => {
  if (phase === 'progress' && type === 'system') {
    console.log('系统公告：', payload?.content);
  }
});

// 取消订阅
// off();
```

**多实例场景**：
```js
// 每个实例独立订阅不同的频道
const notificationSSE = new SSEClient({ url: '/sse/notifications' });
const chatSSE = new SSEClient({ url: '/sse/chat-room-1' });

notificationSSE.connect();
notificationSSE.onBroadcast((msg) => {
  console.log('通知:', msg);  // 只接收 /sse/notifications 的广播
});

chatSSE.connect();
chatSSE.onBroadcast((msg) => {
  console.log('聊天:', msg);  // 只接收 /sse/chat-room-1 的广播
});
```

服务端发送约定（无 requestId）：
```
event: notify
data: {"event":"progress","type":"system","payload":{"content":"今晚 2:00 维护"},"sentAt":1736720000000}
```

## 服务端事件格式与路由约定
- 建议每条 SSE data 为 JSON：{ requestId, event, payload, type?, code?, message?, sentAt? }。
  - 约定：正文内容放在 payload（如 payload.content）；分类/分流信息放在顶层 type（如 'need' | 'chat'）。
  - 本客户端会将顶层的 type/code/message/sentAt 原样透传给回调（即回调参数为 { event, type, payload, code, message, sentAt }）。
- 若 data 无 event 字段，将回退使用原生 SSE 事件名 ev.type（如 message/notify）。
- event 为 'done' 或 'error' 时，该 requestId 的监听会自动移除。

示例：
```
# 进度：需求卡
event: notify
data: {"requestId":"<uuid>","phase":"progress","type":"need","payload":{"content":"<html or markdown>"}}

# 进度：聊天分片
event: notify
data: {"requestId":"<uuid>","phase":"progress","type":"chat","payload":{"content":"文本分片"}}

# 完成
event: notify
data: {"requestId":"<uuid>","phase":"done","payload":{"content":"完整文本","length":1234}}
```

## CORS、凭据与自定义请求头支持
- **✨ 新特性**: 通过 `event-source-polyfill`，vsse 现已支持 SSE 连接的自定义请求头，包括 `Authorization` 头！
- **SSE 连接认证**: 可通过 `sseHeaders` 或 `token` 配置直接在 SSE 连接中携带认证信息：
  ```js
  const sse = new SSEClient({
    url: '/sse',
    token: 'your-jwt-token',           // 自动添加 Authorization: Bearer <token>
    sseHeaders: {                      // 或者手动设置其他认证头
      'X-API-Key': 'your-api-key'
    }
  });
  ```
- **Cookie 支持**: 如需让连接层携带 Cookie，设置 `sseWithCredentials=true`，且服务端必须：
  - Access-Control-Allow-Origin: 精确来源（不能是 *）
  - Access-Control-Allow-Credentials: true
- **跨域自定义头**: 使用自定义请求头时，服务端需要在 CORS 配置中允许相应的头部：
  ```
  Access-Control-Allow-Headers: Authorization, X-API-Key, X-Client-Version, ...
  ```
- **认证方案选择**:
  - 方案 A：**Bearer Token**（推荐）：使用 `token` 或 `sseHeaders['Authorization']`
  - 方案 B：**API Key**：使用 `sseHeaders` 设置自定义认证头
  - 方案 C：**Cookie 会话**：使用 `sseWithCredentials=true`

## 常见问题（FAQ）
- 为什么我设置的 expectedPingInterval 和"实际断开/重连间隔"不一致？
  - 判定超时阈值是 2×expectedPingInterval；再加上定时检测步进（5s）与退避延迟，肉眼观测会更长。
- 为什么连接会自动断开？
  - 可能因为：心跳超时；网络 offline；服务端关闭；无监听器且达到 idleTimeout。
- 如何关闭"无监听器时"的空闲断开？
  - 将 idleTimeout 设为 0。
- **✨ 新问题**: SSE 连接的自定义请求头不生效？
  - 确认服务端 CORS 配置允许相应的头部：`Access-Control-Allow-Headers: Authorization, X-API-Key, ...`
  - 检查服务端是否正确读取了自定义头部
  - 确认使用的是 vsse v0.1.4+ 版本
- **✨ 新问题**: Bearer Token 认证失败？
  - 确认 token 格式正确，不需要手动添加 "Bearer " 前缀
  - 检查服务端是否正确验证 Authorization 头
  - 可以通过浏览器开发者工具的网络面板确认请求头是否正确发送
- 跨域携带 Cookie 不生效？
  - 检查服务端是否返回 Access-Control-Allow-Credentials: true 且 Access-Control-Allow-Origin 为精确源而非 *。
- **✨ 新问题**: 同时使用 token 和 sseHeaders 中的 Authorization 会怎样？
  - `token` 配置的优先级更高，会覆盖 `sseHeaders` 中的 Authorization 头

## 排查清单（出现"时断时续/延迟重连"时）
- 服务端是否按期发送心跳（或至少有业务消息）？
- eventName 是否与服务端一致（message vs notify）？
- 是否考虑了"2×expectedPingInterval + 5s 检查步进 + 退避延迟"的综合效果？
- 标签页是否在后台导致节流？
- 是否在大量任务场景触及 maxListeners 限制？
- **✨ 新增排查项**: 使用自定义请求头时的额外检查：
  - 服务端 CORS 配置是否正确允许自定义头部？
  - 认证 token 是否已过期或格式错误？
  - 是否因为认证失败导致服务端拒绝连接？
  - 浏览器开发者工具中是否显示 401/403 等认证错误？
  - 跨域场景下是否正确配置了 `Access-Control-Allow-Headers`？

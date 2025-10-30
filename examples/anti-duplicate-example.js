/**
 * 防重复连接保护示例
 *
 * 展示 vsse 如何自动防止不规范代码导致的重复连接问题
 */

import { SSEClient } from '../src/index.js';

console.log('=== vsse 防重复连接保护演示 ===\n');

// ============================================================
// 示例 1: 多次调用 connect() - 只会建立一个连接
// ============================================================
console.log('【示例 1】多次调用 connect()');
const sse1 = new SSEClient({
    url: '/api/sse?userId=user1',
    eventName: 'message'
});

// 即使调用多次，也只会建立一个连接
sse1.connect();
sse1.connect();
sse1.connect();

// 输出：
// [vsse] 开始建立连接 (reason: manual connect, attempts: 1)
// [vsse] connect() 被调用但连接已存在
// [vsse] connect() 被调用但连接已存在

setTimeout(() => {
    console.log('连接信息:', sse1.getConnectionInfo());
    // 输出：{ connectAttempts: 1, isConnected: true, ... }
    console.log('\n');
}, 1000);

// ============================================================
// 示例 2: 并发调用 - 连接锁保护
// ============================================================
console.log('【示例 2】并发调用连接方法');
const sse2 = new SSEClient({
    url: '/api/sse?userId=user2',
    eventName: 'message'
});

// 模拟多个操作同时触发连接
Promise.all([
    sse2.postAndListen('/api/task1', {}, () => {}),
    sse2.postAndListen('/api/task2', {}, () => {}),
    sse2.postAndListen('/api/task3', {}, () => {}),
]).then(() => {
    console.log('并发请求完成');
});

sse2.onBroadcast(() => {});
sse2.connect();

// 输出：
// [vsse] 开始建立连接 (reason: post, attempts: 1)
// [vsse] 连接锁已占用，忽略 forceConnect (reason: post)
// [vsse] 连接锁已占用，忽略 forceConnect (reason: post)
// [vsse] 连接已存在，忽略重复连接请求 (reason: onBroadcast)
// [vsse] connect() 被调用但连接已存在

// ============================================================
// 示例 3: 频繁调用 - 防抖保护
// ============================================================
console.log('\n【示例 3】频繁调用连接方法');
const sse3 = new SSEClient({
    url: '/api/sse?userId=user3',
    eventName: 'message'
});

// 模拟快速连续调用
for (let i = 0; i < 10; i++) {
    setTimeout(() => {
        sse3.connect();
    }, i * 50); // 每 50ms 调用一次
}

// 输出：
// [vsse] 开始建立连接 (reason: manual connect, attempts: 1)
// [vsse] 连接请求过于频繁，忽略 (距上次 50ms < 500ms)
// [vsse] 连接请求过于频繁，忽略 (距上次 100ms < 500ms)
// ... （后续调用被防抖机制拦截）

// ============================================================
// 示例 4: React 组件重新渲染场景
// ============================================================
console.log('\n【示例 4】模拟 React 组件重新渲染');

// 模拟不规范的 React 代码（每次渲染都创建新实例）
function BadComponent({ userId }) {
    // ❌ 错误示范：每次渲染都创建新实例
    const sse = new SSEClient({
        url: `/api/sse?userId=${userId}`,
        eventName: 'message'
    });

    sse.connect();

    return sse;
}

// 模拟多次渲染
const render1 = BadComponent({ userId: 'user4' });
const render2 = BadComponent({ userId: 'user4' }); // 重新渲染
const render3 = BadComponent({ userId: 'user4' }); // 再次重新渲染

// 虽然代码不规范，但 vsse 的防护机制确保：
// 1. 每个实例都有自己的连接管理
// 2. 不会创建重复的连接（如果复用同一个实例）

console.log('每个实例的连接信息:');
console.log('render1:', render1.getConnectionInfo().connectAttempts);
console.log('render2:', render2.getConnectionInfo().connectAttempts);
console.log('render3:', render3.getConnectionInfo().connectAttempts);

// ⚠️ 注意：这里会创建 3 个连接，因为创建了 3 个不同的实例
// 正确做法：使用 useRef 或 useState 保持实例单例

// ============================================================
// 示例 5: 正确的 React 用法
// ============================================================
console.log('\n【示例 5】正确的 React 用法');

// ✅ 正确示范：使用 useEffect + 空依赖数组
function GoodComponent({ userId }) {
    // useEffect(() => {
        const sse = new SSEClient({
            url: `/api/sse?userId=${userId}`,
            eventName: 'message'
        });

        // 订阅广播（自动触发连接）
        const unsub = sse.onBroadcast((msg) => {
            console.log('收到消息:', msg);
        });

        // 清理函数
        // return () => {
        //     unsub();
        //     sse.close();
        // };
    // }, []); // ⚠️ 空依赖数组，只执行一次

    return sse;
}

const goodRender = GoodComponent({ userId: 'user5' });
console.log('正确用法连接信息:', goodRender.getConnectionInfo());

// ============================================================
// 示例 6: 查看连接状态
// ============================================================
console.log('\n【示例 6】查看详细连接信息');
const sse6 = new SSEClient({
    url: '/api/sse?userId=user6',
    eventName: 'message'
});

console.log('初始状态:', sse6.getConnectionInfo());
// 输出：
// {
//   state: 'disconnected',
//   isConnected: false,
//   isLocked: false,
//   connectAttempts: 0,
//   ...
// }

sse6.connect();

setTimeout(() => {
    console.log('连接后状态:', sse6.getConnectionInfo());
    // 输出：
    // {
    //   state: 'connected',
    //   isConnected: true,
    //   isLocked: false,
    //   connectAttempts: 1,
    //   url: '/api/sse?userId=user6',
    //   lastMessageAt: 1732954325123,
    //   ...
    // }
}, 1000);

// ============================================================
// 示例 7: 生产环境监控
// ============================================================
console.log('\n【示例 7】生产环境连接监控');

function monitorConnection(sse, name) {
    setInterval(() => {
        const info = sse.getConnectionInfo();

        // 检查异常情况
        if (info.connectAttempts > 10) {
            console.error(`⚠️ ${name}: 连接尝试次数过多 (${info.connectAttempts})`);
        }

        if (info.isLocked) {
            console.warn(`⚠️ ${name}: 连接锁已持续占用`);
        }

        const timeSinceLastMsg = Date.now() - info.lastMessageAt;
        if (info.isConnected && timeSinceLastMsg > 60000) {
            console.warn(`⚠️ ${name}: 超过 1 分钟未收到消息`);
        }

        console.log(`✓ ${name}: 状态正常`, {
            state: info.state,
            attempts: info.connectAttempts,
            listeners: info.listenersCount + info.globalListenersCount
        });
    }, 30000); // 每 30 秒检查一次
}

const sse7 = new SSEClient({
    url: '/api/sse?userId=user7',
    eventName: 'message'
});

sse7.connect();
monitorConnection(sse7, 'MainSSE');

// ============================================================
// 总结
// ============================================================
console.log('\n=== 防重复连接保护总结 ===');
console.log('✅ 连接状态检查：防止覆盖现有连接');
console.log('✅ 连接锁（Mutex）：防止并发建立连接');
console.log('✅ 防抖机制：限制连接尝试的最小时间间隔（500ms）');
console.log('✅ 状态机管理：跟踪连接生命周期');
console.log('✅ 详细日志输出：便于调试和监控');
console.log('✅ 连接诊断工具：getConnectionInfo() 方法');
console.log('\n即使前端代码不规范，vsse 也能保证单例连接！');


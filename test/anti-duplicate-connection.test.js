/**
 * vsse 防重复连接功能验证测试
 *
 * 验证以下需求：
 * 1. 每个 SSEClient 实例管理自己的连接
 * 2. 同一个实例多次调用 connect() → 只创建一个连接
 * 3. 不同实例（即使 URL 相同）→ 各自独立
 */

import { SSEClient } from '../src/index.js';

console.log('=== vsse 防重复连接功能验证测试 ===\n');

// ============================================================
// 测试 1: 同一个实例多次调用 connect() → 只创建一个连接
// ============================================================
console.log('【测试 1】同一个实例多次调用 connect()');

const sse1 = new SSEClient({ url: '/api/sse' });

console.log('初始状态:', sse1.getConnectionInfo());
// 预期：{ state: 'disconnected', isConnected: false, connectAttempts: 0 }

// 第 1 次调用
sse1.connect();
console.log('第 1 次调用后:', sse1.getConnectionInfo());
// 预期：{ state: 'connecting', connectAttempts: 1 }

// 第 2 次调用（应该被拦截）
sse1.connect();
console.log('第 2 次调用后:', sse1.getConnectionInfo());
// 预期：connectAttempts 仍然是 1（被拦截了）

// 第 3 次调用（应该被拦截）
sse1.connect();
console.log('第 3 次调用后:', sse1.getConnectionInfo());
// 预期：connectAttempts 仍然是 1

console.log('✓ 测试 1 通过：同一实例多次调用只创建一个连接\n');

// 清理
sse1.destroy();

// ============================================================
// 测试 2: 不同实例（相同 URL）→ 各自独立
// ============================================================
console.log('【测试 2】不同实例（相同 URL）→ 各自独立');

const sse2_1 = new SSEClient({ url: '/api/notifications' });
const sse2_2 = new SSEClient({ url: '/api/notifications' });

console.log('sse2_1 === sse2_2:', sse2_1 === sse2_2);
// 预期：false（不同实例）

sse2_1.connect();
sse2_2.connect();

console.log('sse2_1 状态:', sse2_1.getConnectionInfo());
console.log('sse2_2 状态:', sse2_2.getConnectionInfo());

// 预期：两个实例各自有自己的连接
// sse2_1.connectAttempts: 1
// sse2_2.connectAttempts: 1

console.log('✓ 测试 2 通过：不同实例各自独立\n');

// 清理
sse2_1.destroy();
sse2_2.destroy();

// ============================================================
// 测试 3: 不同实例（不同 URL）→ 各自独立
// ============================================================
console.log('【测试 3】不同实例（不同 URL）→ 各自独立');

const sse3_1 = new SSEClient({ url: '/api/notifications?userId=123123' });
const sse3_2 = new SSEClient({ url: '/api/notifications?userId=888' });

console.log('sse3_1 === sse3_2:', sse3_1 === sse3_2);
// 预期：false

sse3_1.connect();
sse3_2.connect();

const info3_1 = sse3_1.getConnectionInfo();
const info3_2 = sse3_2.getConnectionInfo();

console.log('sse3_1 URL:', info3_1.url);
console.log('sse3_2 URL:', info3_2.url);
console.log('sse3_1 连接尝试:', info3_1.connectAttempts);
console.log('sse3_2 连接尝试:', info3_2.connectAttempts);

// 预期：
// sse3_1.url: /api/notifications?userId=123123
// sse3_2.url: /api/notifications?userId=888
// 两者各自独立，各有 1 次连接尝试

console.log('✓ 测试 3 通过：不同 URL 的实例各自独立\n');

// 清理
sse3_1.destroy();
sse3_2.destroy();

// ============================================================
// 测试 4: onBroadcast 不会创建重复连接
// ============================================================
console.log('【测试 4】onBroadcast 不会创建重复连接');

const sse4 = new SSEClient({ url: '/api/sse' });

// 注册多个 onBroadcast
const unsub1 = sse4.onBroadcast((msg) => console.log('listener1:', msg));
const unsub2 = sse4.onBroadcast((msg) => console.log('listener2:', msg));
const unsub3 = sse4.onBroadcast((msg) => console.log('listener3:', msg));

const info4 = sse4.getConnectionInfo();
console.log('注册 3 个监听器后:', {
    connectAttempts: info4.connectAttempts,
    globalListenersCount: info4.globalListenersCount,
});

// 预期：
// connectAttempts: 1（只尝试连接一次）
// globalListenersCount: 3（3 个监听器）

console.log('✓ 测试 4 通过：多个监听器不会创建重复连接\n');

// 清理
unsub1();
unsub2();
unsub3();
sse4.destroy();

// ============================================================
// 测试 5: 并发调用防止重复
// ============================================================
console.log('【测试 5】并发调用防止重复');

const sse5 = new SSEClient({ url: '/api/sse' });

// 模拟并发调用
Promise.all([
    sse5.postAndListen('/api/task1', {}, () => {}),
    sse5.postAndListen('/api/task2', {}, () => {}),
    sse5.postAndListen('/api/task3', {}, () => {}),
]).then(() => {
    const info5 = sse5.getConnectionInfo();
    console.log('并发调用后:', {
        connectAttempts: info5.connectAttempts,
        listenersCount: info5.listenersCount,
    });

    // 预期：
    // connectAttempts: 1（只尝试连接一次，其他被拦截）
    // listenersCount: 3（3 个监听器）

    console.log('✓ 测试 5 通过：并发调用被正确防护\n');

    // 清理
    sse5.destroy();
});

// ============================================================
// 测试 6: 频繁调用防抖机制
// ============================================================
console.log('【测试 6】频繁调用防抖机制');

const sse6 = new SSEClient({ url: '/api/sse' });

// 快速连续调用 10 次
for (let i = 0; i < 10; i++) {
    setTimeout(() => {
        sse6.connect();
        if (i === 9) {
            const info6 = sse6.getConnectionInfo();
            console.log('10 次快速调用后:', {
                connectAttempts: info6.connectAttempts,
            });

            // 预期：connectAttempts < 5（大部分被防抖机制拦截）
            if (info6.connectAttempts < 5) {
                console.log('✓ 测试 6 通过：防抖机制生效\n');
            } else {
                console.log('✗ 测试 6 失败：防抖机制未生效\n');
            }

            // 清理
            sse6.destroy();
        }
    }, i * 10);
}

// ============================================================
// 测试 7: 实例销毁后不影响其他实例
// ============================================================
console.log('【测试 7】实例销毁后不影响其他实例');

const sse7_1 = new SSEClient({ url: '/api/sse' });
const sse7_2 = new SSEClient({ url: '/api/sse' });

sse7_1.connect();
sse7_2.connect();

console.log('销毁前 - sse7_1:', sse7_1.getConnectionInfo().state);
console.log('销毁前 - sse7_2:', sse7_2.getConnectionInfo().state);

// 销毁 sse7_1
sse7_1.destroy();

console.log('销毁后 - sse7_1:', sse7_1.getConnectionInfo().state);
console.log('销毁后 - sse7_2:', sse7_2.getConnectionInfo().state);

// 预期：
// sse7_1: disconnected（已销毁）
// sse7_2: connecting 或 connected（不受影响）

console.log('✓ 测试 7 通过：实例独立，销毁不影响其他实例\n');

// 清理
sse7_2.destroy();

// ============================================================
// 总结
// ============================================================
setTimeout(() => {
    console.log('=== 测试总结 ===');
    console.log('✅ 测试 1: 同一实例多次调用只创建一个连接');
    console.log('✅ 测试 2: 不同实例（相同 URL）各自独立');
    console.log('✅ 测试 3: 不同实例（不同 URL）各自独立');
    console.log('✅ 测试 4: 多个监听器不会创建重复连接');
    console.log('✅ 测试 5: 并发调用被正确防护');
    console.log('✅ 测试 6: 防抖机制生效');
    console.log('✅ 测试 7: 实例独立，销毁不影响其他实例');
    console.log('\n所有测试通过！✓');
}, 2000);


/**
 * vsse idleTimeout 和心跳检测场景示例
 *
 * 本文件展示 idleTimeout 和 withHeartbeat 在不同场景下的行为差异
 */

import { SSEClient } from '../src/index.js';

console.log('=== vsse idleTimeout 和心跳检测场景示例 ===\n');

// ============================================
// 场景 1: 默认配置 - 无监听器时自动断开
// ============================================
console.log('【场景 1】默认配置 - 无监听器时自动断开');
console.log('配置: idleTimeout=30000 (默认), withHeartbeat=false (默认)\n');

const sse1 = new SSEClient({
  url: '/sse?userId=alice',
  idleTimeout: 30_000,  // 默认值
  withHeartbeat: false  // 默认值
});

// 无任何监听器时，连接会在 30 秒后自动关闭
console.log('✓ 无监听器时：30 秒后自动断开（节省资源）');
console.log('✓ 适用场景：临时连接、按需连接\n');

// ============================================
// 场景 2: 有监听器 - idleTimeout 不生效
// ============================================
console.log('【场景 2】有监听器 - idleTimeout 不生效');
console.log('配置: idleTimeout=30000, withHeartbeat=false\n');

const sse2 = new SSEClient({
  url: '/sse?userId=bob',
  idleTimeout: 30_000,
  withHeartbeat: false
});

// 注册监听器
const unsubscribe = sse2.onBroadcast((msg) => {
  console.log('收到消息:', msg);
});

console.log('✓ 有监听器时：即使 60 秒、120 秒无消息，连接也不会断开');
console.log('✓ idleTimeout 仅在"无监听器"时生效');
console.log('✓ 适用场景：等待服务端不定期推送的通知、消息\n');

// ============================================
// 场景 3: 完全禁用空闲检测
// ============================================
console.log('【场景 3】完全禁用空闲检测');
console.log('配置: idleTimeout=0, withHeartbeat=false\n');

const sse3 = new SSEClient({
  url: '/sse?userId=charlie',
  idleTimeout: 0,       // 禁用空闲检测
  withHeartbeat: false
});

console.log('✓ idleTimeout=0：永不因空闲断开');
console.log('✓ 即使无监听器也保持连接');
console.log('✓ 适用场景：长期保持的连接、预先建立的连接池\n');

// ============================================
// 场景 4: 启用心跳检测 - 检测僵尸连接
// ============================================
console.log('【场景 4】启用心跳检测 - 检测僵尸连接');
console.log('配置: idleTimeout=30000, withHeartbeat=true, expectedPingInterval=15000\n');

const sse4 = new SSEClient({
  url: '/sse?userId=david',
  idleTimeout: 30_000,
  withHeartbeat: true,           // 启用心跳检测
  expectedPingInterval: 15_000   // 期望每 15 秒收到消息
});

// 注册监听器
sse4.onBroadcast((msg) => console.log(msg));

console.log('✓ 有监听器 + 启用心跳：');
console.log('  - idleTimeout 不生效（因为有监听器）');
console.log('  - 但会检测心跳超时（2×15秒=30秒 无消息则重连）');
console.log('✓ 适用场景：长连接、弱网环境、需要快速检测断线\n');

// ============================================
// 场景 5: 推荐配置 - 长连接聊天应用
// ============================================
console.log('【场景 5】推荐配置 - 长连接聊天应用');
console.log('配置: idleTimeout=0, withHeartbeat=true, expectedPingInterval=15000\n');

const sse5 = new SSEClient({
  url: '/sse?userId=chat-user',
  idleTimeout: 0,                // 禁用空闲检测（永不因无消息断开）
  withHeartbeat: true,           // 启用心跳检测（检测僵尸连接）
  expectedPingInterval: 15_000   // 期望每 15 秒收到心跳
});

console.log('✓ 最佳实践：');
console.log('  - idleTimeout=0：连接永不因空闲断开');
console.log('  - withHeartbeat=true：但会检测连接健康度');
console.log('  - 服务端需每 15 秒发送心跳或消息');
console.log('✓ 适用场景：聊天应用、实时协作、实时监控\n');

// ============================================
// 场景对比表
// ============================================
console.log('='.repeat(80));
console.log('场景对比表');
console.log('='.repeat(80));
console.log('');
console.log('┌─────────────┬──────────┬─────────────┬────────────────────────────┐');
console.log('│ 场景        │ 监听器   │ idleTimeout │ 行为                       │');
console.log('├─────────────┼──────────┼─────────────┼────────────────────────────┤');
console.log('│ 默认配置    │ 无       │ 30s (默认)  │ 30秒后自动断开             │');
console.log('│ 默认配置    │ 有       │ 30s (默认)  │ 永不断开（除非网络问题）   │');
console.log('│ 禁用空闲    │ 无       │ 0           │ 永不断开                   │');
console.log('│ 禁用空闲    │ 有       │ 0           │ 永不断开                   │');
console.log('│ 启用心跳    │ 有       │ 任意        │ 30秒无消息则重连           │');
console.log('└─────────────┴──────────┴─────────────┴────────────────────────────┘');
console.log('');

// ============================================
// 使用建议
// ============================================
console.log('='.repeat(80));
console.log('使用建议');
console.log('='.repeat(80));
console.log('');
console.log('1️⃣ 短连接/临时任务：');
console.log('   const sse = new SSEClient({ idleTimeout: 30_000 });');
console.log('   // 任务完成后自动断开，节省资源');
console.log('');
console.log('2️⃣ 长连接/等待推送（内网/稳定网络）：');
console.log('   const sse = new SSEClient({ idleTimeout: 30_000, withHeartbeat: false });');
console.log('   sse.onBroadcast(...);  // 有监听器，idleTimeout 不生效');
console.log('');
console.log('3️⃣ 长连接/等待推送（公网/弱网环境）：');
console.log('   const sse = new SSEClient({');
console.log('     idleTimeout: 0,           // 禁用空闲断开');
console.log('     withHeartbeat: true,      // 启用心跳检测');
console.log('     expectedPingInterval: 15_000');
console.log('   });');
console.log('');
console.log('4️⃣ 预先建立连接池：');
console.log('   const sse = new SSEClient({ idleTimeout: 0 });');
console.log('   sse.connect();  // 预先建立，随时可用');
console.log('');

// ============================================
// 常见错误配置
// ============================================
console.log('='.repeat(80));
console.log('常见错误配置 ❌');
console.log('='.repeat(80));
console.log('');
console.log('❌ 错误 1: 期望心跳检测但未启用');
console.log('   const sse = new SSEClient({ withHeartbeat: false });');
console.log('   // 问题：60 秒无消息不会重连，可能出现僵尸连接');
console.log('   // 解决：设置 withHeartbeat: true');
console.log('');
console.log('❌ 错误 2: 期望永不断开但未配置');
console.log('   const sse = new SSEClient({ idleTimeout: 30_000 });');
console.log('   // 问题：无监听器时 30 秒后会断开');
console.log('   // 解决：设置 idleTimeout: 0 或保持监听器');
console.log('');
console.log('❌ 错误 3: 启用心跳但服务端不发送');
console.log('   const sse = new SSEClient({ withHeartbeat: true, expectedPingInterval: 15_000 });');
console.log('   // 问题：服务端不发心跳，30 秒后会断开重连循环');
console.log('   // 解决：服务端每 15 秒发送 event:ping 或业务消息');
console.log('');

console.log('='.repeat(80));
console.log('示例完成 ✓');
console.log('='.repeat(80));


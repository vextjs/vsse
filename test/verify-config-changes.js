/**
 * 验证默认配置更改的脚本
 */

// Mock window 对象（Node.js 环境）
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
};

(async () => {
  const { SSEClient } = await import('../src/index.js');

  console.log('=== vsse 配置验证 ===\n');

  // 测试 1: 验证 withHeartbeat 默认为 false
  console.log('【测试 1】验证 withHeartbeat 默认为 false');
  const client1 = new SSEClient({ url: '/test' });
  console.log('withHeartbeat 默认值:', client1.opts.withHeartbeat);
  console.assert(client1.opts.withHeartbeat === false, '❌ withHeartbeat 应该默认为 false');
  console.log('✓ withHeartbeat 默认为 false\n');

  // 测试 2: 验证 maxListeners 默认为 100
  console.log('【测试 2】验证 maxListeners 默认为 100');
  const client2 = new SSEClient({ url: '/test' });
  console.log('maxListeners 默认值:', client2.opts.maxListeners);
  console.assert(client2.opts.maxListeners === 100, '❌ maxListeners 应该默认为 100');
  console.log('✓ maxListeners 默认为 100\n');

  // 测试 3: 验证可以显式覆盖
  console.log('【测试 3】验证可以显式覆盖默认值');
  const client3 = new SSEClient({
    url: '/test',
    withHeartbeat: true,
    maxListeners: 500
  });
  console.log('显式设置后 withHeartbeat:', client3.opts.withHeartbeat);
  console.log('显式设置后 maxListeners:', client3.opts.maxListeners);
  console.assert(client3.opts.withHeartbeat === true, '❌ 应该可以显式启用 withHeartbeat');
  console.assert(client3.opts.maxListeners === 500, '❌ 应该可以显式覆盖 maxListeners');
  console.log('✓ 可以显式覆盖默认值\n');

  // 测试 4: 验证其他默认值未改变
  console.log('【测试 4】验证其他默认值未改变');
  const client4 = new SSEClient({ url: '/test' });
  console.log('idleTimeout:', client4.opts.idleTimeout);
  console.log('defaultTimeout:', client4.opts.defaultTimeout);
  console.log('eventName:', client4.opts.eventName);
  console.log('expectedPingInterval:', client4.opts.expectedPingInterval);
  console.assert(client4.opts.idleTimeout === 30_000, '❌ idleTimeout 应该为 30_000');
  console.assert(client4.opts.defaultTimeout === 10_000, '❌ defaultTimeout 应该为 10_000');
  console.assert(client4.opts.eventName === 'message', '❌ eventName 应该为 message');
  console.assert(client4.opts.expectedPingInterval === 15_000, '❌ expectedPingInterval 应该为 15_000');
  console.log('✓ 其他默认值保持不变\n');

  console.log('=== 所有验证通过 ✓ ===');
})();


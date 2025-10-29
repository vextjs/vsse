/**
 * vsse 主动建立 SSE 连接示例
 * 演示如何不发送 POST 请求，直接建立 SSE 连接接收服务端推送
 */

import { SSEClient } from '../src/index.js';

// ============================================================
// 示例 1: 基础主动连接 - 接收服务端推送
// ============================================================
console.log('=== 示例1：基础主动连接 ===');

const basicSSE = new SSEClient({
    url: '/sse/notifications?userId=alice',
    eventName: 'notify',
    token: 'your-jwt-token',
    sseHeaders: {
        'X-Client-Type': 'web',
        'X-Client-Version': '1.0.0'
    }
});

// ✨ 主动建立连接
const connected = basicSSE.connect();
console.log('连接状态:', connected ? '成功' : '失败');

// 监听服务端推送的消息
const unsubscribe1 = basicSSE.onBroadcast((msg) => {
    console.log('收到服务端推送:', msg);
    // msg 可能包含：
    // { event: 'notification', payload: { title: '新消息', content: '...' } }
    // { event: 'alert', payload: { level: 'warning', message: '...' } }
});

// ============================================================
// 示例 2: 预连接 + 后续任务
// ============================================================
console.log('\n=== 示例2：预连接 + 后续任务 ===');

const preConnectSSE = new SSEClient({
    url: '/sse?userId=bob',
    eventName: 'message',
    token: 'user-token-123'
});

// 页面加载时预先建立连接，减少首次请求延迟
preConnectSSE.connect();
console.log('预连接已建立');

// 用户操作时发起任务，复用已有连接
setTimeout(async () => {
    console.log('用户触发操作，发起任务...');
    const { requestId } = await preConnectSSE.postAndListen(
        '/api/chat',
        { message: 'Hello' },
        ({ event, payload }) => {
            console.log(`[${requestId}] ${event}:`, payload);
        }
    );
}, 2000);

// ============================================================
// 示例 3: 实时通知系统
// ============================================================
console.log('\n=== 示例3：实时通知系统 ===');

const notificationSSE = new SSEClient({
    url: '/sse/system-notifications',
    eventName: 'notification',
    token: localStorage.getItem('auth_token'),
    sseHeaders: {
        'X-Device-ID': getDeviceId(),
        'X-Platform': 'web'
    },
    idleTimeout: 0, // 永不因空闲断开
    withHeartbeat: true,
    expectedPingInterval: 30_000
});

// 建立连接
notificationSSE.connect();

// 监听不同类型的通知
const unsubNotify = notificationSSE.onBroadcast((msg) => {
    const { event, payload } = msg;

    switch (event) {
        case 'system-message':
            showSystemMessage(payload);
            break;
        case 'user-mention':
            showMention(payload);
            break;
        case 'alert':
            showAlert(payload);
            break;
        case 'ping':
            console.log('心跳:', new Date().toISOString());
            break;
        default:
            console.log('未知消息类型:', event, payload);
    }
});

// ============================================================
// 示例 4: 多频道订阅（WebSocket 风格）
// ============================================================
console.log('\n=== 示例4：多频道订阅 ===');

class ChannelManager {
    constructor(baseUrl, token) {
        this.clients = new Map();
        this.baseUrl = baseUrl;
        this.token = token;
    }

    subscribe(channel, onMessage) {
        if (this.clients.has(channel)) {
            console.warn(`频道 ${channel} 已订阅`);
            return;
        }

        const client = new SSEClient({
            url: `${this.baseUrl}/sse/channel/${channel}`,
            eventName: 'message',
            token: this.token,
            sseHeaders: {
                'X-Channel': channel
            }
        });

        client.connect();
        const unsub = client.onBroadcast(onMessage);

        this.clients.set(channel, { client, unsub });
        console.log(`已订阅频道: ${channel}`);
    }

    unsubscribe(channel) {
        const entry = this.clients.get(channel);
        if (entry) {
            entry.unsub();
            entry.client.close();
            this.clients.delete(channel);
            console.log(`已取消订阅频道: ${channel}`);
        }
    }

    destroy() {
        for (const [channel, entry] of this.clients) {
            entry.unsub();
            entry.client.destroy();
        }
        this.clients.clear();
        console.log('所有频道已关闭');
    }
}

const manager = new ChannelManager('/api', 'user-token');

// 订阅多个频道
manager.subscribe('chat-room-1', (msg) => {
    console.log('[聊天室1]', msg.payload);
});

manager.subscribe('notifications', (msg) => {
    console.log('[通知]', msg.payload);
});

manager.subscribe('live-updates', (msg) => {
    console.log('[实时更新]', msg.payload);
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    manager.destroy();
});

// ============================================================
// 示例 5: 条件连接 - 仅在需要时连接
// ============================================================
console.log('\n=== 示例5：条件连接 ===');

const conditionalSSE = new SSEClient({
    url: '/sse/live-data',
    eventName: 'update'
});

// 根据用户偏好决定是否建立连接
const userPreferences = {
    enableRealTimeUpdates: true,
    enableNotifications: true
};

if (userPreferences.enableRealTimeUpdates) {
    conditionalSSE.connect();

    conditionalSSE.onBroadcast((msg) => {
        updateUIWithLiveData(msg.payload);
    });

    console.log('实时更新已启用');
} else {
    console.log('实时更新已禁用，使用轮询模式');
    // 降级到轮询
    setInterval(() => {
        fetch('/api/get-updates').then(r => r.json()).then(updateUIWithLiveData);
    }, 5000);
}

// ============================================================
// 工具函数（示例）
// ============================================================
function getDeviceId() {
    return localStorage.getItem('device_id') || crypto.randomUUID();
}

function showSystemMessage(payload) {
    console.log('📢 系统消息:', payload);
}

function showMention(payload) {
    console.log('👤 有人提到你:', payload);
}

function showAlert(payload) {
    console.log('⚠️ 警告:', payload);
}

function updateUIWithLiveData(data) {
    console.log('🔄 更新 UI:', data);
}

// ============================================================
// 清理示例
// ============================================================
console.log('\n=== 清理 ===');

// 5 秒后清理所有连接（仅用于演示）
setTimeout(() => {
    console.log('开始清理连接...');
    unsubscribe1();
    basicSSE.close();
    preConnectSSE.destroy();
    notificationSSE.destroy();
    manager.destroy();
    conditionalSSE.destroy();
    console.log('所有连接已清理');
}, 5000);


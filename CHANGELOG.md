# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **主动建立 SSE 连接**: 新增 `connect()` 公开方法，允许不发送 POST 请求直接建立 SSE 连接
- **使用示例文件**: 新增 `examples/active-connect-example.js` 展示主动连接的各种使用场景

### Changed
- **内部重构**: 将连接逻辑拆分为 `maybeConnect()` 和 `forceConnect()`，提高代码可维护性
- **reconnect() 行为明确**: `reconnect()` 仅用于重连，主动连接请使用 `connect()`

### Use Cases
- 纯服务端推送场景（不需要客户端发起任务）
- 预先建立长连接以减少首次请求延迟
- 实时通知系统、聊天室等实时数据推送
- 多频道订阅管理（类似 WebSocket）

## [0.1.4] - 2025-01-09

### Added
- **SSE 连接自定义请求头支持**: 通过集成 `event-source-polyfill` 库，现在支持在 SSE 连接中使用自定义请求头
- **新配置选项 `sseHeaders`**: 允许为 SSE 连接设置自定义请求头（如 API Key、版本号等）
- **增强的 token 功能**: 全局 `token` 现在会自动添加到 SSE 连接的 `Authorization: Bearer <token>` 头部
- **使用示例文件**: 新增 `examples/custom-headers-example.js` 展示各种使用场景
- **完整的文档更新**: README.md 包含新功能的详细说明和最佳实践

### Changed
- **依赖更新**: 添加 `event-source-polyfill ^1.0.31` 作为生产依赖
- **EventSource 实现**: 从原生 `EventSource` 切换到 `EventSourcePolyfill` 以支持自定义请求头
- **类型定义增强**: `SSEClientOptions` 类型定义新增 `sseHeaders` 字段
- **文档注释**: 更新代码注释说明新的自定义请求头功能

### Technical Details
- 保持 **100% 向下兼容**: 所有现有 API 和功能完全不变
- 自动配置合并: `sseHeaders` 和 `token` 会智能合并为 EventSourcePolyfill 的 headers 配置
- 错误处理: 增强了连接失败时的错误处理机制

### Use Cases
- API Key 认证的 SSE 连接
- 跨域 SSE 连接的自定义头部
- 微服务架构中的服务间认证
- 需要追踪 ID 或版本信息的连接

## [0.1.3] - Previous Release
### Added
- 初始的 SSE 多路复用功能
- POST 请求与 SSE 监听集成
- 心跳检测和自动重连
- 空闲超时管理

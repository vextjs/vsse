# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **防重复连接保护机制** 🛡️: 单个实例内多层防护确保单例连接
  - 连接状态检查：防止覆盖现有连接
  - 连接锁（Mutex）：防止并发建立连接
  - 防抖机制：限制连接尝试的最小时间间隔（500ms）
  - 状态机管理：跟踪连接生命周期（disconnected/connecting/connected/error）
- **连接诊断工具**: 新增 `getConnectionInfo()` 方法，返回连接状态和调试信息
- **详细日志输出**: 所有连接操作都有对应的日志记录，便于调试和监控
- **用户文档**: README.md 中新增防重复连接保护章节
- **主动建立 SSE 连接**: 新增 `connect()` 公开方法，允许不发送 POST 请求直接建立 SSE 连接
- **使用示例文件**: 新增 `examples/active-connect-example.js` 展示主动连接的各种使用场景
- **postAndListen 返回 response 对象**: `postAndListen()` 方法现在返回 POST 请求的原生 Response 对象，可用于获取状态码、响应头、响应体等信息

### Changed
- **内部重构**: 将连接逻辑拆分为 `maybeConnect()` 和 `forceConnect()`，提高代码可维护性
- **reconnect() 行为明确**: `reconnect()` 仅用于重连，主动连接请使用 `connect()`
- **增强错误处理**: 连接失败时会释放连接锁并正确设置状态
- **日志输出标准化**: 所有日志使用 `[vsse]` 前缀，便于过滤和调试

### Fixed
- **防止重复连接**: 同一个实例多次调用 `connect()` 或 `onBroadcast()` 只会建立一个连接
- **防止竞态条件**: 并发调用连接方法时不会产生多个连接
- **防止频繁重连**: 防抖机制避免短时间内的重复连接尝试

### Performance
- **内存开销**: 新增状态变量约 ~100 字节（可忽略）
- **CPU 开销**: 每次连接尝试增加 ~0.01ms 检查时间（可忽略）
- **网络开销**: ✅ 零额外开销（防止了不必要的连接）

### Use Cases
- 单个实例多次调用连接方法（防止不规范代码）
- 组件频繁重新渲染场景下的连接稳定性
- 生产环境中的连接异常诊断和监控
- 纯服务端推送场景（不需要客户端发起任务）
- 预先建立长连接以减少首次请求延迟
- 实时通知系统、聊天室等实时数据推送

### Design Philosophy
- **实例独立**: 每个 SSEClient 实例管理自己的连接，互不干扰
- **实例内防重**: 同一个实例内防止重复建立连接
- **URL 自由**: 不同 URL 可以创建多个实例，各自独立工作

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

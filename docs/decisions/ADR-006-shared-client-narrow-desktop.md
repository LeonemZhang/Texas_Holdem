# ADR-006 — 共享客户端与窄桌面边界

## 背景

Windows 客户端和浏览器需要呈现同一牌局，同时桌面端还需要网卡、窗口、房主服务和本机记录能力。

## 决策

复用同一套 React 游戏 UI；Electron renderer 不直接感知 Electron API，桌面能力通过窄化、校验后的 preload bridge 提供。

## 影响

桌面只能加载本地打包 UI；外部链接交给系统浏览器；记录管理不向 LAN 开放；桌面和浏览器品牌资源共享同一来源。

完整行为规范：`docs/product-specs/desktop-experience.md#桌面安全与数据目录`
设计文档：`docs/design-docs/desktop.md`

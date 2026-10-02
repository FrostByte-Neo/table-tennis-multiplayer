# Table Tennis Pro：联机对战版

一个单文件 Canvas 乒乓球游戏，在原来的人机对战之外加了双人联机。两名玩家通过 WebRTC 点对点直连对打，服务器只在建立连接时转发握手信息。

## 文件

| 文件 | 作用 |
|---|---|
| `page.html` | 入口页面。内嵌运行时安全 guard 和 TweenLite 兼容层，按顺序加载下面的脚本 |
| `config.js` | 部署配置：信令服务器地址、STUN/TURN 列表 |
| `net.js` | 网络层。WebRTC（一条可靠通道 + 一条不可靠通道），以及调试用的 BroadcastChannel |
| `05-game-table-tennis-pro.js` | 游戏本体和联机逻辑 |
| `remix-sdk-0.17.0.min.js` | Remix SDK 本地副本（与 jsDelivr 上的 0.17.0 完全一致） |
| `signaling/` | 信令服务器（Node + `ws`），负责房间码配对，转发 offer/answer/ICE |
| `dual.html` | 本地双人测试页，左右两个 iframe 各是一名玩家 |

## 本地运行

```bash
# 终端 1：信令服务器（端口 8080，可用 PORT 覆盖）
cd signaling && npm install && npm start

# 终端 2：静态文件
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/dual.html`，两边各选一支队伍并点 **ONLINE**：一边"创建房间"，另一边输入房间码"加入房间"。

不想开信令服务器时用 `dual.html?net=bc`，会改走同一浏览器内的 BroadcastChannel。

## 联机规则

- 创建房间的一方是**主机**，负责判分和决定发球方，加入方以主机的判分为准。
- 击球时发送击球后的完整球状态，对方镜像后直接使用，不重新计算。
- 球拍位置每秒同步 30 次，走不可靠通道。
- **延迟补偿**：两边每秒互相 ping 一次测 RTT。收到对方击球时，把球按单程延迟（最多 200ms）快进；主机判对方漏接时会先等 RTT + 50ms（最多 400ms），这期间对方的回球到了就撤销这次判分。
- 暂停、帮助弹窗、切到后台都会让双方一起暂停。比赛结束后双方都确认才开下一局，联机对局不影响单机关卡进度。

## 修改脚本后

`page.html` 引用本地脚本时带了 `?v=N`。改完 `config.js`、`net.js` 或游戏脚本后把 N 加一，否则浏览器可能继续用缓存的旧版本。

## 部署

见 [`docs/DEPLOY_PLAN.md`](docs/DEPLOY_PLAN.md)。

## 版权说明

游戏本体（`05-game-table-tennis-pro.js`、`page.html` 里内嵌的代码和美术资源链接）来自 Remix 平台上的游戏，**没有明确的开源或商用许可**。联机部分（`net.js`、`signaling/`、`config.js`、`dual.html` 以及游戏脚本中标注"联机"的改动）是新写的代码。公开发布或商用之前，需要先取得原作者的授权。

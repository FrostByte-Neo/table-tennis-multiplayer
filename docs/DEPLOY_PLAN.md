# 部署方案（交给执行 agent）

目标：让两台不在同一网络的设备打开同一个网址，就能联机对打。

本文件是给执行部署的 agent 的任务说明。代码已经准备好，执行时**不需要修改游戏逻辑**，只需要部署两个服务、改一个配置文件、做一轮验证。

## 0. 先确认的事（执行前问用户）

1. **版权**：游戏本体来自 Remix 平台，没有明确许可（见 README 的"版权说明"）。公开上线前请用户确认是否已获授权，或者只做小范围私下测试。用户没有确认之前，不要把网址发到公开渠道。
2. **账号**：信令服务器和静态托管都需要用户的账号（例如 Render、Cloudflare）。需要登录或授权时停下来请用户操作，不要自己注册账号。
3. **TURN 预算**：要不要现在就配 TURN（见第 3 步）。不配的话，公司网络、部分 4G/5G 网络下会连不上。

## 1. 架构

```
玩家 A 浏览器 ──┐                         ┌── 玩家 B 浏览器
  (HTTPS 静态页) │  建连时：wss 信令       │
                 └──► 信令服务器 ◄──────────┘
                      (Node + ws)
建连后：A ◄═══ WebRTC DataChannel（P2P，打不通时经 TURN 中继）═══► B
```

需要部署的东西：

| 组件 | 内容 | 要求 |
|---|---|---|
| 静态页面 | 仓库根目录：`index.html`、`page.html`、`config.js`、`net.js`、`05-game-table-tennis-pro.js`、`remix-sdk-0.17.0.min.js` | 必须 HTTPS |
| 信令服务器 | `signaling/` 目录，`npm install && npm start`，监听 `PORT` 环境变量 | 必须能走 `wss://`；健康检查 `GET /health` 返回 `ok` |
| TURN（可选） | 第三方服务或自建 coturn | 见第 3 步 |

资源（图片、音效）从 `https://remix.gg/blob/...` 直接加载，不需要部署。

## 2. 部署信令服务器

推荐 Render（免费、支持 WebSocket、自带 HTTPS）。Fly.io、Railway 也可以，步骤相同。

1. 新建 Web Service，连接 GitHub 仓库 `FrostByte-Neo/table-tennis-multiplayer`，分支 `main`。
2. Root Directory 填 `signaling`，Build Command 填 `npm install`，Start Command 填 `npm start`。
3. Health Check Path 填 `/health`。
4. 部署完成后记下地址，例如 `https://ttt-signaling.onrender.com`，信令地址就是 `wss://ttt-signaling.onrender.com`。
5. 验证：`curl https://<域名>/health` 返回 `ok`。

要注意：

- Render 免费档闲置 15 分钟会休眠，第一个玩家点"创建房间"时可能要等 30 到 60 秒。如果用户介意，换付费档或 Fly.io。
- 服务器每 25 秒 ping 一次客户端，防止反向代理断开空闲连接，不需要额外配置。
- 房间信息只存在内存里，重启后正在等待的房间会失效（已经连上的对局不受影响，因为数据走 P2P）。只能跑**一个实例**，不要开多副本或自动扩容。

## 3. TURN（建议做）

只有 STUN 时，两边都在对称 NAT 后面（常见于公司网络、部分移动网络）就连不上，表现为卡在"连接中..."，30 秒后提示"连接超时：对手未加入或 NAT 打不通"。

按成本从低到高选一个：

1. **Metered.ca 免费档**（每月 50GB，静态用户名密码）：注册后拿到 TURN 地址和凭据，直接写进 `config.js` 的 `iceServers`。凭据会出现在前端代码里，任何人都能拿去用，免费档可以接受，但要提醒用户这一点。
2. **Cloudflare Realtime TURN**：需要后端用 API Token 换短期凭据。做法是在信令服务器加一个 `GET /turn` 接口返回短期凭据，`net.js` 建连前去取。这需要改代码，属于额外任务，做之前先问用户。
3. **自建 coturn**：需要一台有公网 IP 的服务器，开放 3478 UDP/TCP 和中继端口段。不推荐作为第一步。

`config.js` 里的写法（保留 STUN，追加 TURN）：

```js
window.TT_CONFIG = {
    signalingUrl: "wss://ttt-signaling.onrender.com",
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:<host>:3478", username: "<user>", credential: "<pass>" },
        { urls: "turns:<host>:443?transport=tcp", username: "<user>", credential: "<pass>" },
    ],
};
```

## 4. 部署静态页面

推荐 Cloudflare Pages 或 GitHub Pages（仓库是公开的，GitHub Pages 最省事；用户要求私有时用 Cloudflare Pages）。

1. 修改 `config.js`：`signalingUrl` 填第 2 步的 `wss://` 地址，需要的话加上 TURN。
2. 把 `page.html` 里三个本地脚本的 `?v=N` 统一加一（`config.js`、`net.js`、`05-game-table-tennis-pro.js`），避免玩家浏览器用旧缓存。
3. 提交并推送到 `main`。**不要强制推送**，这个仓库之前被强制推送覆盖过一次，旧历史已经找不回来。
4. GitHub Pages：仓库 Settings → Pages → Source 选 `main` 分支的根目录。Cloudflare Pages：连接仓库，不需要构建命令，输出目录为 `/`。
5. 访问 `https://<静态域名>/`，会自动跳到 `page.html`。

不需要改 `page.html` 的安全白名单：guard 会自动放行 `config.js` 里配置的信令域名，以及与页面同域名的 `ws://`/`wss://`。URL 参数 `?sig=` 在线上不生效（会被 guard 拦下），只用于本地调试。

## 5. 验证清单

全部通过才算完成。浏览器开发者工具的 Console 不应出现 `blocked` 或 WebSocket 报错。

| # | 操作 | 预期 |
|---|---|---|
| 1 | `curl https://<信令域名>/health` | 返回 `ok` |
| 2 | 电脑打开静态网址 | 正常进入选队伍界面，图片和声音正常 |
| 3 | 电脑选队伍 → ONLINE → 创建房间 | 显示 5 位房间码 |
| 4 | 手机**用 4G/5G，不连同一个 Wi-Fi**，打开网址 → ONLINE → 加入房间，输入错误房间码 | 提示"房间不存在，请检查房间码"，按钮可以继续点 |
| 5 | 输入正确房间码 | 两边几秒内进入比赛，各自看到对方的国旗 |
| 6 | 对打几个回合 | 双方比分一致，发球方交替正确 |
| 7 | 在一边的 Console 执行 `net.rtt` | 返回一个正数（毫秒），跨网络一般在 30 到 300 之间 |
| 8 | 一边点暂停，再恢复 | 另一边同步暂停和恢复 |
| 9 | 打完一局（可以在主机 Console 执行 `oGameData.userScore = 10` 加速），双方点屏幕 | 双方都点了之后一起开下一局 |
| 10 | 一边直接关掉页面 | 另一边几秒内显示"对手已离开"遮罩，点按钮回到主菜单 |

第 4、5 步连不上（一直显示"连接中..."）基本就是 NAT 问题，回到第 3 步配 TURN。验证 TURN 是否生效：打开 `chrome://webrtc-internals`，看选中的 candidate pair 类型是否为 `relay`。

## 6. 已知风险

- **资源外链**：图片和音效从 `remix.gg` 加载。如果对方改了防盗链或删了文件，游戏会加载失败。出现这种情况就把 `05-game-table-tennis-pro.js` 里 `ASSET_BASE` 指向的 14 个文件下载到仓库，并把 `ASSET_BASE` 改成相对路径（这同样涉及版权，先问用户）。
- **信令服务器无鉴权**：任何人都能用它配对。流量很小，现阶段可以接受。如需限制，可以在 `signaling/server.js` 的 `connection` 回调里检查 `req.headers.origin` 是否等于静态站域名。
- **判分偏向主机**：已经做了延迟补偿（快进最多 200ms，判分宽限最多 400ms），但单程延迟超过 200ms 时加入方仍会吃亏。这属于玩法调优，不在本次部署范围内。

## 7. 交付物

完成后向用户汇报：

- 静态网址和信令网址
- 是否配了 TURN，用的哪家，凭据是否暴露在前端
- 第 5 步验证清单的结果（哪几项通过，失败项的现象）
- 对仓库的改动（应当只有 `config.js` 和 `page.html` 的版本号）及对应 commit

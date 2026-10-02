// 联机部署配置，net.js 会读取 window.TT_CONFIG。
//
// signalingUrl：信令服务器地址。页面走 HTTPS 时必须是 wss://。
//   留空时，HTTPS 页面连同域名的 wss://，本地开发连 ws://<当前主机>:8080。
// iceServers：STUN/TURN 列表。不填就只用 Google 公共 STUN，
//   对称 NAT / 公司网络下会连不上，需要加 TURN：
//   { urls: "turn:turn.example.com:3478", username: "...", credential: "..." }
window.TT_CONFIG = {
    signalingUrl: "",
};

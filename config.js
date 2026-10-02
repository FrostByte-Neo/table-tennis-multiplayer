// 联机部署配置，net.js 会读取 window.TT_CONFIG。
//
// signalingUrl：信令服务器地址。页面走 HTTPS 时必须是 wss://。
//   留空时，HTTPS 页面连同域名的 wss://，本地开发连 ws://<当前主机>:8080。
// iceServers：STUN/TURN 列表。不填就只用 Google 公共 STUN，
//   对称 NAT / 公司网络下会连不上，需要加 TURN：
//   { urls: "turn:turn.example.com:3478", username: "...", credential: "..." }
//
// brand：品牌标识。name 用在球场背景墙和竖幅上；paddleColor 是自己球拍的颜色；
//   paddleLogo 是印在球拍中心的图片（方形，SVG 或 PNG 都行）。
window.TT_CONFIG = {
    signalingUrl: "",
    brand: {
        name: "XINIAN",
        paddleColor: "#E3242B",
        paddleLogo: "assets/xinian-logo.svg",
    },
};

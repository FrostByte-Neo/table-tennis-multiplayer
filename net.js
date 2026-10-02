// ============================================================
// 网络层 net.js
// 抽象接口：send / onMessage / onPeerJoin / onPeerLeave
//
// 两种实现，接口完全一致，游戏代码不用改：
//   1. WebRTC          —— 真正的 P2P 直连，两台电脑可对打。需要信令服务器。
//   2. BroadcastChannel —— 同浏览器多标签页联机，调试用。无需服务器。
//
// 默认用 WebRTC；URL 带 ?net=bc 时用 BroadcastChannel（无需信令服务器）。
//
// 部署配置：在加载 net.js 之前定义 window.TT_CONFIG（见 config.js）：
//   signalingUrl  信令地址，必须 wss://（页面是 HTTPS 时）
//   iceServers    STUN/TURN 列表，覆盖下面的默认值
// ============================================================
(function () {
    const CONFIG = window.TT_CONFIG || {};
    const params = new URLSearchParams(location.search);

    // 信令服务器地址。优先级：URL 参数 ?sig= > TT_CONFIG.signalingUrl > 同域名 > 本地 8080。
    function resolveSignalingUrl() {
        const p = params.get('sig');
        if (p) return p;
        if (CONFIG.signalingUrl) return CONFIG.signalingUrl;
        // 同域名同端口：页面在 https://game.com，信令在 wss://game.com（同端口）
        // 注意：只有部署时才用同端口，本地开发时静态服务器(8765)和信令服务器(8080)不同端口
        if (location.protocol === 'https:') return 'wss://' + location.host;
        // 本地开发：固定用 8080 端口的信令服务器
        if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
            return 'ws://' + location.hostname + ':8080';
        }
        return 'ws://127.0.0.1:8080';
    }
    const SIGNALING_URL = resolveSignalingUrl();

    // STUN 服务器（NAT 穿透用）。Google 公开 STUN 免费。
    // 对称 NAT / 公司网络需要 TURN 中继，通过 TT_CONFIG.iceServers 配置。
    const ICE_SERVERS = CONFIG.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    const PING_INTERVAL_MS = 1000;

    const SIGNALING_ERRORS = {
        room_not_found: '房间不存在，请检查房间码',
        room_full: '房间已满',
        room_exists: '房间码冲突，请重新创建',
        invalid_room: '房间码无效',
    };

    window.Net = class Net {
        constructor() {
            this.transport = null;       // 'webrtc' | 'bc'
            this.roomCode = null;
            this.isHost = false;
            this.connected = false;
            this.selfId = Math.random().toString(36).slice(2, 8);

            // WebRTC 状态
            this.pc = null;              // RTCPeerConnection
            this.ws = null;              // 信令 WebSocket
            this.dcReliable = null;      // 可靠 DataChannel（击球/得分）
            this.dcUnreliable = null;    // 不可靠 DataChannel（球拍位置）

            // 回调
            this.onMessage = null;       // (data) => void
            this.onPeerJoin = null;      // () => void
            this.onPeerLeave = null;      // () => void
            this.onOpen = null;           // () => void  连接建立
            this.onStatus = null;        // (text) => void  状态变化（可选，给 UI 显示）
            this.onError = null;         // (code) => void  信令拒绝（房间不存在/已满等）

            // 往返延迟（毫秒，指数平滑）。连上后每秒 ping 一次。
            this.rtt = 0;
            this._pingTimer = null;

            this.useTransport = params.get('net') === 'bc' ? 'bc' : 'webrtc';
        }

        // 单程延迟估计（秒），供游戏做延迟补偿
        get oneWay() { return this.rtt / 2000; }

        _status(t) { if (this.onStatus) this.onStatus(t); }

        // 创建房间（host），返回房间码
        async createRoom(code) {
            this.roomCode = code || this._genCode();
            this.isHost = true;
            if (this.useTransport === 'webrtc') {
                await this._webrtcCreateRoom();
            } else {
                this._bcOpen();
            }
            return this.roomCode;
        }

        // 加入房间（guest）
        async joinRoom(code) {
            this.roomCode = code;
            this.isHost = false;
            if (this.useTransport === 'webrtc') {
                await this._webrtcJoinRoom();
            } else {
                this._bcOpen();
                this._bcPost({ t: 'hello', from: this.selfId });
                this._helloTimer = setInterval(() => {
                    if (this.connected) return clearInterval(this._helloTimer);
                    this._bcPost({ t: 'hello', from: this.selfId });
                }, 500);
            }
        }

        _genCode() {
            return Math.random().toString(36).slice(2, 7).toUpperCase();
        }

        // ============== BroadcastChannel 实现 ==============
        _bcOpen() {
            if (typeof BroadcastChannel === 'undefined') {
                console.error('BroadcastChannel 不可用');
                return;
            }
            if (this.transport === 'bc' && this._bc) this._bc.close();
            this.transport = 'bc';
            this.connected = false;
            this._bc = new BroadcastChannel('ttt-room-' + this.roomCode);
            this._bc.onmessage = (e) => this._bcOnRaw(e.data);
        }

        _bcOnRaw(raw) {
            if (!raw || raw.from === this.selfId) return;
            const msg = raw.msg;
            if (!msg) return;
            if (msg.t === 'hello') {
                if (this.isHost) this._bcPost({ t: 'ack', from: this.selfId });
                this._handleConnected();
                return;
            }
            if (msg.t === 'ack') {
                this._handleConnected();
                return;
            }
            this._onPeerMsg(msg);
        }

        _bcPost(msg) {
            if (this._bc) this._bc.postMessage({ from: this.selfId, msg });
        }

        // ============== WebRTC 实现 ==============
        async _webrtcCreateRoom() {
            this.transport = 'webrtc';
            this._status('连接信令服务器...');
            await this._wsConnect();
            this.ws.send(JSON.stringify({ type: 'join', room: this.roomCode, create: true }));
            this._status('房间码: ' + this.roomCode + '（等待对手加入...）');
            this._startConnectTimeout();
            // host 等 'start' 信号（guest 进房后信令服务器发来）再发起 offer
        }

        async _webrtcJoinRoom() {
            this.transport = 'webrtc';
            this._status('连接信令服务器...');
            await this._wsConnect();
            this.ws.send(JSON.stringify({ type: 'join', room: this.roomCode }));
            this._status('正在加入 ' + this.roomCode + ' ...');
            this._startConnectTimeout();
            // guest 收到 host 的 offer 后回 answer
        }

        _startConnectTimeout() {
            this._clearConnectTimeout();
            this._connectTimer = setTimeout(() => {
                if (!this.connected) {
                    this._status('连接超时：对手未加入或 NAT 打不通');
                }
            }, 30000);
        }

        _clearConnectTimeout() {
            if (this._connectTimer) { clearTimeout(this._connectTimer); this._connectTimer = null; }
        }

        _wsConnect() {
            return new Promise((resolve, reject) => {
                try {
                    this.ws = new WebSocket(SIGNALING_URL);
                } catch (e) {
                    reject(new Error('信令地址无效'));
                    return;
                }
                this.ws.onopen = () => resolve();
                this.ws.onerror = () => reject(new Error('信令服务器连接失败'));
                this.ws.onmessage = (e) => this._wsOnMessage(JSON.parse(e.data));
                this.ws.onclose = () => {
                    if (!this.connected) this._status('信令断开');
                };
            });
        }

        _wsOnMessage(msg) {
            switch (msg.type) {
                case 'joined':
                    // 信令确认加入。以信令的角色为准，避免两边都当 host 或都不是
                    if (msg.isHost != null) this.isHost = msg.isHost;
                    break;
                case 'start':           // 信令通知 host：guest 进房了，发起 offer
                    this._pcCreate().then(() => this._pcCreateOffer());
                    break;
                case 'offer':           // guest 收到 host 的 offer
                    this._pcCreate().then(() => this._pcOnOffer(msg.payload));
                    break;
                case 'answer':          // host 收到 guest 的 answer
                    if (this.pc) this.pc.setRemoteDescription(msg.payload).catch(() => {});
                    break;
                case 'ice':             // 双方互发 ICE 候选
                    if (this.pc) this.pc.addIceCandidate(msg.payload).catch(() => {});
                    break;
                case 'peer_left':
                    this._handleDisconnect();
                    break;
                case 'error':
                    this._status(SIGNALING_ERRORS[msg.code] || ('错误: ' + (msg.message || '')));
                    this._clearConnectTimeout();
                    this.onError && this.onError(msg.code);
                    break;
            }
        }

        async _pcCreate() {
            if (this.pc) return;
            this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            this.pc.onicecandidate = (e) => {
                if (e.candidate) {
                    this.ws.send(JSON.stringify({ type: 'ice', room: this.roomCode, payload: e.candidate }));
                }
            };
            this.pc.onconnectionstatechange = () => {
                const s = this.pc.connectionState;
                // connected 由 DataChannel open 触发，这里不重复
                // disconnected 通常几秒内自动恢复，不当离开
                // 只有 failed / closed 才算真正断开
                if (s === 'failed' || s === 'closed') this._handleDisconnect();
            };
            // host 创建可靠通道；guest 通过 ondatachannel 拿到
            if (this.isHost) {
                this.dcReliable = this.pc.createDataChannel('reliable', { ordered: true });
                this.dcUnreliable = this.pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0 });
                this._bindDc(this.dcReliable, true);
                this._bindDc(this.dcUnreliable, false);
            } else {
                this.pc.ondatachannel = (e) => {
                    if (e.channel.label === 'reliable') { this.dcReliable = e.channel; this._bindDc(this.dcReliable, true); }
                    else if (e.channel.label === 'unreliable') { this.dcUnreliable = e.channel; this._bindDc(this.dcUnreliable, false); }
                };
            }
        }

        async _pcCreateOffer() {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.ws.send(JSON.stringify({ type: 'offer', room: this.roomCode, payload: offer }));
            this._status('已发起邀请，等待对方接受...');
        }

        async _pcOnOffer(offer) {
            await this.pc.setRemoteDescription(offer);
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.ws.send(JSON.stringify({ type: 'answer', room: this.roomCode, payload: answer }));
            this._status('已接受邀请，连接中...');
        }

        _bindDc(dc, reliable) {
            dc.onopen = () => {
                // 两个通道都 open 后才算连上
                if (this.dcReliable && this.dcReliable.readyState === 'open' &&
                    this.dcUnreliable && this.dcUnreliable.readyState === 'open') {
                    this._handleConnected();
                }
            };
            dc.onmessage = (e) => {
                let data;
                try { data = JSON.parse(e.data); } catch { return; }
                this._onPeerMsg(data);
            };
            dc.onclose = () => this._handleDisconnect();
        }

        // 两种传输层共用的收包入口：ping/pong/leave 在网络层消化，其余交给游戏
        _onPeerMsg(data) {
            if (!data) return;
            if (data.t === 'leave') { this._handleDisconnect(); return; }
            if (data.t === 'ping') { this.send({ t: 'pong', ts: data.ts }, true); return; }
            if (data.t === 'pong') {
                const sample = performance.now() - data.ts;
                this.rtt = this.rtt ? this.rtt * 0.8 + sample * 0.2 : sample;
                return;
            }
            this.onMessage && this.onMessage(data);
        }

        _handleConnected() {
            if (this.connected) return;
            this.connected = true;
            this._clearConnectTimeout();
            this.rtt = 0;
            clearInterval(this._pingTimer);
            const ping = () => this.send({ t: 'ping', ts: performance.now() }, true);
            ping();
            this._pingTimer = setInterval(ping, PING_INTERVAL_MS);
            this._status('已连接');
            this.onPeerJoin && this.onPeerJoin();
            this.onOpen && this.onOpen();
        }

        _handleDisconnect() {
            if (!this.connected) return;
            this.connected = false;
            clearInterval(this._pingTimer);
            this._status('对手已离开');
            this.onPeerLeave && this.onPeerLeave();
        }

        // ============== 统一发送接口 ==============
        send(data, reliable) {
            if (!this.connected) return false;
            if (this.transport === 'bc') {
                this._bcPost(data);
                return true;
            }
            // WebRTC：可靠消息走 reliable 通道，球拍位置走 unreliable 通道
            const dc = reliable === false ? this.dcUnreliable : this.dcReliable;
            if (!dc || dc.readyState !== 'open') return false;
            try { dc.send(JSON.stringify(data)); return true; } catch { return false; }
        }

        leave() {
            clearInterval(this._helloTimer);
            clearInterval(this._pingTimer);
            this._clearConnectTimeout();
            if (this.transport === 'bc') {
                if (this._bc) {
                    this._bcPost({ t: 'leave', from: this.selfId });
                    this._bc.close();
                    this._bc = null;
                }
            } else {
                if (this.connected) {
                    try { this.dcReliable && this.dcReliable.send(JSON.stringify({ t: 'leave' })); } catch {}
                }
                if (this.pc) { this.pc.close(); this.pc = null; }
                if (this.ws) {
                    this.ws.onclose = null;
                    try { this.ws.send(JSON.stringify({ type: 'leave' })); } catch {}
                    this.ws.close();
                    this.ws = null;
                }
            }
            this.connected = false;
        }
    };

    // 全局单例
    window.net = new Net();
})();

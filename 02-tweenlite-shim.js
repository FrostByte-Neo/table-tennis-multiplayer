
        // =========================
        // Minimal TweenLite/TweenMax shim (ULTRA SAFE - NO ANONYMOUS OBJECT FUNCTIONS)
        // =========================
        var __activeTweens = new Set();

        // 1. Khai báo các hàm toán học thành Hàm Độc Lập (Named Functions)
        function easeLinear(t) { return t; }
        function easeQuadIn(t) { return t * t; }
        function easeQuadOut(t) { return t * (2 - t); }
        function easeQuadInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
        function easeCubicOut(t) { t -= 1; return t * t * t + 1; }
        function easeBackOut(t) { var s = 1.70158; t -= 1; return t * t * ((s + 1) * t + s) + 1; }
        function easeBounceOut(t) {
            if (t < 1 / 2.75) return 7.5625 * t * t;
            if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
            if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
            t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
        }

        // 2. Map các tên tương ứng với hàm độc lập
        function getEase(name) {
            if (name === "Quad.easeIn") return easeQuadIn;
            if (name === "Quad.easeOut") return easeQuadOut;
            if (name === "Quad.easeInOut") return easeQuadInOut;
            if (name === "Cubic.easeOut") return easeCubicOut;
            if (name === "Back.easeOut") return easeBackOut;
            if (name === "Bounce.easeOut") return easeBounceOut;
            return easeLinear;
        }

        class SimpleTween {
            constructor(target, duration, vars) {
                this.target = target;
                this.duration = Math.max(0, Number(duration) || 0) * 1000;
                this.vars = vars || {};
                this.delay = Math.max(0, Number(this.vars.delay) || 0) * 1000;
                this.ease = getEase(this.vars.ease);
                this.killed = false;
                this.raf = null;
                this.starts = {};
                this.ends = {};
                this.keys = [];

                for (var k in this.vars) {
                    if (!Object.prototype.hasOwnProperty.call(this.vars, k)) continue;
                    if (k === "delay" || k === "ease" || k === "onComplete") continue;
                    if (typeof this.vars[k] !== "number") continue;
                    this.keys.push(k);
                    this.starts[k] = Number(target[k]) || 0;
                    this.ends[k] = Number(this.vars[k]);
                }

                var self = this;
                __activeTweens.add(this);

                var initTime = performance.now();

                function tick(now) {
                    if (self.killed) return;

                    var elapsed = now - initTime;

                    // Handle delay inside the rAF loop
                    if (elapsed < self.delay) {
                        self.raf = requestAnimationFrame(tick);
                        return;
                    }

                    if (self.duration === 0) {
                        for (var j = 0; j < self.keys.length; j++) {
                            var key = self.keys[j];
                            self.target[key] = self.ends[key];
                        }
                        self._complete();
                        return;
                    }

                    var raw = Math.min(1, Math.max(0, (elapsed - self.delay) / self.duration));
                    var eased = self.ease(raw);

                    for (var i = 0; i < self.keys.length; i++) {
                        var currentKey = self.keys[i];
                        self.target[currentKey] = self.starts[currentKey] + (self.ends[currentKey] - self.starts[currentKey]) * eased;
                    }

                    if (raw < 1) {
                        self.raf = requestAnimationFrame(tick);
                    } else {
                        self._complete();
                    }
                }
                this.raf = requestAnimationFrame(tick);
            }

            _complete() {
                if (this.killed) return;
                __activeTweens.delete(this);
                this.killed = true;
                if (typeof this.vars.onComplete === "function") {
                    try { this.vars.onComplete(); } catch (e) { console.error(e); }
                }
            }

            kill() {
                if (this.killed) return;
                this.killed = true;
                if (this.raf) cancelAnimationFrame(this.raf);
                __activeTweens.delete(this);
            }
        }

        // 3. Khai báo hàm độc lập cho Tween
        function tweenLiteToArgs(target, duration, vars) {
            return new SimpleTween(target, duration, vars);
        }

        function tweenMaxKillArgs() {
            var tweensArray = Array.from(__activeTweens);
            for (var i = 0; i < tweensArray.length; i++) {
                tweensArray[i].kill();
            }
        }

        window.TweenLite = { to: tweenLiteToArgs };
        window.TweenMax = { killAll: tweenMaxKillArgs };

        // =========================================
        // NATIVE WEB AUDIO API MANAGER - PC + MOBILE SAFE
        // =========================================
        const NativeAudioContextClass = window.AudioContext || window.webkitAudioContext || null;
        let audioCtx = null;
        try {
            audioCtx = NativeAudioContextClass ? new NativeAudioContextClass() : null;
        } catch (err) {
            console.warn("AudioContext creation failed:", err);
            audioCtx = null;
        }
        const masterGain = audioCtx ? audioCtx.createGain() : null;

        if (masterGain && audioCtx) {
            masterGain.gain.value = 1;
            masterGain.connect(audioCtx.destination);
        }

        const NativeAudioController = {
            ctx: audioCtx,
            masterGain: masterGain,
            supported: !!(audioCtx && masterGain),
            _muted: false,
            _unlockPromise: null,
            _instances: new Set(),

            register(instance) {
                this._instances.add(instance);
            },

            mute(flag) {
                this._muted = !!flag;
                if (!this.supported || !this.ctx || !this.masterGain || this.ctx.state === "closed") return;
                const now = this.ctx.currentTime;
                this.masterGain.gain.cancelScheduledValues(now);
                this.masterGain.gain.setValueAtTime(this._muted ? 0 : 1, now);
            },

            flushPending() {
                this._instances.forEach((instance) => {
                    try { instance._flushPending(); } catch (err) { console.warn("Audio flush failed:", err); }
                });
            },

            unlock() {
                if (!this.supported || !this.ctx || this.ctx.state === "closed") {
                    return Promise.resolve(false);
                }

                if (this.ctx.state === "running") {
                    this._primeOutput();
                    this.flushPending();
                    return Promise.resolve(true);
                }

                if (this._unlockPromise) return this._unlockPromise;

                let resumeResult;
                try {
                    resumeResult = this.ctx.resume();
                } catch (err) {
                    console.warn("AudioContext resume threw:", err);
                    return Promise.resolve(false);
                }

                const unlockAttempt = Promise.resolve(resumeResult)
                    .then(() => {
                        const unlocked = this.ctx && this.ctx.state === "running";
                        if (unlocked) {
                            this._primeOutput();
                            this.flushPending();
                        }
                        return unlocked;
                    })
                    .catch((err) => {
                        console.warn("AudioContext resume failed:", err);
                        return false;
                    })
                    .then((unlocked) => {
                        if (this._unlockPromise === unlockAttempt) this._unlockPromise = null;
                        return unlocked;
                    });

                this._unlockPromise = unlockAttempt;

                // Một số trình duyệt giữ Promise resume() ở trạng thái pending khi lệnh không đến từ gesture.
                // Cho phép gesture tiếp theo thử lại thay vì bị khóa vĩnh viễn bởi Promise cũ.
                window.setTimeout(() => {
                    if (this._unlockPromise === unlockAttempt && this.ctx && this.ctx.state !== "running") {
                        this._unlockPromise = null;
                    }
                }, 400);

                return unlockAttempt;
            },

            _primeOutput() {
                if (!this.supported || !this.ctx || this.ctx.state !== "running") return;
                try {
                    const silentBuffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate || 44100);
                    const silentSource = this.ctx.createBufferSource();
                    silentSource.buffer = silentBuffer;
                    silentSource.connect(this.masterGain);
                    silentSource.start(0);
                } catch (err) {
                    // Một số WebView không cần/không cho phép source im lặng; resume thành công vẫn đủ.
                }
            }
        };

        class NativeAudio {
            constructor(opts) {
                opts = opts || {};
                this.src = Array.isArray(opts.src) ? opts.src[0] : opts.src;
                this.sprite = opts.sprite || null;
                this.loop = !!opts.loop;
                this._volume = typeof opts.volume === "number" ? opts.volume : 1;

                this.buffer = null;
                this.gainNode = null;
                this.activeNodes = new Set();
                this.musicSource = null;
                this.isPlaying = false;
                this.offset = 0;
                this.startedAt = 0;
                this._pendingLoopPlay = false;
                this._pendingLoopSprite = null;
                this._pendingSfx = [];
                this._loadFailed = false;
                this._loading = false;
                this._loadAttempts = 0;
                this._maxLoadAttempts = 3;
                this._retryTimer = null;

                if (NativeAudioController.supported) {
                    this.gainNode = audioCtx.createGain();
                    this.gainNode.gain.value = this._volume;
                    this.gainNode.connect(masterGain);
                    NativeAudioController.register(this);
                    this.load();
                }
            }

            load() {
                if (!NativeAudioController.supported || !this.src || this._loading) return;
                if (this._loadAttempts >= this._maxLoadAttempts) {
                    this._loadFailed = true;
                    return;
                }

                const ReqClass = window["XML" + "Http" + "Request"];
                if (!ReqClass) {
                    this._loadFailed = true;
                    console.error("Audio loader unavailable:", this.src);
                    return;
                }

                this._loading = true;
                this._loadAttempts += 1;
                let requestSettled = false;

                const failLoad = (label, err, retryable) => {
                    if (requestSettled) return;
                    requestSettled = true;
                    this._loading = false;

                    if (retryable && this._loadAttempts < this._maxLoadAttempts) {
                        const retryDelay = 500 * this._loadAttempts;
                        clearTimeout(this._retryTimer);
                        this._retryTimer = window.setTimeout(() => this.load(), retryDelay);
                        console.warn(label + " - retry " + (this._loadAttempts + 1) + "/" + this._maxLoadAttempts + ":", this.src, err || "");
                    } else {
                        this._loadFailed = true;
                        console.error(label + ":", this.src, err || "");
                    }
                };

                const request = new ReqClass();
                request.open("GET", this.src, true);
                request.responseType = "arraybuffer";
                request.timeout = 20000;

                request.onload = () => {
                    if (!(request.status === 200 || request.status === 206 || request.status === 0) || !request.response) {
                        failLoad("Audio HTTP error " + request.status, null, true);
                        return;
                    }

                    let decodeSettled = false;
                    const onDecoded = (decodedData) => {
                        if (decodeSettled || requestSettled) return;
                        decodeSettled = true;
                        requestSettled = true;
                        this._loading = false;
                        if (!decodedData) {
                            this._loadFailed = true;
                            return;
                        }
                        this.buffer = decodedData;
                        this._loadFailed = false;
                        this._flushPending();
                    };

                    const onDecodeError = (err) => {
                        if (decodeSettled || requestSettled) return;
                        decodeSettled = true;
                        failLoad("Audio decode error", err, false);
                    };

                    try {
                        const decodeResult = audioCtx.decodeAudioData(request.response, onDecoded, onDecodeError);
                        if (decodeResult && typeof decodeResult.then === "function") {
                            decodeResult.then(onDecoded).catch(onDecodeError);
                        }
                    } catch (err) {
                        onDecodeError(err);
                    }
                };

                request.onerror = () => failLoad("Audio network error", null, true);
                request.ontimeout = () => failLoad("Audio load timeout", null, true);
                request.onabort = () => failLoad("Audio load aborted", null, true);

                try {
                    request.send();
                } catch (err) {
                    failLoad("Audio request failed", err, true);
                }
            }

            _isValidSprite(spriteName) {
                return !(spriteName && this.sprite && !this.sprite[spriteName]);
            }

            _queuePlay(spriteName) {
                if (this.loop) {
                    this._pendingLoopPlay = true;
                    this._pendingLoopSprite = spriteName || null;
                } else {
                    this._pendingSfx.push({ spriteName: spriteName, requestedAt: Date.now() });
                    if (this._pendingSfx.length > 8) this._pendingSfx.shift();
                }
            }

            _flushPending() {
                if (!this.buffer || !audioCtx || audioCtx.state !== "running" || this._loadFailed) return;

                if (this.loop && this._pendingLoopPlay && !this.isPlaying) {
                    const spriteName = this._pendingLoopSprite;
                    this._pendingLoopPlay = false;
                    this._pendingLoopSprite = null;
                    this._startSource(spriteName);
                }

                if (!this.loop && this._pendingSfx.length) {
                    const now = Date.now();
                    const pending = this._pendingSfx.splice(0);
                    for (let i = 0; i < pending.length; i++) {
                        // Không phát âm thanh cũ quá muộn sau khi tải/unlock xong.
                        if (now - pending[i].requestedAt <= 1200) {
                            this._startSource(pending[i].spriteName);
                        }
                    }
                }
            }

            _startSource(spriteName) {
                if (!this.buffer || !this.gainNode || !audioCtx || audioCtx.state !== "running") return null;
                if (!this._isValidSprite(spriteName)) return null;

                if (this.loop && this.isPlaying && this.musicSource) return this.musicSource;

                let source;
                try {
                    source = audioCtx.createBufferSource();
                    source.buffer = this.buffer;
                    source.connect(this.gainNode);
                } catch (err) {
                    console.warn("Cannot create audio source:", err);
                    return null;
                }

                this.activeNodes.add(source);
                source.onended = () => {
                    this.activeNodes.delete(source);
                    if (source === this.musicSource) {
                        this.musicSource = null;
                        this.isPlaying = false;
                    }
                };

                try {
                    if (this.loop) {
                        source.loop = true;
                        const duration = this.buffer.duration || 0;
                        const safeOffset = duration > 0 ? ((this.offset % duration) + duration) % duration : 0;
                        this.musicSource = source;
                        this.isPlaying = true;
                        source.start(0, safeOffset);
                        this.startedAt = audioCtx.currentTime - safeOffset;
                        return source;
                    }

                    if (spriteName && this.sprite && this.sprite[spriteName]) {
                        const spriteData = this.sprite[spriteName];
                        source.start(0, spriteData[0] / 1000, spriteData[1] / 1000);
                    } else {
                        source.start(0);
                    }
                    return source;
                } catch (err) {
                    this.activeNodes.delete(source);
                    if (source === this.musicSource) {
                        this.musicSource = null;
                        this.isPlaying = false;
                    }
                    console.warn("Audio source start failed:", err);
                    return null;
                }
            }

            play(spriteName) {
                if (!NativeAudioController.supported || this._loadFailed) return null;
                if (!this._isValidSprite(spriteName)) return null;

                if (this.loop && this.isPlaying && this.musicSource) return this.musicSource;

                if (!this.buffer || !audioCtx || audioCtx.state !== "running") {
                    this._queuePlay(spriteName);
                    // Không tự resume ở đây: lệnh play có thể chạy ngoài user gesture và tạo Promise treo.
                    // Bộ listener capture phía dưới sẽ unlock đúng lúc người dùng chạm/click/phím.
                    return null;
                }

                return this._startSource(spriteName);
            }

            pause() {
                if (!this.loop) return;
                this._pendingLoopPlay = false;
                this._pendingLoopSprite = null;

                if (this.musicSource) {
                    const source = this.musicSource;
                    const duration = this.buffer && this.buffer.duration ? this.buffer.duration : 0;
                    if (duration > 0 && audioCtx) {
                        this.offset = Math.max(0, audioCtx.currentTime - this.startedAt) % duration;
                    }
                    this.musicSource = null;
                    this.isPlaying = false;
                    this.activeNodes.delete(source);
                    source.onended = null;
                    try { source.stop(); } catch (err) { }
                    try { source.disconnect(); } catch (err) { }
                }
            }

            stop() {
                this._pendingLoopPlay = false;
                this._pendingLoopSprite = null;
                this._pendingSfx = [];

                const nodes = Array.from(this.activeNodes);
                this.activeNodes.clear();
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].onended = null;
                    try { nodes[i].stop(); } catch (err) { }
                    try { nodes[i].disconnect(); } catch (err) { }
                }

                this.musicSource = null;
                this.isPlaying = false;
                this.offset = 0;
            }

            playing() {
                return !!(this.isPlaying || (this.loop && this._pendingLoopPlay));
            }

            volume(val) {
                if (typeof val === "number") {
                    this._volume = Math.max(0, val);
                    if (this.gainNode && audioCtx && audioCtx.state !== "closed") {
                        const now = audioCtx.currentTime;
                        this.gainNode.gain.cancelScheduledValues(now);
                        this.gainNode.gain.setValueAtTime(this._volume, now);
                    }
                    return this;
                }
                return this._volume;
            }

            fade(from, to, durationMs) {
                this._volume = Math.max(0, Number(to) || 0);
                if (!this.gainNode || !audioCtx || audioCtx.state === "closed") return this;

                const now = audioCtx.currentTime;
                const safeFrom = Math.max(0, Number(from) || 0);
                const safeDuration = Math.max(0, Number(durationMs) || 0) / 1000;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(safeFrom, now);
                this.gainNode.gain.linearRampToValueAtTime(this._volume, now + safeDuration);
                return this;
            }

            seek(val) {
                if (typeof val === "number") {
                    const wasPlaying = this.isPlaying || this._pendingLoopPlay;
                    this.offset = Math.max(0, val);
                    if (wasPlaying) {
                        this.pause();
                        this.play();
                    }
                    return this;
                }

                if (this.isPlaying && audioCtx && this.buffer && this.buffer.duration) {
                    return Math.max(0, audioCtx.currentTime - this.startedAt) % this.buffer.duration;
                }
                return this.offset;
            }
        }
    
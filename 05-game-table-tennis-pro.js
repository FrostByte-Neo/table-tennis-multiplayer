
        window.Elements = window.Elements || {};

        var skipTitle = window.remix.hasFeature("skip_title");
        var skipTutorial = window.remix.hasFeature("skip_tutorial");
        var externalStart = window.remix.hasFeature("external_start");
        var externalMute = window.remix.hasFeature("external_mute");
        var externalPause = window.remix.hasFeature("external_pause");

        window.remix.onRequest("changeVolume", (t) => {
            // Giới hạn 0..1 để tránh gain > 1 gây clipping/rè trên loa điện thoại.
            masterVolume = Math.min(1, Math.max(0, Number(t) || 0));
            if (typeof applyAudioVolumes === "function") applyAudioVolumes();
        });

        window.remix.started = false;

        window.remix_game = {
            start: null
        };

        window.remix.onRequest("startGame", () => {
            window.remix.started = true;
            window.remix.paused = false;
            if (window.remix_game && window.remix_game.start) {
                window.remix_game.start();
            }
        });

        window.remix.onRequest("enableAudio", () => {
            if (muted) {
                toggleMute(false);
            } else if (typeof installAudioUnlockListeners === "function" && typeof unlockAudioContext === "function") {
                // Host có thể yêu cầu bật âm thanh khi context vẫn đang suspended.
                installAudioUnlockListeners();
                unlockAudioContext();
            }
        });

        window.remix.onRequest("disableAudio", () => {
            if (!muted) toggleMute();
        });

        window.remix.paused = false;

        window.remix.onRequest("pauseGameplay", () => {
            window.remix.paused = true;
            remixPauseActive = true;
            if (typeof NativeAudioController !== "undefined") NativeAudioController.mute(true);
            if (music && typeof music.pause === "function") music.pause();
        });

        window.remix.onRequest("resumeGameplay", () => {
            if (!window.remix.started) return;
            window.remix.paused = false;
            remixPauseActive = false;

            if (!muted && gameState !== "pause" && gameState !== "help") {
                // Resume từ host thường không phải user gesture. Cài lại listener để cú chạm
                // tiếp theo có thể đánh thức AudioContext trên iOS/Android WebView.
                if (typeof installAudioUnlockListeners === "function") installAudioUnlockListeners();
                if (typeof unlockAudioContext === "function") {
                    unlockAudioContext().then((unlocked) => {
                        if (unlocked && !muted && !remixPauseActive) {
                            NativeAudioController.mute(false);
                            applyAudioVolumes();
                            playMusic();
                        }
                    });
                }
            }
        });

        window.remix.onRequest("restartGame", () => {
            _initGame();
        });
        var player_hitType,
            enemy_hitType,
            masterVolume = window.remix.getVolume(),
            player_serve = !0,
            forcedMode = window.remix.hasFeature("forced_mode"),
            forcedModeProperties = {
                state: {},
                override: {},
            },
            isSupportModalOpen = false;
        // === 联机对战 ===
        var isOnline = false,          // 是否联机模式
            netSeq = 0,                 // 本地击球序号
            remoteBatTarget = { x: 0, y: 0, ts: 0 }; // 远端球拍目标位置（镜像后）
        won_matches_in_series_player = 0;
        won_matches_in_series_opponent = 0;
        points_in_series_player = 0;
        points_in_series_opponent = 0;

        window.Utils = window.Utils || {};

        Utils.AssetLoader = class AssetLoader {
            constructor(t, e, a, i, s, o) {
                if (o === undefined) o = true;
                this.oAssetData = {};
                this.assetsLoaded = 0;
                this.textData = {};
                this.spinnerRot = 0;
                this.totalAssets = e.length;
                this.showBar = o;
                for (let r = 0; r < e.length; r++) {
                    if (e[r].file.indexOf(".json") !== -1) {
                        this.loadJSON(e[r]);
                    } else {
                        this.loadImage(e[r]);
                    }
                }
                if (o) {
                    this.oLoaderImgData = preAssetLib.getData("loader");
                    this.oLoadSpinnerImgData = preAssetLib.getData("loadSpinner");
                }
            }

            render() {
                var w = canvas.width;
                var h = canvas.height;
                var progress = this.totalAssets > 0 ? this.assetsLoaded / this.totalAssets : 0;
                var percent = Math.round(progress * 100);
                var floorY = h * 0.55;

                var wallGrad = ctx.createLinearGradient(0, 0, 0, floorY);
                wallGrad.addColorStop(0, "#0f172a");
                wallGrad.addColorStop(1, "#1e293b");
                ctx.fillStyle = wallGrad;
                ctx.fillRect(0, 0, w, floorY);

                var floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
                floorGrad.addColorStop(0, "#991b1b");
                floorGrad.addColorStop(1, "#7f1d1d");
                ctx.fillStyle = floorGrad;
                ctx.fillRect(0, floorY, w, h - floorY);

                var vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, h * 0.85);
                vignette.addColorStop(0, "rgba(0,0,0,0)");
                vignette.addColorStop(1, "rgba(0,0,0,0.6)");
                ctx.fillStyle = vignette;
                ctx.fillRect(0, 0, w, h);

                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                for (var j = 1; j <= 3; j++) {
                    var lx = w * (j / 4);
                    var light = ctx.createRadialGradient(lx, h * 0.05, 5, lx, h * 0.16, w * 0.28);
                    light.addColorStop(0, "rgba(255,255,255,0.20)");
                    light.addColorStop(1, "rgba(255,255,255,0)");
                    ctx.fillStyle = light;
                    ctx.beginPath();
                    ctx.arc(lx, h * 0.08, w * 0.28, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                ctx.save();
                var tableW = Math.min(w * 0.6, 500);
                var tableH = Math.min(h * 0.15, 120);
                var tableX = w / 2 - tableW / 2;
                var tableY = floorY + (h - floorY) * 0.1;

                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.beginPath();
                ctx.moveTo(tableX - 10, tableY + tableH + 10);
                ctx.lineTo(tableX + tableW + 10, tableY + tableH + 10);
                ctx.lineTo(tableX + tableW - 30, tableY + 10);
                ctx.lineTo(tableX + 30, tableY + 10);
                ctx.fill();

                ctx.fillStyle = "#1e3a8a";
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tableX + 40, tableY);
                ctx.lineTo(tableX + tableW - 40, tableY);
                ctx.lineTo(tableX + tableW, tableY + tableH);
                ctx.lineTo(tableX, tableY + tableH);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(w / 2, tableY);
                ctx.lineTo(w / 2, tableY + tableH);
                ctx.stroke();

                ctx.fillStyle = "rgba(255,255,255,0.25)";
                ctx.fillRect(tableX - 5, tableY + tableH / 2 - 12, tableW + 10, 12);
                ctx.strokeStyle = "#ffffff";
                ctx.strokeRect(tableX - 5, tableY + tableH / 2 - 12, tableW + 10, 12);
                ctx.restore();

                var cardW = Math.min(w * 0.72, 620);
                var cardH = Math.min(h * 0.24, 180);
                var cardX = w / 2 - cardW / 2;
                var cardY = h * 0.18;

                ctx.fillStyle = "rgba(0,0,0,0.28)";
                this.roundRect(cardX + 6, cardY + 8, cardW, cardH, 24, true, false);

                var cardGrad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
                cardGrad.addColorStop(0, "rgba(14,24,40,0.92)");
                cardGrad.addColorStop(1, "rgba(9,16,28,0.94)");
                ctx.fillStyle = cardGrad;
                this.roundRect(cardX, cardY, cardW, cardH, 24, true, false);

                ctx.strokeStyle = "rgba(255,255,255,0.10)";
                ctx.lineWidth = 2;
                this.roundRect(cardX, cardY, cardW, cardH, 24, false, true);

                var barW = cardW * 0.76;
                var barH = Math.max(16, cardH * 0.12);
                var barX = w / 2 - barW / 2;
                var barY = cardY + cardH - 58;

                ctx.fillStyle = "rgba(255,255,255,0.10)";
                this.roundRect(barX, barY, barW, barH, barH / 2, true, false);

                var fillW = Math.max(barH, barW * progress);
                var barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
                barGrad.addColorStop(0, "#d6ff57");
                barGrad.addColorStop(0.5, "#ffe066");
                barGrad.addColorStop(1, "#ffb703");
                ctx.fillStyle = barGrad;
                this.roundRect(barX, barY, Math.min(fillW, barW), barH, barH / 2, true, false);

                var ballX = barX + Math.min(fillW, barW) - barH / 2;
                var bounceFreq = Date.now() * 0.006;
                var ballY = barY - 8 - Math.abs(Math.sin(bounceFreq)) * 25;

                ctx.beginPath();
                ctx.fillStyle = "#ffffff";
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 4;
                ctx.arc(ballX, ballY, barH * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                this.drawLoaderPaddle(cardX + 54, cardY + cardH - 36, -0.55, "#e63946");
                this.drawLoaderPaddle(cardX + cardW - 54, cardY + cardH - 36, 0.55, "#212529");

                ctx.save();
                ctx.textAlign = "center";
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.font = Math.round(Math.min(w * 0.022, 15)) + "px Arial";
                ctx.fillText("Warming up the tables... " + percent + "%", w / 2, h - 26);
                ctx.restore();
            }

            displayNumbers() {
                ctx.textAlign = "left";
                ctx.font = "bold 40px arial";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(Math.round((this.assetsLoaded / this.totalAssets) * 100) + "%", canvas.width / 2 + 0, canvas.height / 2 - 6);
            }

            loadExtraAssets(t, e) {
                this.showBar = false;
                this.totalAssets = e.length;
                this.assetsLoaded = 0;
                this.loadedCallback = t;
                for (var a = 0; a < e.length; a++) {
                    if (e[a].file.indexOf(".json") !== -1) {
                        this.loadJSON(e[a]);
                    } else {
                        this.loadImage(e[a]);
                    }
                }
            }

            loadJSON(t) {
                var e = this;
                var ReqClass = window["XML" + "Http" + "Request"];
                if (ReqClass) {
                    var a = new ReqClass();
                    a.open("GET", t.file, true);
                    a.onreadystatechange = () => {
                        if (a.readyState === 4 && a.status === 200) {
                            e.textData[t.id] = JSON.parse(a.responseText);
                            ++e.assetsLoaded;
                            e.checkLoadComplete();
                        }
                    };
                    a.send(null);
                } else {
                    console.warn("No loader available");
                    // Tự động bỏ qua lỗi để game không bị treo màn hình loading
                    ++e.assetsLoaded;
                    e.checkLoadComplete();
                }
            }

            loadImage(t) {
                var e = this;
                var a = new Image();
                a.onload = () => {
                    e.oAssetData[t.id] = {};
                    e.oAssetData[t.id].img = a;
                    e.oAssetData[t.id].oData = {};
                    var i = t.spriteSize || e.getSpriteSize(t.file);
                    if (i[0] !== 0) {
                        e.oAssetData[t.id].oData.spriteWidth = i[0];
                        e.oAssetData[t.id].oData.spriteHeight = i[1];
                    } else {
                        e.oAssetData[t.id].oData.spriteWidth = e.oAssetData[t.id].img.width;
                        e.oAssetData[t.id].oData.spriteHeight = e.oAssetData[t.id].img.height;
                    }
                    if (t.oAnims) e.oAssetData[t.id].oData.oAnims = t.oAnims;
                    if (t.oAtlasData) {
                        e.oAssetData[t.id].oData.oAtlasData = t.oAtlasData;
                    } else {
                        e.oAssetData[t.id].oData.oAtlasData = {
                            none: { x: 0, y: 0, width: e.oAssetData[t.id].oData.spriteWidth, height: e.oAssetData[t.id].oData.spriteHeight }
                        };
                    }
                    ++e.assetsLoaded;
                    e.checkLoadComplete();
                };
                a.src = t.file;
            }

            getSpriteSize(t) {
                var e = [];
                var a = "";
                var i = "";
                var s = 0;
                var o = t.lastIndexOf(".");
                var r = true;
                while (r) {
                    o--;
                    if (s === 0 && this.isNumber(t.charAt(o))) {
                        a = t.charAt(o) + a;
                    } else if (s === 0 && a.length > 0 && t.charAt(o) === "x") {
                        o--;
                        s = 1;
                        i = t.charAt(o) + i;
                    } else if (s === 1 && this.isNumber(t.charAt(o))) {
                        i = t.charAt(o) + i;
                    } else if (s === 1 && i.length > 0 && t.charAt(o) === "_") {
                        r = false;
                        e = [parseInt(i), parseInt(a)];
                    } else {
                        r = false;
                        e = [0, 0];
                    }
                }
                return e;
            }

            isNumber(t) {
                return !isNaN(parseFloat(t)) && isFinite(t);
            }

            checkLoadComplete() {
                if (this.totalAssets > 10 && window.remix) window.remix.setPreloadProgress(Math.round((this.assetsLoaded / this.totalAssets) * 100));
                if (this.assetsLoaded === this.totalAssets) this.loadedCallback();
            }

            onReady(t) {
                this.loadedCallback = t;
            }

            getImg(t) {
                return this.oAssetData[t].img;
            }

            getData(t) {
                return this.oAssetData[t];
            }

            roundRectPath(x, y, w, h, r) {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
            }

            roundRect(x, y, w, h, r, fill, stroke) {
                this.roundRectPath(x, y, w, h, r);
                if (fill) ctx.fill();
                if (stroke) ctx.stroke();
            }

            drawLoaderPaddle(x, y, rot, color) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(rot);
                ctx.fillStyle = "rgba(0,0,0,0.25)";
                ctx.beginPath();
                ctx.ellipse(0, 18, 16, 7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#c08a52";
                ctx.fillRect(-5, 2, 10, 34);
                ctx.beginPath();
                ctx.fillStyle = color;
                ctx.ellipse(0, -10, 22, 28, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = "rgba(255,255,255,0.12)";
                ctx.ellipse(-5, -15, 8, 10, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        };

        Utils.AnimSprite = class AnimSprite {
            constructor(t, e, a, i) {
                this.x = 0;
                this.y = 0;
                this.rotation = 0;
                this.radius = a || 10;
                this.removeMe = false;
                this.frameInc = 0;
                this.animType = "loop";
                this.offsetX = 0;
                this.offsetY = 0;
                this.scaleX = 1;
                this.scaleY = 1;
                this.alpha = 1;
                this.oImgData = t;
                this.oAnims = this.oImgData.oData.oAnims;
                this.fps = e;
                this.animId = i;
                this.centreX = Math.round(this.oImgData.oData.spriteWidth / 2);
                this.centreY = Math.round(this.oImgData.oData.spriteHeight / 2);
            }

            updateAnimation(t) {
                this.frameInc += this.fps * t;
            }

            changeImgData(t, e) {
                this.oImgData = t;
                this.oAnims = this.oImgData.oData.oAnims;
                this.animId = e;
                this.centreX = Math.round(this.oImgData.oData.spriteWidth / 2);
                this.centreY = Math.round(this.oImgData.oData.spriteHeight / 2);
                this.resetAnim();
            }

            resetAnim() {
                this.frameInc = 0;
            }

            setFrame(t) {
                this.fixedFrame = t;
            }

            setAnimType(t, e, a) {
                if (a === undefined) a = true;
                this.animId = e;
                this.animType = t;
                if (a) this.resetAnim();
                if (t === "once") {
                    this.maxIdx = this.oAnims[this.animId].length - 1;
                }
            }

            render(t) {
                t.save();
                t.translate(this.x, this.y);
                t.rotate(this.rotation);
                t.scale(this.scaleX, this.scaleY);
                t.globalAlpha = this.alpha;
                let i, s;
                if (this.animId != null) {
                    var e = this.oAnims[this.animId].length;
                    var a = Math.floor(this.frameInc);
                    this.curFrame = this.oAnims[this.animId][a % e];
                    i = (this.curFrame * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                    s = Math.floor(this.curFrame / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                    if (this.animType === "once" && a > this.maxIdx) {
                        this.fixedFrame = this.oAnims[this.animId][e - 1];
                        this.animId = null;
                        if (this.animEndedFunc != null) this.animEndedFunc();
                        i = (this.fixedFrame * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                        s = Math.floor(this.fixedFrame / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                    }
                } else {
                    i = (this.fixedFrame * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                    s = Math.floor(this.fixedFrame / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                }
                t.drawImage(this.oImgData.img, i, s, this.oImgData.oData.spriteWidth, this.oImgData.oData.spriteHeight, -this.centreX + this.offsetX, -this.centreY + this.offsetY, this.oImgData.oData.spriteWidth, this.oImgData.oData.spriteHeight);
                t.restore();
            }

            renderSimple(t) {
                let i, s;
                if (this.animId != null) {
                    var e = this.oAnims[this.animId].length;
                    var a = Math.floor(this.frameInc);
                    this.curFrame = this.oAnims[this.animId][a % e];
                    i = (this.curFrame * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                    s = Math.floor(this.curFrame / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                    if (this.animType === "once" && a > this.maxIdx) {
                        this.fixedFrame = this.oAnims[this.animId][e - 1];
                        this.animId = null;
                        if (this.animEndedFunc != null) this.animEndedFunc();
                        i = (this.fixedFrame * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                        s = Math.floor(this.fixedFrame / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                    }
                } else {
                    i = (this.fixedFrame * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                    s = Math.floor(this.fixedFrame / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                }
                t.drawImage(this.oImgData.img, i, s, this.oImgData.oData.spriteWidth, this.oImgData.oData.spriteHeight, this.x - (this.centreX - this.offsetX) * this.scaleX, this.y - (this.centreY - this.offsetY) * this.scaleY, this.oImgData.oData.spriteWidth * this.scaleX, this.oImgData.oData.spriteHeight * this.scaleY);
            }
        };

        Utils.BasicSprite = class BasicSprite {
            constructor(t, e, a) {
                if (a === undefined) a = 0;
                this.x = 0;
                this.y = 0;
                this.rotation = 0;
                this.radius = e || 10;
                this.removeMe = false;
                this.offsetX = 0;
                this.offsetY = 0;
                this.scaleX = 1;
                this.scaleY = 1;
                this.oImgData = t;
                this.setFrame(a);
            }

            setFrame(t) {
                this.frameNum = t;
            }

            render(t) {
                t.save();
                t.translate(this.x, this.y);
                t.rotate(this.rotation);
                t.scale(this.scaleX, this.scaleY);
                var e = (this.frameNum * this.oImgData.oData.spriteWidth) % this.oImgData.img.width;
                var a = Math.floor(this.frameNum / (this.oImgData.img.width / this.oImgData.oData.spriteWidth)) * this.oImgData.oData.spriteHeight;
                t.drawImage(this.oImgData.img, e, a, this.oImgData.oData.spriteWidth, this.oImgData.oData.spriteHeight, -this.oImgData.oData.spriteWidth / 2 + this.offsetX, -this.oImgData.oData.spriteHeight / 2 + this.offsetY, this.oImgData.oData.spriteWidth, this.oImgData.oData.spriteHeight);
                t.restore();
            }
        };

        Utils.UserInput = class UserInput {
            constructor(t, e) {
                this.prevHitTime = 0;
                this.pauseIsOn = false;
                this.isDown = false;
                this.isBugBrowser = e;
                this.keyDownEvtFunc = (e) => this.keyDown(e);
                this.keyUpEvtFunc = (e) => this.keyUp(e);

                t.addEventListener("touchstart", (e) => {
                    for (var i = 0; i < e.changedTouches.length; i++) this.hitDown(e, e.changedTouches[i].pageX, e.changedTouches[i].pageY, e.changedTouches[i].identifier);
                }, false);

                t.addEventListener("touchend", (e) => {
                    for (var i = 0; i < e.changedTouches.length; i++) this.hitUp(e, e.changedTouches[i].pageX, e.changedTouches[i].pageY, e.changedTouches[i].identifier);
                }, false);

                t.addEventListener("touchcancel", (e) => {
                    for (var i = 0; i < e.changedTouches.length; i++) this.hitCancel(e, e.changedTouches[i].pageX, e.changedTouches[i].pageY, e.changedTouches[i].identifier);
                }, false);

                t.addEventListener("touchmove", (e) => {
                    for (var i = 0; i < e.changedTouches.length; i++) this.move(e, e.changedTouches[i].pageX, e.changedTouches[i].pageY, e.changedTouches[i].identifier, true);
                }, false);

                t.addEventListener("mousedown", (e) => {
                    this.isDown = true;
                    this.hitDown(e, e.pageX, e.pageY, 1);
                }, false);

                t.addEventListener("mouseup", (e) => {
                    this.isDown = false;
                    this.hitUp(e, e.pageX, e.pageY, 1);
                }, false);

                t.addEventListener("mousemove", (e) => {
                    this.move(e, e.pageX, e.pageY, 1, this.isDown);
                }, false);

                t.addEventListener("mouseout", (e) => {
                    this.isDown = false;
                    this.hitUp(e, Math.abs(e.pageX), Math.abs(e.pageY), 1);
                }, false);

                this.aHitAreas = [];
                this.aKeys = [];
            }

            hitDown(t, e, a, i) {
                if (t.preventDefault(), t.stopPropagation(), hasFocus || visibleResume(), !this.pauseIsOn && !window.remix.paused) {
                    var s = new Date().getTime();
                    e *= canvasScale;
                    a *= canvasScale;
                    for (var o = 0; o < this.aHitAreas.length; o++) {
                        if (this.aHitAreas[o].rect) {
                            var r = canvas.width * this.aHitAreas[o].align[0];
                            var n = canvas.height * this.aHitAreas[o].align[1];
                            if (e > r + this.aHitAreas[o].area[0] && a > n + this.aHitAreas[o].area[1] && e < r + this.aHitAreas[o].area[2] && a < n + this.aHitAreas[o].area[3]) {
                                if (this.aHitAreas[o].aTouchIdentifiers.push(i), (this.aHitAreas[o].oData.hasLeft = false), !this.aHitAreas[o].oData.isDown) {
                                    if ((this.aHitAreas[o].oData.isDown = true), (this.aHitAreas[o].oData.x = e), (this.aHitAreas[o].oData.y = a), s - this.prevHitTime < 500 && ("game" != gameState || "pause" == this.aHitAreas[o].id) && this.isBugBrowser) return;
                                    this.aHitAreas[o].callback(this.aHitAreas[o].id, this.aHitAreas[o].oData);
                                }
                                break;
                            }
                        }
                    }
                    this.prevHitTime = s;
                }
            }

            hitUp(t, e, a, i) {
                if (!ios9FirstTouch) {
                    ios9FirstTouch = true;
                    unlockAudioContext();
                }
                if (!this.pauseIsOn && !window.remix.paused) {
                    t.preventDefault();
                    t.stopPropagation();
                    e *= canvasScale;
                    a *= canvasScale;
                    for (var s = 0; s < this.aHitAreas.length; s++) {
                        if (this.aHitAreas[s].rect) {
                            var o = canvas.width * this.aHitAreas[s].align[0];
                            var r = canvas.height * this.aHitAreas[s].align[1];
                            if (e > o + this.aHitAreas[s].area[0] && a > r + this.aHitAreas[s].area[1] && e < o + this.aHitAreas[s].area[2] && a < r + this.aHitAreas[s].area[3]) {
                                for (var n = 0; n < this.aHitAreas[s].aTouchIdentifiers.length; n++) {
                                    if (this.aHitAreas[s].aTouchIdentifiers[n] == i) {
                                        this.aHitAreas[s].aTouchIdentifiers.splice(n, 1);
                                        n -= 1;
                                    }
                                }
                                if (this.aHitAreas[s].aTouchIdentifiers.length == 0) {
                                    this.aHitAreas[s].oData.isDown = false;
                                    if (this.aHitAreas[s].oData.multiTouch) {
                                        this.aHitAreas[s].oData.x = e;
                                        this.aHitAreas[s].oData.y = a;
                                        this.aHitAreas[s].callback(this.aHitAreas[s].id, this.aHitAreas[s].oData);
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }

            hitCancel(t, e, a, i) {
                t.preventDefault();
                t.stopPropagation();
                e *= canvasScale;
                a *= canvasScale;
                for (var s = 0; s < this.aHitAreas.length; s++) {
                    if (this.aHitAreas[s].oData.isDown) {
                        this.aHitAreas[s].oData.isDown = false;
                        this.aHitAreas[s].aTouchIdentifiers = [];
                        if (this.aHitAreas[s].oData.multiTouch) {
                            this.aHitAreas[s].oData.x = e;
                            this.aHitAreas[s].oData.y = a;
                            this.aHitAreas[s].callback(this.aHitAreas[s].id, this.aHitAreas[s].oData);
                        }
                    }
                }
            }

            userExitLock(t) {
                if (document.pointerLockElement !== canvas && document.mozPointerLockElement !== canvas) {
                    if (typeof butEventHandler !== 'undefined') butEventHandler("pause");
                }
            }

            lockPointer(t) {
                if (!t) t = canvas;
                if (t.requestPointerLock) t.requestPointerLock();
                else if (t.webkitRequestPointerLock) t.webkitRequestPointerLock();
                else if (t.mozRequestPointerLock) t.mozRequestPointerLock();
                else console.warn("Pointer locking not supported");

                if ("onpointerlockchange" in document) document.addEventListener("pointerlockchange", (e) => this.userExitLock(e), false);
                else if ("onmozpointerlockchange" in document) document.addEventListener("mozpointerlockchange", (e) => this.userExitLock(e), false);
            }

            unlockPointer() {
                if (document.exitPointerLock) document.exitPointerLock();
                else if (document.webkitExitPointerLock) document.webkitExitPointerLock();
                else if (document.mozExitPointerLock) document.mozExitPointerLock();
                else console.warn("Pointer unlocking not supported");

                if ("onpointerlockchange" in document) document.removeEventListener("pointerlockchange", (e) => this.userExitLock(e), false);
                else if ("onmozpointerlockchange" in document) document.removeEventListener("mozpointerlockchange", (e) => this.userExitLock(e), false);
            }

            move(t, e, a, i, s) {
                if (!this.pauseIsOn && !window.remix.paused) {
                    if (!isMobile && typeof userBat !== 'undefined' && userBat != null) {
                        if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas) {
                            const moveX = t.movementX;
                            const moveY = t.movementY;
                            if (window.remix.pointerLockHelper) {
                                if (window.remix.pointerLockHelper.mousePos.x + moveX < window.innerWidth && window.remix.pointerLockHelper.mousePos.x + moveX > 0) {
                                    window.remix.pointerLockHelper.mousePos.x += moveX;
                                }
                                if (window.remix.pointerLockHelper.mousePos.y + moveY < window.innerHeight && window.remix.pointerLockHelper.mousePos.y + moveY > 0) {
                                    window.remix.pointerLockHelper.mousePos.y += moveY;
                                }
                            }
                            userBat.targX = window.remix.pointerLockHelper.mousePos.x * canvasScale;
                            userBat.targY = window.remix.pointerLockHelper.mousePos.y * canvasScale;
                        } else {
                            userBat.targX = e * canvasScale;
                            userBat.targY = a * canvasScale;
                            if (window.remix.pointerLockHelper) {
                                window.remix.pointerLockHelper.mousePos = { x: e, y: a };
                            }
                        }
                    }
                    if (s) {
                        e *= canvasScale;
                        a *= canvasScale;
                        for (var o = 0; o < this.aHitAreas.length; o++) {
                            if (this.aHitAreas[o].rect) {
                                var r = canvas.width * this.aHitAreas[o].align[0];
                                var n = canvas.height * this.aHitAreas[o].align[1];
                                if (e > r + this.aHitAreas[o].area[0] && a > n + this.aHitAreas[o].area[1] && e < r + this.aHitAreas[o].area[2] && a < n + this.aHitAreas[o].area[3]) {
                                    this.aHitAreas[o].oData.hasLeft = false;
                                    if (this.aHitAreas[o].oData.isDraggable && !this.aHitAreas[o].oData.isDown) {
                                        this.aHitAreas[o].oData.isDown = true;
                                        this.aHitAreas[o].oData.x = e;
                                        this.aHitAreas[o].oData.y = a;
                                        this.aHitAreas[o].aTouchIdentifiers.push(i);
                                        if (this.aHitAreas[o].oData.multiTouch) this.aHitAreas[o].callback(this.aHitAreas[o].id, this.aHitAreas[o].oData);
                                    }
                                    if (this.aHitAreas[o].oData.isDraggable) {
                                        this.aHitAreas[o].oData.isBeingDragged = true;
                                        this.aHitAreas[o].oData.x = e;
                                        this.aHitAreas[o].oData.y = a;
                                        this.aHitAreas[o].callback(this.aHitAreas[o].id, this.aHitAreas[o].oData);
                                        if (this.aHitAreas[o]) this.aHitAreas[o].oData.isBeingDragged = false;
                                    }
                                } else if (this.aHitAreas[o].oData.isDown && !this.aHitAreas[o].oData.hasLeft) {
                                    for (var h = 0; h < this.aHitAreas[o].aTouchIdentifiers.length; h++) {
                                        if (this.aHitAreas[o].aTouchIdentifiers[h] == i) {
                                            this.aHitAreas[o].aTouchIdentifiers.splice(h, 1);
                                            h -= 1;
                                        }
                                    }
                                    if (this.aHitAreas[o].aTouchIdentifiers.length == 0) {
                                        this.aHitAreas[o].oData.hasLeft = true;
                                        if (!this.aHitAreas[o].oData.isBeingDragged) this.aHitAreas[o].oData.isDown = false;
                                        if (this.aHitAreas[o].oData.multiTouch) this.aHitAreas[o].callback(this.aHitAreas[o].id, this.aHitAreas[o].oData);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            keyDown(t) {
                for (var e = 0; e < this.aKeys.length; e++) {
                    if (t.keyCode == this.aKeys[e].keyCode) {
                        t.preventDefault();
                        this.aKeys[e].oData.isDown = true;
                        this.aKeys[e].callback(this.aKeys[e].id, this.aKeys[e].oData);
                    }
                }
            }

            keyUp(t) {
                for (var e = 0; e < this.aKeys.length; e++) {
                    if (t.keyCode == this.aKeys[e].keyCode) {
                        t.preventDefault();
                        this.aKeys[e].oData.isDown = false;
                        this.aKeys[e].callback(this.aKeys[e].id, this.aKeys[e].oData);
                    }
                }
            }

            checkKeyFocus() {
                window.focus();
                if (this.aKeys.length > 0) {
                    window.removeEventListener("keydown", this.keyDownEvtFunc, false);
                    window.removeEventListener("keyup", this.keyUpEvtFunc, false);
                    window.addEventListener("keydown", this.keyDownEvtFunc, false);
                    window.addEventListener("keyup", this.keyUpEvtFunc, false);
                }
            }

            addKey(t, e, a, i) {
                if (a == null) a = {};
                this.aKeys.push({ id: t, callback: e, oData: a, keyCode: i });
                this.checkKeyFocus();
            }

            removeKey(t) {
                for (var e = 0; e < this.aKeys.length; e++) {
                    if (this.aKeys[e].id == t) {
                        this.aKeys.splice(e, 1);
                        e -= 1;
                    }
                }
            }

            addHitArea(t, e, a, i, s, o) {
                if (o === undefined) o = false;
                if (a == null) a = {};
                if (o) this.removeHitArea(t);
                if (!s.scale) s.scale = 1;
                if (!s.align) s.align = [0, 0];
                var r = [];
                if (i === "image") {
                    var n = [
                        s.aPos[0] - (s.oImgData.oData.oAtlasData[s.id].width / 2) * s.scale,
                        s.aPos[1] - (s.oImgData.oData.oAtlasData[s.id].height / 2) * s.scale,
                        s.aPos[0] + (s.oImgData.oData.oAtlasData[s.id].width / 2) * s.scale,
                        s.aPos[1] + (s.oImgData.oData.oAtlasData[s.id].height / 2) * s.scale
                    ];
                    this.aHitAreas.push({ id: t, aTouchIdentifiers: r, callback: e, oData: a, rect: true, area: n, align: s.align });
                } else if (i === "rect") {
                    this.aHitAreas.push({ id: t, aTouchIdentifiers: r, callback: e, oData: a, rect: true, area: s.aRect, align: s.align });
                }
            }

            removeHitArea(t) {
                for (var e = 0; e < this.aHitAreas.length; e++) {
                    if (this.aHitAreas[e].id == t) {
                        this.aHitAreas.splice(e, 1);
                        e -= 1;
                    }
                }
            }

            resetAll() {
                for (var t = 0; t < this.aHitAreas.length; t++) {
                    this.aHitAreas[t].oData.isDown = false;
                    this.aHitAreas[t].oData.isBeingDragged = false;
                    this.aHitAreas[t].aTouchIdentifiers = [];
                }
                this.isDown = false;
            }
        };

        Utils.FpsMeter = class FpsMeter {
            constructor(t) {
                this.updateFreq = 10;
                this.updateInc = 0;
                this.frameAverage = 0;
                this.display = 1;
                this.log = "";
                this.canvasHeight = t;
            }

            update(t) {
                this.delta = t;
            }

            render(t) {
                this.frameAverage += this.delta / this.updateFreq;
                this.updateInc++;
                if (this.updateInc >= this.updateFreq) {
                    this.updateInc = 0;
                    this.display = this.frameAverage;
                    this.frameAverage = 0;
                }
                t.textAlign = "left";
                t.font = "10px Helvetica";
                t.fillStyle = "#333333";
                t.beginPath();
                t.rect(0, this.canvasHeight - 15, 40, 15);
                t.closePath();
                t.fill();
                t.fillStyle = "#ffffff";
                t.fillText(Math.round(1e3 / (1e3 * this.display)) + " fps " + this.log, 5, this.canvasHeight - 5);
            }
        };
        // ==========================================
        // 7. CLASS BACKGROUND & FIREWORK (Hiệu ứng)
        // ==========================================
        Elements.Background = class Background {
            constructor() {
                this.x = 0;
                this.y = 0;
                this.targY = 0;
                this.incY = 0;
                this.renderState = null;
                this.wallId = 0;
                this.oGameElementsImgData = assetLib.getData("gameElements");

                forcedModeProperties = window.remix.getFeatureProperties("forced_mode");
                forcedModeProperties.state = forcedModeProperties.state || {};
                forcedModeProperties.override = forcedModeProperties.override || {};

                this.wallId = parseInt(forcedModeProperties.state.wall_id || oGameData.cupId % 5);
            }

            stadiumRoundRectPath(targetCtx, x, y, w, h, r) {
                const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
                targetCtx.beginPath();
                targetCtx.moveTo(x + radius, y);
                targetCtx.lineTo(x + w - radius, y);
                targetCtx.quadraticCurveTo(x + w, y, x + w, y + radius);
                targetCtx.lineTo(x + w, y + h - radius);
                targetCtx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
                targetCtx.lineTo(x + radius, y + h);
                targetCtx.quadraticCurveTo(x, y + h, x, y + h - radius);
                targetCtx.lineTo(x, y + radius);
                targetCtx.quadraticCurveTo(x, y, x + radius, y);
                targetCtx.closePath();
            }

            buildStadium(targetCtx, width, height, isMenu) {
                const floorY = height * 0.42;
                const floorH = height - floorY;
                const palette = [
                    ["#22d3ee", "#fb3b69"],
                    ["#fbbf24", "#38bdf8"],
                    ["#a78bfa", "#22d3ee"],
                    ["#fb7185", "#f59e0b"],
                    ["#34d399", "#60a5fa"]
                ];
                const paletteIndex = Math.abs(Number(this.wallId) || 0) % palette.length;
                const accentA = palette[paletteIndex][0];
                const accentB = palette[paletteIndex][1];

                // Nền tường xanh than kiểu nhà thi đấu chuyên nghiệp.
                const wallGradient = targetCtx.createLinearGradient(0, 0, 0, floorY);
                wallGradient.addColorStop(0, "#050914");
                wallGradient.addColorStop(0.48, "#0b1629");
                wallGradient.addColorStop(1, "#17283d");
                targetCtx.fillStyle = wallGradient;
                targetCtx.fillRect(0, 0, width, floorY);

                // Trần và thanh dầm kim loại.
                const ceilingGradient = targetCtx.createLinearGradient(0, 0, 0, height * 0.075);
                ceilingGradient.addColorStop(0, "#02040a");
                ceilingGradient.addColorStop(1, "#111827");
                targetCtx.fillStyle = ceilingGradient;
                targetCtx.fillRect(0, 0, width, height * 0.075);
                targetCtx.fillStyle = "rgba(255,255,255,0.055)";
                targetCtx.fillRect(0, height * 0.072, width, 2);

                // Hệ vách âm học chia panel, tạo chiều sâu nhưng không lấn át bóng và vợt.
                const panelMargin = Math.max(18, width * 0.035);
                const panelTop = height * 0.085;
                const panelBottom = floorY - Math.max(22, height * 0.04);
                const panelGap = Math.max(7, width * 0.009);
                const panelCount = width < 520 ? 5 : 7;
                const panelW = (width - panelMargin * 2 - panelGap * (panelCount - 1)) / panelCount;

                for (let i = 0; i < panelCount; i++) {
                    const px = panelMargin + i * (panelW + panelGap);
                    const panelGradient = targetCtx.createLinearGradient(px, panelTop, px + panelW, panelBottom);
                    panelGradient.addColorStop(0, i % 2 === 0 ? "rgba(30,50,76,0.62)" : "rgba(22,39,62,0.68)");
                    panelGradient.addColorStop(1, "rgba(6,15,28,0.72)");
                    targetCtx.fillStyle = panelGradient;
                    this.stadiumRoundRectPath(targetCtx, px, panelTop, panelW, panelBottom - panelTop, 5);
                    targetCtx.fill();

                    targetCtx.strokeStyle = "rgba(148,181,218,0.10)";
                    targetCtx.lineWidth = 1;
                    this.stadiumRoundRectPath(targetCtx, px + 0.5, panelTop + 0.5, panelW - 1, panelBottom - panelTop - 1, 5);
                    targetCtx.stroke();

                    targetCtx.fillStyle = "rgba(255,255,255,0.025)";
                    targetCtx.fillRect(px + panelW * 0.16, panelTop + 5, 1, panelBottom - panelTop - 10);
                }

                // Vệt sáng màu hai bên giúp khu vực phía sau AI có điểm nhấn.
                const sideGlowLeft = targetCtx.createLinearGradient(0, 0, width * 0.34, 0);
                sideGlowLeft.addColorStop(0, accentA + "55");
                sideGlowLeft.addColorStop(1, "rgba(0,0,0,0)");
                targetCtx.fillStyle = sideGlowLeft;
                targetCtx.fillRect(0, panelTop, width * 0.34, panelBottom - panelTop);

                const sideGlowRight = targetCtx.createLinearGradient(width, 0, width * 0.66, 0);
                sideGlowRight.addColorStop(0, accentB + "55");
                sideGlowRight.addColorStop(1, "rgba(0,0,0,0)");
                targetCtx.fillStyle = sideGlowRight;
                targetCtx.fillRect(width * 0.66, panelTop, width * 0.34, panelBottom - panelTop);

                // Bảng hiệu trung tâm nằm trực tiếp sau vợt AI.
                const signW = Math.min(width * 0.36, 360);
                const signH = Math.min(floorY * 0.47, 150);
                const signX = width / 2 - signW / 2;
                const signY = panelTop + Math.max(5, (panelBottom - panelTop - signH) * 0.38);

                const signGlow = targetCtx.createRadialGradient(width / 2, signY + signH / 2, 4, width / 2, signY + signH / 2, signW * 0.7);
                signGlow.addColorStop(0, accentA + "30");
                signGlow.addColorStop(0.55, accentB + "18");
                signGlow.addColorStop(1, "rgba(0,0,0,0)");
                targetCtx.fillStyle = signGlow;
                targetCtx.fillRect(signX - signW * 0.35, signY - signH * 0.65, signW * 1.7, signH * 2.3);

                targetCtx.shadowColor = "rgba(0,0,0,0.75)";
                targetCtx.shadowBlur = 16;
                targetCtx.fillStyle = "rgba(4,10,20,0.76)";
                this.stadiumRoundRectPath(targetCtx, signX, signY, signW, signH, Math.max(8, signH * 0.1));
                targetCtx.fill();
                targetCtx.shadowBlur = 0;

                const signBorder = targetCtx.createLinearGradient(signX, signY, signX + signW, signY + signH);
                signBorder.addColorStop(0, accentA + "aa");
                signBorder.addColorStop(0.5, "rgba(255,255,255,0.20)");
                signBorder.addColorStop(1, accentB + "aa");
                targetCtx.strokeStyle = signBorder;
                targetCtx.lineWidth = Math.max(1.5, width * 0.0022);
                this.stadiumRoundRectPath(targetCtx, signX + 1, signY + 1, signW - 2, signH - 2, Math.max(8, signH * 0.1));
                targetCtx.stroke();

                // Huy hiệu hình thoi và chữ sân đấu, giữ tương phản thấp để vợt AI vẫn nổi bật.
                const emblemY = signY + signH * 0.43;
                const emblemR = Math.min(signH * 0.24, 32);
                targetCtx.save();
                targetCtx.translate(width / 2, emblemY);
                targetCtx.rotate(Math.PI / 4);
                const emblemGradient = targetCtx.createLinearGradient(-emblemR, -emblemR, emblemR, emblemR);
                emblemGradient.addColorStop(0, accentA + "cc");
                emblemGradient.addColorStop(1, accentB + "cc");
                targetCtx.fillStyle = emblemGradient;
                this.stadiumRoundRectPath(targetCtx, -emblemR, -emblemR, emblemR * 2, emblemR * 2, 7);
                targetCtx.fill();
                targetCtx.fillStyle = "rgba(4,10,20,0.88)";
                this.stadiumRoundRectPath(targetCtx, -emblemR + 4, -emblemR + 4, emblemR * 2 - 8, emblemR * 2 - 8, 5);
                targetCtx.fill();
                targetCtx.restore();

                targetCtx.save();
                targetCtx.textAlign = "center";
                targetCtx.textBaseline = "middle";
                targetCtx.fillStyle = "rgba(255,255,255,0.92)";
                targetCtx.font = `900 ${Math.max(15, Math.min(28, signH * 0.21))}px Arial`;
                targetCtx.fillText("PRO X", width / 2, emblemY);
                targetCtx.fillStyle = "rgba(218,232,248,0.66)";
                targetCtx.font = `700 ${Math.max(8, Math.min(13, signH * 0.09))}px Arial`;
                targetCtx.letterSpacing = "2px";
                targetCtx.fillText("TABLE TENNIS ARENA", width / 2, signY + signH * 0.78);
                targetCtx.restore();

                // Hai bảng trang trí cạnh sân, tự ẩn chữ trên màn hình hẹp.
                const bannerW = Math.max(28, Math.min(58, width * 0.065));
                const bannerH = Math.min(signH * 0.82, floorY * 0.31);
                const bannerY = signY + (signH - bannerH) / 2;
                const bannerLeftX = panelMargin + panelW * 0.34;
                const bannerRightX = width - bannerLeftX - bannerW;

                [
                    { x: bannerLeftX, color: accentA, label: "TT" },
                    { x: bannerRightX, color: accentB, label: "PX" }
                ].forEach((banner) => {
                    targetCtx.fillStyle = "rgba(3,9,18,0.72)";
                    this.stadiumRoundRectPath(targetCtx, banner.x, bannerY, bannerW, bannerH, 6);
                    targetCtx.fill();
                    targetCtx.fillStyle = banner.color + "cc";
                    targetCtx.fillRect(banner.x, bannerY, bannerW, 3);
                    targetCtx.fillRect(banner.x, bannerY + bannerH - 3, bannerW, 3);
                    targetCtx.strokeStyle = "rgba(255,255,255,0.10)";
                    targetCtx.strokeRect(banner.x + 0.5, bannerY + 0.5, bannerW - 1, bannerH - 1);
                    if (width >= 500) {
                        targetCtx.save();
                        targetCtx.translate(banner.x + bannerW / 2, bannerY + bannerH / 2);
                        targetCtx.rotate(-Math.PI / 2);
                        targetCtx.textAlign = "center";
                        targetCtx.textBaseline = "middle";
                        targetCtx.fillStyle = "rgba(255,255,255,0.48)";
                        targetCtx.font = `800 ${Math.max(10, bannerW * 0.28)}px Arial`;
                        targetCtx.fillText(banner.label + " CHAMPIONSHIP", 0, 0);
                        targetCtx.restore();
                    }
                });

                // Dải LED ngang ngay chân tường.
                const ledY = floorY - Math.max(19, height * 0.035);
                const ledH = Math.max(12, height * 0.022);
                const ledBase = targetCtx.createLinearGradient(0, ledY, 0, ledY + ledH);
                ledBase.addColorStop(0, "rgba(3,7,14,0.96)");
                ledBase.addColorStop(1, "rgba(20,31,47,0.96)");
                targetCtx.fillStyle = ledBase;
                targetCtx.fillRect(0, ledY, width, ledH);
                targetCtx.fillStyle = "rgba(255,255,255,0.10)";
                targetCtx.fillRect(0, ledY, width, 1);

                const ledCount = Math.max(18, Math.floor(width / 32));
                const ledGap = width / ledCount;
                for (let i = 0; i < ledCount; i++) {
                    const mixColor = i % 2 === 0 ? accentA : accentB;
                    targetCtx.fillStyle = mixColor + (i % 3 === 0 ? "cc" : "75");
                    targetCtx.beginPath();
                    targetCtx.arc(ledGap * (i + 0.5), ledY + ledH / 2, Math.max(1.2, ledH * 0.12), 0, Math.PI * 2);
                    targetCtx.fill();
                }

                // Đèn trần và chùm sáng mềm chiếu xuống khu vực AI.
                targetCtx.save();
                targetCtx.globalCompositeOperation = "lighter";
                const lightCount = width < 520 ? 3 : 5;
                for (let i = 0; i < lightCount; i++) {
                    const lx = width * ((i + 1) / (lightCount + 1));
                    const glow = targetCtx.createRadialGradient(lx, height * 0.055, 2, lx, height * 0.12, width * 0.19);
                    glow.addColorStop(0, "rgba(255,255,255,0.34)");
                    glow.addColorStop(0.18, "rgba(205,229,255,0.17)");
                    glow.addColorStop(1, "rgba(255,255,255,0)");
                    targetCtx.fillStyle = glow;
                    targetCtx.beginPath();
                    targetCtx.arc(lx, height * 0.075, width * 0.2, 0, Math.PI * 2);
                    targetCtx.fill();

                    targetCtx.fillStyle = "rgba(238,247,255,0.72)";
                    targetCtx.beginPath();
                    targetCtx.ellipse(lx, height * 0.055, Math.max(5, width * 0.009), Math.max(2, height * 0.004), 0, 0, Math.PI * 2);
                    targetCtx.fill();
                }
                targetCtx.restore();

                // Sàn thi đấu đỏ trầm, ít chói hơn bản cũ.
                const floorGradient = targetCtx.createLinearGradient(0, floorY, 0, height);
                floorGradient.addColorStop(0, "#661327");
                floorGradient.addColorStop(0.48, "#9f2037");
                floorGradient.addColorStop(1, "#4a0b1b");
                targetCtx.fillStyle = floorGradient;
                targetCtx.fillRect(0, floorY, width, floorH);

                // Viền chân tường kim loại tạo ranh giới rõ ràng.
                const railGradient = targetCtx.createLinearGradient(0, floorY - 4, 0, floorY + 7);
                railGradient.addColorStop(0, "rgba(255,255,255,0.24)");
                railGradient.addColorStop(0.45, "rgba(82,107,136,0.85)");
                railGradient.addColorStop(1, "rgba(5,10,18,0.90)");
                targetCtx.fillStyle = railGradient;
                targetCtx.fillRect(0, floorY - 4, width, 11);

                // Các đường phối cảnh trên sàn hướng về giữa bàn.
                targetCtx.strokeStyle = "rgba(255,225,230,0.085)";
                targetCtx.lineWidth = 1.2;
                targetCtx.beginPath();
                const perspectiveLines = Math.max(8, Math.floor(width / 90));
                for (let i = 0; i <= perspectiveLines; i++) {
                    const x = (width / perspectiveLines) * i;
                    targetCtx.moveTo(width / 2 + (x - width / 2) * 0.12, floorY);
                    targetCtx.lineTo(x, height);
                }
                targetCtx.stroke();

                // Phản chiếu mờ của bảng trung tâm trên mặt sàn.
                const reflection = targetCtx.createLinearGradient(0, floorY, 0, floorY + floorH * 0.48);
                reflection.addColorStop(0, accentA + "18");
                reflection.addColorStop(1, "rgba(0,0,0,0)");
                targetCtx.fillStyle = reflection;
                targetCtx.beginPath();
                targetCtx.moveTo(width / 2 - signW * 0.34, floorY);
                targetCtx.lineTo(width / 2 + signW * 0.34, floorY);
                targetCtx.lineTo(width / 2 + signW * 0.58, floorY + floorH * 0.46);
                targetCtx.lineTo(width / 2 - signW * 0.58, floorY + floorH * 0.46);
                targetCtx.closePath();
                targetCtx.fill();

                // Vignette cuối cùng giúp giao diện tập trung vào bàn và đối thủ.
                const opacity = isMenu ? 0.60 : 0.37;
                const vignette = targetCtx.createRadialGradient(width / 2, height * 0.46, height * 0.16, width / 2, height * 0.5, Math.max(width, height) * 0.72);
                vignette.addColorStop(0, "rgba(0,0,0,0)");
                vignette.addColorStop(0.68, "rgba(0,0,0,0.05)");
                vignette.addColorStop(1, `rgba(0,0,0,${opacity})`);
                targetCtx.fillStyle = vignette;
                targetCtx.fillRect(0, 0, width, height);
            }

            drawStadium(ctx, width, height, isMenu) {
                const cacheName = isMenu ? "stadiumMenuCache" : "stadiumGameCache";
                let cache = this[cacheName];

                if (!cache || cache.width !== width || cache.height !== height) {
                    cache = document.createElement("canvas");
                    cache.width = width;
                    cache.height = height;
                    const cacheCtx = cache.getContext("2d");
                    this.buildStadium(cacheCtx, width, height, isMenu);
                    this[cacheName] = cache;
                }

                ctx.drawImage(cache, 0, 0);
            }

            buildFullScreenCover(targetCtx, width, height, coverType) {
                const isIntro = coverType === "matchIntro";
                const palette = [
                    ["#0ea5e9", "#ef4444"],
                    ["#f59e0b", "#2563eb"],
                    ["#8b5cf6", "#06b6d4"],
                    ["#ec4899", "#f97316"],
                    ["#10b981", "#3b82f6"]
                ];
                const paletteIndex = Math.abs(Number(this.wallId) || 0) % palette.length;
                const accentA = palette[paletteIndex][0];
                const accentB = palette[paletteIndex][1];

                // Nền phủ kín tuyệt đối: không để lộ tường, sàn, bàn hoặc nhà thi đấu.
                const base = targetCtx.createLinearGradient(0, 0, 0, height);
                base.addColorStop(0, "#030712");
                base.addColorStop(0.48, "#0b1221");
                base.addColorStop(1, "#02040a");
                targetCtx.fillStyle = base;
                targetCtx.fillRect(0, 0, width, height);

                if (isIntro) {
                    // Intro VS: hai mảng màu đối đầu, nghiêng về tâm màn hình.
                    const middleX = width * 0.5;
                    const cut = Math.max(24, width * 0.055);

                    const leftGrad = targetCtx.createLinearGradient(0, 0, middleX + cut, height);
                    leftGrad.addColorStop(0, accentA + "d6");
                    leftGrad.addColorStop(0.58, accentA + "55");
                    leftGrad.addColorStop(1, "rgba(2,6,23,0.12)");
                    targetCtx.fillStyle = leftGrad;
                    targetCtx.beginPath();
                    targetCtx.moveTo(0, 0);
                    targetCtx.lineTo(middleX + cut, 0);
                    targetCtx.lineTo(middleX - cut, height);
                    targetCtx.lineTo(0, height);
                    targetCtx.closePath();
                    targetCtx.fill();

                    const rightGrad = targetCtx.createLinearGradient(width, 0, middleX - cut, height);
                    rightGrad.addColorStop(0, accentB + "d6");
                    rightGrad.addColorStop(0.58, accentB + "55");
                    rightGrad.addColorStop(1, "rgba(2,6,23,0.12)");
                    targetCtx.fillStyle = rightGrad;
                    targetCtx.beginPath();
                    targetCtx.moveTo(middleX + cut, 0);
                    targetCtx.lineTo(width, 0);
                    targetCtx.lineTo(width, height);
                    targetCtx.lineTo(middleX - cut, height);
                    targetCtx.closePath();
                    targetCtx.fill();

                    // Dải phân cách VS sáng nhẹ ở trung tâm.
                    targetCtx.save();
                    targetCtx.translate(middleX, height / 2);
                    targetCtx.rotate(Math.atan2(-height, cut * 2));
                    const seam = targetCtx.createLinearGradient(-height * 0.45, 0, height * 0.45, 0);
                    seam.addColorStop(0, "rgba(255,255,255,0)");
                    seam.addColorStop(0.5, "rgba(255,255,255,0.28)");
                    seam.addColorStop(1, "rgba(255,255,255,0)");
                    targetCtx.fillStyle = seam;
                    targetCtx.fillRect(-height * 0.55, -2, height * 1.1, 4);
                    targetCtx.restore();
                } else {
                    // Chọn team: nền trung tính, sang và không cạnh tranh với danh sách cờ.
                    const centerGlow = targetCtx.createRadialGradient(
                        width / 2, height * 0.42, 0,
                        width / 2, height * 0.42, Math.max(width, height) * 0.72
                    );
                    centerGlow.addColorStop(0, accentA + "30");
                    centerGlow.addColorStop(0.38, accentB + "16");
                    centerGlow.addColorStop(1, "rgba(0,0,0,0)");
                    targetCtx.fillStyle = centerGlow;
                    targetCtx.fillRect(0, 0, width, height);
                }

                // Hoa văn hình học mờ, tạo chiều sâu mà không giống sân thi đấu.
                targetCtx.save();
                targetCtx.globalAlpha = isIntro ? 0.11 : 0.075;
                targetCtx.strokeStyle = "#ffffff";
                targetCtx.lineWidth = 1;
                const grid = Math.max(44, Math.min(72, width * 0.085));
                for (let x = -height; x < width + height; x += grid) {
                    targetCtx.beginPath();
                    targetCtx.moveTo(x, 0);
                    targetCtx.lineTo(x + height * 0.34, height);
                    targetCtx.stroke();
                }
                for (let y = grid; y < height; y += grid) {
                    targetCtx.beginPath();
                    targetCtx.moveTo(0, y);
                    targetCtx.lineTo(width, y);
                    targetCtx.stroke();
                }
                targetCtx.restore();

                // Các quả bóng bàn trang trí cực mờ ở rìa màn hình.
                targetCtx.save();
                targetCtx.globalAlpha = isIntro ? 0.075 : 0.055;
                targetCtx.strokeStyle = "#ffffff";
                targetCtx.lineWidth = Math.max(1.5, width * 0.002);
                const ballRadius = Math.max(35, Math.min(90, width * 0.09));
                [
                    [-ballRadius * 0.1, height * 0.2, ballRadius],
                    [width + ballRadius * 0.15, height * 0.72, ballRadius * 1.2],
                    [width * 0.16, height + ballRadius * 0.3, ballRadius * 0.8]
                ].forEach((b) => {
                    targetCtx.beginPath();
                    targetCtx.arc(b[0], b[1], b[2], 0, Math.PI * 2);
                    targetCtx.stroke();
                });
                targetCtx.restore();

                // Thanh trên/dưới giúp bố cục giống màn hình sự kiện chuyên nghiệp.
                const topBar = targetCtx.createLinearGradient(0, 0, width, 0);
                topBar.addColorStop(0, accentA + "00");
                topBar.addColorStop(0.5, "rgba(255,255,255,0.18)");
                topBar.addColorStop(1, accentB + "00");
                targetCtx.fillStyle = topBar;
                targetCtx.fillRect(0, 0, width, Math.max(3, height * 0.006));
                targetCtx.fillRect(0, height - Math.max(3, height * 0.006), width, Math.max(3, height * 0.006));

                // Vignette cuối cùng bảo đảm không nhìn thấy bất cứ chi tiết sân nào phía dưới.
                const vignette = targetCtx.createRadialGradient(
                    width / 2, height * 0.46, height * 0.12,
                    width / 2, height * 0.5, Math.max(width, height) * 0.78
                );
                vignette.addColorStop(0, "rgba(0,0,0,0)");
                vignette.addColorStop(0.68, "rgba(0,0,0,0.08)");
                vignette.addColorStop(1, "rgba(0,0,0,0.72)");
                targetCtx.fillStyle = vignette;
                targetCtx.fillRect(0, 0, width, height);
            }

            drawFullScreenCover(ctx, width, height, coverType) {
                const cacheName = coverType === "matchIntro" ? "matchIntroCoverCache" : "teamSelectCoverCache";
                let cache = this[cacheName];

                if (!cache || cache.width !== width || cache.height !== height) {
                    cache = document.createElement("canvas");
                    cache.width = width;
                    cache.height = height;
                    const cacheCtx = cache.getContext("2d");
                    this.buildFullScreenCover(cacheCtx, width, height, coverType);
                    this[cacheName] = cache;
                }

                ctx.drawImage(cache, 0, 0);
            }

            renderTeamSelectionCover() {
                this.drawFullScreenCover(ctx, canvas.width, canvas.height, "teamSelect");
            }

            renderMatchIntroCover() {
                this.drawFullScreenCover(ctx, canvas.width, canvas.height, "matchIntro");
            }

            renderGame() {
                this.drawStadium(ctx, canvas.width, canvas.height, false);
            }

            renderMenu() {
                this.drawStadium(ctx, canvas.width, canvas.height, true);
            }
        };

        Elements.Firework = class Firework extends Utils.AnimSprite {
            constructor() {
                super(assetLib.getData("firework"), 30, 30, "explode");
                this.vy = 0;
                this.setAnimType("once", "explode");
                this.animEndedFunc = () => {
                    this.removeMe = true;
                };
                TweenLite.to(this, 1, {
                    scaleX: 2,
                    scaleY: 2,
                    ease: "Quad.easeOut",
                });
            }

            update() {
                this.vy += 150 * delta;
                this.y += this.vy * delta;
                super.updateAnimation(delta);
            }

            render() {
                super.renderSimple(ctx);
            }
        };

        // ==========================================
        // 8. CLASS GIAO DIỆN (UI PANEL)
        // ==========================================
        Elements.Panel = class Panel {
            constructor(panelType, aButs) {
                this.timer = 0.3;
                this.endTime = 0;
                this.posY = 0;
                this.largeNumberSpace = 68;
                this.smallNumberSpace = 17;
                this.scoreNumberSpace = 15;
                this.incY = 0;
                this.flareRot = 0;
                this.cupFlipInc = 0;
                this.waveTimer = 0;
                this.userCardScale = 1;
                this.enemyCardScale = 1;
                this.userBatX = 0;
                this.userBatY = 0;
                this.enemyBatX = 0;
                this.enemyBatY = 0;
                this.ballX = 0;
                this.ballY = 0;
                this.ballHeight = 0;

                this.oCountryFlagsImgData = assetLib.getData("countryFlags");
                this.oUiElementsImgData = assetLib.getData("uiElements");
                this.oLargeNumbersImgData = assetLib.getData("largeNumbers");
                this.oGameElementsImgData = assetLib.getData("gameElements");

                this.panelType = panelType;
                this.aButs = aButs || [];
            }

            update() {
                this.incY += 10 * delta;
                this.waveTimer += 8 * delta; // Tốc độ gió cho cờ
            }

            startTween1() {
                this.posY = 500;
                TweenLite.to(this, 0.5, { posY: 0, ease: "Cubic.easeOut" });
            }

            startTut() {
                this.userBatX = -50; this.userBatY = 85;
                this.enemyBatX = 0; this.enemyBatY = -130;
                this.ballX = 0; this.ballY = 19;

                TweenLite.to(this, 0.55, { delay: 0.35, userBatX: 50, userBatY: -60, ease: "Back.easeOut", onComplete: () => this.movePlayerBat(0) });
                TweenLite.to(this, 0.5, { delay: 0.8, enemyBatX: 50, ease: "Back.easeOut" });

                this.ballHeight = 30;
                TweenLite.to(this, 0.55, { delay: 0.5, ballX: 30, ballY: -100, ease: "Linear.easeNone" });
                TweenLite.to(this, 0.6, { delay: 0.6, ballHeight: -30, ease: "Quad.easeIn" });
            }

            movePlayerBat(step) {
                switch (step) {
                    case 0:
                        TweenLite.to(this, 0.5, { userBatX: 130, userBatY: 85, ease: "Quad.easeInOut", onComplete: () => this.movePlayerBat(1) });
                        TweenLite.to(this, 0.65, { delay: 0.25, ballX: 75, ballY: 50, ease: "Quad.easeIn", onComplete: () => TweenLite.to(this, 0.65, { ballX: -20, ballY: -100, ease: "Quad.easeOut" }) });
                        TweenLite.to(this, 0.65, { delay: 0.25, ballHeight: 40, ease: "Quad.easeIn", onComplete: () => TweenLite.to(this, 0.65, { ballHeight: -30, ease: "Quad.easeIn" }) });
                        break;
                    case 1:
                        TweenLite.to(this, 0.5, { delay: 0.3, userBatX: -30, userBatY: -60, ease: "Back.easeOut", onComplete: () => this.movePlayerBat(2) });
                        TweenLite.to(this, 0.5, { delay: 0.8, enemyBatX: -30, ease: "Back.easeOut" });
                        break;
                    case 2:
                        TweenLite.to(this, 0.5, { userBatX: -130, userBatY: 85, ease: "Quad.easeInOut", onComplete: () => this.movePlayerBat(3) });
                        TweenLite.to(this, 0.65, { delay: 0.25, ballX: -75, ballY: 50, ease: "Quad.easeIn", onComplete: () => TweenLite.to(this, 0.65, { ballX: 20, ballY: -100, ease: "Quad.easeOut" }) });
                        TweenLite.to(this, 0.65, { delay: 0.25, ballHeight: 40, ease: "Quad.easeIn", onComplete: () => TweenLite.to(this, 0.65, { ballHeight: -30, ease: "Quad.easeIn" }) });
                        break;
                    case 3:
                        TweenLite.to(this, 0.5, { delay: 0.3, userBatX: 30, userBatY: -60, ease: "Back.easeOut", onComplete: () => this.movePlayerBat(0) });
                        TweenLite.to(this, 0.5, { delay: 0.8, enemyBatX: 30, ease: "Back.easeOut" });
                        break;
                }
            }

            cardTween(target) {
                if (target === "user") {
                    this.userCardScale = 0.25;
                    TweenLite.to(this, 0.5, { userCardScale: 1, ease: "Bounce.easeOut" });
                } else {
                    this.enemyCardScale = 0.25;
                    TweenLite.to(this, 0.5, { enemyCardScale: 1, ease: "Bounce.easeOut" });
                }
            }

            switchBut(oldId, newId) {
                for (let i = 0; i < this.aButs.length; i++) {
                    if (this.aButs[i].id === oldId) {
                        this.aButs[i].id = newId;
                        break;
                    }
                }
            }

            flare(x, y, scale = 1) {
                this.flareRot += delta;
                const i = Math.sin(1 * this.flareRot) / 2 / 3;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(this.flareRot);
                ctx.scale(scale * (1 + i), scale * (1 - i));

                const atlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.flare];
                ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, -atlas.width / 2, -atlas.height / 2, atlas.width, atlas.height);

                ctx.scale(1 * (1 - i), 1 * (1 + i));
                ctx.scale(1 * (1 - i), 1 * (1 + i));
                ctx.rotate(2 * -this.flareRot);
                ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, -atlas.width / 2, -atlas.height / 2, atlas.width, atlas.height);
                ctx.restore();
            }

            roundRect(ctx, x, y, width, height, radius = 5, fill = true, stroke = true) {
                if (typeof radius === "number") radius = { tl: radius, tr: radius, br: radius, bl: radius };
                ctx.beginPath();
                ctx.moveTo(x + radius.tl, y);
                ctx.lineTo(x + width - radius.tr, y);
                ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
                ctx.lineTo(x + width, y + height - radius.br);
                ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
                ctx.lineTo(x + radius.bl, y + height);
                ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
                ctx.lineTo(x, y + radius.tl);
                ctx.quadraticCurveTo(x, y, x + radius.tl, y);
                ctx.closePath();
                if (fill) ctx.fill();
                if (stroke) {
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = "rgba(255,255,255,0.5)";
                    ctx.stroke();
                }
            }

            drawButton(ctx, btn, x, y) {
                const w = btn.width * (btn.scale || 1);
                const h = btn.height * (btn.scale || 1);
                const r = 10;

                ctx.save();
                let animOffset = 0;
                if (!btn.noMove && this.incY !== 0) animOffset = 3 * Math.sin(this.incY + 45);

                const drawX = x - w / 2 - animOffset / 2;
                const drawY = y - h / 2 + animOffset / 2;

                // Bóng đổ
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                this.roundRect(ctx, drawX + 4, drawY + 4, w + animOffset, h - animOffset, r, true, false);

                // Nền
                ctx.fillStyle = btn.bgColor || "#4CAF50";
                this.roundRect(ctx, drawX, drawY, w + animOffset, h - animOffset, r, true, true);

                // Label
                if (btn.label) {
                    ctx.fillStyle = btn.textColor || "#FFFFFF";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.font = `bold ${btn.fontSize || 22}px Arial`;
                    ctx.shadowColor = "rgba(0,0,0,0.5)";
                    ctx.shadowBlur = 2;
                    ctx.fillText(btn.label, x, y + 2);
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
            }

            addButs(ctxTarget) {
                for (let i = 0; i < this.aButs.length; i++) {
                    const btn = this.aButs[i];
                    btn.scale = btn.scale || 1;
                    const finalX = (canvas.width * btn.align[0]) + btn.aPos[0];
                    const finalY = (canvas.height * btn.align[1]) + btn.aPos[1] + this.posY;

                    if (btn.label || btn.bgColor) {
                        this.drawButton(ctxTarget, btn, finalX, finalY);
                    } else if (btn.oImgData && btn.id && btn.id !== "none") {
                        let animOffset = 0;
                        if (!btn.noMove && this.incY !== 0) animOffset = 3 * Math.sin(this.incY + 45 * i);

                        const atlas = btn.oImgData.oData.oAtlasData[btn.id];
                        ctxTarget.drawImage(
                            btn.oImgData.img, atlas.x, atlas.y, atlas.width, atlas.height,
                            finalX - (atlas.width / 2) * btn.scale - animOffset / 2,
                            finalY - (atlas.height / 2) * btn.scale + animOffset / 2,
                            atlas.width * btn.scale + animOffset,
                            atlas.height * btn.scale - animOffset
                        );
                    }
                }
            }

            render(drawButtons = true) {
                if (!drawButtons) this.addButs(ctx);

                let atlas, imgX, imgY, imgW, imgH;

                switch (this.panelType) {
                    case "splash": break;

                    case "start":
                        atlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.titleFadeBar];
                        ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, 0, 0.55 * canvas.height - atlas.height / 2, canvas.width, atlas.height);

                        const newBatImg = assetLib.getData("newTitleBats").img;
                        const batScale = Math.min(canvas.height / 1.3 / newBatImg.height, 1);
                        ctx.drawImage(newBatImg, 0, 0, newBatImg.width, newBatImg.height, canvas.width / 2 - (newBatImg.width * batScale) / 2, 0.4 * canvas.height - (newBatImg.height * batScale) / 2 - this.posY / 3, newBatImg.width * batScale, newBatImg.height * batScale);

                        atlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.titleLogo];
                        ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, canvas.width / 2 - atlas.width / 2, 0.2 * canvas.height - atlas.height / 2 - this.posY, atlas.width, atlas.height);
                        break;

                    case "credits":
                        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        break;

                    case "chooseCountry":
                        const totalCountries = countryFlags.aIds.length;
                        const totalRows = Math.ceil(totalCountries / listMetrics.cols);
                        totalContentHeight = totalRows * listMetrics.itemH + 20;
                        const maxScroll = Math.max(0, totalContentHeight - listMetrics.h);

                        if (targetScrollY < 0) targetScrollY = 0;
                        if (targetScrollY > maxScroll) targetScrollY = maxScroll;
                        scrollY += (targetScrollY - scrollY) * 0.2;

                        ctx.save();
                        ctx.textAlign = "center";
                        ctx.fillStyle = "#FFFFFF";
                        ctx.font = "bold 30px Arial";
                        ctx.shadowColor = "rgba(0,0,0,0.8)";
                        ctx.shadowBlur = 4;
                        ctx.fillText("Select Your Team", canvas.width / 2, 70);
                        ctx.restore();

                        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                        this.roundRect(ctx, listMetrics.x, listMetrics.y, listMetrics.w, listMetrics.h, 8, true, false);

                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(listMetrics.x, listMetrics.y, listMetrics.w, listMetrics.h);
                        ctx.clip();

                        const startRow = Math.floor(scrollY / listMetrics.itemH);
                        const endRow = startRow + Math.ceil(listMetrics.h / listMetrics.itemH) + 1;
                        const startIndex = startRow * listMetrics.cols;
                        const endIndex = Math.min(totalCountries, endRow * listMetrics.cols);
                        const itemW = listMetrics.w / listMetrics.cols;

                        for (let i = startIndex; i < endIndex; i++) {
                            const c = i % listMetrics.cols;
                            const r = Math.floor(i / listMetrics.cols);
                            const cx = listMetrics.x + c * itemW + itemW / 2;
                            const cy = listMetrics.y + r * listMetrics.itemH - scrollY + listMetrics.itemH / 2;

                            const countryId = countryFlags.aIds[i];
                            const flagData = countryFlags.getBData(countryId);

                            const flagScale = Math.min(64 / flagData.bWidth, 42 / flagData.bHeight);
                            const fw = flagData.bWidth * flagScale;
                            const fh = flagData.bHeight * flagScale;
                            const fx = cx - fw / 2;
                            const fy = cy - 20;

                            for (let k = 0; k < fw; k += 2) {
                                const yOff = Math.sin(k * 0.1 - this.waveTimer) * 2;
                                ctx.drawImage(this.oCountryFlagsImgData.img, flagData.bX + (k / fw) * flagData.bWidth, flagData.bY, (2 / fw) * flagData.bWidth, flagData.bHeight, fx + k, fy + yOff, 2, fh);
                            }

                            ctx.fillStyle = "#FFF";
                            ctx.textAlign = "center";
                            ctx.font = "bold 12px Arial";
                            ctx.fillText(getCountryNameById(countryId), cx, fy + fh + 15);
                        }
                        ctx.restore();

                        if (totalContentHeight > listMetrics.h) {
                            let sbH = Math.max((listMetrics.h / totalContentHeight) * listMetrics.h, 40);
                            const sbY = listMetrics.y + (scrollY / maxScroll) * (listMetrics.h - sbH);
                            ctx.fillStyle = "rgba(255,255,255,0.5)";
                            this.roundRect(ctx, listMetrics.x + listMetrics.w - 8, sbY, 5, sbH, 3, true, false);
                        }
                        break;

                    case "map":
                        atlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.titleFadeBar];
                        ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, 0, 0.5 * canvas.height - atlas.height / 2 + this.posY / 2, canvas.width, atlas.height);

                        const mapAtlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.map];
                        ctx.drawImage(this.oUiElementsImgData.img, mapAtlas.x, mapAtlas.y, mapAtlas.width, mapAtlas.height, canvas.width / 2 - mapAtlas.width / 2, 0.45 * canvas.height - mapAtlas.height / 2 - this.posY / 2, mapAtlas.width, mapAtlas.height);
                        break;

                    case "gameIntro":
                        atlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.titleFadeBar];
                        ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, 0, 0.6 * canvas.height - atlas.height / 2 + this.posY / 2, canvas.width, atlas.height);

                        ctx.save();
                        ctx.textAlign = "center";
                        ctx.fillStyle = "#FFFFFF";
                        ctx.font = "bold 40px Arial";
                        ctx.shadowColor = "rgba(0,0,0,0.5)";
                        ctx.shadowBlur = 4;
                        ctx.fillText(`LEVEL ${getCurrentLevel()}`, canvas.width / 2, 0.3 * canvas.height - this.posY / 2);
                        ctx.font = "bold 18px Arial";
                        ctx.fillStyle = "#FFD700";
                        ctx.fillText("Target: 11 points to win", canvas.width / 2, 0.3 * canvas.height + 30 - this.posY / 2);
                        ctx.fillText("2 points difference to win if draw", canvas.width / 2, 0.32 * canvas.height + 30 - this.posY / 2);
                        ctx.restore();

                        const contentY = 0.5 * canvas.height;
                        const vsAtlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.vsText];
                        ctx.drawImage(this.oUiElementsImgData.img, vsAtlas.x, vsAtlas.y, vsAtlas.width, vsAtlas.height, canvas.width / 2 - vsAtlas.width / 2, contentY - vsAtlas.height / 2 - this.posY / 4, vsAtlas.width, vsAtlas.height);

                        const drawFlag = (countryId, offsetX, phaseOffset) => {
                            const h = countryFlags.getBData(countryId);
                            const drawW = h.bWidth * 1.2;
                            const drawH = h.bHeight * 1.2;
                            const flagX = canvas.width / 2 - drawW / 2 + offsetX;
                            const flagY = contentY - drawH / 2 - this.posY / 4;

                            for (let k = 0; k < drawW; k += 2) {
                                const yOffset = Math.sin(k * 0.05 - this.waveTimer + phaseOffset) * 5;
                                ctx.drawImage(this.oCountryFlagsImgData.img, h.bX + (k / drawW) * h.bWidth, h.bY, (2 / drawW) * h.bWidth, h.bHeight, flagX + k, flagY + yOffset, 2, drawH);
                            }
                            ctx.save();
                            ctx.textAlign = "center";
                            ctx.fillStyle = "#ffffff";
                            ctx.font = "bold 16px Arial";
                            ctx.fillText(getCountryNameById(countryId), canvas.width / 2 + offsetX, contentY + drawH / 2 - this.posY / 4 + 25);
                            ctx.restore();
                        };

                        drawFlag(oGameData.userId, -120, 0);
                        drawFlag(oGameData.enemyId, 120, 1);
                        break;

                    case "game":
                        let showScore = true, showFlags = true;
                        if (forcedModeProperties?.override?.hide_ui) {
                            showScore = !forcedModeProperties.override.hide_ui.includes("score");
                            showFlags = !forcedModeProperties.override.hide_ui.includes("flags");
                        }

                        if (showFlags) {
                            const flagDist = 90;
                            const drawInGameFlag = (cId, xOff) => {
                                const h = countryFlags.getBData(cId);
                                ctx.drawImage(this.oCountryFlagsImgData.img, h.bX, h.bY, h.bWidth, h.bHeight, canvas.width / 2 - (h.bWidth / 2) * 0.7 + xOff, 10 - this.posY, h.bWidth * 0.7, h.bHeight * 0.7);
                            };
                            drawInGameFlag(oGameData.userId, -flagDist);
                            drawInGameFlag(oGameData.enemyId, flagDist);

                            ctx.save();
                            ctx.textAlign = "center";
                            ctx.fillStyle = "#FFFFFF";
                            ctx.font = "bold 11px Arial";
                            ctx.shadowColor = "rgba(0,0,0,0.8)";
                            ctx.shadowBlur = 3;
                            const textY = 10 + 59 * 0.7 + 12 - this.posY;
                            ctx.fillText(getCountryNameById(oGameData.userId), canvas.width / 2 - flagDist, textY);
                            ctx.fillText(getCountryNameById(oGameData.enemyId), canvas.width / 2 + flagDist, textY);
                            ctx.restore();
                        }

                        if (showScore) {
                            const scAtlas = this.oGameElementsImgData.oData.oAtlasData[oImageIds.scoreCard];
                            const scoreDist = 28;
                            ctx.drawImage(this.oGameElementsImgData.img, scAtlas.x, scAtlas.y, scAtlas.width, scAtlas.height, canvas.width / 2 - scoreDist - scAtlas.width / 2, 0 - this.posY / 2, scAtlas.width, scAtlas.height * this.userCardScale);
                            ctx.drawImage(this.oGameElementsImgData.img, scAtlas.x, scAtlas.y, scAtlas.width, scAtlas.height, canvas.width / 2 + scoreDist - scAtlas.width / 2, 0 - this.posY / 2, scAtlas.width, scAtlas.height * this.enemyCardScale);

                            ctx.save();
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillStyle = "#0000FF";
                            ctx.font = "bold 32px Arial";
                            const scoreY = (0 - this.posY / 2) + (scAtlas.height / 2) + 2;
                            ctx.fillText(oGameData.userScore, canvas.width / 2 - scoreDist, scoreY);
                            ctx.fillText(oGameData.enemyScore, canvas.width / 2 + scoreDist, scoreY);
                            ctx.font = "bold 12px Arial";
                            ctx.fillStyle = "rgba(255,255,255,0.9)";
                            ctx.shadowColor = "rgba(0,0,0,0.8)";
                            ctx.shadowBlur = 3;
                            ctx.fillText(`LEVEL ${getCurrentLevel()}`, canvas.width / 2, scoreY + 38);
                            ctx.restore();
                        }
                        break;

                    case "gameComplete":
                        atlas = this.oUiElementsImgData.oData.oAtlasData[oImageIds.titleFadeBar];
                        ctx.drawImage(this.oUiElementsImgData.img, atlas.x, atlas.y, atlas.width, atlas.height, 0, 0.55 * canvas.height - atlas.height / 2 + this.posY / 2, canvas.width, atlas.height);

                        if (!forcedMode) {
                            const centerX = canvas.width / 2;
                            const wonMatch = oGameData.userScore > oGameData.enemyScore;
                            const shownLevel = wonMatch
                                ? Math.max(1, lastCompletedLevel || getCurrentLevel() - 1)
                                : getCurrentLevel();
                            const cardW = Math.min(canvas.width * 0.72, 360);
                            const cardH = 108;
                            const cardX = centerX - cardW / 2;
                            const cardY = 0.17 * canvas.height - this.posY;

                            ctx.save();
                            ctx.fillStyle = "rgba(0,0,0,0.30)";
                            this.roundRect(ctx, cardX + 5, cardY + 7, cardW, cardH, 18, true, false);

                            const levelGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
                            levelGrad.addColorStop(0, "rgba(12,24,43,0.96)");
                            levelGrad.addColorStop(1, "rgba(21,42,67,0.96)");
                            ctx.fillStyle = levelGrad;
                            this.roundRect(ctx, cardX, cardY, cardW, cardH, 18, true, false);

                            ctx.strokeStyle = wonMatch ? "#7CFF6B" : "#FFB14A";
                            ctx.lineWidth = 3;
                            this.roundRect(ctx, cardX, cardY, cardW, cardH, 18, false, true);

                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.shadowColor = "rgba(0,0,0,0.55)";
                            ctx.shadowBlur = 5;
                            ctx.font = "bold 18px Arial";
                            ctx.fillStyle = wonMatch ? "#7CFF6B" : "#FFB14A";
                            ctx.fillText(wonMatch ? "LEVEL COMPLETE" : "LEVEL FAILED", centerX, cardY + 28);

                            ctx.font = "bold 42px Arial";
                            ctx.fillStyle = "#FFFFFF";
                            ctx.fillText(`LEVEL ${shownLevel}`, centerX, cardY + 65);

                            ctx.shadowBlur = 0;
                            ctx.font = "bold 14px Arial";
                            ctx.fillStyle = "rgba(255,255,255,0.78)";
                            ctx.fillText(wonMatch ? `NEXT: LEVEL ${getCurrentLevel()}` : "TAP TO TRY AGAIN", centerX, cardY + 93);
                            ctx.restore();
                        }

                        const scoreYBase = 0.6 * canvas.height;
                        ctx.save();
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.font = "bold 100px Arial";
                        ctx.fillStyle = "#FFFFFF";
                        ctx.shadowColor = "rgba(0,0,0,0.5)";
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 4;
                        ctx.shadowOffsetY = 4;
                        ctx.fillText(`${oGameData.userScore} - ${oGameData.enemyScore}`, canvas.width / 2, scoreYBase - this.posY / 2);
                        ctx.font = "bold 20px Arial";
                        ctx.fillStyle = "#FFD700";
                        ctx.shadowBlur = 0;
                        ctx.fillText("FINAL SCORE", canvas.width / 2, scoreYBase - 70 - this.posY / 2);
                        ctx.restore();

                        const drawGCFlag = (cId, xOff) => {
                            const h = countryFlags.getBData(cId);
                            ctx.drawImage(this.oCountryFlagsImgData.img, h.bX, h.bY, h.bWidth, h.bHeight, canvas.width / 2 - (h.bWidth / 2) * 1.2 + xOff, 0.55 * canvas.height - 110 - (h.bHeight / 2) * 1.2 - this.posY / 2, h.bWidth * 1.2, h.bHeight * 1.2);
                            ctx.save();
                            ctx.textAlign = "center";
                            ctx.fillStyle = "#ffffff";
                            ctx.font = "bold 16px Arial";
                            ctx.fillText(getCountryNameById(cId), canvas.width / 2 + xOff, 0.55 * canvas.height - 110 + (h.bHeight / 2) * 1.2 - this.posY / 2 + 20);
                            ctx.restore();
                        };
                        drawGCFlag(oGameData.userId, -120);
                        drawGCFlag(oGameData.enemyId, 120);
                        break;

                    case "pause":
                        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        break;
                }

                if (drawButtons) this.addButs(ctx);
            }
        };
        // ==========================================
        // 1. CLASS VỢT NGƯỜI CHƠI (USER BAT)
        // ==========================================
        Elements.UserBat = class UserBat {
            constructor() {
                this.x = 0;
                this.y = 0;
                this.rotation = 0;
                this.scale = 1;

                this.gameElementsData = assetLib.getData("gameElements");
                this.logoImgData = assetLib.getData("paddleLogo");

                // SỬA Ở ĐÂY: Đổi targetX thành targX, targetY thành targY
                this.targX = canvas.width / 2;
                this.targY = canvas.height - 150;

                this.bufferCanvas = document.createElement("canvas");
                this.bufferCtx = this.bufferCanvas.getContext("2d");

                this.prevX = 0;
                this.prevY = 0;
                this.hitX = 0;
                this.hitY = 0;
            }

            update() {
                const tableAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.table0];

                this.maxY = (canvas.height / 4) +
                    (tableAtlas.height / tableTop.segs) * (0.28 * tableTop.segs) * (1 + tableTop.offsetY / 3) +
                    (50 * tableTop.offsetY);

                this.prevX = this.x;
                this.prevY = this.y;

                // SỬA Ở ĐÂY: Đọc từ targX và targY thay vì targetX, targetY
                this.x = this.targX;
                this.y = Math.max(this.targY, this.maxY);

                const rotationLimit = 90 * radian;
                this.rotation = Math.max(Math.min((this.x - canvas.width / 2) / 200, rotationLimit), -rotationLimit);
                this.scale = 0.47 + (this.y - this.maxY) / 500;
            }
            getHitData(ballPosX, ballPosY) {
                const normBallX = Math.min(Math.max(ballPosX, -1), 1);
                let speedX = Math.max(Math.min((this.x - this.prevX) / delta, 3500), -3500) / 3500;
                const speedY = Math.max(Math.min((this.prevY - this.y) / delta, 4500) / 4500, 0);

                let spinAmount = 0;
                if (speedY < 0.5) {
                    if (speedX > 0.5) spinAmount = -2 * (speedX - 0.5) * (1 - 2 * speedY);
                    else if (speedX < -0.5) spinAmount = -2 * (speedX + 0.5) * (1 - 2 * speedY);
                }

                if (normBallX < 0) speedX *= (speedX > 0) ? (1 - normBallX) : 1.2;
                else if (speedX < 0) speedX *= (1 + normBallX);
                else speedX *= 1.2;

                if (ball.servingState === 0) speedX *= 0.5;

                this.hitX = speedX + 0.8 * normBallX;
                this.hitY = 0.4 * (1 - speedY);

                if (typeof forcedModeProperties !== 'undefined' && forcedModeProperties?.override?.curve_mode) {
                    let curveStrength = forcedModeProperties.override.curve_strength ?? 0.5;
                    spinAmount = -2 * (speedX + curveStrength * (speedX > 0 ? 1 : -1)) * (1 - 2 * speedY);
                }

                let finalSpeed = 0.3 + (0.3 / 0.4) * (0.4 - this.hitY);
                if (typeof forcedModeProperties !== 'undefined' && forcedModeProperties?.override?.powerhit_mode && !player_serve) {
                    finalSpeed = 0.6;
                }

                return { x: this.hitX, y: this.hitY, speed: finalSpeed, spin: spinAmount };
            }

            render() {
                const atlasData = this.gameElementsData.oData.oAtlasData[oImageIds.userBatCentre];

                this.bufferCanvas.width = atlasData.width;
                this.bufferCanvas.height = atlasData.height;
                this.bufferCtx.clearRect(0, 0, atlasData.width, atlasData.height);
                this.bufferCtx.drawImage(this.gameElementsData.img, atlasData.x, atlasData.y, atlasData.width, atlasData.height, 0, 0, atlasData.width, atlasData.height);
                this.bufferCtx.globalCompositeOperation = "source-in";
                this.bufferCtx.fillStyle = "#B6FF00";
                this.bufferCtx.fillRect(0, 0, atlasData.width, atlasData.height);
                this.bufferCtx.globalCompositeOperation = "source-over";

                const logoObj = this.logoImgData || assetLib.getData("paddleLogo");
                if (logoObj && logoObj.img) {
                    const logoSize = 113 * 0.6;
                    this.bufferCtx.drawImage(logoObj.img, 0, 0, logoObj.img.width, logoObj.img.height, (atlasData.width / 2) - logoSize / 2, (atlasData.height * 0.38) - logoSize / 2, logoSize, logoSize);
                }

                ctx.save();
                ctx.translate(this.x, this.y - 20 * this.scale);
                ctx.scale(this.scale, this.scale * Math.min(1 - ((this.y - 0.5 * canvas.height) / (0.5 * canvas.height)) * 0.3, 1));
                ctx.rotate(this.rotation);

                ctx.save();
                ctx.rotate(-this.rotation);
                ctx.translate(0, Math.min(7 * Math.max((this.y - 0.5 * canvas.height) / (0.5 * canvas.height), 0), 7));
                ctx.rotate(this.rotation);

                const edgeAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.userBatEdge];
                ctx.drawImage(this.gameElementsData.img, edgeAtlas.x, edgeAtlas.y, edgeAtlas.width, edgeAtlas.height, -edgeAtlas.width / 2, -edgeAtlas.height / 3 - 23, edgeAtlas.width, edgeAtlas.height);
                ctx.restore();

                ctx.drawImage(this.bufferCanvas, -atlasData.width / 2, -atlasData.height / 3);
                ctx.restore();
            }
        }

        // ==========================================
        // 2. CLASS VỢT AI (ENEMY BAT)
        // ==========================================
        Elements.EnemyBat = class EnemyBat {
            constructor() {
                this.x = canvas.width / 2;
                this.y = 0;
                this.targetX = 0;
                this.targetY = 0;
                this.rotation = 0;
                this.scale = 1;

                this.speedX = 3000;
                this.skillLevel = 0;
                this.id = (6 * oGameData.cupId + oGameData.gameId) % 7;
                this.easingTypes = ["Quad.easeInOut", "Back.easeOut", "Cubic.easeOut", "Back.easeInOut"];
                this.trackBall = false;
                this.slideIncrement = 0;
                this.flailIncrement = 0;

                // Trạng thái riêng cho cú đập của AI.
                // Cooldown tính theo số lần AI trả bóng để tránh đập liên tiếp thiếu công bằng.
                this.smashCooldownHits = 0;
                this.smashSwing = 0;
                this.smashFxAlpha = 0;
                this.smashSide = 1;
                this.smashTween = null;
                this.smashFxTween = null;

                this.gameElementsData = assetLib.getData("gameElements");
                this.initSkillLevel();
            }

            initSkillLevel() {
                if (typeof forcedMode !== 'undefined' && forcedModeProperties?.override?.enemy_difficulty) {
                    const diff = forcedModeProperties.override.enemy_difficulty;
                    this.skillLevel = (diff === "easy") ? 0.16 : (diff === "hard") ? 0.9 : (diff === "broken") ? 1.25 : 0.5;
                } else {
                    const level = getCurrentLevel();
                    // Level 1 đã phản xạ tốt hơn bản cũ, sau đó tăng nhẹ và đều.
                    // Giới hạn 0.90 để AI vẫn có sai số và không trở thành máy đỡ bóng hoàn hảo.
                    this.skillLevel = Math.min(0.90, 0.16 + (level - 1) * 0.02);
                }
            }

            resetToCentre() {
                this.trackBall = false;
                if (this.moveTween) this.moveTween.kill();
                this.targetX = this.x - canvas.width / 2;
                this.moveTween = TweenLite.to(this, 1, {
                    targetX: 0, targetY: 0, ease: "Quad.easeInOut", onComplete: () => {
                        if (ball.lastHit === "enemy") ball.enemyServe();
                    }
                });
            }

            flail() {
                this.flailIncrement = 0;
                const dir = ball.x < this.x ? -1 : 1;
                TweenLite.to(this, 0.5, {
                    flailIncrement: dir, ease: "Quad.easeInOut", onComplete: () => {
                        TweenLite.to(this, 0.5, { flailIncrement: 0, ease: "Quad.easeInOut" });
                    }
                });
            }

            playSmashAnimation(ballX) {
                if (this.smashTween) this.smashTween.kill();
                if (this.smashFxTween) this.smashFxTween.kill();

                this.smashSide = ballX < this.x ? -1 : 1;
                this.smashSwing = 0;
                this.smashFxAlpha = 1;

                // Vung vợt nhanh xuống trước để cú đập nhìn khác hẳn cú trả bóng thường.
                this.smashTween = TweenLite.to(this, 0.075, {
                    smashSwing: 1,
                    ease: "Back.easeOut",
                    onComplete: () => {
                        this.smashTween = TweenLite.to(this, 0.18, {
                            smashSwing: 0,
                            ease: "Quad.easeOut"
                        });
                    }
                });

                this.smashFxTween = TweenLite.to(this, 0.42, {
                    smashFxAlpha: 0,
                    ease: "Quad.easeOut"
                });
            }

            setBouncePos(bounceX, bounceY, spin) {
                if (this.moveTween) this.moveTween.kill();

                if ((spin === 0 || Math.random() < 0.25) && ball.servingState !== 1) {
                    this.trackBall = false;
                    let err = (Math.random() > 0.78 + 0.18 * this.skillLevel) ? 80 * Math.random() - 40 : 0;
                    const tY = (bounceY * bounceY * 235 * (1 + tableTop.offsetY / 2)) / 2;
                    const tX = tY * (tableTop.offsetX + 0.6 * bounceX) * 1.28 * (1 + tableTop.offsetY / 2) + (233 * bounceX) / 2 + 100 * spin;

                    this.moveTween = TweenLite.to(this, (0.33 * Math.random() + 0.27) * (1 + 0.68 * (1 - this.skillLevel)), {
                        delay: 0.2 * Math.random(), targetX: tX + err, targetY: tY,
                        ease: this.easingTypes[Math.floor(Math.random() * this.easingTypes.length)],
                        onComplete: () => {
                            if (ball.lastHit === "enemy") {
                                this.moveTween = TweenLite.to(this, (0.35 * Math.random() + 0.3) * (1 + 0.5 * (1 - this.skillLevel)), {
                                    delay: 0.3 * Math.random() * (1 + 0.5 * (1 - this.skillLevel)), targetX: 200 * Math.random() - 100, targetY: 0, ease: "Quad.easeInOut"
                                });
                            }
                        }
                    });
                } else {
                    this.trackBall = true;
                    this.slideIncrement = 0;
                    this.moveTween = TweenLite.to(this, (0.35 * Math.random() + 0.3) * (1 + 0.5 * (1 - this.skillLevel)), { targetY: 0, ease: "Quad.easeInOut" });
                }
            }

            update() {
                if (window.remix?.paused) return;
                this.y = this.targetY + canvas.height / 4 + 50 * tableTop.offsetY - 45;

                if (this.trackBall) {
                    if (this.x > ball.x + 13) this.slideIncrement = Math.max(this.slideIncrement - 1100 * delta, -55 * this.skillLevel - 55);
                    else if (this.x < ball.x - 13) this.slideIncrement = Math.min(this.slideIncrement + 1100 * delta, 55 + 55 * this.skillLevel);

                    this.x += 4 * this.slideIncrement * delta;

                    if (ball.lastHit === "enemy") {
                        this.targetX = this.x - canvas.width / 2;
                        this.moveTween = TweenLite.to(this, (0.35 * Math.random() + 0.3) * (1 + 0.5 * (1 - this.skillLevel)), {
                            delay: 0.3 * Math.random() * (1 + 0.5 * (1 - this.skillLevel)), targetX: 200 * Math.random() - 100, targetY: 0, ease: "Quad.easeInOut"
                        });
                        this.trackBall = false;
                    }
                } else {
                    this.x = this.targetX + canvas.width / 2;
                }

                this.rotation = (this.x - canvas.width / 2) / 200;
                this.scale = 0.4 + (this.y - canvas.height / 4) / 300;
                this.x = Math.min(Math.max(this.x, canvas.width / 2 - 250), canvas.width / 2 + 250);
            }

            getHitData(t, e) { return this._getHitData(t, e); }

            _getHitData(ballPosX, ballPosY) {
                const level = getCurrentLevel();

                if (this.smashCooldownHits > 0) this.smashCooldownHits--;

                if (ball.servingState === 0) {
                    this.hitX = 2 * Math.random() - 1;
                    this.hitY = 0.2 * Math.random() + 0.65;
                } else {
                    this.hitX = (2 * Math.random() - 1) * (1 + 0.25 * (1 - this.skillLevel));
                    this.hitY = 0.4 * Math.random() + 0.65;
                }

                let spinAmount = 0;
                if (this.hitY < 0.8) {
                    if (this.hitX > 0.1) spinAmount = -1 * Math.random() * (0.75 + 0.25 * this.skillLevel);
                    else if (this.hitX < -0.1) spinAmount = 1 * Math.random() * (0.75 + 0.25 * this.skillLevel);
                }

                if (typeof forcedModeProperties !== 'undefined' && forcedModeProperties?.override?.curve_mode) {
                    let curveStrength = forcedModeProperties.override.curve_strength ?? 1;
                    spinAmount = (2 * Math.random() - 1) * (0.75 + 0.25 * this.skillLevel) * curveStrength;
                }

                let hitSpeed = 0.3 + (0.3 / 0.4) * (this.hitY - 0.6) * (0.25 + 0.75 * this.skillLevel);
                let isSmash = false;

                // Từ Level 2, AI có xác suất tung cú đập thật sự trong rally.
                // Không đập lúc giao bóng, không đập ngay quả đầu và không đập liên tiếp.
                const smashChance = Math.min(0.32, 0.18 + Math.max(0, level - 2) * 0.01);
                const validSmashBall =
                    level >= 2 &&
                    ball.servingState === 2 &&
                    typeof rallyHits !== "undefined" && rallyHits >= 2 &&
                    this.smashCooldownHits <= 0 &&
                    ball.height > 6 &&
                    ballPosY > 0 && ballPosY < 0.5;

                if (validSmashBall && Math.random() < smashChance) {
                    isSmash = true;

                    // Đánh nhanh về một trong hai góc sâu nhưng không sát biên tuyệt đối.
                    const cornerSide = Math.random() < 0.5 ? -1 : 1;
                    this.hitX = cornerSide * (0.55 + Math.random() * 0.27);
                    this.hitY = 0.80 + Math.random() * 0.14;

                    // Level 2 đã đủ vượt ngưỡng powerBall 0.5; tăng rất nhẹ theo Level.
                    hitSpeed = Math.min(0.59, 0.52 + Math.random() * 0.035 + Math.max(0, level - 2) * 0.0015);
                    spinAmount = 0;

                    this.smashCooldownHits = 2 + Math.floor(Math.random() * 2);
                    this.playSmashAnimation(ball.x);
                }

                if (typeof forcedModeProperties !== 'undefined' && forcedModeProperties?.override?.powerhit_mode) {
                    hitSpeed = 0.6;
                    isSmash = true;
                    this.playSmashAnimation(ball.x);
                }

                return { x: this.hitX, y: this.hitY, speed: hitSpeed, spin: spinAmount, isSmash: isSmash };
            }

            render() {
                ctx.save();

                const smashX = this.smashSide * 18 * this.smashSwing;
                const smashY = 16 * this.smashSwing;
                ctx.translate(
                    this.x + (tableTop.offsetX + 0.8 * this.flailIncrement) * tableTop.sideMultiplier + smashX,
                    this.y + smashY
                );
                ctx.rotate(this.rotation + this.smashSide * 0.52 * this.smashSwing);
                ctx.scale(this.scale * (1 + 0.10 * this.smashSwing), this.scale * (1 - 0.07 * this.smashSwing));

                const atlasData = this.gameElementsData.oData.oAtlasData[oImageIds["enemyBat" + this.id]];
                ctx.drawImage(this.gameElementsData.img, atlasData.x, atlasData.y, atlasData.width, atlasData.height, -atlasData.width / 2, -atlasData.height / 3, atlasData.width, atlasData.height);
                ctx.restore();

                if (this.smashFxAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = this.smashFxAlpha;
                    ctx.textAlign = "center";
                    ctx.font = "bold 17px Arial";
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = "rgba(20, 10, 0, 0.75)";
                    ctx.fillStyle = "#ffcf33";
                    ctx.strokeText("SMASH!", this.x, this.y - 50);
                    ctx.fillText("SMASH!", this.x, this.y - 50);
                    ctx.restore();
                }
            }
        }

        // ==========================================
        // 2b. CLASS VỢT REMOTE (REMOTE BAT) — 联机时替换 EnemyBat
        // 位置由网络驱动（对方发来的 userBat 位置镜像后插值），不做任何 AI。
        // ==========================================
        Elements.RemoteBat = class RemoteBat {
            constructor() {
                this.x = canvas.width / 2;
                this.y = canvas.height / 4;
                this.targetX = this.x;
                this.targetY = this.y;
                this.rotation = 0;
                this.scale = 0.4;
                this.id = 0;
                this.flailIncrement = 0;
                // 扣杀动画状态（沿用 EnemyBat 的渲染逻辑）
                this.smashCooldownHits = 0;
                this.smashSwing = 0;
                this.smashFxAlpha = 0;
                this.smashSide = 1;
                this.smashTween = null;
                this.smashFxTween = null;
                this.gameElementsData = assetLib.getData("gameElements");
            }

            // 网络收到对方球拍位置时调用（已镜像到本方视角）
            setNetPos(x, y) {
                if (!isFinite(x) || !isFinite(y)) return;
                this.targetX = x;
                this.targetY = y;
            }

            // 联机时不需要 AI 自动跑位/发球，全部空操作
            resetToCentre() { /* 等待网络发球，不自动 serve */ }
            flail() { /* 可由 net 触发，暂留空 */ }
            setBouncePos() { /* 不本地预测对方走位 */ }
            getHitData() { return { x: 0, y: 0.65, speed: 0.4, spin: 0, isSmash: false }; }

            playSmashAnimation(ballX) {
                if (this.smashTween) this.smashTween.kill();
                if (this.smashFxTween) this.smashFxTween.kill();
                this.smashSide = ballX < this.x ? -1 : 1;
                this.smashSwing = 0;
                this.smashFxAlpha = 1;
                this.smashTween = TweenLite.to(this, 0.075, {
                    smashSwing: 1, ease: "Back.easeOut",
                    onComplete: () => {
                        this.smashTween = TweenLite.to(this, 0.18, { smashSwing: 0, ease: "Quad.easeOut" });
                    }
                });
                this.smashFxTween = TweenLite.to(this, 0.42, { smashFxAlpha: 0, ease: "Quad.easeOut" });
            }

            update() {
                if (window.remix && window.remix.paused) return;
                var k = Math.min(1, delta * 12);
                this.x = isFinite(this.x) ? this.x + (this.targetX - this.x) * k : this.targetX;
                this.y = isFinite(this.y) ? this.y + (this.targetY - this.y) * k : this.targetY;
                this.rotation = (this.x - canvas.width / 2) / 200;
                this.scale = 0.4 + (this.y - canvas.height / 4) / 300;
                this.x = Math.min(Math.max(this.x, canvas.width / 2 - 250), canvas.width / 2 + 250);
            }

            render() {
                ctx.save();
                const smashX = this.smashSide * 18 * this.smashSwing;
                const smashY = 16 * this.smashSwing;
                ctx.translate(
                    this.x + (tableTop.offsetX + 0.8 * this.flailIncrement) * tableTop.sideMultiplier + smashX,
                    this.y + smashY
                );
                ctx.rotate(this.rotation + this.smashSide * 0.52 * this.smashSwing);
                ctx.scale(this.scale * (1 + 0.10 * this.smashSwing), this.scale * (1 - 0.07 * this.smashSwing));
                const atlasData = this.gameElementsData.oData.oAtlasData[oImageIds["enemyBat" + this.id]];
                if (atlasData) {
                    ctx.drawImage(this.gameElementsData.img, atlasData.x, atlasData.y, atlasData.width, atlasData.height, -atlasData.width / 2, -atlasData.height / 3, atlasData.width, atlasData.height);
                }
                ctx.restore();
                if (this.smashFxAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = this.smashFxAlpha;
                    ctx.textAlign = "center";
                    ctx.font = "bold 17px Arial";
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = "rgba(20, 10, 0, 0.75)";
                    ctx.fillStyle = "#ffcf33";
                    ctx.strokeText("SMASH!", this.x, this.y - 50);
                    ctx.fillText("SMASH!", this.x, this.y - 50);
                    ctx.restore();
                }
            }
        }

        // ==========================================
        // 3. CLASS QUẢ BÓNG (BALL & PHYSICS)
        // ==========================================

        // === 联机：发送本地击球到对方 ===
        // 在 setBouncePoint 之后调用，发送击球后的完整球状态，对方直接镜像复制，不重新计算。
        function sendHitToRemote(b, hitData, kind) {
            if (!isOnline || !window.net || !net.connected) return;
            netSeq++;
            net.send({
                t: "hit",
                seq: netSeq,
                kind: kind,
                pt: oGameData.userScore + oGameData.enemyScore,
                serving: b.servingState,
                ball: {
                    px: b.tablePosX, py: b.tablePosY,
                    h: b.height, hInc: b.heightInc,
                    vx: b.tableVX, vy: b.tableVY,
                    tx: b.targBounceX, ty: b.targBounceY,
                    speed: b.speed, spin: b.spin, spinInc: b.spinInc
                },
                isSmash: !!hitData.isSmash
            }, true);
        }

        // === 联机：应用对方发来的击球 ===
        // 对方视角的 user 击球 = 本方视角的 enemy 击球。左右取反、深度 y -> 1-y、旋转取反。
        function applyRemoteHit(msg) {
            if (!ball || gameState !== "game") return;
            // 这一分已经结束（比分对不上）的迟到击球，直接丢弃
            if (msg.pt !== oGameData.userScore + oGameData.enemyScore) return;
            const b = msg.ball;
            if (ball.servePrepTween) ball.servePrepTween.kill();
            ball.awaitingPoint = false;
            ball.tablePosX = -b.px;
            ball.tablePosY = 1 - b.py;
            ball.height = b.h;
            ball.heightInc = b.hInc;
            ball.tableVX = -b.vx;
            ball.tableVY = -b.vy;
            ball.targBounceX = -b.tx;
            ball.targBounceY = 1 - b.ty;
            ball.speed = b.speed;
            ball.spin = -b.spin;
            ball.spinInc = -b.spinInc;
            ball.servingState = msg.serving;
            ball.bounceNum = 0;
            ball.offTable = false;
            ball.offSide = false;
            ball.ballShortState = 0;
            ball.lastHit = "enemy";
            ball.aTrailPoints = [];
            if (msg.kind === "serve") player_serve = false;
            else if (typeof rallyHits !== 'undefined') rallyHits++;

            tableTop.tweenToPos(ball.targBounceX, ball.targBounceY, ball.speed, "enemy", ball.spin);
            playSound(msg.isSmash ? "hit5" : "hit" + Math.floor(6 * Math.random()));
            if (msg.isSmash) enemyBat.playSmashAnimation(ball.x);
            enemy_hitType = msg.isSmash ? "powerBall" : ((ball.spin !== 0) ? "curvedBall" : (ball.speed >= 0.5 ? "powerBall" : ""));
        }

        // === 联机：加入方应用主机的判分 ===
        function applyRemotePoint(msg) {
            if (!ball || gameState !== "game") return;
            var localWinner = msg.winner === "user" ? "enemy" : "user";
            oGameData.userScore = msg.enemyScore;
            oGameData.enemyScore = msg.userScore;
            panel.cardTween(localWinner);
            playSound(localWinner === "user" ? "userPoint" : "enemyPoint");
            if (localWinner === "user") totalScore++;

            var target = 11;
            var mine = oGameData.userScore, theirs = oGameData.enemyScore;
            if ((mine >= target && theirs <= mine - 2) || (theirs >= target && mine <= theirs - 2)) {
                initGameComplete();
                return;
            }
            ball.resetServe(msg.hostServes ? "enemy" : "user");
        }

        Elements.Ball = class Ball {
            constructor() {
                this.x = 0;
                this.y = 0;
                this.height = 0;
                this.tablePosY = 0.5;
                this.tablePosX = 0;
                this.scale = 0;
                this.lastHit = "user";

                // Vận tốc và xoáy
                this.speed = 0.45;
                this.spin = 0;
                this.spinInc = 0;

                // Trạng thái bóng
                this.offTable = false;
                this.pause = false;
                this.servingState = 0;
                this.canHit = false;
                this.serveFlip = true;
                this.offSide = false;
                this.bounceX = 0;
                this.bounceY = 0;
                this.ballShortState = 0;

                this.gameElementsData = assetLib.getData("gameElements");
                this.resetServe("user");
            }

            resetServe(hitter) {
                this.awaitingPoint = false;
                this.servingState = 0;
                this.canHit = false;
                enemyBat.resetToCentre();

                tableTop.tweenToPos(0, 1, this.speed, this.lastHit, this.spin);
                this.lastHit = hitter;

                // Cập nhật lại các biến theo sát logic gốc
                if (typeof rallyHits !== 'undefined') rallyHits = 0;
                this.x = -100;
                this.bounceNum = 0;
                this.ballShortState = 0;
                this.offTable = false;
                this.offSide = false;

                this.speed = 0.45;
                this.spin = 0;
                this.spinInc = 0;

                if (this.lastHit === "user") {
                    this.tablePosX = 0;
                    this.tablePosY = 0.9;
                    this.height = 25;
                    this.heightInc = 0;
                    this.aTrailPoints = [];
                    this.tableVX = 0;
                    this.tableVY = 0;
                    player_serve = true;
                } else {
                    this.tablePosX = 0;
                    this.tablePosY = 0.2;
                    this.height = 15;
                    this.heightInc = 0;
                    this.aTrailPoints = [];
                }

                this.servePosInc = 0;
                this.servePrepTween = TweenLite.to(this, 0.5, {
                    servePosInc: 1,
                    ease: "Quad.easeOut",
                    onComplete: () => {
                        this.canHit = true;
                    }
                });
            }

            enemyServe() {
                this.setBouncePoint(enemyBat.getHitData(this.tablePosX, this.tablePosY));
            }

            setBouncePoint(hitData) {
                this.spin = hitData.spin;
                this.spinInc = 0;

                if (this.lastHit === "enemy") {
                    this.targBounceX = hitData.x;
                    this.targBounceY = hitData.y;
                    this.speed = hitData.speed;

                    tableTop.tweenToPos(this.targBounceX, this.targBounceY, this.speed, this.lastHit, this.spin);

                    if (this.servingState === 0) {
                        this.servingState = 1;
                        this.heightInc = -(6 * this.height - 2400) * (0.8 - this.speed) * 1.2;
                        this.speed = (this.speed - 0.3) / 4 + 0.3;
                    } else {
                        this.heightInc = (6 * this.height - 2400) * (0.8 - this.speed);
                    }
                } else {
                    this.targBounceX = hitData.x;
                    this.targBounceY = hitData.y;
                    this.speed = hitData.speed;

                    if (this.servingState === 0) {
                        this.servingState = 1;
                        player_serve = false;
                        this.heightInc = -(6 * this.height - 2400) * (0.8 - this.speed) * 1.2;
                        this.speed = (this.speed - 0.3) / 6 + 0.3;
                    } else {
                        this.heightInc = (6 * this.height - 2400) * (0.8 - this.speed);
                    }

                    tableTop.tweenToPos(0, 1, this.speed, this.lastHit, this.spin);
                    enemyBat.setBouncePos(this.targBounceX, this.targBounceY, this.spin);
                }

                this.tableVX = (this.targBounceX - this.tablePosX) / (1.1 * (1 - this.speed));
                this.tableVY = (this.targBounceY - this.tablePosY) / (1.1 * (1 - this.speed));
            }

            // 一分结束。联机时由主机判分并指定下一球发球方，加入方等待主机的 point 消息。
            endPoint(winner) {
                if (isOnline && !net.isHost) {
                    this.awaitingPoint = true;
                    return;
                }
                updateScore(winner);
                if ((oGameData.userScore + oGameData.enemyScore) % 2 === 0 || (oGameData.userScore >= 10 && oGameData.enemyScore >= 10)) {
                    this.serveFlip = !this.serveFlip;
                }
                if (isOnline) {
                    net.send({
                        t: "point", winner: winner,
                        userScore: oGameData.userScore, enemyScore: oGameData.enemyScore,
                        hostServes: this.serveFlip
                    }, true);
                }
                if (gameState !== "game") return;
                this.serveFlip ? this.resetServe("user") : this.resetServe("enemy");
            }

            update() {
                if (window.remix && window.remix.paused) return;
                if (this.awaitingPoint) return;

                // Trạng thái chuẩn bị giao bóng
                if (this.servingState === 0) {
                    if (this.lastHit === "user") {
                        this.y = (canvas.height / 4) + 50 * tableTop.offsetY + (this.tablePosY * this.tablePosY * 235) * (1 + tableTop.offsetY / 2) + 100 * (1 - this.servePosInc);
                        this.tablePosX = Math.min(Math.max((userBat.x - canvas.width / 2) / 300, -0.95), 0.95);
                        this.x = (canvas.width / 2) + ((this.y - canvas.height / 4) * (tableTop.offsetX + 0.6 * this.tablePosX) * 1.28 * (1 + tableTop.offsetY / 2)) + (233 * this.tablePosX) / 2 + tableTop.offsetX * tableTop.sideMultiplier - 500 * (1 - this.servePosInc);
                        this.scale = 0.27 + (this.y - canvas.height / 4) / 600;

                        // Check user hit serve
                        if (this.canHit) {
                            const hitData = userBat.getHitData(this.tablePosX, this.tablePosY);
                            if (hitData.y < 0.4 &&
                                userBat.x > this.x - 80 * userBat.scale &&
                                userBat.x < this.x + 80 * userBat.scale &&
                                userBat.y > this.y - this.height * (3 * this.scale) - 16 - 80 * userBat.scale &&
                                userBat.y < this.y - this.height * (3 * this.scale) - 16 + 80 * userBat.scale) {

                                this.bounceNum = 0;
                                this.lastHit = "user";
                                this.setBouncePoint(hitData);
                                sendHitToRemote(this, hitData, "serve");
                            }
                        }
                    } else {
                        this.y = (canvas.height / 4) + 50 * tableTop.offsetY + (this.tablePosY * this.tablePosY * 235) * (1 + tableTop.offsetY / 2) + 100 * (1 - this.servePosInc);
                        this.tablePosX = 0;
                        this.x = (canvas.width / 2) + ((this.y - canvas.height / 4) * (tableTop.offsetX + 0.6 * this.tablePosX) * 1.28 * (1 + tableTop.offsetY / 2)) + (233 * this.tablePosX) / 2 + tableTop.offsetX * tableTop.sideMultiplier - 500 * (1 - this.servePosInc);
                        this.scale = 0.27 + (this.y - canvas.height / 4) / 600;
                    }
                }
                // Trạng thái bóng đang bay
                else {
                    if (!this.offTable) {
                        if (this.lastHit === "user") {
                            this.spinInc = Math.min(Math.max(this.spinInc + Math.pow(2.5 * this.spin, 3) * delta * (1 - this.tablePosY), -3), 3);
                        } else if (isOnline) {
                            // 对方击出的球必须和对方本地算的完全一致，所以用镜像后的同一公式
                            this.spinInc = Math.min(Math.max(this.spinInc + Math.pow(2.5 * this.spin, 3) * delta * this.tablePosY, -3), 3);
                        } else {
                            this.spinInc = Math.min(Math.max(this.spinInc + Math.pow(2 * this.spin, 3) * delta * this.tablePosY, -2), 2);
                        }
                        this.tablePosX += (this.tableVX + this.spinInc) * delta;
                        this.tablePosY += this.tableVY * delta;
                    }

                    // Bóng bay ra ngoài lưới / qua người
                    if (!this.offTable && this.lastHit === "user" && this.tablePosY < 0) {
                        this.offTable = true;
                        if (this.aTrailPoints.length > 0) {
                            this.offTableVX = 10 * (this.x - this.aTrailPoints[0].x);
                            this.offTableVY = 10 * (this.y - this.aTrailPoints[0].y);
                        } else {
                            this.offTableVX = 0;
                            this.offTableVY = 0;
                        }
                        if (this.offTableTween) this.offTableTween.kill();
                        this.offTableTween = TweenLite.to(this, 2, { offTableVX: 0, offTableVY: 0, ease: "Quad.easeOut" });
                        enemyBat.flail();
                    }

                    // Trọng lực và nảy
                    this.heightInc += 3800 * delta;
                    this.height -= this.heightInc * this.speed * delta;

                    // Đập lưới
                    if (this.ballShortState === 1 && this.tablePosY <= 0.5) {
                        playSound("hitNet");
                        this.tableVY *= -0.5;
                        this.tableVX *= 0.5;
                        this.ballShortState = 2;
                        this.heightInc *= 0.2;
                    }

                    // Chạm mặt bàn
                    if (this.tablePosX > -1 && this.tablePosX < 1 && this.tablePosY > 0 && this.tablePosY < 1 && this.height <= 0 && !this.offSide) {
                        if (this.ballShortState === 0) {
                            this.height = 0;
                            this.heightInc *= -0.85;
                            playSound("bounce" + Math.floor(6 * Math.random()));
                        } else {
                            this.height = -3;
                        }

                        this.bounceNum++;
                        this.bounceX = this.tablePosX;
                        this.bounceY = this.tablePosY;
                        tableTop.bounce();

                        if (this.lastHit === "user" && this.tablePosY > 0.5 && this.servingState > 1) {
                            this.spin = 0;
                            this.ballShortState = 1;
                        }
                    } else if ((this.tablePosX < -1 || this.tablePosX > 1) && !this.offTable && this.tablePosY < 1 && this.height <= 0) {
                        this.offSide = true;
                    }

                    // Tính điểm nếu rớt ra ngoài
                    if ((this.offTable || this.offSide) && this.height <= -200) {
                        if (this.lastHit === "user") {
                            this.endPoint(this.bounceNum === 0 ? "enemy" : "user");
                        } else {
                            this.endPoint(this.bounceNum === 0 ? "user" : "enemy");
                        }
                        return;
                    }

                    // Tính toán vị trí bóng trên màn hình (Projection)
                    if (this.offTable) {
                        this.x += this.offTableVX * delta;
                        this.y += this.offTableVY * delta;
                    } else {
                        this.y = (canvas.height / 4) + 50 * tableTop.offsetY + (this.tablePosY * this.tablePosY * 235) * (1 + tableTop.offsetY / 2);
                        this.x = (canvas.width / 2) + ((this.y - canvas.height / 4) * (tableTop.offsetX + 0.6 * this.tablePosX) * 1.28 * (1 + tableTop.offsetY / 2)) + (233 * this.tablePosX) / 2 + tableTop.offsetX * tableTop.sideMultiplier;
                    }

                    this.scale = 0.27 + (this.y - canvas.height / 4) / 600;

                    // Vẽ Trail (Vệt bóng)
                    this.aTrailPoints.push({ x: this.x, y: this.y, height: this.height, scale: this.scale });
                    if (this.aTrailPoints.length > 5) this.aTrailPoints.shift();

                    // Rơi xuống đất
                    if (this.y > canvas.height) {
                        this.endPoint((this.bounceNum > 0 || this.ballShortState > 0) ? "enemy" : "user");
                        return;
                    }

                    // KẺ ĐỊCH ĐÁNH TRẢ (Enemy Hit Detection) — 本地玩家回球
                    if (this.lastHit === "enemy" && ((this.servingState === 2 && this.bounceNum === 1) || (this.servingState === 1 && this.bounceNum === 2)) && !(this.height < 0 && this.bounceNum === 0) && this.tablePosY > 0.5) {
                        if (userBat.x > this.x - 82 * userBat.scale && userBat.x < this.x + 82 * userBat.scale &&
                            userBat.y > this.y - this.height * (3 * this.scale) - 16 - 82 * userBat.scale &&
                            userBat.y < this.y - this.height * (3 * this.scale) - 16 + 82 * userBat.scale) {

                            playSound("hit" + Math.floor(6 * Math.random()));
                            if (typeof rallyHits !== 'undefined') rallyHits++;

                            this.servingState = 2;
                            this.bounceNum = 0;
                            this.lastHit = "user";

                            const hitData = userBat.getHitData(this.tablePosX, this.tablePosY);
                            this.setBouncePoint(hitData);
                            sendHitToRemote(this, hitData, "rally");

                            player_hitType = (hitData.spin !== 0) ? "curvedBall" : (hitData.speed >= 0.5 ? "powerBall" : "");
                        }
                    }

                    // NGƯỜI CHƠI ĐÁNH TRẢ (User Hit Detection) — 对方回球
                    // 联机时：不在本地判定对方击球，改由网络消息驱动（见 applyRemoteHit）。
                    if (!isOnline && this.lastHit === "user" && ((this.servingState === 2 && this.bounceNum === 1) || (this.servingState === 1 && this.bounceNum === 2)) && this.tablePosY < 0.5 && this.tablePosY > 0) {
                        if (enemyBat.x > this.x - 70 * enemyBat.scale && enemyBat.x < this.x + 70 * enemyBat.scale &&
                            enemyBat.y > this.y - this.height * (3 * this.scale) - 16 - 70 * enemyBat.scale &&
                            enemyBat.y < this.y - this.height * (3 * this.scale) - 16 + 70 * enemyBat.scale) {

                            if (typeof rallyHits !== 'undefined') rallyHits++;

                            this.servingState = 2;
                            this.bounceNum = 0;
                            this.lastHit = "enemy";

                            const hitData = enemyBat.getHitData(this.tablePosX, this.tablePosY);
                            playSound(hitData.isSmash ? "hit5" : "hit" + Math.floor(6 * Math.random()));
                            this.setBouncePoint(hitData);

                            enemy_hitType = hitData.isSmash ? "powerBall" : ((hitData.spin !== 0) ? "curvedBall" : (hitData.speed >= 0.5 ? "powerBall" : ""));
                        }
                    }
                }
            }

            render() {
                const shadowAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.ballShadow];
                const ballAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.ball];

                // Vẽ Bóng Đổ (Shadow)
                if (this.tablePosX > -1 && this.tablePosX < 1 && this.tablePosY > 0 && this.tablePosY < 1) {
                    ctx.drawImage(this.gameElementsData.img, shadowAtlas.x, shadowAtlas.y, shadowAtlas.width, shadowAtlas.height,
                        this.x - (shadowAtlas.width / 2) * this.scale,
                        this.y - (shadowAtlas.height / 2) * this.scale,
                        shadowAtlas.width * this.scale,
                        shadowAtlas.height * this.scale);
                }

                // Vẽ Vệt mờ đằng sau bóng (Trail) - Kẻ địch đánh
                if (this.lastHit === "enemy" && this.ballShortState === 0) this.renderTrail();

                // Vẽ Bóng
                ctx.drawImage(this.gameElementsData.img, ballAtlas.x, ballAtlas.y, ballAtlas.width, ballAtlas.height,
                    this.x - (ballAtlas.width / 2) * this.scale,
                    this.y - (ballAtlas.height / 2) * this.scale - this.height * (3 * this.scale) - 16,
                    ballAtlas.width * this.scale,
                    ballAtlas.height * this.scale);

                // Vẽ Vệt mờ đằng sau bóng (Trail) - Người chơi đánh
                if (this.lastHit === "user" && this.ballShortState === 0) this.renderTrail();
            };

            renderTrail() {
                const trailCount = Math.floor((this.aTrailPoints.length / 0.3) * (Math.max(Math.min(this.speed, 0.6), 0.3) - 0.3));
                for (let i = 0; i < trailCount; i++) {
                    const pointIdx = this.aTrailPoints.length - trailCount + i;
                    if (pointIdx < 0 || pointIdx > this.aTrailPoints.length - 1) continue;

                    const trailAtlas = this.gameElementsData.oData.oAtlasData[oImageIds["ballTrail" + pointIdx]];
                    const pt = this.aTrailPoints[pointIdx];

                    ctx.drawImage(this.gameElementsData.img, trailAtlas.x, trailAtlas.y, trailAtlas.width, trailAtlas.height,
                        pt.x - (trailAtlas.width / 2) * pt.scale,
                        pt.y - (trailAtlas.height / 2) * pt.scale - pt.height * (3 * pt.scale) - 16,
                        trailAtlas.width * pt.scale,
                        trailAtlas.height * pt.scale);
                }
            }
        }

        // ==========================================
        // 4. CLASS BÀN BÓNG BÀN (TABLE TOP)
        // ==========================================
        Elements.TableTop = class TableTop {
            constructor() {
                this.segs = isMobile ? 75 : 150;
                this.offsetX = 0;
                this.offsetY = 0;
                this.netY = 0;
                this.netHeight = 0;
                this.id = 0;
                this.sideMultiplier = 100;
                this.bounceMarkScale = 0;

                this.gameElementsData = assetLib.getData("gameElements");
                this.shadowData = assetLib.getData("shadow");
            }

            bounce() {
                this.bounceMarkScale = 1;
                TweenLite.to(this, 0.3, {
                    bounceMarkScale: 0,
                    ease: "Quad.easeIn"
                });
            }

            tweenToPos(targetX, targetY, speed, lastHit, spin) {
                if (this.offsetTween) this.offsetTween.kill();

                let newOffsetX = 0;
                let newOffsetY = 0;

                if (targetX > 0.3 || targetX < -0.3) {
                    newOffsetX = -targetX / 1.75 - spin / 2;
                }

                let duration = 0.5;
                if (lastHit === "enemy") {
                    duration = 0.5;
                    newOffsetY = ((1 - 2 * (targetY - 0.5)) * (0.3 - (speed - 0.3))) / 0.3;
                }

                this.offsetTween = TweenLite.to(this, duration, {
                    offsetX: newOffsetX,
                    offsetY: newOffsetY,
                    ease: "Quad.easeOut"
                });
            }

            render() {
                // 1. Tính toán chiều cao và vị trí của lưới (Net)
                const netAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.net];
                const tableAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.table0];

                this.netHeight = netAtlas.height * (1 + this.offsetY / 3);
                this.netY = (canvas.height / 4) - netAtlas.height +
                    (tableAtlas.height / this.segs) * (0.282 * this.segs) * (1 + this.offsetY / 3) +
                    (50 * this.offsetY);

                // 2. Vẽ bộ gá lưới (Table Clip)
                const clipAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.tableClip];
                if (clipAtlas) {
                    const clipX = (canvas.width / 2) - (clipAtlas.width / 2) * (1 + this.offsetY / 3) + this.offsetX * (0.282 * this.segs) * 3 * (1 + this.offsetY / 3) + this.offsetX * this.sideMultiplier;
                    const clipY = this.netY + this.netHeight - 3 * (1 + this.offsetY / 3);
                    ctx.drawImage(
                        this.gameElementsData.img, clipAtlas.x, clipAtlas.y, clipAtlas.width, clipAtlas.height,
                        clipX, clipY, clipAtlas.width * (1 + this.offsetY / 3), clipAtlas.height * (1 + this.offsetY / 3)
                    );
                }

                // 3. Vẽ Bóng đổ dưới sàn (Shadow)
                ctx.drawImage(
                    this.shadowData.img, 0, 0, this.shadowData.img.width, this.shadowData.img.height,
                    (canvas.width / 2) - (this.shadowData.img.width / 2) * (1 + this.offsetY / 3) + (100 * this.offsetX * 2.3) * (1 + this.offsetY / 3) + this.offsetX * this.sideMultiplier,
                    (canvas.height / 4) + tableAtlas.height * (1 + this.offsetY / 3.5) + 50 * this.offsetY - 80,
                    this.shadowData.img.width * (1 + this.offsetY / 3),
                    this.shadowData.img.height * (1 + this.offsetY / 3)
                );

                // ==========================================
                // 4. VẼ 2 CHÂN BÀN (ĐÃ FIX LỖI VĂNG KHỎI MÀN HÌNH)
                // ==========================================
                const tableScale = 1 + this.offsetY / 3;
                const centerX = (canvas.width / 2) + 100 * this.offsetX * 2.3 * tableScale + this.offsetX * this.sideMultiplier;

                // Ép chân bàn mọc ra từ vị trí 75% chiều dài của bàn (tránh bị mặt bàn che khuất)
                const legsY = (canvas.height / 4) + tableAtlas.height * 0.75 * (1 + this.offsetY / 2) + 50 * this.offsetY;

                // FIX QUAN TRỌNG: Khoảng cách chân bàn = 38% độ rộng mặt bàn. Không bao giờ bị văng ra ngoài.
                const legDist = tableAtlas.width * 0.38 * tableScale;

                // Phóng to nhẹ chân bàn để nhìn rõ hơn
                const drawW = 33 * tableScale * 1.2;
                const drawH = 160 * tableScale * 1.5; // Kéo dài để chạm đất

                const leftX = centerX - legDist - drawW / 2;
                const rightX = centerX + legDist - drawW / 2;


                // Vẽ ảnh chân trái từ JSON
                ctx.drawImage(this.gameElementsData.img, 1228, 657, 33, 160, leftX, legsY, drawW, drawH);

                // Vẽ ảnh chân phải từ JSON
                ctx.drawImage(this.gameElementsData.img, 1629, 657, 33, 160, rightX, legsY, drawW, drawH);

                // 5. Vẽ Mặt bàn (Slices 3D - Phải vẽ SAU để đè lên gốc chân bàn)
                const tableData = this.gameElementsData.oData.oAtlasData[oImageIds["table" + this.id]];
                const sliceHeight = tableData.height / this.segs;

                for (let i = 0; i < this.segs; i++) {
                    ctx.drawImage(
                        this.gameElementsData.img,
                        tableData.x, tableData.y + sliceHeight * i, tableData.width, sliceHeight,
                        (canvas.width / 2) - (tableData.width / 2) * (1 + this.offsetY / 3) + this.offsetX * (i * (100 / this.segs)) * 3 * (1 + this.offsetY / 3) + this.offsetX * this.sideMultiplier,
                        (canvas.height / 4) + sliceHeight * i * (1 + this.offsetY / 2) + 50 * this.offsetY,
                        tableData.width * (1 + this.offsetY / 3),
                        sliceHeight * (1 + this.offsetY / 2)
                    );
                }

                // 6. Vẽ Viền mép bàn (Edge)
                const edgeAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.tableEdge];
                ctx.drawImage(
                    this.gameElementsData.img,
                    edgeAtlas.x, edgeAtlas.y, edgeAtlas.width, edgeAtlas.height,
                    (canvas.width / 2) - (edgeAtlas.width / 2) * (1 + this.offsetY / 3) + 100 * this.offsetX * 3 * (1 + this.offsetY / 3) + this.offsetX * this.sideMultiplier,
                    (canvas.height / 4) + tableAtlas.height * (1 + this.offsetY / 2) + 50 * this.offsetY,
                    edgeAtlas.width * (1 + this.offsetY / 3),
                    edgeAtlas.height * (1 + this.offsetY / 3)
                );

                // 7. Vẽ Vết bóng nảy trên bàn (Bounce Mark)
                if (this.bounceMarkScale > 0) {
                    const markAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.bounceMark];
                    const markY = (canvas.height / 4) + 50 * this.offsetY + ball.bounceY * ball.bounceY * 235 * (1 + this.offsetY / 2);
                    const markX = (canvas.width / 2) + (markY - canvas.height / 4) * (this.offsetX + 0.6 * ball.bounceX) * 1.28 * (1 + this.offsetY / 2) + (233 * ball.bounceX) / 2 + this.offsetX * this.sideMultiplier;
                    const markScale = 0.27 + (markY - canvas.height / 4) / 600;

                    ctx.drawImage(
                        this.gameElementsData.img, markAtlas.x, markAtlas.y, markAtlas.width, markAtlas.height,
                        markX - (markAtlas.width / 2) * (markScale * this.bounceMarkScale),
                        markY - (markAtlas.height / 2) * (markScale * this.bounceMarkScale),
                        markAtlas.width * (markScale * this.bounceMarkScale),
                        markAtlas.height * (markScale * this.bounceMarkScale)
                    );
                }
            }

            renderNet() {
                const netAtlas = this.gameElementsData.oData.oAtlasData[oImageIds.net];
                ctx.drawImage(
                    this.gameElementsData.img,
                    netAtlas.x, netAtlas.y, netAtlas.width, netAtlas.height,
                    (canvas.width / 2) - (netAtlas.width / 2) * (1 + this.offsetY / 3) + this.offsetX * (0.282 * this.segs) * 3 * (1 + this.offsetY / 3) + this.offsetX * this.sideMultiplier,
                    this.netY,
                    netAtlas.width * (1 + this.offsetY / 3),
                    this.netHeight
                );
            }
        }; // <==== ĐÃ CÓ CHẤM PHẨY BẢO VỆ Ở ĐÂY
        Utils.TextDisplay = class TextDisplay {
            constructor() {
                this.oTextData = {};
                this.inc = 0;
                this.createTextObjects();
            }

            createTextObjects() {
                for (var t in assetLib.textData.langText.text[curLang]) {
                    this.oTextData[t] = {};
                    this.oTextData[t].aLineData = this.getCharData(
                        assetLib.textData.langText.text[curLang][t]["@text"],
                        assetLib.textData.langText.text[curLang][t]["@fontId"]
                    );
                    this.oTextData[t].aLineWidths = this.getLineWidths(this.oTextData[t].aLineData);
                    this.oTextData[t].blockWidth = this.getBlockWidth(this.oTextData[t].aLineData);
                    this.oTextData[t].blockHeight = this.getBlockHeight(
                        this.oTextData[t].aLineData,
                        assetLib.textData.langText.text[curLang][t]["@fontId"]
                    );
                    this.oTextData[t].lineHeight = parseInt(
                        assetLib.textData["fontData" + assetLib.textData.langText.text[curLang][t]["@fontId"]].text.common["@lineHeight"]
                    );
                    this.oTextData[t].oFontImgData = assetLib.getData(
                        "font" + assetLib.textData.langText.text[curLang][t]["@fontId"]
                    );
                }
            }

            getLineWidths(t) {
                var a = [];
                for (var i = 0; i < t.length; i++) {
                    var e = 0;
                    for (var s = 0; s < t[i].length; s++) {
                        e += parseInt(t[i][s]["@xadvance"]);
                        if (s === 0) e -= parseInt(t[i][s]["@xoffset"]);
                        else if (s === t[i].length - 1) e += parseInt(t[i][s]["@xoffset"]);
                    }
                    a.push(e);
                }
                return a;
            }

            getBlockWidth(t) {
                var a = 0;
                for (var i = 0; i < t.length; i++) {
                    var e = 0;
                    for (var s = 0; s < t[i].length; s++) {
                        e += parseInt(t[i][s]["@xadvance"]);
                        if (s === 0) e -= parseInt(t[i][s]["@xoffset"]);
                        else if (s === t[i].length - 1) e += parseInt(t[i][s]["@xoffset"]);
                    }
                    if (e > a) a = e;
                }
                return a;
            }

            getBlockHeight(t, e) {
                return t.length * parseInt(assetLib.textData["fontData" + e].text.common["@lineHeight"]);
            }

            getCharData(t, e) {
                var a = [];
                for (var i = 0; i < t.length; i++) {
                    a[i] = [];
                    for (var s = 0; s < t[i].length; s++) {
                        for (var o = 0; o < assetLib.textData["fontData" + e].text.chars.char.length; o++) {
                            if (t[i][s].charCodeAt() === assetLib.textData["fontData" + e].text.chars.char[o]["@id"]) {
                                a[i].push(assetLib.textData["fontData" + e].text.chars.char[o]);
                            }
                        }
                    }
                }
                return a;
            }

            renderText(t) {
                var e;
                var a = this.oTextData[t.text].aLineData;
                var i = this.oTextData[t.text].oFontImgData;
                var s = 0, o = 0, r = 0, n = 1, h = 0;
                if (t.lineOffsetY) r = t.lineOffsetY;
                if (t.scale) n = t.scale;
                var l = 1 * n;
                if (t.maxWidth && this.oTextData[t.text].blockWidth * n > t.maxWidth) {
                    l = t.maxWidth / this.oTextData[t.text].blockWidth;
                }
                if (t.anim) this.inc += 7 * delta;

                for (var u = 0; u < a.length; u++) {
                    e = 0;
                    if (t.alignX === "centre") s = this.oTextData[t.text].aLineWidths[u] / 2;
                    if (t.alignY === "centre") o = this.oTextData[t.text].blockHeight / 2 + (r * (a.length - 1)) / 2;
                    for (var m = 0; m < a[u].length; m++) {
                        var d = a[u][m]["@x"],
                            c = a[u][m]["@y"],
                            g = a[u][m]["@width"],
                            p = a[u][m]["@height"];
                        if (t.anim) h = Math.sin(this.inc + m / 2) * ((p / 15) * l);
                        ctx.drawImage(
                            i.img, d, c, g, p,
                            t.x + (e + parseInt(a[u][m]["@xoffset"]) - s) * l,
                            t.y + (parseInt(a[u][m]["@yoffset"]) + u * this.oTextData[t.text].lineHeight + u * r - o) * l + h,
                            g * l, p * l
                        );
                        e += parseInt(a[u][m]["@xadvance"]);
                    }
                }
            }
        };

        Utils.CountryFlags = class CountryFlags {
            constructor(t, e = false) {
                this.aAllCountryCodes = {
                    0: "ES", 1: "AU", 2: "AT", 3: "AG", 4: "AR", 5: "AM", 6: "BO", 7: "BQ", 8: "BA", 9: "TL", 10: "VN",
                    11: "GA", 12: "PT", 13: "AZ", 14: "MX", 15: "AW", 16: "BS", 17: "BD", 18: "BW", 19: "BR", 20: "BN",
                    21: "HW", 22: "GY", 23: "GM", 24: "AX", 25: "AL", 26: "DZ", 27: "BB", 28: "BH", 29: "BY", 30: "BF",
                    31: "BI", 32: "VU", 33: "GH", 34: "GP", 35: "GN", 36: "AI", 37: "AO", 38: "AD", 39: "BE", 40: "BJ",
                    41: "BG", 42: "GB", 43: "HU", 44: "VE", 45: "GN", 46: "GW", 47: "DE", 48: "ZW", 49: "IL", 50: "IN",
                    51: "KZ", 52: "CM", 53: "CA", 54: "CO", 55: "KM", 56: "CD", 57: "CW", 58: "LA", 59: "LV", 60: "ID",
                    61: "JO", 62: "IQ", 63: "QA", 64: "KE", 65: "CY", 66: "CG", 67: "KP", 68: "KR", 69: "LS", 70: "LR",
                    71: "LB", 72: "IR", 73: "IE", 74: "IS", 75: "EG", 76: "KG", 77: "KI", 78: "TW", 79: "CR", 80: "CI",
                    81: "LY", 82: "LT", 83: "LI", 84: "IT", 85: "YE", 86: "", 87: "CN", 88: "", 89: "CC", 90: "CU",
                    91: "KW", 92: "CK", 93: "LU", 94: "MU", 95: "MR", 96: "MH", 97: "FM", 98: "MZ", 99: "IM", 100: "",
                    101: "NA", 102: "NR", 103: "NE", 104: "NG", 105: "NL", 106: "NU", 107: "NZ", 108: "", 109: "PR", 110: "CX",
                    111: "SC", 112: "SN", 113: "MF", 114: "SB", 115: "SO", 116: "SD", 117: "TV", 118: "TN", 119: "TR", 120: "RU",
                    121: "RW", 122: "RO", 123: "VC", 124: "KN", 125: "LC", 126: "SR", 127: "SL", 128: "TJ", 129: "UZ", 130: "UA",
                    131: "UY", 132: "", 133: "WS", 134: "ST", 135: "MN", 136: "", 137: "SY", 138: "TH", 139: "TZ", 140: "TG",
                    141: "FO", 142: "PH", 143: "FI", 144: "SA", 145: "", 146: "SZ", 147: "SK", 148: "SI", 149: "US", 150: "TK",
                    151: "TO", 152: "TT", 153: "FR", 154: "CF", 155: "TD", 156: "GG", 157: "GI", 158: "HN", 159: "CZ", 160: "CL",
                    161: "CH", 162: "MG", 163: "MO", 164: "MK", 165: "MM", 166: "MC", 167: "", 168: "HK", 169: "GD", 170: "GL",
                    171: "SE", 172: "ER", 173: "EE", 174: "MW", 175: "MY", 176: "ML", 177: "NC", 178: "NO", 179: "NF", 180: "GR",
                    181: "GE", 182: "DK", 183: "ET", 184: "", 185: "ZA", 186: "MV", 187: "MT", 188: "MA", 189: "AE", 190: "PK",
                    191: "PW", 192: "", 193: "DM", 194: "ZM", 195: "SS", 196: "JM", 197: "JP", 198: "PE", 199: "PF", 200: "PL",
                    201: "PS", 202: "GU", 203: "PG"
                };
                this.aIds = [];
                if (!t || t.length === 0) {
                    for (let key in this.aAllCountryCodes) {
                        let iso = this.aAllCountryCodes[key];
                        if (iso && iso !== "" && iso !== "NA") {
                            this.aIds.push(parseInt(key));
                        }
                    }
                } else {
                    for (let a = 0; a < t.length; a++) this.aIds.push(this.getIdFromISO(t[a]));
                }
                if (e) this.aIds = this.randomise(this.aIds);
            }

            getIdFromISO(t) {
                let e = 0;
                for (let a in this.aAllCountryCodes) {
                    if (this.aAllCountryCodes[a] == t) break;
                    e++;
                }
                return e;
            }

            getBData(t) {
                return {
                    bX: (t % 12) * 124 + 30.5,
                    bY: 85.5 * Math.floor(t / 12) + 14,
                    bWidth: 85.5,
                    bHeight: 59
                };
            }

            randomise(t) {
                for (let e = t.length - 1; e > 0; e--) {
                    let a = Math.floor(Math.random() * (e + 1));
                    let i = t[e];
                    t[e] = t[a];
                    t[a] = i;
                }
                return t;
            }
        };

        Utils.SaveDataHandler = class SaveDataHandler {
            constructor(t) {
                this.dataGroupNum = 2;
                this.saveDataId = t;
                this.clearData();
                this.setInitialData();
            }
            clearData() {
                this.state = { cupId: 0, gameId: 0, userId: 1234, controlState: 0 };
            }
            resetData() {
                this.clearData();
                return this.saveData();
            }
            setInitialData() {
                this.clearData();
            }
            getUserId() { return this.state.userId; }
            getControlState() { return this.state.controlState; }
            setUserId(t) { this.state.userId = t; }
            setControlState(t) {
                this.state.controlState = t;
                return t;
            }
            getCurCupId() { return this.state.cupId; }
            getCurGameId() { return this.state.gameId; }
            setGameData(t) {
                this.state.cupId = Math.max(0, Number(t && t.cupId) || 0);
                this.state.gameId = Math.max(0, Number(t && t.gameId) || 0);
            }
            saveData() {
                return {
                    cupId: this.state.cupId,
                    gameId: this.state.gameId,
                    userId: this.state.userId,
                    controlState: this.state.controlState
                };
            }
        };
        var previousTime;
        var canvasX;
        var canvasY;
        var canvasScale;
        var sound;
        var music;
        var assetLib;
        var preAssetLib;
        var delta;

        // Named fallback function instead of anonymous injection
        function fallbackAnimFrame(t) {
            window.setTimeout(t, 1000 / 60, new Date().getTime());
        }

        var requestAnimFrame =
            window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            window.msRequestAnimationFrame ||
            fallbackAnimFrame;

        var canvas = document.getElementById("canvas");
        var ctx = canvas.getContext("2d");
        var minSquareSize = 600;
        var maxSquareSize = 1000;
        var div = document.getElementById("canvas-wrapper");
        var audioType = 0;
        var muted = false;
        var splashTimer = 0;
        var musicSeekPos = 0;
        var isMobile = false;
        var gameState = "loading";
        var aLangs = ["EN"];
        var curLang = "";
        var isBugBrowser = false;
        var isIE10 = false;
        var radian = Math.PI / 180;
        var ios9FirstTouch = false;
        var saveDataHandler = new Utils.SaveDataHandler("tabletennisv3");
        var hasFocus = true;

        if (navigator.userAgent.match(/MSIE\s([\d]+)/)) {
            isIE10 = true;
        }

        // --- BIẾN QUẢN LÝ CUỘN & CLICK ---
        var scrollY = 0;
        var targetScrollY = 0;
        var isDragging = false; // Đang thực sự kéo (di chuyển > 5px)
        var isMouseDown = false; // Trạng thái chuột đang nhấn xuống
        var startDragY = 0; // Vị trí bắt đầu kéo
        var clickStartY = 0; // Vị trí Y lúc bắt đầu nhấn (để check click)
        var startScrollY = 0;
        var totalContentHeight = 0;

        // --- CẬP NHẬT: LOGIC CHECK MOBILE CHUẨN (DỰA TRÊN CẢM ỨNG) ---

        // 1. Kiểm tra kiểu thiết bị theo input thực tế
        // Ưu tiên nhận diện desktop/laptop có chuột, tránh false-positive trên Chrome/Windows
        var supportsTouchPoints = navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
        var hasCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var hasNoHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
        var hasTouch = supportsTouchPoints && (hasCoarsePointer || hasNoHover);

        // 2. Gán trạng thái
        if (hasTouch) {
            isMobile = true; // Bật chế độ điều khiển cảm ứng (Kéo/Vuốt)
        } else {
            isMobile = false; // Bật chế độ chuột (Di chuột để điều khiển)
        }
        if (isMobile) {
            isBugBrowser = true;
        }
        // --- [QUAN TRỌNG] KHÔI PHỤC BIẾN USERINPUT ---
        // Dòng này bắt buộc phải có để khởi tạo hệ thống điều khiển
        var userInput = new Utils.UserInput(canvas, isBugBrowser);

        // --- 1. DỮ LIỆU TÊN QUỐC GIA ĐẦY ĐỦ ---
        var countryNames = {
            ES: "Spain",
            AU: "Australia",
            AT: "Austria",
            AG: "Antigua",
            AR: "Argentina",
            AM: "Armenia",
            BO: "Bolivia",
            BQ: "Bonaire",
            BA: "Bosnia",
            TL: "Timor",
            VN: "Vietnam",
            GA: "Gabon",
            PT: "Portugal",
            AZ: "Azerbaijan",
            MX: "Mexico",
            AW: "Aruba",
            BS: "Bahamas",
            BD: "Bangladesh",
            BW: "Botswana",
            BR: "Brazil",
            BN: "Brunei",
            HW: "Hawaii",
            GY: "Guyana",
            GM: "Gambia",
            AX: "Aland",
            AL: "Albania",
            DZ: "Algeria",
            BB: "Barbados",
            BH: "Bahrain",
            BY: "Belarus",
            BF: "Burkina",
            BI: "Burundi",
            VU: "Vanuatu",
            GH: "Ghana",
            GP: "Guadeloupe",
            GN: "Guinea",
            AI: "Anguilla",
            AO: "Angola",
            AD: "Andorra",
            BE: "Belgium",
            BJ: "Benin",
            BG: "Bulgaria",
            GB: "United Kingdom",
            HU: "Hungary",
            VE: "Venezuela",
            GW: "Guinea-B",
            DE: "Germany",
            ZW: "Zimbabwe",
            IL: "Israel",
            IN: "India",
            KZ: "Kazakhstan",
            CM: "Cameroon",
            CA: "Canada",
            CO: "Colombia",
            KM: "Comoros",
            CD: "Congo DR",
            CW: "Curacao",
            LA: "Laos",
            LV: "Latvia",
            ID: "Indonesia",
            JO: "Jordan",
            IQ: "Iraq",
            QA: "Qatar",
            KE: "Kenya",
            CY: "Cyprus",
            CG: "Congo",
            KP: "N.Korea",
            KR: "S.Korea",
            LS: "Lesotho",
            LR: "Liberia",
            LB: "Lebanon",
            IR: "Iran",
            IE: "Ireland",
            IS: "Iceland",
            EG: "Egypt",
            KG: "Kyrgyzstan",
            KI: "Kiribati",
            TW: "Taiwan",
            CR: "Costa Rica",
            CI: "Ivory Coast",
            LY: "Libya",
            LT: "Lithuania",
            LI: "Liechtenstein",
            IT: "Italy",
            YE: "Yemen",
            CN: "China",
            CC: "Cocos Is.",
            CU: "Cuba",
            KW: "Kuwait",
            CK: "Cook Is.",
            LU: "Luxembourg",
            MU: "Mauritius",
            MR: "Mauritania",
            MH: "Marshall Is.",
            FM: "Micronesia",
            MZ: "Mozambique",
            IM: "Isle of Man",
            NA: "Namibia",
            NR: "Nauru",
            NE: "Niger",
            NG: "Nigeria",
            NL: "Netherlands",
            NU: "Niue",
            NZ: "New Zealand",
            PR: "Puerto Rico",
            CX: "Christmas Is.",
            SC: "Seychelles",
            SN: "Senegal",
            MF: "St.Martin",
            SB: "Solomon Is.",
            SO: "Somalia",
            SD: "Sudan",
            TV: "Tuvalu",
            TN: "Tunisia",
            TR: "Turkey",
            RU: "Russia",
            RW: "Rwanda",
            RO: "Romania",
            VC: "St.Vincent",
            KN: "St.Kitts",
            LC: "St.Lucia",
            SR: "Suriname",
            SL: "Sierra Leone",
            TJ: "Tajikistan",
            UZ: "Uzbekistan",
            UA: "Ukraine",
            UY: "Uruguay",
            WS: "Samoa",
            ST: "Sao Tome",
            MN: "Mongolia",
            SY: "Syria",
            TH: "Thailand",
            TZ: "Tanzania",
            TG: "Togo",
            FO: "Faroe Is.",
            PH: "Philippines",
            FI: "Finland",
            SA: "Saudi Arabia",
            SZ: "Swaziland",
            SK: "Slovakia",
            SI: "Slovenia",
            US: "USA",
            TK: "Tokelau",
            TO: "Tonga",
            TT: "Trinidad",
            FR: "France",
            CF: "C.African Rep",
            TD: "Chad",
            GG: "Guernsey",
            GI: "Gibraltar",
            HN: "Honduras",
            CZ: "Czech Rep",
            CL: "Chile",
            CH: "Switzerland",
            MG: "Madagascar",
            MO: "Macau",
            MK: "Macedonia",
            MM: "Myanmar",
            MC: "Monaco",
            HK: "Hong Kong",
            GD: "Grenada",
            GL: "Greenland",
            SE: "Sweden",
            ER: "Eritrea",
            EE: "Estonia",
            MW: "Malawi",
            MY: "Malaysia",
            ML: "Mali",
            NC: "New Caledonia",
            NO: "Norway",
            NF: "Norfolk Is.",
            GR: "Greece",
            GE: "Georgia",
            DK: "Denmark",
            ET: "Ethiopia",
            ZA: "South Africa",
            MV: "Maldives",
            MT: "Malta",
            MA: "Morocco",
            AE: "UAE",
            PK: "Pakistan",
            PW: "Palau",
            DM: "Dominica",
            ZM: "Zambia",
            SS: "South Sudan",
            JM: "Jamaica",
            JP: "Japan",
            PE: "Peru",
            PF: "Polynesia",
            PL: "Poland",
            PS: "Palestine",
            GU: "Guam",
            PG: "Papua NG",
        };

        // Hàm lấy tên quốc gia từ ID (Đã cập nhật để dùng object mới)
        function getCountryNameById(id) {
            if (!countryFlags || !countryFlags.aAllCountryCodes) return "";
            var iso = countryFlags.aAllCountryCodes[id];
            return countryNames[iso] || iso;
        }
        function getMusicTargetVolume() {
            return gameState === "game" ? 0.1 * masterVolume : 0.5 * masterVolume;
        }

        function applyAudioVolumes() {
            if (sound && typeof sound.volume === "function") sound.volume(masterVolume);
            if (applauseSound && typeof applauseSound.volume === "function") applauseSound.volume(masterVolume);
            if (music && typeof music.volume === "function") music.volume(getMusicTargetVolume());
        }

        function visibleResume() {
            if (remixPauseActive) return;
            if (userInput) userInput.checkKeyFocus();
            hasFocus = true;

            if (!muted && gameState !== "pause" && gameState !== "help" && gameState !== "loading") {
                // Sau khi trở lại từ background, Safari/iOS có thể suspend AudioContext và
                // từ chối resume nếu lệnh không xuất phát từ gesture. Luôn cài lại listener
                // để cú chạm/click tiếp theo phục hồi âm thanh chắc chắn.
                installAudioUnlockListeners();
                NativeAudioController.mute(false);
                unlockAudioContext().then((unlocked) => {
                    if (unlocked && hasFocus && !muted && gameState !== "pause" && gameState !== "help") {
                        applyAudioVolumes();
                        playMusic();
                    }
                });
            }
        }

        function visiblePause() {
            if (remixPauseActive) return;
            hasFocus = false;
            NativeAudioController.mute(true);
            if (music && typeof music.pause === "function") music.pause();
        }

        function playMusic() {
            if (audioType !== 1 || muted || !music) return;
            if (!music.playing()) music.play();
        }

        function isStock() {
            var t = window.navigator.userAgent.match(/Android.*AppleWebKit\/([\d.]+)/);
            return t && parseFloat(t[1]) < 537;
        }

        resizeCanvas();

        window.onresize = () => {
            setTimeout(() => {
                resizeCanvas();
            }, 1);
        };

        window.onpageshow = () => {
            visibleResume();
        };

        window.onpagehide = () => {
            visiblePause();
        };

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") visiblePause();
            else visibleResume();
        }, false);

        window.addEventListener("blur", visiblePause, false);
        window.addEventListener("focus", visibleResume, false);

        window.addEventListener("load", () => {
            setTimeout(() => {
                resizeCanvas();
            }, 0);

            window.addEventListener("orientationchange", () => {
                setTimeout(() => {
                    resizeCanvas();
                }, 500);
                setTimeout(() => {
                    resizeCanvas();
                }, 2000);
            }, false);
        });
        var ASSET_BASE = "https://remix.gg/blob/01005f8c-6e33-4d07-9588-99931507622c/";
        var panel,
            background,
            applauseSound,
            ua = navigator.userAgent,
            isSharpStock = /SHL24|SH-01F/i.test(ua) && isStock(),
            isXperiaAStock = /SO-04E/i.test(ua) && isStock(),
            isFujitsuStock = /F-01F/i.test(ua) && isStock();
        isIE10 ||
            isSharpStock ||
            isXperiaAStock ||
            isFujitsuStock ||
            !NativeAudioController.supported
            ? (audioType = 0)
            : ((audioType = 1),
                (sound = new NativeAudio({
                    src: [ASSET_BASE + "sound-xc3mLMan5EijRHmejjf4DPMtIgj7dg.mp3?yBho"],
                    format: ["mp3"],
                    sprite: {
                        bounce0: [0, 400],
                        bounce1: [500, 400],
                        bounce2: [1e3, 400],
                        bounce3: [1500, 400],
                        bounce4: [2e3, 400],
                        bounce5: [2500, 400],
                        hit0: [3e3, 400],
                        hit1: [3500, 400],
                        hit2: [4e3, 400],
                        hit3: [4500, 400],
                        hit4: [5e3, 400],
                        hit5: [5500, 400],
                        hitNet: [6e3, 1300],
                        userPoint: [7500, 700],
                        enemyPoint: [8500, 700],
                        loseGame: [9500, 1400],
                        gameStart: [11e3, 900],
                        cheer2: [12e3, 3500],
                        winGame: [16e3, 6600],
                        cheer4: [23e3, 5e3],
                        cheer3: [28500, 4500],
                        cheer0: [33500, 3300],
                        cheer1: [37500, 4500],
                        firework: [42500, 1500],
                    },
                })),
                (applauseSound = new NativeAudio({
                    src: [ASSET_BASE + "applause-small-audience-A0izzOVRuFGK47TQWyd6n6z7UbHqBR.mp3?aamF"],
                    format: ["mp3"],
                    volume: 1.0,
                })),
                (music = new NativeAudio({
                    src: ["https://lqy3lriiybxcejon.public.blob.vercel-storage.com/01005f8c-6e33-4d07-9588-99931507622c/music_bg-BvcQxfJyyT-EVXuEepwdJTRP1QbTcFgm7U0j6Yo4Z.mp3?OQpc"],
                    format: ["mp3"],
                    volume: 0,
                    loop: !0,
                })));
        var aLevelUps,
            levelBonusScore,
            bonusScore,
            panelFrame,
            oLogoBut,
            tableTop,
            userBat,
            enemyBat,
            ball,
            startTouchY,
            aEffects,
            totalScore = 0,
            levelScore = 0,
            levelNum = 0,
            aTutorials = new Array(),
            oLogoData = {},
            oImageIds = {},
            swipeState = 0,
            countryFlags = new Utils.CountryFlags(
                [], // Truyền mảng rỗng để nó tự load hết ~200 nước
                !1,
            ),
            aEnemyCountries = new Array(
                ["IS", "GL", "HW", "CU", "CA", "US"],
                ["VE", "CK", "WS", "CO", "GY", "CR"],
                ["PE", "AR", "UY", "BO", "CL", "BR"],
                ["DZ", "LY", "ET", "ZW", "KE", "ZA"],
                ["FR", "NO", "PT", "IT", "DE", "GB"],
                ["AT", "CZ", "PL", "TR", "HU", "GR"],
                ["IR", "BD", "MG", "IN", "PK", "AE"],
                ["PG", "NZ", "AU", "PH", "ID", "MY"],
                ["LA", "KG", "HK", "JP", "KR", "CN"],
                ["LV", "EE", "LT", "FI", "UZ", "RU"],
            ),
            spareEnemyCountry = "CH",
            oGameData = {
                cupId: 0,
                gameId: 0,
                userId: null,
                enemyId: null,
                userScore: 0,
                enemyScore: 0,
            },
            firstRun = !0,
            aMapMarkerPos = new Array(
                [-203, -115],
                [-150, -31],
                [-136, 98],
                [20, 57],
                [-36, -109],
                [50, -72],
                [101, -16],
                [170, 82],
                [192, -51],
                [143, -121],
            ),
            justWonCup = !1,
            lastCompletedLevel = 0,
            controlState = 0,
            rallyHits = 0,
            remixPauseActive = !1,
            flagPage = 0;

        // Hệ thống level vô hạn. cupId/gameId chỉ còn là dữ liệu nội bộ để tương thích
        // với các phần cũ; giao diện và độ khó đều dùng một số Level liên tục.
        function getCurrentLevel() {
            var cup = Math.max(0, Math.floor(Number(oGameData.cupId) || 0));
            var match = Math.max(0, Math.floor(Number(oGameData.gameId) || 0));
            return cup * 6 + match + 1;
        }

        function setCurrentLevel(level) {
            var safeLevel = Math.max(1, Math.floor(Number(level) || 1));
            var zeroBased = safeLevel - 1;
            oGameData.cupId = Math.floor(zeroBased / 6);
            oGameData.gameId = zeroBased % 6;
        }

        function advanceToNextLevel() {
            setCurrentLevel(getCurrentLevel() + 1);
        }

        function extGameLoad() {
            loadPreAssets();
        }
        function initSplash() {
            // ------------------------
            totalScore = 0;

            window.remix_onPauseRequested = () => {
                remixPauseActive = true;
                NativeAudioController.mute(true);
                if (music) music.pause();
            };

            window.remix_onResumeRequested = () => {
                remixPauseActive = false;
                // Nếu đang Pause HOẶC đang Help thì không tự bật nhạc lại.
                if (!muted && gameState !== "pause" && gameState !== "help") {
                    installAudioUnlockListeners();
                    NativeAudioController.mute(false);
                    unlockAudioContext().then((unlocked) => {
                        if (unlocked && !muted && !remixPauseActive) {
                            applyAudioVolumes();
                            playMusic();
                        }
                    });
                }
            };

            oGameData.cupId = saveDataHandler.getCurCupId();
            oGameData.gameId = saveDataHandler.getCurGameId();
            var t = saveDataHandler.getUserId();

            if (1234 == t) {
                firstRun = false;
                oGameData.userId = 0;
            } else {
                firstRun = false;
                oGameData.userId = t;
            }

            controlState = saveDataHandler.getControlState();
            if (1 == audioType && !muted) {
                playMusic();
            }

            // Vào thẳng màn hình chọn quốc gia
            initChooseCountry();
        }

        // === 联机大厅（DOM 覆盖层） ===
        // 用 DOM 而不是 canvas，避免重写一套输入框组件。
        function showOnlineLobby() {
            // 清理旧的大厅
            var old = document.getElementById("online-lobby");
            if (old) old.remove();

            var lobby = document.createElement("div");
            lobby.id = "online-lobby";
            lobby.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;font-family:Helvetica,Arial,sans-serif;z-index:9999;";
            lobby.innerHTML =
                '<h2 style="margin:0;">联机对战</h2>' +
                '<div style="display:flex;gap:12px;">' +
                '  <button id="ol-create" style="padding:12px 24px;font-size:18px;background:#28a745;border:0;color:#fff;border-radius:8px;cursor:pointer;">创建房间</button>' +
                '  <button id="ol-joinbtn" style="padding:12px 24px;font-size:18px;background:#0d6efd;border:0;color:#fff;border-radius:8px;cursor:pointer;">加入房间</button>' +
                '</div>' +
                '<div id="ol-joinbox" style="display:none;gap:8px;">' +
                '  <input id="ol-code" placeholder="房间码" maxlength="6" style="padding:10px;font-size:18px;width:140px;text-transform:uppercase;letter-spacing:2px;">' +
                '  <button id="ol-joingo" style="padding:10px 20px;font-size:18px;background:#0d6efd;border:0;color:#fff;border-radius:8px;cursor:pointer;">进入</button>' +
                '</div>' +
                '<div id="ol-status" style="min-height:24px;font-size:16px;color:#aaa;"></div>' +
                '<button id="ol-back" style="padding:8px 20px;font-size:14px;background:#444;border:0;color:#fff;border-radius:8px;cursor:pointer;">返回</button>';
            document.body.appendChild(lobby);

            var status = lobby.querySelector("#ol-status");
            function setStatus(t, color) { status.textContent = t; status.style.color = color || "#aaa"; }

            lobby.querySelector("#ol-back").onclick = function () {
                if (window.net) net.leave();
                isOnline = false;
                lobby.remove();
                initGameIntro();
            };

            var busy = false;
            function lockLobby() {
                busy = true;
                ["#ol-create", "#ol-joinbtn", "#ol-joingo"].forEach(function (sel) {
                    var b = lobby.querySelector(sel);
                    b.disabled = true;
                    b.style.opacity = "0.5";
                });
            }
            function onConnected() {
                net.send({ t: "profile", userId: oGameData.userId }, true);
                setStatus("已连接！开始比赛...", "#6f6");
                setTimeout(function () {
                    lobby.remove();
                    startOnlineMatch();
                }, 600);
            }

            lobby.querySelector("#ol-create").onclick = async function () {
                if (busy) return;
                if (!window.net) return setStatus("net.js 未加载", "#f88");
                lockLobby();
                initOnlineNet();
                isOnline = true;
                net.onPeerJoin = onConnected;
                net.onStatus = (t) => setStatus(t, "#6f6");
                const code = await net.createRoom();
                setStatus("房间码: " + code + "（等待对手加入...）", "#6f6");
            };

            lobby.querySelector("#ol-joinbtn").onclick = function () {
                if (busy) return;
                lobby.querySelector("#ol-joinbox").style.display = "flex";
            };

            lobby.querySelector("#ol-joingo").onclick = async function () {
                if (busy) return;
                if (!window.net) return setStatus("net.js 未加载", "#f88");
                var code = lobby.querySelector("#ol-code").value.trim().toUpperCase();
                if (!code) return setStatus("请输入房间码", "#f88");
                lockLobby();
                initOnlineNet();
                isOnline = true;
                net.onPeerJoin = onConnected;
                net.onStatus = (t) => setStatus(t, "#aaa");
                setStatus("正在加入 " + code + " ...", "#aaa");
                await net.joinRoom(code);
            };
        }

        // 联机开赛：跳过选国家，直接初始化比赛
        function startOnlineMatch() {
            // 联机跳过选国家/地图，给对手一个默认国旗避免渲染空引用
            if (oGameData.userId == null) oGameData.userId = countryFlags.aIds[0];
            if (oGameData.enemyId == null) oGameData.enemyId = countryFlags.aIds[1];
            _initGame();
        }

        function initStartScreen() {
            setFloatingButtonsVisible(false);
            if (((background = new Elements.Background()), forcedMode)) return initGameIntro(), void initGame();

            gameState = "start";
            flagPage = 0;
            if (1 == audioType) music.fade(music.volume(), 0.5 * masterVolume, 500);

            // Xóa hit area cũ
            userInput.removeHitArea("moreGames");
            userInput.removeHitArea("playFromStart");
            userInput.removeHitArea("credits");
            userInput.removeHitArea("cupsFromStart");
            userInput.removeHitArea("changeCountryFromStart");

            // --- CHỈ GIỮ LẠI NÚT CREDITS (HOẶC NÚT KHÁC TÙY BẠN) ---
            // Đã xóa nút Play Game, Country, Levels ở đây vì đã chuyển sang màn hình kia

            var bCredits = {
                label: "CREDITS",
                bgColor: "#17a2b8",
                width: 140,
                height: 50,
                fontSize: 18,
                aPos: [0, 80], // Ở giữa dưới
                align: [0.5, 0.5],
                id: "credits",
            };

            // Nút quay lại Chọn Nước (Thay thế nút Play cũ)
            var bStart = {
                label: "START",
                bgColor: "#28a745",
                width: 160,
                height: 60,
                fontSize: 24,
                aPos: [0, 0], // Giữa màn hình
                align: [0.5, 0.5],
                id: "playFromStart", // Dùng lại ID cũ để redirect vào initChooseCountry
            };

            // === 联机对战入口 ===
            var bOnline = {
                label: "ONLINE",
                bgColor: "#0d6efd",
                width: 160,
                height: 50,
                fontSize: 20,
                aPos: [0, -75],
                align: [0.5, 0.5],
                id: "onlineFromStart",
            };

            userInput.addHitArea(
                "playFromStart",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-80, -30, 80, 30],
                    align: bStart.align,
                },
                true,
            );

            userInput.addHitArea(
                "onlineFromStart",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-80, -100, 80, -50],
                    align: bOnline.align,
                },
                true,
            );

            userInput.addHitArea(
                "credits",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-70, 55, 70, 105],
                    align: bCredits.align,
                },
                true,
            );

            var buttons = [bStart, bOnline, bCredits];

            panel = new Elements.Panel(gameState, buttons);
            panel.startTween1();
            previousTime = new Date().getTime();
            updateStartScreenEvent();
            if (window.remix) window.remix.gameReady();
            if (window.FarcadeSDK) window.FarcadeSDK.singlePlayer.actions.ready();
        }

        function addMuteBut(t) {
            // Đã xóa nút âm thanh
        }

        function initCreditsScreen() {
        }
        // --- BIẾN TOÀN CỤC CHO MÀN HÌNH CHỌN NƯỚC ---
        var scrollY = 0;
        var targetScrollY = 0;
        var listMetrics = {};
        var wheelHandler = null;
        var countryInputLock = false; // Biến khóa input để chống click nhầm

        function initChooseCountry() {
            setFloatingButtonsVisible(false);
            gameState = "chooseCountry";
            if (void 0 === background) background = new Elements.Background();

            userInput.removeHitArea("backFromChooseCountry");
            userInput.removeHitArea("countryListTouch");
            userInput.removeHitArea("playFromStart");
            userInput.removeHitArea("moreGames");
            userInput.removeHitArea("cupsFromChooseCountry");

            scrollY = 0;
            targetScrollY = 0;

            countryInputLock = true;
            setTimeout(() => {
                countryInputLock = false;
            }, 500);

            var topHead = 100;
            var botHead = 50;
            var viewW = canvas.width - 80;
            var viewH = canvas.height - topHead - botHead;

            listMetrics = {
                x: 40,
                y: topHead,
                w: viewW,
                h: viewH,
                cols: canvas.width < 450 ? 3 : 4,
                itemH: 110,
            };

            if (wheelHandler) window.removeEventListener("wheel", wheelHandler);
            wheelHandler = (e) => {
                if (gameState === "chooseCountry") {
                    targetScrollY += e.deltaY;
                    e.preventDefault();
                }
            };
            window.addEventListener("wheel", wheelHandler, { passive: false });

            var buttons = [];

            // --- 1. NÚT LEVELS (GÓC PHẢI TRÊN) ---


            // --- 2. VÙNG CẢM ỨNG DANH SÁCH ---
            userInput.addHitArea(
                "countryListTouch",
                butEventHandler,
                { isDraggable: true, multiTouch: true },
                "rect",
                {
                    aRect: [listMetrics.x, listMetrics.y, listMetrics.x + listMetrics.w, listMetrics.y + listMetrics.h],
                    align: [0, 0],
                },
                true,
            );

            panel = new Elements.Panel(gameState, buttons);
            panel.startTween1();
            previousTime = new Date().getTime();
            updateChooseCountryScreenEvent();

            // Đảm bảo nhạc nền tiếp tục phát mà không bị tắt
            if (1 == audioType && !muted && music && !music.playing()) {
                music.play();
                music.volume(0.5 * masterVolume);
            }
        }

        function initMapScreen() {
            setFloatingButtonsVisible(false);
            gameState = "map";

            // 1. Đăng ký vùng bấm cho các Cúp trên bản đồ (GIỮ NGUYÊN)
            for (var t = 0; t < aMapMarkerPos.length; t++)
                if (t == (oGameData.cupId % aMapMarkerPos.length)) {
                    var e = canvas.width / 2 + aMapMarkerPos[t][0],
                        a = 0.45 * canvas.height + aMapMarkerPos[t][1];
                    userInput.addHitArea(
                        "playFromMap", // Bấm vào cúp thì vẫn vào chơi
                        butEventHandler,
                        null,
                        "rect",
                        { aRect: [e - 40, a - 40, e + 40, a + 40] },
                        !0,
                    );
                }

            // 2. Xóa các nút cũ
            userInput.removeHitArea("backFromMap");
            userInput.removeHitArea("playFromMap");
            userInput.removeHitArea("resetDataFromMap");

            // --- 3. TẠO NÚT BACK (CĂN GIỮA) ---
            var bBack = {
                label: "BACK",
                bgColor: "#dc3545",
                width: 100,
                height: 50,
                fontSize: 18,
                // SỬA: Đặt X = 0 để căn giữa màn hình
                aPos: [0, 250],
                align: [0.5, 0.5],
                id: "backFromMap",
            };

            // --- 4. ĐĂNG KÝ VÙNG BẤM CHO NÚT BACK ---
            // Nút rộng 100, cao 50. Tại vị trí (0, 250)
            // X: -50 đến 50
            // Y: 250 - 25 (=225) đến 250 + 25 (=275)
            userInput.addHitArea(
                "backFromMap",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-50, 225, 50, 275], // Đã sửa tọa độ vùng bấm
                    align: [0.5, 0.5],
                },
                true,
            );

            // Chỉ hiển thị nút Back (đã xóa nút Play)
            var buttons = [bBack];

            // Nút Reset Data (Chỉ hiện khi phá đảo) - Giữ nguyên logic
            if (false) { // Level hiện là vô hạn, không còn trạng thái phá đảo cuối cùng.
                var bReset = {
                    label: "RESET DATA",
                    bgColor: "#ffc107",
                    textColor: "#000000",
                    width: 140,
                    height: 40,
                    fontSize: 16,
                    aPos: [0, -280],
                    align: [0.5, 0.5],
                    id: "resetDataFromMap",
                };
                userInput.addHitArea(
                    "resetDataFromMap",
                    butEventHandler,
                    null,
                    "rect",
                    { aRect: [-70, -300, 70, -260], align: [0.5, 0.5] },
                    true,
                );
                buttons.push(bReset);
            }

            panel = new Elements.Panel(gameState, buttons);
            panel.startTween1();
            previousTime = new Date().getTime();
            updateMapScreenEvent();
        }

        function initGameIntro() {
            setFloatingButtonsVisible(false);
            gameState = "gameIntro";
            try {

            } catch (t) { }

            // Logic chọn đối thủ ngẫu nhiên (Giữ nguyên)
            if (!forcedMode) {
                var strongOpponents = [
                    "CN",
                    "JP",
                    "KR",
                    "DE",
                    "SE",
                    "FR",
                    "US",
                    "GB",
                    "RU",
                    "BR",
                    "HK",
                    "TW",
                    "PT",
                    "SG",
                    "AT",
                ];
                var validEnemyIds = [];
                for (var i = 0; i < strongOpponents.length; i++) {
                    var id = countryFlags.getIdFromISO(strongOpponents[i]);
                    if (countryFlags.aIds.indexOf(id) !== -1) validEnemyIds.push(id);
                }
                if (validEnemyIds.length === 0) validEnemyIds = countryFlags.aIds;

                var randomIdx = Math.floor(Math.random() * validEnemyIds.length);
                oGameData.enemyId = validEnemyIds[randomIdx];
                if (validEnemyIds.length > 1) {
                    while (oGameData.enemyId == oGameData.userId) {
                        randomIdx = Math.floor(Math.random() * validEnemyIds.length);
                        oGameData.enemyId = validEnemyIds[randomIdx];
                    }
                }
            }

            // Xóa các vùng bấm cũ
            userInput.removeHitArea("backFromGameIntro");
            userInput.removeHitArea("playFromGameIntro");

            // --- NÚT START MATCH (DUY NHẤT) ---
            // Đặt ở giữa màn hình (0), Y = 180
            var bStart = {
                label: "START MATCH",
                bgColor: "#28a745",
                width: 200,
                height: 60,
                fontSize: 24,
                aPos: [0, 180],
                align: [0.5, 0.5],
                id: "playFromGameIntro",
            };

            // Đăng ký vùng bấm cho nút Start
            var sx = bStart.width / 2;
            var sy = bStart.height / 2;
            // Vì align là [0.5, 0.5] (giữa màn hình), ta cộng aPos vào aRect
            var hx1 = bStart.aPos[0] - sx;
            var hy1 = bStart.aPos[1] - sy;
            var hx2 = bStart.aPos[0] + sx;
            var hy2 = bStart.aPos[1] + sy;

            userInput.addHitArea(
                "playFromGameIntro",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [hx1, hy1, hx2, hy2],
                    align: bStart.align,
                },
                true,
            );

            var bOnline = {
                label: "ONLINE",
                bgColor: "#0d6efd",
                width: 200,
                height: 50,
                fontSize: 22,
                aPos: [0, 250],
                align: [0.5, 0.5],
                id: "onlineFromGameIntro",
            };
            userInput.removeHitArea("onlineFromGameIntro");
            userInput.addHitArea(
                "onlineFromGameIntro",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-100, 225, 100, 275],
                    align: bOnline.align,
                },
                true,
            );

            var buttons = [bStart, bOnline];

            panel = new Elements.Panel(gameState, buttons);
            panel.startTween1();
            previousTime = new Date().getTime();
            updateGameIntroScreenEvent();
        }


        function setFloatingButtonsVisible(visible) {
            var supportBtn = document.getElementById("supportBtn");
            var helpBtn = document.getElementById("helpBtnDom");

            if (supportBtn) supportBtn.style.display = visible ? "flex" : "none";
            if (helpBtn) helpBtn.style.display = visible ? "flex" : "none";
        }

        function setupFloatingUi() {
            var supportBtn = document.getElementById("supportBtn");
            var supportModal = document.getElementById("supportModal");
            var closeSupportBtn = document.getElementById("closeSupportBtn");
            var buySupportBtn = document.getElementById("buySupportBtn");
            var helpBtnDom = document.getElementById("helpBtnDom");

            if (!supportBtn || !supportModal || !closeSupportBtn || !buySupportBtn || !helpBtnDom) return;

            setFloatingButtonsVisible(false);

            supportBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                isSupportModalOpen = true;
                window.remix.paused = true;
                supportModal.style.display = "flex";
            });

            closeSupportBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                supportModal.style.display = "none";
                isSupportModalOpen = false;

                if (gameState === "game") {
                    window.remix.paused = false;
                }
            });

            buySupportBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                supportModal.style.display = "none";

                try {
                    if (!window.FarcadeSDK) {
                        return;
                    }

                    const result = await window.FarcadeSDK.purchase({ item: "support-dev" });

                    if (result && result.success && window.FarcadeSDK.singlePlayer && window.FarcadeSDK.singlePlayer.actions) {
                        window.FarcadeSDK.singlePlayer.actions.hapticFeedback();
                    }
                } catch (error) {
                    console.error("Support transaction error:", error);
                } finally {
                    isSupportModalOpen = false;
                    if (gameState === "game") {
                        window.remix.paused = false;
                    }
                }
            });

            helpBtnDom.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (gameState !== "game") return;

                playSound("hit" + Math.floor(6 * Math.random()));
                initHelp();
            });
        }

        function initPause() {
            setFloatingButtonsVisible(false);
            gameState = "pause";
            try {

            } catch (t) { }

            // Nút Resume (Lệch lên trên -80)
            var bResume = {
                label: "RESUME",
                bgColor: "#28a745",
                width: 200,
                height: 60,
                aPos: [0, -80],
                align: [0.5, 0.5],
            };
            // Nút Restart (Ở giữa 0)
            var bRestart = {
                label: "RESTART",
                bgColor: "#fd7e14",
                width: 200,
                height: 60,
                aPos: [0, 0],
                align: [0.5, 0.5],
            };
            // Nút Quit (Lệch xuống dưới 80)
            var bQuit = { label: "QUIT", bgColor: "#dc3545", width: 200, height: 60, aPos: [0, 80], align: [0.5, 0.5] };

            // Resume: Y = -80. Rect: [-100, -80-30, 100, -80+30] -> [-100, -110, 100, -50]
            userInput.addHitArea(
                "playFromPause",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-100, -110, 100, -50],
                    align: [0.5, 0.5],
                },
                true,
            );

            // Restart: Y = 0. Rect: [-100, -30, 100, 30]
            userInput.addHitArea(
                "restartFromPause",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-100, -30, 100, 30],
                    align: [0.5, 0.5],
                },
                true,
            );

            // Quit: Y = 80. Rect: [-100, 80-30, 100, 80+30] -> [-100, 50, 100, 110]
            userInput.addHitArea(
                "quitFromPause",
                butEventHandler,
                null,
                "rect",
                {
                    aRect: [-100, 50, 100, 110],
                    align: [0.5, 0.5],
                },
                true,
            );

            var buttons = [bResume, bRestart, bQuit];
            panel = new Elements.Panel(gameState, buttons);
            panel.startTween1();
            previousTime = new Date().getTime();
            background = new Elements.Background();
            updatePauseEvent();
        }
        // =====================================================
        // HELP / TUTORIAL SCREEN - AAA STYLE
        // Thay thế hoàn toàn initHelp() + updateHelpEvent()
        // =====================================================

        function initHelp() {
            gameState = "help";
            setFloatingButtonsVisible(false);
            // Xóa vùng bấm của game để tránh thao tác nhầm
            userInput.removeHitArea("gameTouch");
            userInput.removeHitArea("helpButton");
            userInput.removeHitArea("pause");

            // Nút đóng ở góc phải trên của card
            // Vị trí hit area sẽ được tính responsive trong updateHelpEvent,
            // nên ở đây chỉ tạo button object cho panel nếu bạn vẫn muốn dùng panel.render()
            var bClose = {
                label: "✕",
                bgColor: "#dc3545",
                width: 48,
                height: 48,
                fontSize: 22,
                aPos: [0, 0],
                align: [0, 0],
                id: "closeHelp",
            };

            panel = new Elements.Panel(gameState, [bClose]);

            previousTime = new Date().getTime();
            updateHelpEvent();
        }

        function updateHelpEvent() {
            if (gameState !== "help") return;
            delta = getDelta();

            background.renderGame();
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            var cw = canvas.width;
            var ch = canvas.height;
            var isSmall = cw < 500;

            var pad = Math.max(18, Math.min(cw * 0.04, 32));
            var cardW = Math.min(cw * 0.86, 760);
            var cardH = Math.min(ch * 0.78, 620);
            var cardX = (cw - cardW) / 2;
            var cardY = (ch - cardH) / 2;
            var radius = 24;

            var titleSize = isSmall ? 24 : 34;
            var bodySize = isSmall ? 16 : 20;
            var hintSize = isSmall ? 13 : 15;

            var titleY = cardY + (isSmall ? 58 : 72);
            var demoTop = cardY + (isSmall ? 120 : 145);
            var demoH = cardH * 0.34;
            var demoBottom = demoTop + demoH;

            var textTop = demoBottom + (isSmall ? 20 : 26);
            var lineGap = isSmall ? 26 : 32;

            // Nền thẻ
            drawRoundRect(ctx, cardX, cardY, cardW, cardH, radius, "rgba(10,16,28,0.96)");
            strokeRoundRect(ctx, cardX, cardY, cardW, cardH, radius, "rgba(255,255,255,0.15)", 2);

            var glow = ctx.createLinearGradient(cardX, cardY, cardX, cardY + 120);
            glow.addColorStop(0, "rgba(80,160,255,0.25)");
            glow.addColorStop(1, "rgba(80,160,255,0.00)");
            drawRoundRect(ctx, cardX, cardY, cardW, 120, radius, glow);

            // Nút đóng
            var closeSize = isSmall ? 42 : 46;
            var closeX = cardX + cardW - closeSize - pad * 0.6;
            var closeY = cardY + pad * 0.6;

            userInput.removeHitArea("closeHelp");
            userInput.addHitArea("closeHelp", butEventHandler, null, "rect", {
                aRect: [closeX, closeY, closeX + closeSize, closeY + closeSize],
                align: [0, 0],
            }, true);

            drawRoundRect(ctx, closeX, closeY, closeSize, closeSize, 12, "rgba(220,53,69,0.95)");
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold " + (isSmall ? 20 : 22) + "px Arial";
            ctx.fillText("×", closeX + closeSize / 2, closeY + closeSize / 2 + 1);
            ctx.restore();

            // Tiêu đề
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold " + titleSize + "px Arial";
            ctx.fillText("HOW TO PLAY", cw / 2, titleY);
            ctx.fillStyle = "rgba(255,255,255,0.72)";
            ctx.font = "400 " + hintSize + "px Arial";
            ctx.fillText("Master your swipe timing and direction", cw / 2, titleY + (isSmall ? 28 : 34));
            ctx.restore();

            // Khu vực Demo Gameplay
            var demoX = cardX + pad;
            var demoW = cardW - pad * 2;
            drawRoundRect(ctx, demoX, demoTop, demoW, demoH, 18, "rgba(255,255,255,0.05)");
            strokeRoundRect(ctx, demoX, demoTop, demoW, demoH, 18, "rgba(255,255,255,0.1)", 1.5);

            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(cw / 2, demoTop + 18);
            ctx.lineTo(cw / 2, demoBottom - 18);
            ctx.stroke();
            ctx.restore();

            // Logic chuyển động của Demo
            var centerX = cw / 2;
            var centerY = demoTop + demoH / 2;
            var playerY = centerY + demoH * 0.22;
            var enemyY = centerY - demoH * 0.22;

            var swing = Math.sin(Date.now() * 0.006) * demoW * 0.12;
            var ballT = (Math.sin(Date.now() * 0.004) + 1) / 2;

            var ballStartX = centerX - demoW * 0.16;
            var ballEndX = centerX + demoW * 0.16;
            var ballX = ballStartX + (ballEndX - ballStartX) * ballT;
            var ballArc = Math.sin(ballT * Math.PI) * demoH * 0.22;
            var ballY = centerY - ballArc * 0.7;

            // Vợt (Đỏ của User, Đen của Kẻ thù)
            drawPaddle(ctx, centerX - swing * 0.25, enemyY, demoW * 0.12, demoH * 0.10, "#212529", -0.10);
            drawPaddle(ctx, centerX + swing, playerY, demoW * 0.14, demoH * 0.11, "#e63946", 0.18);

            // Hiệu ứng vệt bóng bay (Trail)
            for (var i = 0; i < 4; i++) {
                var trailT = Math.max(0, ballT - i * 0.06);
                var tx = ballStartX + (ballEndX - ballStartX) * trailT;
                var ty = centerY - Math.sin(trailT * Math.PI) * demoH * 0.22 * 0.7;
                ctx.beginPath();
                ctx.fillStyle = "rgba(255,255,255," + (0.18 - i * 0.035) + ")";
                ctx.arc(tx, ty, isSmall ? 5 - i * 0.5 : 6 - i * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }

            // Quả bóng
            var ballR = isSmall ? 7 : 9;
            var ballGlow = ctx.createRadialGradient(ballX - 2, ballY - 2, 1, ballX, ballY, ballR * 2.5);
            ballGlow.addColorStop(0, "rgba(255,255,255,1)");
            ballGlow.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = ballGlow;
            ctx.beginPath();
            ctx.arc(ballX, ballY, ballR * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();
            ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
            ctx.fill();

            // Hiệu ứng "Vuốt sáng" điều hướng (Glowing Swipe Indicator)
            var arrowY = playerY + (isSmall ? 34 : 42);
            var swipeProgress = (Date.now() * 0.0012) % 1;
            var swipeStartX = centerX - demoW * 0.15;
            var swipeEndX = centerX + demoW * 0.15;
            var swipeEndY = arrowY - 25;

            var currentX = swipeStartX + (swipeEndX - swipeStartX) * swipeProgress;
            var currentY = arrowY + (swipeEndY - arrowY) * swipeProgress;

            ctx.save();
            ctx.lineCap = "round";

            // Vệt nền của đường swipe
            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 215, 0, 0.2)";
            ctx.lineWidth = isSmall ? 6 : 8;
            ctx.moveTo(swipeStartX, arrowY);
            ctx.lineTo(swipeEndX, swipeEndY);
            ctx.stroke();

            // Vệt sáng chạy dọc đường swipe
            if (swipeProgress > 0.05) {
                var swipeGrad = ctx.createLinearGradient(swipeStartX, arrowY, currentX, currentY);
                swipeGrad.addColorStop(0, "rgba(255, 215, 0, 0)");
                swipeGrad.addColorStop(1, "rgba(255, 215, 0, 1)");
                ctx.beginPath();
                ctx.strokeStyle = swipeGrad;
                ctx.lineWidth = isSmall ? 6 : 8;
                ctx.moveTo(swipeStartX, arrowY);
                ctx.lineTo(currentX, currentY);
                ctx.stroke();
            }

            // Điểm nhấp nháy mô phỏng ngón tay đang di chuyển
            ctx.beginPath();
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.arc(currentX, currentY, isSmall ? 6 : 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.fillStyle = "rgba(255, 215, 0, 0.4)";
            var pulse = Math.abs(Math.sin(Date.now() * 0.008)) * 6;
            ctx.arc(currentX, currentY, (isSmall ? 12 : 16) + pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.textAlign = "center";
            ctx.fillStyle = "#FFD700";
            ctx.font = "bold " + hintSize + "px Arial";
            ctx.fillText("SWIPE TO RETURN", centerX, arrowY - 25);
            ctx.restore();

            // Phần text thông tin bên dưới
            var textX = cw / 2;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold " + bodySize + "px Arial";
            ctx.fillText("Swipe in the direction you want to hit the ball.", textX, textTop);
            ctx.fillStyle = "rgba(255,255,255,0.78)";
            ctx.font = "400 " + bodySize + "px Arial";
            ctx.fillText("Control the angle of your return to attack smarter.", textX, textTop + lineGap);

            // Thẻ TIP nổi bật
            var tipW = Math.min(cardW - pad * 2, 520);
            var tipH = isSmall ? 68 : 78;
            var tipX = cw / 2 - tipW / 2;
            var tipY = textTop + lineGap * 2 + 8;

            drawRoundRect(ctx, tipX, tipY, tipW, tipH, 16, "rgba(255,215,0,0.12)");
            strokeRoundRect(ctx, tipX, tipY, tipW, tipH, 16, "rgba(255,215,0,0.3)", 1.5);

            ctx.fillStyle = "#FFD700";
            ctx.font = "bold " + bodySize + "px Arial";
            ctx.fillText("TIP", textX, tipY + (isSmall ? 20 : 24));
            ctx.fillStyle = "#FFF4C2";
            ctx.font = "400 " + (isSmall ? 15 : 18) + "px Arial";
            ctx.fillText("Swipe at a moderate speed to avoid missing the ball.", textX, tipY + (isSmall ? 45 : 52));

            ctx.fillStyle = "rgba(255,255,255,0.58)";
            ctx.font = "400 " + hintSize + "px Arial";
            ctx.fillText("Tap × to return to the match", textX, cardY + cardH - (isSmall ? 24 : 28));
            ctx.restore();

            requestAnimFrame(updateHelpEvent);
        }

        // =====================================================
        // DRAW HELPERS
        // =====================================================

        function drawRoundRect(ctx, x, y, w, h, r, fillStyle) {
            ctx.save();
            ctx.fillStyle = fillStyle;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function strokeRoundRect(ctx, x, y, w, h, r, strokeStyle, lineWidth) {
            ctx.save();
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth || 1;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }

        function drawPaddle(ctx, x, y, w, h, color, rot) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot || 0);

            // shadow
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.beginPath();
            ctx.ellipse(0, h * 0.58, w * 0.36, h * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();

            // handle
            ctx.fillStyle = "#c08a52";
            ctx.fillRect(-w * 0.08, h * 0.05, w * 0.16, h * 0.65);

            // rubber
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.ellipse(0, 0, w * 0.34, h * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();

            // inner highlight
            ctx.beginPath();
            ctx.fillStyle = "rgba(255,255,255,0.10)";
            ctx.ellipse(-w * 0.08, -h * 0.08, w * 0.15, h * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        function drawArrow(ctx, x1, y1, x2, y2, color) {
            var head = 10;
            var angle = Math.atan2(y2 - y1, x2 - x1);

            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 4;
            ctx.lineCap = "round";

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
        function resumeGame() {
            (gameState = "game"),
                (background = new Elements.Background()),
                isMobile &&
                userInput.addHitArea(
                    "gameTouch",
                    butEventHandler,
                    {
                        isDraggable: !0,
                        multiTouch: !0,
                    },
                    "rect",
                    {
                        aRect: [0, 50, canvas.width, canvas.height],
                    },
                    !0,
                );
            var t = {
                oImgData: assetLib.getData("uiButs"),
                aPos: [-90, 32],
                align: [1, 0],
                id: oImageIds.pauseBut,
                noMove: !0,
            },
                e = new Array();
            addMuteBut(e),
                (panel = new Elements.Panel(gameState, e)).startTween1(),
                (previousTime = new Date().getTime()),
                updateGameEvent();
        }

        // ==========================================
        // 6. HỆ THỐNG XỬ LÝ SỰ KIỆN (EVENT HANDLER)
        // ==========================================
        function butEventHandler(t, e) {
            if (window.remix && window.remix.paused) return; // Không xử lý thao tác khi game đang pause

            switch (t) {
                // ------------------------------------
                // NHÓM MENU CHÍNH & CHỌN QUỐC GIA
                // ------------------------------------
                case "playFromStart":
                    // Đây là thao tác người dùng hợp lệ trên cả PC và mobile.
                    unlockAudioContext();
                    playSound("hit" + Math.floor(6 * Math.random()));

                    userInput.removeHitArea("playFromStart");
                    userInput.removeHitArea("moreGames");
                    userInput.removeHitArea("credits");
                    userInput.removeHitArea("cupsFromStart");
                    userInput.removeHitArea("changeCountryFromStart");
                    userInput.removeHitArea("onlineFromStart");

                    firstRun ? initChooseCountry() : initGameIntro();
                    break;

                case "onlineFromStart":
                    unlockAudioContext();
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("playFromStart");
                    userInput.removeHitArea("credits");
                    userInput.removeHitArea("onlineFromStart");
                    showOnlineLobby();
                    break;

                case "credits":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("playFromStart");
                    userInput.removeHitArea("moreGames");
                    userInput.removeHitArea("credits");
                    userInput.removeHitArea("cupsFromStart");
                    initCreditsScreen();
                    break;

                case "backFromCredits":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("backFromCredits");
                    userInput.removeHitArea("resetData");
                    userInput.removeHitArea("mute");
                    userInput.removeHitArea("control0FromCredits");
                    userInput.removeHitArea("control1FromCredits");
                    initStartScreen();
                    break;

                case "changeCountryFromStart":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("playFromStart");
                    userInput.removeHitArea("moreGames");
                    userInput.removeHitArea("credits");
                    userInput.removeHitArea("cupsFromStart");
                    userInput.removeHitArea("changeCountryFromStart");
                    initChooseCountry();
                    break;

                case "cupsFromStart":
                case "cupsFromChooseCountry":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("playFromStart");
                    userInput.removeHitArea("moreGames");
                    userInput.removeHitArea("credits");
                    userInput.removeHitArea("cupsFromStart");
                    userInput.removeHitArea("changeCountryFromStart");
                    userInput.removeHitArea("countryListTouch");
                    userInput.removeHitArea("cupsFromChooseCountry");

                    if (wheelHandler) window.removeEventListener("wheel", wheelHandler);
                    initMapScreen();
                    break;

                case "backFromChooseCountry":
                    if (countryInputLock) return;
                    playSound("hit" + Math.floor(6 * Math.random()));
                    if (wheelHandler) window.removeEventListener("wheel", wheelHandler);
                    userInput.removeHitArea("backFromChooseCountry");
                    userInput.removeHitArea("countryListTouch");
                    initStartScreen();
                    break;

                case "countryListTouch":
                    // 1. Logic kéo cuộn (Scroll)
                    if (e.isDown) {
                        if (typeof this.lastDragY === "undefined") this.lastDragY = e.y;
                        if (e.isBeingDragged) {
                            const deltaY = this.lastDragY - e.y;
                            const isScrollbarArea = e.x > listMetrics.x + listMetrics.w - 40;

                            if (isScrollbarArea) {
                                const scrollRatio = deltaY / listMetrics.h;
                                const totalContentH = Math.ceil(countryFlags.aIds.length / listMetrics.cols) * listMetrics.itemH + 20;
                                targetScrollY -= scrollRatio * totalContentH * 2.5;
                            } else {
                                targetScrollY += deltaY;
                            }
                        }
                        this.lastDragY = e.y;
                    } else {
                        this.lastDragY = undefined;
                    }

                    // 2. Logic chọn (Click)
                    if (!e.isDown && !e.isBeingDragged) {
                        if (countryInputLock) return;
                        const relX = e.x - listMetrics.x;
                        const relY = e.y - listMetrics.y + scrollY;
                        const cellW = listMetrics.w / listMetrics.cols;
                        const cellH = listMetrics.itemH;
                        const col = Math.floor(relX / cellW);
                        const row = Math.floor(relY / cellH);
                        const index = row * listMetrics.cols + col;
                        const totalCountries = countryFlags.aIds.length;

                        const cellCenterX = col * cellW + cellW / 2;
                        const cellCenterY = row * cellH + cellH / 2;
                        const distX = Math.abs(relX - cellCenterX);
                        const distY = Math.abs(relY - cellCenterY);

                        // Hitbox
                        if (index >= 0 && index < totalCountries && col < listMetrics.cols && relX > 0 && distX < 40 && distY < 30) {
                            playSound("hit" + Math.floor(6 * Math.random()));

                            const selectedId = countryFlags.aIds[index];
                            oGameData.userId = selectedId;

                            let enemyId = selectedId;
                            while (enemyId == selectedId) {
                                enemyId = countryFlags.aIds[Math.floor(Math.random() * countryFlags.aIds.length)];
                            }
                            oGameData.enemyId = enemyId;

                            saveDataHandler.setUserId(oGameData.userId);
                            saveDataHandler.saveData();

                            if (wheelHandler) window.removeEventListener("wheel", wheelHandler);
                            userInput.removeHitArea("countryListTouch");
                            userInput.removeHitArea("backFromChooseCountry");
                            initGameIntro();
                        }
                    }
                    break;

                case "backFromMap":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("resetDataFromMap");
                    userInput.removeHitArea("backFromMap");
                    userInput.removeHitArea("playFromMap");
                    initChooseCountry();
                    break;

                // ------------------------------------
                // NHÓM QUẢN LÝ DỮ LIỆU & SETTINGS
                // ------------------------------------
                case "resetData":
                case "resetDataFromMap":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("backFromCredits");
                    userInput.removeHitArea("resetData");
                    userInput.removeHitArea("mute");
                    userInput.removeHitArea("control0FromCredits");
                    userInput.removeHitArea("control1FromCredits");
                    userInput.removeHitArea("resetDataFromMap");
                    userInput.removeHitArea("backFromMap");
                    userInput.removeHitArea("playFromMap");

                    saveDataHandler.resetData();
                    oGameData.cupId = saveDataHandler.getCurCupId();
                    oGameData.gameId = saveDataHandler.getCurGameId();
                    const uId = saveDataHandler.getUserId();
                    if (uId == 1234) {
                        firstRun = false;
                        oGameData.userId = 0;
                    } else {
                        firstRun = false;
                        oGameData.userId = uId;
                    }
                    controlState = saveDataHandler.getControlState();
                    t === "resetDataFromMap" ? initMapScreen() : initStartScreen();
                    break;

                case "control0FromPause":
                case "control0FromCredits":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    controlState = 0;
                    saveDataHandler.setControlState(controlState);
                    saveDataHandler.saveData();
                    panel.switchBut(oImageIds.control0OffBut, oImageIds.control0OnBut);
                    panel.switchBut(oImageIds.control1OnBut, oImageIds.control1OffBut);
                    break;

                case "control1FromPause":
                case "control1FromCredits":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    controlState = 1;
                    saveDataHandler.setControlState(controlState);
                    saveDataHandler.saveData();
                    panel.switchBut(oImageIds.control0OnBut, oImageIds.control0OffBut);
                    panel.switchBut(oImageIds.control1OffBut, oImageIds.control1OnBut);
                    break;

                case "mute":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    toggleMute();
                    panel.switchBut(muted ? oImageIds.muteBut0 : oImageIds.muteBut1, muted ? oImageIds.muteBut1 : oImageIds.muteBut0);
                    break;

                // ------------------------------------
                // NHÓM IN-GAME & ĐIỀU KHIỂN
                // ------------------------------------
                case "playFromGameIntro":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("backFromGameIntro");
                    userInput.removeHitArea("playFromGameIntro");
                    userInput.removeHitArea("onlineFromGameIntro");
                    window.externalStart || initGame();
                    break;

                case "onlineFromGameIntro":
                    unlockAudioContext();
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("backFromGameIntro");
                    userInput.removeHitArea("playFromGameIntro");
                    userInput.removeHitArea("onlineFromGameIntro");
                    showOnlineLobby();
                    break;

                case "gameTouch":
                    // Logic vuốt vợt của người chơi
                    if (e.isDown && !e.isBeingDragged) {
                        swipeState = 1;
                        startTouchY = e.y - userBat.targY;
                    } else if (swipeState === 1 && e.isBeingDragged) {
                        userBat.targX = e.x;
                        userBat.targY = (controlState === 0) ? e.y : e.y - startTouchY;
                    } else if (swipeState === 1) {
                        swipeState = 0;
                    }
                    break;

                case "pause":
                    if (e !== true) playSound("hit" + Math.floor(6 * Math.random()));
                    if (audioType == 1) {
                        NativeAudioController.mute(true);
                        music.pause();
                    } else if (audioType == 2) {
                        music.pause();
                    }
                    userInput.removeHitArea("pause");
                    userInput.removeHitArea("gameTouch");
                    userInput.removeHitArea("mute");
                    initPause();
                    break;

                case "playFromPause":
                    if (window.remix.pointerLockHelper) userInput.lockPointer();
                    if (e !== true) playSound("hit" + Math.floor(6 * Math.random()));

                    if (!muted) {
                        if (audioType == 1) {
                            NativeAudioController.mute(false);
                            unlockAudioContext();
                            applyAudioVolumes();
                            playMusic();
                        } else if (audioType == 2) { playMusic(); }
                    }

                    userInput.removeHitArea("quitFromPause");
                    userInput.removeHitArea("playFromPause");
                    userInput.removeHitArea("restartFromPause");
                    userInput.removeHitArea("control0FromPause");
                    userInput.removeHitArea("control1FromPause");
                    userInput.removeHitArea("mute");
                    resumeGame();
                    break;

                case "restartFromPause":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    if (!muted) {
                        if (audioType == 1) {
                            NativeAudioController.mute(false);
                            unlockAudioContext();
                            applyAudioVolumes();
                            playMusic();
                        } else if (audioType == 2) { playMusic(); }
                    }
                    userInput.removeHitArea("quitFromPause");
                    userInput.removeHitArea("playFromPause");
                    userInput.removeHitArea("restartFromPause");
                    userInput.removeHitArea("mute");
                    initGame(true);
                    break;

                case "quitFromPause":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    if (!muted) {
                        if (audioType == 1) {
                            NativeAudioController.mute(false);
                            unlockAudioContext();
                            applyAudioVolumes();
                            playMusic();
                            music.fade(music.volume(), 0.05 * masterVolume, 500);
                        } else if (audioType == 2) {
                            playMusic();
                        }
                    }
                    userInput.removeHitArea("quitFromPause");
                    userInput.removeHitArea("playFromPause");
                    userInput.removeHitArea("restartFromPause");
                    userInput.removeHitArea("mute");
                    initStartScreen();
                    break;

                // ------------------------------------
                // NHÓM KẾT THÚC GAME & KHÁC
                // ------------------------------------
                case "nextFromGameComplete":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("backFromGameComplete");
                    userInput.removeHitArea("nextFromGameComplete");

                    if (oGameData.userScore > oGameData.enemyScore) {
                        initGameIntro();
                    } else {
                        initGame(true);
                    }
                    break;

                case "backFromGameComplete":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("backFromGameComplete");
                    userInput.removeHitArea("nextFromGameComplete");
                    initStartScreen();
                    break;

                case "helpButton":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    initHelp();
                    break;

                case "closeHelp":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    userInput.removeHitArea("closeHelp");
                    gameState = "game";
                    setFloatingButtonsVisible(true);
                    userInput.removeHitArea("helpButton");

                    userInput.addHitArea("pause", butEventHandler, null, "rect", { aRect: [-90 - 35, 32 - 36, -90 + 35, 32 + 36], align: [1, 0] }, true);
                    if (isMobile) {
                        userInput.addHitArea("gameTouch", butEventHandler, { isDraggable: true, multiTouch: true }, "rect", { aRect: [0, 0, canvas.width, canvas.height] }, true);
                    }

                    panel = new Elements.Panel(gameState, []);
                    previousTime = new Date().getTime();
                    updateGameEvent();
                    break;

                case "moreGames":
                case "moreGamesPause":
                    playSound("hit" + Math.floor(6 * Math.random()));
                    if (window.remix && window.remix.moreGamesLink) window.remix.moreGamesLink();
                    break;
            }
        }

        function updateScore(t, e) {
            panel.cardTween(t);

            rallyHits <= 4 && Math.random() > 0.5
                ? playSound("cheer" + Math.floor(2 * Math.random()))
                : rallyHits > 4 && rallyHits <= 7
                    ? playSound("cheer" + (1 + Math.floor(2 * Math.random())))
                    : rallyHits > 7 && rallyHits <= 10
                        ? playSound("cheer" + (2 + Math.floor(2 * Math.random())))
                        : rallyHits > 10 && playSound("cheer" + (3 + Math.floor(2 * Math.random())));

            let a = 11;
            if (
                null != forcedModeProperties &&
                null != forcedModeProperties.override &&
                "number" == typeof forcedModeProperties.override.max_score
            ) {
                a = forcedModeProperties.override.max_score;
            }

            if ("user" == t) {
                oGameData.userScore++;
                totalScore++;
                points_in_series_player++;
                points_in_series_opponent = 0;
                playSound("userPoint");
                if (
                    (oGameData.userScore >= a && (a < 2 || oGameData.enemyScore <= oGameData.userScore - 2)) ||
                    99 == oGameData.userScore
                ) {
                    initGameComplete();
                }
            } else {
                oGameData.enemyScore++;
                points_in_series_opponent++;
                points_in_series_player = 0;
                playSound("enemyPoint");
                if (
                    (oGameData.enemyScore >= a && (a < 2 || oGameData.userScore <= oGameData.enemyScore - 2)) ||
                    99 == oGameData.enemyScore
                ) {
                    initGameComplete();
                }
            }
        }

        function initGameComplete() {
            if (oGameData.userScore > oGameData.enemyScore) {
                won_matches_in_series_opponent = 0;
                won_matches_in_series_player++;
            } else {
                won_matches_in_series_player = 0;
                won_matches_in_series_opponent++;
            }
            _initGameComplete();
        }

        function _initGameComplete() {
            if (window.remix.pointerLockHelper) userInput.unlockPointer();
            gameState = "gameComplete";

            // Làm to nhạc nền
            if (1 == audioType) music.fade(music.volume(), 0.5 * masterVolume, 500);

            userInput.removeHitArea("pause");
            userInput.removeHitArea("gameTouch");

            // --- LOGIC TÍNH ĐIỂM (GIỮ NGUYÊN) ---
            if (oGameData.userScore > oGameData.enemyScore) {
                // THẮNG
                playSound("winGame");
                if (audioType == 1 && !muted && applauseSound) {
                    applauseSound.play();
                }

                lastCompletedLevel = getCurrentLevel();
                advanceToNextLevel();
                justWonCup = !1;
                saveDataHandler.setGameData(oGameData);
                saveDataHandler.saveData();

                setTimeout(() => {
                }, 1500);

            } else {
                // THUA
                playSound("loseGame");
                if (window.FarcadeSDK) window.FarcadeSDK.singlePlayer.actions.gameOver({ score: totalScore });

                setTimeout(() => {
                }, 1500);
            }

            // --- QUAN TRỌNG: TẠO VÙNG BẤM TOÀN MÀN HÌNH ---
            // Không tạo nút hiển thị (Menu/Next) nữa
            var buttons = [];
            panel = new Elements.Panel(gameState, buttons);
            aEffects = new Array();

            // Sau 0.5 giây, tạo vùng bấm tàng hình phủ kín màn hình
            // ID "nextFromGameComplete" sẽ được xử lý ở Bước 2
            setTimeout(() => {
                userInput.addHitArea(
                    "nextFromGameComplete",
                    butEventHandler,
                    null,
                    "rect",
                    { aRect: [0, 0, canvas.width, canvas.height] },
                    true
                );
            }, 500);

            previousTime = new Date().getTime();
            updateGameComplete();
        }

        function addFirework(t, e, a) {
            if ((void 0 === a && (a = 1), !(aEffects.length > 10))) {
                var i = new Elements.Firework();
                (i.x = t), (i.y = e), (i.scaleX = i.scaleY = a), aEffects.push(i);
            }
        }

        // ==========================================
        // 5. KHỞI TẠO VÀ VÒNG LẶP GAME (ES6 CLEANED)
        // ==========================================

        // === 联机：注册网络消息回调 ===
        var netBatSendAccum = 0;
        function initOnlineNet() {
            if (!window.net) return;
            net.onMessage = function (msg) {
                if (!msg) return;
                switch (msg.t) {
                    case "hit":
                        applyRemoteHit(msg);
                        break;
                    case "bat":
                        // 对方球拍位置（对方视角 user）镜像到本方 enemy
                        if (enemyBat && enemyBat.setNetPos) {
                            enemyBat.setNetPos(
                                canvas.width / 2 - msg.nx * 140,
                                canvas.height / 4 + 50 * tableTop.offsetY - 45 - msg.nd * 40
                            );
                        }
                        break;
                    case "point":
                        if (!net.isHost) applyRemotePoint(msg);
                        break;
                    case "profile":
                        if (msg.userId != null) oGameData.enemyId = msg.userId;
                        break;
                    case "rematch":
                        _initGame();
                        break;
                }
            };
            net.onPeerLeave = function () {
                // 对手离开，回到主菜单
                if (gameState === "game" || gameState === "gameComplete") {
                    isOnline = false;
                    if (window.confirm("对手已离开。返回主菜单？")) initStartScreen();
                }
            };
        }

        // === 联机：每帧发送本地球拍位置（约 30Hz，不可靠） ===
        function netSendBatPos() {
            if (!isOnline || !net.connected || !userBat) return;
            netBatSendAccum += delta;
            if (netBatSendAccum >= 1 / 30) {
                netBatSendAccum = 0;
                // nx：横向 -1..1；nd：离桌深度 0..1（越大越靠后）
                var nx = Math.max(-1, Math.min(1, (userBat.x - canvas.width / 2) / 300));
                var nd = Math.max(0, Math.min(1, (userBat.y - userBat.maxY) / (canvas.height - userBat.maxY)));
                if (isFinite(nx) && isFinite(nd)) net.send({ t: "bat", nx: nx, nd: nd }, false);
            }
        }

        function initGame(t) {
            _initGame();
        }

        function _initGame() {
            // 1. Dọn dẹp bộ nhớ (Tránh rác làm lag game)
            if (background) background = null;
            if (tableTop) tableTop = null;
            if (userBat) userBat = null;
            if (enemyBat) {
                if (enemyBat.moveTween) enemyBat.moveTween.kill();
                enemyBat = null;
            }
            if (ball) {
                if (ball.servePrepTween) ball.servePrepTween.kill();
                if (ball.offTableTween) ball.offTableTween.kill();
                ball = null;
            }

            oGameData.userScore = 0;
            oGameData.enemyScore = 0;
            gameState = "game";

            if (window.remix.hasFeature("lockPointer")) {
                window.remix.pointerLockHelper || (window.remix.pointerLockHelper = {});
                window.remix.pointerLockHelper.mousePos = { x: fenster.innerWidth / 2, y: fenster.innerHeight / 2 };
                userInput.lockPointer();
            }

            justWonCup = !1;

            // 2. Khởi tạo Thực thể mới
            background = new Elements.Background();
            tableTop = new Elements.TableTop();
            userBat = new Elements.UserBat();
            enemyBat = isOnline ? new Elements.RemoteBat() : new Elements.EnemyBat();
            ball = new Elements.Ball();

            // 3. Quyết định quyền giao bóng
            // 联机时：发球权由 host 决定，避免两边随机不一致。host 先发。
            var hostServes = isOnline ? net.isHost : (Math.random() < 0.5);
            if (!hostServes) {
                player_serve = false;
                ball.resetServe("enemy");
            } else {
                player_serve = true;
                ball.resetServe("user");
            }

            panel = new Elements.Panel(gameState, []);
            setFloatingButtonsVisible(true);
            userInput.removeHitArea("helpButton");

            if (isMobile) {
                userInput.addHitArea("gameTouch", butEventHandler, { isDraggable: !0, multiTouch: !0 }, "rect", { aRect: [0, 0, canvas.width, canvas.height] }, !0);
            }

            previousTime = new Date().getTime();

            previousTime = new Date().getTime();

            window.remix_game.start = () => {
                playSound("gameStart");
                playSound("cheer" + Math.floor(4 * Math.random()));
                if (audioType === 1) {
                    music.fade(music.volume(), 0.1 * masterVolume, 1000);
                }
            };

            window.remix.paused = false;
            window.remix_game.start();
            window.remix.gameReady();
            window.remix.playerReady();

            // 4. Gọi vòng lặp đầu tiên
            updateGameEvent();
        }

        function updateGameEvent() {
            // Bảo vệ: Nếu Remix SDK báo Retry, ngắt ngay vòng lặp cũ
            if (gameState === "kill_loop") return;

            if (gameState === "game") {
                delta = getDelta();
                background.renderGame();

                // Chỉ tính toán vật lý khi không Pause
                if (!window.remix.paused) {
                    ball.update();
                    enemyBat.update();
                    userBat.update();
                    netSendBatPos();
                }

                // --- SẮP XẾP THỨ TỰ VẼ (Z-INDEX) RÕ RÀNG ---
                const isBallOutOfBounds = ball.offTable || ball.offSide || (ball.height < 0 && ball.tablePosY < 0.5 && (ball.tablePosX < -1 || ball.tablePosX > 1));

                if (isBallOutOfBounds) {
                    ball.render();
                    tableTop.render();
                    enemyBat.render();
                    tableTop.renderNet();
                } else if (ball.tablePosY > 0.5) {
                    tableTop.render();
                    enemyBat.render();
                    tableTop.renderNet();
                    ball.render();
                } else {
                    tableTop.render();
                    enemyBat.render();
                    ball.render();
                    tableTop.renderNet();
                }

                userBat.render();
                panel.render();

                requestAnimFrame(updateGameEvent);
            }
        }

        function updateCreditsScreenEvent() {
            "credits" == gameState &&
                ((delta = getDelta()),
                    background.renderMenu(),
                    panel.update(),
                    panel.render(),
                    (ctx.fillStyle = "#ffffff"),
                    (ctx.textAlign = "center"),
                    (ctx.font = "15px Helvetica"),
                    ctx.fillText("v1.0.2", canvas.width / 2, 20),
                    requestAnimFrame(updateCreditsScreenEvent));
        }

        function updateChooseCountryScreenEvent() {
            "chooseCountry" == gameState &&
                ((delta = getDelta()),
                    // Phủ kín toàn bộ sân và nhà thi đấu trong màn hình chọn team.
                    background.renderTeamSelectionCover(),
                    panel.update(),
                    panel.render(),
                    requestAnimFrame(updateChooseCountryScreenEvent));
        }

        function updateGameComplete() {
            if ("gameComplete" == gameState) {
                (delta = getDelta()),
                    background.renderMenu(),
                    panel.update(),
                    panel.render(),
                    // --- SỬA LỖI TẠI ĐÂY ---
                    // Cũ: justWonCup && Math.random() < 0.1 && ...
                    // Mới: Kiểm tra điểm số > đối thủ là cho bắn pháo hoa luôn
                    oGameData.userScore > oGameData.enemyScore &&
                    Math.random() < 0.1 &&
                    (playSound("firework"),
                        addFirework(Math.random() * canvas.width, Math.random() * canvas.height, 1 * Math.random() + 2));
                // ------------------------

                for (var t = 0; t < aEffects.length; t++)
                    aEffects[t].update(), aEffects[t].render(ctx), aEffects[t].removeMe && (aEffects.splice(t, 1), (t -= 1));
                requestAnimFrame(updateGameComplete);
            }
        }

        function updateSplashScreenEvent() {
            if ("splash" == gameState) {
                if (((delta = getDelta()), (splashTimer += delta) > 2.5))
                    return 1 != audioType || muted || (playMusic(), hasFocus || music.pause()), void initStartScreen();
                background.renderMenu(), panel.update(), panel.render(), requestAnimFrame(updateSplashScreenEvent);
            }
        }

        function updateStartScreenEvent() {
            "start" == gameState &&
                ((delta = getDelta()),
                    background.renderMenu(),
                    panel.update(),
                    panel.render(),
                    requestAnimFrame(updateStartScreenEvent));
        }

        function updateGameIntroScreenEvent() {
            "gameIntro" == gameState &&
                ((delta = getDelta()),
                    // Nền VS phủ kín: sân đấu chỉ xuất hiện sau khi bấm START MATCH.
                    background.renderMatchIntroCover(),
                    panel.update(),
                    panel.render(),
                    requestAnimFrame(updateGameIntroScreenEvent));
        }

        function updateMapScreenEvent() {
            "map" == gameState &&
                ((delta = getDelta()),
                    background.renderMenu(),
                    panel.update(),
                    panel.render(),
                    requestAnimFrame(updateMapScreenEvent));
        }

        function updateLoaderEvent() {
            "load" == gameState && ((delta = getDelta()), assetLib.render(), requestAnimFrame(updateLoaderEvent));
        }

        function updatePauseEvent() {
            "pause" == gameState &&
                ((delta = getDelta()), background.renderMenu(), panel.render(), requestAnimFrame(updatePauseEvent));
        }
        function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();

            if (fill) ctx.fill();
            if (stroke) ctx.stroke();
        }
        function getDelta() {
            var t = new Date().getTime(),
                e = (t - previousTime) / 1e3;
            return (previousTime = t), e > 0.5 && (e = 0), e;
        }

        function checkSpriteCollision(t, e) {
            var a = t.x,
                i = t.y,
                s = e.x,
                o = e.y;
            return (a - s) * (a - s) + (i - o) * (i - o) < t.radius * e.radius;
        }

        function getScaleImageToMax(t, e) {
            return t.isSpriteSheet
                ? e[0] / t.oData.spriteWidth < e[1] / t.oData.spriteHeight
                    ? Math.min(e[0] / t.oData.spriteWidth, 1)
                    : Math.min(e[1] / t.oData.spriteHeight, 1)
                : e[0] / t.img.width < e[1] / t.img.height
                    ? Math.min(e[0] / t.img.width, 1)
                    : Math.min(e[1] / t.img.height, 1);
        }

        function getCentreFromTopLeft(t, e, a) {
            var i = new Array();
            return i.push(t[0] + (e.oData.spriteWidth / 2) * a), i.push(t[1] + (e.oData.spriteHeight / 2) * a), i;
        }

        function loadPreAssets() {
            curLang = aLangs[0];
            preAssetLib = new Utils.AssetLoader(
                curLang,
                [
                    {
                        id: "loader",
                        file: ASSET_BASE + "loader1-tXWgrQ5K3rJFQaR6SqTreYm7ALvAEF.webp?AzuK",
                    },
                    {
                        id: "loadSpinner",
                        file: ASSET_BASE + "loadSpinner-2cVTR8NrVCnaP0TKDqOy5AnYJvq29o.webp?DbA0",
                    },
                ],
                ctx,
                canvas.width,
                canvas.height,
                !1,
            );
            preAssetLib.onReady(initLoadAssets);
        }

        function initLangSelect() {
            for (
                var t, e, a, i, s = 0, o = 0;
                o < aLangs.length &&
                (o + 1) * (1 * (t = preAssetLib.getData("lang" + aLangs[o])).img.width) + 10 * (o + 2) < canvas.width;
                o++
            )
                s++;
            i = Math.ceil(aLangs.length / s);
            for (o = 0; o < aLangs.length; o++) {
                (t = preAssetLib.getData("lang" + aLangs[o])),
                    (e = canvas.width / 2 - (s / 2) * (1 * t.img.width) - ((s - 1) / 2) * 10),
                    (e += (o % s) * (1 * t.img.width + 10)),
                    (a = canvas.height / 2 - (i / 2) * (1 * t.img.height) - ((i - 1) / 2) * 10),
                    (a += (Math.floor(o / s) % i) * (1 * t.img.height + 10)),
                    ctx.drawImage(t.img, 0, 0, t.img.width, t.img.height, e, a, 1 * t.img.width, 1 * t.img.height);
                var r = {
                    oImgData: t,
                    aPos: [e + (1 * t.img.width) / 2, a + (1 * t.img.height) / 2],
                    scale: 1,
                    id: "none",
                    noMove: !0,
                };
                userInput.addHitArea(
                    "langSelect",
                    butEventHandler,
                    {
                        lang: aLangs[o],
                    },
                    "image",
                    r,
                );
            }
        }

        function initLoadAssets() {
            loadAssets();
        }

        function loadAssets() {
            assetLib = new Utils.AssetLoader(
                curLang,
                [
                    {
                        id: "paddleLogo",
                        file: ASSET_BASE + "remix_logo-1yebCct4IL-ySAmUer7Vle7uFqxTNcsuqxbbgCaqU.webp?mp5h",
                    },
                    // --- NHÓM 1: UI & BUTTONS ---
                    {
                        id: "uiButs",
                        file: ASSET_BASE + "uiButs-00U5SBOsXVkYcitcExjuTxS2bSLCZi.webp?hLDu",
                        oAtlasData: {
                            id0: { x: 0, y: 204, width: 197, height: 101 }, // Play
                            id1: { x: 384, y: 373, width: 57, height: 64 }, // Info
                            id2: { x: 369, y: 156, width: 65, height: 66 }, // Mute 1
                            id3: { x: 369, y: 224, width: 64, height: 65 }, // Mute 0
                            id4: { x: 298, y: 156, width: 69, height: 67 }, // Back
                            id5: { x: 199, y: 100, width: 97, height: 98 }, // Cups
                            id6: { x: 0, y: 0, width: 197, height: 102 }, // Restart
                            id7: { x: 0, y: 307, width: 115, height: 98 }, // More Games
                            id8: { x: 298, y: 225, width: 69, height: 72 }, // Pause
                            id9: { x: 316, y: 299, width: 68, height: 72 }, // Reset
                            id10: { x: 298, y: 100, width: 75, height: 54 }, // Country
                            id11: { x: 298, y: 0, width: 97, height: 98 }, // Control 0 On
                            id12: { x: 217, y: 300, width: 97, height: 98 }, // Control 1 On
                            id13: { x: 0, y: 104, width: 197, height: 98 }, // Quit
                            id14: { x: 199, y: 200, width: 97, height: 98 }, // Control 0 Off
                            id15: { x: 199, y: 0, width: 97, height: 98 }, // Control 1 Off
                            id16: { x: 117, y: 307, width: 98, height: 98 }, // Tick
                            id17: { x: 316, y: 373, width: 66, height: 57 }, // More
                        },
                    },
                    {
                        id: "uiElements",
                        file: ASSET_BASE + "uiElements1-WkgDwewChuI1InH8jE5vmh2S09drcS.webp?HFqE",
                        oAtlasData: {
                            id0: { x: 499, y: 823, width: 441, height: 106 }, // Title Logo
                            id1: { x: 499, y: 545, width: 452, height: 276 }, // Title Bats
                            id2: { x: 0, y: 0, width: 700, height: 154 }, // Fade Bar
                            id3: { x: 702, y: 0, width: 113, height: 82 }, // Country But BG
                            id4: { x: 741, y: 962, width: 84, height: 80 }, // VS Text
                            id5: { x: 621, y: 156, width: 268, height: 307 }, // Flare
                            id6: { x: 891, y: 0, width: 119, height: 159 }, // Win Icon
                            id7: { x: 891, y: 161, width: 119, height: 159 }, // Lose Icon
                            id8: { x: 499, y: 931, width: 240, height: 118 }, // Globe Logo
                            id9: { x: 953, y: 599, width: 112, height: 137 }, // Cup 1
                            id10: { x: 942, y: 823, width: 112, height: 137 }, // Cup 2
                            id11: { x: 891, y: 322, width: 112, height: 137 }, // Cup 3
                            id12: { x: 953, y: 461, width: 112, height: 136 }, // Cup 0
                            id13: { x: 621, y: 465, width: 59, height: 59 }, // Title Ball
                            id14: { x: 0, y: 156, width: 619, height: 387 }, // Map
                            id15: { x: 682, y: 465, width: 57, height: 56 }, // Map Marker 2
                            id16: { x: 741, y: 465, width: 57, height: 56 }, // Map Marker 1
                            id17: { x: 702, y: 84, width: 57, height: 56 }, // Map Marker 0
                            id18: { x: 0, y: 545, width: 497, height: 498 }, // Tut Screen
                        },
                    },

                    // --- NHÓM 2: HÌNH ẢNH MỚI ---
                    {
                        id: "newTitleBats",
                        file: ASSET_BASE + "pingpongx-3kpq13bIyABC9fFUhT7Onll17wJ2iE.webp?Gshn",
                    },

                    // --- NHÓM 3: GAMEPLAY ASSETS (ĐÃ XÓA bgMain) ---
                    {
                        id: "countryFlags",
                        file: ASSET_BASE + "countryFlags-O63g3AUSNH1afGhxSe8UtZBgVkQFyd.webp?jJnA",
                    },
                    {
                        id: "gameElements",
                        file: ASSET_BASE + "gameElements-f1-jSjfi3d7WU8mv2kDm10HRn8EZmAKWH.webp?sRx5",
                        oAtlasData: {
                            id0: { x: 637, y: 1128, width: 590, height: 234 },
                            id1: { x: 0, y: 1527, width: 414, height: 41 },
                            id2: { x: 632, y: 1616, width: 39, height: 39 },
                            id3: { x: 168, y: 1630, width: 37, height: 21 },
                            id4: { x: 1344, y: 846, width: 113, height: 186 },
                            id5: { x: 0, y: 1630, width: 127, height: 24 },
                            id6: { x: 591, y: 1616, width: 39, height: 40 },
                            id7: { x: 591, y: 1572, width: 41, height: 42 },
                            id8: { x: 557, y: 1527, width: 43, height: 43 },
                            id9: { x: 512, y: 1527, width: 43, height: 44 },
                            id10: { x: 466, y: 1527, width: 44, height: 44 },
                            id11: { x: 1274, y: 188, width: 113, height: 186 },
                            id12: { x: 1344, y: 1034, width: 109, height: 110 },
                            id13: { x: 0, y: 1570, width: 404, height: 9 },
                            id14: { x: 0, y: 1600, width: 589, height: 28 },
                            id15: { x: 0, y: 0, width: 635, height: 372 },
                            id16: { x: 1229, y: 656, width: 432, height: 188 },
                            id17: { x: 637, y: 892, width: 590, height: 234 },
                            id18: { x: 637, y: 1364, width: 590, height: 234 },
                            id19: { x: 1229, y: 846, width: 113, height: 186 },
                            id20: { x: 1274, y: 376, width: 113, height: 186 },
                            id21: { x: 1229, y: 1034, width: 113, height: 186 },
                            id22: { x: 1229, y: 1410, width: 113, height: 186 },
                            id23: { x: 1229, y: 1222, width: 113, height: 186 },
                            id24: { x: 1274, y: 0, width: 113, height: 186 },
                            id25: { x: 0, y: 374, width: 635, height: 500 },
                            id26: { x: 416, y: 1527, width: 48, height: 60 },
                            id27: { x: 637, y: 656, width: 590, height: 234 },
                            id28: { x: 0, y: 876, width: 635, height: 274 },
                            id29: { x: 637, y: 0, width: 635, height: 373 },
                            id30: { x: 0, y: 1152, width: 635, height: 373 },
                            id31: { x: 637, y: 375, width: 635, height: 279 },
                            id32: { x: 1274, y: 564, width: 85, height: 85 },
                            id33: { x: 129, y: 1630, width: 37, height: 21 },
                        },
                    },

                    // --- NHÓM 4: FONTS & EFFECTS (ĐÃ XÓA smallNumbers) ---
                    {
                        id: "largeNumbers",
                        file: ASSET_BASE + "largeNumbers_75x132-z9khZdj7x2aLg3wQJWf7rwXAUU8DQT.webp?JNur",
                        spriteSize: [75, 132],
                    },
                    {
                        id: "firework",
                        file: ASSET_BASE + "firework_175x175-EbfzIq2vhREv7GWNQURdIxZkwnaYYr.webp?7a5C",
                        spriteSize: [175, 175],
                        oAnims: {
                            explode: [
                                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
                                28, 29,
                            ],
                        },
                    },
                    {
                        id: "shadow",
                        file: ASSET_BASE + "shadow-MQU9mCGhfkSY23xpoGcZ5mGShnctC2.webp?YFkb",
                    },
                ],
                ctx,
                canvas.width,
                canvas.height,
            );

            (oImageIds.table0 = "id0"),
                (oImageIds.net = "id1"),
                (oImageIds.ball = "id2"),
                (oImageIds.ballShadow = "id3"),
                (oImageIds.userBatCentre = "id4"),
                (oImageIds.batShadow = "id5"),
                (oImageIds.ballTrail4 = "id6"),
                (oImageIds.ballTrail3 = "id7"),
                (oImageIds.ballTrail2 = "id8"),
                (oImageIds.ballTrail1 = "id9"),
                (oImageIds.ballTrail0 = "id10"),
                (oImageIds.enemyBat0 = "id11"),
                (oImageIds.userBatEdge = "id12"),
                (oImageIds.tableClip = "id13"),
                (oImageIds.tableEdge = "id14"),
                (oImageIds.tableBg0 = "id15"),
                (oImageIds.tableLegs = "id16"),
                (oImageIds.table1 = "id17"),
                (oImageIds.table2 = "id18"),
                (oImageIds.enemyBat1 = "id19"),
                (oImageIds.enemyBat2 = "id20"),
                (oImageIds.enemyBat3 = "id21"),
                (oImageIds.enemyBat4 = "id22"),
                (oImageIds.enemyBat5 = "id23"),
                (oImageIds.enemyBat6 = "id24"),
                (oImageIds.tableBgBottom = "id25"),
                (oImageIds.scoreCard = "id26"),
                (oImageIds.table3 = "id27"),
                (oImageIds.tableBg1 = "id28"),
                (oImageIds.tableBg2 = "id29"),
                (oImageIds.tableBg3 = "id30"),
                (oImageIds.tableBg4 = "id31"),
                (oImageIds.finger = "id32"),
                (oImageIds.bounceMark = "id33"),
                (oImageIds.playBut = "id0"),
                (oImageIds.infoBut = "id1"),
                (oImageIds.muteBut1 = "id2"),
                (oImageIds.muteBut0 = "id3"),
                (oImageIds.backBut = "id4"),
                (oImageIds.cupsBut = "id5"),
                (oImageIds.restartBut = "id6"),
                (oImageIds.moreGamesBut = "id7"),
                (oImageIds.pauseBut = "id8"),
                (oImageIds.resetBut = "id9"),
                (oImageIds.changeCountryBut = "id10"),
                (oImageIds.control0OnBut = "id11"),
                (oImageIds.control1OnBut = "id12"),
                (oImageIds.quitBut = "id13"),
                (oImageIds.control0OffBut = "id14"),
                (oImageIds.control1OffBut = "id15"),
                (oImageIds.tickBut = "id16"),
                (oImageIds.moreBut = "id17"),
                (oImageIds.titleLogo = "id0"),
                (oImageIds.titleBats = "id1"),
                (oImageIds.titleFadeBar = "id2"),
                (oImageIds.countryBut = "id3"),
                (oImageIds.vsText = "id4"),
                (oImageIds.flare = "id5"),
                (oImageIds.winIcon = "id6"),
                (oImageIds.loseIcon = "id7"),
                (oImageIds.globeLogo = "id8"),
                (oImageIds.cup1 = "id9"),
                (oImageIds.cup2 = "id10"),
                (oImageIds.cup3 = "id11"),
                (oImageIds.cup0 = "id12"),
                (oImageIds.titleBall = "id13"),
                (oImageIds.map = "id14"),
                (oImageIds.mapMarker2 = "id15"),
                (oImageIds.mapMarker1 = "id16"),
                (oImageIds.mapMarker0 = "id17"),
                (oImageIds.tutScreen = "id18"),
                assetLib.onReady(initSplash),
                (gameState = "load"),
                (previousTime = new Date().getTime()),
                updateLoaderEvent();
        }
        function resizeCanvas() {
            var t = fenster.innerWidth,
                e = fenster.innerHeight;
            (canvas.height = e),
                (canvas.width = t),
                (canvas.style.width = t + "px"),
                (canvas.style.height = e + "px"),
                t > e
                    ? canvas.height < minSquareSize
                        ? ((canvas.height = minSquareSize),
                            (canvas.width = minSquareSize * (t / e)),
                            (canvasScale = minSquareSize / e))
                        : canvas.height > maxSquareSize
                            ? ((canvas.height = maxSquareSize),
                                (canvas.width = maxSquareSize * (t / e)),
                                (canvasScale = maxSquareSize / e))
                            : (canvasScale = 1)
                    : canvas.width < minSquareSize
                        ? ((canvas.width = minSquareSize),
                            (canvas.height = minSquareSize * (e / t)),
                            (canvasScale = minSquareSize / t))
                        : canvas.width > maxSquareSize
                            ? ((canvas.width = maxSquareSize),
                                (canvas.height = maxSquareSize * (e / t)),
                                (canvasScale = maxSquareSize / t))
                            : (canvasScale = 1),
                "game" == gameState &&
                isMobile &&
                userInput.addHitArea(
                    "gameTouch",
                    butEventHandler,
                    {
                        isDraggable: !0,
                        multiTouch: !0,
                    },
                    "rect",
                    {
                        aRect: [0, 50, canvas.width, canvas.height],
                    },
                    !0,
                ),
                window.scrollTo(0, 0);
        }

        function playSound(t) {
            if (audioType === 1 && !muted && sound) {
                sound.play(t);
            }

            // --- REMIX SDK: HAPTIC FEEDBACK ---
            if (window.RemixSDK && window.RemixSDK.hapticFeedback) {
                if (t.indexOf("hit") !== -1 || t.indexOf("Point") !== -1) {
                    window.RemixSDK.hapticFeedback();
                }
            }
        }

        function toggleMute(t) {
            muted = typeof t === "boolean" ? t : !muted;

            if (audioType === 1) {
                if (muted) {
                    NativeAudioController.mute(true);
                    if (music) music.pause();
                } else {
                    NativeAudioController.mute(false);
                    applyAudioVolumes();
                    installAudioUnlockListeners();
                    unlockAudioContext().then((unlocked) => {
                        if (unlocked && !muted) playMusic();
                    });
                }
            } else if (audioType === 2 && music) {
                muted ? music.pause() : playMusic();
            }
        }

        // --- REMIX SDK: EVENT LISTENERS ---
        // Register mute/unmute callback
        if (window.RemixSDK && window.RemixSDK.onToggleMute) {
            window.RemixSDK.onToggleMute((isMuted) => {
                console.log("Remix SDK Toggle Mute: " + isMuted);
                toggleMute(isMuted);
            });
        }

        // Register play again callback
        if (window.RemixSDK && window.RemixSDK.onPlayAgain) {
            window.RemixSDK.onPlayAgain(() => {
                console.log("Remix SDK: Play Again (Retry Match)");

                // 1. Ngắt vòng lặp game cũ (Tránh lỗi bóng bay xuyên lưới)
                gameState = "kill_loop";
                window.remix.paused = true;

                // 2. Dừng toàn bộ hiệu ứng chuyển động cũ
                TweenMax.killAll(true, true, true, true);

                // 3. Xử lý âm thanh
                if (1 == audioType) {
                    if (!muted) {
                        NativeAudioController.mute(false);
                        installAudioUnlockListeners();
                        unlockAudioContext();
                        applyAudioVolumes();
                        playMusic();
                    }
                } else if (2 == audioType) {
                    if (!muted) playMusic();
                }

                // 4. RESET CÁC CHỈ SỐ CẦN THIẾT
                totalScore = 0; // Reset điểm tổng gửi SDK về 0 (Phiên chơi mới)
                oGameData.userScore = 0; // Reset tỉ số trận đấu về 0
                oGameData.enemyScore = 0; // Reset tỉ số trận đấu về 0

                // 5. Xóa UI cũ (Nút Pause, Game Over...)
                if (userInput) {
                    var buttonsToRemove = [
                        "quitFromPause",
                        "playFromPause",
                        "restartFromPause",
                        "control0FromPause",
                        "control1FromPause",
                        "nextFromGameComplete",
                        "backFromGameComplete",
                        "mute",
                        "gameTouch",
                    ];
                    for (var i = 0; i < buttonsToRemove.length; i++) {
                        userInput.removeHitArea(buttonsToRemove[i]);
                    }
                }

                // 6. Khởi động lại game (RESTART LEVEL)
                setTimeout(() => {
                    // Gọi initGame(true) để báo hiệu đây là RESTART (Giữ nguyên Level)
                    initGame(true);
                }, 50);
            });
        }

        // --- AUDIO UNLOCKER V4: PC + MOBILE + WEBVIEW SAFE ---
        var audioUnlocked = false;
        var audioUnlockListenersInstalled = false;

        function removeAudioUnlockListeners() {
            if (!audioUnlockListenersInstalled) return;
            window.removeEventListener("pointerdown", unlockAudioContext, true);
            window.removeEventListener("touchstart", unlockAudioContext, true);
            window.removeEventListener("mousedown", unlockAudioContext, true);
            window.removeEventListener("click", unlockAudioContext, true);
            window.removeEventListener("keydown", unlockAudioContext, true);
            audioUnlockListenersInstalled = false;
        }

        function unlockAudioContext() {
            if (audioType !== 1 || !NativeAudioController.supported) return Promise.resolve(false);
            if (audioUnlocked && NativeAudioController.ctx.state === "running") return Promise.resolve(true);

            // Nếu context đang suspended/interrupted, giữ listener gesture hoạt động.
            installAudioUnlockListeners();

            return NativeAudioController.unlock().then((unlocked) => {
                if (!unlocked) {
                    audioUnlocked = false;
                    installAudioUnlockListeners();
                    return false;
                }

                audioUnlocked = true;
                removeAudioUnlockListeners();

                if (!muted && hasFocus && !remixPauseActive && gameState !== "pause" && gameState !== "help") {
                    NativeAudioController.mute(false);
                    applyAudioVolumes();
                    playMusic();
                }
                return true;
            }).catch((err) => {
                audioUnlocked = false;
                installAudioUnlockListeners();
                console.warn("Audio unlock retry required:", err);
                return false;
            });
        }

        function installAudioUnlockListeners() {
            if (audioUnlockListenersInstalled || audioType !== 1) return;
            audioUnlockListenersInstalled = true;

            // Capture phase chạy trước handler canvas, vì vậy click đầu tiên cũng có thể phát SFX.
            window.addEventListener("pointerdown", unlockAudioContext, { capture: true, passive: true });
            window.addEventListener("touchstart", unlockAudioContext, { capture: true, passive: true });
            window.addEventListener("mousedown", unlockAudioContext, true);
            window.addEventListener("click", unlockAudioContext, true);
            window.addEventListener("keydown", unlockAudioContext, true);
        }

        installAudioUnlockListeners();

        setupFloatingUi();
        extGameLoad();
    
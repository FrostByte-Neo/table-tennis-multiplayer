
        // Bridge tối giản cho logic cũ của game.
        // Không dùng persistent storage: chỉ giữ interface rỗng để những chỗ gọi cũ không lỗi.
        var noopStorage = {
            getItem() { return null; },
            setItem() { },
            removeItem() { },
            clear() { },
            key() { return null; },
            get length() { return 0; }
        };

        window.remix = {
            hasFeature() {
                return false;
            },
            getVolume() {
                return 1;
            },
            onRequest() { },
            gameReady() { },
            playerReady() { },
            setPreloadProgress() { },
            config: { aid: "standalone" },
            getFeatureProperties() {
                return { state: {}, override: {} };
            }
        };

        window.remix_game = {};
        window.fenster = window;
    
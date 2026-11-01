// API tab Cloudflare tunnel: controls, status/URL rendering, copy wiring, start/stop
// actions, and polling.
(function () {
    "use strict";

    let remoteTunnelTimer = null;
    let deps = {};

    const TUNNEL_STATUS_LABELS = {
        idle: "空闲",
        preparing: "准备中",
        downloading: "下载中",
        starting: "启动中",
        running: "运行中",
        error: "错误",
        stopped: "已停止",
    };

    function configure(nextDeps) {
        deps = Object.assign({}, deps, nextDeps || {});
    }

    function requireDependency(name) {
        const value = deps[name];
        if (typeof value !== "function") {
            throw new Error(`Remote tunnel dependency missing: ${name}`);
        }
        return value;
    }

    function setPolling(enabled) {
        if (enabled && !remoteTunnelTimer) {
            remoteTunnelTimer = setInterval(refreshStatus, 2000);
        } else if (!enabled && remoteTunnelTimer) {
            clearInterval(remoteTunnelTimer);
            remoteTunnelTimer = null;
        }
    }

    function renderStatus(state) {
        const status = state && state.status ? state.status : "idle";
        const url = state && state.url ? state.url : "";
        const message = state && state.message ? state.message : "远程隧道未运行";
        const startBtn = document.getElementById("btn-start-remote-tunnel");
        const stopBtn = document.getElementById("btn-stop-remote-tunnel");
        const badge = document.getElementById("remote-tunnel-badge");
        const statusEl = document.getElementById("remote-tunnel-status");
        const urlRow = document.getElementById("remote-tunnel-url-row");
        const urlLink = document.getElementById("remote-tunnel-url");
        const openAiRow = document.getElementById("remote-openai-url-row");
        const openAiLink = document.getElementById("remote-openai-url");

        const isWorking = status === "preparing" || status === "downloading" || status === "starting";
        const isRunning = status === "running";
        const isError = status === "error";

        if (badge) {
            badge.textContent = TUNNEL_STATUS_LABELS[status] || status.replace(/-/g, " ");
            badge.classList.toggle("running", isRunning);
            badge.classList.toggle("working", isWorking);
            badge.classList.toggle("error", isError);
        }
        if (statusEl) {
            statusEl.textContent = message;
        }
        if (urlRow && urlLink) {
            if (url) {
                urlLink.href = url;
                urlLink.textContent = url;
                urlRow.classList.remove("hidden");
            } else {
                urlLink.href = "#";
                urlLink.textContent = "";
                urlRow.classList.add("hidden");
            }
        }
        if (openAiRow && openAiLink) {
            if (url) {
                const apiUrl = url.replace(/\/+$/, "") + "/v1";
                openAiLink.href = apiUrl;
                openAiLink.textContent = apiUrl;
                openAiRow.classList.remove("hidden");
            } else {
                openAiLink.href = "#";
                openAiLink.textContent = "";
                openAiRow.classList.add("hidden");
            }
        }
        if (startBtn) {
            startBtn.disabled = isWorking || isRunning;
            startBtn.textContent = isWorking ? "运行中..." : "启动隧道";
        }
        if (stopBtn) {
            stopBtn.classList.toggle("hidden", !(isWorking || isRunning));
            stopBtn.disabled = false;
        }

        setPolling(isWorking || isRunning);
    }

    async function refreshStatus() {
        const fetchJson = requireDependency("fetchJson");
        try {
            const state = await fetchJson("/api/remote-tunnel/status");
            renderStatus(state);
            return state;
        } catch (e) {
            const message = "读取远程隧道状态失败：" + e.message;
            if (remoteTunnelTimer) {
                const statusEl = document.getElementById("remote-tunnel-status");
                if (statusEl) statusEl.textContent = message + " 正在重试...";
            } else {
                renderStatus({ status: "error", message });
            }
            return null;
        }
    }

    async function start() {
        const fetchJson = requireDependency("fetchJson");
        const getServerEndpointConfig = requireDependency("getServerEndpointConfig");

        renderStatus({ status: "starting", message: "正在启动 Cloudflare 隧道..." });
        try {
            const endpoint = getServerEndpointConfig();
            const state = await fetchJson("/api/remote-tunnel/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host: endpoint.host,
                    port: endpoint.port,
                }),
            });
            renderStatus(state);
            setPolling(true);
        } catch (e) {
            renderStatus({ status: "error", message: "启动远程隧道失败：" + e.message });
        }
    }

    async function stop() {
        const fetchJson = requireDependency("fetchJson");
        try {
            const state = await fetchJson("/api/remote-tunnel/stop", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            renderStatus(state);
        } catch (e) {
            renderStatus({ status: "error", message: "停止远程隧道失败：" + e.message });
        }
    }

    function init() {
        const copyText = requireDependency("copyText");
        const startBtn = document.getElementById("btn-start-remote-tunnel");
        const stopBtn = document.getElementById("btn-stop-remote-tunnel");
        const copyBtn = document.getElementById("btn-copy-remote-tunnel");
        const copyOpenAiBtn = document.getElementById("btn-copy-remote-openai");
        if (!startBtn || !stopBtn) return;

        startBtn.addEventListener("click", start);
        stopBtn.addEventListener("click", stop);
        if (copyBtn) {
            copyBtn.addEventListener("click", () => {
                const link = document.getElementById("remote-tunnel-url");
                copyText(link ? link.href : "");
            });
        }
        if (copyOpenAiBtn) {
            copyOpenAiBtn.addEventListener("click", () => {
                const link = document.getElementById("remote-openai-url");
                copyText(link ? link.href : "");
            });
        }
        refreshStatus();
    }

    window.LlamaGui = window.LlamaGui || {};
    window.LlamaGui.remoteTunnelUi = {
        configure,
        init,
        setPolling,
        renderStatus,
        refreshStatus,
        start,
        stop,
    };
})();

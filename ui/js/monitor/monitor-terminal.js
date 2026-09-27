// Runtime/header presentation and terminal output; lifecycle and cursors stay in app.js.
(() => {
    "use strict";
    const I = window.LlamaGui._monitorInternal;

    const TERMINAL_MAX_LINES = 5000;
    const TERMINAL_TRIM = 1000;
    function renderRuntime() {
        const state = I.dependencies.getLifecycleSnapshot?.() || {};
        const runtime = state.activeRuntime;
        const target = I.dependencies.getLatestStatus?.()?.external_chat_target;
        const external = !runtime && state.phase === "idle" && target?.connected;
        const phases = { idle: "已停止", starting: "开始", loading: "加载模型", ready: "准备就绪", running: "运行", stopping: "停止", failed: "操作失败" };
        const phaseLabel = external ? "外部服务器"
            : runtime && state.phase === "failed" ? "进程处于活动状态・操作失败"
                : phases[state.phase] || "正在检查…";
        const badge = I.dom.byId("monitor-runtime-state");
        I.dom.setText(badge, phaseLabel);
        if (badge) {
            badge.classList.toggle("badge-green", state.phase === "ready" || state.phase === "running");
            badge.classList.toggle("badge-yellow", Boolean(state.busy) || state.phase === "failed");
        }
        const model = runtime ? String(runtime.alias || runtime.model || "Model 模型不可用")
            : external ? String(target.label || "由 Llama GUI 外部托管") : "没有正在运行的本地进程";
        const modelEl = I.dom.byId("monitor-runtime-model");
        I.dom.setText(modelEl, runtime && !runtime.alias ? model.split(/[\\/]/).pop() : model);
        if (modelEl) modelEl.title = model;
        I.dom.setText(I.dom.byId("monitor-runtime-build"), runtime
            ? [runtime.tool, runtime.backend, runtime.version].filter(Boolean).join(" · ")
            : external ? "llama-server · 由 Llama GUI 外部托管" : "启动模型，以便在此处查看其输出内容和活动情况。");
        const endpoint = runtime?.tool === "llama-server" ? runtime : external ? target : null;
        I.dom.setText(I.dom.byId("monitor-runtime-endpoint"), endpoint?.host && endpoint?.port
            ? `端点：${endpoint.host}:${endpoint.port}` : "");

        const comparison = I.dependencies.compareLaunchSettings?.(runtime);
        const count = comparison?.available ? comparison.changes.length : 0;
        const modelChanged = comparison?.available && (comparison.modelChanged || comparison.modelRootChanged);
        const review = I.dom.byId("btn-monitor-review");
        if (review) {
            review.classList.toggle("hidden", !count && !modelChanged);
            I.dom.setText(review, count ? `查看变更 · ${count}` : "检查模型变更");
        }
        const note = count || modelChanged
            ? "编辑内容将在下次启动时生效，该计数仅统计已记录的图形界面（GUI）设置；API 密钥与自定义启动参数不计入统计。"
            : "";
        I.dom.setText(I.dom.byId("monitor-runtime-note"), note);
        I.dom.byId("monitor-runtime-note")?.classList.toggle("hidden", !note);
        I.dom.setText(I.dom.byId("monitor-runtime-error"), state.error || "");
        I.dom.byId("monitor-runtime-error")?.classList.toggle("hidden", !state.error);
        I.dom.byId("btn-monitor-quick-launch")?.classList.toggle("hidden", Boolean(runtime) || Boolean(state.busy) || Boolean(external));
        I.dom.byId("btn-monitor-api")?.classList.toggle("hidden", !external);
    }

    function updateProcessHeader() {
        renderRuntime();
        const toolBadge = I.dom.byId("monitor-process-tool");
        const stateBadge = I.dom.byId("monitor-process-state");
        const externalNote = I.dom.byId("monitor-external-note");
        const noProcessNote = I.dom.byId("monitor-no-process-note");
        const terminal = I.dom.byId("output-terminal");

        let lifecycle = null;
        let status = null;
        if (typeof I.dependencies.getLifecycleSnapshot === "function") lifecycle = I.dependencies.getLifecycleSnapshot();
        if (typeof I.dependencies.getLatestStatus === "function") status = I.dependencies.getLatestStatus();

        const runtime = lifecycle && lifecycle.activeRuntime;
        const phase = lifecycle && lifecycle.phase;
        const phaseLabels = { starting: "开始", loading: "加载", stopping: "停止" };
        const transitional = Object.prototype.hasOwnProperty.call(phaseLabels, phase);
        const running = Boolean(runtime) || Boolean(transitional);
        const tool = runtime && runtime.tool ? runtime.tool : "";
        const externalTarget = status && status.external_chat_target;
        const externalConnected = phase === "idle" && Boolean(externalTarget && externalTarget.connected);
        const navLive = I.dom.byId("monitor-nav-live");
        if (navLive) navLive.classList.toggle("hidden",
            !((tool === "llama-server" && phase === "ready") || (!running && externalConnected)));

        if (toolBadge) {
            if (running && tool) {
                toolBadge.textContent = tool;
                toolBadge.classList.remove("hidden");
                toolBadge.classList.remove("badge-accent");
                toolBadge.classList.add("badge-neutral");
            } else if (!running && externalConnected) {
                toolBadge.textContent = "外部服务器";
                toolBadge.classList.remove("hidden");
                toolBadge.classList.remove("badge-neutral");
                toolBadge.classList.add("badge-accent");
            } else {
                toolBadge.classList.add("hidden");
            }
        }
        if (stateBadge) {
            if (running) {
                stateBadge.textContent = phaseLabels[phase] || (phase === "failed" ? "操作失败" : phase === "ready" ? "就绪" : "运行中");
                stateBadge.classList.remove("hidden", "badge-dim", "badge-green", "badge-yellow");
                stateBadge.classList.add(transitional || phase === "failed" ? "badge-yellow" : "badge-green");
            } else {
                stateBadge.textContent = "未运行";
                stateBadge.classList.remove("hidden", "badge-green", "badge-yellow");
                stateBadge.classList.add("badge-dim");
            }
        }
        const externalOnly = externalConnected && !running;
        const hasOutput = Boolean(terminal?.children.length);
        I.dom.setText(I.dom.byId("monitor-output-title"), !running && !externalOnly && hasOutput ? "历史输出" : "详细日志");
        I.dom.setText(noProcessNote, hasOutput
            ? "没有正在运行的进程——最近的输出 backlog（积压数据/日志缓存）将保留至下次启动。"
            : "启动模型后，处理输出将显示在此处。");
        if (externalNote) externalNote.classList.toggle("hidden", !externalOnly);
        if (noProcessNote) noProcessNote.classList.toggle("hidden", running || externalOnly);
        if (terminal) terminal.classList.toggle("hidden", externalOnly || (!running && !hasOutput));
        I.inference.renderInferenceAvailability(I.dependencies.getInferenceSnapshot?.());
        // #input-row visibility belongs to app.js, which owns process
        // lifecycle and sets it from the active runtime before calling
        // updateProcessHeader(); touching it here would fight that.
    }

    function terminalEl() {
        return I.dom.byId("output-terminal");
    }

    function scrollTerminalToBottom() {
        const terminal = terminalEl();
        if (terminal) terminal.scrollTop = terminal.scrollHeight;
    }

    function trimTerminal() {
        const terminal = terminalEl();
        if (!terminal) return;
        if (terminal.childElementCount <= TERMINAL_MAX_LINES) return;
        const range = document.createRange ? document.createRange() : null;
        if (range) {
            range.setStartBefore(terminal.firstElementChild);
            range.setEndAfter(terminal.children[TERMINAL_TRIM - 1]);
            range.deleteContents();
        } else {
            for (let i = 0; i < TERMINAL_TRIM; i += 1) {
                if (terminal.firstElementChild) terminal.firstElementChild.remove();
            }
        }
    }

    function appendOutputLine(text) {
        const terminal = terminalEl();
        if (!terminal) return;
        const line = document.createElement("div");
        line.textContent = text;
        terminal.appendChild(line);
        if (terminal.children.length === 1) updateProcessHeader();
        trimTerminal();
        scrollTerminalToBottom();
    }

    function clearTerminal() {
        const terminal = terminalEl();
        if (terminal) terminal.replaceChildren();
        // Advance the cursor epoch without discarding the cursor; otherwise
        // the next cursorless request would replay the whole backend backlog.
        if (typeof I.dependencies.invalidateCursor === "function") I.dependencies.invalidateCursor();
        updateProcessHeader();
    }

    I.terminal = {
        appendOutputLine,
        clearTerminal,
        renderRuntime,
        scrollTerminalToBottom,
        updateProcessHeader,
    };
})();

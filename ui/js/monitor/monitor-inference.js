// Monitor and fixed-bar rendering of the single shared inference snapshot.
(() => {
    "use strict";
    const I = window.LlamaGui._monitorInternal;

    function setInferenceText(id, text) {
        const el = I.dom.byId(id);
        if (el) el.textContent = text;
    }

    function renderInferenceAvailability(snapshot) {
        const state = I.dependencies.getLifecycleSnapshot?.() || {};
        let message = "";
        if (!snapshot?.targetKey) {
            message = state.phase === "starting" || state.phase === "loading"
                ? "正在等待 llama-server 就绪。请在进程输出中查看加载进度。"
                : state.phase === "stopping"
                    ? "进程正在停止。服务器就绪后将恢复推理数据读取。"
                    : state.activeRuntime && state.activeRuntime.tool !== "llama-server"
                        ? `${state.activeRuntime.tool} 不提供服务器推理指标。请查看上方输出；系统监控数据仍可独立使用。`
                        : "启动或连接到一个 llama-server，以便查看 Token、请求以及上下文相关活动，无需使用 GPU 监控工具。";
        } else if (snapshot.seq === 1) {
            message = "正在等待此服务器的首条推理采样数据。";
        } else {
            const notes = [];
            if (snapshot.sources?.metrics !== "ok") notes.push("会话计数器不可用：请检查服务器连接以及是否启用了 --metrics。");
            if (snapshot.sources?.slots !== "ok") notes.push("槽位活动和上下文不可用：请检查服务器连接以及是否启用了 /slots。");
            message = notes.join(" ");
        }
        I.dom.setText(I.dom.byId("monitor-inference-note"), message);
        I.dom.byId("monitor-inference-note")?.classList.toggle("hidden", !message);
    }

    function renderInferenceSnapshot(snapshot) {
        renderInferenceAvailability(snapshot);
        const kicker = I.dom.byId("monitor-inference-kicker");
        const badge = I.dom.byId("monitor-inference-state-badge");
        const body = I.dom.byId("monitor-inference-body");
        const empty = I.dom.byId("monitor-inference-empty");
        if (!kicker || !badge || !body || !empty) return;

        if (!snapshot || !snapshot.targetKey) {
            kicker.textContent = "Llama 服务器";
            badge.textContent = "不可用";
            badge.classList.remove("badge-green", "badge-neutral");
            badge.classList.add("badge-dim");
            badge.classList.remove("hidden");
            body.classList.add("hidden");
            empty.classList.remove("hidden");
            return;
        }

        const processing = snapshot.requests ? snapshot.requests.processingBest : null;
        const activityUnknown = processing === null || processing === undefined;
        const stateText = activityUnknown ? "活动状态未知" : processing > 0 ? "处理中" : "空闲";
        const external = String(snapshot.targetKey).startsWith("ext:");
        const target = external ? I.dependencies.getLatestStatus?.()?.external_chat_target : null;
        kicker.textContent = external && target?.host && target?.port
            ? `外部 llama-server · ${target.host}:${target.port}`
            : `Llama 服务器 · ${stateText}`;
        if (processing !== null && processing > 0) {
            badge.textContent = `活动请求：${processing}`;
            badge.classList.remove("badge-dim", "badge-neutral");
            badge.classList.add("badge-green");
        } else if (activityUnknown) {
            badge.textContent = stateText;
            badge.classList.remove("badge-green", "badge-neutral");
            badge.classList.add("badge-dim");
        } else {
            badge.textContent = stateText;
            badge.classList.remove("badge-green", "badge-dim");
            badge.classList.add("badge-neutral");
        }
        badge.classList.remove("hidden");
        empty.classList.add("hidden");
        body.classList.remove("hidden");

        const session = snapshot.session || {};
        setInferenceText("monitor-inference-prompt",
            session.prompt === null ? "--" : `${I.dom.formatTokens(session.prompt)} 个 Token`);
        setInferenceText("monitor-inference-generated",
            session.generated === null ? "--" : `${I.dom.formatTokens(session.generated)} 个 Token`);
        setInferenceText("monitor-inference-total",
            session.total === null ? "--" : `${I.dom.formatTokens(session.total)} 个 Token`);

        const context = snapshot.context;
        const contextLabel = I.dom.byId("monitor-inference-context-label");
        const contextReading = I.dom.byId("monitor-inference-context-reading");
        const contextBarHolder = I.dom.byId("monitor-inference-context-bar");
        if (contextLabel) {
            contextLabel.textContent = context
                ? `上下文 · 当前插槽占用（${context.isProcessing ? "活跃" : "空闲"}）`
                : "上下文 \u00b7 当前插槽占用";
        }
        if (contextReading) {
            contextReading.textContent = context
                ? `${I.dom.formatTokens(context.used)} / ${I.dom.formatTokens(context.total)} · 剩余 ${I.dom.formatTokens(context.remaining)}`
                : "暂无数据";
            contextReading.classList.toggle("monitor-not-available", !context);
            contextReading.classList.toggle("monitor-metric-reading", Boolean(context));
        }
        if (contextBarHolder) {
            let bar = contextBarHolder.querySelector(".progress-bar");
            if (!bar) {
                bar = I.dom.makeProgressBar("Most-filled slot context usage", null);
                contextBarHolder.replaceChildren(bar);
            }
            I.dom.updateProgressBar(bar, context ? context.percent : null, "Most-filled slot context usage");
            const fill = bar.querySelector(".progress-fill");
            if (fill) {
                fill.classList.toggle("progress-fill-critical", Boolean(context) && snapshot.contextLevel === "critical");
                fill.classList.toggle("progress-fill-warning", Boolean(context) && snapshot.contextLevel === "warning");
            }
        }

        const speed = snapshot.speed || {};
        setInferenceText("monitor-inference-prompt-speed-label",
            speed.promptIsLive ? "实时提示词速度" : "平均提示词速度");
        setInferenceText("monitor-inference-gen-speed-label",
            speed.generatedIsLive ? "实时生成速度" : "平均生成速度");
        setInferenceText("monitor-inference-prompt-speed",
            speed.prompt === null || speed.prompt === undefined ? "--" : `${I.dom.formatSpeed(speed.prompt)} tok/s`);
        setInferenceText("monitor-inference-gen-speed",
            speed.generated === null || speed.generated === undefined ? "--" : `${I.dom.formatSpeed(speed.generated)} tok/s`);

        const requests = snapshot.requests || {};
        const requestParts = [];
        if (requests.processing !== null && requests.processing !== undefined) {
            requestParts.push(`活动 ${requests.processing}`);
        }
        if (requests.queued !== null && requests.queued !== undefined) {
            requestParts.push(`排队 ${requests.queued}`);
        }
        setInferenceText("monitor-inference-requests", requestParts.length ? requestParts.join(" \u00b7 ") : "--");

        setInferenceText("monitor-inference-slots", snapshot.slots
            ? `忙碌槽位：${snapshot.slots.busy} / ${snapshot.slots.total}`
            : "--");
    }

    function renderStatsBarFromSnapshot(snapshot, targetDocument = document) {
        const doc = targetDocument || document;
        const get = id => doc.getElementById(id);
        const set = (id, value, format) => {
            const element = get(id);
            if (element) element.textContent = value === null || value === undefined ? "--" : format(value);
        };
        const bar = get("stats-bar");
        if (!bar) return;
        if (!snapshot || !snapshot.targetKey) {
            bar.classList.add("hidden");
            for (const id of ["stats-prompt-tokens", "stats-prompt-speed", "stats-gen-tokens", "stats-gen-speed", "stats-context"]) {
                const element = get(id);
                if (element) element.textContent = "--";
            }
            const kv = get("stats-kv-usage");
            if (kv) kv.textContent = "--%";
            return;
        }
        bar.classList.remove("hidden");
        set("stats-prompt-tokens", snapshot.session?.prompt, value => Math.round(value).toLocaleString());
        set("stats-prompt-speed", snapshot.speed?.prompt, value => value.toFixed(1));
        set("stats-prompt-speed-label", snapshot.speed?.promptIsLive, live => live ? "tok/s 提示词实时" : " tok/s · 提示词平均值");
        set("stats-gen-tokens", snapshot.session?.generated, value => Math.round(value).toLocaleString());
        set("stats-gen-speed", snapshot.speed?.generated, value => value.toFixed(1));
        set("stats-gen-speed-label", snapshot.speed?.generatedIsLive, live => live ? "tok/s 生成实时" : " tok/s ·生成平均值");
        set("stats-context", snapshot.session?.total, value => Math.round(value).toLocaleString());
        set("stats-kv-usage", snapshot.context ? snapshot.context.percent : null, value => `${Math.round(value)}%`);
    }

    I.inference = {
        renderInferenceAvailability,
        renderInferenceSnapshot,
        renderStatsBarFromSnapshot,
    };
})();

// Sidebar memory estimates; only schedule() starts work.
(function () {
    "use strict";
    const root = window.LlamaGui = window.LlamaGui || {};

    let deps = {};
    let memoryEstimateRequestId = 0;
    let timer = null;

    function configure(nextDeps) {
        deps = Object.assign({}, deps, nextDeps || {});
    }

    function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            updateMemoryEstimate();
        }, 700);
    }

    function formatMiB(mib) {
        const value = Number(mib);
        if (!Number.isFinite(value) || value <= 0) return "--";
        if (value >= 1024) return `${(value / 1024).toFixed(value >= 10240 ? 1 : 2)} GB`;
        return `${Math.round(value)} MiB`;
    }

    const STATE_LABELS = {
        ready: "准备就绪",
        unavailable: "不可用",
        idle: "空闲",
        evaluating: "评估",
    };

    function setMemoryEstimateState(state, detail, values) {
        const stateEl = document.getElementById("memory-estimate-state");
        const acceleratorEl = document.getElementById("memory-estimate-accelerator");
        const ramEl = document.getElementById("memory-estimate-ram");
        const detailEl = document.getElementById("memory-estimate-detail");
        if (!stateEl || !acceleratorEl || !ramEl || !detailEl) return;

        stateEl.textContent = STATE_LABELS[state] || state;
        stateEl.classList.toggle("is-error", state === "unavailable");
        stateEl.classList.toggle("is-ready", state === "ready");
        acceleratorEl.textContent = values ? formatMiB(values.accelerator_mib) : "--";
        ramEl.textContent = values ? formatMiB(values.ram_mib) : "--";
        detailEl.textContent = detail || "";
    }

    function summarizeMemoryEstimate(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return "";
        return rows.map(row => {
            const label = row.device || (row.kind === "ram" ? "主机" : "设备");
            const parts = [];
            if (row.model_mib > 0) parts.push(`模型 ${formatMiB(row.model_mib)}`);
            if (row.context_mib > 0) parts.push(`上下文 ${formatMiB(row.context_mib)}`);
            if (row.compute_mib > 0) parts.push(`计算 ${formatMiB(row.compute_mib)}`);
            const breakdown = parts.length ? ` (${parts.join(" · ")})` : "";
            return `${label}: ${formatMiB(row.total_mib)}${breakdown}`;
        }).join("\n");
    }

    async function updateMemoryEstimate() {
        const requestId = ++memoryEstimateRequestId;
        const result = deps.flagCore.getLaunchArgs();
        if (result.error) {
            setMemoryEstimateState("unavailable", result.error);
            return;
        }
        const args = result.args || [];
        if (!deps.flagCore.hasLaunchModelArg(args)) {
            setMemoryEstimateState("idle", "选择一个模型进行评估");
            return;
        }

        setMemoryEstimateState("evaluating", "正在检查当前命令参数……");
        try {
            const data = await deps.fetchJson("/api/estimate-memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: deps.flagCore.getCurrentTool(), args, env: result.env }),
            });
            if (requestId !== memoryEstimateRequestId) return;
            if (!data || data.error) {
                setMemoryEstimateState("unavailable", data?.error || "内存估算失败");
                return;
            }
            const detail = summarizeMemoryEstimate(data.rows) || "评估已完成";
            setMemoryEstimateState("ready", detail, data);
        } catch (e) {
            if (requestId !== memoryEstimateRequestId) return;
            setMemoryEstimateState("unavailable", e.message || "内存估算失败");
        }
    }

    root.memoryEstimateUi = { configure, schedule };
})();

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createMonitorHarness } = require("./monitor_harness.cjs");

test("terminal follow trim and clear", async (t) => {
    const fixture = createMonitorHarness();
    t.after(fixture.dispose);
    const { monitorUi, documentStub } = fixture;
    let invalidated = 0;
    monitorUi.configure({ invalidateCursor: () => { invalidated += 1; } });
    monitorUi.init();
    const terminal = documentStub.getElementById("output-terminal");
    terminal.scrollHeight = 500;
    terminal.clientHeight = 100;

    monitorUi.appendOutputLine("line one");
    assert.equal(terminal.children.length, 1);
    assert.equal(terminal.children[0].textContent, "line one");
    assert.equal(terminal.scrollTop, terminal.scrollHeight, "output follows the newest line");

    // A manual position never disables following; the next line returns to the bottom.
    terminal.scrollTop = 10;
    terminal.scrollHeight = 800;
    monitorUi.appendOutputLine("line two");
    assert.equal(terminal.scrollTop, terminal.scrollHeight, "new output always returns to the bottom");

    terminal.scrollTop = 10;
    terminal.scrollHeight = 900;
    monitorUi.onTabChanged("monitor");
    assert.equal(terminal.scrollTop, terminal.scrollHeight, "returning to Monitor follows the bottom");
    monitorUi.onTabChanged("configure");

    // DOM stays bounded at 5,000 lines, trimming 1,000 at a time.
    for (let i = 0; i < 5001; i += 1) monitorUi.appendOutputLine(`bulk ${i}`);
    assert.ok(terminal.children.length <= 5000, `got ${terminal.children.length}`);
    assert.ok(terminal.children.length > 4000);
    assert.ok(!terminal.textContent.includes("bulk 0"), "oldest lines trimmed first");

    // Clear empties the DOM and invalidates (not resets) the cursor.
    monitorUi.clearTerminal();
    assert.equal(terminal.children.length, 0);
    assert.equal(invalidated, 1, "clear must advance the cursor epoch without discarding it");

});

test("input visibility ownership", async (t) => {
    const fixture = createMonitorHarness();
    t.after(fixture.dispose);
    const { monitorUi, context, documentStub, resetDom, buildStandardDom, makeSample, makeStorage } = fixture;
    monitorUi._resetForTests();
    resetDom();
    buildStandardDom();
    context.localStorage = makeStorage();
    let external = { connected: true };
    monitorUi.configure({
        fetchJson: async () => makeSample(),
        getLifecycleSnapshot: () => ({ activeRuntime: null, phase: "idle", busy: false }),
        getLatestStatus: () => ({ external_chat_target: external }),
    });
    monitorUi.init();

    const inputRow = documentStub.getElementById("input-row");
    inputRow.classList.remove("hidden");

    monitorUi.updateProcessHeader();
    assert.equal(inputRow.classList.contains("hidden"), false,
        "monitor leaves the input row to app.js while an external server is connected");

    external = null;
    monitorUi.updateProcessHeader();
    assert.equal(inputRow.classList.contains("hidden"), false,
        "monitor leaves the input row to app.js after the external server drops");

    // The external-server note it does own still reacts.
    const note = documentStub.getElementById("monitor-external-note");
    assert.equal(note.classList.contains("hidden"), true,
        "the external note hides when the external server drops");

});

test("runtime and reset wiring", async (t) => {
    const fixture = createMonitorHarness();
    t.after(fixture.dispose);
    const { monitorUi, context, documentStub, resetDom, buildStandardDom, makeSample, makeStorage, wait } = fixture;
    resetDom();
    buildStandardDom();
    context.localStorage = makeStorage();
    let lifecycle = { activeRuntime: { tool: "llama-server", generation: 4 }, phase: "ready", busy: false };
    let status = null;
    let resets = 0;
    monitorUi.configure({
        fetchJson: async () => makeSample(),
        getLifecycleSnapshot: () => lifecycle,
        getLatestStatus: () => status,
        resetStatsBaseline: () => { resets += 1; },
    });
    monitorUi.init();
    monitorUi.onTabChanged("monitor");
    await wait(80);

    assert.equal(documentStub.getElementById("monitor-process-tool").textContent, "llama-server");
    assert.equal(documentStub.getElementById("monitor-process-state").textContent, "就绪");
    assert.equal(documentStub.getElementById("monitor-process-state").classList.contains("badge-green"), true);
    const navLive = documentStub.getElementById("monitor-nav-live");
    assert.equal(navLive.classList.contains("hidden"), false);
    monitorUi.onTabChanged("configure");
    assert.equal(navLive.classList.contains("hidden"), false);
    assert.equal(documentStub.getElementById("monitor-no-process-note").classList.contains("hidden"), true);

    // Transitional phases are named accurately and do not expose an empty
    // tool badge before the runtime identity exists.
    for (const [phase, label] of [["starting", "开始"], ["loading", "加载"], ["stopping", "停止"]]) {
        lifecycle = {
            activeRuntime: phase === "starting" ? null : { tool: "llama-server", generation: 5 },
            phase,
            busy: true,
        };
        monitorUi.updateProcessHeader();
        assert.equal(documentStub.getElementById("monitor-process-state").textContent, label);
        assert.equal(documentStub.getElementById("monitor-process-state").classList.contains("badge-yellow"), true);
        assert.equal(navLive.classList.contains("hidden"), true);
    }
    lifecycle = { activeRuntime: null, phase: "starting", busy: true };
    monitorUi.updateProcessHeader();
    assert.equal(documentStub.getElementById("monitor-process-tool").classList.contains("hidden"), true);

    // External server, no GUI process: stdout note replaces the terminal.
    lifecycle = { activeRuntime: null, phase: "idle", busy: false };
    status = { external_chat_target: { connected: true, host: "10.0.0.5", port: 8080 } };
    monitorUi.updateProcessHeader();
    assert.equal(documentStub.getElementById("monitor-process-tool").textContent, "外部服务器");
    assert.equal(documentStub.getElementById("monitor-external-note").classList.contains("hidden"), false);
    assert.equal(documentStub.getElementById("output-terminal").classList.contains("hidden"), true);

    assert.equal(navLive.classList.contains("hidden"), false);
    status = null;
    monitorUi.updateProcessHeader();
    assert.equal(navLive.classList.contains("hidden"), true);
    lifecycle = { activeRuntime: { tool: "llama-cli", generation: 6 }, phase: "ready", busy: false };
    monitorUi.updateProcessHeader();
    assert.equal(navLive.classList.contains("hidden"), true);

    // Reset button delegates to the shared baseline.
    documentStub.getElementById("btn-reset-inference").dispatch("click");
    assert.equal(resets, 1);
    monitorUi.onTabChanged("configure");

});

test("runtime and partial inference", async (t) => {
    const fixture = createMonitorHarness();
    t.after(fixture.dispose);
    const { monitorUi, context, documentStub, buildStandardDom, makeSample, wait, metricValues, slotsSample } = fixture;
    monitorUi._resetForTests();
    buildStandardDom();
    const el = id => documentStub.getElementById(id);
    let state = { phase: "ready", activeRuntime: { tool: "llama-server", model: "folder/<img>.gguf", backend: "vulkan", version: "b123", host: "127.0.0.1", port: 8090 } };
    let comparison = { available: true, changes: [{ flag: {} }], modelChanged: false };
    let status = null;
    monitorUi.configure({
        getLifecycleSnapshot: () => state,
        getLatestStatus: () => status,
        compareLaunchSettings: () => comparison,
        fetchJson: async () => makeSample({ gpus: [], gpu_setup: [] }),
    });
    monitorUi.init();
    monitorUi.onTabChanged("monitor");
    await wait(80);
    assert.equal(el("monitor-runtime-model").textContent, "<img>.gguf");
    assert.equal(el("monitor-runtime-model").title, "folder/<img>.gguf");
    assert.match(el("monitor-runtime-build").textContent, /vulkan.*b123/);
    assert.equal(el("monitor-runtime-endpoint").textContent, "端点：127.0.0.1:8090");
    assert.equal(el("btn-monitor-review").textContent, "查看变更 · 1");
    assert.equal(el("monitor-cpu-value").textContent, "18.4%");
    assert.equal(el("monitor-gpu-summary").textContent, "GPU 遥测数据不可用");
    assert.match(el("monitor-live-badge").textContent, /系统监控.*实时/);
    comparison = { available: true, changes: [], modelChanged: true };
    monitorUi.renderRuntime();
    assert.equal(el("btn-monitor-review").textContent, "检查模型变更");
    comparison = { available: false, changes: [] };
    state = { phase: "failed", activeRuntime: state.activeRuntime, error: "Could not restart <img>" };
    monitorUi.updateProcessHeader();
    assert.equal(el("monitor-runtime-state").textContent, "进程处于活动状态・操作失败");
    assert.equal(el("btn-monitor-review").classList.contains("hidden"), true);
    assert.equal(el("monitor-runtime-error").textContent, "Could not restart <img>");
    const engine = monitorUi.createInferenceStats({ onSnapshot: monitorUi.renderInferenceSnapshot });
    engine.setTarget("gui:10");
    assert.match(el("monitor-inference-note").textContent, /首条推理采样数据/);
    engine.applyPollResult({ metricsOk: false, slotsOk: true, slotsNormalized: slotsSample(0, 1000, 100), now: 1000 });
    assert.match(el("monitor-inference-note").textContent, /--metrics/);
    assert.doesNotMatch(el("monitor-inference-note").textContent, /上下文不可用/);
    assert.notEqual(el("monitor-inference-context-reading").textContent, "暂无数据");
    engine.applyPollResult({ metricsOk: true, metricsValues: metricValues(), slotsOk: false, now: 2000 });
    assert.match(el("monitor-inference-note").textContent, /上下文不可用/);
    assert.doesNotMatch(el("monitor-inference-note").textContent, /会话计数器不可用/);
    state = { phase: "idle", activeRuntime: null };
    monitorUi.appendOutputLine("last session");
    monitorUi.updateProcessHeader();
    assert.equal(el("monitor-output-title").textContent, "历史输出");
    monitorUi.clearTerminal();
    assert.equal(el("output-terminal").classList.contains("hidden"), true);
    status = { external_chat_target: { connected: true, host: "127.0.0.1", port: 9000 } };
    monitorUi.updateProcessHeader();
    assert.equal(el("monitor-runtime-state").textContent, "外部服务器");
    assert.equal(el("btn-monitor-api").classList.contains("hidden"), false);
    assert.match(el("monitor-runtime-endpoint").textContent, /9000/);
    monitorUi.onTabChanged("configure");

});


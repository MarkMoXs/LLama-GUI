const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const { getScriptPaths } = require("./script_order.cjs");
const scripts = getScriptPaths().filter(src => src === "js/api-client.js" || src.startsWith("js/manager/"));

function makeElement() {
    let html = "";
    const classNames = new Set();
    const listeners = {};
    const el = {
        children: [],
        value: "",
        textContent: "",
        className: "",
        style: {},
        disabled: false,
        classList: {
            add(...names) {
                names.forEach((name) => classNames.add(name));
                el.className = Array.from(classNames).join(" ");
            },
            remove(...names) {
                names.forEach((name) => classNames.delete(name));
                el.className = Array.from(classNames).join(" ");
            },
            toggle(name, force) {
                const shouldAdd = force === undefined ? !classNames.has(name) : Boolean(force);
                if (shouldAdd) {
                    classNames.add(name);
                } else {
                    classNames.delete(name);
                }
                el.className = Array.from(classNames).join(" ");
                return shouldAdd;
            },
            contains(name) {
                return classNames.has(name);
            },
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        listeners,
        addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
        removeEventListener() {},
        querySelectorAll() {
            return [];
        },
    };
    Object.defineProperty(el, "options", {
        get() {
            return this.children;
        },
        configurable: true,
    });
    Object.defineProperty(el, "innerHTML", {
        get() {
            return html;
        },
        set(value) {
            html = String(value || "");
            this.children = [];
            this.value = "";
        },
        configurable: true,
    });
    return el;
}

const elements = new Map();
[
    "release-select",
    "refresh-releases",
    "backend-discovery-status",
    "backend-select",
    "installed-backend-summary",
    "version-badge",
    "sidebar-status",
    "sidebar-status-text",
    "installed-info",
    "btn-repair",
    "btn-install",
    "btn-update",
    "release-group",
    "custom-backend-info",
    "custom-backend-folder",
    "custom-backend-title",
    "custom-backend-dir",
    "btn-browse-custom-backend",
    "btn-default-custom-backend",
    "install-status",
    "app-update-status",
    "app-update-channel",
    "btn-update-app",
].forEach((id) => elements.set(id, makeElement()));
elements.get("app-update-channel").value = "stable";

const fetchCalls = [];
const fetchPayload = [{ tag: "b1294", published: "2024-01-01T00:00:00Z", assets: [] }];

const context = {
    window: { addEventListener() {}, LlamaGui: {} },
    document: {
        createElement: () => makeElement(),
        createTextNode: (text) => ({ textContent: String(text || "") }),
        getElementById: (id) => elements.get(id) || null,
    },
    console,
    fetch: async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, json: async () => fetchPayload };
    },
};
context.window.window = context.window;
vm.createContext(context);
context.window.__LLAMA_GUI_TEST_HOOKS__ = true;
for (const src of scripts) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "ui", src), "utf8"), context, { filename: `ui/${src}` });
}

(async () => {
    const backendSelect = elements.get("backend-select");
    backendSelect.value = "lemonade-rocm-gfx110X";

    assert.equal(
        context.window.LlamaGui.manager._test.selectedBackendId(),
        "lemonade-rocm-gfx110X",
        "selectedBackendId should read backend-select value"
    );

    await context.window.LlamaGui.manager.fetchReleases("lemonade-rocm-gfx110X");
    assert.equal(
        fetchCalls[fetchCalls.length - 1].url,
        "/api/releases?backend=lemonade-rocm-gfx110X",
        "fetchReleases(backend) should hit backend-aware releases URL"
    );
    assert.equal(
        fetchCalls[fetchCalls.length - 1].options.cache,
        "no-store",
        "fetchJson should bypass browser cache for API requests"
    );

    await context.window.LlamaGui.manager.fetchReleases();
    assert.equal(
        fetchCalls[fetchCalls.length - 1].url,
        "/api/releases",
        "fetchReleases() without backend should hit default releases URL"
    );

    backendSelect.value = "cpu";
    await context.window.LlamaGui.manager._test.onBackendChange();
    assert.equal(
        fetchCalls[fetchCalls.length - 1].url,
        "/api/releases?backend=cpu",
        "onBackendChange should refetch releases for the selected backend"
    );

    const availableBackends = [
        { id: "cpu", label: "CPU" },
        { id: "vulkan", label: "Vulkan" },
        { id: "custom", label: "Custom", custom: true, bin_dir: "llama/custom/bin/" },
        { id: "custom-02", label: "Custom 02", custom: true, bin_dir: "llama/custom-02/bin/" },
    ];
    const cpuStatus = {
        installed: true,
        config_stale: false,
        version: "smoke",
        backend: "cpu",
        tag: "smoke",
        running: false,
        available_backends: availableBackends,
        executables: {
            "llama-cli": true,
            "llama-server": true,
        },
    };
    context.window.LlamaGui.manager._test.updateStatusUI(cpuStatus);
    assert.equal(elements.get("btn-update").disabled, false);

    backendSelect.value = "custom";
    context.window.LlamaGui.manager._test.onBackendChange();
    context.window.LlamaGui.manager._test.updateStatusUI(cpuStatus);
    assert.equal(backendSelect.value, "custom");
    assert.equal(elements.get("btn-update").disabled, true);
    assert.equal(elements.get("btn-repair").disabled, true);
    assert.equal(
        elements.get("btn-repair").classList.contains("hidden"),
        false,
        "repair button should be visible but disabled when custom is selected as install target"
    );

    backendSelect.value = "cpu";
    context.window.LlamaGui.manager._test.onBackendChange();
    context.window.LlamaGui.manager._test.updateStatusUI(cpuStatus);
    assert.equal(elements.get("btn-update").disabled, false);
    assert.equal(elements.get("btn-repair").classList.contains("hidden"), true);

    const customStatus = {
        installed: true,
        config_stale: false,
        version: "custom",
        backend: "custom",
        tag: "custom",
        running: false,
        available_backends: availableBackends,
        executables: {
            "llama-cli": true,
            "llama-server": true,
        },
        official_install: {
            backend: "vulkan",
            tag: "b10502",
            version: "b10502",
            files_present: true,
        },
    };
    context.window.LlamaGui.manager._test.updateStatusUI(customStatus);
    assert.equal(backendSelect.value, "custom");
    assert.match(
        elements.get("installed-backend-summary").textContent,
        /后端类型：Custom/,
        "installed backend summary should render as read-only status"
    );

    backendSelect.value = "vulkan";
    context.window.LlamaGui.manager._test.onBackendChange();
    context.window.LlamaGui.manager._test.updateStatusUI(customStatus);
    assert.equal(
        backendSelect.value,
        "vulkan",
        "pending install backend should survive status refresh while installed backend is still custom"
    );
    assert.equal(elements.get("btn-install").textContent, "激活现有");
    assert.equal(context.window.LlamaGui.manager._test.canActivateOfficialBackend(customStatus, "vulkan"), true);
    assert.equal(context.window.LlamaGui.manager._test.canActivateOfficialBackend(customStatus, "cpu"), false);
    assert.equal(
        elements.get("btn-update").disabled,
        true,
        "custom installed backend should not become auto-updatable because a default backend is selected as install target"
    );

    context.window.LlamaGui.manager._test.updateStatusUI({ ...customStatus, version: "smoke", backend: "vulkan", tag: "smoke" });
    assert.equal(
        backendSelect.value,
        "vulkan",
        "install target should remain on the newly installed backend once status catches up"
    );
    assert.equal(elements.get("btn-update").disabled, false);

    // The server supplies the slot identity and path; pending selections must not
    // change the active-build summary, even while activation is in flight.
    let savedStatus = customStatus;
    let completeActivation;
    const slotRequests = [];
    context.fetch = async (url, options) => {
        if (url === "/api/status") return { ok: true, json: async () => savedStatus };
        if (url === "/api/activate-custom") {
            slotRequests.push(JSON.parse(options.body));
            return new Promise(resolve => { completeActivation = payload => resolve({ ok: true, json: async () => payload }); });
        }
        assert.fail("Unexpected request while selecting Custom: " + url);
    };
    await context.window.LlamaGui.manager.checkStatus();
    backendSelect.value = "custom-02";
    context.window.LlamaGui.manager._test.onBackendChange();
    await context.window.LlamaGui.manager.checkStatus();
    assert.equal(elements.get("custom-backend-folder").textContent, "llama/custom-02/bin/");
    assert.equal(elements.get("custom-backend-title").textContent, "Custom 02 Setup:");
    assert.equal(elements.get("installed-backend-summary").textContent, "后端类型：Custom");
    assert.equal(elements.get("btn-update").disabled, true);
    assert.equal(elements.get("release-group").style.display, "none");
    let activating = context.window.LlamaGui.manager._test.installRelease();
    await context.window.LlamaGui.manager._test.installRelease();
    assert.deepEqual(slotRequests, [{ backend: "custom-02" }], "duplicate activation is ignored");
    await context.window.LlamaGui.manager.checkStatus();
    assert.equal(elements.get("btn-install").disabled, true, "polling must not unlock an activation in flight");
    completeActivation({ ok: false, missing_required: ["llama-server"] });
    await activating;
    assert.match(elements.get("install-status").textContent, /custom-02\/bin\/.*llama-server/);
    assert.equal(elements.get("installed-backend-summary").textContent, "后端类型：Custom");
    assert.equal(elements.get("btn-update").disabled, true, "failure must keep custom update restrictions");
    activating = context.window.LlamaGui.manager._test.installRelease();
    savedStatus = { ...customStatus, backend: "custom-02" };
    completeActivation({ ok: true, found: ["llama-cli", "llama-server"], missing: ["llama-bench"] });
    await activating;
    assert.equal(elements.get("installed-backend-summary").textContent, "后端类型：Custom 02");
    assert.equal(elements.get("version-badge").textContent, "Custom 02");
    assert.equal(elements.get("btn-update").disabled, true);
    assert.equal(context.window.LlamaGui.manager._test.canActivateOfficialBackend(savedStatus, "custom"), false);
    assert.equal(context.window.LlamaGui.manager._test.canActivateOfficialBackend(savedStatus, "vulkan"), true);
    context.window.LlamaGui.manager._test.updateStatusUI({ ...savedStatus, installed: false, config_stale: true });
    assert.equal(elements.get("btn-repair").disabled, true);
    assert.ok(elements.get("installed-info").children.some(child => /custom-02\/bin/.test(child.textContent)));

    const pending = new Map();
    context.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return new Promise((resolve) => {
            pending.set(url, (payload) => resolve({ ok: true, json: async () => payload }));
        });
    };

    const first = context.window.LlamaGui.manager.fetchReleases("cpu");
    const second = context.window.LlamaGui.manager.fetchReleases("lemonade-rocm-gfx110X");
    pending.get("/api/releases?backend=lemonade-rocm-gfx110X")([
        { tag: "b1294", published: "2024-01-01T00:00:00Z", assets: [] },
    ]);
    await second;
    const releaseSelect = elements.get("release-select");
    assert.equal(releaseSelect.options.length, 1);
    assert.equal(releaseSelect.options[0].value, "b1294");

    pending.get("/api/releases?backend=cpu")([
        { tag: "b9999", published: "2024-01-02T00:00:00Z", assets: [] },
    ]);
    await first;
    assert.equal(
        releaseSelect.options[0].value,
        "b1294",
        "stale release responses should not overwrite the latest backend releases"
    );

    let statusFetchCount = 0;
    let releaseFirstObserver;
    const firstObserverGate = new Promise(resolve => { releaseFirstObserver = resolve; });
    const observedGenerations = [];
    context.fetch = async (url) => {
        if (url.startsWith("/api/releases")) {
            return { ok: true, json: async () => [] };
        }
        assert.equal(url, "/api/status");
        statusFetchCount += 1;
        const generation = statusFetchCount;
        return {
            ok: true,
            json: async () => ({
                installed: true,
                running: true,
                active_process_tool: "llama-server",
                active_runtime: { generation, tool: "llama-server" },
                runtime_generation: generation,
                available_backends: [],
                executables: {},
            }),
        };
    };
    context.window.LlamaGui.manager.setAcceptedStatusObserver(async status => {
        observedGenerations.push(status.runtime_generation);
        if (status.runtime_generation === 1) await firstObserverGate;
    });
    const firstStatusCheck = context.window.LlamaGui.manager.checkStatus();
    while (observedGenerations.length === 0) await Promise.resolve();
    const secondStatus = await context.window.LlamaGui.manager.checkStatus();
    assert.equal(secondStatus.runtime_generation, 2);
    releaseFirstObserver();
    const firstStatus = await firstStatusCheck;
    assert.equal(firstStatus.runtime_generation, 2, "an older accepted request must return the latest status");
    assert.deepEqual(
        observedGenerations,
        [1, 2, 2],
        "the latest status must be re-observed after an older long-running observer settles"
    );

    // appReload is a one-shot cache buster; it must not survive into the address bar
    const replaceCalls = [];
    context.window.history = {
        replaceState: (state, title, url) => replaceCalls.push(url),
    };
    context.URL = URL;

    const runClear = (href) => {
        replaceCalls.length = 0;
        context.window.location = { href };
        return {
            cleared: context.window.LlamaGui.manager.clearAppReloadParam(),
            replaced: replaceCalls.slice(),
        };
    };

    let result = runClear("http://127.0.0.1:5240/?appReload=1784942368226");
    assert.equal(result.cleared, true);
    assert.deepEqual(result.replaced, ["/"], "a lone appReload param must leave a clean root URL");

    result = runClear("http://127.0.0.1:5240/?preset=My%20Preset&appReload=123");
    assert.equal(result.cleared, true);
    assert.deepEqual(
        result.replaced,
        ["/?preset=My+Preset"],
        "clearing appReload must preserve other query parameters"
    );

    result = runClear("http://127.0.0.1:5240/?appReload=123#chat");
    assert.deepEqual(result.replaced, ["/#chat"], "the hash must survive the cleanup");

    result = runClear("http://127.0.0.1:5240/?preset=Test");
    assert.equal(result.cleared, false, "a URL without appReload must not be rewritten");
    assert.deepEqual(result.replaced, [], "no history entry should be replaced when nothing changes");

    const appUpdateChannel = elements.get("app-update-channel");
    appUpdateChannel.value = "nightly";
    let updateRequest;
    context.fetch = async (url, options) => {
        if (url === "/api/app-update-status?channel=nightly") {
            return {
                ok: true,
                json: async () => ({
                    available: true,
                    can_update: true,
                    state: "behind",
                    update_channel: "nightly",
                    release_branch: "main",
                    branch: "main",
                    behind: 4,
                }),
            };
        }
        assert.equal(url, "/api/app-update");
        updateRequest = options;
        return {
            ok: true,
            json: async () => ({
                updated: false,
                message: "Already up to date",
                status: {
                    available: true,
                    can_update: false,
                    state: "up_to_date",
                    update_channel: "nightly",
                    release_branch: "main",
                    branch: "main",
                },
            }),
        };
    };
    await context.window.LlamaGui.manager.checkAppUpdateStatus();
    assert.match(elements.get("app-update-status").textContent, /latest nightly commit on origin\/main/);
    context.window.LlamaGui.manager.configure({ confirmAction: async () => true });
    await context.window.LlamaGui.manager.updateAppFromGitHub();
    assert.deepEqual(JSON.parse(updateRequest.body), { channel: "nightly" });

    appUpdateChannel.value = "stable";

    context.fetch = async (url) => {
        assert.equal(url, "/api/app-update-status");
        throw new Error("network down");
    };
    await assert.doesNotReject(
        () => context.window.LlamaGui.manager.updateAppFromGitHub(),
        "an app-update preflight failure must be handled by the update UI"
    );
    assert.equal(elements.get("app-update-status").className, "status-box error");
    assert.equal(
        elements.get("app-update-status").textContent,
        "未检查到应用程序更新：network down"
    );

    // Discovery must not reset a pending selection, switch installations, or
    // block use of saved options when the discovery request fails.
    const discoveryManager = context.window.LlamaGui.manager;
    let finishDiscovery;
    const discoveryRequests = [];
    const discoveredStatus = { ...cpuStatus, available_backends: [
        ...availableBackends, { id: "cuda-99.1", label: "CUDA 99.1 (NVIDIA)" },
    ] };
    context.fetch = async url => {
        discoveryRequests.push(url);
        if (url.startsWith("/api/backends")) {
            await new Promise(resolve => { finishDiscovery = resolve; });
            return { ok: true, json: async () => ({ warning: "" }) };
        }
        return { ok: true, json: async () => url === "/api/status" ? discoveredStatus : fetchPayload };
    };
    const discovery = discoveryManager.refreshBackends();
    assert.equal(discoveryManager.refreshBackends(), discovery, "concurrent refreshes share one request");
    assert.equal(elements.get("refresh-releases").disabled, true);
    backendSelect.value = "vulkan";
    discoveryManager._test.onBackendChange();
    finishDiscovery();
    await discovery;
    assert.equal(backendSelect.value, "vulkan", "discovery preserves a selection made while loading");
    assert.ok(backendSelect.options.some(option => option.value === "cuda-99.1"));
    assert.equal(elements.get("refresh-releases").disabled, false);
    assert.match(elements.get("installed-backend-summary").textContent, /CPU/);
    assert.ok(!discoveryRequests.some(url => /\/api\/(install|update)$/.test(url)));

    context.fetch = async url => {
        discoveryRequests.push(url);
        if (url.startsWith("/api/backends")) throw new Error("offline fixture");
        return { ok: true, json: async () => fetchPayload };
    };
    await discoveryManager.refreshBackends(true);
    assert.equal(backendSelect.value, "vulkan");
    assert.match(elements.get("backend-discovery-status").textContent, /Keeping existing/);
    assert.equal(discoveryRequests.at(-1), "/api/releases?backend=vulkan");
    assert.equal(elements.get("refresh-releases").disabled, false);

    // A manual request overlapping an automatic check must retain forced semantics.
    const overlapRequests = [];
    let finishAutomatic;
    let finishForced;
    let signalForced;
    const forcedStarted = new Promise(resolve => { signalForced = resolve; });
    context.fetch = async url => {
        overlapRequests.push(url);
        if (url === "/api/backends") {
            await new Promise(resolve => { finishAutomatic = resolve; });
        } else if (url === "/api/backends?refresh=1") {
            signalForced();
            await new Promise(resolve => { finishForced = resolve; });
        }
        return { ok: true, json: async () => url.startsWith("/api/backends")
            ? { warning: "" } : url === "/api/status" ? discoveredStatus : fetchPayload };
    };
    const automatic = discoveryManager.refreshBackends();
    assert.equal(discoveryManager.refreshBackends(true), automatic);
    assert.equal(discoveryManager.refreshBackends(true), automatic);
    finishAutomatic();
    await forcedStarted;
    assert.equal(elements.get("refresh-releases").disabled, true);
    assert.equal(discoveryManager.refreshBackends(true), automatic, "forced checks also coalesce");
    finishForced();
    await automatic;
    assert.deepEqual(overlapRequests.filter(url => url.startsWith("/api/backends")),
        ["/api/backends", "/api/backends?refresh=1"]);
    assert.equal(overlapRequests.at(-1), "/api/releases?backend=vulkan");
    assert.equal(elements.get("refresh-releases").disabled, false);

    // Even failure in the fallback path is logged and leaves refresh usable.
    const warnings = [];
    context.console = { ...console, warn: (...args) => warnings.push(args) };
    const getElementById = context.document.getElementById;
    context.document.getElementById = id => {
        if (id === "backend-select") throw new Error("selection fixture failure");
        return getElementById(id);
    };
    context.fetch = async () => { throw new Error("offline fixture"); };
    await assert.doesNotReject(() => discoveryManager.refreshBackends(true));
    assert.ok(warnings.some(args => args[0] === "Unexpected backend refresh failure"
        && args[1].message === "selection fixture failure"));
    assert.equal(elements.get("refresh-releases").disabled, false);
    context.document.getElementById = getElementById;
    context.console = console;
    context.fetch = async url => ({ ok: true, json: async () =>
        url === "/api/status" ? discoveredStatus : { warning: "" } });
    await discoveryManager.refreshBackends();
    assert.match(elements.get("backend-discovery-status").textContent, /versions checked/);

    // Loading/configuring is inert, and init owns each listener exactly once.
    const manager = context.window.LlamaGui.manager;
    const unloadHandlers = [];
    context.window.addEventListener = (type, handler) => {
        assert.equal(type, "beforeunload");
        unloadHandlers.push(handler);
    };
    let intervalCallback;
    const clearedTimers = [];
    context.setInterval = (callback) => { intervalCallback = callback; return 17; };
    context.clearInterval = id => clearedTimers.push(id);
    const initRequests = [];
    manager.configure({ fetchJson: async url => {
        initRequests.push(url);
        if (url === "/api/update") return { status: "started", from: "old", to: "new" };
        if (url === "/api/download-progress") return { status: "error", message: "Fixture install failed" };
        if (url === "/api/status") return discoveredStatus;
        if (url.startsWith("/api/releases")) return fetchPayload;
        if (url.startsWith("/api/backends")) return { warning: "" };
        return { available: false };
    } });
    assert.deepEqual(initRequests, [], "configure must not issue requests");
    assert.equal(elements.get("btn-update").listeners.click, undefined);
    for (const id of ["download-progress", "progress-fill", "progress-text"]) elements.set(id, makeElement());
    manager.init();
    manager.init();
    assert.equal(unloadHandlers.length, 1);
    assert.deepEqual(initRequests, ["/api/app-update-status", "/api/backends"]);
    await manager.refreshBackends();
    assert.equal(elements.get("btn-update").listeners.click.length, 1);
    await elements.get("btn-update").listeners.click[0]();
    assert.equal(initRequests.filter(url => url === "/api/update").length, 1);
    assert.equal(typeof intervalCallback, "function", "update action starts install polling");
    await intervalCallback();
    assert.deepEqual(clearedTimers, [17], "an install error cleans up polling");
    assert.equal(elements.get("install-status").textContent, "Fixture install failed");
    await elements.get("btn-update").listeners.click[0]();
    unloadHandlers[0]();
    assert.deepEqual(clearedTimers, [17, 17], "unload cleans up active install polling");

    // Folder changes belong to a slot and remain pending until activation succeeds.
    const input = elements.get("custom-backend-dir");
    const browse = elements.get("btn-browse-custom-backend");
    const reset = elements.get("btn-default-custom-backend");
    assert.equal(input.listeners.input.length, 1);
    assert.equal(browse.listeners.click.length, 1);
    const folderRequests = [];
    let folderStatus = { ...cpuStatus, available_backends: availableBackends.map(option => option.custom
        ? { ...option, default_bin_dir: option.bin_dir, bin_dir_is_default: true } : option) };
    let selection = { selected: false, path: "" };
    let finishPicker;
    let finishFolderActivation;
    manager.configure({ fetchJson: async (url, options) => {
        if (url === "/api/status") return folderStatus;
        if (url === "/api/select-folder") {
            folderRequests.push(JSON.parse(options.body));
            if (selection === null) return new Promise(resolve => { finishPicker = resolve; });
            return selection;
        }
        if (url === "/api/activate-custom") {
            folderRequests.push(JSON.parse(options.body));
            return new Promise(resolve => { finishFolderActivation = resolve; });
        }
        if (url.startsWith("/api/releases")) return fetchPayload;
        assert.fail("Unexpected folder request: " + url);
    } });
    await manager.checkStatus();
    backendSelect.value = "custom";
    manager._test.onBackendChange();
    input.value = "/first build";
    input.listeners.input[0]({ target: input });
    await manager.checkStatus();
    assert.equal(input.value, "/first build", "polling preserves a typed draft");
    backendSelect.value = "custom-02";
    manager._test.onBackendChange();
    assert.equal(input.value, "");
    input.value = "/second build";
    input.listeners.input[0]({ target: input });
    backendSelect.value = "custom";
    manager._test.onBackendChange();
    assert.equal(input.value, "/first build", "switching slots restores the slot's draft");
    await browse.listeners.click[0]();
    assert.equal(input.value, "/first build", "picker cancellation keeps the draft");
    assert.equal(folderRequests.at(-1).purpose, "custom-backend");
    assert.equal(folderRequests.at(-1).backend, "custom");
    selection = null;
    const picking = browse.listeners.click[0]();
    await browse.listeners.click[0]();
    assert.equal(folderRequests.filter(request => request.purpose).length, 2, "duplicate pickers are ignored");
    await manager.checkStatus();
    assert.equal(backendSelect.disabled, true);
    assert.equal(input.disabled, true);
    assert.equal(elements.get("btn-install").disabled, true);
    finishPicker({ selected: true, path: "/picked & build" });
    await picking;
    assert.equal(input.value, "/picked & build");
    assert.equal(backendSelect.disabled, false);
    let applying = manager._test.installRelease();
    assert.deepEqual(folderRequests.at(-1), { backend: "custom", bin_dir: "/picked & build" });
    await manager.checkStatus();
    assert.equal(input.disabled, true);
    assert.equal(reset.disabled, true);
    finishFolderActivation({ ok: false, missing_required: ["llama-server"] });
    await applying;
    assert.equal(input.value, "/picked & build");
    assert.equal(manager.getLatestStatus().backend, "cpu");
    applying = manager._test.installRelease();
    folderStatus = { ...folderStatus, backend: "custom", available_backends: folderStatus.available_backends.map(option =>
        option.id === "custom" ? { ...option, bin_dir: "/picked & build", bin_dir_is_default: false } : option) };
    finishFolderActivation({ ok: true, found: ["llama-server", "llama-cli"] });
    await applying;
    assert.equal(input.value, "/picked & build", "successful activation renders the saved folder");
    assert.equal(elements.get("custom-backend-folder").textContent, "/picked & build");
    reset.listeners.click[0]();
    await manager.checkStatus();
    assert.equal(input.value, "", "a pending reset survives polling");
    assert.equal(elements.get("custom-backend-folder").textContent, "/picked & build", "reset does not change the saved path before activation");
    applying = manager._test.installRelease();
    assert.deepEqual(folderRequests.at(-1), { backend: "custom", bin_dir: null });
    finishFolderActivation({ ok: false, missing_required: ["llama-server"] });
    await applying;
    assert.match(elements.get("install-status").textContent, /llama\/custom\/bin/);
    backendSelect.value = "custom-02";
    manager._test.onBackendChange();
    assert.equal(input.value, "/second build", "other slot's pending folder remains independent");

    console.log("manager releases unit tests passed");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

// Verified detached Chat bootstrap; remote state and session checks stay local to the view.
(function () {
    "use strict";
    const root = typeof window !== "undefined" ? window : globalThis;
    const I = root.LlamaGui._chatWindowInternal;
    const { debug, result } = I.protocol;
    const { getOrigin, getStorage, isClosedWindow, waitForPeer, showDetachedError } = I.bootstrap;
    const { createCoordinator } = I.coordinator;
    const { createFlagCoreBridge } = I.flagCoreBridge;

    function whenDomReady(target) {
        if (!target || !target.document || target.document.readyState !== "loading") return Promise.resolve();
        return new Promise(resolve => target.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }

    async function startDetachedView(options = {}) {
        const target = options.window || (typeof window !== "undefined" ? window : null);
        if (!target) return result(false, "chat-host-unavailable");
        const holder = { coordinator: null, hostCheckTimer: null };
        try {
            return await startDetachedViewImpl(options, holder);
        } catch (error) {
            if (holder.hostCheckTimer !== null) clearInterval(holder.hostCheckTimer);
            holder.coordinator?.dispose?.();
            debug({ window: target }, "Detached Chat bootstrap failed", error);
            try {
                showDetachedError(target, "聊天窗口不可用", "此聊天窗口无法连接到主 GUI。请关闭它，然后在主聊天窗口选择「在此恢复聊天」。");
            } catch (showError) {
                debug({ window: target }, "Unable to show detached Chat error", showError);
            }
            return result(false, "detached-init-failed");
        }
    }

    async function startDetachedViewImpl(options = {}, holder = {}) {
        const target = options.window || (typeof window !== "undefined" ? window : null);
        if (!target) return result(false, "chat-host-unavailable");
        await whenDomReady(target);
        target.document?.body?.classList.add("chat-window-detached");
        const opener = target && target.opener;
        const chatUi = options.chatUi || target?.LlamaGui?.chatUi;
        let openerChatWindow = null;
        try { openerChatWindow = opener?.LlamaGui?.chatWindow || null; } catch (error) {
            debug({ window: target }, "Unable to inspect Chat opener", error);
        }
        if (!opener || !chatUi || !openerChatWindow) {
            showDetachedError(target, "聊天窗口不可用", "此页面在未验证与主 GUI 的连接的情况下打开。请在此浏览器中打开完整 GUI，然后选择「聊天」并「弹出」；在另一个浏览器中打开的 GUI 无法共享此聊天。", { fullGuiLink: true });
            return result(false, "chat-host-unavailable");
        }
        let descriptor;
        try { descriptor = openerChatWindow.getBootstrapInfo(target); } catch (error) { descriptor = null; }
        if (!descriptor || descriptor.origin !== getOrigin({ window: target }) || !descriptor.proofKey || !descriptor.proofValue) {
            showDetachedError(target, "聊天窗口不可用", "关闭此窗口，然后在主聊天窗口选择恢复聊天。");
            return result(false, "chat-host-unavailable");
        }
        const storage = getStorage({ window: target });
        let proofMatches = false;
        try { proofMatches = storage && storage.getItem(descriptor.proofKey) === descriptor.proofValue; } catch (error) { proofMatches = false; }
        if (!proofMatches) {
            showDetachedError(target, "聊天窗口不可用", "此窗口无法验证主聊天存储分区。");
            return result(false, "storage-partition-mismatch");
        }
        const remoteState = { settings: {}, runtime: null, status: null, inference: null };
        let remoteAdapter = null;
        let hostLossStarted = false;
        let hostCheckTimer = null;
        let coordinator;
        function markHostUnavailable(error) {
            remoteAdapter = null;
            if (hostCheckTimer !== null) {
                clearInterval(hostCheckTimer);
                hostCheckTimer = null;
            }
            const hostStatus = target.document?.getElementById("chat-window-host-status");
            if (hostStatus) {
                hostStatus.textContent = "The main Chat window is unavailable. This workspace is paused; return to the main window to recover. Interrupted data may be checkpointed; messages will not be resent automatically.";
                hostStatus.hidden = false;
            }
            if (error && target.console?.debug) target.console.debug("Chat host bridge became unavailable", error);
            if (coordinator && !hostLossStarted) {
                hostLossStarted = true;
                void coordinator.invalidateSession().catch(reason => target.console?.debug?.("Chat host quarantine failed", reason));
            } else {
                chatUi.setHostAvailable?.(false);
            }
        }
        function hasCurrentHostSession() {
            if (!remoteAdapter || hostLossStarted) return false;
            try {
                const current = !isClosedWindow(opener)
                    ? opener?.LlamaGui?.chatWindow?.getSessionInfo?.(target) : null;
                if (current && current.origin === descriptor.origin && current.sessionId === descriptor.sessionId
                    && current.valid === true && remoteAdapter.isSessionValid?.() === true) return true;
            } catch (error) {
                target.console?.debug?.("Unable to verify current Chat host session", error);
            }
            markHostUnavailable(new Error("主聊天会话已更改或关闭。"));
            return false;
        }
        const remoteHost = {
            getSettings: () => hasCurrentHostSession() ? remoteAdapter.getSettings() : Object.assign({}, remoteState.settings),
            setSettings: patch => {
                if (!hasCurrentHostSession()) throw new Error("聊天主机未连接");
                return remoteAdapter.setSettings(patch);
            },
            getAuthorizationHeaders: (...args) => {
                if (!hasCurrentHostSession()) throw new Error("聊天主机未连接");
                return remoteAdapter.getAuthorizationHeaders(...args);
            },
            resetInferenceBaseline: () => hasCurrentHostSession() ? remoteAdapter.resetInferenceBaseline() : undefined,
            navigate: (...args) => hasCurrentHostSession() ? remoteAdapter.navigate(...args) : false,
            isSessionValid: hasCurrentHostSession,
        };
        const bridge = createFlagCoreBridge(remoteHost, { window: target, onUnavailable: markHostUnavailable });
        let returnPromise = null;
        async function transferToMain() {
            if (returnPromise) return returnPromise;
            if (!coordinator || !coordinator.isOwner() || !hasCurrentHostSession()) return false;
            const allowed = coordinator.getTransferState();
            if (!allowed || allowed.allowed !== true) return false;
            returnPromise = coordinator.beginTransfer({ destinationId: descriptor.instanceId, timeoutMs: 10000 })
                .then(returned => {
                    if (returned) {
                        try { opener.focus(); } catch (error) { target.console?.debug?.("Main Chat focus failed", error); }
                        try { target.close(); } catch (error) { target.console?.debug?.("Chat window close failed", error); }
                    }
                    return returned;
                })
                .finally(() => { returnPromise = null; });
            return returnPromise;
        }
        function updateReturnControl() {
            const button = target.document?.getElementById("btn-chat-return");
            if (!button || !coordinator) return;
            const allowed = coordinator.getTransferState();
            const disabled = !coordinator.isOwner() || allowed.allowed !== true;
            button.disabled = disabled;
            button.setAttribute("aria-disabled", String(disabled));
            button.title = allowed.reason || "返回至聊天主窗口";
        }
        const updateRemote = payload => {
            const next = payload && typeof payload === "object" ? payload : {};
            if (next.settings && typeof next.settings === "object") {
                remoteState.settings = Object.assign({}, next.settings);
                bridge.refresh(remoteState.settings);
            }
            if (Object.prototype.hasOwnProperty.call(next, "runtime")) remoteState.runtime = next.runtime;
            if (Object.prototype.hasOwnProperty.call(next, "status")) remoteState.status = next.status;
            if (Object.prototype.hasOwnProperty.call(next, "inference")) remoteState.inference = next.inference;
            if (next.change?.type === "session-invalidated") {
                markHostUnavailable();
            }
            chatUi.refreshSidebarUI?.();
            chatUi.updateStatusBadge?.();
            if (remoteState.inference && options.monitorUi) {
                options.monitorUi.renderInferenceSnapshot?.(remoteState.inference);
                options.monitorUi.renderStatsBarFromSnapshot?.(remoteState.inference, target.document);
            }
        };
        coordinator = createCoordinator({
            window: target,
            chatUi,
            sessionId: descriptor.sessionId,
            onHostUpdate: updateRemote,
            onReturnRequest: () => { void transferToMain(); },
        });
        holder.coordinator = coordinator;
        if (typeof target.addEventListener === "function") {
            target.addEventListener("pagehide", () => {
                const transferState = coordinator.getState().transfer;
                if (transferState?.phase === "complete") return;
                void coordinator.invalidateSession().catch(error => target.console?.debug?.("Chat popup quarantine failed", error));
            });
        }
        chatUi.configure({
            flagCore: bridge,
            confirmAction: options.confirmAction || target.confirmAction || ((title, message) => target.confirm(title, message)),
            getLatestStatus: () => remoteState.status,
            getLifecycleSnapshot: () => remoteState.runtime,
            snapshotStatsBaseline: remoteHost.resetInferenceBaseline,
            switchTab: remoteHost.navigate,
            getApiAuthorizationHeaders: remoteHost.getAuthorizationHeaders,
        });
        chatUi.configureWorkspace({
            checkpoint: snapshot => coordinator.checkpoint(snapshot),
            invalidate: () => coordinator.invalidateRecovery().ok,
            onChange: updateReturnControl,
            detachedView: true,
        });
        const initialized = await coordinator.initialize({ acquire: false, recover: false });
        if (!coordinator.getState().lockAvailable) {
            await whenDomReady(target);
            showDetachedError(target, "聊天弹窗不可用", "此浏览器不支持共享聊天所需的排他锁。");
            return result(false, "locks-unavailable");
        }
        // The popup starts as an observer like the host path above: revoke
        // ownership before init() so nothing is mutable before the verified
        // handoff grants it. Host availability is granted after the handshake.
        chatUi.setOwnership?.(false);
        chatUi.setHostAvailable?.(false);
        await whenDomReady(target);
        options.themeUi?.init?.();
        chatUi.init();
        target.document.getElementById("btn-chat-return")?.removeAttribute("hidden");
        target.document.getElementById("btn-chat-return")?.addEventListener("click", () => { void transferToMain(); });
        coordinator.attachPeer(opener, {
            origin: descriptor.origin,
            peerId: descriptor.instanceId,
            sessionId: descriptor.sessionId,
        });
        coordinator.beginHandshake({ proof: { key: descriptor.proofKey, value: descriptor.proofValue } });
        const verified = await waitForPeer(coordinator, 10000);
        if (!verified) {
            chatUi.setHostAvailable?.(false);
            showDetachedError(target, "聊天主机不可用", "请返回主窗口并重新打开聊天。");
            return result(false, "host-handshake-failed");
        }
        remoteAdapter = openerChatWindow.getPeerHostAdapter(target);
        if (!remoteAdapter) {
            chatUi.setHostAvailable?.(false);
            showDetachedError(target, "聊天主机不可用", "关闭此窗口，然后在主聊天窗口选择恢复聊天。");
            return result(false, "host-adapter-unavailable");
        }
        updateRemote({
            settings: remoteAdapter.getSettings(), runtime: remoteAdapter.getRuntime(),
            status: remoteAdapter.getStatus(), inference: remoteAdapter.getInference(),
        });
        chatUi.setHostAvailable?.(true);
        const hostStatus = target.document.getElementById("chat-window-host-status");
        if (hostStatus) hostStatus.hidden = true;
        updateReturnControl();
        options.monitorUi?.renderInferenceSnapshot?.(remoteState.inference);
        options.monitorUi?.renderStatsBarFromSnapshot?.(remoteState.inference, target.document);
        hostCheckTimer = setInterval(hasCurrentHostSession, 500);
        holder.hostCheckTimer = hostCheckTimer;
        return Object.assign(result(true, "detached-ready"), { coordinator, hostAdapter: remoteAdapter, initialized });
    }

    I.detachedView = Object.freeze({ startDetachedView });
})();

// Backend selection, activation, and installed-backend presentation.
(() => {
    const I = window.LlamaGui._managerInternal;

    let lastInstalledInfoRenderKey = "";
    let pendingInstallBackendId = null;
    let customActivationInProgress = false;

    function normalizeBackendId(value) {
        return String(value || "").trim();
    }

    function backendOptionsFromStatus(status) {
        return Array.isArray(status && status.available_backends)
            ? status.available_backends
            : [];
    }

    function hasBackendOption(options, backendId) {
        return options.some((backend) => backend && backend.id === backendId);
    }

    function backendLabelFromStatus(status, backendId) {
        const id = normalizeBackendId(backendId);
        const match = backendOptionsFromStatus(status).find((backend) => backend && backend.id === id);
        return match && match.label ? match.label : (id || "None");
    }

    function isCustomBackend(backendId, status = I.status.getLatestStatus()) {
        return backendId === "custom" || backendOptionsFromStatus(status)
            .some((backend) => backend.id === backendId && backend.custom === true);
    }

    function customBackendFolder(backendId, status = I.status.getLatestStatus()) {
        const backend = backendOptionsFromStatus(status).find((entry) => entry.id === backendId);
        return backend && backend.bin_dir ? backend.bin_dir : "llama/custom/bin/";
    }

    function installedBackendIdFromStatus(status) {
        return normalizeBackendId(status && status.backend);
    }

    function canActivateOfficialBackend(status, backendId) {
        const target = normalizeBackendId(backendId);
        const official = status && status.official_install;
        const recordedBackend = normalizeBackendId(official && official.backend);
        return Boolean(
            status
            && isCustomBackend(status.backend, status)
            && target
            && !isCustomBackend(target, status)
            && official
            && official.files_present
            && (!recordedBackend || recordedBackend === target)
        );
    }

    function renderBackendOptions(status) {
        const backendSelect = document.getElementById("backend-select");
        if (!backendSelect) return;

        const availableBackends = backendOptionsFromStatus(status);
        const previousValue = normalizeBackendId(backendSelect.value);
        const installedValue = installedBackendIdFromStatus(status);

        backendSelect.innerHTML = "";

        if (availableBackends.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "此平台没有受支持的后端";
            backendSelect.appendChild(opt);
            backendSelect.disabled = true;
            return;
        }

        backendSelect.disabled = false;
        for (const backend of availableBackends) {
            const opt = document.createElement("option");
            opt.value = backend.id;
            opt.textContent = backend.label;
            backendSelect.appendChild(opt);
        }

        const pendingIsValid = pendingInstallBackendId && hasBackendOption(availableBackends, pendingInstallBackendId);
        const installedIsValid = installedValue && hasBackendOption(availableBackends, installedValue);
        const previousIsValid = previousValue && hasBackendOption(availableBackends, previousValue);

        if (pendingInstallBackendId && !pendingIsValid) {
            pendingInstallBackendId = null;
        }

        backendSelect.value = pendingIsValid
            ? pendingInstallBackendId
            : installedIsValid
                ? installedValue
                : previousIsValid
                    ? previousValue
                    : availableBackends[0].id;
    }

    function updateInstalledBackendSummary(status) {
        const el = document.getElementById("installed-backend-summary");
        if (!el) return;

        const installedBackend = installedBackendIdFromStatus(status);
        const label = backendLabelFromStatus(status, installedBackend);
        el.className = "installed-backend-summary";

        if (status && status.installed && installedBackend) {
            el.textContent = "后端类型：" + label;
            el.classList.add("is-installed");
        } else if (status && status.config_stale && installedBackend) {
            el.textContent = "已配置后端：" + label + "（未完成）";
            el.classList.add("is-stale");
        } else {
            el.textContent = "当前后端：无";
            el.classList.add("is-empty");
        }
    }

    function syncInstallActionButtons(status, selectedInstallBackend) {
        const installBtn = document.getElementById("btn-install");
        const updateBtn = document.getElementById("btn-update");
        const repairBtn = document.getElementById("btn-repair");
        const installTarget = normalizeBackendId(selectedInstallBackend);
        const installedBackend = installedBackendIdFromStatus(status);
        const hasInstalledBackend = Boolean(status && status.installed && installedBackend);
        const hasStaleBackendConfig = Boolean(status && status.config_stale && installedBackend);
        const customTargetSelected = isCustomBackend(installTarget, status);
        const canActivateExisting = canActivateOfficialBackend(status, installTarget);

        if (installBtn && !customTargetSelected) {
            installBtn.textContent = canActivateExisting ? "激活现有" : "安装";
            installBtn.title = canActivateExisting
                ? "使用已安装在 llama/bin 中的官方 llama.cpp 文件"
                : "下载并安装所选的 llama.cpp 版本";
        }

        if (updateBtn) {
            const canUpdate = !customTargetSelected && hasInstalledBackend && !isCustomBackend(installedBackend, status);
            updateBtn.disabled = !canUpdate;
            updateBtn.title = canUpdate
                ? "检查已安装后端是否有更新"
                : customTargetSelected || isCustomBackend(installedBackend, status)
                    ? "自定义后端需手动管理"
                    : "请先安装 llama.cpp，再检查更新";
        }

        if (repairBtn) {
            const canRepair = !customTargetSelected && hasStaleBackendConfig && !isCustomBackend(installedBackend, status);
            repairBtn.classList.toggle("hidden", !canRepair && !customTargetSelected);
            repairBtn.disabled = !canRepair;
            repairBtn.title = customTargetSelected
                ? "自定义后端文件需手动管理"
                : canRepair
                    ? "重新安装已配置的后端文件"
                    : "仅未完成的默认后端安装可使用修复功能";
        }
    }

    function selectedBackendId() {
        const sel = document.getElementById("backend-select");
        return sel ? String(sel.value || "") : "";
    }

    function showCustomBackendControls(backend = selectedBackendId(), status = I.status.getLatestStatus()) {
        I.install.resetReleasesForBackend(backend);

        const sel = document.getElementById("release-select");
        if (sel) {
            sel.textContent = "";
            const option = document.createElement("option");
            option.value = backend;
            option.textContent = backendLabelFromStatus(status, backend);
            sel.appendChild(option);
            sel.disabled = true;
        }
        const releaseGroup = document.getElementById("release-group");
        if (releaseGroup) releaseGroup.style.display = "none";
        const customInfo = document.getElementById("custom-backend-info");
        if (customInfo) customInfo.style.display = "";
        const folder = document.getElementById("custom-backend-folder");
        if (folder) folder.textContent = customBackendFolder(backend, status);
        const title = document.getElementById("custom-backend-title");
        if (title) title.textContent = backendLabelFromStatus(status, backend) + " Setup:";
        const installBtn = document.getElementById("btn-install");
        if (installBtn) {
            installBtn.textContent = "激活自定义";
        }
        const updateBtn = document.getElementById("btn-update");
        if (updateBtn) updateBtn.disabled = true;
        const repairBtn = document.getElementById("btn-repair");
        if (repairBtn) repairBtn.classList.add("hidden");
    }

    function showOfficialBackendControls() {
        const releaseGroup = document.getElementById("release-group");
        if (releaseGroup) releaseGroup.style.display = "";
        const customInfo = document.getElementById("custom-backend-info");
        if (customInfo) customInfo.style.display = "none";
        const sel = document.getElementById("release-select");
        if (sel) sel.disabled = false;
        const installBtn = document.getElementById("btn-install");
        if (installBtn) {
            installBtn.textContent = "安装";
        }
        const updateBtn = document.getElementById("btn-update");
        if (updateBtn) updateBtn.disabled = false;
        const repairBtn = document.getElementById("btn-repair");
        if (repairBtn) repairBtn.classList.remove("hidden");
    }

    function onBackendChange() {
        const backend = selectedBackendId();
        const installedBackend = installedBackendIdFromStatus(I.status.getLatestStatus());
        pendingInstallBackendId = backend && backend !== installedBackend ? backend : null;
        if (isCustomBackend(backend)) {
            showCustomBackendControls();
            syncInstallActionButtons(I.status.getLatestStatus(), backend);
            return;
        }
        showOfficialBackendControls();
        syncInstallActionButtons(I.status.getLatestStatus(), backend);
        I.install.fetchReleases(backend);
    }

    async function activateCustomBackend() {
        if (customActivationInProgress) return;
        customActivationInProgress = true;
        const backend = selectedBackendId();
        const label = backendLabelFromStatus(I.status.getLatestStatus(), backend);
        const folder = customBackendFolder(backend);
        I.install.setInstallButtonsDisabled(true);
        I.install.showStatus("info", `Checking ${label} binaries...`);
        try {
            const result = await I.dependencies.fetchJson("/api/activate-custom", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ backend }),
            });
            if (result.ok) {
                const foundList = (result.found || []).join(", ");
                const missingList = (result.missing || []).join(", ");
                let msg = label + " 后端已激活。找到：" + (foundList || "无") + "。";
                if (missingList) msg += " 缺失：" + missingList + "。";
                I.install.showStatus("success", msg);
                await I.status.checkStatus();
            } else {
                const missingRequired = (result.missing_required || []).join(", ");
                const notExecutable = (result.not_executable || []).join(", ");
                const missingRuntime = (result.missing_runtime_files || []).join(", ");
                if (result.error) {
                    I.install.showStatus("error", result.error);
                } else if (missingRuntime) {
                    I.install.showStatus("error", `${label} 在 ${folder} 中缺少运行时库：${missingRuntime}。`);
                } else if (notExecutable) {
                    I.install.showStatus("error", `${label} 工具必须可执行，位置在 ${folder}：${notExecutable}。`);
                } else {
                    const missingList = missingRequired || (result.missing || []).join(", ");
                    I.install.showStatus("error", `${label} 需要在 ${folder} 中提供 llama-cli 和 llama-server。缺失：${missingList || "所需工具"}。`);
                }
            }
        } catch (e) {
            I.install.showStatus("error", `激活 ${label} 失败：${e.message}`);
        } finally {
            customActivationInProgress = false;
            I.install.setInstallButtonsDisabled(false);
            syncInstallActionButtons(I.status.getLatestStatus(), selectedBackendId());
        }
    }

    async function activateOfficialBackend(backend) {
        I.install.setInstallButtonsDisabled(true);
        I.install.showStatus("info", `正在激活现有 ${backend} 后端...`);
        try {
            const result = await I.dependencies.fetchJson("/api/install", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ backend, activate_existing: true }),
            });
            I.install.showStatus("success", `已激活现有安装：${result.tag} (${result.backend})。`);
            await I.status.checkStatus();
        } catch (e) {
            I.install.showStatus("error", "激活现有后端失败：" + e.message);
        } finally {
            I.install.setInstallButtonsDisabled(false);
            syncInstallActionButtons(I.status.getLatestStatus(), selectedBackendId());
        }
    }

    function updateStatusUI(status) {
        if (!status) return;
        const badge = document.getElementById("version-badge");
        const info = document.getElementById("installed-info");
        const backendSelect = document.getElementById("backend-select");
        const releaseSelect = document.getElementById("release-select");
        const installBtn = document.getElementById("btn-install");

        const installedBackend = installedBackendIdFromStatus(status);
        if (
            pendingInstallBackendId
            && installedBackend
            && pendingInstallBackendId === installedBackend
            && (status.installed || status.config_stale)
        ) {
            pendingInstallBackendId = null;
        }

        updateInstalledBackendSummary(status);
        renderBackendOptions(status);
        installBtn.disabled = !status.available_backends || status.available_backends.length === 0;

        const activeBackend = backendSelect ? backendSelect.value || "" : "";
        if (isCustomBackend(activeBackend, status)) {
            showCustomBackendControls(activeBackend, status);
        } else {
            showOfficialBackendControls();
        }
        syncInstallActionButtons(status, activeBackend);
        if (customActivationInProgress) I.install.setInstallButtonsDisabled(true);

        if (backendSelect) {
            const targetBackend = activeBackend;
            I.install.ensureReleasesForBackend(targetBackend);
        }

        if ((status.installed || status.config_stale) && status.tag && releaseSelect) {
            const hasTagOption = Array.from(releaseSelect.options).some((opt) => opt.value === status.tag);
            if (hasTagOption) {
                releaseSelect.value = status.tag;
            }
        }

        if (status.installed) {
            badge.textContent = isCustomBackend(status.backend, status)
                ? backendLabelFromStatus(status, status.backend)
                : status.version + " (" + status.backend + ")";
            badge.className = "badge badge-green";
        } else if (status.config_stale) {
            badge.textContent = "安装未完成";
            badge.className = "badge badge-yellow";
        } else {
            badge.textContent = "未安装";
            badge.className = "badge";
        }

        // Keep disclosure focus and state during status polls that change only runtime data.
        const installedInfoRenderKey = JSON.stringify([
            status.installed, status.config_stale, status.version, status.backend, status.executables,
            status.runtime_files, status.runtime_files_label, status.missing_runtime_files,
            status.platform, status.platform_label, status.arch, status.available_backends,
        ]);
        if (installedInfoRenderKey === lastInstalledInfoRenderKey) return;
        lastInstalledInfoRenderKey = installedInfoRenderKey;
        const optionalToolsOpen = Boolean(document.getElementById("installed-optional-tools")?.open);
        info.textContent = "";

        const appendRow = (label, value) => {
            const row = document.createElement("div");
            const strong = document.createElement("strong");
            strong.textContent = label + ":";
            row.appendChild(strong);
            row.appendChild(document.createTextNode(" " + value));
            info.appendChild(row);
        };

        if (status.installed) {
            appendRow("Version", String(status.version));
            appendRow("Backend", backendLabelFromStatus(status, status.backend));
            if (isCustomBackend(status.backend, status)) {
                appendRow("Folder", customBackendFolder(status.backend, status));
            }

            const tools = Object.entries(status.executables || {});
            const isCoreTool = name => /^llama-(cli|server)(\.|$)/.test(String(name));
            const coreTools = document.createElement("div");
            coreTools.className = "installed-tools";
            const coreTitle = document.createElement("h4");
            coreTitle.textContent = "启动工具";
            coreTools.appendChild(coreTitle);

            const optionalTools = document.createElement("details");
            optionalTools.id = "installed-optional-tools";
            optionalTools.className = "installed-tools";
            optionalTools.open = optionalToolsOpen;
            const optionalEntries = tools.filter(([name]) => !isCoreTool(name));
            const optionalTitle = document.createElement("summary");
            optionalTitle.textContent = `可选工具 · 已安装 ${optionalEntries.filter(([, exists]) => exists).length} / ${optionalEntries.length}`;
            optionalTools.appendChild(optionalTitle);
            const hint = document.createElement("p");
            hint.className = "installed-info-hint";
            hint.textContent = "基准测试和实用工具仅在各自任务中需要。";
            optionalTools.appendChild(hint);

            for (const [name, exists] of tools) {
                const required = isCoreTool(name);
                const row = document.createElement("div");
                row.className = "installed-tool-row";
                const label = document.createElement("code");
                label.textContent = name;
                const state = document.createElement("span");
                state.className = exists ? "exe-ok" : required ? "exe-missing" : "exe-optional";
                state.textContent = exists ? "可用" : required ? "缺失 · 必需" : "未安装";
                row.appendChild(label);
                row.appendChild(state);
                (required ? coreTools : optionalTools).appendChild(row);
            }
            info.appendChild(coreTools);
            if (optionalEntries.length) info.appendChild(optionalTools);

            if (status.runtime_files && status.runtime_files.length > 0) {
                appendRow(status.runtime_files_label || "Runtime libraries", `${status.runtime_files.length} file(s)`);
            }
        } else if (status.config_stale) {
            const missingRuntimeFiles = Array.isArray(status.missing_runtime_files)
                ? status.missing_runtime_files.filter(Boolean)
                : [];
            const warning = document.createElement("div");
            warning.className = "installed-info-warning";
            warning.textContent = missingRuntimeFiles.length > 0
                ? "配置已存在，但缺少所需的 llama.cpp 运行时库。"
                : "配置已存在，但缺少所需的 llama.cpp 可执行文件。";
            info.appendChild(warning);

            if (missingRuntimeFiles.length > 0) {
                const missing = document.createElement("div");
                missing.className = "installed-info-note";
                const shown = missingRuntimeFiles.slice(0, 8).join(", ");
                const extra = missingRuntimeFiles.length > 8 ? `, and ${missingRuntimeFiles.length - 8} more` : "";
                missing.textContent = "缺少运行时库：" + shown + extra;
                info.appendChild(missing);
            }

            const hint = document.createElement("div");
            hint.className = "installed-info-hint";
            hint.textContent = isCustomBackend(status.backend, status)
                ? `请检查 ${customBackendFolder(status.backend, status)} 中的所需工具和运行时库，然后再次点击“激活自定义”。`
                : status.platform === "linux" && missingRuntimeFiles.length > 0
                    ? "请先点击“修复安装”。如果同样的库仍然缺失，再安装或更新该系统的 Vulkan/ROCm 驱动运行时。"
                    : "请点击“修复安装”以重新安装已配置的版本/后端并恢复二进制文件。";
            info.appendChild(hint);

            appendRow("Version (config)", String(status.version));
            appendRow("Backend (config)", backendLabelFromStatus(status, status.backend));
            if (isCustomBackend(status.backend, status)) {
                appendRow("Folder", customBackendFolder(status.backend, status));
            }
        } else {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            const title = document.createElement("div");
            title.className = "empty-state-title";
            const hint = document.createElement("p");
            const platformText = status.platform_label ? `${status.platform_label} (${status.arch})` : "this system";
            if (!status.available_backends || status.available_backends.length === 0) {
                title.textContent = "没有可用的预构建后端";
                hint.textContent = `没有为 ${platformText} 配置可用的 prebuilt llama.cpp 后端。`;
            } else {
                title.textContent = "尚未安装 llama.cpp";
                hint.textContent = `请选择上方的版本并点击“安装”，以在 ${platformText} 上设置 llama.cpp。`;
            }
            empty.appendChild(title);
            empty.appendChild(hint);
            info.appendChild(empty);
        }
    }

    I.backends = {
        isCustomBackend,
        canActivateOfficialBackend,
        selectedBackendId,
        onBackendChange,
        activateCustomBackend,
        activateOfficialBackend,
        updateStatusUI,
    };
})();

// Presets package (9/10): save/update/duplicate/rename/load/delete/archive/favorite/export/import operations.
async function savePreset() {
    const nameInput = document.getElementById("preset-name-input");
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        showPresetActionStatus("请输入新预设的名称", "error", 3200);
        return;
    }
    if (await savePresetAsNew(name)) nameInput.value = "";
}

function setPresetSavePending(pending) {
    presetSavePending = pending;
    const save = document.getElementById("btn-save-preset");
    if (save) save.disabled = pending;
    refreshPresetContext();
}

function restorePresetActionFocus(trigger) {
    if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus();
        return;
    }
    const context = Array.from(document.querySelectorAll("[data-preset-context]"))
        .find(panel => panel.offsetParent !== null);
    context?.querySelector("[data-preset-name]")?.focus();
}

async function savePresetAsNew(name) {
    if (presetSavePending) return false;
    const trigger = document.activeElement;
    setPresetSavePending(true);
    try {
        const data = buildCurrentPresetData();
        if (name === undefined) {
            name = await presetDependencies.promptAction("另存为新预设", "将当前正在编辑的所有设置以全新的名称保存，你之前已有的全部预设都将完整保留，不会被覆盖或修改。", "", "另存为新预设");
        }
        if (name === null) return false;
        name = name.trim();
        if (!name) throw new Error("预设名称不能为空");
        const result = await presetDependencies.fetchJson("/api/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, data, overwrite: false }),
        });
        if (!result.saved) throw new Error("无法保存预设");
        const savedName = result.name || name;
        setLoadedPreset(savedName, data);
        selectedPresetName = savedName;
        await loadPresets();
        showPresetActionStatus(`另存为新预设 "${savedName}"`, "success");
        return true;
    } catch (e) {
        showPresetActionStatus(e.message || "保存预设失败", "error", 5000);
        console.warn("保存预设失败", e);
        return false;
    } finally {
        setPresetSavePending(false);
        restorePresetActionFocus(trigger);
    }
}

function reviewPresetUpdate(name, changes) {
    const dialog = document.getElementById("preset-update-dialog");
    document.getElementById("preset-update-title").textContent = `要更新“${name}”吗？`;
    renderPresetChangeRows(dialog.querySelector("tbody"), changes);
    dialog.returnValue = "cancel";
    return new Promise(resolve => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "update"), { once: true });
        dialog.showModal();
    });
}

async function updatePreset(name) {
    if (presetSavePending) return;
    const trigger = document.activeElement;
    setPresetSavePending(true);
    try {
        // Capture before opening the review; save only what the user reviewed.
        const data = buildCurrentPresetData();
        const entries = await fetchPresetEntries();
        reconcileLoadedPreset(entries);
        const preset = findPresetByName(entries, name);
        if (!preset) throw new Error(`预设“${name}”已不存在。请将修改另存为新预设。`);
        const { changes } = comparePresetToCurrent(preset.data, data);
        if (!changes.length) {
            showPresetActionStatus(`当前设置已与“${name}”一致`, "success");
            return;
        }
        if (!await reviewPresetUpdate(name, changes)) return;
        const latestEntries = await fetchPresetEntries();
        const latest = findPresetByName(latestEntries, name);
        if (!latest || JSON.stringify(latest.data) !== JSON.stringify(preset.data)) {
            reconcileLoadedPreset(latestEntries);
            throw new Error("审核期间保存的预设已发生变化。请重新审核后再更新。");
        }
        const result = await presetDependencies.fetchJson("/api/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, data }),
        });
        if (!result.saved) throw new Error("无法更新预设");
        setLoadedPreset(result.name || name, data, latestEntries.some(entry => entry.name === name && entry.archived));
        await loadPresets();
        showPresetActionStatus(`已更新预设“${name}”`, "success");
    } catch (e) {
        showPresetActionStatus(e.message || "更新预设失败", "error", 5000);
        console.warn("更新预设失败", e);
    } finally {
        setPresetSavePending(false);
        restorePresetActionFocus(trigger);
    }
}

async function duplicatePreset(name) {
    try {
        const presets = await fetchPresetEntries();
        const source = presets.find((preset) => preset.name === name);
        if (!source) {
            showPresetStatus(`找不到预设“${name}”。`, "error", 3200);
            return;
        }
        // duplicates the saved preset, not the live Configure state, so the current
        // launch settings are left untouched
        const duplicateName = buildDuplicatePresetName(name, new Set(presets.map((preset) => preset.name)));
        // overwrite:false so a duplicate can never destroy an existing preset. The
        // name check above should already have avoided the collision; this catches
        // the case-insensitive-filesystem edge it cannot see from the browser and
        // turns it into a 409 the user is told about instead of silent data loss.
        const result = await presetDependencies.fetchJson("/api/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: duplicateName,
                data: normalizePresetData(source.data),
                overwrite: false,
            }),
        });
        if (result.saved) {
            selectedPresetName = result.name || duplicateName;
            await loadPresets();
            showPresetStatus(`已复制为“${result.name || duplicateName}”`, "success");
        }
    } catch (e) {
        const message = e && e.message === SENSITIVE_CUSTOM_ARG_MESSAGE
            ? SENSITIVE_CUSTOM_ARG_MESSAGE
            : "复制预设失败";
        showPresetStatus(message, "error", 5000);
        console.warn("Failed to duplicate preset", e);
    }
}

async function renamePreset(name) {
    const nextName = await presetDependencies.promptAction(
        "重命名预设",
        `请输入“${name}”的新名称。`,
        name,
        "重命名"
    );
    if (nextName === null) return;
    if (!nextName) {
        showPresetActionStatus("预设名称不能为空", "error", 3200);
        return;
    }
    if (nextName === name) return;

    try {
        const result = await presetDependencies.fetchJson("/api/presets/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, new_name: nextName }),
        });
        if (result.renamed) {
            const savedName = result.name || nextName;
            // must run before loadPresets, which prunes local state for unknown names
            renamePresetLocalState(name, savedName);
            if (selectedPresetName === name) selectedPresetName = savedName;
            if (selectedPresetNames.has(name)) {
                selectedPresetNames.delete(name);
                selectedPresetNames.add(savedName);
            }
            await loadPresets();
            showPresetActionStatus(`已重命名为“${savedName}”`, "success");
        }
    } catch (e) {
        const message = e && e.message ? e.message : "重命名预设失败";
        showPresetActionStatus(message, "error", 5000);
        console.warn("Failed to rename preset", e);
    }
}

async function loadPreset(name) {
    try {
        const presets = await fetchPresetEntries();
        const preset = findPresetByName(presets, name);
        if (preset) {
            const presetData = preset.data;
            const warnings = getPresetWarnings(presetData);
            applyPresetData(presetData);
            setLoadedPreset(name, presetData, presets.some(item => item.name === name && item.archived));
            markPresetUsed(name);
            if (warnings.length > 0) {
                showPresetStatus(`已加载“${name}”，但有警告：${warnings[0]}`, "warning", 5000);
            } else {
                showPresetStatus(`已加载预设“${name}”`, "success");
            }
            return { ok: true, name, data: presetData, warnings };
        } else {
            showPresetStatus(`找不到预设“${name}”。`, "error", 3200);
            return { ok: false, error: `预设“${name}”已不存在。` };
        }
    } catch (e) {
        showPresetStatus("加载预设失败", "error", 3200);
        console.warn("加载预设失败", e);
        return { ok: false, error: "无法加载此预设。请在预设库中重试。" };
    }
}

async function deletePreset(name) {
    const ok = await presetDependencies.confirmAction(
        "删除预设",
        `确定删除预设“${name}”吗？此操作无法撤销。`,
        "删除"
    );
    if (!ok) return;
    try {
        await presetDependencies.fetchJson("/api/presets/" + encodeURIComponent(name), { method: "DELETE" });
        deletePresetLocalState(name);
        loadPresets();
        showPresetActionStatus(`已删除预设“${name}”`, "success");
    } catch (e) {
        showPresetActionStatus("删除预设失败", "error", 3200);
        console.warn("Failed to delete preset", e);
    }
}

async function setPresetArchived(names, archived) {
    const list = Array.isArray(names) ? names : [names];
    if (list.length === 0) return;
    try {
        await presetDependencies.fetchJson("/api/presets/archive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: list, archived }),
        });
        for (const name of list) {
            selectedPresetNames.delete(name);
        }
        if (list.includes(selectedPresetName)) {
            selectedPresetName = "";
        }
        await loadPresets();
        showPresetActionStatus(
            `${archived ? "已归档" : "已恢复"} ${list.length} 个预设`,
            "success"
        );
    } catch (e) {
        showPresetActionStatus(
            archived ? "归档预设失败" : "恢复预设失败",
            "error",
            3200
        );
        console.warn("Failed to update preset archive state", e);
    }
}

function archiveSelectedPresets(archived) {
    const names = Array.from(selectedPresetNames);
    if (names.length === 0) {
        showPresetActionStatus("请先选择预设", "error", 3200);
        return;
    }
    setPresetArchived(names, archived);
}

async function favoriteSelectedPresets(favorite) {
    const names = Array.from(selectedPresetNames);
    if (names.length === 0) {
        showPresetStatus("请先选择预设", "error", 3200);
        return;
    }
    const changed = setPresetsFavorite(names, favorite);
    if (!changed) {
        showPresetStatus(
            favorite
                ? `所选 ${names.length} 个预设均已收藏`
                : `所选 ${names.length} 个预设中没有收藏项`,
            "success"
        );
        return;
    }
    await loadPresets();
    showPresetStatus(
        `${favorite ? "已收藏" : "已取消收藏"} ${changed} 个预设`,
        "success"
    );
}

async function deleteSelectedPresets() {
    const names = Array.from(selectedPresetNames);
    if (names.length === 0) {
        showPresetActionStatus("请先选择预设", "error", 3200);
        return;
    }

    const ok = await presetDependencies.confirmAction(
        "删除所选预设",
        `确定删除选中的 ${names.length} 个预设吗？此操作无法撤销。`,
        "删除"
    );
    if (!ok) return;

    try {
        for (const name of names) {
            await presetDependencies.fetchJson("/api/presets/" + encodeURIComponent(name), { method: "DELETE" });
            deletePresetLocalState(name);
        }
        selectedPresetNames.clear();
        if (names.includes(selectedPresetName)) {
            selectedPresetName = "";
        }
        await loadPresets();
        showPresetActionStatus(`已删除 ${names.length} 个预设`, "success");
    } catch (e) {
        showPresetActionStatus("删除所选预设失败", "error", 3200);
        console.warn("Failed to delete selected presets", e);
        loadPresets();
    }
}

function exportPreset(name) {
    presetDependencies.fetchJson("/api/presets")
        .then((presets) => {
            const p = presets.find(x => x.name === name);
            if (!p) {
                showPresetStatus(`Preset "${name}" not found.`, "error", 3200);
                return;
            }
            const presetData = normalizePresetData(p.data);
            const exportData = { tool: presetData.tool, model: presetData.model, flags: presetData.flags };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name + ".json";
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch((e) => {
            showPresetStatus("导出预设失败", "error", 3200);
            console.warn("Failed to export preset", e);
        });
}

async function exportPresetShortcut(name) {
    try {
        const resp = await fetch("/api/presets/shortcut", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (!resp.ok) {
            throw new Error(`Shortcut export failed with HTTP ${resp.status}`);
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = String(name || "Llama GUI").replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_").replace(/^[. _]+|[. _]+$/g, "") || "Llama GUI";
        a.href = url;
        a.download = `${safeName}.cmd`;
        a.click();
        URL.revokeObjectURL(url);
        showPresetStatus(`Exported shortcut for "${name}"`, "success");
    } catch (e) {
        showPresetStatus("导出快捷方式失败", "error", 3200);
        console.warn("Failed to export preset shortcut", e);
    }
}

function exportSelectedPresets() {
    const names = new Set(selectedPresetNames);
    if (names.size === 0) {
        showPresetStatus("未选择预设", "error", 3200);
        return;
    }
    presetDependencies.fetchJson("/api/presets")
        .then((presets) => {
            const selected = (presets || []).filter((p) => names.has(p.name));
            if (selected.length === 0) {
                showPresetStatus("未找到所选预设", "error", 3200);
                return;
            }
            const exportData = { presets: selected.map(p => ({
                name: p.name,
                data: normalizePresetData(p.data)
            })) };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "llama-gui-presets-selected.json";
            a.click();
            URL.revokeObjectURL(url);
            showPresetStatus(`Exported ${selected.length} preset(s)`, "success");
        })
        .catch((e) => {
            showPresetStatus("导出所选预设失败", "error", 3200);
            console.warn("Failed to export selected presets", e);
        });
}

function exportAllPresets() {
    presetDependencies.fetchJson("/api/presets")
        .then((presets) => {
            if (!presets || presets.length === 0) {
                showPresetStatus("没有可导出的预设", "error", 3200);
                return;
            }
            const exportData = { presets: presets.map(p => ({
                name: p.name,
                data: normalizePresetData(p.data)
            })) };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "llama-gui-presets.json";
            a.click();
            URL.revokeObjectURL(url);
            showPresetStatus(`Exported ${presets.length} preset(s)`, "success");
        })
        .catch((e) => {
            showPresetStatus("导出预设失败", "error", 3200);
            console.warn("Failed to export presets", e);
        });
}

async function handlePresetImport(file) {
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const bulkPresets = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === "object" && Array.isArray(parsed.presets)
                ? parsed.presets
                : null;

        if (bulkPresets && bulkPresets.length > 0) {
            const pendingImports = [];
            let unnamedIdx = 0;
            for (const entry of bulkPresets) {
                const name = sanitizeImportedPresetName(entry.name || "Imported-" + (++unnamedIdx));
                if (!name) {
                    showPresetActionStatus("预设导入包含无效的名称。", "error", 3200);
                    return;
                }
                const normalized = normalizeImportedPresetData(entry.data || {});
                if (!hasUsablePresetData(normalized)) continue;
                pendingImports.push({ name, data: normalized });
            }
            const existingPresets = await fetchPresetEntries();
            const collision = findPresetImportNameCollision(existingPresets, pendingImports);
            if (collision) {
                showPresetActionStatus(`预设 "${collision}" 已存在。请在导入前重命名或删除。`, "error", 5000);
                return;
            }
            try {
                let importedCount = 0;
                for (const preset of pendingImports) {
                    await presetDependencies.fetchJson("/api/presets", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: preset.name, data: preset.data, overwrite: false }),
                    });
                    importedCount++;
                }
                loadPresets();
                showPresetActionStatus(`Imported ${importedCount} preset(s)`, "success");
            } catch (e) {
                console.warn("Preset import failed mid-loop", e);
                loadPresets();
                showPresetActionStatus("导入部分预设失败。", "error", 3200);
            }
            return;
        }

        const normalized = normalizeImportedPresetData(parsed);
        if (!hasUsablePresetData(normalized)) {
            showPresetActionStatus("预设文件不包含可用数据。", "error", 3200);
            return;
        }
        const name = sanitizeImportedPresetName(file.name.replace(/\.json$/i, ""));
        if (!name) {
            showPresetActionStatus("预设导入包含无效的名称。", "error", 3200);
            return;
        }
        const existingPresets = await fetchPresetEntries();
        const collision = findPresetImportNameCollision(existingPresets, [{ name }]);
        if (collision) {
            showPresetActionStatus(`预设 "${collision}" 已存在。请在导入前重命名或删除。`, "error", 5000);
            return;
        }
        await presetDependencies.fetchJson("/api/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, data: normalized, overwrite: false }),
        });
        loadPresets();
        showPresetActionStatus(`Imported preset \"${name}\"`, "success");
    } catch (err) {
        const message = err && err.message === SENSITIVE_CUSTOM_ARG_MESSAGE
            ? SENSITIVE_CUSTOM_ARG_MESSAGE
            : "导入预设失败";
        showPresetActionStatus(message, "error", 5000);
        console.warn("Failed to import preset", err);
    }
}

// Presets package (6/10): library summary, health message, detail/bulk panels, and entry rendering.
// Describes the presets currently visible rather than every preset on disk, so
// the numbers always agree with the list beside them and with the count line.
// Reading currentPresetGroups keeps this free of a second copy of library state.
function getPresetLibrarySummary() {
    const entries = getVisiblePresetEntries();
    const mostRecent = entries.reduce(
        (best, entry) => (entry.lastUsed && (!best || entry.lastUsed > best.lastUsed) ? entry : best),
        null
    );
    return {
        presetCount: entries.length,
        modelCount: currentPresetGroups.length,
        warningCount: entries.reduce((total, entry) => total + entry.warnings.length, 0),
        missingModelCount: entries.filter((entry) => entry.modelMissing).length,
        favoriteCount: entries.filter((entry) => entry.favorite).length,
        mostRecent,
        filtered: isPresetFilterActive(),
        // A zero missing-model count means "none found" only when the model list
        // actually loaded. With no list it means "not checked", and the two must
        // not read the same in the summary.
        modelsChecked: getKnownModelNames() !== null,
    };
}

// Health copy must never make a claim the counts underneath it cannot support.
// Two ways that goes wrong, both producing a false all-clear:
//   1. A filter narrows the view. Searching past the one preset with a deleted
//      GGUF would otherwise render "every preset loads cleanly" over hidden rot.
//   2. The model list never loaded. isPresetModelMissing() stays silent by
//      design when it has nothing to compare against, so a clean count there
//      means "not checked", not "checked and fine".
function getPresetHealthMessage(summary) {
    // Pointing at a filter that is already applied is dead advice.
    const review = presetWarningFilterActive ? "" : "请使用“警告”筛选条件查看。";
    const scopePrefix = summary.filtered ? "当前显示的预设中，" : "";

    if (summary.missingModelCount > 0) {
        const count = summary.missingModelCount;
        return `${scopePrefix}${count} 个预设指向的模型文件已不在模型目录中。${review}`;
    }

    if (summary.warningCount > 0) {
        const count = summary.warningCount;
        const subject = `${count} 条警告`;
        return summary.filtered
            ? `${subject}出现在当前显示的预设中。${review}`
            : `${subject}出现在预设库中。${review}`;
    }

    // Clean, but model presence was never verified. Report the other warnings
    // honestly and say plainly which check did not run.
    if (!summary.modelsChecked) {
        return summary.filtered
            ? "当前显示的预设没有警告；模型列表尚未加载，因此未检查模型文件。"
            : "没有模板或启动参数警告，由于模型列表尚未加载，因此未对模型文件进行检查。";
    }

    return summary.filtered
        ? "当前显示的预设无警告。清除搜索和筛选条件以检查整个库。"
        : "无警告。每个预设都指向一个真实存在且能干净加载的模型。";
}

function renderPresetLibrarySummary(panel) {
    const summary = getPresetLibrarySummary();

    if (summary.presetCount === 0) {
        const empty = document.createElement("div");
        empty.className = "preset-detail-empty";
        empty.appendChild(createPresetIcon(PRESET_ICON_EMPTY));

        const emptyTitle = document.createElement("div");
        emptyTitle.className = "preset-detail-empty-title";
        emptyTitle.textContent = summary.filtered ? "没有符合条件的预设" : "尚未保存预设";

        const emptyText = document.createElement("p");
        emptyText.textContent = summary.filtered
            ? "清除搜索关键词或筛选条件，即可查看模型库中其余未展示的内容。"
            : "从「配置面板」中保存预设，就能把当前这套启动配置永久留存，后续随时可以一键恢复使用。";

        empty.appendChild(emptyTitle);
        empty.appendChild(emptyText);
        panel.appendChild(empty);
        return;
    }

    const kicker = document.createElement("div");
    kicker.className = "preset-detail-kicker";
    kicker.textContent = summary.filtered ? "筛选结果" : "预设库";

    const title = document.createElement("div");
    title.className = "preset-detail-title";
    title.textContent = `${summary.presetCount} 个预设`;

    const subtitle = document.createElement("div");
    subtitle.className = "preset-detail-subtitle";
    subtitle.textContent = summary.filtered
        ? "当前处于筛选视图状态。清除所有搜索和筛选条件后，就能看到整个模型库的完整汇总统计信息。"
        : "在左侧列表选中任意一个预设，即可在右侧预览它保存的关联模型、工具配置、警告信息和全部参数设置。";

    const stats = document.createElement("div");
    stats.className = "preset-detail-stats";
    appendDetailStat(stats, "模型", String(summary.modelCount));
    appendDetailStat(stats, "收藏", String(summary.favoriteCount));
    appendDetailStat(
        stats,
        "警告",
        String(summary.warningCount),
        summary.warningCount ? "warn" : "ok"
    );
    // An unchecked count must not render as a green zero, which reads as
    // "checked, none missing" — the same false all-clear as the health line.
    let missingModelClass = "";
    if (summary.modelsChecked) {
        missingModelClass = summary.missingModelCount ? "warn" : "ok";
    }
    appendDetailStat(
        stats,
        "缺失模型",
        summary.modelsChecked ? String(summary.missingModelCount) : "—",
        missingModelClass
    );

    panel.appendChild(kicker);
    panel.appendChild(title);
    panel.appendChild(subtitle);
    panel.appendChild(stats);

    const recentTitle = document.createElement("div");
    recentTitle.className = "preset-detail-section-title";
    recentTitle.textContent = "最近使用";

    const recent = document.createElement("div");
    recent.className = "preset-detail-info preset-summary-block";
    const recentText = document.createElement("span");
    // textContent, never innerHTML: preset names are user-supplied.
    recentText.textContent = summary.mostRecent
        ? `${summary.mostRecent.name} · ${formatPresetTimestamp(summary.mostRecent.lastUsed)}`
        : "本机尚未加载预设";
    recent.appendChild(recentText);

    panel.appendChild(recentTitle);
    panel.appendChild(recent);

    const healthTitle = document.createElement("div");
    healthTitle.className = "preset-detail-section-title";
    // "Library Health" is an absolute claim, and the counts under it are not.
    healthTitle.textContent = summary.filtered ? "Health Of Presets Shown" : "库健康状态";

    const health = document.createElement("div");
    const needsAttention = summary.warningCount > 0;
    health.className = needsAttention ? "preset-warning" : "preset-detail-note";
    health.appendChild(createPresetIcon(needsAttention ? PRESET_ICON_WARNING : PRESET_ICON_CHECK));
    const healthText = document.createElement("span");
    healthText.textContent = getPresetHealthMessage(summary);
    health.appendChild(healthText);

    panel.appendChild(healthTitle);
    panel.appendChild(health);
}

function renderPresetDetailPanel() {
    const panel = document.getElementById("preset-detail-panel");
    if (!panel) return;
    panel.textContent = "";

    const entry = findVisiblePresetEntry(selectedPresetName);
    if (!entry) {
        renderPresetLibrarySummary(panel);
        return;
    }

    const kicker = document.createElement("div");
    kicker.className = "preset-detail-kicker";
    kicker.textContent = "配置存档";

    const title = document.createElement("div");
    title.className = "preset-detail-title";
    title.textContent = entry.name;

    const subtitle = document.createElement("div");
    subtitle.className = "preset-detail-subtitle";
    subtitle.textContent = entry.groupKey === NO_MODEL_PRESET_GROUP_KEY ? "未保存模型" : entry.groupKey;

    const actions = document.createElement("div");
    actions.className = "preset-detail-actions";
    actions.appendChild(createPresetButton("加载到配置中", "btn btn-sm btn-primary", async () => {
        const result = await loadPreset(entry.name);
        if (result.ok) presetDependencies.switchTab("configure");
    }, "加载这些已保存的设置以进行编辑；正在运行的进程保持不变"));

    const favoriteBtn = document.createElement("button");
    favoriteBtn.type = "button";
    favoriteBtn.className = entry.favorite ? "btn btn-sm preset-favorite-btn active" : "btn btn-sm preset-favorite-btn";
    favoriteBtn.title = entry.favorite ? "取消收藏" : "添加到收藏";
    favoriteBtn.setAttribute("aria-pressed", String(entry.favorite));
    favoriteBtn.appendChild(createPresetIcon(entry.favorite ? PRESET_ICON_STAR : PRESET_ICON_STAR_OUTLINE));
    favoriteBtn.appendChild(document.createTextNode(entry.favorite ? " 已收藏" : " 收藏"));
    favoriteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePresetFavorite(entry.name);
        loadPresets();
    });
    actions.appendChild(favoriteBtn);

    const more = document.createElement("details");
    more.className = "preset-more-actions";
    const moreLabel = document.createElement("summary");
    moreLabel.className = "btn btn-sm";
    moreLabel.textContent = "更多操作";
    const moreButtons = document.createElement("div");
    moreButtons.className = "preset-more-buttons";
    moreButtons.appendChild(createPresetButton(`更新“${entry.name}”…`, "btn btn-sm", () => updatePreset(entry.name), "在覆盖此已保存的预设之前，请先检查当前的编辑内容。"));
    moreButtons.appendChild(createPresetButton("复制", "btn btn-sm", () => duplicatePreset(entry.name), "在不改变当前设置的情况下，保存此预设的副本。"));
    moreButtons.appendChild(createPresetButton("重命名", "btn btn-sm", () => renamePreset(entry.name), "重命名此预设，同时保留其“收藏”状态和使用历史记录。"));
    moreButtons.appendChild(createPresetButton("导出", "btn btn-sm", () => exportPreset(entry.name)));
    moreButtons.appendChild(createPresetButton("Windows 快捷方式", "btn btn-sm", () => exportPresetShortcut(entry.name), "为此预设导出一个 Windows .cmd 快捷方式文件"));
    moreButtons.appendChild(createPresetButton(
        entry.archived ? "恢复" : "存档",
        "btn btn-sm",
        () => setPresetArchived([entry.name], !entry.archived),
        entry.archived
            ? "将此预设从存档中恢复至主列表"
            : "将此预设移至存档以清理列表；您可以随时将其恢复。"
    ));

    moreButtons.appendChild(createPresetButton("删除", "btn btn-sm btn-danger", () => deletePreset(entry.name)));
    more.append(moreLabel, moreButtons);
    more.addEventListener("keydown", event => {
        if (event.key === "Escape" && more.open) {
            event.preventDefault();
            more.open = false;
            moreLabel.focus();
        }
    });
    actions.appendChild(more);

    const stats = document.createElement("div");
    stats.className = "preset-detail-stats";
    appendDetailStat(stats, "工具", entry.data.tool || "保持当前工具");
    const effective = getPresetFlagCore().buildEffectiveFlagValues(entry.data.flags);
    for (const [id, label] of [["ctx_size", "Context"], ["gpu_layers", "GPU offload"], ["cache_type_k", "K cache"], ["cache_type_v", "V cache"]]) {
        const saved = Object.prototype.hasOwnProperty.call(entry.data.flags, id);
        appendDetailStat(stats, label, `${saved ? "" : "GUI 默认 · "}${formatSavedPresetValue(id, effective[id])}`);
    }

    const settingsTitle = document.createElement("div");
    settingsTitle.className = "preset-detail-section-title";
    settingsTitle.textContent = "运行与输入";

    const settings = document.createElement("details");
    settings.className = "preset-saved-settings";
    const settingsLabel = document.createElement("summary");
    settingsLabel.textContent = `所有已保存的设置项 · 共 ${entry.overrideCount} 项非默认自定义覆盖`;
    const values = document.createElement("table");
    values.className = "preset-comparison-table preset-saved-values";
    const caption = document.createElement("caption");
    caption.textContent = "仅当你保存的数值与GUI出厂默认值不同时，才会显示自定义配置；空白单元格代表该参数完全匹配当前GUI的默认值。";
    const head = document.createElement("thead");
    const headings = document.createElement("tr");
    for (const title of ["设置", "已保存的值", "GUI 默认"]) {
        const heading = document.createElement("th");
        heading.scope = "col";
        heading.textContent = title;
        headings.appendChild(heading);
    }
    head.appendChild(headings);
    const body = document.createElement("tbody");
    const definitions = new Map(getPresetFlagDefinitions().map(flag => [flag.id, flag]));
    const overrides = new Set(entry.overrideFlagIds);
    for (const [id, value] of Object.entries(entry.data.flags)) {
        if (SENSITIVE_PRESET_FLAG_IDS.has(id) || id === "ctx_size_draft") continue;
        const row = document.createElement("tr");
        const label = document.createElement("th");
        label.scope = "row";
        label.textContent = getPresetFlagLabel(id);
        const text = document.createElement("td");
        text.textContent = formatSavedPresetValue(id, value);
        const defaultText = document.createElement("td");
        if (overrides.has(id)) {
            const definition = definitions.get(id);
            defaultText.textContent = definition && Object.prototype.hasOwnProperty.call(definition, "default")
                ? formatSavedPresetValue(id, definition.default)
                : "不可用";
        }
        row.append(label, text, defaultText);
        body.appendChild(row);
    }
    values.append(caption, head, body);
    settings.append(settingsLabel, values);
    const settingsNote = document.createElement("p");
    settingsNote.className = "help-text";
    settingsNote.textContent = "已保存的启动输入项，存储于 llama.cpp 解析「自动」或「Fit 自动显存适配」规则之前的原始状态。加载预设时，所有缺失的设置项将自动使用GUI界面的默认值。API 密钥、Hugging Face令牌会被排除在预设文件之外；敏感信息和自定义启动参数在此界面中处于隐藏状态。";

    const warnings = document.createElement("div");
    warnings.className = entry.warnings.length ? "preset-warning" : "preset-detail-note";
    warnings.appendChild(createPresetIcon(entry.warnings.length ? PRESET_ICON_WARNING : PRESET_ICON_CHECK));
    const warningsText = document.createElement("span");
    warningsText.textContent = entry.warnings.length
        ? entry.warnings.join(" ")
        : "无预设警告：该预设可以直接干净地加载到「配置面板」和「快速启动」功能中，不会出现参数缺失、冲突或报错。";
    warnings.appendChild(warningsText);

    panel.appendChild(kicker);
    panel.appendChild(title);
    panel.appendChild(subtitle);
    panel.appendChild(warnings);
    panel.appendChild(actions);
    panel.appendChild(settingsTitle);
    panel.appendChild(stats);
    panel.appendChild(settingsNote);
    panel.appendChild(settings);
}

function renderPresetBulkControls() {
    const countEl = document.getElementById("presets-selection-count");
    const deleteButton = document.getElementById("btn-presets-delete-selected");
    const exportButton = document.getElementById("btn-presets-export-selected");
    const clearButton = document.getElementById("btn-presets-select-none");
    const favoriteButton = document.getElementById("btn-presets-favorite-selected");
    const unfavoriteButton = document.getElementById("btn-presets-unfavorite-selected");
    const browser = document.getElementById("presets-browser");
    const visibleNames = new Set(getVisiblePresetEntries().map((entry) => entry.name));
    let visibleSelectedCount = 0;

    for (const name of selectedPresetNames) {
        if (visibleNames.has(name)) visibleSelectedCount++;
    }

    if (countEl) {
        countEl.textContent = `已选择 ${visibleSelectedCount} 项`;
    }
    if (deleteButton) {
        deleteButton.disabled = selectedPresetNames.size === 0;
    }
    if (exportButton) {
        exportButton.disabled = selectedPresetNames.size === 0;
    }
    if (clearButton) {
        clearButton.disabled = selectedPresetNames.size === 0;
    }
    if (favoriteButton) {
        favoriteButton.disabled = selectedPresetNames.size === 0;
    }
    if (unfavoriteButton) {
        unfavoriteButton.disabled = selectedPresetNames.size === 0;
    }
    const archiveButton = document.getElementById("btn-presets-archive-selected");
    if (archiveButton) {
        archiveButton.disabled = selectedPresetNames.size === 0;
    }
    const restoreButton = document.getElementById("btn-presets-restore-selected");
    if (restoreButton) {
        restoreButton.disabled = selectedPresetNames.size === 0;
    }
    if (browser) {
        browser.classList.toggle("has-checked", selectedPresetNames.size > 0);
    }
}

function renderPresetArchiveChip() {
    const chip = document.getElementById("preset-archive-view");
    if (!chip) return;
    const countText = presetArchivedCount > 0 ? ` (${presetArchivedCount})` : "";
    chip.textContent = presetArchiveViewActive
        ? `\uD83D\uDCE6 正在查看归档${countText}`
        : `\uD83D\uDCE6 已归档${countText}`;
    chip.title = presetArchiveViewActive
        ? "正在查看归档预设，点击此处返回预设主列表。"
        : "显示预设主列表中被归档隐藏的所有预设";
    chip.classList.toggle("active", presetArchiveViewActive);
    chip.setAttribute("aria-pressed", String(presetArchiveViewActive));
}

function renderPresetCountLine() {
    const countLine = document.getElementById("presets-count-line");
    if (!countLine) return;
    const presetCount = getVisiblePresetEntries().length;
    const modelCount = currentPresetGroups.length;
    countLine.textContent = `${presetCount} 个预设 · ${modelCount} 个模型`;
}

function renderPresetAuxiliaryPanels() {
    renderPresetDetailPanel();
    renderPresetBulkControls();
    renderPresetCountLine();
}

function renderPresetLoadErrorState() {
    const panel = document.getElementById("preset-detail-panel");
    if (panel) {
        panel.textContent = "";
        const error = document.createElement("div");
        error.className = "preset-detail-empty presets-error";
        error.textContent = "预设库不可用，请尝试刷新列表。";
        panel.appendChild(error);
    }
    renderPresetBulkControls();
    renderPresetCountLine();
}

function selectPresetEntry(name) {
    selectedPresetName = String(name || "");
    // searching force-expands groups, so a selection made from search results would be
    // hidden again once the query is cleared unless its group is expanded for real
    const entry = findVisiblePresetEntry(selectedPresetName);
    if (entry && isPresetGroupCollapsed(entry.groupKey)) {
        setPresetGroupCollapsed(entry.groupKey, false);
    }
    renderPresetGroups(document.getElementById("presets-list"), currentPresetGroups);
}

function setPresetChecked(name, checked) {
    if (checked) {
        selectedPresetNames.add(name);
    } else {
        selectedPresetNames.delete(name);
    }
    renderPresetBulkControls();
}

function renderPresetEntry(entry) {
    const el = document.createElement("div");
    el.className = "preset-item";
    if (entry.name === selectedPresetName) {
        el.classList.add("selected");
    }
    // Identity for the roving focus sequence, which has to survive the full
    // re-render that selecting, favoriting, or filtering triggers.
    el.setAttribute("data-preset-name", entry.name);
    // Overwritten by applyPresetRovingTabIndex; only the current row keeps 0.
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    el.setAttribute("aria-pressed", String(entry.name === selectedPresetName));
    el.addEventListener("click", () => selectPresetEntry(entry.name));
    el.addEventListener("keydown", (event) => {
        // Only when the row itself has focus. Keydown from the checkbox, the
        // favorite toggle, or Load bubbles up here, and preventDefault would
        // swallow Space on the checkbox and double-fire Enter on the buttons.
        if (event.target !== el) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectPresetEntry(entry.name);
        }
    });

    const checkWrap = document.createElement("label");
    checkWrap.className = "preset-checkbox";
    checkWrap.title = "选择此预设以进行批量操作";
    checkWrap.addEventListener("click", (event) => event.stopPropagation());

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedPresetNames.has(entry.name);
    checkbox.setAttribute("aria-label", `选择预设 ${entry.name}`);
    checkbox.addEventListener("change", () => setPresetChecked(entry.name, checkbox.checked));
    checkWrap.appendChild(checkbox);

    const details = document.createElement("div");
    details.className = "preset-details";

    const titleRow = document.createElement("div");
    titleRow.className = "preset-title-row";

    const nameEl = document.createElement("div");
    nameEl.className = "preset-name";
    nameEl.textContent = entry.name;
    nameEl.title = entry.name;
    titleRow.appendChild(nameEl);

    if (entry.favorite) el.classList.add("preset-item-favorite");

    const metaEl = document.createElement("div");
    metaEl.className = "preset-meta";
    metaEl.textContent = `${entry.toolText} · ${entry.overrideCount} 项自定义设置`;

    details.appendChild(titleRow);
    details.appendChild(metaEl);

    el.appendChild(checkWrap);
    el.appendChild(details);

    if (entry.warnings.length > 0) {
        const warnIcon = createPresetIcon(PRESET_ICON_WARNING);
        const warnWrap = document.createElement("span");
        warnWrap.className = "preset-row-warn";
        warnWrap.title = entry.warnings.join(" ");
        warnWrap.appendChild(warnIcon);
        el.appendChild(warnWrap);
    }

    const rowFavorite = document.createElement("button");
    rowFavorite.type = "button";
    rowFavorite.className = entry.favorite ? "preset-row-favorite active" : "preset-row-favorite";
    rowFavorite.title = entry.favorite ? "取消收藏" : "加入收藏";
    rowFavorite.setAttribute("aria-label", `${entry.favorite ? "从收藏中移除" : "加入收藏"} ${entry.name}`);
    rowFavorite.setAttribute("aria-pressed", String(entry.favorite));
    rowFavorite.appendChild(createPresetIcon(entry.favorite ? PRESET_ICON_STAR : PRESET_ICON_STAR_OUTLINE));
    rowFavorite.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePresetFavorite(entry.name);
        loadPresets();
    });
    el.appendChild(rowFavorite);

    const rowArchive = document.createElement("button");
    rowArchive.type = "button";
    rowArchive.className = "preset-row-archive";
    rowArchive.title = entry.archived ? "从存档还原" : "存档恢复";
    rowArchive.setAttribute("aria-label", `${entry.archived ? "恢复" : "存档"} ${entry.name}`);
    rowArchive.appendChild(createPresetIcon(entry.archived ? PRESET_ICON_RESTORE : PRESET_ICON_ARCHIVE));
    rowArchive.addEventListener("click", (event) => {
        event.stopPropagation();
        setPresetArchived([entry.name], !entry.archived);
    });
    el.appendChild(rowArchive);

    el.appendChild(createPresetButton("Load", "btn btn-sm btn-primary preset-row-load", () => loadPreset(entry.name)));
    return el;
}

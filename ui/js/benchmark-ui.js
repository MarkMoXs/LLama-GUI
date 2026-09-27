// Benchmarking tab: controls, argument adapter, output polling, and session-only summaries.
(function () {
    const root = window.LlamaGui = window.LlamaGui || {};

    // Consecutive /api/output failures tolerated before we stop watching the
    // benchmark. Matches HF_DOWNLOAD_POLL_MAX_FAILS in hf-download-ui.js.
    const OUTPUT_POLL_MAX_FAILS = 5;

    const BENCH_COMPATIBLE_IDS = new Set([
        "hf_repo",
        "hf_file",
        "hf_token",
        "ctx_size",
        "batch_size",
        "ubatch_size",
        "threads",
        "threads_batch",
        "numa",
        "prio",
        "poll",
        "gpu_layers",
        "split_mode",
        "tensor_split",
        "main_gpu",
        "device",
        "flash_attn",
        "load_mode",
        "mmap",
        "mlock",
        "direct_io",
        "fit",
        "fit_target",
        "fit_ctx",
        "cache_type_k",
        "cache_type_v",
    ]);

    const BENCHMARK_SOURCE_LABELS = {
        current: "当前配置",
        preset: "已保存的预设",
        manual: "手动选择模型",
    };
    const BENCHMARK_TYPE_LABELS = {
        bench: "吞吐量",
        perplexity: "困惑度",
    };
    const PERPLEXITY_PRESETS = {
        gui: {
            ctx: "4096",
            batch: "2048",
            ubatch: "512",
            threads: "-1",
            gpuLayers: "auto",
            flashAttention: "auto",
            cacheTypeK: "f16",
            cacheTypeV: "f16",
            mmap: true,
            chunks: "5",
            pplStride: "0",
            warmup: true,
        },
        llamacpp: {
            ctx: "512",
            batch: "2048",
            ubatch: "512",
            threads: "-1",
            gpuLayers: "auto",
            flashAttention: "auto",
            cacheTypeK: "f16",
            cacheTypeV: "f16",
            mmap: true,
            chunks: "-1",
            pplStride: "0",
            warmup: true,
        },
    };
    const PERPLEXITY_PRESET_CONTROL_IDS = [
        "benchmark-ppl-ctx",
        "benchmark-ppl-batch",
        "benchmark-ppl-ubatch",
        "benchmark-ppl-threads",
        "benchmark-ppl-gpu-layers",
        "benchmark-ppl-flash-attn",
        "benchmark-ppl-cache-k",
        "benchmark-ppl-cache-v",
        "benchmark-ppl-mmap",
        "benchmark-chunks",
        "benchmark-ppl-stride",
        "benchmark-warmup",
    ];

    let flagCore = null;
    let fetchJson = null;
    let showToast = null;
    let getFlags = () => [];
    let getDefaultFlagValues = () => ({});
    let getLatestStatus = () => null;
    let refreshRuntimeStatusPanels = null;
    let processLifecycle = null;
    let outputTimer = null;
    let pollOutputActiveEpoch = null;
    let outputPollFailCount = 0;
    const processOutputCursor = root.outputCursor.create(appendOutput);
    let outputLines = [];
    let cachedPresets = [];
    let cachedModels = [];
    let selectedPresetName = "";
    let applyingPerplexityPreset = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function toArrayEntry(entry) {
        return Array.isArray(entry) ? entry.map(String) : [String(entry)];
    }

    function flattenArgs(args) {
        return (args || []).flatMap(toArrayEntry);
    }

    // flag-core owns the single implementation (it loads first); the fallback
    // keeps this module usable in a unit-test context that stubs flagCore out.
    function quoteArg(arg) {
        if (flagCore && typeof flagCore.quoteArg === "function") return flagCore.quoteArg(arg);
        const text = String(arg);
        return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function formatCommand(tool, args) {
        return [tool, ...root.flagCore.redactSensitiveTokens(flattenArgs(args))].map(quoteArg).join(" ");
    }

    function normalizePresetData(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return { tool: null, model: "", flags: {} };
        }
        if (data.flags && typeof data.flags === "object" && !Array.isArray(data.flags)) {
            return {
                tool: typeof data.tool === "string" ? data.tool : null,
                model: typeof data.model === "string" ? data.model : "",
                flags: data.flags,
            };
        }
        return { tool: null, model: "", flags: data };
    }

    function getModelName(model) {
        return typeof model === "string" ? model : (model && (model.name || model.filename)) || "";
    }

    function cloneFlags(values) {
        const copy = {};
        for (const [key, value] of Object.entries(values || {})) {
            copy[key] = Array.isArray(value) ? [...value] : value;
        }
        return copy;
    }

    function getFlagLabel(flag) {
        return flag && (flag.label || flag.id || flag.flag) || "未知";
    }

    function isEmptyFlagValue(value) {
        return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    }

    function valuesEqual(left, right) {
        if (Array.isArray(left) || Array.isArray(right)) {
            return JSON.stringify(left || []) === JSON.stringify(right || []);
        }
        return String(left) === String(right);
    }

    function hasSelectedModelArg(args) {
        const flat = flattenArgs(args);
        return flat.some((token) => {
            const value = String(token || "");
            return value === "-m" || value === "--model" || value === "-hf" || value === "--hf-repo"
                || value.startsWith("-m=") || value.startsWith("--model=")
                || value.startsWith("-hf=") || value.startsWith("--hf-repo=");
        });
    }

    // llama.cpp b10875 removed --mmap/--no-mmap, --mlock, and the -dio family
    // from every tool — llama-bench and llama-perplexity only advertise
    // --load-mode on such builds — so legacy load toggles must translate.
    function isLoadModeOnlyBuild() {
        const core = root.flagCore;
        return Boolean(core && typeof core.supportsLoadModeOnly === "function" && core.supportsLoadModeOnly());
    }

    function getLoadModeArg(args) {
        for (let index = args.length - 1; index >= 0; index -= 1) {
            const entry = args[index];
            if (Array.isArray(entry) && (entry[0] === "--load-mode" || entry[0] === "-lm")) return entry;
        }
        return null;
    }

    function hasLoadModeArg(args) {
        return Boolean(getLoadModeArg(args));
    }

    function getLoadModeArgValue(args) {
        const entry = getLoadModeArg(args);
        return entry ? String(entry[1]) : "";
    }

    // On b10875+ builds incompatible legacy toggles cannot share the single
    // --load-mode slot, so name the winner instead of a generic exclusion.
    function loadModeConflictReason(flag, args) {
        if (!isLoadModeOnlyBuild() || !hasLoadModeArg(args)) return "";
        if (flag.id !== "mmap" && flag.id !== "mlock" && flag.id !== "direct_io") return "";
        const winner = getLoadModeArgValue(args);
        return winner
            ? `Superseded by --load-mode ${winner} from another Legacy toggle; only one load mode can be emitted`
            : "被另一个 Legacy 开关的 --load-mode 取代";
    }

    function pushFlagArg(args, tool, flag, value) {
        if (isEmptyFlagValue(value)) return false;

        if (tool === "llama-bench") {
            if (flag.id === "ctx_size") {
                return false;
            }
            if (flag.id === "threads" && String(value).trim() === "-1") {
                return false;
            }
            if (flag.id === "gpu_layers") {
                const normalizedGpuLayers = String(value).trim().toLowerCase();
                if (normalizedGpuLayers === "auto" || normalizedGpuLayers === "all") {
                    return false;
                }
            }
            if (flag.id === "mmap") {
                if (isLoadModeOnlyBuild()) {
                    const loadModeArg = getLoadModeArg(args);
                    if (loadModeArg) {
                        if (value && loadModeArg[1] === "mlock") {
                            loadModeArg[1] = "mmap+mlock";
                            return true;
                        }
                        return false;
                    }
                    args.push(["--load-mode", value ? "mmap" : "none"]);
                    return true;
                }
                args.push(["-mmp", value ? "1" : "0"]);
                return true;
            }
            if (flag.id === "mlock" && isLoadModeOnlyBuild()) {
                // mlock is opt-in, so only the enabled state maps onto
                // --load-mode; off matches the new-build default behavior.
                if (!value) return false;
                const loadModeArg = getLoadModeArg(args);
                if (loadModeArg) {
                    if (loadModeArg[1] === "mmap") {
                        loadModeArg[1] = "mmap+mlock";
                        return true;
                    }
                    return false;
                }
                args.push(["--load-mode", "mlock"]);
                return true;
            }
            if (flag.id === "direct_io") {
                if (isLoadModeOnlyBuild()) {
                    // "dio off" is the default load behavior on new builds, so
                    // only the enabled state maps onto --load-mode.
                    if (!value || hasLoadModeArg(args)) return false;
                    args.push(["--load-mode", "dio"]);
                    return true;
                }
                args.push(["-dio", value ? "1" : "0"]);
                return true;
            }
            if (flag.id === "fit") {
                return false;
            }
        }

        if (flag.type === "bool") {
            if (value === true && flag.flag && !String(flag.flag).startsWith("--no-")) {
                args.push([flag.flag]);
                return true;
            }
            if (value === false && flag.false_flag) {
                args.push([flag.false_flag]);
                return true;
            }
            if (value === true && flag.flag) {
                args.push([flag.flag]);
                return true;
            }
            return false;
        }

        if (flag.type === "multi_enum") {
            const values = Array.isArray(value) ? value.filter(Boolean) : [];
            if (values.length === 0) return false;
            args.push([flag.flag, values.join(",")]);
            return true;
        }

        if (flag.type === "text_list") {
            const values = Array.isArray(value) ? value : String(value).split(/\r?\n/);
            let added = false;
            for (const item of values) {
                const normalized = String(item).trim();
                if (!normalized) continue;
                args.push([flag.flag, normalized]);
                added = true;
            }
            return added;
        }

        // llama-bench uses commas for independent runs and slashes within one GPU group.
        const cliValue = tool === "llama-bench" && ["tensor_split", "device"].includes(flag.id)
            ? String(value).split(",").map(part => part.trim()).join("/") : String(value);
        args.push([flag.flag, cliValue]);
        return true;
    }

    function buildBenchmarkArgs(options = {}) {
        const source = options.source || {};
        const benchmarkType = options.benchmarkType === "perplexity" ? "perplexity" : "bench";
        const tool = benchmarkType === "perplexity" ? "llama-perplexity" : "llama-bench";
        const flags = cloneFlags(source.flags || {});
        const defaultFlags = options.defaultFlags || {};
        const resolvePresetModelName = root.presets && root.presets.resolvePresetModelName;
        const resolvedModel = source.sourceType === "preset" && typeof resolvePresetModelName === "function"
            ? resolvePresetModelName(source.model, options.modelCandidates || [])
            : source.model;
        const model = String(resolvedModel || "").trim();
        const allFlags = options.flags || [];
        const args = [];
        const applied = [];
        const excluded = [];

        if (model) {
            const buildModelPath = root.flagCore && root.flagCore.buildLocalModelPath;
            if (typeof buildModelPath !== "function") {
                return { tool, args, applied, excluded, error: "模型路径生成不可用。" };
            }
            const localModel = buildModelPath(model);
            if (localModel.error) {
                return { tool, args, applied, excluded, error: localModel.error };
            }
            args.push(["-m", localModel.path]);
            applied.push({ label: "模型", value: model });
        }

        if (benchmarkType === "perplexity" && !hasSelectedModelArg(args)) {
            return { tool, args, applied, excluded, error: "在运行困惑度测试前，请先选择一个手动模型。" };
        }

        if (benchmarkType === "bench") {
            for (const flag of allFlags) {
                if (!flag || !flag.id || !flag.flag) continue;
                const value = flags[flag.id];
                if (isEmptyFlagValue(value)) continue;
                if (shouldOmitLegacyLoadFlag(flag, flags)) continue;

                if (!BENCH_COMPATIBLE_IDS.has(flag.id)) {
                    if (!Object.prototype.hasOwnProperty.call(defaultFlags, flag.id) || !valuesEqual(value, defaultFlags[flag.id])) {
                        excluded.push({ label: getFlagLabel(flag), reason: "基准测试工具不使用" });
                    }
                    continue;
                }

                if (flag.id === "threads_batch") {
                    if (!Object.prototype.hasOwnProperty.call(defaultFlags, flag.id) || !valuesEqual(value, defaultFlags[flag.id])) {
                        excluded.push({ label: getFlagLabel(flag), reason: "llama-bench 使用单一线程设置" });
                    }
                    continue;
                }

                const didApply = pushFlagArg(args, tool, flag, value);
                if (didApply) {
                    applied.push({ label: getFlagLabel(flag), value: flag.sensitive ? "<redacted>" : Array.isArray(value) ? value.join(",") : String(value) });
                } else {
                    if (!Object.prototype.hasOwnProperty.call(defaultFlags, flag.id) || !valuesEqual(value, defaultFlags[flag.id])) {
                        excluded.push({ label: getFlagLabel(flag), reason: loadModeConflictReason(flag, args) || "此基准测试不支持" });
                    }
                }
            }
            const repetitions = options.repetitions || 5;
            const nPrompt = options.nPrompt || 512;
            const nGen = options.nGen || 128;
            const outputFormat = options.outputFormat || "md";
            args.push(["-r", String(repetitions)]);
            args.push(["-p", String(nPrompt)]);
            args.push(["-n", String(nGen)]);
            args.push(["-o", outputFormat]);
            applied.push({ label: "重复次数", value: String(repetitions) });
            applied.push({ label: "提示词 Token 数", value: String(nPrompt) });
            applied.push({ label: "生成 Token 数", value: String(nGen) });
            applied.push({ label: "输出格式", value: outputFormat });
        } else {
            const cleanRun = options.pplCleanRun === true;
            const contextSize = options.pplContextSize || 4096;
            const batchSize = options.pplBatchSize || 2048;
            const ubatchSize = options.pplUbatchSize || 512;
            const threads = options.pplThreads ?? -1;
            const gpuLayers = String(options.pplGpuLayers || "auto").trim();
            const flashAttention = options.pplFlashAttention || "auto";
            const cacheTypeK = options.pplCacheTypeK || "f16";
            const cacheTypeV = options.pplCacheTypeV || "f16";
            if (!options.promptFile) {
                return { tool, args, applied, excluded, error: "在运行困惑度测试前，请先选择一个提示词/数据文件。" };
            }
            if (cleanRun) {
                args.push(["-f", String(options.promptFile)]);
                applied.push({ label: "模式", value: "llama.cpp 干净运行" });
                excluded.push({ label: "困惑度控制", reason: "干净运行仅传递模型和提示词/数据文件" });
            } else {
                args.push(["-c", String(contextSize)]);
                args.push(["-b", String(batchSize)]);
                args.push(["-ub", String(ubatchSize)]);
                args.push(["-t", String(threads)]);
                if (gpuLayers) args.push(["-ngl", gpuLayers]);
                if (flashAttention) args.push(["-fa", flashAttention]);
                if (cacheTypeK) args.push(["-ctk", cacheTypeK]);
                if (cacheTypeV) args.push(["-ctv", cacheTypeV]);
                const mmapOffArg = isLoadModeOnlyBuild() ? ["--load-mode", "none"] : ["--no-mmap"];
                if (options.pplMmap === false) args.push(mmapOffArg);
                args.push(["-f", String(options.promptFile)]);
                if (options.chunks !== undefined && options.chunks !== "") args.push(["--chunks", String(options.chunks)]);
                if (options.pplStride !== undefined && options.pplStride !== "") args.push(["--ppl-stride", String(options.pplStride)]);
                args.push([options.warmup === false ? "--no-warmup" : "--warmup"]);
                applied.push({ label: "上下文大小", value: String(contextSize) });
                applied.push({ label: "批处理大小", value: String(batchSize) });
                applied.push({ label: "微批处理大小", value: String(ubatchSize) });
                applied.push({ label: "线程数", value: String(threads) });
                if (gpuLayers) applied.push({ label: "GPU 层数", value: gpuLayers });
                if (flashAttention) applied.push({ label: "Flash 注意力", value: flashAttention });
                if (cacheTypeK) applied.push({ label: "K 缓存类型", value: cacheTypeK });
                if (cacheTypeV) applied.push({ label: "V 缓存类型", value: cacheTypeV });
                applied.push({ label: "内存映射", value: options.pplMmap === false ? `关闭 (${mmapOffArg.join(" ")})` : "开启" });
                applied.push({ label: "分块数", value: options.chunks === undefined || options.chunks === "" ? "-1" : String(options.chunks) });
                applied.push({ label: "困惑度步长", value: options.pplStride === undefined || options.pplStride === "" ? "0" : String(options.pplStride) });
                applied.push({ label: "预热", value: options.warmup === false ? "关闭" : "开启" });
            }
            if (options.promptFile) applied.push({ label: "提示词/数据文件", value: String(options.promptFile) });
            if (Object.keys(flags).length > 0) {
                excluded.push({ label: "配置/预设标志", reason: "困惑度仅使用此处显示的设置" });
            }
        }

        if (!hasSelectedModelArg(args)) {
            return { tool, args, applied, excluded, error: "在开始测试之前，请先选择一个模型、或已保存预设的模型，也可以直接输入 Hugging Face 的仓库地址。" };
        }

        if (typeof flags.custom_args === "string" && flags.custom_args.trim()) {
            excluded.push({ label: "自定义启动参数", reason: "出于基准测试安全性而排除" });
        }

        const environment = root.flagCore.parseEnvironmentVariables(flags.custom_env);
        if (environment.error) return { tool, args, applied, excluded, error: environment.error };
        for (const [name, value] of Object.entries(environment.env)) {
            applied.push({ label: name, value });
        }
        return { tool, args, env: environment.env, applied, excluded, error: null, command: formatCommand(tool, args) };
    }

    function renderList(container, items, emptyText) {
        if (!container) return;
        container.textContent = "";
        if (!items || items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state empty-state-sm";
            empty.textContent = emptyText;
            container.appendChild(empty);
            return;
        }
        for (const item of items) {
            const row = document.createElement("div");
            row.className = "benchmark-list-row";
            const label = document.createElement("span");
            label.textContent = item.label;
            const value = document.createElement("strong");
            value.textContent = item.value || item.reason || "";
            row.appendChild(label);
            row.appendChild(value);
            container.appendChild(row);
        }
    }

    function getSelectedBenchmarkType() {
        const value = byId("benchmark-type")?.value;
        return value === "perplexity" ? "perplexity" : "bench";
    }

    function getSelectedSourceType() {
        const value = byId("benchmark-source")?.value;
        return value === "preset" || value === "manual" ? value : "current";
    }

    function getNumberValue(id, fallback) {
        const raw = byId(id)?.value;
        if (raw === undefined || raw === null || raw === "") return fallback;
        const value = Number(raw);
        return Number.isFinite(value) ? value : fallback;
    }

    function setControlValue(id, value) {
        const el = byId(id);
        if (!el) return;
        if (el.type === "checkbox") {
            el.checked = Boolean(value);
            return;
        }
        el.value = String(value);
    }

    function setPerplexityPresetSelection(value) {
        const select = byId("benchmark-ppl-preset");
        if (select) select.value = value;
    }

    function markPerplexityPresetCustom() {
        if (applyingPerplexityPreset) return;
        setPerplexityPresetSelection("custom");
        renderCommand();
    }

    function applyPerplexityPreset(name) {
        const preset = PERPLEXITY_PRESETS[name];
        if (!preset) {
            setPerplexityPresetSelection("custom");
            renderCommand();
            return false;
        }
        applyingPerplexityPreset = true;
        setControlValue("benchmark-ppl-ctx", preset.ctx);
        setControlValue("benchmark-ppl-batch", preset.batch);
        setControlValue("benchmark-ppl-ubatch", preset.ubatch);
        setControlValue("benchmark-ppl-threads", preset.threads);
        setControlValue("benchmark-ppl-gpu-layers", preset.gpuLayers);
        setControlValue("benchmark-ppl-flash-attn", preset.flashAttention);
        setControlValue("benchmark-ppl-cache-k", preset.cacheTypeK);
        setControlValue("benchmark-ppl-cache-v", preset.cacheTypeV);
        setControlValue("benchmark-ppl-mmap", preset.mmap);
        setControlValue("benchmark-chunks", preset.chunks);
        setControlValue("benchmark-ppl-stride", preset.pplStride);
        setControlValue("benchmark-warmup", preset.warmup);
        setPerplexityPresetSelection(name);
        applyingPerplexityPreset = false;
        renderCommand();
        return true;
    }

    function selectBenchmarkModelFromConfigure() {
        const select = byId("benchmark-manual-model");
        if (!select || select.value || !flagCore) return;
        const selectedModel = flagCore.getSelectedModel && flagCore.getSelectedModel();
        if (!selectedModel) return;
        const hasOption = Array.from(select.options || []).some((option) => option.value === selectedModel);
        if (hasOption) select.value = selectedModel;
    }

    async function prepareWikitextCleanRun() {
        if (!fetchJson) return;
        const button = byId("btn-benchmark-wikitext-clean");
        const previousText = button ? button.textContent : "";
            if (button) {
                button.disabled = true;
                button.textContent = "正在准备 WikiText-2...";
        }
        try {
            const result = await fetchJson("/api/benchmark/wikitext2", { method: "POST" });
            setPerplexityPresetSelection("clean");
            setControlValue("benchmark-prompt-file", result.path || "");
            selectBenchmarkModelFromConfigure();
            renderCommand();
            if (showToast) {
                    showToast(result.downloaded ? "已下载 WikiText-2 测试文件。" : "正在使用现有的 WikiText-2 测试文件。", "success");
            }
        } catch (e) {
                if (showToast) showToast("WikiText-2 初始化失败：" + e.message, "error");
        } finally {
            if (button) {
                button.disabled = false;
                    button.textContent = previousText || "使用 WikiText-2 干净运行";
            }
        }
    }

    function getSourceSnapshot() {
        const sourceType = getSelectedSourceType();
        if (getSelectedBenchmarkType() === "perplexity") {
            return {
                sourceType: "manual",
                label: "选择模型",
                model: byId("benchmark-manual-model")?.value || "",
                flags: {},
            };
        }
        if (sourceType === "preset") {
            const preset = cachedPresets.find((entry) => entry.name === selectedPresetName);
            const data = normalizePresetData(preset && preset.data);
            return { sourceType, label: selectedPresetName || "已保存的预设", model: data.model, flags: data.flags };
        }
        if (sourceType === "manual") {
            return {
                sourceType,
                label: "选择模型",
                model: byId("benchmark-manual-model")?.value || "",
                flags: {},
            };
        }
        return {
            sourceType,
                label: "当前配置",
            model: flagCore ? flagCore.getSelectedModel() : "",
            flags: flagCore ? flagCore.getFlagValues() : {},
        };
    }

    function getBuildOptions() {
        return {
            source: getSourceSnapshot(),
            modelCandidates: cachedModels.map(getModelName).filter(Boolean),
            benchmarkType: getSelectedBenchmarkType(),
            flags: getFlags(),
            defaultFlags: getDefaultFlagValues(),
            repetitions: getNumberValue("benchmark-repetitions", 5),
            nPrompt: getNumberValue("benchmark-n-prompt", 512),
            nGen: getNumberValue("benchmark-n-gen", 128),
            outputFormat: byId("benchmark-output-format")?.value || "md",
            promptFile: byId("benchmark-prompt-file")?.value || "",
            pplContextSize: getNumberValue("benchmark-ppl-ctx", 4096),
            pplBatchSize: getNumberValue("benchmark-ppl-batch", 2048),
            pplUbatchSize: getNumberValue("benchmark-ppl-ubatch", 512),
            pplThreads: getNumberValue("benchmark-ppl-threads", -1),
            pplGpuLayers: byId("benchmark-ppl-gpu-layers")?.value || "auto",
            pplFlashAttention: byId("benchmark-ppl-flash-attn")?.value || "auto",
            pplCacheTypeK: byId("benchmark-ppl-cache-k")?.value || "f16",
            pplCacheTypeV: byId("benchmark-ppl-cache-v")?.value || "f16",
            pplMmap: byId("benchmark-ppl-mmap")?.checked !== false,
            pplCleanRun: byId("benchmark-ppl-preset")?.value === "clean",
            chunks: byId("benchmark-chunks")?.value || "-1",
            pplStride: byId("benchmark-ppl-stride")?.value || "0",
            warmup: Boolean(byId("benchmark-warmup")?.checked),
        };
    }

    function renderCommand() {
        const result = buildBenchmarkArgs(getBuildOptions());
        const command = byId("benchmark-command-preview");
        const status = byId("benchmark-status");
        const runBtn = byId("btn-run-benchmark");
        const sourceLabel = byId("benchmark-source-summary");
        if (sourceLabel) {
            const source = getSourceSnapshot();
            if (getSelectedBenchmarkType() === "perplexity") {
                sourceLabel.textContent = `困惑度「Perplexity」使用下方手动指定的模型与参数 -> ${source.model || "未选择模型"}`;
            } else {
                sourceLabel.textContent = `${BENCHMARK_SOURCE_LABELS[source.sourceType]} -> ${source.model || source.flags.hf_repo || "未选择模型"}`;
            }
        }
        if (command) {
            command.textContent = result.error ? `无法运行： ${result.error}` : result.command;
            command.classList.toggle("command-preview-error", Boolean(result.error));
        }
        if (status) {
            status.className = "status-box";
            if (result.error) {
                status.classList.add("warning");
                status.textContent = result.error;
            } else {
                status.textContent = "";
            }
        }
        if (runBtn) runBtn.disabled = Boolean(result.error);
        renderList(byId("benchmark-applied-list"), result.applied, "尚未应用任何兼容的配置设置");
        renderList(byId("benchmark-excluded-list"), result.excluded, "没有排除任何已配置的设置");
        return result;
    }

    function setBadge(id, ok, label) {
        const el = byId(id);
        if (!el) return;
        el.textContent = `${label}: ${ok ? "就绪" : "缺失"}`;
        el.className = ok ? "badge badge-green" : "badge badge-yellow";
    }

    async function refreshStatus() {
        let status = getLatestStatus ? getLatestStatus() : null;
        if (!status && fetchJson) {
            try {
                status = await fetchJson("/api/status");
            } catch (e) {
                console.debug("基准测试状态刷新失败", e);
                status = null;
            }
        }
        const suffix = status && typeof status.executable_suffix === "string" ? status.executable_suffix : "";
        const exes = status && status.executables ? status.executables : {};
        setBadge("benchmark-bench-badge", Boolean(exes["llama-bench" + suffix]), "llama-bench");
        setBadge("benchmark-ppl-badge", Boolean(exes["llama-perplexity" + suffix]), "llama-perplexity");
        const runBtn = byId("btn-run-benchmark");
        if (runBtn && status && status.running) {
            const tool = status.active_process_tool || "process";
            runBtn.disabled = tool !== "llama-bench" && tool !== "llama-perplexity";
        }
    }

    function syncModePanels() {
        const type = getSelectedBenchmarkType();
        const source = byId("benchmark-source");
        if (source) source.disabled = type === "perplexity";
        byId("benchmark-bench-controls")?.classList.toggle("hidden", type !== "bench");
        byId("benchmark-ppl-controls")?.classList.toggle("hidden", type !== "perplexity");
        syncSourcePanels();
        renderCommand();
    }

    function syncSourcePanels() {
        const source = getSelectedSourceType();
        const isPerplexity = getSelectedBenchmarkType() === "perplexity";
        byId("benchmark-preset-row")?.classList.toggle("hidden", isPerplexity || source !== "preset");
        byId("benchmark-manual-row")?.classList.toggle("hidden", !isPerplexity && source !== "manual");
        renderCommand();
    }

    async function loadPresetsForSelect() {
        if (!fetchJson) return;
        try {
            cachedPresets = await fetchJson("/api/presets") || [];
        } catch (e) {
            console.debug("基准测试预设加载失败", e);
            cachedPresets = [];
        }
        const select = byId("benchmark-preset-select");
        if (!select) return;
        select.textContent = "";
        if (cachedPresets.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
                opt.textContent = "没有已保存的预设";
            select.appendChild(opt);
            selectedPresetName = "";
            renderCommand();
            return;
        }
        for (const preset of cachedPresets) {
            const data = normalizePresetData(preset.data);
            const opt = document.createElement("option");
            opt.value = preset.name;
            opt.textContent = data.model ? `${preset.name} (${data.model})` : preset.name;
            select.appendChild(opt);
        }
        if (!selectedPresetName || !cachedPresets.some((entry) => entry.name === selectedPresetName)) {
            selectedPresetName = cachedPresets[0].name;
        }
        select.value = selectedPresetName;
        renderCommand();
    }

    async function loadModelsForSelect() {
        if (!fetchJson) return;
        let loadError = "";
        try {
            cachedModels = await fetchJson("/api/models") || [];
        } catch (e) {
            console.debug("基准测试模型加载失败", e);
            cachedModels = [];
            loadError = e && e.message ? e.message : "模型加载失败";
        }
        const select = byId("benchmark-manual-model");
        if (!select) return;
        const current = select.value;
        select.textContent = "";
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = loadError ? `模型不可用： ${loadError}` : "-- 选择模型 --";
        select.appendChild(empty);
        for (const model of cachedModels) {
            const name = getModelName(model);
            if (!name) continue;
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
        if (current && cachedModels.some((model) => getModelName(model) === current)) {
            select.value = current;
        }
        renderCommand();
    }

    function appendOutput(text) {
        const terminal = byId("benchmark-output-terminal");
        if (!terminal) return;
        const line = document.createElement("div");
        line.textContent = text;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
        outputLines.push(String(text || ""));
        renderSummary();
    }

    function clearOutput() {
        const terminal = byId("benchmark-output-terminal");
        if (terminal) terminal.textContent = "";
        outputLines = [];
        processOutputCursor.reset();
        renderSummary();
    }

    function parseBenchSummary(lines) {
        const summary = [];
        for (const line of lines) {
            const matches = Array.from(String(line).matchAll(/([\d.]+)\s*(?:±\s*[\d.]+\s*)?t\/s/gi));
            for (const match of matches) {
                summary.push(`${match[1]} t/s`);
            }
        }
        return Array.from(new Set(summary)).slice(0, 6);
    }

    function renderSummary() {
        const el = byId("benchmark-summary");
        if (!el) return;
        const summary = parseBenchSummary(outputLines);
        el.textContent = "";
        if (summary.length) {
            el.textContent = `实测吞吐量：${summary.join(", ")}`;
            return;
        }
        const empty = document.createElement("div");
        empty.className = "empty-state empty-state-sm";
        empty.textContent = "当基准测试输出包含可识别的吞吐量数据时，摘要会显示在这里。";
        el.appendChild(empty);
    }

    function stopOutputPolling() {
        if (outputTimer) {
            clearInterval(outputTimer);
            outputTimer = null;
        }
        processOutputCursor.reset();
    }

    async function syncLifecycleAfterExit() {
        if (!refreshRuntimeStatusPanels) return;
        const status = await refreshRuntimeStatusPanels();
        if (processLifecycle && status && !status.running) {
            await processLifecycle.restore(status);
        }
    }

    async function pollOutput() {
        if (!fetchJson) return;
        const request = processOutputCursor.getRequest();
        if (pollOutputActiveEpoch === request.epoch) return;
        pollOutputActiveEpoch = request.epoch;
        try {
            const data = await fetchJson(request.url);
            outputPollFailCount = 0;
            const observedGeneration = Number(data && data.runtime_generation);
            const expectedGeneration = Number(processLifecycle?.getSnapshot().activeRuntime?.generation);
            if (
                data && data.running
                && Number.isSafeInteger(observedGeneration)
                && observedGeneration >= 1
                && (!Number.isSafeInteger(expectedGeneration) || observedGeneration !== expectedGeneration)
            ) {
                stopOutputPolling();
                setRunningState(false);
                if (refreshRuntimeStatusPanels) await refreshRuntimeStatusPanels();
                return;
            }
            const consumed = processOutputCursor.consume(data, request.epoch);
            if (!consumed.current) return;
            if (!data.running) {
                stopOutputPolling();
                appendOutput("--- 基准测试进程已退出 ---");
                setRunningState(false);
                syncLifecycleAfterExit();
            }
        } catch (e) {
            if (!processOutputCursor.isCurrent(request.epoch)) return;
            // A single failed /api/output used to stop polling and flip the UI to
            // "not running" while the benchmark was still going — leaving no way
            // to stop it and a Run button the backend rejects. Tolerate a short
            // burst the way the HF download poller does, and keep the Stop button
            // available even once we do give up watching.
            outputPollFailCount += 1;
            if (outputPollFailCount < OUTPUT_POLL_MAX_FAILS) return;
            appendOutput("输出轮询错误：" + e.message);
            appendOutput(
                "--- Stopped reading output; the benchmark may still be running. "
                + "使用「停止」结束它。---"
            );
            stopOutputPolling();
        } finally {
            if (pollOutputActiveEpoch === request.epoch) pollOutputActiveEpoch = null;
        }
    }

    function startOutputPolling(initialCursor = null) {
        stopOutputPolling();
        processOutputCursor.reset(initialCursor);
        outputPollFailCount = 0;
        outputTimer = setInterval(pollOutput, 300);
    }

    function setRunningState(running) {
        byId("btn-run-benchmark")?.classList.toggle("hidden", running);
        byId("btn-stop-benchmark")?.classList.toggle("hidden", !running);
    }

    async function runBenchmark() {
        const result = renderCommand();
        if (result.error) {
            if (showToast) showToast(result.error, "warning");
            return;
        }
        clearOutput();
        setRunningState(true);
        appendOutput("已启动 " + result.tool);
        appendOutput(result.command);
        appendOutput("---");
        const outcome = await processLifecycle.launch(
            { tool: result.tool, args: result.args, env: result.env },
            {
                operation: "benchmark-launch",
                invalidateOutput: stopOutputPolling,
                invalidateStats: () => {},
                startOutput: (cursor, _runtime, _state, launchResult) => {
                    appendOutput("PID：" + launchResult.pid);
                    startOutputPolling(cursor);
                },
                postReady: () => refreshRuntimeStatusPanels && refreshRuntimeStatusPanels(),
                onFailed: (message) => {
                    appendOutput("错误：" + message);
                    setRunningState(false);
                    if (refreshRuntimeStatusPanels) refreshRuntimeStatusPanels();
                },
            }
        );
        if (!outcome.ok && !outcome.cancelled) {
            setRunningState(false);
        }
    }

    async function stopBenchmark() {
        const outcome = await processLifecycle.stop({
            operation: "benchmark-stop",
            notifyFailure: true,
            abortChat: () => {},
            invalidateOutput: stopOutputPolling,
            invalidateStats: () => {},
            onFailed: (message) => {
                appendOutput("停止请求失败：" + message);
                setRunningState(true);
                startOutputPolling();
            },
        });
        if (outcome.ok) {
            appendOutput("--- 基准测试已停止 ---");
            setRunningState(false);
            if (refreshRuntimeStatusPanels) refreshRuntimeStatusPanels();
        }
    }

    function init() {
        const source = byId("benchmark-source");
        if (!source) return;

        source.addEventListener("change", syncSourcePanels);
        byId("benchmark-type")?.addEventListener("change", syncModePanels);
        byId("benchmark-preset-select")?.addEventListener("change", (event) => {
            selectedPresetName = event.target.value || "";
            renderCommand();
        });
        byId("benchmark-ppl-preset")?.addEventListener("change", (event) => {
            const value = event.target.value || "custom";
            if (value === "custom" || value === "clean") {
                renderCommand();
                return;
            }
            applyPerplexityPreset(value);
        });
        byId("benchmark-manual-model")?.addEventListener("change", renderCommand);
        byId("btn-refresh-benchmark-presets")?.addEventListener("click", loadPresetsForSelect);
        byId("btn-refresh-benchmark-models")?.addEventListener("click", loadModelsForSelect);
        byId("btn-benchmark-wikitext-clean")?.addEventListener("click", prepareWikitextCleanRun);
        byId("btn-run-benchmark")?.addEventListener("click", runBenchmark);
        byId("btn-stop-benchmark")?.addEventListener("click", stopBenchmark);
        byId("btn-clear-benchmark-output")?.addEventListener("click", clearOutput);

        for (const id of [
            "benchmark-repetitions",
            "benchmark-n-prompt",
            "benchmark-n-gen",
            "benchmark-output-format",
            "benchmark-prompt-file",
        ]) {
            const el = byId(id);
            if (el) el.addEventListener("input", renderCommand);
            if (el) el.addEventListener("change", renderCommand);
        }

        for (const id of PERPLEXITY_PRESET_CONTROL_IDS) {
            const el = byId(id);
            if (el) el.addEventListener("input", markPerplexityPresetCustom);
            if (el) el.addEventListener("change", markPerplexityPresetCustom);
        }

        syncModePanels();
        syncSourcePanels();
        loadPresetsForSelect();
        loadModelsForSelect();
        refreshStatus();
    }

    function onShow() {
        loadPresetsForSelect();
        loadModelsForSelect();
        refreshStatus();
        renderCommand();
    }

    function restoreRunningState(status) {
        const tool = status && status.active_process_tool;
        if (tool !== "llama-bench" && tool !== "llama-perplexity") return false;
        clearOutput();
        setRunningState(true);
        appendOutput("--- 已重新连接到正在运行的 " + tool + " 进程 ---");
        startOutputPolling();
        return true;
    }

    function configure(options = {}) {
        flagCore = options.flagCore || flagCore;
        fetchJson = options.fetchJson || fetchJson;
        showToast = options.showToast || showToast;
        getFlags = typeof options.getFlags === "function" ? options.getFlags : getFlags;
        getDefaultFlagValues = typeof options.getDefaultFlagValues === "function" ? options.getDefaultFlagValues : getDefaultFlagValues;
        getLatestStatus = typeof options.getLatestStatus === "function" ? options.getLatestStatus : getLatestStatus;
        refreshRuntimeStatusPanels = typeof options.refreshRuntimeStatusPanels === "function"
            ? options.refreshRuntimeStatusPanels
            : refreshRuntimeStatusPanels;
        processLifecycle = options.processLifecycle || processLifecycle;
    }

    if (typeof window.addEventListener === "function") {
        window.addEventListener("beforeunload", () => {
            stopOutputPolling();
        });
    }

    root.benchmarkUi = {
        configure,
        init,
        onShow,
        restoreRunningState,
        refreshStatus,
        renderCommand,
        buildBenchmarkArgs,
        applyPerplexityPreset,
        normalizePresetData,
        flattenArgs,
        formatCommand,
    };

    // Test-only hook. pollOutput drives the live benchmark watcher, so it stays
    // off the shipped namespace unless the harness opts in before this file is
    // evaluated. Same gate as chat-main.js.
    if (window.__LLAMA_GUI_TEST_HOOKS__) {
        root.benchmarkUi._testPollOutput = pollOutput;
        root.benchmarkUi._testLoadModelsForSelect = loadModelsForSelect;
    }
})();

// Flags package: speculative definitions, assembled by definitions.js.
const FLAG_DEFINITIONS_SPECULATIVE = [
	// Speculative Decoding
	{
		id: "draft_max",
		flag: "--spec-draft-n-max",
		category: "speculative",
		type: "int",
		label: "草稿 Token 数", // EN: "Draft Tokens"
		desc: "用于推测解码的草稿 Token 数量", // EN: "Number of draft tokens for speculative decoding"
		tool: "both",
		min: 0,
		max: 128,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
	},
	{
		id: "draft_min",
		flag: "--spec-draft-n-min",
		category: "speculative",
		type: "int",
		label: "最小草稿 Token 数", // EN: "Draft Min Tokens"
		desc: "最小草稿 Token 数量", // EN: "Minimum draft tokens"
		tool: "both",
		min: 0,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
	},
	{
		id: "draft_p_min",
		flag: "--spec-draft-p-min",
		category: "speculative",
		type: "float",
		label: "草稿最小概率", // EN: "Draft Min Probability"
		desc: "推测解码最小概率（贪婪）", // EN: "Minimum speculative decoding probability (greedy)"
		tool: "both",
		min: 0,
		max: 1,
		step: 0.01,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
	},
	{
		id: "gpu_layers_draft",
		flag: "--spec-draft-ngl",
		category: "speculative",
		type: "text",
		label: "草稿 GPU 层数", // EN: "Draft GPU Layers"
		desc: "存储在 VRAM 中的草稿模型最大层数。接受确切数量、auto 或 all。", // EN: "Maximum number of draft model layers to store in VRAM. Accepts an exact count, auto, or all."
		tool: "both",
		placeholder: "auto",
	},
	{
		id: "spec_type",
		flag: "--spec-type",
		category: "speculative",
		type: "enum",
		label: "推测类型", // EN: "Speculative Type"
		desc: "Auto 让 llama.cpp 检测推测类型，包括 MTP。None 会发出 --spec-type none 并省略草稿模型和推测调优参数。切换模式时会保留已保存的设置。", // EN: "Auto lets llama.cpp detect the speculative type, including MTP. None emits --spec-type none and omits draft model and speculative tuning arguments. Saved settings are retained when switching modes."
		tool: "both",
		default: "auto",
		options: [
			{ value: "auto", label: "自动（默认）" }, // EN: "Auto (default)"
			{ value: "none", label: "无（禁用推测）" }, // EN: "None (disable speculation)"
			{ value: "draft-simple", label: "Draft Simple" },
			{ value: "draft-eagle3", label: "Draft EAGLE-3" },
			{ value: "draft-dflash", label: "Draft DFlash" },
			{ value: "draft-dspark", label: "Draft DSpark" },
			{ value: "draft-mtp", label: "Draft MTP (Multi-Token Prediction)" },
		],
	},
	{
		id: "draft_p_split",
		flag: "--spec-draft-p-split",
		category: "speculative",
		type: "float",
		label: "草稿分割概率", // EN: "Draft Split Probability"
		desc: "推测解码分割概率", // EN: "Speculative decoding split probability"
		tool: "both",
		min: 0,
		max: 1,
		step: 0.01,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
	},
	{
		id: "draft_device",
		flag: "-devd",
		category: "speculative",
		type: "text",
		label: "草稿设备", // EN: "Draft Device"
		desc: "用于卸载草稿模型的逗号分隔设备列表（none = 不卸载）", // EN: "Comma-separated devices for offloading draft model (none = don't offload)"
		tool: "both",
		placeholder: "auto",
	},
	{
		id: "draft_cache_type_k",
		flag: "-ctkd",
		category: "speculative",
		type: "enum",
		label: "草稿 KV 缓存类型 K", // EN: "Draft KV Cache Type K"
		desc: "草稿模型的 K 的 KV 缓存数据类型", // EN: "KV cache data type for K for draft model"
		tool: "both",
		options: CACHE_TYPE_OPTIONS,
	},
	{
		id: "draft_cache_type_v",
		flag: "-ctvd",
		category: "speculative",
		type: "enum",
		label: "草稿 KV 缓存类型 V", // EN: "Draft KV Cache Type V"
		desc: "草稿模型的 V 的 KV 缓存数据类型", // EN: "KV cache data type for V for draft model"
		tool: "both",
		options: CACHE_TYPE_OPTIONS,
	},
	{
		id: "ngram_simple",
		flag: "--spec-type",
		allow_duplicate_cli_flag: true,
		category: "speculative",
		type: "bool",
		label: "Ngram Simple",
		short_desc: "先分别尝试 Simple 和 Mod。两者都启用时，先尝试 Simple；Mod 作为回退。", // EN: "Try Simple and Mod individually first. With both enabled, Simple is tried first; Mod is a fallback."
		desc: "从当前上下文中最近匹配的段落复制草稿 Token，无需草稿模型。适用于重复文本和代码编辑；加速效果取决于工作负载。同时启用 Ngram Mod 时，llama.cpp 会先尝试 Simple，仅当 Simple 不产生草稿时才回退到 Mod，而不是在其草稿被拒绝时。其他启用的推测方法遵循上游优先级。组合它们之前，请分别比较每种方法的生成速度。", // EN: "Copy draft tokens from the latest matching passage in the current context, without a draft model. Useful for repeated text and code editing; speedups depend on the workload. With Ngram Mod also enabled, llama.cpp tries Simple first and falls back to Mod only when Simple produces no draft, not when its draft is rejected. Other enabled speculative methods follow upstream priority. Compare generation speed with each method individually before combining them."
		tool: "both",
		default: false,
		submenu: "Ngram Simple",
	},
	{
		id: "ngram_simple_size_n",
		flag: "--spec-ngram-simple-size-n",
		category: "speculative",
		type: "int",
		label: "匹配 Token 数", // EN: "Match Tokens"
		desc: "在当前上下文中为 ngram-simple 匹配的连续 Token 数量（llama.cpp 默认值：12）。更大的匹配更具选择性。仅在启用 Ngram Simple 时发出。", // EN: "Number of consecutive tokens to match in the current context for ngram-simple (llama.cpp default: 12). Larger matches are more selective. Only emitted when Ngram Simple is enabled."
		tool: "both",
		min: 1,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Simple",
	},
	{
		id: "ngram_simple_size_m",
		flag: "--spec-ngram-simple-size-m",
		category: "speculative",
		type: "int",
		label: "最大草稿 Token 数", // EN: "Maximum Draft Tokens"
		desc: "在匹配段落之后为 ngram-simple 复制的最大 Token 数量（llama.cpp 默认值：48）。如果接受的 Token 很少，较长的草稿可能会浪费工作。仅在启用 Ngram Simple 时发出。", // EN: "Maximum number of tokens to copy after a matching passage for ngram-simple (llama.cpp default: 48). Longer drafts can waste work if few tokens are accepted. Only emitted when Ngram Simple is enabled."
		tool: "both",
		min: 1,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Simple",
	},
	{
		id: "ngram_mod",
		flag: "--spec-type",
		allow_duplicate_cli_flag: true,
		category: "speculative",
		type: "bool",
		label: "Ngram Mod",
		short_desc: "先分别尝试 Mod 和 Simple。两者都启用时，先尝试 Simple；Mod 作为回退。", // EN: "Try Mod and Simple individually first. With both enabled, Simple is tried first; Mod is a fallback."
		desc: "启用 ngram-mod 推测解码。这可以与草稿推测类型组合。如果同时启用了 Ngram Simple，llama.cpp 会先尝试 Simple，仅当 Simple 不产生草稿时才回退到 Mod，而不是在其草稿被拒绝时。其他启用的推测方法遵循上游优先级。组合它们之前，请分别比较每种方法的生成速度。", // EN: "Enable ngram-mod speculative decoding. This can be combined with a draft speculative type. If Ngram Simple is also enabled, llama.cpp tries Simple first and falls back to Mod only when Simple produces no draft, not when its draft is rejected. Other enabled speculative methods follow upstream priority. Compare generation speed with each method individually before combining them."
		tool: "both",
		default: false,
		submenu: "Ngram Mod",
	},
	{
		id: "ngram_mod_n_match",
		flag: "--spec-ngram-mod-n-match",
		category: "speculative",
		type: "int",
		label: "Ngram 匹配 Token 数", // EN: "Ngram Match Tokens"
		desc: "为 ngram-mod 推测解码匹配的 Token 数量（llama.cpp 默认值：24）。", // EN: "Number of tokens to match for ngram-mod speculative decoding (llama.cpp default: 24)."
		tool: "both",
		min: 1,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Mod",
	},
	{
		id: "ngram_mod_n_min",
		flag: "--spec-ngram-mod-n-min",
		category: "speculative",
		type: "int",
		label: "Ngram 最小 Token 数", // EN: "Ngram Minimum Tokens"
		desc: "最小 ngram-mod 推测 Token 数量（llama.cpp 默认值：48）。", // EN: "Minimum ngram-mod speculative token count (llama.cpp default: 48)."
		tool: "both",
		min: 0,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Mod",
	},
	{
		id: "ngram_mod_n_max",
		flag: "--spec-ngram-mod-n-max",
		category: "speculative",
		type: "int",
		label: "Ngram 最大 Token 数", // EN: "Ngram Maximum Tokens"
		desc: "最大 ngram-mod 推测 Token 数量（llama.cpp 默认值：64）。", // EN: "Maximum ngram-mod speculative token count (llama.cpp default: 64)."
		tool: "both",
		min: 0,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Mod",
	},
	{
		id: "ngram_map_k4v",
		flag: "--spec-type",
		allow_duplicate_cli_flag: true,
		category: "speculative",
		type: "bool",
		label: "Ngram Map K4V",
		desc: "启用 ngram-map-k4v 推测解码，它为每个 n-gram 键跟踪最多四个草稿延续。这可以与其他推测类型组合。", // EN: "Enable ngram-map-k4v speculative decoding, which tracks up to four draft continuations per n-gram key. This can be combined with other speculative types."
		tool: "both",
		default: false,
		submenu: "Ngram Map K4V",
	},
	{
		id: "ngram_map_k4v_size_n",
		flag: "--spec-ngram-map-k4v-size-n",
		category: "speculative",
		type: "int",
		label: "查找 N-gram 大小", // EN: "Lookup N-gram Size"
		desc: "ngram-map-k4v 推测解码中查找 n-gram 的 Token 数量（llama.cpp 默认值：12）。", // EN: "Number of tokens in the lookup n-gram for ngram-map-k4v speculative decoding (llama.cpp default: 12)."
		tool: "both",
		min: 1,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Map K4V",
	},
	{
		id: "ngram_map_k4v_size_m",
		flag: "--spec-ngram-map-k4v-size-m",
		category: "speculative",
		type: "int",
		label: "草稿 M-gram 大小", // EN: "Draft M-gram Size"
		desc: "ngram-map-k4v 推测解码中每个草稿 m-gram 的 Token 数量（llama.cpp 默认值：48）。", // EN: "Number of tokens in each draft m-gram for ngram-map-k4v speculative decoding (llama.cpp default: 48)."
		tool: "both",
		min: 1,
		max: 1024,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Map K4V",
	},
	{
		id: "ngram_map_k4v_min_hits",
		flag: "--spec-ngram-map-k4v-min-hits",
		category: "speculative",
		type: "int",
		label: "最小命中数", // EN: "Minimum Hits"
		desc: "ngram-map-k4v 提出草稿之前所需的最小匹配查找命中数（llama.cpp 默认值：1）。", // EN: "Minimum number of matching lookup hits required before ngram-map-k4v proposes a draft (llama.cpp default: 1)."
		tool: "both",
		min: 1,
		placeholder: "llama.cpp 默认值", // EN: "llama.cpp default"
		submenu: "Ngram Map K4V",
	},
];
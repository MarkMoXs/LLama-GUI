// Flags package: model-context definitions, assembled by definitions.js.
const FLAG_DEFINITIONS_MODEL_CONTEXT = [
	// Model
	{
		id: "hf_repo",
		flag: "-hf",
		category: "model",
		type: "text",
		label: "HF 仓库", // EN: "HF Repo"
		short_desc: "使用 repo/name 直接从 Hugging Face 加载模型。", // EN: "Load a model directly from Hugging Face using repo/name."
		desc: "Hugging Face 仓库：user/model[:quant]，例如 ggml-org/gemma-3-1b-it-GGUF:Q4_K_M", // EN: "Hugging Face repo: user/model[:quant], e.g. ggml-org/gemma-3-1b-it-GGUF:Q4_K_M"
		tool: "both",
	},
	{
		id: "hf_file",
		flag: "-hff",
		category: "model",
		type: "text",
		label: "HF 文件覆盖", // EN: "HF File Override"
		desc: "覆盖来自 HF 仓库的特定 GGUF 文件", // EN: "Override specific GGUF file from HF repo"
		tool: "both",
	},
	{
		id: "hf_token",
		flag: "-hft",
		sensitive: true,
		category: "model",
		type: "text",
		label: "HF Token",
		desc: "Hugging Face 访问令牌（或设置 HF_TOKEN 环境变量）", // EN: "Hugging Face access token (or set HF_TOKEN env var)"
		tool: "both",
	},
	{
		id: "model_draft",
		flag: "-md",
		category: "model",
		type: "path",
		label: "草稿模型", // EN: "Draft Model"
		desc: "用于推测解码的草稿模型", // EN: "Draft model for speculative decoding"
		tool: "both",
	},
	{
		id: "hf_repo_draft",
		flag: "-hfd",
		category: "model",
		type: "text",
		label: "HF 草稿仓库", // EN: "HF Draft Repo"
		desc: "草稿模型的 Hugging Face 仓库", // EN: "Hugging Face repo for draft model"
		tool: "both",
	},
	{
		id: "mmproj",
		flag: "-mm",
		category: "model",
		type: "path",
		label: "多模态投影器", // EN: "Multimodal Projector"
		desc: "mmproj 文件路径（用于视觉模型）", // EN: "Path to mmproj file (for vision models)"
		tool: "both",
	},
	{
		id: "mmproj_device",
		flag: "--mmproj-device",
		category: "model",
		type: "text",
		label: "多模态投影器设备", // EN: "Multimodal Projector Device"
		short_desc: "选择运行多模态投影器的后端设备。", // EN: "Choose which backend device runs the multimodal projector."
		desc: "选择一个后端设备用于多模态投影器，例如将 iGPU 用于投影器而主模型保持在 dGPU 上。使用 --list-devices 中的名称；仅接受一个设备，none 表示禁用投影器卸载。短别名：-mmdev。适用于 llama.cpp b10541 和 v0.2.0+。", // EN: "Select one backend device for the multimodal projector, such as an iGPU while the main model stays on a dGPU. Use a name from --list-devices; only one device is accepted, and none disables projector offload. Short alias: -mmdev. Available in llama.cpp b10541 and v0.2.0+."
		tool: "both",
		placeholder: "auto; none = 不卸载", // EN: "auto; none = don't offload"
	},
	{
		id: "mmproj_url",
		flag: "--mmproj-url",
		category: "model",
		type: "text",
		label: "多模态投影器 URL", // EN: "Multimodal Projector URL"
		desc: "多模态投影器文件的 URL。本地 HF 下载器行为不变。", // EN: "URL to a multimodal projector file. Local HF downloader behavior is unchanged."
		tool: "both",
	},
	{
		id: "image_min_tokens",
		flag: "--image-min-tokens",
		category: "model",
		type: "int",
		label: "图像最小 Token 数", // EN: "Image Min Tokens"
		desc: "动态分辨率视觉模型中每张图像可占用的最小 Token 数。-1 表示从模型读取该值。", // EN: "Minimum number of tokens each image can take for dynamic-resolution vision models. -1 reads the value from the model."
		tool: "both",
		default: -1,
		min: -1,
	},
	{
		id: "image_max_tokens",
		flag: "--image-max-tokens",
		category: "model",
		type: "int",
		label: "图像最大 Token 数", // EN: "Image Max Tokens"
		desc: "动态分辨率视觉模型中每张图像可占用的最大 Token 数。-1 表示从模型读取该值。", // EN: "Maximum number of tokens each image can take for dynamic-resolution vision models. -1 reads the value from the model."
		tool: "both",
		default: -1,
		min: -1,
	},
	{
		id: "mtmd_batch_max_tokens",
		flag: "--mtmd-batch-max-tokens",
		category: "model",
		type: "int",
		label: "多模态批处理最大 Token 数", // EN: "Multimodal Batch Max Tokens"
		desc: "编码图像时每批的最大图像 Token 数。", // EN: "Maximum number of image tokens per batch when encoding images."
		tool: "server",
		default: 1024,
		min: 1,
	},
	{
		id: "no_mmproj",
		flag: "--no-mmproj",
		category: "model",
		type: "bool",
		label: "禁用 mmproj 自动下载", // EN: "Disable mmproj Auto"
		desc: "使用 -hf 时禁用自动 mmproj 下载", // EN: "Disable automatic mmproj download when using -hf"
		tool: "both",
		default: false,
	},

	// Context & Memory
	{
		id: "ctx_size",
		flag: "-c",
		category: "context",
		type: "int",
		label: "上下文大小",
		short_desc: "模型单次可以在内存中保存的最大文本量",
		beginner_tip:
			"64000 是非常高的默认值，如果运行时出现内存不足的情况，请调低该数值。",
		desc: "以 token 为单位的总上下文大小。这是模型一次能「记住」的最大 token 数量，包含你的提示词、系统提示词、全部对话历史，以及模型即将生成的回复。数值越大，占用的 VRAM 显存 / RAM 内存就越多。设置为 0 时，将自动使用模型自身的默认上限。",
		tool: "both",
		default: 64000,
		min: 0,
		max: 262144,
		placeholder: "64000 recommended",
	},
	{
		id: "batch_size",
		flag: "-b",
		category: "context",
		type: "int",
		label: "提示批处理大小", // EN: "Prompt Batch Size"
		short_desc: "较高的值读取提示更快，但占用更多内存。", // EN: "Higher values read prompts faster but use more memory."
		beginner_tip:
			"如果在加载提示时遇到内存错误，请先降低此值。", // EN: "If you hit memory errors while loading prompts, lower this value first."
		desc: "提示摄入期间并行处理的最大 Token 数（即提示被读取的速度）。越高 = 提示处理越快，但占用更多内存。仅影响提示速度，不影响生成速度。", // EN: "Maximum number of tokens processed in parallel during prompt ingestion (how fast your prompt is read). Higher = faster prompt processing but uses more memory. Only affects prompt speed, not generation speed."
		tool: "both",
		default: 2048,
		min: 1,
		max: 8192,
	},
	{
		id: "ubatch_size",
		flag: "-ub",
		category: "context",
		type: "int",
		label: "物理批处理大小", // EN: "Physical Batch Size"
		short_desc: "如果出现内存不足错误，请先降低此值。", // EN: "Lower this first if you get out-of-memory errors."
		desc: "内部 GPU/CPU 批处理大小。应 <= batch_size。较低的值使用更少 VRAM，但可能更慢。通常保持默认，除非出现内存不足错误。", // EN: "Internal GPU/CPU batch size. Should be <= batch_size. Lower values use less VRAM but may be slower. Typically leave at default unless you get out-of-memory errors."
		tool: "both",
		default: 512,
		min: 1,
		max: 4096,
	},
	{
		id: "n_predict",
		flag: "-n",
		category: "context",
		type: "int",
		label: "每次响应的最大 Token 数", // EN: "Max Tokens Per Response"
		short_desc: "限制每个生成回复的最大长度。", // EN: "Caps how long each generated reply can be."
		desc: "模型每次响应/回复将生成的最大 Token 数。-1 表示无限制（模型会持续生成，直到产生 EOS Token 或达到上下文限制）。有助于防止回复过长。", // EN: "Maximum number of tokens the model will generate per response/reply. -1 means unlimited (the model will keep generating until it produces an EOS token or hits the context limit). Useful for preventing overly long responses."
		tool: "both",
		default: -1,
		min: -1,
		max: 131072,
		placeholder: "-1 = 无限制", // EN: "-1 = unlimited"
	},
	{
		id: "keep",
		flag: "--keep",
		category: "context",
		type: "int",
		label: "保留的 Token 数", // EN: "Tokens to Keep"
		desc: "当上下文填满时，从对话最开头（系统提示 + 最初消息）永久保留多少 Token。0 = 全部丢弃，-1 = 全部保留。", // EN: "When the context fills up, how many tokens from the very beginning of the conversation (system prompt + first messages) to permanently keep. 0 = discard everything, -1 = keep everything."
		tool: "both",
		default: 0,
		min: -1,
	},
	{
		id: "mlock",
		flag: "--mlock",
		category: "context",
		type: "bool",
		label: "将模型锁定在 RAM 中", // EN: "Lock Model in RAM"
		desc: "旧版 — 已在 llama.cpp b10875 (PR #28334) 中移除；为旧版构建保留。在新版构建中使用 --load-mode mlock。强制操作系统将内存映射的模型保留在物理 RAM 中，绝不交换到磁盘。", // EN: "Legacy — removed in llama.cpp b10875 (PR #28334); retained for older builds. Use --load-mode mlock on newer builds. Force the OS to keep the memory-mapped model in physical RAM and never swap it to disk."
		tool: "both",
		default: false,
		// Removed upstream (docs/upstream-changes.md): the installed-binary
		// compatibility check exempts this flag on builds at or above the tag.
		removed_in: "b10875",
	},
	{
		id: "mmap",
		flag: "--mmap",
		false_flag: "--no-mmap",
		category: "context",
		type: "bool",
		label: "内存映射模型", // EN: "Memory Map Model"
		desc: "旧版 — 已在 llama.cpp b10875 (PR #28334) 中移除；为旧版构建保留。在新版构建中使用 --load-mode mmap。--mmap / --no-mmap 在 llama-server / llama-cli 中已不存在。使用内存映射文件加载模型，以实现更快的加载和更低的 RAM 使用。", // EN: "Legacy — removed in llama.cpp b10875 (PR #28334); retained for older builds. Use --load-mode mmap on newer builds. --mmap / --no-mmap no longer exist in llama-server / llama-cli. Load the model using memory-mapped files for faster loading and lower RAM usage."
		tool: "both",
		default: false,
		// Removed upstream (docs/upstream-changes.md): the installed-binary
		// compatibility check exempts this flag on builds at or above the tag.
		removed_in: "b10875",
	},
	{
		id: "direct_io",
		flag: "-dio",
		category: "context",
		type: "bool",
		label: "Direct I/O",
		desc: "旧版 — 已在 llama.cpp b10875 (PR #28334) 中移除；为旧版构建保留。在新版构建中使用 --load-mode dio。-dio / -ndio / --direct-io / --no-direct-io 在 llama-server / llama-cli 中已不存在。在支持时，加载模型时绕过操作系统页面缓存。", // EN: "Legacy — removed in llama.cpp b10875 (PR #28334); retained for older builds. Use --load-mode dio on newer builds. -dio / -ndio / --direct-io / --no-direct-io no longer exist in llama-server / llama-cli. Bypass the OS page cache when loading the model, when supported."
		tool: "both",
		default: false,
		// Removed upstream (docs/upstream-changes.md): the installed-binary
		// compatibility check exempts this flag on builds at or above the tag.
		removed_in: "b10875",
	},
	{
		id: "load_mode",
		flag: "--load-mode",
		category: "context",
		type: "enum",
		label: "模型加载模式", // EN: "Model Load Mode"
		short_desc: "选择 llama.cpp 的模型加载策略。", // EN: "Choose llama.cpp's model loading strategy."
		desc: "已移除的 mmap、mlock 和 Direct I/O 开关的首选替代方案（在 llama.cpp b10875 中移除）。选择模式会抑制生成命令中的那些旧参数。仅对缺少 --load-mode 的旧版构建选择 Legacy 控制。", // EN: "Preferred replacement for the removed mmap, mlock, and Direct I/O switches (removed in llama.cpp b10875). Selecting a mode suppresses those legacy arguments in the generated command. Select Legacy controls only for older builds that lack --load-mode."
		tool: "both",
		default: "auto",
		options: [
			{ value: "", label: "旧版控制" }, // EN: "Legacy controls"
			{ value: "auto", label: "自动（推荐）" }, // EN: "Auto (Recommended)"
			{ value: "none", label: "无" }, // EN: "None"
			{ value: "mmap", label: "内存映射" }, // EN: "Memory map"
			{ value: "mlock", label: "锁定在 RAM 中（无 mmap）" }, // EN: "Lock in RAM (No mmap)"
			{ value: "mmap+mlock", label: "内存映射 + 锁定" }, // EN: "Memory map + lock"
			{ value: "dio", label: "Direct I/O" },
		],
	},
	{
		id: "swa_full",
		flag: "--swa-full",
		category: "context",
		type: "bool",
		label: "完整 SWA 缓存", // EN: "Full SWA Cache"
		desc: "使用全尺寸滑动窗口注意力缓存而非压缩缓存。占用更多内存，但保留完整上下文质量。", // EN: "Use full-size sliding window attention cache instead of compressed. Uses more memory but preserves full context quality."
		tool: "both",
		default: false,
	},
	{
		id: "cache_ram",
		flag: "-cram",
		category: "context",
		type: "int",
		label: "提示缓存 RAM 限制 (MiB)", // EN: "Prompt Cache RAM Limit (MiB)"
		desc: "用于缓存提示状态以便复用的最大主机 RAM，单位 MiB。复用缓存提示可减少重复的提示处理。这不会增加上下文窗口或限制 VRAM。-1 = 无限制，0 = 禁用此提示缓存（不是活动 KV 缓存）。", // EN: "Maximum host RAM used to cache prompt state for reuse, in MiB. Reusing cached prompts reduces repeated prompt processing. This does not increase the context window or limit VRAM. -1 = no limit, 0 = disable this prompt cache (not the active KV cache)."
		tool: "both",
		default: 8192,
		min: -1,
		placeholder: "-1 无限制", // EN: "-1 unlimited"
	},
	{
		id: "ctx_checkpoints",
		flag: "-ctxcp",
		category: "context",
		type: "int",
		label: "上下文检查点", // EN: "Context Checkpoints"
		short_desc:
			"保留长提示的可复用快照，以便后续请求可以避免重新处理尽可能多的上下文。", // EN: "Keeps reusable snapshots of long prompts so follow-up requests can avoid reprocessing as much context."
		desc: "每个服务器槽位创建的最大上下文检查点数。较高的值可以改善长聊天或代理工作流的提示缓存复用，但占用更多 RAM。设置为 0 禁用上下文检查点。", // EN: "Maximum number of context checkpoints to create per server slot. Higher values can improve prompt-cache reuse for long chats or agent workflows, but use more RAM. Set 0 to disable context checkpoints."
		tool: "server",
		default: 32,
		min: 0,
	},
	{
		id: "checkpoint_every_n_tokens",
		flag: "-cms",
		category: "context",
		type: "int",
		label: "检查点最小间距", // EN: "Checkpoint Min Spacing"
		short_desc: "设置上下文检查点之间的最小 Token 间距。", // EN: "Sets the minimum token spacing between context checkpoints."
		desc: "上下文检查点之间的最小间距（以 Token 计）。0 = 无最小间距。要完全禁用检查点创建，请将上下文检查点 (-ctxcp) 设置为 0。", // EN: "Minimum spacing between context checkpoints in tokens. 0 = no minimum spacing. To disable checkpoint creation entirely, set Context Checkpoints (-ctxcp) to 0."
		tool: "server",
		default: 256,
		min: 0,
		placeholder: "0 = 无最小值", // EN: "0 = no minimum"
	},
];
// Flags package: hardware definitions, assembled by definitions.js.
const FLAG_DEFINITIONS_HARDWARE = [
	// CPU & Threads
	{
		id: "threads",
		flag: "-t",
		category: "cpu",
		type: "int",
		label: "CPU 线程数", // EN: "CPU Threads"
		short_desc: "生成期间使用的 CPU 工作线程数（-1 表示自动选择）。", // EN: "CPU workers used during generation (-1 picks automatically)."
		desc: "用于生成的 CPU 线程数（-1 = 自动）", // EN: "Number of CPU threads for generation (-1 = auto)"
		tool: "both",
		default: -1,
		min: -1,
		max: 256,
		placeholder: "-1 = 自动", // EN: "-1 = auto"
	},
	{
		id: "threads_batch",
		flag: "-tb",
		category: "cpu",
		type: "int",
		label: "批处理线程数", // EN: "Batch Threads"
		desc: "用于批处理/提示处理的线程数（默认 = 与 threads 相同）", // EN: "Threads for batch/prompt processing (default = same as threads)"
		tool: "both",
		min: -1,
		max: 256,
		placeholder: "默认 = threads", // EN: "default = threads"
	},
	{
		id: "cpu_mask",
		flag: "-C",
		category: "cpu",
		type: "text",
		label: "CPU 亲和性掩码", // EN: "CPU Affinity Mask"
		desc: "CPU 亲和性掩码（十六进制字符串）", // EN: "CPU affinity mask (hex string)"
		tool: "both",
	},
	{
		id: "cpu_range",
		flag: "-Cr",
		category: "cpu",
		type: "text",
		label: "CPU 范围", // EN: "CPU Range"
		desc: "用于亲和性的 CPU 范围，例如 0-7", // EN: "Range of CPUs for affinity, e.g. 0-7"
		tool: "both",
	},
	{
		id: "numa",
		flag: "--numa",
		category: "cpu",
		type: "enum",
		label: "NUMA 模式", // EN: "NUMA Mode"
		desc: "NUMA 优化类型", // EN: "NUMA optimization type"
		tool: "both",
		options: [
			{ value: "", label: "已禁用" }, // EN: "Disabled"
			{ value: "distribute", label: "分发" }, // EN: "Distribute"
			{ value: "isolate", label: "隔离" }, // EN: "Isolate"
			{ value: "numactl", label: "numactl" },
		],
	},
	{
		id: "prio",
		flag: "--prio",
		category: "cpu",
		type: "enum",
		label: "线程优先级", // EN: "Thread Priority"
		desc: "进程/线程优先级", // EN: "Process/thread priority"
		tool: "both",
		options: [
			{ value: "0", label: "普通 (0)" }, // EN: "Normal (0)"
			{ value: "-1", label: "低 (-1)" }, // EN: "Low (-1)"
			{ value: "1", label: "中 (1)" }, // EN: "Medium (1)"
			{ value: "2", label: "高 (2)" }, // EN: "High (2)"
			{ value: "3", label: "实时 (3)" }, // EN: "Realtime (3)"
		],
	},
	{
		id: "poll",
		flag: "--poll",
		category: "cpu",
		type: "int",
		label: "轮询级别", // EN: "Poll Level"
		desc: "等待工作时的轮询级别（0 = 不轮询）", // EN: "Polling level to wait for work (0 = no polling)"
		tool: "both",
		default: 50,
		min: 0,
		max: 100,
	},

	// GPU / Acceleration
	{
		id: "gpu_layers",
		flag: "-ngl",
		category: "gpu",
		type: "text",
		label: "GPU 层数", // EN: "GPU Layers"
		short_desc: "将多少模型卸载到 GPU。", // EN: "How much of the model to offload to GPU."
		beginner_tip: "除非手动调优性能，否则保持自动。", // EN: "Leave on auto unless you are tuning performance manually."
		desc: "VRAM 中的最大层数（数字、'auto' 或 'all'）", // EN: "Max layers in VRAM (number, 'auto', or 'all')"
		tool: "both",
		default: "auto",
		placeholder: "auto",
	},
	{
		id: "split_mode",
		flag: "-sm",
		category: "gpu",
		type: "enum",
		label: "拆分模式", // EN: "Split Mode"
		desc: "如何在多个 GPU 之间拆分模型", // EN: "How to split model across multiple GPUs"
		tool: "both",
		options: [
			{ value: "layer", label: "按层（默认）" }, // EN: "Layer (default)"
			{ value: "none", label: "无" }, // EN: "None"
			{ value: "row", label: "按行" }, // EN: "Row"
			{ value: "tensor", label: "按张量" }, // EN: "Tensor"
		],
	},
	{
		id: "tensor_split",
		flag: "-ts",
		category: "gpu",
		type: "text",
		label: "张量拆分", // EN: "Tensor Split"
		desc: "每个 GPU 的模型占比，逗号分隔，例如 3,1", // EN: "Fraction of model per GPU, comma-separated, e.g. 3,1"
		tool: "both",
	},
	{
		id: "main_gpu",
		flag: "-mg",
		category: "gpu",
		type: "int",
		label: "主 GPU", // EN: "Main GPU"
		desc: "用于模型/中间结果的 GPU", // EN: "GPU to use for the model / intermediate results"
		tool: "both",
		default: 0,
		min: 0,
	},
	{
		id: "device",
		flag: "-dev",
		category: "gpu",
		type: "text",
		label: "设备", // EN: "Device(s)"
		desc: "用于卸载的逗号分隔设备列表", // EN: "Comma-separated list of devices for offloading"
		tool: "both",
		placeholder: "none = 不卸载", // EN: "none = don't offload"
	},
	{
		id: "flash_attn",
		flag: "-fa",
		category: "gpu",
		type: "enum",
		label: "Flash 注意力",
		desc: "Flash Attention 模式", // EN: "Flash Attention mode"
		tool: "both",
		default: "auto",
		options: [
			{ value: "auto", label: "自动（默认）" }, // EN: "Auto (default)"
			{ value: "on", label: "开启" }, // EN: "On"
			{ value: "off", label: "关闭" }, // EN: "Off"
		],
	},
	{
		id: "kv_offload",
		flag: "-kvo",
		false_flag: "--no-kv-offload",
		category: "gpu",
		type: "bool",
		label: "KV 卸载", // EN: "KV Offload"
		desc: "启用 KV 缓存卸载", // EN: "Enable KV cache offloading"
		tool: "both",
		default: true,
	},
	{
		id: "repack",
		flag: "--repack",
		false_flag: "--no-repack",
		category: "gpu",
		type: "bool",
		label: "权重重打包", // EN: "Weight Repacking"
		desc: "启用权重重打包", // EN: "Enable weight repacking"
		tool: "both",
		default: false,
	},
	{
		id: "op_offload",
		flag: "--op-offload",
		false_flag: "--no-op-offload",
		category: "gpu",
		type: "bool",
		label: "操作卸载", // EN: "Operation Offload"
		desc: "在支持时将主机张量操作卸载到设备。", // EN: "Offload host tensor operations to the device when supported."
		tool: "both",
		default: true,
	},
	{
		id: "fit",
		flag: "-fit",
		category: "auto_fit",
		type: "enum",
		label: "自动适配 VRAM", // EN: "Auto Fit to VRAM"
		short_desc:
			"自动调整未设置的内存密集型设置，使模型更不容易因 VRAM 耗尽而崩溃。", // EN: "Automatically adjusts unset memory-heavy settings so the model is less likely to crash from running out of VRAM."
		beginner_tip: "除非你特别需要手动控制，否则保持开启。", // EN: "Keep this ON unless you specifically need manual control."
		desc: "主自动适配开关。开启时，llama.cpp 可能会降低未设置的值（如上下文和批处理大小），以便模型能装入可用的 GPU 内存。这不会替代下方的辅助设置：-fitt 设置要留出多少空闲 VRAM 作为安全余量，-fitc 设置自动适配应遵守的最小上下文下限。如果关闭 -fit，这些辅助设置将不再起作用。", // EN: "Main auto-fit switch. When ON, llama.cpp may lower unset values like context and batch size so the model can fit in available GPU memory. This does not replace the helper settings below: -fitt sets how much free VRAM to leave as safety margin, and -fitc sets the minimum context floor auto-fit should respect. If you turn -fit OFF, those helper settings no longer do anything."
		tool: "both",
		default: "on",
		options: [
			{ value: "on", label: "开启（推荐）" }, // EN: "On (Recommended)"
			{ value: "off", label: "关闭" }, // EN: "Off"
		],
	},
	{
		id: "fit_target",
		flag: "-fitt",
		category: "auto_fit",
		type: "text",
		label: "Fit 计算余量",
		short_desc:
			"该参数用于控制「自动显存适配」功能，指定每块GPU需要预留出多少未使用的 VRAM 显存作为「缓冲空间」。",
		beginner_tip:
			"除非自动分配策略对你的系统来说仍然过于激进（直接把显存占满），否则不建议修改该参数。",
		desc: "这是自动显存适配功能的安全余量（以 MiB 为单位）。数值越高，自动分配策略就越保守，会留出更多空闲 VRAM 显存；数值越低，工具就会把模型更紧凑地塞进显存里。该参数不会覆盖 -fit 或 -fitc 命令的强制分配逻辑，仅在 -fit 自动适配功能开启时，作为引导规则生效。支持单值统一应用到所有设备，也支持多 GPU 场景下用逗号分隔指定不同数值，例如 1024,2048。",
		tool: "both",
		default: "1024",
		placeholder: "1024 或 1024,2048",
	},
	{
		id: "fit_ctx",
		flag: "-fitc",
		category: "auto_fit",
		type: "int",
		label: "最小自动适配上下文", // EN: "Minimum Auto Fit Context"
		short_desc:
			"设置自动适配允许回退到的最小上下文窗口。", // EN: "Sets the smallest context window auto-fit is allowed to fall back to."
		beginner_tip:
			"仅在你需要保证最小上下文且有足够 VRAM 支持时才提高此值。", // EN: "Raise this only if you need a guaranteed minimum context and have enough VRAM to support it."
		desc: "自动适配允许选择的最小上下文大小。请将其视为下限，而不是替代你常规上下文设置：-fit 仍然决定是否调整内存相关设置，而 -fitc 仅限制在该过程中上下文可被缩减的程度。如果 -fit 关闭，此设置无效。", // EN: "Minimum context size that auto-fit is allowed to choose. Think of this as a floor, not a replacement for your normal context setting: -fit still decides whether to adjust memory-related settings, while -fitc only limits how far context may be reduced during that process. If -fit is OFF, this setting has no effect."
		tool: "both",
		default: 64000,
		min: 0,
		max: 262144,
		placeholder: "64000",
	},
	{
		id: "cpu_moe",
		flag: "-cmoe",
		category: "gpu",
		type: "bool",
		label: "CPU MoE",
		desc: "将所有 MoE 权重保留在 CPU 中", // EN: "Keep all MoE weights in CPU"
		tool: "both",
		default: false,
	},
	{
		id: "n_cpu_moe",
		flag: "-ncmoe",
		category: "gpu",
		type: "int",
		label: "CPU MoE 层数", // EN: "CPU MoE Layers"
		desc: "将前 N 层的 MoE 权重保留在 CPU 中", // EN: "Keep MoE weights of first N layers in CPU"
		tool: "both",
		min: 0,
	},
	{
		id: "n_cpu_ffn",
		flag: "-ncffn",
		category: "gpu",
		type: "int",
		label: "CPU FFN 层数", // EN: "CPU FFN Layers"
		desc: "将前 N 层的稠密 FFN 权重保留在 CPU 中", // EN: "Keep dense FFN weights of first N layers in CPU"
		tool: "both",
		min: 0,
	},
	{
		id: "mmproj_offload",
		flag: "--mmproj-offload",
		false_flag: "--no-mmproj-offload",
		category: "gpu",
		type: "bool",
		label: "mmproj GPU 卸载", // EN: "mmproj GPU Offload"
		desc: "为多模态投影器启用 GPU 卸载", // EN: "Enable GPU offloading for multimodal projector"
		tool: "both",
		default: true,
	},
];
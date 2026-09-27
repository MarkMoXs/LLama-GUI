// Flags package: sampling definitions, assembled by definitions.js.
const FLAG_DEFINITIONS_SAMPLING = [
	// Sampling
	{
		id: "temperature",
		flag: "--temp",
		category: "sampling",
		type: "float",
		label: "温度", // EN: "Temperature"
		short_desc: "控制创造力：越低越专注，越高越随机。", // EN: "Controls creativity: lower is focused, higher is more random."
		beginner_tip: "一般聊天可尝试 0.7-0.9。事实类任务请调低。", // EN: "Try 0.7-0.9 for general chat. Lower for factual tasks."
		desc: "采样温度（越高越随机）", // EN: "Sampling temperature (higher = more random)"
		tool: "both",
		default: 0.8,
		min: 0,
		max: 5,
		step: 0.01,
	},
	{
		id: "top_k",
		flag: "--top-k",
		category: "sampling",
		type: "int",
		label: "Top-K",
		short_desc: "将候选限制为最可能的下一个 K 个 Token。", // EN: "Limits choices to the K most likely next tokens."
		desc: "将选择限制为概率最高的 K 个 Token（0 = 禁用）", // EN: "Limit selection to K most probable tokens (0 = disabled)"
		tool: "both",
		default: 40,
		min: 0,
		max: 1000,
	},
	{
		id: "top_p",
		flag: "--top-p",
		category: "sampling",
		type: "float",
		label: "Top-P",
		short_desc: "按累积概率仅保留最可能的 Token 组。", // EN: "Keeps only the most probable token group by cumulative chance."
		beginner_tip: "对于大多数聊天用途，0.9-0.95 是安全范围。", // EN: "0.9-0.95 is a safe range for most chat use."
		desc: "核采样阈值（1.0 = 禁用）", // EN: "Nucleus sampling threshold (1.0 = disabled)"
		tool: "both",
		default: 0.95,
		min: 0,
		max: 1,
		step: 0.01,
	},
	{
		id: "min_p",
		flag: "--min-p",
		category: "sampling",
		type: "float",
		label: "Min-P",
		short_desc: "丢弃极不可能的 Token 以稳定输出。", // EN: "Drops very unlikely tokens to stabilize output."
		desc: "相对于最高概率 Token 的最小 Token 概率（0 = 禁用）", // EN: "Minimum token probability relative to top token (0 = disabled)"
		tool: "both",
		default: 0.05,
		min: 0,
		max: 1,
		step: 0.01,
	},
	{
		id: "top_n_sigma",
		flag: "--top-n-sigma",
		category: "sampling",
		type: "float",
		label: "Top-N-Sigma",
		desc: "Top-N-Sigma 采样（-1 = 禁用）", // EN: "Top-N-Sigma sampling (-1 = disabled)"
		tool: "both",
		default: -1,
		min: -1,
		max: 10,
		step: 0.01,
		submenu: "高级截断", // EN: "Advanced Truncation"
	},
	{
		id: "xtc_probability",
		flag: "--xtc-probability",
		category: "sampling",
		type: "float",
		label: "XTC 概率", // EN: "XTC Probability"
		desc: "XTC Token 移除概率（0 = 禁用）", // EN: "XTC token removal probability (0 = disabled)"
		tool: "both",
		min: 0,
		max: 1,
		step: 0.01,
		submenu: "XTC 采样", // EN: "XTC Sampling"
	},
	{
		id: "xtc_threshold",
		flag: "--xtc-threshold",
		category: "sampling",
		type: "float",
		label: "XTC 阈值", // EN: "XTC Threshold"
		desc: "XTC 阈值（1.0 = 禁用）", // EN: "XTC threshold (1.0 = disabled)"
		tool: "both",
		min: 0,
		max: 1,
		step: 0.01,
		submenu: "XTC 采样", // EN: "XTC Sampling"
	},
	{
		id: "typical_p",
		flag: "--typical-p",
		category: "sampling",
		type: "float",
		label: "Typical-P",
		desc: "局部典型采样（1.0 = 禁用）", // EN: "Locally typical sampling (1.0 = disabled)"
		tool: "both",
		default: 1.0,
		min: 0,
		max: 1,
		step: 0.01,
		submenu: "高级截断", // EN: "Advanced Truncation"
	},
	{
		id: "repeat_last_n",
		flag: "--repeat-last-n",
		category: "sampling",
		type: "int",
		label: "重复惩罚 Token 数", // EN: "Repeat Penalty Tokens"
		desc: "要惩罚的最后 N 个 Token（0 = 禁用，-1 = 上下文）", // EN: "Last N tokens to penalize (0 = disabled, -1 = ctx)"
		tool: "both",
		default: 64,
		min: -1,
		submenu: "重复惩罚", // EN: "Repetition Penalties"
	},
	{
		id: "repeat_penalty",
		flag: "--repeat-penalty",
		category: "sampling",
		type: "float",
		label: "重复惩罚", // EN: "Repeat Penalty"
		short_desc: "抑制模型自我重复。", // EN: "Discourages the model from repeating itself."
		beginner_tip: "如果回复循环或重复短语，请将其略微提高到 1.0 以上。", // EN: "If replies loop or repeat phrases, raise this slightly above 1.0."
		desc: "惩罚重复 Token 序列（1.0 = 禁用）", // EN: "Penalize repeat token sequences (1.0 = disabled)"
		tool: "both",
		default: 1.0,
		min: 0.5,
		max: 3,
		step: 0.01,
	},
	{
		id: "presence_penalty",
		flag: "--presence-penalty",
		category: "sampling",
		type: "float",
		label: "存在惩罚", // EN: "Presence Penalty"
		desc: "Alpha 存在惩罚（0 = 禁用）", // EN: "Alpha presence penalty (0 = disabled)"
		tool: "both",
		default: 0,
		min: 0,
		max: 5,
		step: 0.1,
	},
	{
		id: "frequency_penalty",
		flag: "--frequency-penalty",
		category: "sampling",
		type: "float",
		label: "频率惩罚", // EN: "Frequency Penalty"
		desc: "Alpha 频率惩罚（0 = 禁用）", // EN: "Alpha frequency penalty (0 = disabled)"
		tool: "both",
		default: 0,
		min: 0,
		max: 5,
		step: 0.05,
		submenu: "重复惩罚", // EN: "Repetition Penalties"
	},
	{
		id: "dry_multiplier",
		flag: "--dry-multiplier",
		category: "sampling",
		type: "float",
		label: "DRY 乘数", // EN: "DRY Multiplier"
		desc: "DRY 重复惩罚乘数（0 = 禁用）", // EN: "DRY repetition penalty multiplier (0 = disabled)"
		tool: "both",
		default: 0,
		min: 0,
		max: 5,
		step: 0.05,
		submenu: "DRY 采样", // EN: "DRY Sampling"
	},
	{
		id: "dry_base",
		flag: "--dry-base",
		category: "sampling",
		type: "float",
		label: "DRY 基数", // EN: "DRY Base"
		desc: "惩罚指数的 DRY 基值", // EN: "DRY base value for penalty exponent"
		tool: "both",
		default: 1.75,
		min: 1,
		max: 5,
		step: 0.05,
		submenu: "DRY 采样", // EN: "DRY Sampling"
	},
	{
		id: "dry_allowed_length",
		flag: "--dry-allowed-length",
		category: "sampling",
		type: "int",
		label: "DRY 允许长度", // EN: "DRY Allowed Length"
		desc: "DRY 生效前允许的重复长度", // EN: "Allowed repetition length before DRY kicks in"
		tool: "both",
		default: 2,
		min: 1,
		submenu: "DRY 采样", // EN: "DRY Sampling"
	},
	{
		id: "dry_penalty_last_n",
		flag: "--dry-penalty-last-n",
		category: "sampling",
		type: "int",
		label: "DRY 惩罚历史", // EN: "DRY Penalty History"
		desc: "DRY 扫描重复序列的最近 Token 数（0 = 禁用，-1 = 完整上下文）。", // EN: "Number of recent tokens DRY scans for repeated sequences (0 = disabled, -1 = full context)."
		tool: "both",
		default: -1,
		min: -1,
		submenu: "DRY 采样", // EN: "DRY Sampling"
	},
	{
		id: "dry_sequence_breakers",
		flag: "--dry-sequence-breaker",
		category: "sampling",
		type: "text_list",
		label: "DRY 序列中断符", // EN: "DRY Sequence Breakers"
		short_desc: "每行一个序列中断符。", // EN: "One sequence breaker per line."
		desc: "留空则保留 llama.cpp 默认值（换行、冒号、双引号和星号）。提供任何条目都会替换所有默认值；仅输入 none 可禁用序列中断符。", // EN: "Leave blank to retain llama.cpp defaults (newline, colon, double quote, and asterisk). Supplying any entries replaces all defaults; enter none by itself to disable sequence breakers."
		beginner_tip: "自定义中断符会替换默认值。如果仍需要默认值，请将它们与新增项一起显式包含。", // EN: "Custom breakers replace the defaults. If you still want the defaults, include them explicitly along with your additions."
		tool: "both",
		default: [],
		placeholder: "每行一个中断符，例如 —", // EN: "One breaker per line, e.g. —"
		submenu: "DRY 采样", // EN: "DRY Sampling"
	},
	{
		id: "dynatemp_range",
		flag: "--dynatemp-range",
		category: "sampling",
		type: "float",
		label: "动态温度范围", // EN: "Dynamic Temp Range"
		desc: "动态温度范围（0 = 禁用）", // EN: "Dynamic temperature range (0 = disabled)"
		tool: "both",
		default: 0,
		min: 0,
		max: 5,
		step: 0.01,
		submenu: "动态温度", // EN: "Dynamic Temperature"
	},
	{
		id: "dynatemp_exp",
		flag: "--dynatemp-exp",
		category: "sampling",
		type: "float",
		label: "动态温度指数", // EN: "Dynamic Temp Exponent"
		desc: "动态温度指数", // EN: "Dynamic temperature exponent"
		tool: "both",
		default: 1.0,
		min: 0.1,
		max: 5,
		step: 0.05,
		submenu: "动态温度", // EN: "Dynamic Temperature"
	},
	{
		id: "mirostat",
		flag: "--mirostat",
		category: "sampling",
		type: "enum",
		label: "Mirostat",
		desc: "Mirostat 采样模式", // EN: "Mirostat sampling mode"
		tool: "both",
		options: [
			{ value: "0", label: "已禁用 (0)" }, // EN: "Disabled (0)"
			{ value: "1", label: "Mirostat (1)" },
			{ value: "2", label: "Mirostat 2.0 (2)" },
		],
		submenu: "Mirostat",
	},
	{
		id: "mirostat_lr",
		flag: "--mirostat-lr",
		category: "sampling",
		type: "float",
		label: "Mirostat LR",
		desc: "Mirostat 学习率（eta）", // EN: "Mirostat learning rate (eta)"
		tool: "both",
		min: 0.001,
		max: 1,
		step: 0.01,
		submenu: "Mirostat",
	},
	{
		id: "mirostat_ent",
		flag: "--mirostat-ent",
		category: "sampling",
		type: "float",
		label: "Mirostat 熵", // EN: "Mirostat Entropy"
		desc: "Mirostat 目标熵（tau）", // EN: "Mirostat target entropy (tau)"
		tool: "both",
		min: 0,
		max: 20,
		step: 0.1,
		submenu: "Mirostat",
	},
	{
		id: "seed",
		flag: "-s",
		category: "sampling",
		type: "int",
		label: "随机种子", // EN: "Seed"
		short_desc: "使用相同种子以获得可复现的输出。", // EN: "Use the same seed for reproducible outputs."
		desc: "RNG 种子（-1 = 随机）", // EN: "RNG seed (-1 = random)"
		tool: "both",
		default: -1,
		min: -1,
		placeholder: "-1 = 随机", // EN: "-1 = random"
		submenu: "生成控制", // EN: "Generation Control"
	},
	{
		id: "ignore_eos",
		flag: "--ignore-eos",
		category: "sampling",
		type: "bool",
		label: "忽略 EOS", // EN: "Ignore EOS"
		desc: "忽略流结束 Token 并继续生成", // EN: "Ignore end-of-stream token and continue generating"
		tool: "both",
		default: false,
		submenu: "生成控制", // EN: "Generation Control"
	},
	{
		id: "samplers",
		flag: "--samplers",
		category: "sampling",
		type: "text",
		label: "采样器顺序", // EN: "Sampler Sequence"
		desc: "自定义采样器顺序，以分号分隔", // EN: "Custom sampler order, semicolon separated"
		tool: "both",
		placeholder: "penalties;dry;top_k;top_p;temperature",
		submenu: "采样器顺序", // EN: "Sampler Order"
	},
	{
		id: "sampler_seq",
		flag: "--sampler-seq",
		category: "sampling",
		type: "text",
		label: "采样器顺序（简写）", // EN: "Sampler Sequence (Short)"
		desc: "简化的采样器顺序简写。使用上方高级采样器顺序时请留空。", // EN: "Simplified sampler sequence shorthand. Leave empty when using the advanced sampler order above."
		tool: "both",
		placeholder: "edskypmxt",
		submenu: "采样器顺序", // EN: "Sampler Order"
	},

	// RoPE Scaling
	{
		id: "rope_scaling",
		flag: "--rope-scaling",
		category: "rope",
		type: "enum",
		label: "RoPE 缩放", // EN: "RoPE Scaling"
		desc: "RoPE 频率缩放方法", // EN: "RoPE frequency scaling method"
		tool: "both",
		options: [
			{ value: "", label: "默认（来自模型）" }, // EN: "Default (from model)"
			{ value: "none", label: "无" }, // EN: "None"
			{ value: "linear", label: "线性" }, // EN: "Linear"
			{ value: "yarn", label: "YaRN" },
		],
	},
	{
		id: "rope_scale",
		flag: "--rope-scale",
		category: "rope",
		type: "float",
		label: "RoPE 缩放系数", // EN: "RoPE Scale"
		desc: "上下文缩放因子（将上下文扩展 N 倍）", // EN: "Context scaling factor (expands context by N)"
		tool: "both",
		min: 0,
		step: 0.1,
	},
	{
		id: "rope_freq_base",
		flag: "--rope-freq-base",
		category: "rope",
		type: "float",
		label: "RoPE 基础频率", // EN: "RoPE Freq Base"
		desc: "用于 NTK-aware 缩放的 RoPE 基础频率", // EN: "RoPE base frequency for NTK-aware scaling"
		tool: "both",
		min: 0,
		step: 100,
	},
	{
		id: "rope_freq_scale",
		flag: "--rope-freq-scale",
		category: "rope",
		type: "float",
		label: "RoPE 频率缩放", // EN: "RoPE Freq Scale"
		desc: "RoPE 频率缩放因子（按 1/N 扩展）", // EN: "RoPE frequency scaling factor (expands by 1/N)"
		tool: "both",
		min: 0,
		step: 0.01,
	},
	{
		id: "yarn_orig_ctx",
		flag: "--yarn-orig-ctx",
		category: "rope",
		type: "int",
		label: "YaRN 原始上下文", // EN: "YaRN Original Ctx"
		desc: "原始上下文大小（0 = 来自模型）", // EN: "Original context size (0 = from model)"
		tool: "both",
		default: 0,
		min: 0,
	},
	{
		id: "yarn_ext_factor",
		flag: "--yarn-ext-factor",
		category: "rope",
		type: "float",
		label: "YaRN 外推", // EN: "YaRN Extrapolation"
		desc: "YaRN 外推混合因子", // EN: "YaRN extrapolation mix factor"
		tool: "both",
		default: -1,
		min: -1,
		max: 1,
		step: 0.01,
	},
	{
		id: "yarn_attn_factor",
		flag: "--yarn-attn-factor",
		category: "rope",
		type: "float",
		label: "YaRN 注意力因子", // EN: "YaRN Attention Factor"
		desc: "YaRN 注意力幅度缩放", // EN: "YaRN attention magnitude scaling"
		tool: "both",
		default: -1,
		min: -1,
		max: 2,
		step: 0.01,
	},
	{
		id: "yarn_beta_slow",
		flag: "--yarn-beta-slow",
		category: "rope",
		type: "float",
		label: "YaRN Beta Slow",
		desc: "YaRN 高修正维度", // EN: "YaRN high correction dimension"
		tool: "both",
		default: -1,
		min: -1,
		step: 0.01,
	},
	{
		id: "yarn_beta_fast",
		flag: "--yarn-beta-fast",
		category: "rope",
		type: "float",
		label: "YaRN Beta Fast",
		desc: "YaRN 低修正维度", // EN: "YaRN low correction dimension"
		tool: "both",
		default: -1,
		min: -1,
		step: 0.01,
	},
];
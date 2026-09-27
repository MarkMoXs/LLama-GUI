// Flags package: server definitions, assembled by definitions.js.
const FLAG_DEFINITIONS_SERVER = [
	// Server Settings
	{
		id: "host",
		flag: "--host",
		category: "server",
		type: "text",
		label: "主机 Host", // EN: "Host"
		short_desc: "API 服务器监听的网络地址。", // EN: "Network address the API server listens on."
		desc: "要监听的 IP 地址（默认：127.0.0.1）", // EN: "IP address to listen on (default: 127.0.0.1)"
		tool: "server",
		default: "127.0.0.1",
	},
	{
		id: "port",
		flag: "--port",
		category: "server",
		type: "int",
		label: "端口", // EN: "Port"
		short_desc: "API 服务器的端口号。", // EN: "Port number for the API server."
		beginner_tip: "除非其他应用已占用，否则保持 8080。", // EN: "Keep 8080 unless another app is already using it."
		desc: "要监听的端口", // EN: "Port to listen on"
		tool: "server",
		default: 8080,
		min: 1,
		max: 65535,
	},
	{
		id: "alias",
		flag: "-a",
		category: "server",
		type: "text",
		label: "模型别名", // EN: "Model Alias"
		desc: "API 的模型名称别名（逗号分隔）", // EN: "Model name alias(es) for the API (comma-separated)"
		tool: "server",
	},
	{
		id: "parallel",
		flag: "-np",
		category: "server",
		type: "int",
		label: "并行槽位", // EN: "Parallel Slots"
		desc: "服务器槽位数量（-1 = 自动）", // EN: "Number of server slots (-1 = auto)"
		tool: "server",
		default: -1,
		min: -1,
		max: 128,
		placeholder: "-1 = 自动", // EN: "-1 = auto"
	},
	{
		id: "cont_batching",
		flag: "-cb",
		false_flag: "--no-cont-batching",
		category: "server",
		type: "bool",
		label: "连续批处理", // EN: "Continuous Batching"
		desc: "启用动态/连续批处理", // EN: "Enable dynamic/continuous batching"
		tool: "server",
		default: true,
	},
	{
		id: "cache_prompt",
		flag: "--cache-prompt",
		false_flag: "--no-cache-prompt",
		category: "server",
		type: "bool",
		label: "提示缓存", // EN: "Prompt Caching"
		desc: "启用提示缓存", // EN: "Enable prompt caching"
		tool: "server",
		default: true,
	},
	{
		id: "cache_idle_slots",
		flag: "--cache-idle-slots",
		false_flag: "--no-cache-idle-slots",
		category: "server",
		type: "bool",
		label: "缓存空闲槽位", // EN: "Cache Idle Slots"
		desc: "新任务到达时将空闲槽位保存到提示缓存，并在使用统一 KV 时清除它们（需要缓存 RAM）", // EN: "Save idle slots to the prompt cache when a new task arrives, and clear them when using unified KV (requires cache RAM)"
		tool: "server",
		default: true,
	},
	{
		id: "slot_save_path",
		flag: "--slot-save-path",
		category: "server",
		type: "path",
		label: "槽位保存路径", // EN: "Slot Save Path"
		desc: "可通过 API 保存和恢复槽位 KV 缓存状态的目录（空 = 禁用）。该目录必须已存在，否则服务器将无法启动。", // EN: "Directory where slot KV cache states can be saved and restored via the API (empty = disabled). The directory must already exist or the server will fail to start."
		tool: "server",
	},
	{
		id: "slots_endpoint",
		flag: "--slots",
		false_flag: "--no-slots",
		category: "server",
		type: "bool",
		label: "槽位端点", // EN: "Slots Endpoint"
		desc: "暴露 /slots 监控端点以查看每个槽位的状态", // EN: "Expose the /slots monitoring endpoint for per-slot status"
		tool: "server",
		default: true,
	},
	{
		id: "timeout",
		flag: "-to",
		category: "server",
		type: "int",
		label: "超时（秒）", // EN: "Timeout (seconds)"
		desc: "服务器读/写超时", // EN: "Server read/write timeout"
		tool: "server",
		default: 3600,
		min: 1,
	},
	{
		id: "api_key",
		flag: "--api-key",
		category: "server",
		type: "text",
		label: "API 密钥", // EN: "API Key"
		short_desc: "客户端访问 API 所需的可选密钥。", // EN: "Optional key required for clients to access the API."
		desc: "用于身份验证的 API 密钥（多个用逗号分隔）", // EN: "API key for authentication (comma-separated for multiple)"
		tool: "server",
		sensitive: true,
	},
	{
		id: "threads_http",
		flag: "--threads-http",
		category: "server",
		type: "int",
		label: "HTTP 线程数", // EN: "HTTP Threads"
		desc: "用于 HTTP 请求的线程数（-1 = 自动）", // EN: "Threads for HTTP requests (-1 = auto)"
		tool: "server",
		min: -1,
	},
	{
		id: "metrics",
		flag: "--metrics",
		category: "server",
		type: "bool",
		label: "Prometheus 指标", // EN: "Prometheus Metrics"
		desc: "启用 Prometheus 指标端点", // EN: "Enable Prometheus metrics endpoint"
		tool: "server",
		default: true,
	},
	{
		id: "webui",
		flag: "--webui",
		false_flag: "--no-webui",
		category: "server",
		type: "bool",
		label: "Web 界面", // EN: "Web UI"
		short_desc: "开启内置浏览器界面。", // EN: "Turns on the built-in browser interface."
		desc: "启用内置 Web UI", // EN: "Enable the built-in web UI"
		tool: "server",
		default: true,
	},
	{
		id: "webui_mcp_proxy",
		flag: "--ui-mcp-proxy",
		category: "mcp",
		type: "bool",
		label: "UI MCP 代理", // EN: "UI MCP Proxy"
		short_desc: "为 Web UI 启用 MCP CORS 代理支持。", // EN: "Enable MCP CORS proxy support for the Web UI."
		desc: "实验性。允许 Web UI 通过 CORS 代理 MCP 请求。这会替代已弃用的 --webui-mcp-proxy 别名。请勿在不受信任的环境中启用。", // EN: "Experimental. Allows the Web UI to proxy MCP requests via CORS. This replaces the deprecated --webui-mcp-proxy alias. Do not enable in untrusted environments."
		tool: "server",
		default: false,
	},
	{
		id: "tools",
		flag: "--tools",
		category: "mcp",
		type: "multi_enum",
		label: "内置工具", // EN: "Built-in Tools"
		short_desc: "为 Web UI 中的 AI 代理启用本地文件/Shell 工具。", // EN: "Enable local file/shell tools for AI agents in the Web UI."
		beginner_tip:
			"仅在受信任的机器上使用 'all'。在共享环境中，只列出你需要的工具。", // EN: "Use 'all' only on trusted machines. In shared environments, list only what you need."
		desc: "实验性。启用通过 llama-server 暴露给模型的内置代理工具。在下方选择一个或多个工具，或选择 'all' 启用所有工具。", // EN: "Experimental. Enables built-in agent tools exposed to the model through llama-server. Select one or more tools below, or choose 'all' to enable every tool."
		tool: "server",
		options: [
			{ value: "all", label: "所有工具", risk: "high" }, // EN: "All tools"
			{ value: "read_file", label: "读取文件" }, // EN: "Read File"
			{ value: "file_glob_search", label: "文件 Glob 搜索" }, // EN: "File Glob Search"
			{ value: "grep_search", label: "Grep 搜索" }, // EN: "Grep Search"
			{
				value: "exec_shell_command",
				label: "执行 Shell 命令", // EN: "Exec Shell Command"
				risk: "high",
			},
			{ value: "write_file", label: "写入文件", risk: "high" }, // EN: "Write File"
			{ value: "edit_file", label: "编辑文件", risk: "high" }, // EN: "Edit File"
			{ value: "get_info", label: "获取运行时信息" }, // EN: "Get Runtime Info"
		],
	},
	{
		id: "embedding",
		flag: "--embedding",
		category: "server",
		type: "bool",
		label: "嵌入模式", // EN: "Embedding Mode"
		desc: "限制为仅嵌入用例", // EN: "Restrict to embedding use case only"
		tool: "server",
		default: false,
	},
	{
		id: "slot_prompt_similarity",
		flag: "-sps",
		category: "server",
		type: "float",
		label: "槽位提示相似度", // EN: "Slot Prompt Similarity"
		desc: "槽位复用的提示相似度阈值（0 = 禁用）", // EN: "Prompt similarity threshold for slot reuse (0 = disabled)"
		tool: "server",
		default: 0.1,
		min: 0,
		max: 1,
		step: 0.01,
	},
	{
		id: "cache_reuse",
		flag: "--cache-reuse",
		category: "server",
		type: "int",
		label: "缓存复用大小", // EN: "Cache Reuse Size"
		desc: "通过 KV 移位进行缓存复用的最小块大小（0 = 禁用）", // EN: "Min chunk size for cache reuse via KV shifting (0 = disabled)"
		tool: "server",
		default: 0,
		min: 0,
	},

	// Grammar & Constraints
	{
		id: "grammar",
		flag: "--grammar",
		category: "grammar",
		type: "text",
		label: "语法", // EN: "Grammar"
		desc: "类 BNF 语法，用于约束生成", // EN: "BNF-like grammar to constrain generation"
		tool: "both",
	},
	{
		id: "grammar_file",
		flag: "--grammar-file",
		category: "grammar",
		type: "path",
		label: "语法文件", // EN: "Grammar File"
		desc: "包含语法规则的文件", // EN: "File containing grammar rules"
		tool: "both",
	},
	{
		id: "json_schema",
		flag: "-j",
		category: "grammar",
		type: "text",
		label: "JSON Schema",
		desc: "用于约束输出的 JSON schema，例如 {}", // EN: "JSON schema to constrain output, e.g. {}"
		tool: "both",
	},
	{
		id: "json_schema_file",
		flag: "-jf",
		category: "grammar",
		type: "path",
		label: "JSON Schema 文件", // EN: "JSON Schema File"
		desc: "包含 JSON schema 的文件", // EN: "File containing a JSON schema"
		tool: "both",
	},
	{
		id: "backend_sampling",
		flag: "-bs",
		category: "grammar",
		type: "bool",
		label: "后端采样", // EN: "Backend Sampling"
		desc: "启用后端采样（实验性）", // EN: "Enable backend sampling (experimental)"
		tool: "both",
		default: false,
	},

	// Logging
	{
		id: "verbose",
		flag: "-v",
		category: "logging",
		type: "bool",
		label: "详细输出", // EN: "Verbose"
		desc: "将详细程度设为最大（记录所有消息）", // EN: "Set verbosity to maximum (log all messages)"
		tool: "both",
		default: false,
	},
	{
		id: "verbosity",
		flag: "-lv",
		category: "logging",
		type: "int",
		label: "详细程度级别", // EN: "Verbosity Level"
		desc: "日志详细程度阈值（0=通用，1=错误，2=警告，3=信息，4=调试）", // EN: "Log verbosity threshold (0=generic, 1=error, 2=warn, 3=info, 4=debug)"
		tool: "both",
		default: 3,
		min: 0,
		max: 4,
	},
	{
		id: "log_file",
		flag: "--log-file",
		category: "logging",
		type: "path",
		label: "日志文件", // EN: "Log File"
		desc: "将日志写入文件", // EN: "Write logs to file"
		tool: "both",
	},
	{
		id: "log_colors",
		flag: "--log-colors",
		category: "logging",
		type: "enum",
		label: "日志颜色", // EN: "Log Colors"
		desc: "彩色日志", // EN: "Colored logging"
		tool: "both",
		default: "auto",
		options: [
			{ value: "auto", label: "自动（默认）" }, // EN: "Auto (default)"
			{ value: "on", label: "开启" }, // EN: "On"
			{ value: "off", label: "关闭" }, // EN: "Off"
		],
	},
	{
		id: "log_prefix",
		flag: "--log-prefix",
		category: "logging",
		type: "bool",
		label: "日志前缀", // EN: "Log Prefix"
		desc: "在日志消息中启用前缀", // EN: "Enable prefix in log messages"
		tool: "both",
		default: false,
	},
	{
		id: "log_timestamps",
		flag: "--log-timestamps",
		category: "logging",
		type: "bool",
		label: "日志时间戳", // EN: "Log Timestamps"
		desc: "在日志消息中启用时间戳", // EN: "Enable timestamps in log messages"
		tool: "both",
		default: false,
	},
	{
		id: "show_timings",
		flag: "--show-timings",
		false_flag: "--no-show-timings",
		category: "logging",
		type: "bool",
		label: "显示计时", // EN: "Show Timings"
		desc: "每次响应后显示计时信息", // EN: "Show timing information after each response"
		tool: "cli",
		default: true,
	},

	// Advanced
	{
		id: "tensor_read_lazy",
		flag: "--lazy-mode",
		category: "advanced",
		type: "enum",
		label: "惰性模式", // EN: "Lazy Mode"
		short_desc: "按需从磁盘读取符合条件的模型张量，以减少常驻 RAM 占用。", // EN: "Read eligible model tensors from disk on demand to reduce resident RAM use."
		desc: "控制对模型架构标记为符合条件的张量进行按需读取，例如大型逐层嵌入表。Auto 使用 llama.cpp 的默认行为（仅在超过 4 GiB 时惰性）；On 使用 mmap 按需读取符合条件的张量；Off 保持它们常驻。On Direct 显式读取逐层嵌入行，可能改善未缓存提示的处理。实验性：需要带有 llama.cpp PR #28136 的自定义构建；当前上游构建会拒绝 on-direct。该 PR 目前在 Windows 上回退为惰性 mmap 读取。", // EN: "Controls on-demand reading for tensors marked as eligible by the model architecture, such as large per-layer embedding tables. Auto uses llama.cpp's default behavior (lazy only above 4 GiB); On reads eligible tensors on demand using mmap; Off keeps them resident. On Direct reads per-layer embedding rows explicitly and may improve uncached prompt processing. Experimental: requires a custom build with llama.cpp PR #28136; current upstream builds reject on-direct. The PR currently falls back to lazy mmap reads on Windows."
		tool: "both",
		default: "",
		options: [
			{ value: "", label: "自动（推荐）" }, // EN: "Auto (Recommended)"
			{ value: "on", label: "开启（更低 RAM）" }, // EN: "On (Lower RAM)"
			{ value: "on-direct", label: "On Direct（实验性，自定义构建）" }, // EN: "On Direct (Experimental, Custom Build)"
			{ value: "off", label: "关闭（保持常驻）" }, // EN: "Off (Keep Resident)"
		],
	},
	{
		id: "override_kv",
		flag: "--override-kv",
		category: "advanced",
		type: "text",
		label: "覆盖 KV 元数据", // EN: "Override KV Metadata"
		desc: "覆盖模型元数据，例如 KEY=TYPE:VALUE,...", // EN: "Override model metadata, e.g. KEY=TYPE:VALUE,..."
		tool: "both",
	},
	{
		id: "override_tensor",
		flag: "-ot",
		category: "advanced",
		type: "text",
		label: "张量缓冲区覆盖", // EN: "Tensor Buffer Overrides"
		short_desc:
			"强制匹配的模型张量使用特定的后端缓冲区，例如 CPU 或 CUDA0。", // EN: "Force matching model tensors onto a specific backend buffer, such as CPU or CUDA0."
		desc: "专家级覆盖张量内存放置控制。格式：pattern=BUFFER，多个覆盖用逗号分隔。pattern 匹配 GGUF/磁盘上的张量名称，通常带有正则风格转义，BUFFER 必须匹配已安装后端报告的缓冲区类型，例如 CPU 或 CUDA0。实验性 MoE 专家辅助仅适用于 MoE 模型；它分配专家权重张量，而不是为提示选择的运行时活动专家。常见的 MoE 用法是将专家张量保留在 CPU 上，同时将模型其余部分卸载到 GPU，或显式将专家张量放到 GPU 缓冲区。GPU/加速器 MoE 辅助目标会清除 CPU MoE 设置，以避免冲突的专家放置覆盖。启用详细日志记录（-v）以确认哪些张量匹配。错误的 pattern 或缓冲区名称可能导致启动失败或造成糟糕的内存/性能行为。", // EN: "Expert override tensor memory-placement control. Format: pattern=BUFFER, comma-separated for multiple overrides. The pattern matches GGUF/on-disk tensor names, commonly with regex-style escaping, and BUFFER must match a buffer type reported by the installed backend, such as CPU or CUDA0. The experimental MoE expert helper applies to MoE models only; it assigns expert weight tensors, not the runtime-active experts chosen for a prompt. A common MoE use is keeping expert tensors on CPU while offloading the rest of the model to GPU, or explicitly placing expert tensors on a GPU buffer. GPU/accelerator MoE helper targets clear CPU MoE settings to avoid conflicting expert placement overrides. Enable verbose logging (-v) to confirm which tensors matched. Bad patterns or buffer names can fail launch or create poor memory/performance behavior."
		tool: "both",
		placeholder: "blk.*.ffn_.*_exps.weight=CPU",
	},
	{
		id: "check_tensors",
		flag: "--check-tensors",
		category: "advanced",
		type: "bool",
		label: "检查张量", // EN: "Check Tensors"
		desc: "检查模型张量数据是否存在无效值", // EN: "Check model tensor data for invalid values"
		tool: "both",
		default: false,
	},
	{
		id: "no_host",
		flag: "--no-host",
		category: "advanced",
		type: "bool",
		label: "无主机缓冲区", // EN: "No Host Buffer"
		desc: "为额外缓冲区绕过主机缓冲区", // EN: "Bypass host buffer for extra buffers"
		tool: "both",
		default: false,
	},
	{
		id: "warmup",
		flag: "--warmup",
		false_flag: "--no-warmup",
		category: "advanced",
		type: "bool",
		label: "预热", // EN: "Warmup"
		desc: "使用空运行执行预热", // EN: "Perform warmup with empty run"
		tool: "both",
		default: true,
	},
	{
		id: "offline",
		flag: "--offline",
		category: "advanced",
		type: "bool",
		label: "离线模式", // EN: "Offline Mode"
		desc: "强制使用缓存，阻止网络访问", // EN: "Force cache use, prevent network access"
		tool: "both",
		default: false,
	},

	// Experimental
	{
		id: "spec_draft_adaptive",
		flag: "--spec-draft-adaptive",
		category: "experimental",
		type: "bool",
		label: "自适应草稿大小", // EN: "Adaptive Draft Size"
		desc: "根据测得的接受率调整每个推测草稿的大小，而不是始终草拟 --spec-draft-n-max 个 token。适用于 LaurentZuijdwijk 的 llama.cpp 分支；上游构建可能会拒绝此标志。", // EN: "Size each speculative draft from measured acceptance instead of always drafting --spec-draft-n-max tokens. Available in the LaurentZuijdwijk llama.cpp fork; upstream builds may reject this flag."
		tool: "both",
		default: false,
		// Fork-only on purpose (docs/upstream-changes.md): the installed-binary
		// compatibility check never holds this flag against upstream builds.
		fork_only: true,
	},
];
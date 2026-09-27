// Flags package: conversation definitions, assembled by definitions.js.
const FLAG_DEFINITIONS_CONVERSATION = [
	// Conversation & Chat
	{
		id: "system_prompt",
		flag: "-sys",
		category: "conversation",
		type: "text",
		label: "系统提示词", // EN: "System Prompt"
		desc: "聊天的系统提示词", // EN: "System prompt for chat"
		tool: "cli",
	},
	{
		id: "system_prompt_file",
		flag: "-sysf",
		category: "conversation",
		type: "path",
		label: "系统提示词文件", // EN: "System Prompt File"
		desc: "包含系统提示词的文件", // EN: "File containing the system prompt"
		tool: "cli",
	},
	{
		id: "reverse_prompt",
		flag: "-r",
		category: "conversation",
		type: "text",
		label: "反向提示词", // EN: "Reverse Prompt"
		desc: "遇到此提示字符串时停止生成（交互式）", // EN: "Halt generation at this prompt string (interactive)"
		tool: "both",
	},
	{
		id: "prompt",
		flag: "-p",
		category: "conversation",
		type: "text",
		label: "初始提示词", // EN: "Initial Prompt"
		desc: "用于开始生成的提示词", // EN: "Prompt to start generation with"
		tool: "cli",
	},
	{
		id: "prompt_file",
		flag: "-f",
		category: "conversation",
		type: "path",
		label: "提示词文件", // EN: "Prompt File"
		desc: "包含提示词的文件", // EN: "File containing the prompt"
		tool: "cli",
	},
	{
		id: "chat_template",
		flag: "--chat-template",
		category: "conversation",
		type: "enum",
		label: "聊天模板", // EN: "Chat Template"
		desc: "内置 llama.cpp 聊天模板名称。对于模型提供的分词器模板，请保持 Auto，并可选用下方的自定义模板文件。", // EN: "Built-in llama.cpp chat template name. For model-provided tokenizer templates, leave this on Auto and optionally use Custom Template File below."
		tool: "both",
		options: CHAT_TEMPLATE_PRESET_OPTIONS,
	},
	{
		id: "chat_template_custom",
		flag: "--chat-template-file",
		category: "conversation",
		type: "path",
		label: "自定义模板文件", // EN: "Custom Template File"
		desc: "自定义 Jinja 聊天模板文件的路径", // EN: "Path to a custom Jinja chat template file"
		tool: "both",
	},
	{
		id: "reasoning",
		flag: "-rea",
		category: "conversation",
		type: "enum",
		label: "推理 / 思考", // EN: "Reasoning / Thinking"
		desc: "在聊天中启用推理/思考", // EN: "Enable reasoning/thinking in chat"
		tool: "both",
		default: "auto",
		options: [
			{ value: "auto", label: "自动" }, // EN: "Auto"
			{ value: "on", label: "开启" }, // EN: "On"
			{ value: "off", label: "关闭" }, // EN: "Off"
		],
	},
	{
		id: "reasoning_format",
		flag: "--reasoning-format",
		category: "conversation",
		type: "enum",
		label: "推理输出格式", // EN: "Reasoning Output Format"
		desc: "控制如何解析思考标签。DeepSeek 模式将思考内容作为分离的推理内容返回，用于聊天标签页的折叠推理面板。", // EN: "Controls how thought tags are parsed. DeepSeek mode returns thinking in separated reasoning content for the Chat tab's collapsed reasoning panel."
		tool: "both",
		default: "auto",
		options: REASONING_FORMAT_OPTIONS,
	},
	{
		id: "reasoning_budget",
		flag: "--reasoning-budget",
		category: "conversation",
		type: "int",
		label: "推理预算", // EN: "Reasoning Budget"
		desc: "思考的 Token 预算（-1 = 无限制，0 = 关闭）", // EN: "Token budget for thinking (-1 = unlimited, 0 = off)"
		tool: "both",
		default: -1,
		min: -1,
	},
	{
		id: "reasoning_budget_message",
		flag: "--reasoning-budget-message",
		category: "conversation",
		type: "text",
		label: "推理预算消息", // EN: "Reasoning Budget Message"
		desc: "当推理预算耗尽时，在思考结束标签之前注入的消息。", // EN: "Message injected before the end-of-thinking tag when the reasoning budget is exhausted."
		tool: "both",
	},
	{
		id: "reasoning_preserve",
		flag: "--reasoning-preserve",
		false_flag: "--no-reasoning-preserve",
		category: "conversation",
		type: "enum",
		label: "保留推理", // EN: "Preserve Reasoning"
		short_desc: "Auto 遵循二进制默认值（当前 llama.cpp 中为兼容模板启用）。保留推理会占用更多上下文。", // EN: "Auto follows the binary default (enabled for compatible templates in current llama.cpp). Preserving reasoning can use more context."
		desc: "在整个聊天历史中保留推理轨迹。Auto 保持二进制默认值不变；当前 llama.cpp 为具有 supports_preserve_reasoning 能力的模板启用保留。Enabled 和 Disabled 显式覆盖该默认值。需要兼容模板，并可能增加上下文和 Token 使用量。", // EN: "Preserve reasoning traces across the full chat history. Auto leaves the binary default unchanged; current llama.cpp enables preservation for templates with supports_preserve_reasoning capability. Enabled and Disabled explicitly override that default. Requires a compatible template and can increase context and token usage."
		tool: "both",
		default: "auto",
		options: [
			{ value: "auto", label: "自动" }, // EN: "Auto"
			{ value: "enabled", label: "启用" }, // EN: "Enabled"
			{ value: "disabled", label: "禁用" }, // EN: "Disabled"
		],
	},
	{
		id: "chat_template_reasoning_effort",
		flag: "--reasoning-effort",
		category: "conversation",
		type: "enum",
		label: "默认推理强度", // EN: "Default Reasoning Effort"
		desc: "推理强度 — 聊天、API 客户端和外部工具在整个服务器范围内的默认值。Auto 省略该标志，保持模型模板默认值不变。在 llama.cpp b10434+ 上使用原生 --reasoning-effort 标志，在较旧二进制上回退到聊天模板 kwargs；请求级别的值会覆盖它。支持的级别取决于模型。", // EN: "Reasoning Effort — server-wide default for Chat, API clients, and external harnesses. Auto omits the flag and leaves the model template default unchanged. Uses the native --reasoning-effort flag on llama.cpp b10434+, falling back to chat template kwargs on older binaries; request-level values override it. Supported levels depend on the model."
		tool: "server",
		default: "auto",
		options: [
			{ value: "auto", label: "自动" }, // EN: "Auto"
			{ value: "low", label: "低" }, // EN: "Low"
			{ value: "medium", label: "中" }, // EN: "Medium"
			{ value: "high", label: "高" }, // EN: "High"
			{ value: "xhigh", label: "极高" }, // EN: "XHigh"
		],
	},
	{
		id: "preserve_thinking",
		flag: "--chat-template-kwargs",
		category: "conversation",
		type: "bool",
		label: "保留思考（旧版）", // EN: "Preserve Thinking (Legacy)"
		desc: "用于在响应输出中保留思考/推理 Token 的旧版模板 kwargs 路径。对于当前 llama.cpp 构建，建议使用保留推理。将 {\"preserve_thinking\":true} 传递给聊天模板引擎。", // EN: "Legacy template-kwargs path for preserving thinking/reasoning tokens in response output. Prefer Preserve Reasoning for current llama.cpp builds. Passes {\"preserve_thinking\":true} to the chat template engine."
		tool: "both",
		default: false,
	},
	{
		id: "jinja",
		flag: "--jinja",
		category: "conversation",
		type: "bool",
		label: "Jinja 模板", // EN: "Jinja Templates"
		desc: "启用基于 Jinja 的聊天模板处理。llama-server 中的工具调用/函数调用支持所必需。", // EN: "Enable Jinja-based chat template processing. Required for tool calling / function calling support in llama-server."
		tool: "server",
		default: true,
		false_flag: "--no-jinja",
	},
	{
		id: "single_turn",
		flag: "-st",
		category: "conversation",
		type: "bool",
		label: "单轮", // EN: "Single Turn"
		desc: "在一次响应后退出，而不是继续交互式 CLI 对话。", // EN: "Exit after one response instead of continuing the interactive CLI conversation."
		tool: "cli",
		default: false,
	},
	{
		id: "multiline",
		flag: "-mli",
		category: "conversation",
		type: "bool",
		label: "多行输入", // EN: "Multiline Input"
		desc: "允许无需转义的多行输入", // EN: "Allow multiline input without escaping"
		tool: "cli",
		default: false,
	},

	// LoRA & Control Vectors
	{
		id: "lora",
		flag: "--lora",
		category: "lora",
		type: "text",
		label: "LoRA 适配器", // EN: "LoRA Adapter(s)"
		desc: "LoRA 适配器的路径（多个用逗号分隔）", // EN: "Path to LoRA adapter (comma-separated for multiple)"
		tool: "both",
	},
	{
		id: "lora_scaled",
		flag: "--lora-scaled",
		category: "lora",
		type: "text",
		label: "LoRA（缩放）", // EN: "LoRA (Scaled)"
		desc: "带缩放的 LoRA 适配器，格式：path:scale,...", // EN: "LoRA adapter with scaling, format: path:scale,..."
		tool: "both",
	},
	{
		id: "control_vector",
		flag: "--control-vector",
		category: "lora",
		type: "text",
		label: "控制向量", // EN: "Control Vector(s)"
		desc: "控制向量的路径（多个用逗号分隔）", // EN: "Path to control vector (comma-separated for multiple)"
		tool: "both",
	},
	{
		id: "control_vector_scaled",
		flag: "--control-vector-scaled",
		category: "lora",
		type: "text",
		label: "控制向量（缩放）", // EN: "Control Vector (Scaled)"
		desc: "带缩放的控制向量，格式：path:scale,...", // EN: "Control vector with scaling, format: path:scale,..."
		tool: "both",
	},
	{
		id: "control_vector_range",
		flag: "--control-vector-layer-range",
		category: "lora",
		type: "text",
		label: "CV 层范围", // EN: "CV Layer Range"
		desc: "控制向量的层范围：START END", // EN: "Layer range for control vectors: START END"
		tool: "both",
	},

	// KV Cache
	{
		id: "cache_type_k",
		flag: "-ctk",
		category: "kv",
		type: "enum",
		label: "KV 缓存类型 K", // EN: "KV Cache Type K"
		desc: "K 的 KV 缓存数据类型", // EN: "KV cache data type for K"
		tool: "both",
		options: CACHE_TYPE_OPTIONS,
	},
	{
		id: "cache_type_v",
		flag: "-ctv",
		category: "kv",
		type: "enum",
		label: "KV 缓存类型 V", // EN: "KV Cache Type V"
		desc: "V 的 KV 缓存数据类型", // EN: "KV cache data type for V"
		tool: "both",
		options: CACHE_TYPE_OPTIONS,
	},
	{
		id: "context_shift",
		flag: "--context-shift",
		category: "kv",
		type: "bool",
		label: "上下文移位", // EN: "Context Shift"
		desc: "在无限文本生成时使用上下文移位", // EN: "Use context shift on infinite text generation"
		tool: "both",
		default: false,
	},
	{
		id: "kv_unified",
		flag: "--kv-unified",
		false_flag: "--no-kv-unified",
		category: "kv",
		type: "enum",
		label: "统一 KV 缓存", // EN: "Unified KV Cache"
		desc: "使用跨序列共享的单一统一 KV 缓冲区。Enabled 是 llama.cpp 对自动槽位设置的正常服务器行为；禁用会发出 --no-kv-unified。", // EN: "Use a single unified KV buffer shared across sequences. Enabled is llama.cpp's normal server behavior for auto slot setups; disabling emits --no-kv-unified."
		tool: "server",
		default: "enabled",
		options: [
			{ value: "enabled", label: "启用" }, // EN: "Enabled"
			{ value: "disabled", label: "禁用" }, // EN: "Disabled"
		],
	},
	{
		id: "kv_unified_per_slot",
		flag: "--kv-unified-per-slot",
		category: "kv",
		type: "int",
		label: "每槽位上下文限制", // EN: "Per-Slot Context Limit"
		desc: "使用统一 KV 缓存时每个服务器槽位的最大上下文长度。这会限制每个槽位，而不会更改配置的总上下文窗口。", // EN: "Maximum context length for each server slot when using the unified KV cache. This caps each slot without changing the configured total context window."
		tool: "server",
		min: 1,
		placeholder: "无每槽位上限", // EN: "No per-slot cap"
	},
];
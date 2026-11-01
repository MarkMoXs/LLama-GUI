// Character cards: bounded local JSON/PNG parsing, field validation, basic name macros,
// and conversion to an editable prompt and greeting.
(function () {
    window.LlamaGui = window.LlamaGui || {};

    const MAX_FILE_BYTES = 20 * 1024 * 1024;
    const MAX_CARD_BYTES = 1024 * 1024;
    const MAX_NAME_CHARS = 256;
    const MAX_EXPANDED_CHARS = 1024 * 1024;
    const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

    function parseJson(text) {
        try {
            return JSON.parse(text.replace(/^\uFEFF/, ""));
        } catch (error) {
            console.debug("Invalid character card JSON", error);
            throw new Error("角色卡包含无效的 JSON。");
        }
    }

    // Tavern PNG cards store UTF-8 JSON as base64 in a tEXt chunk. CCv3
    // takes precedence over the legacy chara copy when both are present.
    function readPng(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const cards = {};
        let offset = 8;
        let ended = false;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset);
            const end = offset + 8 + length;
            if (end + 4 > bytes.length) throw new Error("PNG 文件被截断或损坏。");
            const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
            if (offset === 8 && (type !== "IHDR" || length !== 13)) throw new Error("PNG 文件头无效。");
            if (type === "tEXt") {
                const data = bytes.subarray(offset + 8, end);
                const separator = data.indexOf(0);
                if (separator > 0 && separator <= 79) {
                    const keyword = String.fromCharCode(...data.subarray(0, separator));
                    if (keyword === "chara" || keyword === "ccv3") {
                        if (length > Math.ceil(MAX_CARD_BYTES * 4 / 3) + 80) throw new Error("角色卡数据超过 1 MB 限制。");
                        let crc = 0xffffffff;
                        for (let i = offset + 4; i < end; i++) {
                            crc ^= bytes[i];
                            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
                        }
                        if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end)) throw new Error("PNG 角色数据已损坏。");
                        cards[keyword] = data.subarray(separator + 1);
                    }
                }
            }
            offset = end + 4;
            if (type === "IEND") { ended = length === 0; break; }
        }
        if (!ended) throw new Error("PNG 文件被截断或损坏。");
        const encoded = cards.ccv3 || cards.chara;
        if (!encoded) throw new Error("此 PNG 不包含角色卡数据。请选择导出的角色卡，而不是普通肖像。");
        let text;
        try {
            const binary = atob(decoder.decode(encoded));
            if (binary.length > MAX_CARD_BYTES) throw new Error("角色数据过大。");
            text = decoder.decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
        } catch (error) {
            console.debug("Invalid PNG character card encoding", error);
            throw new Error("PNG 角色数据不是有效的 base64 编码 UTF-8。");
        }
        return parseJson(text);
    }

    function replaceBounded(text, pattern, replacement, limit = MAX_EXPANDED_CHARS) {
        // Measure before replacement allocates the result. Even a small card
        // can repeat a name or {{original}} enough times to exhaust memory.
        let length = text.length;
        for (const match of text.matchAll(pattern)) {
            length += replacement(...match).length - match[0].length;
        }
        if (length > limit) throw new Error(`角色提示词和问候语超过扩展文本限制（${MAX_EXPANDED_CHARS} 个字符）。`);
        return text.replace(pattern, replacement);
    }

    function buildCharacter(card, originalPrompt) {
        if (!card || typeof card !== "object" || Array.isArray(card)) throw new Error("此文件不是角色卡。");
        if (card.spec && !["chara_card_v2", "chara_card_v3"].includes(card.spec)) throw new Error("不支持此角色卡版本。");
        const data = card.spec ? card.data : card;
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("角色卡缺少其数据。");
        const fields = ["name", "description", "personality", "scenario", "first_mes", "mes_example", "system_prompt", "post_history_instructions", "nickname"];
        for (const key of fields) {
            if (data[key] !== undefined && typeof data[key] !== "string") throw new Error(`Character card field ${key} must be text.`);
        }
        const name = (data.name || "").trim();
        if (!name || !fields.slice(1, 6).some(key => typeof data[key] === "string")) throw new Error("该文件需要角色名称和角色详情或问候语。");
        if (name.length > MAX_NAME_CHARS || (data.nickname?.trim().length || 0) > MAX_NAME_CHARS) {
            throw new Error(`角色卡名称和昵称必须为 ${MAX_NAME_CHARS} 个字符或更少。`);
        }
        const characterName = data.nickname?.trim() || name;
        const replaceNames = (text, limit) => replaceBounded(text, /\{\{\s*(char|user)\s*\}\}|<(char|bot|user)>/gi,
            (_, macro, legacy) => (macro || legacy).toLowerCase() === "user" ? "User" : characterName, limit);
        const basePrompt = originalPrompt.trim() || "You are a helpful assistant.";
        const system = (data.system_prompt || "").trim();
        const sections = [system ? replaceBounded(system, /\{\{\s*original\s*\}\}/gi, () => basePrompt) : basePrompt,
            `Write as ${characterName} in a conversation with User.`];
        for (const [key, label] of [["description", "Description"], ["personality", "Personality"],
            ["scenario", "Scenario"], ["mes_example", "Example dialogue"], ["post_history_instructions", "Additional instructions"]]) {
            if (data[key]?.trim()) sections.push(`${label}:\n${data[key].replace(/\{\{\s*original\s*\}\}/gi, "")}`);
        }
        const systemPrompt = replaceNames(sections.join("\n\n"));
        const greeting = replaceNames(data.first_mes || "", MAX_EXPANDED_CHARS - systemPrompt.length);
        const notices = [];
        if (data.post_history_instructions?.trim()) notices.push("历史后指令已添加到系统提示词。");
        const omitted = [];
        if (data.character_book) omitted.push("lorebook");
        if (data.alternate_greetings?.length || data.group_only_greetings?.length) omitted.push("alternate greetings");
        if (data.assets?.length) omitted.push("assets");
        if (data.extensions && Object.keys(data.extensions).length) omitted.push("extensions");
        if (omitted.length) notices.push(`Not applied: ${omitted.join(", ")}.`);
        if (/\{\{[^{}]+\}\}/.test(systemPrompt + greeting)) notices.push("其他卡片宏保持为文本；请检查系统提示词和问候语。");
        return { name, systemPrompt, greeting, notices };
    }

    async function readFile(file, originalPrompt = "") {
        if (!file || !/\.(json|png)$/i.test(file.name)) throw new Error("请选择 JSON 或 PNG 角色卡。");
        if (file.size > MAX_FILE_BYTES) throw new Error("请选择小于 20 MB 的角色卡。");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const png = PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
        if (/\.png$/i.test(file.name) && !png) throw new Error("此文件不是有效的 PNG 角色卡。");
        if (!png && bytes.length > MAX_CARD_BYTES) throw new Error("角色卡 JSON 超过 1 MB 限制。");
        const card = png ? readPng(bytes) : parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        return buildCharacter(card, originalPrompt);
    }

    window.LlamaGui.characterCards = { readFile };
})();

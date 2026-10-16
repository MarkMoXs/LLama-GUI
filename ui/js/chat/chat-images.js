// Image attachments: bounded JPEG/PNG input, IndexedDB persistence and request hydration.
(function () {
    const I = window.LlamaGui._chatInternal;
    const S = I.state;
    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    const MAX_IMAGES = 4;
    const cache = new Map();
    let database;
    let cleanupTimer;

    function openImages() {
        if (!database) database = new Promise((resolve, reject) => {
            if (typeof indexedDB === "undefined") return reject(new Error("Image attachments need browser storage. Allow site storage and try again."));
            const request = indexedDB.open("llama_gui_chat_images", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("images", { keyPath: "id" });
            request.onsuccess = () => {
                request.result.onversionchange = () => { request.result.close(); database = null; };
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("Close other GUI tabs and retry image storage."));
        }).catch(error => { database = null; throw error; });
        return database;
    }

    async function imageStore(mode, action) {
        const db = await openImages();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction("images", mode);
            const request = action(transaction.objectStore("images"));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onabort = () => reject(transaction.error || new Error("Image storage failed."));
            transaction.onerror = () => reject(transaction.error || new Error("Image storage failed."));
        });
    }

    function validImageRef(value) {
        return value && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).every(key => ["id", "name", "type", "size"].includes(key))
            && typeof value.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value.id)
            && typeof value.name === "string" && value.name.length <= 255
            && ["image/jpeg", "image/png"].includes(value.type)
            && Number.isInteger(value.size) && value.size > 0 && value.size <= MAX_IMAGE_BYTES;
    }

    function copyImageRefs(images) {
        return (Array.isArray(images) ? images : []).filter(validImageRef).map(image => ({ ...image }));
    }

    function imageRefs(messages) {
        return messages.flatMap(message => copyImageRefs(message.attachments));
    }

    function validDataUrl(data, type) {
        return typeof data === "string" && data.startsWith(`data:${type};base64,`)
            && data.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40
            && /^[A-Za-z0-9+/]+={0,2}$/.test(data.slice(data.indexOf(",") + 1));
    }

    async function readImage(ref) {
        if (!validImageRef(ref)) throw new Error("Invalid image attachment.");
        if (cache.has(ref.id)) return cache.get(ref.id);
        const stored = await imageStore("readonly", store => store.get(ref.id));
        if (!stored || !validDataUrl(stored.data, ref.type)) throw new Error(`Image unavailable: ${ref.name}. Reattach it or edit this message before sending.`);
        cache.set(ref.id, stored.data);
        return stored.data;
    }

    async function prepareImages(messages, draft = []) {
        await Promise.all([...imageRefs(messages), ...copyImageRefs(draft)].map(readImage));
    }

    function imagesReady(messages, draft = []) {
        return [...imageRefs(messages), ...copyImageRefs(draft)].every(ref => cache.has(ref.id));
    }

    function imageContent(message) {
        if (!message.attachments?.length) return message.content;
        return [
            ...(message.content ? [{ type: "text", text: message.content }] : []),
            ...copyImageRefs(message.attachments).map(ref => ({ type: "image_url", image_url: { url: cache.get(ref.id) || "" } })),
        ];
    }

    function checkImageRequest(body) {
        if (new TextEncoder().encode(JSON.stringify(body)).length > 10 * 1024 * 1024) {
            throw new Error("This conversation exceeds the 10 MiB request limit. Remove images, edit older turns, or start a new chat.");
        }
        if (body.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === "image_url"))) {
            if (S.visionSupported === false && S.visionCapsKey === I.getTemplateCapsKey()) {
                throw new Error("The running model does not support images. Load a vision model with its matching multimodal projector.");
            }
        }
    }

    function reportImages(message = "") {
        const status = document.getElementById("chat-image-status");
        if (status) { status.textContent = message; status.hidden = !message; }
    }

    function renderImages(container, refs, removable = false) {
        if (!container) return;
        for (const ref of copyImageRefs(refs)) {
            const item = document.createElement("div");
            item.className = "chat-image-item";
            const image = document.createElement("img");
            image.alt = ref.name;
            image.className = "chat-image-preview";
            item.appendChild(image);
            const label = document.createElement("span");
            label.textContent = ref.name;
            item.appendChild(label);
            void readImage(ref).then(data => { image.src = data; }).catch(error => {
                console.warn("Could not load chat image", error);
                label.textContent = `${ref.name} (image unavailable)`;
            });
            if (removable) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "btn btn-xs";
                button.textContent = "Remove";
                button.setAttribute("aria-label", `Remove ${ref.name}`);
                button.disabled = !I.workspaceMutationAllowed() || S.imageImportPending || S.chatStreaming || Boolean(S.sendPreflightPromise);
                button.addEventListener("click", () => {
                    if (!I.workspaceMutationAllowed() || S.imageImportPending || S.chatStreaming || S.sendPreflightPromise) return;
                    S.draftImages = S.draftImages.filter(image => image.id !== ref.id);
                    imagesChanged();
                });
                item.appendChild(button);
            }
            container.appendChild(item);
        }
    }

    function renderDraftImages() {
        const container = document.getElementById("chat-image-drafts");
        if (!container) return;
        container.textContent = "";
        container.hidden = !S.draftImages.length;
        renderImages(container, S.draftImages, true);
    }

    function updateImageControls() {
        const disabled = !I.workspaceMutationAllowed() || S.imageImportPending || S.chatStreaming || Boolean(S.sendPreflightPromise) || Boolean(S.compactionController);
        document.getElementById("chat-image-drafts")?.querySelectorAll("button").forEach(button => { button.disabled = disabled; });
    }

    function imagesChanged() {
        renderDraftImages();
        reportImages();
        I.scheduleContextPreview(true);
        I.requestWorkspaceCheckpoint({ reason: "images" });
        I.notifyWorkspaceChange();
        scheduleImageCleanup();
    }

    async function importImages(files) {
        if (!files.length || !I.workspaceMutationAllowed() || S.imageImportPending || S.chatStreaming || S.sendPreflightPromise || S.compactionController) return false;
        const epoch = S.workspaceEpoch;
        S.imageImportPending = true;
        I.updateChatAvailability(I.isServerRunning());
        reportImages("Saving images…");
        const added = [];
        try {
            if (files.length + S.draftImages.length > MAX_IMAGES) throw new Error("Attach up to four images per message.");
            for (const file of files) {
                if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Only JPEG and PNG images are supported.");
                if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Each image must be no larger than 2 MiB.");
                const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
                const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
                const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
                if (!(file.type === "image/png" ? png : jpeg)) throw new Error("The selected file is not a valid JPEG or PNG image.");
                const data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error("Could not read the image."));
                    reader.readAsDataURL(file);
                });
                await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => image.naturalWidth * image.naturalHeight <= 16 * 1024 * 1024
                        ? resolve() : reject(new Error("Images must contain no more than 16 megapixels."));
                    image.onerror = () => reject(new Error("The image could not be decoded."));
                    image.src = data;
                });
                const ref = { id: I.createConversationId(), name: file.name.slice(0, 255), type: file.type, size: file.size };
                await imageStore("readwrite", store => store.put({ ...ref, data, created: Date.now() }));
                added.push(ref);
                cache.set(ref.id, data);
                if (!I.workspaceMutationAllowed(epoch)) throw new Error("Chat changed while adding images. Try again.");
            }
            S.draftImages.push(...added);
            imagesChanged();
            return true;
        } catch (error) {
            console.warn("Could not attach chat images", error);
            for (const ref of added) {
                cache.delete(ref.id);
                try { await imageStore("readwrite", store => store.delete(ref.id)); }
                catch (cleanupError) { console.warn("Could not remove unused image", cleanupError); }
            }
            reportImages(error.message || "Could not save images. Allow site storage and try again.");
            return false;
        } finally {
            S.imageImportPending = false;
            I.updateChatAvailability(I.isServerRunning());
            renderDraftImages();
        }
    }

    // Only the workspace owner collects images. Keep recovery/checkpoint and draft
    // references, and allow a grace period for an import committing in another tab.
    async function pruneImages() {
        if (!I.workspacePersistentWriteAllowed() || S.imageImportPending || typeof indexedDB === "undefined") return;
        try {
            const epoch = S.workspaceEpoch;
            const db = await openImages();
            if (!I.workspacePersistentWriteAllowed() || S.imageImportPending) return;
            const live = new Set();
            const visit = value => {
                if (!value || typeof value !== "object") return;
                if (validImageRef(value)) live.add(value.id);
                else Object.values(value).forEach(visit);
            };
            visit(S.chatMessages);
            visit(S.draftImages);
            visit(S.pendingEdit);
            // Do not collect if storage cannot be read reliably.
            for (const key of [I.consts.CHAT_CONVERSATIONS_STORAGE_KEY, "llama-gui:chat-recovery:v1"]) {
                visit(JSON.parse(localStorage.getItem(key) || "null"));
            }
            let recentUnused = false;
            await new Promise((resolve, reject) => {
                const transaction = db.transaction("images", "readwrite");
                const request = transaction.objectStore("images").openCursor();
                transaction.oncomplete = resolve;
                transaction.onabort = () => reject(transaction.error || new Error("Image cleanup cancelled."));
                transaction.onerror = () => reject(transaction.error);
                request.onsuccess = () => {
                    if (!I.workspacePersistentWriteAllowed() || S.workspaceEpoch !== epoch || S.imageImportPending) {
                        transaction.abort();
                        return;
                    }
                    const cursor = request.result;
                    if (!cursor) return;
                    const record = cursor.value;
                    if (!live.has(record.id)) {
                        if (record.created < Date.now() - 60_000) {
                            cursor.delete();
                            cache.delete(record.id);
                        } else recentUnused = true;
                    }
                    cursor.continue();
                };
            });
            if (recentUnused) scheduleImageCleanup(61_000);
        } catch (error) { console.debug("Chat image cleanup unavailable", error); }
    }

    function scheduleImageCleanup(delay = 1000) {
        if (typeof indexedDB === "undefined" || cleanupTimer !== undefined) return;
        cleanupTimer = setTimeout(() => { cleanupTimer = undefined; void pruneImages(); }, delay);
    }

    async function exportImages(conversation) {
        const refs = imageRefs(conversation.messages);
        await prepareImages(conversation.messages);
        return Object.fromEntries(refs.map(ref => [ref.id, cache.get(ref.id)]));
    }

    function initImages() {
        const picker = document.getElementById("chat-image-file");
        const button = document.getElementById("btn-chat-attach");
        if (!picker || !button || picker.dataset.imagesWired) return;
        picker.dataset.imagesWired = "1";
        button.addEventListener("click", () => picker.click());
        picker.addEventListener("change", () => {
            const files = Array.from(picker.files || []);
            picker.value = "";
            void importImages(files);
        });
        scheduleImageCleanup();
    }

    Object.assign(I, { validImageRef, copyImageRefs, prepareImages, imagesReady, imageContent,
        checkImageRequest, reportImages, renderImages, renderDraftImages, importImages,
        pruneImages, scheduleImageCleanup, updateImageControls, exportImages, initImages });
})();

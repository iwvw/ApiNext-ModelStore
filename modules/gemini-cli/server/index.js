const fs = require('fs');
const path = require('path');

const CONFIG = {
    userAgent: "GeminiCLI/0.1.6 (Windows; AMD64)",
    endpoint: "https://cloudcode-pa.googleapis.com/v1internal",
    dataPath: path.join(__dirname, "../data/accounts.json"),
    logPath: path.join(__dirname, "../data/requests.log")
};

const AVAILABLE_MODELS = [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash" },
    { id: "gemini-3-pro-preview", name: "Gemini 3.0 Pro" }
];

module.exports = class GeminiCliModule {
    constructor() {
        this.metadata = {
            name: "gemini-cli",
            version: "1.2.0",
            description: "Google Internal API Adapter (Multi-Account & Logging)",
            dependencies: {}
        };
        this.accounts = [];
        this.requestLogs = []; // Hot storage (Ring buffer)
        this.tokenCache = {}; // Map<accountId, {token, expiry}>
    }

    async init(context) {
        this.context = context;
        const gateway = context.gateway;
        console.log("[GeminiCLI] Initializing Extension v1.2.2...");

        this.loadAccounts();

        console.log("[GeminiCLI] Registering routes...");

        const routes = [
            { method: "POST", path: "/gemini-cli/chat/completions", handler: this.handleChatCompletion },
            { method: "GET", path: "/gemini-cli/models", handler: this.handleListModels },
            { method: "GET", path: "/gemini-cli/accounts", handler: this.handleGetAccounts },
            { method: "POST", path: "/gemini-cli/accounts", handler: this.handleUpdateAccounts },
            { method: "GET", path: "/gemini-cli/logs", handler: this.handleGetLogs }
        ];

        routes.forEach(r => {
            try {
                gateway.registerRoute({
                    method: r.method,
                    path: r.path,
                    moduleName: "gemini-cli",
                    handler: r.handler.bind(this)
                });
                console.log(`[GeminiCLI] Registered ${r.method} ${r.path}`);
            } catch (e) {
                console.error(`[GeminiCLI] Failed to register ${r.path}:`, e);
            }
        });

        console.log("[GeminiCLI] Routes Registered");
    }

    // === Account Management ===
    loadAccounts() {
        try {
            if (fs.existsSync(CONFIG.dataPath)) {
                this.accounts = JSON.parse(fs.readFileSync(CONFIG.dataPath, 'utf8'));
                console.log(`[GeminiCLI] Loaded ${this.accounts.length} accounts.`);
            } else {
                console.log("[GeminiCLI] No accounts found. Initializing empty.");
                this.accounts = [];
            }
        } catch (e) {
            console.error("[GeminiCLI] Failed to load accounts:", e);
            this.accounts = [];
        }
    }

    saveAccounts() {
        try {
            const dir = path.dirname(CONFIG.dataPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(CONFIG.dataPath, JSON.stringify(this.accounts, null, 2));
            console.log("[GeminiCLI] Accounts saved.");
        } catch (e) {
            console.error("[GeminiCLI] Failed to save accounts:", e);
        }
    }

    async handleGetAccounts() {
        const safeAccounts = this.accounts.map(acc => ({
            id: acc.id,
            name: acc.name,
            is_active: acc.config?.is_active,
            project_id: acc.config?.project_id,
            quota_used: acc.config?.quota_used,
            last_used_at: acc.last_used_at,
            error_count: acc.error_count
        }));
        return { status: 200, body: safeAccounts };
    }

    async handleUpdateAccounts(req) {
        try {
            let body = req.body;
            if (!body && req.request && typeof req.request.json === 'function') {
                body = await req.request.json();
            }
            if (!Array.isArray(body)) throw new Error("Body must be an array of accounts");

            const newAccounts = body.map(acc => {
                const existing = this.accounts.find(a => a.id === acc.id);

                // Construct credentials from flat fields if needed
                let creds = acc.credentials;
                if (!creds && (acc.client_id || acc.refresh_token)) {
                    creds = {
                        client_id: acc.client_id,
                        client_secret: acc.client_secret,
                        refresh_token: acc.refresh_token
                    };
                }

                // Fallback to existing
                creds = creds || existing?.credentials;

                return {
                    id: acc.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: acc.name || "Untitled",
                    credentials: creds,
                    config: {
                        is_active: acc.config?.is_active ?? true,
                        project_id: acc.config?.project_id || acc.project_id || "",
                        quota_limit: acc.config?.quota_limit || 1000,
                        quota_used: acc.config?.quota_used || 0
                    },
                    last_used_at: existing?.last_used_at || 0,
                    error_count: 0
                };
            });

            this.accounts = newAccounts;
            this.saveAccounts();

            return { status: 200, body: { message: "Accounts updated", count: this.accounts.length } };
        } catch (e) {
            return { status: 400, body: { error: e.message } };
        }
    }

    // === Logging System ===
    logRequest(entry) {
        this.requestLogs.unshift(entry);
        if (this.requestLogs.length > 100) this.requestLogs.pop();

    }

    async handleGetLogs() {
        return { status: 200, body: this.requestLogs };
    }

    // === Core Logic ===
    async handleListModels() {
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: {
                object: "list",
                data: AVAILABLE_MODELS.map(m => ({
                    id: m.id,
                    object: "model",
                    owned_by: "google-internal"
                }))
            }
        };
    }

    getBestAccount() {
        const candidates = this.accounts.filter(a => a.config?.is_active);
        if (candidates.length === 0) return null;

        candidates.sort((a, b) => (a.last_used_at || 0) - (b.last_used_at || 0));

        return candidates[0];
    }

    async handleChatCompletion(req) {
        const startTime = Date.now();
        const requestId = `req_${startTime}`;
        let selectedAccount = null;

        try {
            selectedAccount = this.getBestAccount();
            if (!selectedAccount) throw new Error("No active accounts available. Please configure account credentials.");

            selectedAccount.last_used_at = Date.now();
            this.saveAccounts(); // Persist rotation state

            let body;
            if (req.body) body = req.body;
            else if (req.request && typeof req.request.json === 'function') body = await req.request.json();
            else throw new Error("Cannot parse request body");

            const accessToken = await this.getAccessToken(selectedAccount);
            const projectId = await this.getProjectId(accessToken, selectedAccount);

            if (!projectId) throw new Error(`Account ${selectedAccount.name}: Failed to detect Project ID.`);

            const originalModelId = body.model || "gemini-2.5-flash";
            const baseModelId = this.getBaseModelName(originalModelId);
            const action = body.stream ? "streamGenerateContent" : "generateContent";
            const url = body.stream
                ? `${CONFIG.endpoint}:${action}?alt=sse`
                : `${CONFIG.endpoint}:${action}`;

            const geminiPayload = this.convertOpenAIToGemini(body, baseModelId);

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "User-Agent": CONFIG.userAgent,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: baseModelId,
                    project: projectId,
                    request: geminiPayload
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                selectedAccount.error_count++;
                throw new Error(`Upstream Error ${res.status}: ${errText}`);
            }

            selectedAccount.error_count = 0;

            if (body.stream) {
                const logEntry = {
                    id: requestId,
                    timestamp: startTime,
                    model: originalModelId,
                    account: selectedAccount.name,
                    status: 200,
                    duration: 0,
                    has_thinking: false
                };
                this.logRequest(logEntry);

                return this.handleStreamResponse(res, originalModelId, logEntry);
            } else {
                const data = await res.json();
                const openaiResp = this.convertResponse(data, originalModelId);

                this.logRequest({
                    id: requestId,
                    timestamp: startTime,
                    model: originalModelId,
                    account: selectedAccount.name,
                    status: 200,
                    duration: Date.now() - startTime,
                    has_thinking: false // Non-stream usually doesn't show thinking in this API version
                });

                return {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                    body: openaiResp
                };
            }

        } catch (error) {
            console.error("[GeminiCLI] Error:", error);
            this.logRequest({
                id: requestId,
                timestamp: startTime,
                model: "unknown",
                account: selectedAccount ? selectedAccount.name : "none",
                status: 500,
                duration: Date.now() - startTime,
                error: error.message
            });

            return {
                status: 500,
                headers: { "Content-Type": "application/json" },
                body: { error: { message: "Internal Error / Account Failure", detail: error.message } }
            };
        }
    }

    // === Helpers ===
    handleStreamResponse(res, modelId, logEntry) {
        const self = this;
        const startTime = Date.now();

        async function* streamIterator() {
            let buffer = "";
            let reader = null;
            let hasThinking = false;

            try {
                if (!res.body) throw new Error("Response body is null");
                reader = res.body.getReader();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += Buffer.from(value).toString('utf8');
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.trim()) {
                            yield* self.processEvent(line, modelId, (isThought) => {
                                if (isThought) hasThinking = true;
                            });
                        }
                    }
                }
                if (buffer.trim()) {
                    yield* self.processEvent(buffer, modelId, (isThought) => { if (isThought) hasThinking = true; });
                }
                yield Buffer.from("data: [DONE]\n\n");

                logEntry.duration = Date.now() - startTime;
                logEntry.has_thinking = hasThinking;

            } catch (e) {
                yield Buffer.from(`data: {"error": "${e.message}"}\n\n`);
            } finally {
                if (reader) reader.releaseLock();
            }
        }

        return new Response(streamIterator(), {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        });
    }

    *processEvent(eventText, modelId, onThoughtFound) {
        if (!eventText.startsWith("data: ")) return;
        const jsonStr = eventText.slice(6);
        if (jsonStr === "[DONE]") return;

        try {
            const data = JSON.parse(jsonStr);
            const candidates = data.candidates || data.response?.candidates;
            if (!candidates || candidates.length === 0) return;

            const content = candidates[0].content;
            if (content && content.parts) {
                for (const p of content.parts) {
                    const text = p.text || "";
                    if (!text && !p.thought) continue;

                    const isThought = !!p.thought || p.role === 'thought';
                    if (isThought && onThoughtFound) onThoughtFound(true);

                    const chunk = {
                        id: "chatcmpl-" + Date.now(),
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1000),
                        model: modelId,
                        choices: [{ index: 0, delta: {}, finish_reason: null }]
                    };

                    if (isThought) chunk.choices[0].delta.reasoning_content = text;
                    else chunk.choices[0].delta.content = text;

                    yield Buffer.from("data: " + JSON.stringify(chunk) + "\n\n");
                }
            }
        } catch (e) { }
    }

    convertOpenAIToGemini(openaiRequest, modelName) {
        const { messages, temperature, max_tokens, stop } = openaiRequest;
        const contents = [];
        let systemParts = [];

        messages.forEach(msg => {
            if (msg.role === 'system') {
                systemParts.push(msg.content);
            } else {
                const role = msg.role === 'assistant' ? 'model' : 'user';
                const last = contents[contents.length - 1];
                if (last && last.role === role) {
                    last.parts.push({ text: msg.content });
                } else {
                    contents.push({ role, parts: [{ text: msg.content }] });
                }
            }
        });

        let systemInstruction = null;
        if (systemParts.length > 0) {
            systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
        }

        const genConfig = {
            temperature: temperature ?? 1.0,
            maxOutputTokens: max_tokens ?? 8192
        };
        if (stop) genConfig.stopSequences = Array.isArray(stop) ? stop : [stop];

        if (modelName.includes("gemini-3") || modelName.includes("thinking")) {
            let budget = modelName.includes("flash") ? 4096 : 16384;
            if (modelName.includes("maxthinking")) budget = modelName.includes("flash") ? 24576 : 32768;

            // Default budget for 2.0 thinking if not specified
            if (modelName.includes("gemini-2.0") && !budget) budget = 8192;

            genConfig.thinkingConfig = {
                include_thoughts: true,
                thinkingBudget: budget
            };
            if (genConfig.maxOutputTokens < budget + 1024) {
                genConfig.maxOutputTokens = Math.min(65536, budget + 4096);
            }
        }

        return {
            contents,
            systemInstruction,
            generationConfig: genConfig,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };
    }

    getBaseModelName(model) {
        let m = model;
        if (m.startsWith("models/")) m = m.replace("models/", "");
        return m;
    }

    convertResponse(data, modelId) {
        const candidates = data.candidates || data.response?.candidates;
        const text = candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
        return {
            id: "chatcmpl-" + Date.now(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            choices: [{
                index: 0,
                message: { role: "assistant", content: text },
                finish_reason: "stop"
            }]
        };
    }

    async getAccessToken(account) {
        const now = Math.floor(Date.now() / 1000);
        const cached = this.tokenCache[account.id];
        if (cached && cached.expiry > now + 60) return cached.token;

        const creds = account.credentials;
        if (!creds || !creds.refresh_token) throw new Error("Missing credentials");

        const params = new URLSearchParams({
            client_id: creds.client_id || creds.clientId,
            client_secret: creds.client_secret || creds.clientSecret,
            refresh_token: creds.refresh_token || creds.refreshToken,
            grant_type: "refresh_token"
        });

        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
        });

        if (!res.ok) throw new Error(`Token Refresh Failed: ${await res.text()}`);
        const data = await res.json();

        this.tokenCache[account.id] = { token: data.access_token, expiry: now + (data.expires_in || 3600) };
        return data.access_token;
    }

    async getProjectId(token, account) {
        if (account.config?.project_id) return account.config.project_id;

        try {
            const res = await fetch("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "User-Agent": CONFIG.userAgent
                },
                body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.cloudaicompanionProject) {
                    const pid = data.cloudaicompanionProject;
                    account.config.project_id = pid;
                    this.saveAccounts(); // Cache it
                    return pid;
                }
            }
        } catch (e) { }

        try {
            const res = await fetch("https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.projects?.length > 0) {
                    const pid = data.projects[0].projectId;
                    account.config.project_id = pid;
                    this.saveAccounts();
                    return pid;
                }
            }
        } catch (e) { }

        return "";
    }
};

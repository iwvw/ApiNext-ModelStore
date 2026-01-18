import React, { useState, useEffect } from 'react';
import {
    Server, Activity, Terminal, Shield, Plus, Trash2, Edit2,
    RotateCcw, CheckCircle, XCircle, Upload
} from 'lucide-react';

// Use host shared components
const { Button } = require("@/components/ui/button");
const { Input } = require("@/components/ui/input");
const { Card, CardHeader, CardTitle, CardContent, CardDescription } = require("@/components/ui/card");
const { Badge } = require("@/components/ui/badge");
const { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } = require("@/components/ui/table");


// Types
interface Account {
    id: string;
    is_active: boolean;
    name: string;
    project_id?: string;
    last_used_at?: string;
    error_count?: number;
    credentials?: any;
}

interface LogEntry {
    id: string;
    timestamp: string;
    status: number;
    model: string;
    account: string;
    duration: number;
    has_thinking: boolean;
    error?: string;
}
const StatusCard = ({ title, value, sub, icon: Icon, color = "text-primary" }: any) => {
    if (!Icon) return null;
    return (
        <Card className="flex items-center gap-4">
            <CardContent className="p-4 flex items-center gap-4 w-full">
                <div className={`p-3 rounded-lg bg-muted ${color}`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <h3 className="text-2xl font-bold">{value}</h3>
                    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
};

const LogsPanel = ({ logs }: { logs: LogEntry[] }) => (
    <Card className="flex flex-col h-full overflow-hidden border-zinc-800">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <span className="font-semibold flex items-center gap-2">
                <Terminal className="w-4 h-4" /> 实时日志
            </span>
            <span className="text-xs text-zinc-500">{logs.length} events</span>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-2">
            {logs.map(log => (
                <div key={log.id} className="group flex gap-3 hover:bg-zinc-900/50 p-1 -mx-1 rounded">
                    <span className="text-zinc-600 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${log.status === 200 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {log.status === 200 ? 'OK' : 'ERR'}
                            </span>
                            <span className="text-zinc-400">{log.model}</span>
                            <span className="text-zinc-500 text-xs">via {log.account}</span>
                        </div>
                        {log.has_thinking && (
                            <div className="text-purple-400 text-xs flex items-center gap-1">
                                <span className="w-1 h-3 bg-purple-500 rounded-full inline-block"></span>
                                捕捉到思考过程
                            </div>
                        )}
                        {log.error && (
                            <div className="text-red-400 break-all">{log.error}</div>
                        )}
                    </div>
                    <span className="text-zinc-500 shrink-0">{log.duration}ms</span>
                </div>
            ))}
            {logs.length === 0 && (
                <div className="text-zinc-600 text-center py-10 italic">等待请求中...</div>
            )}
        </div>
    </Card>
);

const AccountsPanel = ({ accounts, onUpdate, onRefresh }: { accounts: Account[], onUpdate: (accs: Account[]) => void, onRefresh: () => void }) => {
    const [jsonText, setJsonText] = useState("");
    const [showImport, setShowImport] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const stats = {
        total: accounts.length,
        active: accounts.filter(a => a.is_active).length,
        errors: accounts.reduce((sum, a) => sum + (a.error_count || 0), 0)
    };

    const handleImport = () => {
        try {
            const data = JSON.parse(jsonText);
            let accountsToImport = data;

            // Support object wrapper format (e.g. { accounts: [...] })
            if (!Array.isArray(data) && data.accounts && Array.isArray(data.accounts)) {
                accountsToImport = data.accounts;
            }

            if (Array.isArray(accountsToImport)) {
                onUpdate(accountsToImport);
                setShowImport(false);
                setJsonText("");
            } else {
                alert("格式错误：必须是账号数组，或包含 accounts 数组的对象。");
            }
        } catch (e) {
            alert("JSON 格式无效");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setJsonText(ev.target?.result as string);
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatusCard title="活跃账号" value={stats.active} sub={`总计: ${stats.total}`} icon={Server} color="text-blue-500" />
                <StatusCard title="健康状态" value={stats.errors === 0 ? "健康" : "降级"} sub={`检测到 ${stats.errors} 个错误`} icon={Activity} color={stats.errors === 0 ? "text-green-500" : "text-orange-500"} />
                <StatusCard title="Project IDs" value={accounts.filter(a => !!a.project_id).length} sub="自动探测" icon={Shield} color="text-purple-500" />
            </div>

            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={onRefresh} title="刷新">
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                    <h3 className="font-semibold text-lg">账号列表</h3>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => setShowImport(!showImport)}
                        className="flex items-center gap-2">
                        <Plus className="w-4 h-4" /> 导入 / 添加
                    </Button>
                </div>
            </div>

            {showImport && (
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center">
                        <h4 className="font-medium text-sm">粘贴 JSON 或上传文件</h4>
                        <div className="flex gap-2">
                            <input
                                type="file"
                                accept=".json"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-1 text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80">
                                <Upload className="w-3 h-3" /> 选择文件
                            </button>
                        </div>
                    </div>
                    <textarea
                        className="w-full h-32 p-2 rounded-md font-mono text-xs bg-background border focus:ring-2 ring-primary/20 outline-none"
                        placeholder='[{"name": "acc1", "credentials": {...}}]'
                        value={jsonText}
                        onChange={e => setJsonText(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>取消</Button>
                        <Button size="sm" onClick={handleImport}>保存并覆盖</Button>
                    </div>
                </div>
            )}

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">状态</TableHead>
                            <TableHead>名称</TableHead>
                            <TableHead>Project ID</TableHead>
                            <TableHead>最后使用</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {accounts.map(acc => (
                            <TableRow key={acc.id} className="group">
                                <TableCell>
                                    {acc.is_active
                                        ? <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20">活跃</Badge>
                                        : <Badge variant="secondary">离线</Badge>
                                    }
                                </TableCell>
                                <TableCell className="font-medium">{acc.name}</TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">{acc.project_id || "等待中..."}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {acc.last_used_at ? new Date(acc.last_used_at).toLocaleTimeString() : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => alert('暂未实现编辑功能')}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => {
                                                if (confirm(`确认删除账号 ${acc.name}?`)) {
                                                    const newAccs = accounts.filter(a => a.id !== acc.id);
                                                    onUpdate(newAccs);
                                                }
                                            }}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                    暂无配置账号
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
};

// === Main App ===

export default function GeminiCliApp({ locale: _locale }: { locale: string }) {
    const [activeTab, setActiveTab] = useState<'accounts' | 'logs'>('accounts');
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);

    // Poll Logs
    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/v1/gateway/gemini-cli/logs');
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data);
                }
            } catch (e) { }
        };

        fetchLogs();
        const timer = setInterval(fetchLogs, 2000);
        return () => clearInterval(timer);
    }, []);

    // Fetch Accounts
    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/v1/gateway/gemini-cli/accounts');
            if (res.ok) {
                setAccounts(await res.json());
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAccounts(); }, []);

    const updateAccounts = async (newAccounts: any[]) => {
        try {
            setLoading(true);
            const res = await fetch('/api/v1/gateway/gemini-cli/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAccounts)
            });
            if (res.ok) {
                await fetchAccounts();
            } else {
                const err = await res.json();
                alert("操作失败: " + err.error);
            }
        } catch (e) {
            alert("网络错误");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-full p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between pb-6 border-b">
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight">Gemini CLI 管理器</h2>
                    <p className="text-muted-foreground">管理多账号轮询与内部 API 网关设置。</p>
                </div>
                <div className="flex bg-muted/50 p-1 rounded-full border">
                    <Button
                        variant={activeTab === 'accounts' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('accounts')}
                        className="rounded-full shadow-none">
                        账号管理
                    </Button>
                    <Button
                        variant={activeTab === 'logs' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('logs')}
                        className="rounded-full shadow-none">
                        实时日志
                    </Button>
                </div>
            </div>

            <div className={loading ? "opacity-50 pointer-events-none transition-opacity" : ""}>
                {activeTab === 'accounts' ? (
                    <AccountsPanel accounts={accounts} onUpdate={updateAccounts} onRefresh={fetchAccounts} />
                ) : (
                    <div className="h-[600px]">
                        <LogsPanel logs={logs} />
                    </div>
                )}
            </div>
        </div>
    );
}

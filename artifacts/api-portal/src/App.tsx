import { useState, useEffect } from "react";

const MODELS = [
  { id: "gpt-5.2", provider: "OpenAI", desc: "最强通用模型" },
  { id: "gpt-5-mini", provider: "OpenAI", desc: "高吞吐量低成本" },
  { id: "gpt-5-nano", provider: "OpenAI", desc: "最快最省成本" },
  { id: "o4-mini", provider: "OpenAI", desc: "复杂推理思维模型" },
  { id: "o3", provider: "OpenAI", desc: "深度推理旗舰" },
  { id: "claude-opus-4-6", provider: "Anthropic", desc: "最强 Claude，复杂任务" },
  { id: "claude-sonnet-4-6", provider: "Anthropic", desc: "均衡性能与速度" },
  { id: "claude-haiku-4-5", provider: "Anthropic", desc: "轻量快速" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-2 px-2 py-0.5 rounded text-xs font-mono bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors border border-zinc-600"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400 font-medium">{label}</span>
      <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm text-emerald-400 break-all">
        <span className="flex-1">{value}</span>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const baseUrl = window.location.origin;

  useEffect(() => {
    fetch(`${baseUrl}/api/healthz`)
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, [baseUrl]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white">AI Proxy</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">OpenAI 兼容</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full inline-block ${online === null ? "bg-zinc-500" : online ? "bg-emerald-400" : "bg-red-500"}`}
            />
            <span className={online === null ? "text-zinc-500" : online ? "text-emerald-400" : "text-red-400"}>
              {online === null ? "检测中…" : online ? "在线" : "离线"}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">OpenAI 兼容反代 API</h1>
          <p className="text-zinc-400 text-base leading-relaxed">
            统一接入 OpenAI 与 Anthropic 模型，兼容所有支持 OpenAI 协议的客户端。在 CherryStudio、Open WebUI 等工具中直接使用。
          </p>
        </div>

        {/* API Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">接口信息</h2>
          <CodeBlock label="Base URL" value={baseUrl} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CodeBlock label="模型列表" value="GET /v1/models" />
            <CodeBlock label="对话补全" value="POST /v1/chat/completions" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400 font-medium">Authorization</span>
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm text-amber-400">
              <span className="flex-1">Bearer {'<'}您的 PROXY_API_KEY{'>'}</span>
            </div>
            <span className="text-xs text-zinc-500 mt-0.5">使用您在 Secrets 中设置的 PROXY_API_KEY 值</span>
          </div>
        </div>

        {/* Models */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">可用模型</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODELS.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm text-white truncate">{m.id}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{m.desc}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      m.provider === "OpenAI"
                        ? "bg-emerald-900/60 text-emerald-400 border border-emerald-800"
                        : "bg-orange-900/60 text-orange-400 border border-orange-800"
                    }`}
                  >
                    {m.provider}
                  </span>
                  <CopyButton text={m.id} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CherryStudio Guide */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">CherryStudio 接入指南</h2>
          <ol className="space-y-4">
            {[
              {
                step: "1",
                title: "打开服务商设置",
                desc: '在 CherryStudio 左侧栏点击「设置」→「模型服务」，点击「添加服务商」选择「OpenAI」类型。',
              },
              {
                step: "2",
                title: "填写 Base URL",
                content: baseUrl,
                desc: "将上方 Base URL 粘贴到「API 地址」字段（无需添加 /v1）。",
              },
              {
                step: "3",
                title: "填写 API Key",
                desc: '将您的 PROXY_API_KEY 值粘贴到「API Key」字段。',
              },
              {
                step: "4",
                title: "添加模型并测试",
                desc: '点击「添加模型」，输入模型 ID（如 claude-sonnet-4-6）。点击「检查」按钮验证连接，成功后即可在对话中使用。',
              },
            ].map((item) => (
              <li key={item.step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 mt-0.5">
                  {item.step}
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="font-medium text-white text-sm">{item.title}</div>
                  <p className="text-zinc-400 text-sm leading-relaxed">{item.desc}</p>
                  {item.content && (
                    <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm text-emerald-400">
                      <span className="flex-1">{item.content}</span>
                      <CopyButton text={item.content} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-zinc-600 pb-4">
          通过 Replit AI Integrations 提供 · 无需自备 API Key · 按用量计费
        </div>
      </div>
    </div>
  );
}

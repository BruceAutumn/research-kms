import { FormEvent, useEffect, useState } from 'react';
import { chatWithAi, getErrorMessage, listPapers } from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { ChatMessage, Paper } from '../types';

export default function ChatPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperId, setPaperId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listPapers().then(setPapers).catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const response = await chatWithAi(paperId, nextMessages);
      setMessages([...nextMessages, { role: 'assistant', content: response.reply }]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold">论文问答</h1>
        <p className="text-sm text-slate-500">可选关联一篇论文;后端会注入论文全文前 12000 字作为上下文。</p>
      </div>
      <select className="rounded border bg-white px-3 py-2" value={paperId || ''} onChange={(e) => setPaperId(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">不带论文上下文</option>
        {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}
      </select>
      <StatusMessage error={error} info={loading ? 'AI 思考中…' : undefined} />
      <div className="flex-1 space-y-3 overflow-auto rounded-xl bg-white p-4 shadow-sm">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
              {message.content}
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-center text-sm text-slate-500">就你的科研文献提问吧。</p>}
      </div>
      <form className="flex gap-2" onSubmit={send}>
        <input className="flex-1 rounded border px-3 py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入问题…" />
        <button className="rounded bg-indigo-600 px-4 py-2 text-white" disabled={loading}>发送</button>
      </form>
    </div>
  );
}

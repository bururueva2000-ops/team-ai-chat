'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, RotateCcw, ArrowUpRight, ArrowUp, BriefcaseBusiness, MessagesSquare, ClipboardCheck, MessageCircleHeart, Sprout, LockKeyhole, ChevronDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { GREETING, ERROR, type Message } from '@/lib/chat';
const STORAGE = 'komanda-ai-history-v1';
const prompts = [
  { icon: BriefcaseBusiness, title: 'Текст вакансии', detail: 'Привлеките подходящих людей', text: 'Составить текст вакансии', color: 'purple' },
  { icon: MessagesSquare, title: 'Вопросы для интервью', detail: 'Подготовьтесь к знакомству', text: 'Подготовить вопросы для интервью', color: 'blue' },
  { icon: ClipboardCheck, title: 'Оценка кандидата', detail: 'Структурируйте впечатления', text: 'Оценить кандидата после собеседования', color: 'blue' },
  { icon: MessageCircleHeart, title: 'Обратная связь', detail: 'Найдите нужные слова', text: 'Сформулировать обратную связь сотруднику', color: 'purple' },
  { icon: Sprout, title: 'Адаптация новичка', detail: 'Помогите уверенно начать', text: 'Составить план адаптации новичка', color: 'purple' },
];
function AssistantIcon({ large = false }: { large?: boolean }) { return <span className={`assistant-icon ${large ? 'large' : ''}`}><Sparkles aria-hidden="true" /></span>; }
function MessageBubble({ message }: { message: Message }) { return <div className={`message-row ${message.role}`}>
  {message.role === 'assistant' && <AssistantIcon />}<div className="message-body"><span className="message-author">{message.role === 'assistant' ? 'Команда AI' : 'Вы'}</span><div className={`bubble ${message.error ? 'error-bubble' : ''}`}>{message.text.split('\n').map((line, i) => <div key={i}>{line.split(/(\*\*[^*]+\*\*)/g).map((part,j) => part.startsWith('**') ? <strong key={j}>{part.slice(2,-2)}</strong> : part) || <br />}</div>)}</div></div>
</div>; }
function ConnectionNotice({ configured }: { configured: boolean | null }) {
  if (configured !== false) return null;
  return <details className="connection-notice"><summary><Info size={16} /><span>Подключите Gemini, чтобы получать ответы</span><ChevronDown size={16} /></summary><div>Получите ключ в <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>. В файле <code>.env</code> проекта вставьте его после <code>GEMINI_API_KEY=</code> и перезапустите приложение. Для опубликованной версии задайте этот секрет в окружении сайта и повторите публикацию.</div></details>;
}
export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    try { const raw = JSON.parse(localStorage.getItem(STORAGE) || '[]'); if (Array.isArray(raw)) setMessages(raw.filter((m): m is Message => m && typeof m.id === 'string' && typeof m.text === 'string' && m.text.length <= 20000 && ['user','assistant'].includes(m.role)).slice(-100)); } catch { setStorageWarning(true); }
    setReady(true);
    fetch('/api/chat').then(r => { if(!r.ok) throw new Error(); return r.json() as Promise<{configured:boolean}>; }).then(d => setConfigured(d.configured)).catch(() => setConfigured(null));
    return () => pending.current?.abort('reset');
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE, JSON.stringify(messages)); } catch { setStorageWarning(true); } } }, [messages, ready]);
  useEffect(() => { if(messages.length || loading) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: {signal: AbortSignal}) => void | Promise<void> } }).modelContext;
    if(!context) return;
    const lifecycle = new AbortController();
    try { void Promise.resolve(context.registerTool({ name: 'stage_hr_question', description: 'Заполнить поле вопроса HR-помощнику без отправки.', inputSchema: {type:'object',properties:{text:{type:'string',maxLength:8000}},required:['text'],additionalProperties:false}, annotations:{readOnlyHint:false}, execute: async (value: unknown) => { const text = (value as {text?:unknown})?.text; if(typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('Нужен вопрос от 1 до 8000 символов'); if(busy.current) throw new Error('Дождитесь ответа'); setInput(text); field.current?.focus(); await new Promise(resolve => requestAnimationFrame(resolve)); return {staged:true}; } }, {signal:lifecycle.signal})).catch(() => {}); } catch {}
    return () => lifecycle.abort();
  }, []);
  async function send() {
    const text = input.trim(); if(!text || busy.current || !ready) return;
    busy.current = true; setLoading(true); setInput('');
    const next = [...messages, {id:crypto.randomUUID(),role:'user' as const,text}]; setMessages(next);
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 65000);
    let failureText = ERROR;
    try {
      const context = next.filter(m => !m.error).slice(-30);
      if(context[0]?.role === 'assistant') context.shift();
      const response = await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal, body:JSON.stringify({messages:context.map(({role,text}) => ({role,text}))})});
      const data = await response.json() as {text?:string;code?:string}; if(data.code === 'NOT_CONFIGURED') setConfigured(false);
      const hints: Record<string,string> = {REGION_UNSUPPORTED:'Google ограничил использование Gemini API для текущего региона подключения компьютера.',RATE_LIMIT:'Достигнут лимит Gemini API. Проверьте квоту в Google AI Studio и попробуйте позже.'};
      if(data.code && hints[data.code]) failureText += '\n\n' + hints[data.code];
      if(!response.ok || typeof data.text !== 'string' || !data.text.trim()) throw new Error();
      if(pending.current !== controller) return;
      const answer = data.text; setConfigured(true); setMessages(previous => [...previous,{id:crypto.randomUUID(),role:'assistant',text:answer}]);
    } catch { if(controller.signal.reason !== 'reset') setMessages(previous => [...previous,{id:crypto.randomUUID(),role:'assistant',text:failureText,error:true}]); }
    finally { clearTimeout(timeout); if(pending.current === controller) {pending.current = null;busy.current = false;setLoading(false); field.current?.focus();} }
  }
  function reset() { pending.current?.abort('reset'); pending.current=null; busy.current=false; setLoading(false); setMessages([]);setInput(''); try { localStorage.removeItem(STORAGE); } catch {setStorageWarning(true);} field.current?.focus(); }
  return <main className="app-shell">
    <header className="topbar"><a href="/" className="brand"><span className="brand-mark"><Sparkles /></span><span><span className="brand-name">Команда <span>AI</span></span><span className="brand-subtitle">Помощник по найму и управлению командой</span></span></a>
    <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="reset-button"><RotateCcw size={16}/><span>Стартовать чат заново</span></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Начать с чистого листа?</AlertDialogTitle><AlertDialogDescription>История этого чата будет удалена с устройства. Восстановить её не получится.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Продолжить чат</AlertDialogCancel><AlertDialogAction onClick={reset}>Начать заново</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></header>
    <section className="chat-card" aria-label="Чат с HR-помощником">
      <div className="chat-top"><div><span className="tiny-spark"><Sparkles size={16}/></span><strong>Ваш партнёр в работе с людьми</strong></div><span className="model-label">AI-помощник</span></div>
      <div className="conversation" role="log" aria-label="История переписки" aria-live="polite" aria-busy={loading}>
        {messages.length === 0 && <div className="welcome"><div className="welcome-emblem"><AssistantIcon large /></div><span className="eyebrow">ЛЮДИ В ЦЕНТРЕ. AI РЯДОМ.</span><h1>Хорошая команда<br/>начинается с разговора<span>.</span></h1><p className="welcome-lead">От первой вакансии до развития сотрудников.</p></div>}
        <div className="greeting-row"><AssistantIcon/><div className="greeting"><span className="message-author">Команда AI</span><p>{GREETING}</p></div></div>
        {messages.length === 0 && <div className="quick-section"><p className="quick-label">С чего начнём?</p><div className="quick-grid">{prompts.map(({icon:Icon,...p}) => <Button key={p.title} variant="outline" className="quick-card" aria-label={p.text} disabled={!ready || loading} onClick={() => {setInput(p.text);field.current?.focus();}}><span className={`quick-icon ${p.color}`}><Icon size={21}/></span><span className="quick-copy"><strong>{p.title}</strong><span>{p.detail}</span></span><ArrowUpRight className="quick-arrow" size={16}/></Button>)}</div></div>}
        {messages.map(message => <MessageBubble key={message.id} message={message}/>)}
        {loading && <div className="message-row assistant"><AssistantIcon/><div className="typing" role="status"><span/><span/><span/><small>Продумываю ответ…</small></div></div>}
        <div ref={end}/>
      </div>
      <div className="composer-area"><ConnectionNotice configured={configured}/>{storageWarning && <p className="storage-warning" role="status">Браузер не разрешил сохранить историю. Она доступна до обновления страницы.</p>}
        <form className="composer" onSubmit={e=>{e.preventDefault();void send();}}><Textarea ref={field} aria-label="Ваш вопрос о найме или команде" placeholder="Напишите ваш вопрос о найме или команде…" value={input} maxLength={8000} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><Button type="submit" className="send-button" disabled={!input.trim() || loading || !ready} aria-label="Отправить сообщение" title="Отправить сообщение"><ArrowUp size={22}/></Button></form>
        <div className="composer-foot"><span><kbd>Enter</kbd> — отправить <span className="keyboard-divider">·</span> <kbd>Shift + Enter</kbd> — новая строка</span><span>С заботой о вашей команде</span></div>
      </div>
    </section>
    <footer className="page-foot"><LockKeyhole size={13}/><span>История чата хранится только в вашем браузере</span><span className="foot-dot">·</span><span>AI помогает. Решение за вами.</span></footer>
  </main>;
}

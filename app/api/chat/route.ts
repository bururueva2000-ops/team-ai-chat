import { env } from 'cloudflare:workers';
import { SYSTEM, ERROR } from '@/lib/chat';
const config = () => env as unknown as {GEMINI_API_KEY?:string;GEMINI_MODEL?:string};
export function GET() { return Response.json({configured:!!config().GEMINI_API_KEY?.trim(),provider:'Gemini'}, {headers:{'Cache-Control':'no-store'}}); }
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if(origin && origin !== new URL(request.url).origin) return Response.json({error:ERROR},{status:403});
  const {GEMINI_API_KEY:key,GEMINI_MODEL:model='gemini-3.5-flash'} = config();
  if(!key?.trim()) return Response.json({error:ERROR,code:'NOT_CONFIGURED'},{status:503});
  try {
    const raw = await request.text(); if(raw.length>150000) return Response.json({error:ERROR},{status:413});
    const {messages} = JSON.parse(raw);
    if(!Array.isArray(messages) || !messages.length || messages.length>30 || !messages.at(-1) || messages.at(-1).role!=='user' || !messages.every(m=>m && ['user','assistant'].includes(m.role) && typeof m.text==='string' && m.text.trim() && m.text.length<=20000)) return Response.json({error:ERROR},{status:400});
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.trim() || 'gemini-3.5-flash')}:generateContent`, {method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key.trim()},signal:AbortSignal.timeout(60000),body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.text}]})),generationConfig:{maxOutputTokens:4096}})});
    if(!response.ok) {
      const failure = await response.json().catch(()=>null) as {error?:{message?:string}} | null;
      const regionBlocked = failure?.error?.message?.includes('User location is not supported');
      const code = regionBlocked ? 'REGION_UNSUPPORTED' : response.status===429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR';
      return Response.json({error:ERROR,code},{status:502});
    }
    const data = await response.json() as {candidates?:{content?:{parts?:{text?:string;thought?:boolean}[]}}[]};
    const text = data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
    if(!text) return Response.json({error:ERROR},{status:502});
    return Response.json({text},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:ERROR},{status:502}); }
}

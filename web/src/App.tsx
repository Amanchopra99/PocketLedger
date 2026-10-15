import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Bot, CalendarDays, ChartNoAxesCombined, CircleHelp, FileUp, LayoutDashboard, Plus, Search, Send, Settings2, Sparkles, Wallet, X, Trash2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
type Tx = { id: string; description: string; amount_paise: number; type: 'expense'|'income'; date: string; category: string; payment_method: string; notes?: string }
type Summary = { month: string; income_paise: number; expense_paise: number; net_paise: number; expense_by_category: {category:string;amount_paise:number}[] }
type ChatMessage = { role: 'user'|'assistant'; content: string }
type AppSettings = { displayName: string; workspaceName: string; defaultType: 'expense'|'income'; defaultCategory: string; defaultPaymentMethod: string }
const money = (paise:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100)
const today = new Date().toISOString().slice(0,10)
const monthNow = today.slice(0,7)
const categories = ['Food','Transport','Shopping','Bills','Health','Entertainment','Salary','Freelance','Home','Education','Travel','Other']
const paymentMethods = ['UPI','Cash','Debit card','Credit card','Bank transfer','Other']
const initialSettings: AppSettings = {displayName:'Account owner',workspaceName:'My finances',defaultType:'expense',defaultCategory:'Food',defaultPaymentMethod:'UPI'}
function readSettings(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('pocketledger.settings') || '{}') as Partial<AppSettings>
    return {
      displayName: typeof saved.displayName === 'string' && saved.displayName.trim() ? saved.displayName : initialSettings.displayName,
      workspaceName: typeof saved.workspaceName === 'string' && saved.workspaceName.trim() ? saved.workspaceName : initialSettings.workspaceName,
      defaultType: saved.defaultType === 'income' ? 'income' : 'expense',
      defaultCategory: categories.includes(saved.defaultCategory || '') ? saved.defaultCategory! : initialSettings.defaultCategory,
      defaultPaymentMethod: paymentMethods.includes(saved.defaultPaymentMethod || '') ? saved.defaultPaymentMethod! : initialSettings.defaultPaymentMethod,
    }
  } catch { return initialSettings }
}

export default function App() {
  const [transactions,setTransactions] = useState<Tx[]>([])
  const [summary,setSummary] = useState<Summary | null>(null)
  const [month,setMonth] = useState(monthNow)
  const [search,setSearch] = useState('')
  const [showAdd,setShowAdd] = useState(false)
  const [showImport,setShowImport] = useState(false)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [settings,setSettings] = useState<AppSettings>(readSettings)
  const [settingsDraft,setSettingsDraft] = useState<AppSettings>(settings)
  const [showSettings,setShowSettings] = useState(false)
  const [form,setForm] = useState({description:'',amount:'',type:settings.defaultType,date:today,category:settings.defaultCategory,payment_method:settings.defaultPaymentMethod,notes:''})
  const [csvRows,setCsvRows] = useState<any[]>([])
  const [csvFile,setCsvFile] = useState<File|null>(null)
  const [importMessage,setImportMessage] = useState('')
  const [showAssistant,setShowAssistant] = useState(false)
  const [chatMessages,setChatMessages] = useState<ChatMessage[]>([{role:'assistant',content:'I can help spot spending patterns and suggest practical next steps.'}])
  const [chatInput,setChatInput] = useState('')
  const [chatBusy,setChatBusy] = useState(false)
  const chatMessagesRef = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      setError('')
      const [t,s] = await Promise.all([
        fetch(`${API}/api/transactions?limit=200`),
        fetch(`${API}/api/dashboard/summary?month=${month}`)
      ])
      if (!t.ok || !s.ok) throw new Error('API unavailable. Start the backend and MongoDB, then refresh.')
      setTransactions(await t.json()); setSummary(await s.json())
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load data') }
  }
  useEffect(()=>{ load() },[month])
  useEffect(()=>{ const container=chatMessagesRef.current; if(container) container.scrollTo({top:container.scrollHeight,behavior:'smooth'}) },[chatMessages,chatBusy,showAssistant])
  const filtered = useMemo(()=>transactions.filter(t => `${t.description} ${t.category} ${t.payment_method}`.toLowerCase().includes(search.toLowerCase())),[transactions,search])
  const setField = (key:string,value:string) => setForm(f=>({...f,[key]:value}))
  function openSettings() { setSettingsDraft(settings);setShowSettings(true) }
  function updateSetting<K extends keyof AppSettings>(key:K,value:AppSettings[K]) { setSettingsDraft(current=>({...current,[key]:value})) }
  function saveSettings(e:React.FormEvent) {
    e.preventDefault()
    const next = {...settingsDraft,displayName:settingsDraft.displayName.trim()||initialSettings.displayName,workspaceName:settingsDraft.workspaceName.trim()||initialSettings.workspaceName}
    try { localStorage.setItem('pocketledger.settings',JSON.stringify(next)) }
    catch { setError('Could not save settings in this browser.');return }
    setSettings(next)
    setForm(current=>({...current,type:next.defaultType,category:next.defaultCategory,payment_method:next.defaultPaymentMethod}))
    setShowSettings(false)
  }
  async function addTransaction(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${API}/api/transactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,amount_paise:Math.round(Number(form.amount)*100),notes:form.notes||null})})
      if(!response.ok) { const body=await response.json(); throw new Error(body.detail || 'Could not save transaction') }
      setShowAdd(false); setForm({description:'',amount:'',type:settings.defaultType,date:today,category:settings.defaultCategory,payment_method:settings.defaultPaymentMethod,notes:''}); await load()
    } catch(e) { setError(e instanceof Error?e.message:'Could not save transaction') } finally { setBusy(false) }
  }
  async function removeTransaction(id:string) {
    if(!confirm('Delete this transaction?')) return
    try { const r=await fetch(`${API}/api/transactions/${id}`,{method:'DELETE'}); if(!r.ok) throw new Error('Delete failed'); await load() }
    catch(e) { setError(e instanceof Error?e.message:'Delete failed') }
  }
  async function previewCsv() {
    if(!csvFile) return
    setBusy(true); setImportMessage('')
    try {
      const fd=new FormData(); fd.append('file',csvFile)
      const r=await fetch(`${API}/api/imports/csv/preview`,{method:'POST',body:fd})
      const data=await r.json(); if(!r.ok) throw new Error(data.detail||'CSV preview failed')
      setCsvRows(data.rows.filter((row:any)=>row.valid).map((row:any)=>row.data))
      setImportMessage(`${data.valid_count} valid rows, ${data.invalid_count} invalid rows. Only valid rows are shown below.`)
    } catch(e) { setImportMessage(e instanceof Error?e.message:'Preview failed') } finally { setBusy(false) }
  }
  async function commitCsv() {
    setBusy(true)
    try {
      const r=await fetch(`${API}/api/imports/csv/commit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:csvRows})})
      const data=await r.json(); if(!r.ok) throw new Error(data.detail||'Import failed')
      setImportMessage(`Imported ${data.imported_count} transactions.`); setCsvRows([]); setCsvFile(null); await load()
    } catch(e) { setImportMessage(e instanceof Error?e.message:'Import failed') } finally { setBusy(false) }
  }
  async function sendChat(e:React.FormEvent) {
    e.preventDefault()
    const content=chatInput.trim()
    if(!content||chatBusy) return
    const nextMessages=[...chatMessages,{role:'user' as const,content}]
    setChatMessages(nextMessages);setChatInput('');setChatBusy(true)
    try {
      const response=await fetch(`${API}/api/assistant/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:nextMessages.slice(-12)})})
      const data=await response.json()
      if(!response.ok) throw new Error(data.detail||'AI assistant could not respond')
      setChatMessages(current=>[...current,{role:'assistant',content:data.reply}])
    } catch(e) {
      setChatMessages(current=>[...current,{role:'assistant',content:e instanceof Error?e.message:'AI assistant could not respond'}])
    } finally { setChatBusy(false) }
  }
  const spent = summary?.expense_paise || 0
  const total = summary?.expense_by_category.reduce((a,c)=>a+c.amount_paise,0) || 0
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wallet size={20}/></div><span>Pocket<span className="brand-accent">Ledger</span></span></div>
      <div className="workspace"><div className="avatar">{settings.displayName.charAt(0).toUpperCase()}</div><div><strong>{settings.workspaceName}</strong><small>{settings.displayName}</small></div><span className="online-dot"/></div>
      <div className="nav-label">WORKSPACE</div>
      <button className="nav-item active"><LayoutDashboard size={18}/> Overview</button>
      <button className="nav-item" onClick={()=>document.getElementById('transactions')?.scrollIntoView({behavior:'smooth'})}><Activity size={18}/> Transactions</button>
      <button className="nav-item" onClick={()=>setShowImport(true)}><FileUp size={18}/> Import statement</button>
      <div className="nav-label">PREFERENCES</div>
      <button className="nav-item" onClick={openSettings}><Settings2 size={18}/> Settings</button>
      <div className="sidebar-bottom"><div className="help-icon"><CircleHelp size={17}/></div><div><strong>Keep it in control</strong><small>Small steps add up.</small></div></div>
      <div className="sidebar-foot">POCKETLEDGER <span>v0.1</span></div>
    </aside>
    <button className="assistant-launcher" onClick={()=>setShowAssistant(value=>!value)} aria-expanded={showAssistant} aria-label={showAssistant?'Close AI assistant':'Open AI assistant'}><Sparkles size={17}/><span>Ask AI</span></button>
    {showAssistant&&<section className="assistant-panel" aria-label="PocketLedger AI assistant">
      <header className="assistant-header"><div className="assistant-title-icon"><Bot size={18}/></div><div><strong>Money assistant</strong><small>Insights from your transaction history</small></div><button className="icon-button" onClick={()=>setShowAssistant(false)} aria-label="Close assistant"><X size={17}/></button></header>
      <div className="assistant-privacy"><Sparkles size={14}/><span>Aggregated totals and categories are sent to Groq. Transaction names and notes are not.</span></div>
      <div className="assistant-messages" ref={chatMessagesRef} aria-live="polite">
        {chatMessages.map((message,index)=><div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>{message.content}</div>)}
        {chatBusy&&<div className="assistant-message assistant"><span className="assistant-thinking">Analyzing your transactions…</span></div>}
      </div>
      {chatMessages.length===1&&<div className="assistant-suggestions"><span>Try asking</span><button onClick={()=>setChatInput('What are my biggest spending categories?')}>Biggest spending categories</button><button onClick={()=>setChatInput('How have my expenses changed over time?')}>Spending trends</button><button onClick={()=>setChatInput('Suggest practical ways to reduce my spending.')}>Ways to save</button></div>}
      <form className="assistant-form" onSubmit={sendChat}><textarea aria-label="Ask about your transactions" maxLength={2000} rows={2} placeholder="Ask about your transactions…" value={chatInput} onChange={event=>setChatInput(event.target.value)}/><button className="button primary" type="submit" disabled={chatBusy||!chatInput.trim()} aria-label="Send message" title="Send message"><Send size={16}/></button></form>
    </section>}
    {showSettings&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setShowSettings(false)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-head"><div><h2 id="settings-title">Settings</h2><p>Profile and new transaction defaults</p></div><button className="icon-button" onClick={()=>setShowSettings(false)} aria-label="Close settings"><X size={18}/></button></div><form className="form-grid" onSubmit={saveSettings}><label className="full">Display name<input maxLength={60} required value={settingsDraft.displayName} onChange={event=>updateSetting('displayName',event.target.value)}/></label><label className="full">Workspace name<input maxLength={60} required value={settingsDraft.workspaceName} onChange={event=>updateSetting('workspaceName',event.target.value)}/></label><label>Default type<select value={settingsDraft.defaultType} onChange={event=>updateSetting('defaultType',event.target.value as AppSettings['defaultType'])}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Default category<select value={settingsDraft.defaultCategory} onChange={event=>updateSetting('defaultCategory',event.target.value)}>{categories.map(category=><option key={category}>{category}</option>)}</select></label><label className="full">Default payment method<select value={settingsDraft.defaultPaymentMethod} onChange={event=>updateSetting('defaultPaymentMethod',event.target.value)}>{paymentMethods.map(method=><option key={method}>{method}</option>)}</select></label><p className="settings-note full">Saved in this browser only.</p><div className="modal-actions full"><button type="button" className="button secondary" onClick={()=>setShowSettings(false)}>Cancel</button><button className="button primary" type="submit">Save settings</button></div></form></section></div>}
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">PERSONAL FINANCE <span>/</span> OVERVIEW</div><h1>Your money, in focus.</h1><p className="subtitle">A clear picture of where your money goes.</p></div><div className="top-actions"><button className="button secondary" onClick={()=>setShowImport(true)}><FileUp size={16}/> Import CSV</button><button className="button primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Add transaction</button></div></header>
      {error && <div className="alert"><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}
      <section className="period-row"><div className="section-kicker"><CalendarDays size={16}/> FINANCIAL SNAPSHOT</div><label className="month-picker"><span>Period</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></section>
      <section className="stats-grid">
        <article className="stat-card"><div className="stat-head"><span>Total income</span><div className="stat-icon income"><ArrowDownLeft size={18}/></div></div><div className="stat-value">{money(summary?.income_paise||0)}</div><div className="stat-foot"><span className="status-dot green"/>Money received this month</div></article>
        <article className="stat-card"><div className="stat-head"><span>Total expenses</span><div className="stat-icon expense"><ArrowUpRight size={18}/></div></div><div className="stat-value">{money(summary?.expense_paise||0)}</div><div className="stat-foot"><span className="status-dot amber"/>Money spent this month</div></article>
        <article className="stat-card featured"><div className="stat-head"><span>Net cash flow</span><div className="stat-icon net"><ChartNoAxesCombined size={18}/></div></div><div className="stat-value">{money(summary?.net_paise||0)}</div><div className="stat-foot">{(summary?.net_paise||0)>=0?'You are net positive this month':'Expenses exceed income this month'}</div><div className="feature-glow"/></article>
      </section>
      <section className="content-grid">
        <article className="panel spending-panel"><div className="panel-heading"><div><h2>Spending breakdown</h2><p>Where your money went this month</p></div><span className="mini-pill">BY CATEGORY</span></div>
          {(!summary?.expense_by_category.length)?<div className="empty-chart"><div className="empty-ring"><ChartNoAxesCombined size={24}/></div><strong>No spending data yet</strong><span>Add your first expense to see the breakdown.</span></div>:<div className="breakdown"><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(${summary.expense_by_category.map((c,i)=>{const colors=['#9b8afb','#51d6a0','#e9b76a','#6ca9ff','#f28ca8','#64c9d4','#b3c979']; const start=summary.expense_by_category.slice(0,i).reduce((s,x)=>s+x.amount_paise,0)/total*100; return `${colors[i%colors.length]} ${start}% ${start+c.amount_paise/total*100}%`}).join(',')})`}}><div className="donut-hole"><strong>{money(spent)}</strong><span>spent</span></div></div></div><div className="category-list">{summary.expense_by_category.slice(0,6).map((c,i)=><div className="category-row" key={c.category}><span className={`category-dot c${i%7}`}/><span className="category-name">{c.category}</span><div className="category-bar"><span style={{width:`${Math.max(3,c.amount_paise/Math.max(1,total)*100)}%`}}/></div><strong>{money(c.amount_paise)}</strong></div>)}</div></div>}
        </article>
        <article className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Stay on top of your money</p></div></div><button className="quick-action" onClick={()=>setShowAdd(true)}><span className="quick-icon purple"><Plus size={18}/></span><span><strong>Add a transaction</strong><small>Record income or an expense</small></span><span className="quick-arrow">↗</span></button><button className="quick-action" onClick={()=>setShowImport(true)}><span className="quick-icon teal"><FileUp size={18}/></span><span><strong>Import a statement</strong><small>Bring in transactions from CSV</small></span><span className="quick-arrow">↗</span></button><div className="tip-box"><span className="tip-star">✦</span><div><strong>A little clarity goes a long way.</strong><p>Track consistently to understand your spending patterns over time.</p></div></div></article>
      </section>
      <section className="panel transactions-panel" id="transactions"><div className="panel-heading tx-heading"><div><h2>Recent transactions</h2><p>Your latest money movements</p></div><div className="tx-tools"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transactions"/></div><button className="button secondary small" onClick={()=>setShowAdd(true)}><Plus size={15}/> Add new</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>CATEGORY</th><th>DATE</th><th>PAYMENT</th><th className="right">AMOUNT</th><th></th></tr></thead><tbody>{filtered.map(t=><tr key={t.id}><td><div className="tx-name"><div className={`tx-avatar ${t.type}`}>{t.type==='income'?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</div><div><strong>{t.description}</strong><small>{t.type==='income'?'Money received':'Money spent'}</small></div></div></td><td><span className="category-chip">{t.category}</span></td><td className="date-cell">{t.date}</td><td className="payment-cell">{t.payment_method}</td><td className={`amount-cell right ${t.type}`}>{t.type==='income'?'+':'−'}{money(t.amount_paise)}</td><td><button className="icon-button" title="Delete transaction" onClick={()=>removeTransaction(t.id)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty-table">No transactions found. Add a transaction or import a CSV statement.</div>}</div><div className="table-footer"><span>Showing {filtered.length} transaction{filtered.length===1?'':'s'}</span><span>Amounts in INR <span className="footer-dot">•</span> Private workspace</span></div>
      </section>
      <footer className="footer"><span>© 2026 PocketLedger</span><span>Built for more mindful money habits.</span></footer>
    </main>
    {showAdd&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><div className="modal"><div className="modal-head"><div><h2>Add transaction</h2><p>Capture the details while they’re fresh.</p></div><button className="icon-button" onClick={()=>setShowAdd(false)}><X/></button></div><form onSubmit={addTransaction} className="form-grid"><label className="full">Transaction name<input required maxLength={160} value={form.description} onChange={e=>setField('description',e.target.value)} placeholder="e.g. Grocery shopping"/></label><label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setField('amount',e.target.value)} placeholder="0.00"/></label><label>Type<select value={form.type} onChange={e=>setField('type',e.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Date<input type="date" required value={form.date} onChange={e=>setField('date',e.target.value)}/></label><label>Category<select value={form.category} onChange={e=>setField('category',e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Payment method<select value={form.payment_method} onChange={e=>setField('payment_method',e.target.value)}>{['UPI','Cash','Debit card','Credit card','Bank transfer','Other'].map(c=><option key={c}>{c}</option>)}</select></label><label className="full">Notes <textarea value={form.notes} onChange={e=>setField('notes',e.target.value)} placeholder="Optional note" rows={2}/></label><div className="modal-actions full"><button type="button" className="button secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button disabled={busy} className="button primary" type="submit">{busy?'Saving…':'Save transaction'}</button></div></form></div></div>}
    {showImport&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowImport(false)}}><div className="modal"><div className="modal-head"><div><h2>Import CSV statement</h2><p>Preview valid rows before importing.</p></div><button className="icon-button" onClick={()=>setShowImport(false)}><X/></button></div><div className="import-content"><div className="upload-zone"><FileUp size={26}/><strong>Choose a CSV file</strong><span>Required columns: date, description, amount, type</span><input type="file" accept=".csv,text/csv" onChange={e=>{setCsvFile(e.target.files?.[0]||null);setCsvRows([]);setImportMessage('')}}/></div><button className="button primary full-button" disabled={!csvFile||busy} onClick={previewCsv}>{busy?'Working…':'Preview CSV'}</button>{importMessage&&<div className="import-message">{importMessage}</div>}{csvRows.length>0&&<><div className="preview-list">{csvRows.slice(0,5).map((r,i)=><div key={i}><span>{r.date} · {r.description}</span><strong>{money(r.amount_paise)}</strong></div>)}{csvRows.length>5&&<small>and {csvRows.length-5} more valid rows…</small>}</div><button className="button primary full-button" disabled={busy} onClick={commitCsv}>Import {csvRows.length} valid rows</button></>}</div></div></div>}
  </div>
}

import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// Inject print styles once
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #pdf-root, #pdf-root * { visibility: visible !important; }
  #pdf-root { position: fixed; top: 0; left: 0; width: 100%; padding: 16px; box-sizing: border-box; font-family: 'Trebuchet MS', sans-serif; }
  #pdf-root button { display: none !important; }
  #pdf-root select { display: none !important; }
  #pdf-root input { border: none !important; background: transparent !important; color: #c8b84a !important; }
  @page { size: A4 landscape; margin: 10mm; }
}
`;
if (!document.getElementById("cadencia-print-style")) {
  const s = document.createElement("style");
  s.id = "cadencia-print-style";
  s.innerHTML = PRINT_STYLE;
  document.head.appendChild(s);
}

// ─── COLE AQUI AS CONFIGURAÇÕES DO SEU FIREBASE ───────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCNg2lVSkF1aL4pa7MvUXvrEiIgUpmCaIQ",
  authDomain: "cadencia-sp.firebaseapp.com",
  databaseURL: "https://cadencia-sp-default-rtdb.firebaseio.com",
  projectId: "cadencia-sp",
  storageBucket: "cadencia-sp.firebasestorage.app",
  messagingSenderId: "226124975510",
  appId: "1:226124975510:web:d8f261d58d61777dd361b7",
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const EXECUTIVES = [
  { id: 1, name: "Bruno Duque",    fields: ["bg", "bg_paytv", "bg_high", "bg_high_paytv"] },
  { id: 2, name: "Julia Masone",   fields: ["bg", "bg_paytv", "bg_high", "bg_high_paytv"] },
  { id: 3, name: "Lucas Gulino",   fields: ["bg", "bg_paytv", "bg_high", "bg_high_paytv"] },
  { id: 4, name: "Raphael Jucá",   fields: ["bg", "bg_paytv", "bg_high", "bg_high_paytv"] },
  { id: 5, name: "Ricardo Caldas", fields: ["bg", "bg_paytv", "bg_high", "bg_high_paytv"] },
  { id: 6, name: "Manuella Vidal", fields: ["bg_digital", "bg_high_digital"] },
];

const FIELD_LABELS: Record<string, string> = {
  bg: "BG", bg_paytv: "BG Pay TV", bg_high: "BG High",
  bg_high_paytv: "BG High Pay TV", bg_digital: "BG Digital", bg_high_digital: "BG High Digital",
};

const PLATFORMS = ["TV Aberta", "TV por Assinatura", "Digital"];
const PLATFORM_COLOR: Record<string, any> = {
  "TV Aberta":         { bg: "#fff8e8", border: "#c8b84a", text: "#7a6500" },
  "TV por Assinatura": { bg: "#e8f4ff", border: "#4a8cc8", text: "#004a7a" },
  "Digital":           { bg: "#edfff0", border: "#4a9c5f", text: "#1a5c2a" },
};

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const emptyOpp = () => ({ id: Date.now() + Math.random(), platform: "TV Aberta", client: "", detail: "", value: "", month: MONTHS[new Date().getMonth()] });
const parse    = (v: any) => parseFloat(String(v || "").replace(/[^\d]/g, "")) || 0;
const fmtFull  = (n: number) => n === 0 ? "—" : "R$ " + n.toLocaleString("pt-BR");
function maskCurrency(raw: any) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return "R$ " + parseInt(digits, 10).toLocaleString("pt-BR");
}

function getWeeks() {
  const weeks: any[] = [];
  const now = new Date();
  // Get Monday of CURRENT week (not next week)
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day; // Sunday goes back 6, others go back to Monday
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0,0,0,0);
  for (let i = -4; i <= 8; i++) {
    const s = new Date(mon); s.setDate(mon.getDate() + i * 7);
    const e = new Date(s);   e.setDate(s.getDate() + 4);
    const p  = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const mo = s.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();
    weeks.push({ key: `w_${s.toISOString().slice(0,10)}`, label: `${p(s)} - ${p(e)}`, month: mo });
  }
  return weeks;
}
const WEEKS = getWeeks();
const CURRENT_WEEK = WEEKS[4].key;

// Returns true if the given week key is one of the last 2 Mondays of its month
function isLastTwoWeeksOfMonth(weekKey: string): boolean {
  const d = new Date(weekKey.replace("w_", ""));
  const month = d.getMonth();
  const year  = d.getFullYear();
  // Find all Mondays in this month
  const mondays: Date[] = [];
  const cur = new Date(year, month, 1);
  // advance to first Monday
  const dayOfWeek = cur.getDay();
  const daysToMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  cur.setDate(cur.getDate() + daysToMon);
  while (cur.getMonth() === month) {
    mondays.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  const lastTwo = mondays.slice(-2).map(m => m.toISOString().slice(0,10));
  return lastTwo.includes(d.toISOString().slice(0,10));
}

function getNextMonthName(weekKey: string): string {
  const d = new Date(weekKey.replace("w_", ""));
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();
}

function getCurrentMonthName(weekKey: string): string {
  const d = new Date(weekKey.replace("w_", ""));
  return d.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();
}

const T: any = { fontFamily: "'Trebuchet MS', sans-serif" };
const thS: any = { padding:"8px 12px", fontSize:11, fontWeight:700, textAlign:"center" as const, whiteSpace:"nowrap" as const, letterSpacing:1 };
const tdS = (r: boolean): any => ({ padding:"8px 12px", fontSize:13, textAlign: r?"right" as const:"left" as const, borderBottom:"1px solid #e8e4d0", whiteSpace:"nowrap" as const });
const numS = (v: number): any => ({ ...tdS(true), color: v>0?"#1a5c1a":"#bbb", fontWeight: v>0?700:400 });

export default function App() {
  const [screen, setScreen]         = useState("login");
  const [selectedExec, setSelectedExec] = useState("");
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK);
  const [allData, setAllData]       = useState<any>({});
  const [values, setValues]         = useState<any>({});
  const [nextValues, setNextValues] = useState<any>({});
  const [opps, setOpps]             = useState<any[]>([emptyOpp()]);
  const [step, setStep]             = useState(1);
  const [saved, setSaved]           = useState(false);
  const [dashWeek, setDashWeek]     = useState(CURRENT_WEEK);
  const [enviado, setEnviado]       = useState<any>({});
  const [envInputs, setEnvInputs]   = useState<any>({});
  const [envSaved, setEnvSaved]     = useState(false);
  const [dashTab, setDashTab]       = useState("forecast");
  const [filterExec, setFilterExec] = useState("Todos");
  const [filterPlat, setFilterPlat] = useState("Todas");
  const [filterClient, setFilterClient] = useState("Todos");
  const [filterMonth, setFilterMonth] = useState("Todos");

  useEffect(() => {
    onValue(ref(db, "cadence_v2"),   snap => { if (snap.exists()) setAllData(snap.val()); });
    onValue(ref(db, "cadence_env"),  snap => { if (snap.exists()) setEnviado(snap.val()); });
  }, []);

  useEffect(() => { setEnvInputs(enviado[dashWeek] || {}); }, [dashWeek, enviado]);

  async function persistData(data: any)    { try { await set(ref(db, "cadence_v2"),  data); } catch(e){} }
  async function persistEnviado(data: any) { try { await set(ref(db, "cadence_env"), data); } catch(e){} }

  function handleEnter() {
    if (!selectedExec) return;
    const ex = allData[`${selectedExec}__${selectedWeek}`];
    setValues(ex?.values || {});
    setNextValues(ex?.nextValues || {});
    setOpps(ex?.opps?.length ? ex.opps : [emptyOpp()]);
    setSaved(false); setStep(1); setScreen("input");
  }

  async function handleSaveStep1() {
    const key = `${selectedExec}__${selectedWeek}`;
    const upd = { ...allData, [key]: { ...(allData[key]||{}), exec: selectedExec, week: selectedWeek, values, nextValues, ts: new Date().toISOString() } };
    setAllData(upd); await persistData(upd); setStep(2);
  }

  async function handleSaveStep2() {
    const key = `${selectedExec}__${selectedWeek}`;
    const upd = { ...allData, [key]: { ...(allData[key]||{ exec: selectedExec, week: selectedWeek, values }), opps, ts: new Date().toISOString() } };
    setAllData(upd); await persistData(upd);
    setSaved(true); setTimeout(() => { setSaved(false); setScreen("login"); }, 1800);
  }

  async function handleSaveEnviado() {
    const upd = { ...enviado, [dashWeek]: envInputs };
    setEnviado(upd); await persistEnviado(upd);
    setEnvSaved(true); setTimeout(() => setEnvSaved(false), 2500);
  }

  function updateOpp(id: any, field: string, val: any) { setOpps(opps.map((o:any) => o.id===id ? {...o,[field]:val} : o)); }
  function removeOpp(id: any) { setOpps(opps.filter((o:any) => o.id !== id)); }
  function addOpp() { setOpps([...opps, emptyOpp()]); }

  const weekData = EXECUTIVES.map(ex => ({
    ...ex,
    v:    allData[`${ex.name}__${dashWeek}`]?.values || {},
    opps: allData[`${ex.name}__${dashWeek}`]?.opps   || [],
  }));

  const colTotal = (col: string) => weekData.reduce((s,e) => s + parse((e.v as any)[col]), 0);
  const getEnv   = (col: string) => parse(envInputs[col]);
  const allOpps: any[]  = weekData.reduce((acc: any[], e) => acc.concat((e.opps as any[]).filter((o:any) => o.client).map((o:any) => ({...o, exec: e.name}))), []);
  const totalBG     = colTotal("bg") + colTotal("bg_digital");
  const totalBGHigh = colTotal("bg_high") + colTotal("bg_high_digital");
  const exec = EXECUTIVES.find(e => e.name === selectedExec);
  const wk   = WEEKS.find(w => w.key === dashWeek) || WEEKS[2];

  const EnvCell = ({ col }: { col: string }) => {
    const [localVal, setLocalVal] = useState(envInputs[col] || "");
    return (
      <input
        value={localVal ? maskCurrency(localVal) : ""}
        onChange={e => setLocalVal(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => setEnvInputs((prev: any) => ({...prev, [col]: localVal}))}
        placeholder="—"
        style={{ width:"100%", padding:"5px 8px", background:"#2a3e2a", border:"1px solid #c8b84a",
          borderRadius:2, color:"#c8b84a", fontSize:13, fontWeight:700, textAlign:"right" as const, outline:"none", boxSizing:"border-box" as const }} />
    );
  };

  // LOGIN
  if (screen === "login") return (
    <div style={{ minHeight:"100vh", background:"#f7f6f0", display:"flex", alignItems:"center", justifyContent:"center", ...T }}>
      <div style={{ width:400, padding:"44px 40px", background:"#fff", border:"2px solid #c8b84a", borderRadius:4, boxShadow:"6px 6px 0 #c8b84a33" }}>
        <div style={{ textAlign:"center" as const, marginBottom:36 }}>
          <div style={{ display:"inline-block", background:"#4a7c3f", color:"#fff", fontSize:11, letterSpacing:4, padding:"4px 14px", textTransform:"uppercase" as const, marginBottom:14 }}>Regional SP</div>
          <h1 style={{ margin:0, fontSize:22, color:"#1a2e1a", fontWeight:700 }}>Cadência Semanal</h1>
        </div>
        <label style={{ display:"block", fontSize:11, color:"#888", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:6 }}>Executivo</label>
        <select value={selectedExec} onChange={e => setSelectedExec(e.target.value)}
          style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #ddd", borderRadius:3, fontSize:14, color:"#333", marginBottom:18, background:"#fafafa", boxSizing:"border-box" as const, outline:"none" }}>
          <option value="">Selecione seu nome...</option>
          {EXECUTIVES.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>
        <label style={{ display:"block", fontSize:11, color:"#888", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:6 }}>Semana</label>
        <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
          style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #ddd", borderRadius:3, fontSize:14, color:"#333", marginBottom:28, background:"#fafafa", boxSizing:"border-box" as const, outline:"none" }}>
          {WEEKS.map(w => <option key={w.key} value={w.key}>{w.label} · {w.month}</option>)}
        </select>
        <button onClick={handleEnter} disabled={!selectedExec}
          style={{ width:"100%", padding:"13px", background: selectedExec?"#4a7c3f":"#ccc", border:"none", borderRadius:3, color:"#fff", fontSize:14, fontWeight:700, cursor: selectedExec?"pointer":"default", letterSpacing:1, ...T }}>
          PREENCHER →
        </button>
        <div style={{ marginTop:16, textAlign:"center" as const }}>
          <button onClick={() => { setScreen("dashboard"); setDashWeek(selectedWeek); }}
            style={{ background:"none", border:"none", color:"#c8b84a", fontSize:12, cursor:"pointer", textDecoration:"underline", ...T }}>
            📊 Ver Consolidado
          </button>
        </div>
      </div>
    </div>
  );

  // INPUT
  if (screen === "input") {
    const wkLabel = WEEKS.find(w => w.key === selectedWeek);
    const StepBar = () => (
      <div style={{ display:"flex", alignItems:"center", marginBottom:24 }}>
        {[{n:1,label:"Previsão BG"},{n:2,label:"Oportunidades"}].map((s,i) => (
          <div key={s.n} style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 16px", borderRadius:3,
              background: step===s.n?"#4a7c3f":step>s.n?"#d4ecd4":"#f0ede0",
              border:`1.5px solid ${step===s.n?"#4a7c3f":step>s.n?"#4a7c3f":"#ddd"}` }}>
              <span style={{ width:20, height:20, borderRadius:"50%", background: step===s.n?"#fff":step>s.n?"#4a7c3f":"#bbb",
                color: step===s.n?"#4a7c3f":"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {step>s.n?"✓":s.n}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color: step===s.n?"#fff":step>s.n?"#2a5c1a":"#999" }}>{s.label}</span>
            </div>
            {i===0 && <div style={{ width:24, height:2, background: step>1?"#4a7c3f":"#ddd" }} />}
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ minHeight:"100vh", background:"#f7f6f0", ...T, padding:"32px 24px" }}>
        <div style={{ maxWidth: step===2?700:520, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
            <div>
              <div style={{ display:"inline-block", background:"#4a7c3f", color:"#fff", fontSize:10, letterSpacing:4, padding:"3px 12px", textTransform:"uppercase" as const, marginBottom:10 }}>Regional SP</div>
              <h1 style={{ margin:0, fontSize:20, color:"#1a2e1a", fontWeight:700 }}>{selectedExec}</h1>
              <p style={{ margin:"4px 0 0", color:"#888", fontSize:13 }}>{wkLabel?.label} · {wkLabel?.month}</p>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setScreen("dashboard"); setDashWeek(selectedWeek); }}
                style={{ padding:"7px 13px", background:"#fff", border:"1.5px solid #c8b84a", borderRadius:3, color:"#b8980a", fontSize:11, cursor:"pointer", ...T }}>📊 Consolidado</button>
              <button onClick={() => setScreen("login")}
                style={{ padding:"7px 13px", background:"#fff", border:"1.5px solid #ddd", borderRadius:3, color:"#888", fontSize:11, cursor:"pointer", ...T }}>← Sair</button>
            </div>
          </div>
          <StepBar />
          {step===1 && (
            <>
              {/* Previsão mês atual */}
              <div style={{ background:"#fff", border:"2px solid #c8b84a", borderRadius:4, overflow:"hidden", marginBottom:16 }}>
                <div style={{ background:"#c8b84a", padding:"10px 20px" }}>
                  <span style={{ fontWeight:700, fontSize:13, color:"#1a2e1a", letterSpacing:1 }}>
                    PREVISÃO — {getCurrentMonthName(selectedWeek)}
                  </span>
                </div>
                {exec?.fields.map((field, i) => (
                  <div key={field} style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom: i<exec.fields.length-1?"1px solid #f0ede0":"none" }}>
                    <div style={{ padding:"14px 20px", display:"flex", alignItems:"center", background: i%2===0?"#fafaf5":"#fff" }}>
                      <span style={{ fontSize:13, color:"#444", fontWeight:600 }}>{FIELD_LABELS[field]}</span>
                    </div>
                    <div style={{ padding:"8px 16px", borderLeft:"1px solid #f0ede0", background: i%2===0?"#fafaf5":"#fff" }}>
                      <input value={values[field]?maskCurrency(values[field]):""}
                        onChange={e => setValues({...values,[field]:e.target.value.replace(/[^\d]/g,"")})}
                        placeholder="R$ 0"
                        style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0ddc8", borderRadius:3, fontSize:14, color:"#2a5c1a", fontWeight:700, outline:"none", boxSizing:"border-box" as const, textAlign:"right" as const, background:"#fffff8" }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Previsão mês seguinte — só nas duas últimas semanas do mês */}
              {isLastTwoWeeksOfMonth(selectedWeek) && (
                <div style={{ background:"#fff", border:"2px solid #4a7c3f", borderRadius:4, overflow:"hidden", marginBottom:16 }}>
                  <div style={{ background:"#4a7c3f", padding:"10px 20px", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:"#fff", letterSpacing:1 }}>
                      PREVISÃO — {getNextMonthName(selectedWeek)}
                    </span>
                    <span style={{ fontSize:10, color:"#a8d4a0" }}>Projeção para o próximo mês</span>
                  </div>
                  {exec?.fields.map((field, i) => (
                    <div key={field} style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom: i<exec.fields.length-1?"1px solid #e8f0e8":"none" }}>
                      <div style={{ padding:"14px 20px", display:"flex", alignItems:"center", background: i%2===0?"#f5faf5":"#fff" }}>
                        <span style={{ fontSize:13, color:"#444", fontWeight:600 }}>{FIELD_LABELS[field]}</span>
                      </div>
                      <div style={{ padding:"8px 16px", borderLeft:"1px solid #e8f0e8", background: i%2===0?"#f5faf5":"#fff" }}>
                        <input value={nextValues[field]?maskCurrency(nextValues[field]):""}
                          onChange={e => setNextValues({...nextValues,[field]:e.target.value.replace(/[^\d]/g,"")})}
                          placeholder="R$ 0"
                          style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #b8d8b0", borderRadius:3, fontSize:14, color:"#2a5c1a", fontWeight:700, outline:"none", boxSizing:"border-box" as const, textAlign:"right" as const, background:"#f8fff8" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleSaveStep1}
                style={{ width:"100%", padding:"14px", background:"#1a2e1a", border:"none", borderRadius:3, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", ...T, letterSpacing:1 }}>
                PRÓXIMO: Principais Oportunidades →
              </button>
            </>
          )}
          {step===2 && (
            <>
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div>
                    <span style={{ fontWeight:700, fontSize:15, color:"#1a2e1a" }}>Principais Oportunidades</span>
                    <span style={{ marginLeft:10, fontSize:12, color:"#888" }}>Adicione as oportunidades relevantes da semana</span>
                  </div>
                  <button onClick={addOpp} style={{ padding:"7px 16px", background:"#4a7c3f", border:"none", borderRadius:3, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", ...T }}>+ Adicionar</button>
                </div>
                {opps.map((opp:any, i:number) => (
                  <div key={opp.id} style={{ background:"#fff", border:`2px solid ${PLATFORM_COLOR[opp.platform]?.border||"#ddd"}`, borderRadius:4, marginBottom:12, overflow:"hidden" }}>
                    <div style={{ background:PLATFORM_COLOR[opp.platform]?.bg||"#fafafa", padding:"8px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${PLATFORM_COLOR[opp.platform]?.border||"#ddd"}` }}>
                      <div style={{ display:"flex", gap:6 }}>
                        {PLATFORMS.map(p => (
                          <button key={p} onClick={() => updateOpp(opp.id,"platform",p)}
                            style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${p===opp.platform?PLATFORM_COLOR[p].border:"#ddd"}`,
                              background:p===opp.platform?PLATFORM_COLOR[p].border:"#fff", color:p===opp.platform?"#fff":"#999",
                              fontSize:11, fontWeight:700, cursor:"pointer", ...T }}>
                            {p}
                          </button>
                        ))}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:11, color:"#bbb" }}>#{i+1}</span>
                        {opps.length>1 && <button onClick={() => removeOpp(opp.id)} style={{ background:"none", border:"none", color:"#ccc", cursor:"pointer", fontSize:18, lineHeight:1, padding:0 }}>×</button>}
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr 1fr" }}>
                      <div style={{ padding:"10px 14px", borderRight:"1px solid #f0ede0" }}>
                        <div style={{ fontSize:10, color:"#aaa", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:5 }}>Mês</div>
                        <select value={opp.month || MONTHS[new Date().getMonth()]} onChange={e => updateOpp(opp.id,"month",e.target.value)}
                          style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #ebe8d8", borderRadius:3, fontSize:13, color:"#333", outline:"none", background:"#fffff8", boxSizing:"border-box" as const }}>
                          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      {[
                        {field:"client",label:"Cliente",      placeholder:"Nome do cliente",           right:false,green:false},
                        {field:"value", label:"Valor",        placeholder:"R$ 0",                      right:true, green:true },
                        {field:"detail",label:"Detalhamento", placeholder:"Contexto da oportunidade…", right:false,green:false},
                      ].map(({field,label,placeholder,right,green}) => (
                        <div key={field} style={{ padding:"10px 14px", borderRight:"1px solid #f0ede0" }}>
                          <div style={{ fontSize:10, color:"#aaa", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:5 }}>{label}</div>
                          <input value={field==="value"?maskCurrency(opp[field]):(opp[field]||"")}
                            onChange={e => updateOpp(opp.id,field,field==="value"?e.target.value.replace(/[^\d]/g,""):e.target.value)}
                            placeholder={placeholder}
                            style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #ebe8d8", borderRadius:3, fontSize:13,
                              color:green?"#2a5c1a":"#333", fontWeight:green?700:400,
                              textAlign:right?"right" as const:"left" as const, outline:"none", boxSizing:"border-box" as const, background:"#fffff8" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setStep(1)} style={{ flex:"0 0 auto", padding:"14px 20px", background:"#fff", border:"1.5px solid #ddd", borderRadius:3, color:"#888", fontSize:13, cursor:"pointer", ...T }}>← Voltar</button>
                <button onClick={handleSaveStep2} style={{ flex:1, padding:"14px", background:saved?"#4a7c3f":"#1a2e1a", border:"none", borderRadius:3, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", ...T, letterSpacing:1 }}>
                  {saved?"✓ ENVIADO!":"CONCLUIR E ENVIAR ✓"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // DASHBOARD
  function exportPDF() {
    setDashTab("forecast");
    setTimeout(() => window.print(), 300);
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f7f6f0", ...T, padding:"28px 20px" }}>
      <div id="pdf-root" style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap" as const, gap:12 }}>
          <div>
            <div style={{ display:"inline-block", background:"#4a7c3f", color:"#fff", fontSize:10, letterSpacing:4, padding:"3px 12px", textTransform:"uppercase" as const, marginBottom:8 }}>Regional SP</div>
            <h1 style={{ margin:0, fontSize:20, color:"#1a2e1a", fontWeight:700 }}>{wk.label} · {wk.month}</h1>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <select value={dashWeek} onChange={e => setDashWeek(e.target.value)}
              style={{ padding:"8px 12px", border:"1.5px solid #ddd", borderRadius:3, fontSize:12, color:"#333", background:"#fff", outline:"none" }}>
              {WEEKS.map(w => <option key={w.key} value={w.key}>{w.label} · {w.month}</option>)}
            </select>
            <button onClick={exportPDF} style={{ padding:"8px 14px", background:"#4a7c3f", border:"none", borderRadius:3, color:"#fff", fontSize:12, cursor:"pointer", fontWeight:700, ...T }}>🖨️ Exportar PDF</button>
            <button onClick={() => setScreen("login")} style={{ padding:"8px 14px", background:"#fff", border:"1.5px solid #ddd", borderRadius:3, color:"#888", fontSize:12, cursor:"pointer", ...T }}>← Voltar</button>
          </div>
        </div>
        <div style={{ display:"flex", marginBottom:20, borderBottom:"2px solid #e8e4d0" }}>
          {[{key:"forecast",label:"📊 Previsão BG"},{key:"opps",label:"⭐ Principais Oportunidades"}].map(tab => (
            <button key={tab.key} onClick={() => setDashTab(tab.key)}
              style={{ padding:"10px 22px", background:"none", border:"none",
                borderBottom:dashTab===tab.key?"3px solid #4a7c3f":"3px solid transparent",
                color:dashTab===tab.key?"#1a2e1a":"#888", fontWeight:dashTab===tab.key?700:400,
                fontSize:13, cursor:"pointer", ...T, marginBottom:"-2px" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {dashTab==="forecast" && (
          <>
            {/* ── Previsão mês atual ── */}
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:11, color:"#888", letterSpacing:3, textTransform:"uppercase" as const, marginBottom:10, fontWeight:700 }}>
                📅 {getCurrentMonthName(dashWeek)}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom: isLastTwoWeeksOfMonth(dashWeek)?24:14 }}>
              {[
                { title:"PREVISÃO",      cols:["bg","bg_paytv","bg_digital"],                heads:["BG","Pay TV","Digital"],              totalCols:["bg","bg_digital"],                dataKey:"values" },
                { title:"PREVISÃO HIGH", cols:["bg_high","bg_high_paytv","bg_high_digital"], heads:["BG HIGH","PayTV HIGH","Digital HIGH"], totalCols:["bg_high","bg_high_digital"],       dataKey:"values" },
              ].map(panel => (
                <div key={panel.title} style={{ background:"#fff", border:"2px solid #c8b84a", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ background:"#c8b84a", padding:"9px 16px", textAlign:"center" as const }}>
                    <span style={{ fontWeight:700, fontSize:13, color:"#1a2e1a", letterSpacing:1 }}>{panel.title}</span>
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
                    <thead>
                      <tr style={{ background:"#faf8e8" }}>
                        <th style={{ ...thS, textAlign:"left" as const }}></th>
                        {panel.heads.map(h => <th key={h} style={thS}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {weekData.map((ex,i) => {
                        const vals = panel.cols.map(c => parse((ex.v as any)[c]));
                        return (
                          <tr key={ex.id} style={{ background:i%2===0?"#fafaf5":"#fff" }}>
                            <td style={{ ...tdS(false), fontWeight:600, color:"#333" }}>{ex.name.split(" ")[0]}</td>
                            {vals.map((v,j) => <td key={j} style={numS(v)}>{v>0?fmtFull(v):""}</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"#4a7c3f" }}>
                        <td style={{ ...tdS(false), color:"#fff", fontWeight:700 }}>TOTAL</td>
                        {panel.cols.map(c => <td key={c} style={{ ...tdS(true), color:"#fff", fontWeight:700 }}>{fmtFull(colTotal(c))}</td>)}
                      </tr>
                      <tr style={{ background:"#f0ede0" }}>
                        <td style={{ ...tdS(false), fontWeight:700, color:"#1a2e1a" }}>TOTAL BG</td>
                        <td colSpan={3} style={{ ...tdS(true), fontWeight:700, color:"#1a2e1a", fontSize:14 }}>{fmtFull(panel.totalCols.reduce((s,c)=>s+colTotal(c),0))}</td>
                      </tr>
                      <tr style={{ background:"#1a2e1a" }}>
                        <td style={{ ...tdS(false), color:"#c8b84a", fontWeight:700 }}>ENVIADO</td>
                        {panel.cols.map(c => <td key={c} style={{ padding:"5px 8px" }}><EnvCell col={c} /></td>)}
                      </tr>
                      <tr style={{ background:"#0f1f0f" }}>
                        <td colSpan={4} style={{ padding:"8px 10px" }}>
                          <button onClick={handleSaveEnviado}
                            style={{ width:"100%", padding:"7px", background:envSaved?"#4a7c3f":"#c8b84a", border:"none", borderRadius:2, color:envSaved?"#fff":"#1a2e1a", fontSize:12, fontWeight:700, cursor:"pointer", ...T }}>
                            {envSaved?"✓ Salvo!":"💾 Salvar Enviado"}
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}
            </div>

            {/* ── Previsão mês seguinte (só nas duas últimas semanas) ── */}
            {isLastTwoWeeksOfMonth(dashWeek) && (() => {
              const nextWeekData = EXECUTIVES.map(ex => ({
                ...ex,
                v: allData[`${ex.name}__${dashWeek}`]?.nextValues || {},
              }));
              const colTotalNext = (col: string) => nextWeekData.reduce((s,e) => s + parse((e.v as any)[col]), 0);
              return (
                <>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, color:"#4a7c3f", letterSpacing:3, textTransform:"uppercase" as const, fontWeight:700 }}>
                      📅 {getNextMonthName(dashWeek)} — Projeção
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:14 }}>
                    {[
                      { title:`PREVISÃO — ${getNextMonthName(dashWeek)}`,      cols:["bg","bg_paytv","bg_digital"],                heads:["BG","Pay TV","Digital"],              totalCols:["bg","bg_digital"] },
                      { title:`PREVISÃO HIGH — ${getNextMonthName(dashWeek)}`, cols:["bg_high","bg_high_paytv","bg_high_digital"], heads:["BG HIGH","PayTV HIGH","Digital HIGH"], totalCols:["bg_high","bg_high_digital"] },
                    ].map(panel => (
                      <div key={panel.title} style={{ background:"#fff", border:"2px solid #4a7c3f", borderRadius:4, overflow:"hidden" }}>
                        <div style={{ background:"#4a7c3f", padding:"9px 16px", textAlign:"center" as const }}>
                          <span style={{ fontWeight:700, fontSize:13, color:"#fff", letterSpacing:1 }}>{panel.title}</span>
                        </div>
                        <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
                          <thead>
                            <tr style={{ background:"#f5faf5" }}>
                              <th style={{ ...thS, textAlign:"left" as const }}></th>
                              {panel.heads.map(h => <th key={h} style={thS}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {nextWeekData.map((ex,i) => {
                              const vals = panel.cols.map(c => parse((ex.v as any)[c]));
                              return (
                                <tr key={ex.id} style={{ background:i%2===0?"#f5faf5":"#fff" }}>
                                  <td style={{ ...tdS(false), fontWeight:600, color:"#333" }}>{ex.name.split(" ")[0]}</td>
                                  {vals.map((v,j) => <td key={j} style={numS(v)}>{v>0?fmtFull(v):""}</td>)}
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background:"#4a7c3f" }}>
                              <td style={{ ...tdS(false), color:"#fff", fontWeight:700 }}>TOTAL</td>
                              {panel.cols.map(c => <td key={c} style={{ ...tdS(true), color:"#fff", fontWeight:700 }}>{fmtFull(colTotalNext(c))}</td>)}
                            </tr>
                            <tr style={{ background:"#f0ede0" }}>
                              <td style={{ ...tdS(false), fontWeight:700, color:"#1a2e1a" }}>TOTAL BG</td>
                              <td colSpan={3} style={{ ...tdS(true), fontWeight:700, color:"#1a2e1a", fontSize:14 }}>{fmtFull(panel.totalCols.reduce((s,c)=>s+colTotalNext(c),0))}</td>
                            </tr>
                            <tr style={{ background:"#1a2e1a" }}>
                              <td style={{ ...tdS(false), color:"#c8b84a", fontWeight:700 }}>ENVIADO</td>
                              {panel.cols.map(c => <td key={c} style={{ padding:"5px 8px" }}><EnvCell col={`next_${c}`} /></td>)}
                            </tr>
                            <tr style={{ background:"#0f1f0f" }}>
                              <td colSpan={4} style={{ padding:"8px 10px" }}>
                                <button onClick={handleSaveEnviado}
                                  style={{ width:"100%", padding:"7px", background:envSaved?"#4a7c3f":"#c8b84a", border:"none", borderRadius:2, color:envSaved?"#fff":"#1a2e1a", fontSize:12, fontWeight:700, cursor:"pointer", ...T }}>
                                  {envSaved?"✓ Salvo!":"💾 Salvar Enviado"}
                                </button>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(155px,1fr))", gap:8 }}>
              {EXECUTIVES.map(ex => {
                const entry  = allData[`${ex.name}__${dashWeek}`];
                const hasBG  = !!entry?.values;
                const hasOpp = !!(entry?.opps?.length && entry.opps.some((o:any)=>o.client));
                return (
                  <div key={ex.id} style={{ padding:"9px 14px", background:hasBG?"#f0f8f0":"#fff", border:`1.5px solid ${hasBG?"#4a7c3f":"#ddd"}`, borderRadius:3 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:14 }}>{hasBG?"✅":"⬜"}</span>
                      <span style={{ fontSize:12, color:hasBG?"#2a5c1a":"#999", fontWeight:hasBG?700:400 }}>{ex.name.split(" ")[0]} {ex.name.split(" ")[1]}</span>
                    </div>
                    <div style={{ fontSize:10, color:hasOpp?"#4a7c3f":"#bbb", paddingLeft:22 }}>
                      {hasOpp?`⭐ ${entry.opps.filter((o:any)=>o.client).length} oportunidade(s)`:"Sem oportunidades"}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {dashTab==="opps" && (
          <div>
            {/* Filtros */}
            <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap" as const }}>
              <div>
                <label style={{ display:"block", fontSize:10, color:"#888", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:5 }}>Executivo</label>
                <select value={filterExec} onChange={e => setFilterExec(e.target.value)}
                  style={{ padding:"8px 12px", border:"1.5px solid #ddd", borderRadius:3, fontSize:13, color:"#333", background:"#fff", outline:"none", ...T }}>
                  <option value="Todos">Todos</option>
                  {EXECUTIVES.map(e => <option key={e.id} value={e.name}>{e.name.split(" ")[0]} {e.name.split(" ")[1]}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:10, color:"#888", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:5 }}>Plataforma</label>
                <select value={filterPlat} onChange={e => setFilterPlat(e.target.value)}
                  style={{ padding:"8px 12px", border:"1.5px solid #ddd", borderRadius:3, fontSize:13, color:"#333", background:"#fff", outline:"none", ...T }}>
                  <option value="Todas">Todas</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:10, color:"#888", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:5 }}>Mês</label>
                <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                  style={{ padding:"8px 12px", border:"1.5px solid #ddd", borderRadius:3, fontSize:13, color:"#333", background:"#fff", outline:"none", ...T }}>
                  <option value="Todos">Todos</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:10, color:"#888", letterSpacing:2, textTransform:"uppercase" as const, marginBottom:5 }}>Cliente</label>
                <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                  style={{ padding:"8px 12px", border:"1.5px solid #ddd", borderRadius:3, fontSize:13, color:"#333", background:"#fff", outline:"none", ...T }}>
                  <option value="Todos">Todos</option>
                  {Array.from(new Set(allOpps.map((o:any) => o.client).filter(Boolean))).sort().map((cl:any) => (
                    <option key={cl} value={cl}>{cl}</option>
                  ))}
                </select>
              </div>
              {(filterExec !== "Todos" || filterPlat !== "Todas" || filterClient !== "Todos" || filterMonth !== "Todos") && (
                <div style={{ display:"flex", alignItems:"flex-end" }}>
                  <button onClick={() => { setFilterExec("Todos"); setFilterPlat("Todas"); setFilterClient("Todos"); setFilterMonth("Todos"); }}
                    style={{ padding:"8px 14px", background:"#fff", border:"1.5px solid #ddd", borderRadius:3, color:"#888", fontSize:12, cursor:"pointer", ...T }}>
                    ✕ Limpar filtros
                  </button>
                </div>
              )}
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"flex-end" }}>
                <span style={{ fontSize:12, color:"#aaa", paddingBottom:10 }}>
                  {allOpps.filter((o:any) => (filterExec==="Todos"||o.exec===filterExec) && (filterPlat==="Todas"||o.platform===filterPlat) && (filterClient==="Todos"||o.client===filterClient) && (filterMonth==="Todos"||o.month===filterMonth)).length} oportunidade(s)
                </span>
              </div>
            </div>

            {allOpps.length===0 ? (
              <div style={{ padding:"48px", textAlign:"center" as const, color:"#bbb", background:"#fff", border:"1.5px solid #e8e4d0", borderRadius:4 }}>
                <div style={{ fontSize:32, marginBottom:12 }}>⭐</div>
                <p style={{ margin:0, fontSize:14 }}>Nenhuma oportunidade registrada para esta semana.</p>
              </div>
            ) : (() => {
              const filtered = allOpps
                .filter((o:any) => (filterExec==="Todos" || o.exec===filterExec) && (filterPlat==="Todas" || o.platform===filterPlat) && (filterClient==="Todos" || o.client===filterClient) && (filterMonth==="Todos" || o.month===filterMonth))
                .sort((a:any, b:any) => parse(b.value) - parse(a.value));
              return filtered.length === 0 ? (
                <div style={{ padding:"32px", textAlign:"center" as const, color:"#bbb", background:"#fff", border:"1.5px solid #e8e4d0", borderRadius:4 }}>
                  <p style={{ margin:0, fontSize:14 }}>Nenhuma oportunidade encontrada com os filtros selecionados.</p>
                </div>
              ) : (
                <div style={{ background:"#fff", border:"2px solid #e8e4d0", borderRadius:4, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
                    <thead>
                      <tr style={{ background:"#f7f5e8", borderBottom:"2px solid #e8e4d0" }}>
                        {["Executivo","Mês","Plataforma","Cliente","Detalhamento","Valor ↓"].map((h,i) => (
                          <th key={h} style={{ ...thS, textAlign: i===5 ? ("center" as const) : ("left" as const), padding:"10px 16px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((o:any, i:number) => {
                        const c = PLATFORM_COLOR[o.platform]||{} as any;
                        return (
                          <tr key={i} style={{ background:i%2===0?"#fafaf5":"#fff", borderBottom:"1px solid #f0ede0" }}>
                            <td style={{ padding:"10px 16px", fontSize:13, fontWeight:600, color:"#333", whiteSpace:"nowrap" as const }}>{o.exec.split(" ")[0]} {o.exec.split(" ")[1]}</td>
                            <td style={{ padding:"10px 12px", fontSize:12, color:"#666", whiteSpace:"nowrap" as const }}>{o.month||"—"}</td>
                            <td style={{ padding:"10px 12px" }}>
                              <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:c.bg, color:c.text, border:`1px solid ${c.border}`, whiteSpace:"nowrap" as const }}>{o.platform}</span>
                            </td>
                            <td style={{ padding:"10px 12px", fontSize:13, color:"#333", whiteSpace:"nowrap" as const }}>{o.client||"—"}</td>
                            <td style={{ padding:"10px 12px", fontSize:13, color:"#666", maxWidth:300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{o.detail||"—"}</td>
                            <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:parse(o.value)>0?"#1a5c1a":"#bbb", textAlign:"right" as const, whiteSpace:"nowrap" as const }}>
                              {parse(o.value)>0?fmtFull(parse(o.value)):"—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

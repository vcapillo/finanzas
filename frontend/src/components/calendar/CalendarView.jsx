/**
 * FinanzasVH — components/calendar/CalendarView.jsx
 * Vista mensual de eventos financieros programados.
 */
import { fmtN } from "../../utils/format.js";
import { Metric } from "../ui/shared.jsx";

export default function CalendarView({ profile, period }) {
  const [y, m] = period.split("-").map(Number);
  const days    = new Date(y, m, 0).getDate();
  const firstDay= (new Date(y, m-1, 1).getDay() + 6) % 7;

  const PERIOD_LABEL = (p) =>
    p ? `${["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(p.split("-")[1])]} ${p.split("-")[0].slice(-2)}` : "";

  const events = {};
  const add = (day, ev) => { if (!events[day]) events[day] = []; events[day].push(ev); };

  add(profile.pay_day, { label:"💰 Sueldo MINEDU", color:"#22c55e", amount:profile.income });
  (profile.recurring_services || []).forEach(svc => {
    if (svc.day >= 1 && svc.day <= days)
      add(svc.day, { label:`🔄 ${svc.name}`, color:"#f59e0b", amount:-svc.amount, account:svc.account });
  });
  (profile.billing_cycles || []).forEach(c => {
    if (c.cutDay <= days) add(c.cutDay, { label:`✂️ Corte ${c.name}`, color:"#a78bfa" });
    if (c.dueDay <= days) add(c.dueDay, { label:`⚡ Vence ${c.name}`, color:"#ef4444" });
  });

  const todayD = new Date().getDate();
  const isNow  = period === `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const totalSvc = (profile.recurring_services || []).reduce((s, sv) => s + sv.amount, 0);
  const wdays  = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Métricas superiores */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <Metric label="Ingresos programados" value={fmtN(profile.income)}           color="#22c55e" icon="💰"/>
        <Metric label="Salidas automáticas"   value={fmtN(totalSvc)}                color="#f59e0b" icon="🔄" sub={`${(profile.recurring_services||[]).length} servicios`}/>
        <Metric label="Saldo proyectado"      value={fmtN(profile.income-totalSvc)} color={profile.income-totalSvc>0?"#22c55e":"#ef4444"} icon="📊"/>
      </div>

      {/* Calendario visual */}
      <div style={{background:"#111113",border:"1px solid #222226",borderRadius:12,padding:"18px 20px"}}>
        <p style={{color:"#888",fontSize:13,marginBottom:14,fontWeight:600}}>
          {PERIOD_LABEL(period)} — Eventos del mes
        </p>
        {/* Cabeceras días */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
          {wdays.map(d=><div key={d} style={{textAlign:"center",color:"#444",fontSize:10,fontWeight:700,padding:"4px 0"}}>{d}</div>)}
        </div>
        {/* Celdas */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`} style={{minHeight:68}}/>)}
          {Array(days).fill(null).map((_,i)=>{
            const d=i+1, evs=events[d]||[], today=isNow&&d===todayD;
            return (
              <div key={d} style={{minHeight:68,background:today?"rgba(34,197,94,0.07)":"#0a0a0c",
                border:`1px solid ${today?"rgba(34,197,94,0.25)":"#1a1a20"}`,borderRadius:6,padding:"5px 4px"}}>
                <span style={{fontSize:10,color:today?"#22c55e":"#555",display:"block",textAlign:"right",marginBottom:2}}>{d}</span>
                {evs.slice(0,3).map((ev,ei)=>(
                  <div key={ei} style={{background:`${ev.color}18`,borderLeft:`2px solid ${ev.color}`,borderRadius:"0 3px 3px 0",padding:"1px 4px",marginBottom:2}}
                    title={ev.label+(ev.amount?` (${fmtN(Math.abs(ev.amount))})`:"")}> 
                    <span style={{color:ev.color,fontSize:8,whiteSpace:"nowrap",overflow:"hidden",display:"block",textOverflow:"ellipsis"}}>{ev.label}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda del mes */}
      <div style={{background:"#111113",border:"1px solid #222226",borderRadius:12,padding:"18px 20px"}}>
        <p style={{color:"#888",fontSize:12,fontWeight:600,margin:"0 0 14px"}}>📋 Agenda del mes</p>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {Object.entries(events).sort(([a],[b])=>Number(a)-Number(b)).flatMap(([day,evs])=>evs.map((ev,i)=>(
            <div key={`${day}-${i}`} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",
              background:"#0a0a0c",border:"1px solid #1a1a20",borderLeft:`3px solid ${ev.color}`,borderRadius:7}}>
              <div style={{minWidth:36,textAlign:"center"}}>
                <div style={{color:ev.color,fontWeight:700,fontSize:15}}>{day}</div>
              </div>
              <div style={{flex:1}}>
                <p style={{color:"#e0e0e8",fontSize:13,margin:0,fontWeight:500}}>{ev.label}</p>
                {ev.account&&<p style={{color:"#444",fontSize:11,margin:0}}>{ev.account}</p>}
              </div>
              {ev.amount&&<span style={{color:ev.amount>0?"#22c55e":"#f87171",fontWeight:700,fontSize:13}}>{ev.amount>0?"+":"-"}{fmtN(Math.abs(ev.amount))}</span>}
            </div>
          )))}
        </div>
      </div>
    </div>
  );
}

let _services={},_incidents=[],_serviceMap=null,_metricsHistory=[],_charts={},_activePanel='overview',_timeRange='40polls',_uptimeData={};
const TABS={
  overview: ['System Overview','Real-time microservice monitoring with LLM fault diagnosis'],
  services: ['Services','Health status and metrics for all monitored endpoints'],
  metrics:  ['Metrics','Latency · error rate · SLA · heatmap · MTTR'],
  incidents:['Incident Log','Detected anomalies with LLM root cause analysis'],
  topology: ['Service Topology','Dependency graph and fault propagation chains'],
  llm:      ['LLM Diagnostics','Claude AI root cause analysis and recommendations'],
  report:   ['System Health Report','Automated reliability report with key findings'],
};

function switchTab(name,el){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+name)?.classList.add('active');
  _activePanel=name;
  const[title,sub]=TABS[name]||['',''];
  document.getElementById('pageTitle').textContent=title;
  document.getElementById('pageSubtitle').textContent=sub;
  if(name==='topology'){renderDepGraph();renderTopoServiceSummary();renderTopoDepMatrix();renderTopoTimeline();renderTopoRisk();}
  if(name==='services')renderServicesPage();
  if(name==='incidents')renderIncidentsPage();
  if(name==='llm')renderLLMPage();
  if(name==='report')renderReportPage();
  if(name==='metrics')renderMetrics();
}
function switchTabByName(name){
  const order=['overview','services','metrics','incidents','topology','llm','report'];
  document.querySelectorAll('.nav-item').forEach((btn,i)=>{if(order[i]===name)switchTab(name,btn);});
}
async function setTimeRange(range,btn){
  _timeRange=range;
  document.querySelectorAll('.time-range-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const url=range==='40polls'?'/api/metrics/history?limit=40':`/api/metrics/history?since_hours=${range}`;
  const hist=await fetchJSON(url);
  if(hist)_metricsHistory=hist;
  renderMetrics();
}
async function fetchJSON(url){try{const r=await fetch(url);if(!r.ok)throw new Error(r.status);return await r.json();}catch{return null;}}
async function refreshAll(){
  const icon=document.getElementById('refreshIcon');
  icon.classList.add('spin');
  try{
    const histUrl=_timeRange==='40polls'?'/api/metrics/history?limit=40':`/api/metrics/history?since_hours=${_timeRange}`;
    const[svc,inc,map,eng,hist,uptime]=await Promise.all([
      fetchJSON('/api/services'),fetchJSON('/api/incidents'),fetchJSON('/api/service-map'),
      fetchJSON('/api/diagnostic-engine/health'),fetchJSON(histUrl),fetchJSON('/api/metrics/uptime?hours=24'),
    ]);
    if(svc){_services=svc;updateSidebarStatus(true);}else updateSidebarStatus(false);
    if(inc)_incidents=inc;
    if(map)_serviceMap=map;
    if(hist)_metricsHistory=hist;
    if(uptime){_uptimeData={};for(const r of uptime)_uptimeData[r.service_name]=r;}
    const llmDot=document.getElementById('llmDot'),llmTxt=document.getElementById('llmStatusText');
    if(eng?.llm_available){llmDot.className='status-dot dot-green';llmTxt.textContent='Available';llmTxt.style.color='var(--yes)';}
    else{llmDot.className='status-dot dot-red';llmTxt.textContent='Offline';llmTxt.style.color='var(--no)';}
    renderAll();
    document.getElementById('lastUpdated').textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }finally{icon.classList.remove('spin');}
}
function updateSidebarStatus(ok){
  const dot=document.getElementById('collectorDot'),txt=document.getElementById('collectorStatusText');
  dot.className='status-dot '+(ok?'dot-green':'dot-red');
  txt.textContent=ok?'Online':'Offline';txt.style.color=ok?'var(--yes)':'var(--no)';
}
function statusClass(s){
  if(!s)return'unknown';s=s.toLowerCase();
  if(s==='healthy')return'healthy';
  if(['down','error','timeout','critical','unhealthy'].includes(s))return'down';
  if(['warning','degraded','high_latency'].includes(s))return'unhealthy';
  return'unknown';
}
function statusBadge(s){const cls=statusClass(s),map={healthy:'green',down:'red',unhealthy:'yellow',unknown:'gray'};return`<span class="badge badge-${map[cls]||'gray'}">${s||'unknown'}</span>`;}
function fmtMs(rt){if(rt==null)return'—';return Math.round(parseFloat(rt)*1000)+'ms';}
function msClass(rt){if(rt==null)return'';const ms=parseFloat(rt)*1000;return ms<100?'green':ms<500?'warn':'red';}
function fmtTime(ts){if(!ts)return'—';return new Date(ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function p95arr(arr){const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length*.95)]||0;}
function avgArr(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}

function groupIncidents(incidents){
  const map={};
  for(const inc of incidents){
    const key=`${inc.service_name}|${inc.incident_type}|${inc.severity}`;
    if(!map[key]){map[key]={...inc,count:1};}
    else{
      map[key].count++;
      if((inc.created_at||'')>(map[key].created_at||'')){
        map[key].created_at=inc.created_at;
        if(inc.diagnosis?.diagnosis_source==='claude_api'){map[key].diagnosis=inc.diagnosis;map[key].id=inc.id;}
      }
    }
  }
  return Object.values(map).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
}

function renderAll(){
  renderStats();
  renderServiceGrid('serviceGridOverview',6);
  if(_activePanel==='services')renderServicesPage();
  renderIncidentList('incidentListOverview',5);
  if(_activePanel==='incidents')renderIncidentsPage();
  updateIncidentBadge();
  if(_activePanel==='topology')renderDepGraph();
  if(_activePanel==='metrics')renderMetrics();
}

function renderStats(){
  const svcs=Object.values(_services),total=svcs.length;
  const healthy=svcs.filter(s=>statusClass(s.status)==='healthy').length;
  const grouped=groupIncidents(_incidents);
  const llmCount=grouped.filter(g=>g.diagnosis?.diagnosis_source==='claude_api').length;
  document.getElementById('statTotal').textContent=total||'—';
  document.getElementById('statHealthy').textContent=healthy||'0';
  document.getElementById('statIncidents').textContent=grouped.length;
  document.getElementById('statLLM').textContent=llmCount;
  const sub=document.getElementById('statHealthySub');
  if(total&&healthy===total)sub.textContent='All systems operational';
  else if(total)sub.textContent=`${total-healthy} service(s) degraded`;
  document.getElementById('statIncSub').textContent=`${_incidents.length} total events`;
  const badge=document.getElementById('systemBadge');if(!total)return;
  const down=svcs.filter(s=>statusClass(s.status)==='down').length;
  if(down===0&&healthy===total){badge.className='badge badge-green';badge.textContent='All Systems Operational';}
  else if(down>0){badge.className='badge badge-red';badge.textContent=`${down} Service(s) Down`;}
  else{badge.className='badge badge-yellow';badge.textContent='Degraded';}
}

function renderServiceGrid(id,limit){
  const el=document.getElementById(id);if(!el)return;
  const entries=Object.entries(_services),items=limit?entries.slice(0,limit):entries;
  if(!items.length){el.innerHTML='<div class="empty">No service data available</div>';return;}
  el.innerHTML=items.map(([name,s])=>{
    const sc=statusClass(s.status),rt=fmtMs(s.last_response_time),rtc=msClass(s.last_response_time);
    const lc=s.last_check?new Date(s.last_check).toLocaleTimeString('en-US'):'—';
    const fails=s.consecutive_failures||0;
    const uptime=_uptimeData[name];
    const uptimePct=uptime?.uptime_pct!=null?uptime.uptime_pct+'%':'—';
    const uptimeClass=uptime?.uptime_pct==null?'':uptime.uptime_pct>=99?'green':uptime.uptime_pct>=95?'warn':'red';
    const avgMs=uptime?.avg_response_ms!=null?Math.round(uptime.avg_response_ms)+'ms':'—';
    return`<div class="service-card ${sc}">
      <div class="svc-header"><div class="svc-name-row"><div class="svc-dot ${s.status||'unknown'}"></div><span class="svc-name">${name}</span></div>${statusBadge(s.status)}</div>
      <div class="svc-metrics">
        <div class="svc-metric"><div class="svc-metric-label">Response</div><div class="svc-metric-value ${rtc}">${rt}</div></div>
        <div class="svc-metric"><div class="svc-metric-label">Last Check</div><div class="svc-metric-value">${lc}</div></div>
        <div class="svc-metric"><div class="svc-metric-label">Uptime 24h</div><div class="svc-metric-value ${uptimeClass}">${uptimePct}</div></div>
        <div class="svc-metric"><div class="svc-metric-label">Avg Response</div><div class="svc-metric-value">${avgMs}</div></div>
        <div class="svc-metric"><div class="svc-metric-label">Error Rate</div><div class="svc-metric-value ${(s.error_rate||0)>10?'red':(s.error_rate||0)>5?'warn':'green'}">${s.error_rate!=null?s.error_rate+'%':'—'}</div></div>
        <div class="svc-metric"><div class="svc-metric-label">CPU</div><div class="svc-metric-value ${(s.cpu_percent||0)>80?'red':(s.cpu_percent||0)>60?'warn':'green'}">${s.cpu_percent!=null?s.cpu_percent+'%':'—'}</div></div>
        <div class="svc-metric"><div class="svc-metric-label">RAM</div><div class="svc-metric-value ${(s.ram_percent||0)>85?'red':(s.ram_percent||0)>70?'warn':'green'}">${s.ram_percent!=null?s.ram_percent+'%':'—'}</div></div>
      </div>
      ${fails>0?`<div class="svc-failures"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>${fails} consecutive failures</div>`:''}
    </div>`;
  }).join('');
}

function renderIncidentList(id,limit){
  const el=document.getElementById(id);if(!el)return;
  const all=groupIncidents(_incidents),items=limit?all.slice(0,limit):all;
  if(!items.length){el.innerHTML='<div class="empty">No incidents recorded</div>';return;}
  el.innerHTML=items.map((inc,idx)=>{
    const diag=inc.diagnosis,isLLM=diag?.diagnosis_source==='claude_api';
    const time=fmtTime(inc.created_at),conf=diag?.confidence?Math.round(diag.confidence*100)+'% confidence':'';
    let desc=inc.description||'';const ci=desc.indexOf(': {');if(ci>-1)desc=desc.substring(0,ci);
    const incType=(inc.incident_type||'').replace(/_/g,' ');
    const diagButton=!isLLM&&inc.id?`<button class="btn-diagnose" id="diagBtn-${id}-${idx}" onclick="runDiagnosis(${inc.id},'${id}',${idx},event)">🧠 Run LLM Diagnosis</button>`:'';
    return`<div class="incident ${inc.severity}" onclick="toggleDiag('${id}',${idx})">
      <div class="inc-header">
        <div class="inc-left">
          <span class="inc-service">${inc.service_name}</span>
          <span class="badge badge-${inc.severity==='critical'?'red':'yellow'}">${inc.severity}</span>
          ${isLLM?'<span class="badge badge-accent">Claude AI</span>':diag?'<span class="badge badge-gray">Heuristic</span>':''}
          ${conf?`<span style="font-size:11px;color:var(--muted)">${conf}</span>`:''}
          ${inc.count>1?`<span class="inc-count">${inc.count}×</span>`:''}
        </div>
        <span class="inc-time">${time}</span>
      </div>
      <div class="inc-type">${incType}${desc?' — '+desc.substring(0,100):''}</div>
      ${diag?renderDiag(`${id}-${idx}`,diag):'<div style="font-size:11px;color:var(--muted);margin-top:4px">No diagnosis yet</div>'}
      ${diagButton}
    </div>`;
  }).join('');
}

function renderDiag(uid,diag){
  const isLLM=diag.diagnosis_source==='claude_api',openClass=isLLM?'open':'';
  const chain=(diag.fault_chain||[]).map((n,i)=>
    (i===0?'<span class="chain-node root">'+n+'</span>':'<span class="chain-node">'+n+'</span>')+(i<(diag.fault_chain.length-1)?'<span class="chain-arrow">→</span>':'')).join('');
  const recs=(diag.recommendations||[]).slice(0,3).map(r=>{
    const pc=r.priority==='immediate'?'pri-immediate':r.priority==='short-term'?'pri-short-term':'pri-long-term';
    return'<div class="rec-item"><div class="rec-header"><div class="rec-priority '+pc+'"></div><span class="rec-action">'+(r.action||'')+'</span></div>'+(r.command?'<div class="rec-cmd">'+r.command+'</div>':'')+'</div>';
  }).join('');
  let fp='';
  if(diag.failure_prediction){
    const d=diag.failure_prediction,rc=(d.cascade_risk==='critical'||d.cascade_risk==='high')?'badge-red':'badge-yellow';
    fp='<div class="diag-row" style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:8px;padding:10px 12px;margin-top:4px">'
      +'<div class="diag-row-label" style="color:var(--no)">⚡ Failure Prediction</div>'
      +(d.next_failures?.length?'<div class="diag-row-value" style="margin-bottom:4px"><strong>Next failures:</strong> '+d.next_failures.join(', ')+'</div>':'')
      +(d.time_estimate?'<div class="diag-row-value" style="margin-bottom:4px"><strong>Time estimate:</strong> '+d.time_estimate+'</div>':'')
      +(d.prediction_reasoning?'<div class="diag-row-value" style="font-size:12px;color:var(--muted)">'+d.prediction_reasoning+'</div>':'')
      +(d.cascade_risk?'<div style="margin-top:6px"><span class="badge '+rc+'">cascade risk: '+d.cascade_risk+'</span></div>':'')+'</div>';
  }
  return'<div class="diag-panel '+openClass+'" id="diag-'+uid+'">'
    +'<div class="diag-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> '+(isLLM?'Claude AI Diagnosis':'Heuristic Diagnosis')+'</div>'
    +(diag.root_cause?'<div class="diag-row"><div class="diag-row-label">Root Cause</div><div class="diag-row-value">'+diag.root_cause+'</div></div>':'')
    +(chain?'<div class="diag-row"><div class="diag-row-label">Fault Chain</div><div class="fault-chain">'+chain+'</div></div>':'')
    +(diag.fault_chain_explanation?'<div class="diag-row"><div class="diag-row-label">Explanation</div><div class="diag-row-value" style="font-size:12px;color:var(--muted)">'+diag.fault_chain_explanation+'</div></div>':'')
    +(diag.predicted_impact?.length?'<div class="diag-row"><div class="diag-row-label">Predicted Impact</div><div class="diag-row-value">'+diag.predicted_impact.join(', ')+'</div></div>':'')
    +fp
    +(diag.prevention?'<div class="diag-row"><div class="diag-row-label">Prevention</div><div class="diag-row-value" style="font-size:12px;color:var(--muted)">'+diag.prevention+'</div></div>':'')
    +(recs?'<div class="diag-row"><div class="diag-row-label">Recommendations</div><div class="recs">'+recs+'</div></div>':'')
    +'</div>';
}
function toggleDiag(listId,idx){document.getElementById(`diag-${listId}-${idx}`)?.classList.toggle('open');}

function updateIncidentBadge(){
  const grouped=groupIncidents(_incidents),crit=grouped.filter(g=>g.severity==='critical').length;
  const badge=document.getElementById('navIncBadge'),cb=document.getElementById('incidentCountBadge');
  if(crit>0){badge.textContent=crit;badge.style.display='';}else badge.style.display='none';
  if(cb){cb.textContent=`${grouped.length} unique · ${_incidents.length} total`;cb.className=crit>0?'badge badge-red':'badge badge-gray';}
}

async function runDiagnosis(incidentId,listId,idx,event){
  event.stopPropagation();
  const btn=document.getElementById(`diagBtn-${listId}-${idx}`);if(!btn)return;
  btn.textContent='⏳ Analyzing...';btn.disabled=true;btn.classList.add('loading');
  try{
    const resp=await fetch(`/api/incidents/${incidentId}/diagnose`,{method:'POST'});
    if(!resp.ok)throw new Error('Engine error: '+resp.status);
    const inc=await fetchJSON('/api/incidents');if(inc)_incidents=inc;
    renderAll();
    setTimeout(()=>{const p=document.getElementById(`diag-${listId}-${idx}`);if(p){p.classList.add('open');p.scrollIntoView({behavior:'smooth',block:'nearest'});}},150);
  }catch(e){
    btn.textContent='❌ Failed — retry';btn.disabled=false;btn.classList.remove('loading');
    btn.style.color='var(--no)';btn.style.borderColor='rgba(239,68,68,0.3)';
    setTimeout(()=>{btn.textContent='🧠 Run LLM Diagnosis';btn.style.color='';btn.style.borderColor='';},4000);
  }
}


let _svcFilter='all';
let _incFilter='all';

function filterServices(filter, btn){
  _svcFilter=filter;
  document.querySelectorAll('#svcFilterBtns button').forEach(b=>{
    b.style.background='transparent';b.style.color='var(--muted)';b.style.borderColor='var(--border)';
  });
  btn.style.background='var(--accent)';btn.style.color='#fff';btn.style.borderColor='var(--accent)';
  renderServicesPage();
}

function filterIncidents(filter, btn){
  _incFilter=filter;
  document.querySelectorAll('#incFilterBtns button').forEach(b=>{
    b.style.background='transparent';b.style.color='var(--muted)';b.style.borderColor='var(--border)';
  });
  btn.style.background='var(--accent)';btn.style.color='#fff';btn.style.borderColor='var(--accent)';
  renderIncidentsPage();
}


function renderLLMPage(){
  // Update LLM status dot
  const dot2=document.getElementById('llmDot2');
  const txt2=document.getElementById('llmStatusText2');

  const grouped=groupIncidents(_incidents);
  const llmDiags=grouped.filter(g=>g.diagnosis?.diagnosis_source==='claude_api');
  const heuristic=grouped.filter(g=>g.diagnosis&&g.diagnosis.diagnosis_source!=='claude_api');
  const noDiag=grouped.filter(g=>!g.diagnosis);
  const avgConf=llmDiags.length?Math.round(llmDiags.reduce((a,g)=>a+(g.diagnosis.confidence||0),0)/llmDiags.length*100):0;

  // Summary cards
  const cards=document.getElementById('llmSummaryCards');
  if(cards){
    const mk=(label,val,color,sub)=>`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-left:2px solid ${color};border-radius:0 10px 10px 0;padding:12px 14px">
      <div style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">${label}</div>
      <div style="font-size:22px;font-weight:700;font-family:monospace;color:${color};line-height:1">${val}</div>
      ${sub?`<div style="font-size:10px;color:#52525b;margin-top:3px">${sub}</div>`:''}
    </div>`;
    cards.innerHTML=
      mk('Claude AI analyses',llmDiags.length,'#818cf8',`of ${grouped.length} incidents`)+
      mk('Avg confidence',avgConf+'%',avgConf>=70?'#22c55e':avgConf>=40?'#eab308':'#ef4444','diagnosis accuracy')+
      mk('Heuristic only',heuristic.length,'#71717a','rule-based detection')+
      mk('Awaiting diagnosis',noDiag.length,noDiag.length>0?'#f97316':'#22c55e','no analysis yet');
  }

  // Confidence bars
  const confEl=document.getElementById('llmConfidence');
  if(confEl){
    if(!llmDiags.length){confEl.innerHTML='<div class="empty">No LLM diagnoses yet — enable LLM engine and run diagnosis</div>';return;}
    const bins=[0,0,0,0,0]; // 0-20, 20-40, 40-60, 60-80, 80-100
    llmDiags.forEach(g=>{const c=(g.diagnosis.confidence||0)*100;bins[Math.min(4,Math.floor(c/20))]++;});
    const max=Math.max(...bins,1);
    const labels=['0–20%','20–40%','40–60%','60–80%','80–100%'];
    const colors=['#ef4444','#f97316','#eab308','#6366f1','#22c55e'];
    confEl.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px">
      <div style="display:flex;gap:6px;align-items:flex-end;height:80px">
        ${bins.map((v,i)=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="font-size:10px;color:#71717a">${v}</div>
          <div style="width:100%;background:${colors[i]};opacity:0.8;border-radius:3px 3px 0 0;height:${Math.round(v/max*60)+4}px"></div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        ${labels.map((l,i)=>`<div style="flex:1;text-align:center;font-size:9px;color:#52525b">${l}</div>`).join('')}
      </div>
    </div>`;
  }

  // Diagnosis list
  const listEl=document.getElementById('llmDiagList');
  if(!listEl)return;
  if(!llmDiags.length){listEl.innerHTML='<div class="empty">No Claude AI diagnoses yet.<br><br>Enable LLM engine: uncomment ANTHROPIC_API_KEY in ~/.env on GCP node-03, then restart diagnostic-engine.</div>';return;}
  listEl.innerHTML=llmDiags.map((inc,idx)=>{
    const diag=inc.diagnosis;
    const conf=Math.round((diag.confidence||0)*100);
    const confColor=conf>=70?'#22c55e':conf>=40?'#eab308':'#ef4444';
    const time=fmtTime(inc.created_at);
    const chain=(diag.fault_chain||[]).map((n,i)=>
      (i===0?'<span class="chain-node root">'+n+'</span>':'<span class="chain-node">'+n+'</span>')+(i<(diag.fault_chain.length-1)?'<span class="chain-arrow">→</span>':'')).join('');
    const recs=(diag.recommendations||[]).slice(0,3).map(r=>{
      const pc=r.priority==='immediate'?'pri-immediate':r.priority==='short-term'?'pri-short-term':'pri-long-term';
      return'<div class="rec-item"><div class="rec-header"><div class="rec-priority '+pc+'"></div><span class="rec-action">'+(r.action||'')+'</span></div>'+(r.command?'<div class="rec-cmd">'+r.command+'</div>':'')+'</div>';
    }).join('');
    return`<div class="incident critical" onclick="this.querySelector('.diag-panel').classList.toggle('open')" style="cursor:pointer">
      <div class="inc-header">
        <div class="inc-left">
          <span class="inc-service">${inc.service_name}</span>
          <span class="badge badge-accent">Claude AI</span>
          <span class="badge badge-${inc.severity==='critical'?'red':'yellow'}">${inc.severity}</span>
          <span style="font-size:11px;font-weight:700;font-family:monospace;color:${confColor}">${conf}% confidence</span>
          ${inc.count>1?`<span class="inc-count">${inc.count}×</span>`:''}
        </div>
        <span class="inc-time">${time}</span>
      </div>
      <div class="inc-type" style="color:#a1a1aa;margin-bottom:6px">${diag.root_cause||'—'}</div>
      <div class="diag-panel open" id="llm-diag-${idx}">
        ${chain?`<div class="diag-row"><div class="diag-row-label">Fault Chain</div><div class="fault-chain">${chain}</div></div>`:''}
        ${diag.fault_chain_explanation?`<div class="diag-row"><div class="diag-row-label">Explanation</div><div class="diag-row-value" style="font-size:12px;color:var(--muted)">${diag.fault_chain_explanation}</div></div>`:''}
        ${diag.predicted_impact?.length?`<div class="diag-row"><div class="diag-row-label">Predicted Impact</div><div class="diag-row-value">${diag.predicted_impact.join(', ')}</div></div>`:''}
        ${diag.prevention?`<div class="diag-row"><div class="diag-row-label">Prevention</div><div class="diag-row-value" style="font-size:12px;color:var(--muted)">${diag.prevention}</div></div>`:''}
        ${recs?`<div class="diag-row"><div class="diag-row-label">Recommendations</div><div class="recs">${recs}</div></div>`:''}
      </div>
    </div>`;
  }).join('');
}

function renderReportPage(){
  const ts=document.getElementById('reportTimestamp');
  if(ts)ts.textContent='Generated '+new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

  const svcs=Object.values(_services);
  const total=svcs.length||1;
  const healthy=svcs.filter(s=>statusClass(s.status)==='healthy').length;
  const score=Math.round((healthy/total)*100);
  const scoreColor=score>=95?'#22c55e':score>=80?'#6366f1':score>=50?'#eab308':'#ef4444';
  const scoreLabel=score>=95?'All systems operational':score>=80?'Minor degradation':score>=50?'Partial outage':'Critical failure';

  // Overall
  const overallEl=document.getElementById('reportOverall');
  if(overallEl){
    overallEl.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;display:flex;align-items:center;gap:24px">
      <div style="text-align:center;flex-shrink:0">
        <div style="font-size:56px;font-weight:700;font-family:monospace;color:${scoreColor};line-height:1">${score}</div>
        <div style="font-size:11px;color:${scoreColor};font-weight:600;margin-top:4px">Health Score</div>
      </div>
      <div style="flex:1;border-left:1px solid rgba(255,255,255,0.07);padding-left:24px">
        <div style="font-size:16px;font-weight:600;color:#f4f4f5;margin-bottom:6px">${scoreLabel}</div>
        <div style="font-size:12px;color:#71717a;margin-bottom:12px">${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
        <div style="display:flex;gap:20px">
          <div><div style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Services</div><div style="font-size:18px;font-weight:700;font-family:monospace;color:#f4f4f5">${total}</div></div>
          <div><div style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Healthy</div><div style="font-size:18px;font-weight:700;font-family:monospace;color:#22c55e">${healthy}</div></div>
          <div><div style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">Incidents</div><div style="font-size:18px;font-weight:700;font-family:monospace;color:#ef4444">${groupIncidents(_incidents).length}</div></div>
          <div><div style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px">LLM Diagnoses</div><div style="font-size:18px;font-weight:700;font-family:monospace;color:#818cf8">${groupIncidents(_incidents).filter(g=>g.diagnosis?.diagnosis_source==='claude_api').length}</div></div>
        </div>
      </div>
    </div>`;
  }

  // Per-service
  const svcEl=document.getElementById('reportServices');
  if(svcEl){
    const names=Object.keys(_services);
    svcEl.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.07)">
          <th style="padding:10px 14px;text-align:left;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Service</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Status</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Uptime 24h</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Avg Response</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Incidents</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">MTTR</th>
          <th style="padding:10px 14px;text-align:left;font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Assessment</th>
        </tr></thead>
        <tbody>
        ${names.map(name=>{
          const s=_services[name];
          const sc=statusClass(s.status);
          const u=_uptimeData[name];
          const pct=u?.uptime_pct!=null?parseFloat(u.uptime_pct):null;
          const pctColor=pct==null?'#71717a':pct>=99?'#22c55e':pct>=95?'#6366f1':pct>=50?'#eab308':'#ef4444';
          const dotColor=sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':'#eab308';
          const avgMs=u?.avg_response_ms!=null?Math.round(u.avg_response_ms)+'ms':'—';
          const incCount=_incidents.filter(i=>i.service_name===name).length;
          const resolved=_incidents.filter(i=>i.service_name===name&&i.resolved_at&&i.created_at);
          const mttr=resolved.length?Math.round(resolved.map(i=>(new Date(i.resolved_at)-new Date(i.created_at))/60000).reduce((a,b)=>a+b,0)/resolved.length)+'min':'—';
          const assessment=pct==null?'No data':pct>=99?'Excellent — SLA met':pct>=95?'Good — minor issues':pct>=80?'Degraded — needs attention':'Critical — SLA breach';
          const assessColor=pct==null?'#52525b':pct>=99?'#22c55e':pct>=95?'#6366f1':pct>=80?'#eab308':'#ef4444';
          return`<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <td style="padding:10px 14px"><div style="display:flex;align-items:center;gap:6px"><div style="width:6px;height:6px;border-radius:50%;background:${dotColor}"></div><span style="font-family:monospace;font-weight:600">${name}</span></div></td>
            <td style="padding:10px 14px;text-align:center"><span style="font-size:11px;font-weight:600;color:${dotColor}">${s.status||'unknown'}</span></td>
            <td style="padding:10px 14px;text-align:center;font-family:monospace;font-weight:600;color:${pctColor}">${pct!=null?pct.toFixed(1)+'%':'—'}</td>
            <td style="padding:10px 14px;text-align:center;font-family:monospace;color:#a1a1aa">${avgMs}</td>
            <td style="padding:10px 14px;text-align:center;font-family:monospace;color:${incCount>0?'#ef4444':'#22c55e'}">${incCount}</td>
            <td style="padding:10px 14px;text-align:center;font-family:monospace;color:#a1a1aa">${mttr}</td>
            <td style="padding:10px 14px;font-size:11px;color:${assessColor}">${assessment}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // Key findings
  const findEl=document.getElementById('reportFindings');
  if(findEl){
    const findings=[];
    const names=Object.keys(_services);
    names.forEach(name=>{
      const u=_uptimeData[name];
      const pct=u?.uptime_pct!=null?parseFloat(u.uptime_pct):null;
      const incCount=_incidents.filter(i=>i.service_name===name).length;
      if(pct!=null&&pct<95) findings.push({type:'critical',text:`${name} uptime ${pct.toFixed(1)}% — below 95% SLA threshold`,icon:'⚠'});
      if(incCount>10) findings.push({type:'warning',text:`${name} has ${incCount} incidents — investigate root cause`,icon:'📋'});
    });
    const grouped=groupIncidents(_incidents);
    const noLLM=grouped.filter(g=>!g.diagnosis);
    if(noLLM.length>0) findings.push({type:'info',text:`${noLLM.length} incidents without LLM diagnosis — enable Claude AI engine for deeper analysis`,icon:'🧠'});
    const llmDiags=grouped.filter(g=>g.diagnosis?.diagnosis_source==='claude_api');
    if(llmDiags.length>0){
      const avg=Math.round(llmDiags.reduce((a,g)=>a+(g.diagnosis.confidence||0),0)/llmDiags.length*100);
      findings.push({type:'success',text:`LLM engine achieved ${avg}% average confidence across ${llmDiags.length} diagnoses`,icon:'✅'});
    }
    if(!findings.length) findings.push({type:'success',text:'All systems operating within normal parameters',icon:'✅'});

    findEl.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px">
      ${findings.map(f=>{
        const color=f.type==='critical'?'#ef4444':f.type==='warning'?'#eab308':f.type==='info'?'#6366f1':'#22c55e';
        return`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-left:2px solid ${color};border-radius:0 10px 10px 0;padding:10px 14px;display:flex;align-items:center;gap:10px">
          <span style="font-size:14px">${f.icon}</span>
          <span style="font-size:12px;color:#a1a1aa">${f.text}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  // LLM effectiveness
  const llmEl=document.getElementById('reportLLM');
  if(llmEl){
    const grouped=groupIncidents(_incidents);
    const total=grouped.length||1;
    const withLLM=grouped.filter(g=>g.diagnosis?.diagnosis_source==='claude_api').length;
    const heuristic=grouped.filter(g=>g.diagnosis&&g.diagnosis.diagnosis_source!=='claude_api').length;
    const none=grouped.filter(g=>!g.diagnosis).length;
    const llmPct=Math.round(withLLM/total*100);
    llmEl.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 20px">
      <div style="display:flex;gap:16px;margin-bottom:14px">
        <div style="flex:1;text-align:center">
          <div style="font-size:28px;font-weight:700;font-family:monospace;color:#818cf8">${withLLM}</div>
          <div style="font-size:10px;color:#52525b;margin-top:2px">Claude AI diagnoses</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="font-size:28px;font-weight:700;font-family:monospace;color:#71717a">${heuristic}</div>
          <div style="font-size:10px;color:#52525b;margin-top:2px">Heuristic diagnoses</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="font-size:28px;font-weight:700;font-family:monospace;color:#f97316">${none}</div>
          <div style="font-size:10px;color:#52525b;margin-top:2px">Undiagnosed</div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden;display:flex">
        <div style="height:100%;width:${llmPct}%;background:#818cf8"></div>
        <div style="height:100%;width:${Math.round(heuristic/total*100)}%;background:#52525b"></div>
        <div style="height:100%;flex:1;background:#27272a"></div>
      </div>
      <div style="display:flex;gap:14px;margin-top:8px">
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#71717a"><div style="width:8px;height:8px;border-radius:1px;background:#818cf8"></div>Claude AI ${llmPct}%</div>
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#71717a"><div style="width:8px;height:8px;border-radius:1px;background:#52525b"></div>Heuristic ${Math.round(heuristic/total*100)}%</div>
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#71717a"><div style="width:8px;height:8px;border-radius:1px;background:#27272a;border:1px solid #3f3f46"></div>None ${Math.round(none/total*100)}%</div>
      </div>
    </div>`;
  }
}

function renderServicesPage(){
  // Filtered service grid
  const el=document.getElementById('serviceGridFull');
  if(!el)return;
  let entries=Object.entries(_services);
  if(_svcFilter==='down') entries=entries.filter(([,s])=>statusClass(s.status)==='down');
  else if(_svcFilter==='warning') entries=entries.filter(([,s])=>statusClass(s.status)==='unhealthy');
  if(!entries.length){el.innerHTML='<div class="empty">No services match filter</div>';}
  else{
    el.innerHTML=entries.map(([name,s])=>{
      const sc=statusClass(s.status),rt=fmtMs(s.last_response_time),rtc=msClass(s.last_response_time);
      const lc=s.last_check?new Date(s.last_check).toLocaleTimeString('en-US'):'—';
      const fails=s.consecutive_failures||0;
      const uptime=_uptimeData[name];
      const uptimePct=uptime?.uptime_pct!=null?uptime.uptime_pct+'%':'—';
      const uptimeClass=uptime?.uptime_pct==null?'':uptime.uptime_pct>=99?'green':uptime.uptime_pct>=95?'warn':'red';
      const avgMs=uptime?.avg_response_ms!=null?Math.round(uptime.avg_response_ms)+'ms':'—';
      return`<div class="service-card ${sc}">
        <div class="svc-header"><div class="svc-name-row"><div class="svc-dot ${s.status||'unknown'}"></div><span class="svc-name">${name}</span></div>${statusBadge(s.status)}</div>
        <div class="svc-metrics">
           <div class="svc-metric"><div class="svc-metric-label">Response</div><div class="svc-metric-value ${rtc}">${rt}</div></div>
           <div class="svc-metric"><div class="svc-metric-label">Last Check</div><div class="svc-metric-value">${lc}</div></div>
           <div class="svc-metric"><div class="svc-metric-label">Uptime 24h</div><div class="svc-metric-value ${uptimeClass}">${uptimePct}</div></div>
           <div class="svc-metric"><div class="svc-metric-label">Avg Response</div><div class="svc-metric-value">${avgMs}</div></div>
           <div class="svc-metric"><div class="svc-metric-label">Error Rate</div><div class="svc-metric-value ${(s.error_rate||0)>10?'red':(s.error_rate||0)>5?'warn':'green'}">${s.error_rate!=null?s.error_rate+'%':'—'}</div></div>
           <div class="svc-metric"><div class="svc-metric-label">CPU</div><div class="svc-metric-value ${(s.cpu_percent||0)>80?'red':(s.cpu_percent||0)>60?'warn':'green'}">${s.cpu_percent!=null?s.cpu_percent+'%':'—'}</div></div>
           <div class="svc-metric"><div class="svc-metric-label">RAM</div><div class="svc-metric-value ${(s.ram_percent||0)>85?'red':(s.ram_percent||0)>70?'warn':'green'}">${s.ram_percent!=null?s.ram_percent+'%':'—'}</div></div>
      </div>
        ${fails>0?`<div class="svc-failures"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>${fails} consecutive failures</div>`:''}
      </div>`;
    }).join('');
  }

  // Health score
  const scoreEl=document.getElementById('svcHealthScore');
  if(scoreEl){
    const svcs=Object.values(_services);
    const total=svcs.length||1;
    const healthy=svcs.filter(s=>statusClass(s.status)==='healthy').length;
    const warn=svcs.filter(s=>statusClass(s.status)==='unhealthy').length;
    const down=svcs.filter(s=>statusClass(s.status)==='down').length;
    const score=Math.round(((healthy*100+warn*50)/total));
    const scoreColor=score>=95?'#22c55e':score>=80?'#6366f1':score>=50?'#eab308':'#ef4444';
    const scoreLabel=score>=95?'Excellent':score>=80?'Good':score>=50?'Degraded':'Critical';
    scoreEl.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 20px">
      <div style="display:flex;align-items:center;gap:20px">
        <div style="text-align:center;flex-shrink:0">
          <div style="font-size:42px;font-weight:700;font-family:monospace;color:${scoreColor};line-height:1">${score}</div>
          <div style="font-size:11px;font-weight:600;color:${scoreColor};margin-top:2px">${scoreLabel}</div>
        </div>
        <div style="flex:1">
          <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:10px;overflow:hidden;margin-bottom:10px">
            <div style="height:100%;width:${score}%;background:${scoreColor};border-radius:6px;transition:width .5s"></div>
          </div>
          <div style="display:flex;gap:16px">
            <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:#22c55e"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e"></div>${healthy} healthy</div>
            ${warn?`<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:#eab308"><div style="width:8px;height:8px;border-radius:50%;background:#eab308"></div>${warn} warning</div>`:''}
            ${down?`<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:#ef4444"><div style="width:8px;height:8px;border-radius:50%;background:#ef4444"></div>${down} down</div>`:''}
          </div>
        </div>
      </div>
    </div>`;
  }

  // Poll history mini heatmap
  const pollEl=document.getElementById('svcPollHistory');
  if(!pollEl)return;
  const byService={};
  for(const row of _metricsHistory){
    if(!byService[row.service_name])byService[row.service_name]=[];
    byService[row.service_name].push(row);
  }
  pollEl.innerHTML=Object.keys(_services).map(name=>{
    const rows=[...( byService[name]||[])].sort((a,b)=>(a.collected_at||'').localeCompare(b.collected_at||'')).slice(-40);
    const sc=statusClass(_services[name]?.status);
    const dotColor=sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':'#eab308';
    const squares=rows.map(row=>{
      const rt=row.response_time!=null?parseFloat(row.response_time)*1000:null;
      const s=statusClass(row.status);
      let bg=s==='down'?'#ef4444':s==='unhealthy'||(rt&&rt>100)?'#eab308':'#22c55e';
      if(rt===null)bg='#27272a';
      return`<div style="width:14px;height:14px;border-radius:2px;background:${bg};flex-shrink:0" title="${row.collected_at?new Date(row.collected_at).toLocaleTimeString():'?'}: ${rt!=null?Math.round(rt)+'ms':'down'}"></div>`;
    }).join('');
    const u=_uptimeData[name];
    const uptime=u?.uptime_pct!=null?parseFloat(u.uptime_pct).toFixed(1)+'%':'—';
    return`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:12px">
      <div style="display:flex;align-items:center;gap:6px;width:160px;flex-shrink:0">
        <div style="width:6px;height:6px;border-radius:50%;background:${dotColor}"></div>
        <span style="font-size:11px;font-weight:600;color:#f4f4f5">${name}</span>
      </div>
      <div style="display:flex;gap:2px;flex:1">${squares||'<span style="font-size:11px;color:#52525b">No data</span>'}</div>
      <div style="font-size:11px;font-family:monospace;color:${u?.uptime_pct>=99?'#22c55e':u?.uptime_pct>=95?'#6366f1':'#eab308'};width:50px;text-align:right;flex-shrink:0">${uptime}</div>
    </div>`;
  }).join('');
}

function renderIncidentsPage(){
  // Summary cards
  const cardsEl=document.getElementById('incidentSummaryCards');
  if(cardsEl){
    const grouped=groupIncidents(_incidents);
    const critical=grouped.filter(g=>g.severity==='critical').length;
    const warning=grouped.filter(g=>g.severity==='warning').length;
    const withLLM=grouped.filter(g=>g.diagnosis?.diagnosis_source==='claude_api').length;
    const resolved=_incidents.filter(i=>i.resolved_at).length;
    const unresolved=_incidents.filter(i=>!i.resolved_at).length;
    const mkCard=(label,val,color)=>`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-left:2px solid ${color};border-radius:0 10px 10px 0;padding:12px 14px">
      <div style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">${label}</div>
      <div style="font-size:22px;font-weight:700;font-family:monospace;color:${color};line-height:1">${val}</div>
    </div>`;
    cardsEl.innerHTML=
      mkCard('Critical',critical,'#ef4444')+
      mkCard('Warning',warning,'#eab308')+
      mkCard('Claude AI',withLLM,'#818cf8')+
      mkCard('Unresolved',unresolved,'#f97316');
  }

  // Cascade detection
  const bannerEl=document.getElementById('cascadeBanner');
  if(bannerEl){
    const now=Date.now();
    const recent=_incidents.filter(i=>{
      const t=new Date(i.created_at).getTime();
      return now-t<10*60*1000 && !i.resolved_at;
    });
    const affectedServices=new Set(recent.map(i=>i.service_name));
    if(affectedServices.size>=2){
      bannerEl.style.display='block';
      bannerEl.innerHTML=`<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <div>
          <span style="font-size:12px;font-weight:700;color:#ef4444">Cascade detected</span>
          <span style="font-size:12px;color:#a1a1aa;margin-left:8px">${affectedServices.size} services with active incidents in last 10 min: ${[...affectedServices].join(', ')}</span>
        </div>
      </div>`;
    } else {
      bannerEl.style.display='none';
    }
  }

  // Filtered incident list
  const el=document.getElementById('incidentListFull');
  if(!el)return;
  let all=groupIncidents(_incidents);
  if(_incFilter==='critical') all=all.filter(g=>g.severity==='critical');
  else if(_incFilter==='warning') all=all.filter(g=>g.severity==='warning');
  else if(_incFilter==='unresolved') all=all.filter(g=>!g.resolved_at);
  else if(_incFilter==='llm') all=all.filter(g=>g.diagnosis?.diagnosis_source==='claude_api');
  if(!all.length){el.innerHTML='<div class="empty">No incidents match filter</div>';return;}
  el.innerHTML=all.map((inc,idx)=>{
    const diag=inc.diagnosis,isLLM=diag?.diagnosis_source==='claude_api';
    const time=fmtTime(inc.created_at),conf=diag?.confidence?Math.round(diag.confidence*100)+'% confidence':'';
    let desc=inc.description||'';const ci=desc.indexOf(': {');if(ci>-1)desc=desc.substring(0,ci);
    const incType=(inc.incident_type||'').replace(/_/g,' ');
    const isResolved=!!inc.resolved_at;
    const mttr=isResolved?Math.round((new Date(inc.resolved_at)-new Date(inc.created_at))/60000):null;
    const diagButton=!isLLM&&inc.id?`<button class="btn-diagnose" id="diagBtn-incidentListFull-${idx}" onclick="runDiagnosis(${inc.id},'incidentListFull',${idx},event)">🧠 Run LLM Diagnosis</button>`:'';
    return`<div class="incident ${inc.severity}" onclick="toggleDiag('incidentListFull',${idx})">
      <div class="inc-header">
        <div class="inc-left">
          <span class="inc-service">${inc.service_name}</span>
          <span class="badge badge-${inc.severity==='critical'?'red':'yellow'}">${inc.severity}</span>
          ${isLLM?'<span class="badge badge-accent">Claude AI</span>':diag?'<span class="badge badge-gray">Heuristic</span>':''}
          ${conf?`<span style="font-size:11px;color:var(--muted)">${conf}</span>`:''}
          ${inc.count>1?`<span class="inc-count">${inc.count}×</span>`:''}
          ${isResolved?`<span style="font-size:10px;background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2);border-radius:4px;padding:1px 7px;font-weight:600">✓ resolved${mttr?` · ${mttr}min`:''}</span>`:'<span style="font-size:10px;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);border-radius:4px;padding:1px 7px;font-weight:600">● active</span>'}
        </div>
        <span class="inc-time">${time}</span>
      </div>
      <div class="inc-type">${incType}${desc?' — '+desc.substring(0,100):''}</div>
      ${diag?renderDiag(`incidentListFull-${idx}`,diag):'<div style="font-size:11px;color:var(--muted);margin-top:4px">No diagnosis yet</div>'}
      ${diagButton}
    </div>`;
  }).join('');
}

function renderMetrics(){
  const byService={};
  for(const row of _metricsHistory){if(!byService[row.service_name])byService[row.service_name]=[];byService[row.service_name].push(row);}
  for(const name of Object.keys(_services)){if(!byService[name])byService[name]=[];}

  const allMs=Object.values(byService).flat().filter(r=>r.response_time!=null).map(r=>Math.round(parseFloat(r.response_time)*1000));
  const allSt=Object.values(byService).flat();
  const errCount=allSt.filter(r=>statusClass(r.status)==='down').length;
  const errPct=allSt.length?((errCount/allSt.length)*100).toFixed(1):'0.0';
  const p95=allMs.length?Math.round(p95arr(allMs)):0;
  const avgMs=allMs.length?Math.round(avgArr(allMs)):0;
  const healthyNow=Object.values(_services).filter(s=>statusClass(s.status)==='healthy').length;
  const totalSvc=Object.keys(_services).length;

  document.getElementById('gs-p95').textContent=p95?p95+'ms':'—';
  document.getElementById('gs-avg-sub').textContent=avgMs?`avg ${avgMs}ms across services`:'—';
  document.getElementById('gs-err').textContent=errPct+'%';
  document.getElementById('gs-err-sub').textContent=`${errCount} failed of ${allSt.length} checks`;
  document.getElementById('gs-healthy').textContent=`${healthyNow}/${totalSvc}`;
  document.getElementById('gs-healthy-sub').textContent=healthyNow===totalSvc?'all services up':`${totalSvc-healthyNow} degraded`;

  const grid=document.getElementById('metricsGrid');
  if(!grid)return;
  if(!Object.keys(byService).length){grid.innerHTML='<div class="empty">No metric data yet</div>';return;}

  grid.innerHTML=Object.keys(byService).map(name=>{
    const sc=statusClass(_services[name]?.status);
    const dotColor=sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':'#eab308';
    const uid=name.replace(/[^a-z0-9]/gi,'_');
    return`<div class="mcrd">
      <div class="mcrd-hdr">
        <div class="mcrd-name"><div style="width:7px;height:7px;border-radius:50%;background:${dotColor}"></div>${name}</div>
        <span class="mcrd-cur" id="mcur-${uid}">—</span>
      </div>
      <div class="mcrd-stats">
        <div class="mstat"><div class="mstat-l">P50 avg</div><div class="mstat-v" id="mp50-${uid}">—</div></div>
        <div class="mstat"><div class="mstat-l">P95</div><div class="mstat-v" style="color:#818cf8" id="mp95-${uid}">—</div></div>
        <div class="mstat"><div class="mstat-l">Max</div><div class="mstat-v" id="mmax-${uid}">—</div></div>
      </div>
      <div class="mcrd-wrap"><canvas id="mc-${uid}" role="img" aria-label="${name} response time">${name} latency.</canvas></div>
      <div class="mcrd-inc" id="minc-${uid}"></div>
    </div>`;
  }).join('');

  Chart.defaults.color='#71717a';
  for(const[name,rows]of Object.entries(byService)){
    const sc=statusClass(_services[name]?.status);
    const uid=name.replace(/[^a-z0-9]/gi,'_');
    const canvas=document.getElementById('mc-'+uid);if(!canvas)continue;
    if(_charts[uid]){_charts[uid].destroy();delete _charts[uid];}

    const sorted=[...rows].sort((a,b)=>(a.collected_at||'').localeCompare(b.collected_at||''));
    const labels=sorted.map(r=>new Date(r.collected_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
    const data=sorted.map(r=>r.response_time!=null?Math.round(parseFloat(r.response_time)*1000):null);
    const statuses=sorted.map(r=>statusClass(r.status));
    const valid=data.filter(d=>d!=null);
    const latest=valid.length?valid.at(-1):null;
    const p50=valid.length?Math.round(avgArr(valid)):0;
    const p95v=valid.length?Math.round(p95arr(valid)):0;
    const maxV=valid.length?Math.round(Math.max(...valid)):0;

    const curEl=document.getElementById('mcur-'+uid);
    if(curEl){
      if(latest!=null){curEl.textContent=latest+'ms';curEl.style.color=latest<100?'#22c55e':latest>500?'#ef4444':'#eab308';}
      else{curEl.textContent='down';curEl.style.color='#ef4444';}
    }
    const p50El=document.getElementById('mp50-'+uid);if(p50El)p50El.textContent=valid.length?p50+'ms':'—';
    const p95El=document.getElementById('mp95-'+uid);if(p95El)p95El.textContent=valid.length?p95v+'ms':'—';
    const maxEl=document.getElementById('mmax-'+uid);if(maxEl){maxEl.textContent=valid.length?maxV+'ms':'—';maxEl.style.color=maxV>500?'#ef4444':maxV>100?'#eab308':'#a1a1aa';}

    const chartStart=sorted.length?new Date(sorted[0].collected_at).getTime():0;
    const chartEnd=sorted.length?new Date(sorted[sorted.length-1].collected_at).getTime():0;
    const svcInc=_incidents.filter(inc=>{
      if(inc.service_name!==name||!inc.created_at)return false;
      const t=new Date(inc.created_at).getTime();
      return t>=chartStart-60000&&t<=chartEnd+60000;
    });

    const incDiv=document.getElementById('minc-'+uid);
    if(incDiv&&svcInc.length){
      incDiv.innerHTML='<span style="font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:.4px">anomalies</span>'
        +svcInc.slice(0,5).map(inc=>`<span class="inc-pill">${new Date(inc.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>`).join('');
    }

    const annPlugin={
      id:'ann_'+uid,
      afterDraw(chart){
        if(!svcInc.length)return;
        const ctx=chart.ctx,xAxis=chart.scales.x,yAxis=chart.scales.y;if(!xAxis||!yAxis)return;
        const seen=new Set();
        svcInc.forEach(inc=>{
          const incTime=new Date(inc.created_at).getTime();
          let closest=-1,minDiff=Infinity;
          sorted.forEach((row,i)=>{const d=Math.abs(new Date(row.collected_at).getTime()-incTime);if(d<minDiff){minDiff=d;closest=i;}});
          if(closest===-1||minDiff>120000||seen.has(closest))return;
          seen.add(closest);
          const x=xAxis.getPixelForIndex(closest);
          if(x<xAxis.left||x>xAxis.right)return;
          ctx.save();
          ctx.beginPath();ctx.moveTo(x,yAxis.top);ctx.lineTo(x,yAxis.bottom);
          ctx.strokeStyle='rgba(239,68,68,0.55)';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle='rgba(239,68,68,0.85)';ctx.font='10px Inter';ctx.textAlign='center';ctx.textBaseline='top';
          ctx.fillText('⚠',x,yAxis.top+2);ctx.restore();
        });
      }
    };

    // Always render chart, even if all data is null (service was down)
    const svcColor=sc==='down'?'#ef4444':sc==='unhealthy'?'#eab308':'#6366f1';
    const ptColors=statuses.map(s=>s==='healthy'?'#22c55e':s==='down'?'#ef4444':'#eab308');

    _charts[uid]=new Chart(canvas.getContext('2d'),{
      type:'line',
      data:{labels,datasets:[{label:'ms',data,borderColor:svcColor,backgroundColor:svcColor+'10',borderWidth:1.5,pointBackgroundColor:ptColors,pointBorderColor:ptColors,pointRadius:2,pointHoverRadius:4,tension:.35,fill:true,spanGaps:true}]},
      options:{
        responsive:true,maintainAspectRatio:false,animation:{duration:250},
        plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c1f',borderColor:'#27272a',borderWidth:1,titleColor:'#f4f4f5',bodyColor:'#a1a1aa',callbacks:{label:item=>item.raw!=null?item.raw+' ms':'down'}}},
        scales:{
          x:{ticks:{font:{family:'JetBrains Mono',size:9},maxRotation:0,maxTicksLimit:4},grid:{color:'rgba(255,255,255,0.03)'},border:{color:'#27272a'}},
          y:{beginAtZero:true,ticks:{font:{family:'JetBrains Mono',size:9},callback:v=>v+'ms'},grid:{color:'rgba(255,255,255,0.03)'},border:{color:'#27272a'}},
        },
      },
      plugins:[annPlugin],
    });
  }

  renderHeatmap(byService);
  renderErrorChart(byService);
  renderSLA();
  renderMTTR();
}

function renderHeatmap(byService){
  const hmGrid=document.getElementById('hmGrid');if(!hmGrid)return;
  hmGrid.innerHTML='';
  const names=Object.keys(byService);if(!names.length)return;
  const maxN=Math.max(...names.map(n=>byService[n].length),1);
  hmGrid.style.cssText=`display:grid;grid-template-columns:88px repeat(${maxN},1fr);gap:2px`;
  names.forEach(name=>{
    const rows=[...byService[name]].sort((a,b)=>(a.collected_at||'').localeCompare(b.collected_at||''));
    const lbl=document.createElement('div');
    lbl.style.cssText='font-size:9px;color:#52525b;display:flex;align-items:center;overflow:hidden;white-space:nowrap;font-family:monospace;padding-right:6px;text-overflow:ellipsis';
    lbl.textContent=name.replace('coinops-','');
    hmGrid.appendChild(lbl);
    const incTimes=_incidents.filter(i=>i.service_name===name&&i.created_at).map(i=>new Date(i.created_at).getTime());
    rows.forEach(row=>{
      const cell=document.createElement('div');cell.className='hm-cell';
      const rt=row.response_time!=null?parseFloat(row.response_time)*1000:null;
      const sc=statusClass(row.status);
      const rowTime=new Date(row.collected_at).getTime();
      const isInc=incTimes.some(t=>Math.abs(t-rowTime)<90000);
      let bg;
      if(isInc){bg='#312e81';cell.style.outline='1px solid #4338ca';}
      else if(sc==='down')bg='#ef4444';
      else if(sc==='unhealthy'||(rt&&rt>100))bg='#eab308';
      else bg='#22c55e';
      cell.style.background=bg;
      cell.title=`${name.replace('coinops-','')} | ${new Date(row.collected_at).toLocaleTimeString()} | ${rt!=null?Math.round(rt)+'ms':'down'}${isInc?' ⚠ incident':''}`;
      hmGrid.appendChild(cell);
    });
    for(let i=rows.length;i<maxN;i++){const pad=document.createElement('div');pad.className='hm-cell';pad.style.background='#18181b';hmGrid.appendChild(pad);}
  });
}

function renderErrorChart(byService){
  const canvas=document.getElementById('errChart');if(!canvas)return;
  if(_charts['_err']){_charts['_err'].destroy();delete _charts['_err'];}
  const allRows=Object.values(byService).flat().sort((a,b)=>(a.collected_at||'').localeCompare(b.collected_at||''));
  if(!allRows.length)return;
  const buckets={};
  allRows.forEach(row=>{
    // Group by minute (first 16 chars = "2026-05-24T11:25")
    const t=row.collected_at?row.collected_at.substring(0,16):'x';
    if(!buckets[t])buckets[t]={total:0,errors:0};
    buckets[t].total++;
    if(statusClass(row.status)==='down')buckets[t].errors++;
  });
  const times=Object.keys(buckets).sort().slice(-40);
  const errData=times.map(t=>buckets[t]?parseFloat(((buckets[t].errors/buckets[t].total)*100).toFixed(1)):0);
  const labels=times.map(t=>new Date(t+'Z').toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}));
  _charts['_err']=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[{label:'Error %',data:errData,backgroundColor:errData.map(v=>v>0?'rgba(239,68,68,0.5)':'rgba(34,197,94,0.25)'),borderColor:errData.map(v=>v>0?'#ef4444':'rgba(34,197,94,0.6)'),borderWidth:1,borderRadius:2,minBarLength:3}]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c1f',borderColor:'#27272a',borderWidth:1,callbacks:{title:()=>'',label:i=>i.raw+'% error rate'}}},
      scales:{x:{display:false},y:{display:true,position:'right',min:0,max:100,ticks:{font:{family:'JetBrains Mono',size:8},color:'#3f3f46',maxTicksLimit:3,callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.03)'},border:{display:false}}}
    }
  });
}

function renderSLA(){
  const wrap=document.getElementById('slaGrid');if(!wrap)return;wrap.innerHTML='';
  const names=Object.keys(_services).length?Object.keys(_services):Object.keys(_uptimeData);
  if(!names.length){wrap.innerHTML='<div class="empty" style="grid-column:1/-1">No SLA data</div>';return;}
  names.forEach(name=>{
    const u=_uptimeData[name];
    const pct=u?.uptime_pct!=null?parseFloat(u.uptime_pct):null;
    const pctStr=pct!=null?pct.toFixed(1)+'%':'—';
    const color=pct==null?'#71717a':pct>=99?'#22c55e':pct>=95?'#6366f1':pct>=50?'#eab308':'#ef4444';
    const met=pct!=null&&pct>=99;
    const card=document.createElement('div');card.className='sla-card';
    card.innerHTML=`
      <div class="sla-name">${name.replace('coinops-','')}</div>
      <div class="sla-bar-bg"><div class="sla-bar-fg" style="width:${pct||0}%;background:${color}"></div></div>
      <div class="sla-pct" style="color:${color}">${pctStr}</div>
      <div style="font-size:9px;font-weight:600;margin-top:3px;color:${met?'#22c55e':'#ef4444'}">${pct==null?'No data':met?'SLA met':'SLA missed'}</div>
      <div style="font-size:9px;color:#3f3f46;margin-top:2px">target: 99%</div>
    `;
    wrap.appendChild(card);
  });
}

function renderMTTR(){
  const wrap=document.getElementById('mttrGrid');if(!wrap)return;wrap.innerHTML='';
  const names=Object.keys(_services);if(!names.length)return;
  names.forEach(name=>{
    const svcInc=_incidents.filter(i=>i.service_name===name&&i.resolved_at&&i.created_at);
    let m=null;
    if(svcInc.length){const times=svcInc.map(i=>(new Date(i.resolved_at)-new Date(i.created_at))/60000);m=Math.round(times.reduce((a,b)=>a+b,0)/times.length);}
    const color=m==null?'#52525b':m<5?'#22c55e':m<30?'#eab308':'#ef4444';
    const card=document.createElement('div');card.className='sla-card';
    card.innerHTML=`
      <div class="sla-name">${name.replace('coinops-','')}</div>
      <div class="sla-pct" style="color:${color};font-size:16px">${m==null?'—':m+'min'}</div>
      <div style="font-size:9px;color:#3f3f46;margin-top:3px">${m==null?'no incidents':'mean recovery time'}</div>
    `;
    wrap.appendChild(card);
  });
}

function renderTopoServiceSummary(){
  const wrap=document.getElementById('topoServiceSummary');if(!wrap)return;
  const names=Object.keys(_services);if(!names.length){wrap.innerHTML='<div class="empty">No data</div>';return;}
  wrap.innerHTML=names.map(name=>{
    const s=_services[name];
    const sc=statusClass(s.status);
    const dotColor=sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':'#eab308';
    const u=_uptimeData[name];
    const uptime=u?.uptime_pct!=null?parseFloat(u.uptime_pct).toFixed(1)+'%':'—';
    const uptimeColor=u?.uptime_pct==null?'#71717a':u.uptime_pct>=99?'#22c55e':u.uptime_pct>=95?'#6366f1':u.uptime_pct>=50?'#eab308':'#ef4444';
    const avgMs=u?.avg_response_ms!=null?Math.round(u.avg_response_ms)+'ms':'—';
    const rt=s.last_response_time!=null?Math.round(parseFloat(s.last_response_time)*1000)+'ms':'—';
    const fails=s.consecutive_failures||0;
    const svcInc=_incidents.filter(i=>i.service_name===name).length;
    return`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-left:2px solid ${dotColor};border-radius:10px;padding:10px 14px;display:grid;grid-template-columns:160px 1fr 80px 80px 80px 80px;align-items:center;gap:12px">
      <div style="display:flex;align-items:center;gap:7px">
        <div style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
        <span style="font-size:12px;font-weight:600;color:#f4f4f5">${name.replace('coinops-','coinops-')}</span>
      </div>
      <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:4px;overflow:hidden">
        <div style="height:100%;width:${u?.uptime_pct||0}%;background:${uptimeColor};border-radius:4px"></div>
      </div>
      <div style="text-align:center"><div style="font-size:9px;color:#52525b;margin-bottom:2px">UPTIME</div><div style="font-size:11px;font-weight:600;font-family:monospace;color:${uptimeColor}">${uptime}</div></div>
      <div style="text-align:center"><div style="font-size:9px;color:#52525b;margin-bottom:2px">NOW</div><div style="font-size:11px;font-weight:600;font-family:monospace;color:${dotColor}">${rt}</div></div>
      <div style="text-align:center"><div style="font-size:9px;color:#52525b;margin-bottom:2px">AVG</div><div style="font-size:11px;font-weight:600;font-family:monospace;color:#a1a1aa">${avgMs}</div></div>
      <div style="text-align:center"><div style="font-size:9px;color:#52525b;margin-bottom:2px">INCIDENTS</div><div style="font-size:11px;font-weight:600;font-family:monospace;color:${svcInc>0?'#ef4444':'#52525b'}">${svcInc}</div></div>
    </div>`;
  }).join('');
}

function renderTopoDepMatrix(){
  const wrap=document.getElementById('topoDepMatrix');if(!wrap)return;
  if(!_serviceMap?.services){wrap.innerHTML='<div class="empty">No service map</div>';return;}
  const names=Object.keys(_serviceMap.services);
  const shortName=n=>n.replace('coinops-','');
  const deps=_serviceMap.services;
  const statusC=n=>{const s=_services[n]?.status;return statusClass(s);};
  const statusDot=n=>{const sc=statusC(n);return sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':sc==='unhealthy'?'#eab308':'#71717a';};

  let html=`<table style="border-collapse:collapse;font-size:11px;font-family:monospace;min-width:100%">`;
  html+=`<tr><td style="padding:6px 10px;color:#52525b;font-size:10px">depends on →</td>`;
  names.forEach(col=>{
    html+=`<td style="padding:6px 8px;text-align:center;color:#71717a;white-space:nowrap">
      <div style="width:8px;height:8px;border-radius:50%;background:${statusDot(col)};margin:0 auto 3px"></div>
      ${shortName(col)}
    </td>`;
  });
  html+=`</tr>`;

  names.forEach(row=>{
    html+=`<tr>`;
    html+=`<td style="padding:6px 10px;color:#a1a1aa;white-space:nowrap;border-right:1px solid rgba(255,255,255,0.05)">
      <div style="display:flex;align-items:center;gap:5px">
        <div style="width:6px;height:6px;border-radius:50%;background:${statusDot(row)}"></div>
        ${shortName(row)}
      </div>
    </td>`;
    names.forEach(col=>{
      const hasDep=(deps[row]?.depends_on||[]).includes(col);
      const isSelf=row===col;
      if(isSelf){
        html+=`<td style="padding:6px 8px;text-align:center;background:rgba(255,255,255,0.03)"><span style="color:#27272a">—</span></td>`;
      } else if(hasDep){
        const rowDown=statusC(row)==='down', colDown=statusC(col)==='down';
        const color=colDown?'#ef4444':rowDown?'#eab308':'#6366f1';
        html+=`<td style="padding:6px 8px;text-align:center"><span style="font-size:16px;color:${color}">●</span></td>`;
      } else {
        html+=`<td style="padding:6px 8px;text-align:center"><span style="color:#27272a;font-size:10px">·</span></td>`;
      }
    });
    html+=`</tr>`;
  });
  html+=`</table>`;
  wrap.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden">${html}</div>`;
}

function renderTopoTimeline(){
  const wrap=document.getElementById('topoTimeline');if(!wrap)return;
  const names=Object.keys(_services);if(!names.length){wrap.innerHTML='<div class="empty">No data</div>';return;}
  const now=Date.now();
  const window24h=24*60*60*1000;
  const toX=(ts)=>Math.max(0,Math.min(100,((now-new Date(ts).getTime())/window24h)*100));

  let html='';
  names.forEach(name=>{
    const svcInc=_incidents.filter(i=>i.service_name===name&&i.created_at);
    const sc=statusClass(_services[name]?.status);
    const dotColor=sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':'#eab308';
    const markers=svcInc.map(inc=>{
      const x=100-toX(inc.created_at);
      const color=inc.severity==='critical'?'#ef4444':'#eab308';
      const resolved=inc.resolved_at;
      const endX=resolved?100-toX(inc.resolved_at):100;
      const width=Math.max(0.5,endX-x);
      return`<div title="${inc.severity}: ${new Date(inc.created_at).toLocaleTimeString()}" style="position:absolute;left:${x}%;width:${width}%;top:0;bottom:0;background:${color};opacity:0.4;border-radius:1px"></div>
             <div style="position:absolute;left:${x}%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:${color};border-radius:50%;border:1px solid rgba(0,0,0,0.3)" title="${inc.severity}"></div>`;
    }).join('');

    html+=`<div style="display:grid;grid-template-columns:100px 1fr;align-items:center;gap:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
        <span style="font-size:10px;color:#71717a;font-family:monospace">${name.replace('coinops-','')}</span>
      </div>
      <div style="position:relative;height:20px;background:rgba(34,197,94,0.08);border-radius:3px;border:1px solid rgba(255,255,255,0.05)">
        ${markers}
        <div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;color:#3f3f46;pointer-events:none">now</div>
        <div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:9px;color:#3f3f46;pointer-events:none">-24h</div>
      </div>
    </div>`;
  });

  wrap.innerHTML=`<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px">${html}
    <div style="display:flex;gap:14px;margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05)">
      <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#71717a"><div style="width:8px;height:8px;border-radius:50%;background:#ef4444"></div>Critical incident</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#71717a"><div style="width:8px;height:8px;border-radius:50%;background:#eab308"></div>Warning incident</div>
    </div>
  </div>`;
}

function renderTopoRisk(){
  const wrap=document.getElementById('topoRisk');if(!wrap)return;
  if(!_serviceMap?.services){wrap.innerHTML='';return;}
  const names=Object.keys(_serviceMap.services);
  const deps=_serviceMap.services;

  names.forEach(name=>{
    const affectedBy=names.filter(n=>(deps[n]?.depends_on||[]).includes(name));
    const dependsOn=(deps[name]?.depends_on||[]);
    const sc=statusClass(_services[name]?.status);
    const dotColor=sc==='healthy'?'#22c55e':sc==='down'?'#ef4444':'#eab308';
    const risk=affectedBy.length>=3?'high':affectedBy.length>=1?'medium':'low';
    const riskColor=risk==='high'?'#ef4444':risk==='medium'?'#eab308':'#22c55e';
    const card=document.createElement('div');
    card.className='sla-card';
    card.innerHTML=`
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">
        <div style="width:6px;height:6px;border-radius:50%;background:${dotColor}"></div>
        <div class="sla-name" style="margin-bottom:0">${name.replace('coinops-','')}</div>
      </div>
      <div style="font-size:18px;font-weight:700;font-family:monospace;color:${riskColor};line-height:1">${affectedBy.length} affected</div>
      <div style="font-size:9px;font-weight:600;color:${riskColor};margin-top:3px;text-transform:uppercase">${risk} blast radius</div>
      ${affectedBy.length?`<div style="font-size:9px;color:#3f3f46;margin-top:4px">${affectedBy.map(n=>n.replace('coinops-','')).join(', ')}</div>`:'<div style="font-size:9px;color:#3f3f46;margin-top:4px">no downstream impact</div>'}
    `;
    wrap.appendChild(card);
  });
}

function renderDepGraph(){
  if(!_serviceMap?.services)return;
  const canvas=document.getElementById('depCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');
  canvas.width=canvas.parentElement.clientWidth-40;canvas.height=360;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const services=Object.keys(_serviceMap.services);if(!services.length)return;
  const SC={healthy:'#22c55e',down:'#ef4444',error:'#ef4444',timeout:'#ef4444',unhealthy:'#eab308',warning:'#eab308',unknown:'#71717a'};
  const getColor=name=>SC[(_services[name]?.status)||'unknown']||'#71717a';
  const deps=_serviceMap.services,depth={};
  function calcDepth(name,visited=new Set()){
    if(depth[name]!==undefined)return depth[name];
    if(visited.has(name)){depth[name]=0;return 0;}
    visited.add(name);
    const d=deps[name]?.depends_on||[];
    depth[name]=d.length===0?0:Math.max(...d.map(n=>calcDepth(n,new Set(visited))))+1;
    return depth[name];
  }
  services.forEach(s=>calcDepth(s));
  const layers={};
  for(const s of services){const d=depth[s]||0;if(!layers[d])layers[d]=[];layers[d].push(s);}
  const layerKeys=Object.keys(layers).map(Number).sort((a,b)=>b-a);
  const W=canvas.width,H=canvas.height,positions={};
  layerKeys.forEach((layer,li)=>{
    const nodes=layers[layer],y=60+li*(H-120)/Math.max(layerKeys.length-1,1);
    nodes.forEach((name,ni)=>{positions[name]={x:(W/(nodes.length+1))*(ni+1),y};});
  });
  for(const[name,cfg]of Object.entries(deps)){
    for(const dep of(cfg.depends_on||[])){
      if(!positions[dep]||!positions[name])continue;
      const from=positions[dep],to=positions[name];
      const fd=statusClass(_services[dep]?.status)==='down',td=statusClass(_services[name]?.status)==='down';
      const ec=(fd||td)?'rgba(239,68,68,0.5)':'rgba(99,102,241,0.25)',ee=(fd||td)?'rgba(239,68,68,0.2)':'rgba(99,102,241,0.08)';
      ctx.setLineDash([4,4]);
      const grad=ctx.createLinearGradient(from.x,from.y,to.x,to.y);grad.addColorStop(0,ec);grad.addColorStop(1,ee);
      ctx.beginPath();ctx.moveTo(from.x,from.y);
      const mx=(from.x+to.x)/2,my=(from.y+to.y)/2-15;ctx.quadraticCurveTo(mx,my,to.x,to.y);
      ctx.strokeStyle=grad;ctx.lineWidth=(fd||td)?2:1.5;ctx.stroke();ctx.setLineDash([]);
      const angle=Math.atan2(to.y-my,to.x-mx);
      ctx.beginPath();
      ctx.moveTo(to.x-10*Math.cos(angle-.35),to.y-10*Math.sin(angle-.35));
      ctx.lineTo(to.x-3,to.y-3);
      ctx.lineTo(to.x-10*Math.cos(angle+.35),to.y-10*Math.sin(angle+.35));
      ctx.strokeStyle=(fd||td)?'rgba(239,68,68,0.6)':'rgba(99,102,241,0.4)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.setLineDash([4,4]);
    }
  }
  ctx.setLineDash([]);
  const R=24;
  for(const[name,pos]of Object.entries(positions)){
    const color=getColor(name),{x,y}=pos;
    const glow=ctx.createRadialGradient(x,y,0,x,y,R*2);glow.addColorStop(0,color+'28');glow.addColorStop(1,'transparent');
    ctx.beginPath();ctx.arc(x,y,R*2,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
    ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fillStyle='#121215';ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    ctx.fillStyle='#a1a1aa';ctx.font='500 11px Inter,system-ui';ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillText(name,x,y+R+6);
  }
  renderFaultChains();
}

function renderFaultChains(){
  const grid=document.getElementById('faultChainsGrid');
  if(!grid||!_serviceMap?.fault_chains){if(grid)grid.innerHTML='<div class="empty" style="grid-column:1/-1">No fault chain data</div>';return;}
  grid.innerHTML=Object.entries(_serviceMap.fault_chains).map(([key,chain])=>`
    <div class="fc-card">
      <div class="fc-title"><svg viewBox="0 0 24 24" fill="none" stroke="var(--no)" stroke-width="2" style="width:13px;height:13px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg><span class="fc-root-name">${chain.root||key}</span></div>
      <div class="fc-desc">${chain.description||''}</div>
      <div class="fc-affected">${(chain.affected||[]).map(s=>`<span class="fc-chip">${s}</span>`).join('')}</div>
    </div>`).join('');
}

refreshAll();
setInterval(refreshAll,20000);
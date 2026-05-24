let _services={},_incidents=[],_serviceMap=null,_metricsHistory=[],_charts={},_activePanel='overview',_timeRange='40polls',_uptimeData={};
const TABS={
  overview: ['System Overview','Real-time microservice monitoring with LLM fault diagnosis'],
  services: ['Services','Health status and metrics for all monitored endpoints'],
  metrics:  ['Metrics','Latency · error rate · SLA · heatmap · MTTR'],
  incidents:['Incident Log','Detected anomalies with LLM root cause analysis'],
  topology: ['Service Topology','Dependency graph and fault propagation chains'],
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
  if(name==='topology')renderDepGraph();
  if(name==='metrics')renderMetrics();
}
function switchTabByName(name){
  const order=['overview','services','metrics','incidents','topology'];
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
  renderServiceGrid('serviceGridOverview',6);renderServiceGrid('serviceGridFull',null);
  renderIncidentList('incidentListOverview',5);renderIncidentList('incidentListFull',null);
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
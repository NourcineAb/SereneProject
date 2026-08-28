/* Serene Backoffice — single-page vanilla JS app */
const API = window.location.origin;
let token = localStorage.getItem('admin_token');
let charts = {};
let currentPage = 1;
let searchTimeout = null;

/* ── Serene color constants for charts ── */
const C = {
  primary:'#0f5238', primaryFixed:'#b1f0ce', secondary:'#4e653f',
  secondaryContainer:'#d0ebbb', outline:'#707973', surface:'#e8fff1',
  onSurface:'#0c1f17', onSurfaceV:'#404943', success:'#16a34a',
  warning:'#b45309', error:'#ba1a1a', info:'#0369a1'
};

function authHeaders(){return{'Authorization':'Bearer '+token,'Content-Type':'application/json'}}
async function apiFetch(path,opts={}){
  const r = await fetch(API+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});
  if(r.status===401){logout();throw new Error('Unauthorized')}
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||'Erreur')}
  return r.json();
}
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
function fmtDate(s){return s?new Date(s).toLocaleDateString('fr-FR'):'-'}
function fmtDateTime(s){return s?new Date(s).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'}

/* ── Login ── */
document.getElementById('login-form').onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  try {
    const r = await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d = await r.json();
    if(!r.ok){errEl.textContent=d.detail||'Erreur';return}
    token=d.access_token;localStorage.setItem('admin_token',token);showApp();
  } catch(err){errEl.textContent='Erreur de connexion'}
};

function logout(){
  localStorage.removeItem('admin_token');token=null;
  document.getElementById('app').style.display='none';
  document.getElementById('login-view').style.display='flex';
}
function showApp(){
  document.getElementById('login-view').style.display='none';
  document.getElementById('app').style.display='block';
  switchTab('dashboard');
}

/* ── Mobile menu ── */
function closeMenu(){
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');
}
(function(){
  var btn=document.getElementById('menu-btn');
  var scrim=document.getElementById('scrim');
  if(btn)btn.addEventListener('click',function(){
    document.querySelector('.sidebar').classList.toggle('open');
    scrim.classList.toggle('show');
  });
  if(scrim)scrim.addEventListener('click',closeMenu);
})();

/* ── Navigation ── */
const TABS = ['dashboard','analytics','users','subscriptions','payments','ai','notifications','feedback','audit','system'];
document.querySelectorAll('.sidebar nav a').forEach(a=>{
  a.addEventListener('click',e=>{e.preventDefault();switchTab(a.dataset.tab)});
});
function switchTab(name){
  closeMenu();
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.tab===name));
  TABS.forEach(p=>{document.getElementById('page-'+p).style.display=p===name?'block':'none'});
  if(name==='dashboard')loadDashboard();
  if(name==='analytics')loadAnalytics();
  if(name==='users'){currentPage=1;loadUsers()}
  if(name==='subscriptions')loadSubscriptions();
  if(name==='payments')loadPayments();
  if(name==='ai')loadAI();
  if(name==='notifications'){loadNotifications();}
  if(name==='feedback')loadFeedback();
  if(name==='audit')loadAudit();
  if(name==='system')loadSystem();
}

/* ── Dashboard ── */
async function loadDashboard(){
  const cards=document.getElementById('stats-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const s=await apiFetch('/admin/stats');
    const t=s.totals,w=s.week;
    cards.innerHTML=`
      <div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div><div class="info"><div class="value">${t.users}</div><div class="label">Utilisateurs</div><div class="sub">+${w.new_users} cette semaine</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div><div class="info"><div class="value">${w.active_users}</div><div class="label">Actifs (7j)</div><div class="sub">${w.conversion_rate}% conversion</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div><div class="info"><div class="value">${t.premium_users}</div><div class="label">Premium</div><div class="sub">${(s.revenue&&s.revenue.total)?s.revenue.total+'$ CA':''}</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">${w.sessions}</div><div class="label">Sessions (7j)</div><div class="sub">${t.sessions} total</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:#d0ebbb"><svg viewBox="0 0 24 24" fill="#4e653f"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></div><div class="info"><div class="value">${w.messages}</div><div class="label">Messages (7j)</div><div class="sub">${t.messages} total</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.12-.1.17-.24.12-.37l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.12.1-.17.24-.12.37l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg></div><div class="info"><div class="value">${s.ai.requests_7d||0}</div><div class="label">Requêtes IA (7j)</div><div class="sub">${s.ai.errors_7d||0} erreurs</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">${w.mood_logs}</div><div class="label">Humeurs (7j)</div><div class="sub">${t.mood_logs} total</div></div></div>
    `;
    renderMoodChart(s.mood_trend);
    renderTechChart(s.techniques);
  }catch(e){cards.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
function renderMoodChart(data){
  if(charts.mood)charts.mood.destroy();
  const ctx=document.getElementById('chart-mood');
  if(!data.length){ctx.parentElement.innerHTML='<h3>Tendance d\'humeur (7 jours)</h3><div class="empty"><p>Aucune donn&eacute;e</p></div>';return}
  charts.mood=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:[
      {label:'Humeur moy.',data:data.map(d=>d.avg),borderColor:C.primary,backgroundColor:C.primaryFixed+'33',fill:true,tension:.4,pointRadius:5,pointBackgroundColor:C.primary,pointBorderColor:'#fff',pointBorderWidth:2},
      {label:'Entries',data:data.map(d=>d.count),borderColor:C.secondary,backgroundColor:'transparent',tension:.4,pointRadius:3,borderDash:[6,4],yAxisID:'y1',pointBackgroundColor:C.secondary}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:C.onSurfaceV,font:{family:'Plus Jakarta Sans',size:12}}}},scales:{x:{ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y:{min:0,max:10,ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y1:{position:'right',min:0,ticks:{color:C.outline,font:{size:11}},grid:{display:false}}}}
  });
}
function renderTechChart(data){
  if(charts.tech)charts.tech.destroy();
  const ctx=document.getElementById('chart-tech');
  const labels=Object.keys(data);
  if(!labels.length){ctx.parentElement.innerHTML='<h3>Techniques utilis&eacute;es (7 jours)</h3><div class="empty"><p>Aucune donn&eacute;e</p></div>';return}
  const palette=[C.primary,C.secondary,'#16a34a','#b45309','#0369a1'];
  charts.tech=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data:labels.map(l=>data[l]),backgroundColor:palette.slice(0,labels.length),borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right',labels:{color:C.onSurfaceV,font:{family:'Plus Jakarta Sans',size:12},padding:14}}}}
  });
}

/* ── Analytics ── */
async function loadAnalytics(){
  const el=document.getElementById('analytics-content');
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/analytics?days=30');
    const o=d.overview,s=d.series,r=d.retention;
    el.innerHTML=
      '<div class="stats-grid">'+
        '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div><div class="info"><div class="value">'+o.total_users+'</div><div class="label">Utilisateurs</div><div class="sub">'+o.conversion_rate+'% premium</div></div></div>'+
        '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div><div class="info"><div class="value">'+o.premium_users+'</div><div class="label">Premium</div></div></div>'+
        '<div class="stat-card"><div class="icon-bubble" style="background:#d0ebbb"><svg viewBox="0 0 24 24" fill="#4e653f"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></div><div class="info"><div class="value">'+o.total_sessions+'</div><div class="label">Sessions</div></div></div>'+
        '<div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.12-.1.17-.24.12-.37l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.12.1-.17.24-.12.37l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg></div><div class="info"><div class="value">'+o.total_messages+'</div><div class="label">Messages</div></div></div>'+
      '</div>'+
      '<div class="charts-row"><div class="chart-card wide"><h3>Croissance utilisateurs (30j)</h3><canvas id="chart-growth"></canvas></div></div>'+
      '<div class="charts-row">'+
        '<div class="chart-card"><h3>Sessions</h3><canvas id="chart-sessions"></canvas></div>'+
        '<div class="chart-card"><h3>Messages</h3><canvas id="chart-messages"></canvas></div>'+
      '</div>'+
      '<div class="charts-row">'+
        '<div class="chart-card"><h3>Revenus (30j)</h3><canvas id="chart-revenue"></canvas></div>'+
        '<div class="chart-card"><h3>Abonn&eacute;s actifs</h3><canvas id="chart-premium"></canvas></div>'+
      '</div>'+
      '<div class="charts-row">'+
        '<div class="chart-card wide"><h3>Usage IA (30j)</h3><canvas id="chart-ai"></canvas></div>'+
      '</div>'+
      '<div class="sys-grid"><div class="sys-card"><h3>R&eacute;tention par cohorte</h3>'+
      ['d1','d7','d14','d30'].map(k=>'<div class="sys-row"><span class="key">Cohorte J'+k.slice(1)+'</span><span class="val">'+(r[k]==null?'N/A':r[k]+'%')+'</span></div>').join('')+
      '</div></div>';
    renderLine('chart-growth',s.growth,['new'],['Nouveaux'],'#16a34a');
    renderLine('chart-sessions',s.sessions,['count'],['Sessions'],C.primary);
    renderLine('chart-messages',s.messages,['count'],['Messages'],C.secondary);
    renderLine('chart-revenue',s.revenue,['amount'],['Revenus ($)'],C.warning);
    renderLine('chart-premium',s.premium,['total'],['Abonnés'],C.info);
    renderAIChart(s.ai);
  }catch(e){el.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
function renderLine(canvasId,data,fields,labels,color){
  if(charts[canvasId])charts[canvasId].destroy();
  const ctx=document.getElementById(canvasId);
  charts[canvasId]=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:fields.map((f,i)=>({label:labels[i],data:data.map(d=>d[f]),borderColor:color,backgroundColor:color+'22',fill:true,tension:.35,pointRadius:3}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:C.onSurfaceV,font:{size:12}}}},scales:{x:{ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y:{ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}}}}
  });
}
function renderAIChart(data){
  if(charts['chart-ai'])charts['chart-ai'].destroy();
  const ctx=document.getElementById('chart-ai');
  charts['chart-ai']=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:[
      {label:'Requêtes',data:data.map(d=>d.requests),borderColor:C.primary,backgroundColor:C.primaryFixed+'33',fill:true,tension:.35,pointRadius:3},
      {label:'Erreurs',data:data.map(d=>d.errors),borderColor:C.error,backgroundColor:'transparent',tension:.35,pointRadius:3,borderDash:[6,4]},
      {label:'Latence (ms)',data:data.map(d=>d.avg_latency),borderColor:C.warning,backgroundColor:'transparent',tension:.35,pointRadius:3,yAxisID:'y1'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:C.onSurfaceV,font:{size:12}}}},scales:{x:{ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y:{ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y1:{position:'right',ticks:{color:C.outline,font:{size:11}},grid:{display:false}}}}
  });
}

/* ── Users ── */
document.getElementById('user-search').addEventListener('input',e=>{
  clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>{currentPage=1;loadUsers()},300);
});
['user-filter-premium','user-filter-active','user-filter-suspended'].forEach(id=>{
  document.getElementById(id).addEventListener('change',()=>{currentPage=1;loadUsers()});
});
function usersQuery(){
  const q=document.getElementById('user-search').value;
  const premium=document.getElementById('user-filter-premium').value;
  const active=document.getElementById('user-filter-active').value;
  const suspended=document.getElementById('user-filter-suspended').value;
  let url='/admin/users?page='+currentPage+'&per_page=20';
  if(q)url+='&q='+encodeURIComponent(q);
  if(premium)url+='&premium='+premium;
  if(active)url+='&active='+active;
  if(suspended)url+='&suspended='+suspended;
  return url;
}
async function loadUsers(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('users-tbody');
  tbody.innerHTML='<tr><td colspan="8" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch(usersQuery());
    if(!d.users.length){tbody.innerHTML='<tr><td colspan="8" class="empty"><p>Aucun utilisateur trouv&eacute;</p></td></tr>';return}
    tbody.innerHTML=d.users.map(u=>'<tr>'+
      '<td style="font-weight:600">'+esc(u.name)+'</td>'+
      '<td style="color:var(--on-surface-v)">'+esc(u.email)+'</td>'+
      '<td>'+u.session_count+'</td>'+
      '<td>'+(u.is_premium?'<span class="badge badge-premium">Premium</span>':'<span class="badge badge-free">Gratuit</span>')+(u.is_admin?' <span class="badge badge-admin">Admin</span>':'')+'</td>'+
      '<td>'+(u.is_suspended?'<span class="badge badge-error">Suspendu</span>':(u.is_active_7d?'<span class="badge badge-active">Actif</span>':'<span class="badge badge-inactive">Inactif</span>'))+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDate(u.created_at)+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+(u.last_login_at?new Date(u.last_login_at).toLocaleDateString('fr-FR'):'-')+'</td>'+
      '<td><button class="btn btn-outline btn-sm" onclick="openUser('+u.id+')">Voir</button></td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'users-pagination','loadUsers');
  }catch(e){tbody.innerHTML='<tr><td colspan="8" class="empty">Erreur de chargement</td></tr>'}
}
function renderPagination(page,pages,total,elId,fn){
  document.getElementById(elId).innerHTML=
    '<button '+(page<=1?'disabled':'')+' onclick="'+fn+'('+(page-1)+')">&larr;</button>'+
    '<span class="page-info">Page '+page+' / '+pages+' ('+total+')</span>'+
    '<button '+(page>=pages?'disabled':'')+' onclick="'+fn+'('+(page+1)+')">&rarr;</button>';
}

/* ── User Detail Modal ── */
async function openUser(id){
  const modal=document.getElementById('user-modal');
  const body=document.getElementById('modal-body');
  modal.classList.add('open');
  body.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/users/'+id);
    const u=d.user,m=d.metrics;
    document.getElementById('modal-title').textContent=u.name||u.email;
    let techHtml='';
    if(m.techniques&&Object.keys(m.techniques).length){
      techHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">Techniques utilis&eacute;es</label><div style="display:flex;gap:8px;flex-wrap:wrap">'+Object.entries(m.techniques).map(([k,v])=>'<span class="badge badge-premium">'+esc(k)+': '+v+'</span>').join('')+'</div></div>';
    }
    let moodHtml='';
    if(d.mood_logs.length){
      moodHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">Humeurs r&eacute;centes</label><div style="display:flex;gap:6px;flex-wrap:wrap">'+d.mood_logs.slice(0,20).map(mo=>{
        const bg=mo.score>=7?'background:var(--success-bg);color:var(--success)':mo.score>=4?'background:var(--warning-bg);color:var(--warning)':'background:var(--error-container);color:var(--on-error-container)';
        return '<span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--r-full);font-size:12px;font-weight:700;'+bg+'" title="'+esc(mo.label)+'">'+mo.score+'</span>';
      }).join('')+'</div></div>';
    }
    let sessionsHtml='';
    if(d.sessions.length){
      sessionsHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">Sessions ('+d.sessions.length+')</label><div style="max-height:200px;overflow-y:auto">'+d.sessions.slice(0,10).map(s=>'<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--surface-ch);font-size:14px"><span style="font-weight:500">'+esc(s.title)+'</span><span style="color:var(--outline)">'+fmtDate(s.created_at)+'</span></div>').join('')+'</div></div>';
    }
    body.innerHTML=
      '<div class="detail-grid">'+
        '<div class="detail-item"><label>Email</label><div class="val">'+esc(u.email)+'</div></div>'+
        '<div class="detail-item"><label>Inscrit le</label><div class="val">'+fmtDate(u.created_at)+'</div></div>'+
        '<div class="detail-item"><label>Sessions totales</label><div class="val">'+m.total_sessions+'</div></div>'+
        '<div class="detail-item"><label>Sessions (7j)</label><div class="val">'+m.sessions_7d+'</div></div>'+
        '<div class="detail-item"><label>Messages totaux</label><div class="val">'+m.total_messages+'</div></div>'+
        '<div class="detail-item"><label>Messages (7j)</label><div class="val">'+m.messages_7d+'</div></div>'+
        '<div class="detail-item"><label>Humeurs</label><div class="val">'+m.total_mood_logs+'</div></div>'+
        '<div class="detail-item"><label>Exercices</label><div class="val">'+m.total_exercises+'</div></div>'+
        '<div class="detail-item"><label>Humeur moy.</label><div class="val">'+(m.avg_mood?m.avg_mood+'/10':'-')+'</div></div>'+
        '<div class="detail-item"><label>Humeur moy. (7j)</label><div class="val">'+(m.avg_mood_7d?m.avg_mood_7d+'/10':'-')+'</div></div>'+
        '<div class="detail-item"><label>Statut</label><div class="val">'+(u.is_premium?'<span class="badge badge-premium">Premium</span>':'<span class="badge badge-free">Gratuit</span>')+(u.is_suspended?' <span class="badge badge-error">Suspendu</span>':'')+'</div></div>'+
        '<div class="detail-item"><label>Derni&egrave;re connexion</label><div class="val">'+fmtDateTime(u.last_login_at)+'</div></div>'+
      '</div>'+
      '<div class="detail-edit"><div class="form-group"><label>Nom</label><input type="text" id="edit-name" value="'+esc(u.name)+'"></div><div class="form-group"><label>Email</label><input type="email" id="edit-email" value="'+esc(u.email)+'"></div></div>'+
      '<div class="detail-actions">'+
        '<button class="btn btn-success btn-sm" onclick="togglePremium('+u.id+')">'+(u.is_premium?'Retirer Premium':'Accorder Premium')+'</button>'+
        '<button class="btn btn-outline btn-sm" onclick="toggleAdmin('+u.id+')">'+(u.is_admin?'Retirer Admin':'Accorder Admin')+'</button>'+
        (u.is_suspended
          ?'<button class="btn btn-success btn-sm" onclick="reactivateUser('+u.id+')">R&eacute;activer</button>'
          :'<button class="btn btn-danger btn-sm" onclick="suspendUser('+u.id+')">Suspendre</button>')+
        '<button class="btn btn-tonal btn-sm" onclick="saveUser('+u.id+')">Enregistrer</button>'+
        '<button class="btn btn-danger btn-sm" onclick="deleteUser('+u.id+')">Supprimer</button>'+
      '</div>'+
      '<div id="modal-msg"></div>'+
      techHtml+moodHtml+sessionsHtml;
  }catch(e){body.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
function closeModal(){document.getElementById('user-modal').classList.remove('open')}
document.getElementById('user-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function modalMsg(text,err){
  document.getElementById('modal-msg').innerHTML='<p class="msg '+(err?'err':'')+'">'+esc(text)+'</p>';
}
async function togglePremium(id){await apiFetch('/admin/users/'+id+'/toggle-premium',{method:'PUT'});openUser(id)}
async function toggleAdmin(id){await apiFetch('/admin/users/'+id+'/toggle-admin',{method:'PUT'});openUser(id)}
async function suspendUser(id){
  if(!confirm('Suspendre cet utilisateur ?'))return;
  await apiFetch('/admin/users/'+id+'/suspend',{method:'PUT'});openUser(id);loadUsers();
}
async function reactivateUser(id){await apiFetch('/admin/users/'+id+'/reactivate',{method:'PUT'});openUser(id);loadUsers()}
async function deleteUser(id){
  if(!confirm('Supprimer définitivement ce compte ? Cette action est irréversible.'))return;
  try{await apiFetch('/admin/users/'+id,{method:'DELETE'});closeModal();loadUsers()}
  catch(e){modalMsg(e.message,true)}
}
async function saveUser(id){
  const payload={name:document.getElementById('edit-name').value,email:document.getElementById('edit-email').value};
  try{await apiFetch('/admin/users/'+id,{method:'PUT',body:JSON.stringify(payload)});modalMsg('Utilisateur mis à jour');openUser(id)}
  catch(e){modalMsg(e.message,true)}
}

/* ── Subscriptions ── */
let subStatus='';
let paymentStatusFilter='';
let paymentProviderFilter='';
async function loadSubscriptions(){
  const cards=document.getElementById('subs-cards');
  const tbody=document.getElementById('subs-tbody');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const o=await apiFetch('/admin/subscriptions/overview');
    cards.innerHTML=
      '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.active+'</div><div class="label">Actives</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg></div><div class="info"><div class="value">'+o.trials+'</div><div class="label">Essais</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#ba1a1a;opacity:.12"><svg viewBox="0 0 24 24" fill="#ba1a1a"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg></div><div class="info"><div class="value">'+o.canceled+'</div><div class="label">Annul&eacute;es</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">'+o.mrr+'$</div><div class="label">MRR</div><div class="sub">'+o.revenue_month+'$ ce mois</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.expiring_7d+'</div><div class="label">Expirent &lt; 7j</div><div class="sub">'+o.revenue_total+'$ total</div></div></div>'+
    '</div>';
    renderExpiring(o.expiring);
    await loadSubsTable();
  }catch(e){cards.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
function renderExpiring(list){
  const tbody=document.getElementById('expiring-tbody');
  if(!list.length){tbody.innerHTML='<tr><td colspan="6" class="empty"><p>Aucune expiration &agrave; venir</p></td></tr>';return}
  tbody.innerHTML=list.map(s=>'<tr>'+
    '<td style="font-weight:600">'+esc(s.name||s.email||'-')+'</td>'+
    '<td style="color:var(--on-surface-v)">'+esc(s.email||'-')+'</td>'+
    '<td><span class="badge badge-premium">'+esc(s.plan)+'</span></td>'+
    '<td>'+esc(s.price)+'$</td>'+
    '<td style="color:var(--warning);font-weight:600">'+fmtDate(s.period_end)+'</td>'+
    '<td><button class="btn btn-outline btn-sm" onclick="openUser('+s.user_id+')">Voir</button></td>'+
  '</tr>').join('');
}
async function loadSubsTable(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('subs-tbody');
  tbody.innerHTML='<tr><td colspan="9" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/subscriptions?status='+subStatus+'&page='+currentPage+'&per_page=20');
    if(!d.subscriptions.length){tbody.innerHTML='<tr><td colspan="9" class="empty"><p>Aucun abonnement</p></td></tr>';return}
    tbody.innerHTML=d.subscriptions.map(s=>'<tr>'+
      '<td style="font-weight:600">'+esc(s.name||s.email||'-')+'</td>'+
      '<td style="color:var(--on-surface-v)">'+esc(s.email||'-')+'</td>'+
      '<td><span class="badge badge-premium">'+esc(s.plan)+'</span></td>'+
      '<td>'+esc(s.status)+'</td>'+
      '<td>'+(s.is_trial?'<span class="badge badge-inactive">Essai</span>':'')+'</td>'+
      '<td>'+esc(s.price)+'$</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDate(s.started_at)+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDate(s.period_end)+'</td>'+
      '<td><button class="btn btn-outline btn-sm" onclick="openUser('+s.user_id+')">Voir</button></td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'subs-pagination','loadSubsTable');
  }catch(e){tbody.innerHTML='<tr><td colspan="9" class="empty">Erreur de chargement</td></tr>'}
}
document.getElementById('subs-filter').addEventListener('change',e=>{subStatus=e.target.value;currentPage=1;loadSubsTable()});

/* ── Payments ── */
async function loadPayments(page){
  if(page)currentPage=page;
  const cards=document.getElementById('payments-cards');
  const tbody=document.getElementById('payments-tbody');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  tbody.innerHTML='<tr><td colspan="9" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const o=await apiFetch('/admin/payments/overview');
    cards.innerHTML=
      '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">'+o.total_revenue+'$</div><div class="label">Revenus totaux</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">'+o.month_revenue+'$</div><div class="label">Ce mois</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.succeeded_count+'</div><div class="label">Réussis</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#ba1a1a;opacity:.12"><svg viewBox="0 0 24 24" fill="#ba1a1a"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg></div><div class="info"><div class="value">'+o.failed_count+'</div><div class="label">Échoués</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.pending_count+'</div><div class="label">En attente</div></div></div>'+
    '</div>';
    await loadPaymentsTable();
  }catch(e){cards.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
async function loadPaymentsTable(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('payments-tbody');
  try{
    let url='/admin/payments?page='+currentPage+'&per_page=20';
    if(paymentStatusFilter)url+='&status='+paymentStatusFilter;
    if(paymentProviderFilter)url+='&provider='+paymentProviderFilter;
    const d=await apiFetch(url);
    if(!d.payments.length){tbody.innerHTML='<tr><td colspan="9" class="empty"><p>Aucun paiement</p></td></tr>';return}
    tbody.innerHTML=d.payments.map(p=>'<tr>'+
      '<td style="font-weight:600">'+esc(p.name||p.email||'-')+'</td>'+
      '<td style="color:var(--on-surface-v)">'+esc(p.email||'-')+'</td>'+
      '<td style="font-weight:600">'+esc(p.amount)+' '+esc(p.currency)+'</td>'+
      '<td>'+esc(p.currency)+'</td>'+
      '<td><span class="badge badge-'+(p.status==='succeeded'?'premium':p.status==='failed'?'error':'inactive')+'">'+esc(p.status)+'</span></td>'+
      '<td>'+esc(p.provider)+'</td>'+
      '<td>'+esc(p.source)+'</td>'+
      '<td style="font-family:monospace;font-size:12px;color:var(--outline)">'+esc(p.provider_payment_id||'-')+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(p.created_at)+'</td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'payments-pagination','loadPaymentsTable');
  }catch(e){tbody.innerHTML='<tr><td colspan="9" class="empty">Erreur de chargement</td></tr>'}
}
document.getElementById('payments-filter-status').addEventListener('change',e=>{paymentStatusFilter=e.target.value;currentPage=1;loadPaymentsTable()});
document.getElementById('payments-filter-provider').addEventListener('change',e=>{paymentProviderFilter=e.target.value;currentPage=1;loadPaymentsTable()});

/* ── AI monitoring ── */
async function loadAI(){
  const cards=document.getElementById('ai-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/ai-monitoring?days=30');
    const o=d.overview;
    cards.innerHTML=
      '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.12-.1.17-.24.12-.37l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.12.1-.17.24-.12.37l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg></div><div class="info"><div class="value">'+o.total_requests+'</div><div class="label">Requ&ecirc;tes</div><div class="sub">'+o.success+' OK</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#ba1a1a;opacity:.12"><svg viewBox="0 0 24 24" fill="#ba1a1a"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg></div><div class="info"><div class="value">'+o.errors+'</div><div class="label">Erreurs</div><div class="sub">'+o.error_rate+'%</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg></div><div class="info"><div class="value">'+o.avg_latency_ms+'ms</div><div class="label">Latence moy.</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#d0ebbb"><svg viewBox="0 0 24 24" fill="#4e653f"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">'+o.total_tokens.toLocaleString()+'</div><div class="label">Tokens</div><div class="sub">'+o.prompt_tokens.toLocaleString()+' prompt / '+o.completion_tokens.toLocaleString()+' compl.</div></div></div>'+
    '</div>';
    renderLine('chart-ai-overview',d.timeseries,['requests'],['Requêtes'],C.primary);
    renderAIErrors(d.recent_errors);
    renderModels(d.models_used);
  }catch(e){cards.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
function renderModels(models){
  const tbody=document.getElementById('ai-models-tbody');
  if(!models.length){tbody.innerHTML='<tr><td colspan="5" class="empty"><p>Aucune donn&eacute;e</p></td></tr>';return}
  tbody.innerHTML=models.map(m=>'<tr>'+
    '<td style="font-weight:600">'+esc(m.model)+'</td>'+
    '<td>'+m.requests+'</td>'+
    '<td>'+m.errors+'</td>'+
    '<td>'+m.avg_latency_ms+'ms</td>'+
    '<td>'+m.tokens.toLocaleString()+'</td>'+
  '</tr>').join('');
}
function renderAIErrors(errors){
  const tbody=document.getElementById('ai-errors-tbody');
  if(!errors.length){tbody.innerHTML='<tr><td colspan="3" class="empty"><p>Aucune erreur r&eacute;cente</p></td></tr>';return}
  tbody.innerHTML=errors.map(e=>'<tr>'+
    '<td style="font-weight:600">'+esc(e.model||'-')+'</td>'+
    '<td class="error-text">'+esc(e.error)+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(e.created_at)+'</td>'+
  '</tr>').join('');
}

/* ── Notifications ── */
document.getElementById('notif-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const msg=document.getElementById('notif-msg');
  msg.className='msg';msg.textContent='Envoi...';
  const targetType=document.getElementById('notif-target').value;
  const payload={
    title:document.getElementById('notif-title').value,
    body:document.getElementById('notif-body').value,
    target_type:targetType
  };
  if(targetType==='specific'){
    const uid=document.getElementById('notif-user').value;
    if(!uid){msg.className='msg err';msg.textContent='ID utilisateur requis';return}
    payload.target_user_id=Number(uid);
  }
  try{
    const d=await apiFetch('/admin/notifications/send',{method:'POST',body:JSON.stringify(payload)});
    msg.textContent=d.sent+'/'+d.targets+' notifications envoyées';
    e.target.reset();
    loadNotifications();
  }catch(err){msg.className='msg err';msg.textContent=err.message}
});
document.getElementById('notif-target').addEventListener('change',e=>{
  document.getElementById('notif-user').style.display=e.target.value==='specific'?'block':'none';
});
async function loadNotifications(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('notif-tbody');
  tbody.innerHTML='<tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/notifications?page='+currentPage+'&per_page=20');
    if(!d.notifications.length){tbody.innerHTML='<tr><td colspan="7" class="empty"><p>Aucune notification envoy&eacute;e</p></td></tr>';return}
    tbody.innerHTML=d.notifications.map(n=>'<tr>'+
      '<td style="font-weight:600">'+esc(n.title)+'</td>'+
      '<td style="color:var(--on-surface-v);max-width:280px">'+esc(n.body)+'</td>'+
      '<td><span class="badge badge-premium">'+esc(n.target_type)+'</span></td>'+
      '<td>'+(n.status==='sent'?'<span class="badge badge-active">Envoyée</span>':n.status==='partial'?'<span class="badge badge-progress">Partielle</span>':'<span class="badge badge-error">Échec</span>')+'</td>'+
      '<td>'+n.sent_count+'</td>'+
      '<td>'+n.failed_count+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(n.created_at)+'</td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'notif-pagination','loadNotifications');
  }catch(e){tbody.innerHTML='<tr><td colspan="7" class="empty">Erreur de chargement</td></tr>'}
}

/* ── Feedback ── */
let fbStatus='',fbCategory='',fbPage=1;
async function loadFeedback(page){
  if(page)fbPage=page;
  const cards=document.getElementById('fb-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/feedback?status='+fbStatus+'&category='+fbCategory+'&page='+fbPage+'&per_page=20');
    cards.innerHTML='<div class="stats-grid" style="margin-bottom:var(--sp-gutter)">'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+d.counts.open+'</div><div class="label">&Agrave; traiter</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div><div class="info"><div class="value">'+d.counts.resolved+'</div><div class="label">R&eacute;solus</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">'+d.counts.total+'</div><div class="label">Total</div></div></div>'+
    '</div>';
    const tbody=document.getElementById('fb-tbody');
    if(!d.feedback.length){tbody.innerHTML='<tr><td colspan="6" class="empty"><p>Aucun retour</p></td></tr>';return}
    tbody.innerHTML=d.feedback.map(f=>'<tr>'+
      '<td style="font-weight:600">'+esc(f.name||f.email||'-')+'</td>'+
      '<td><span class="badge badge-premium">'+esc(f.category)+'</span></td>'+
      '<td style="max-width:320px;color:var(--on-surface-v)">'+esc(f.content)+'</td>'+
      '<td>'+statusBadge(f.status)+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDate(f.created_at)+'</td>'+
      '<td>'+
        (f.status==='open'?'<button class="btn btn-info btn-sm" style="background:var(--info-bg);color:var(--info)" onclick="setFeedback('+f.id+',\'in_progress\')">En cours</button> ':'')+
        (f.status!=='resolved'?'<button class="btn btn-success btn-sm" onclick="setFeedback('+f.id+',\'resolved\')">R&eacute;soudre</button> ':'')+
        (f.status==='resolved'?'<button class="btn btn-outline btn-sm" onclick="setFeedback('+f.id+',\'open\')">Rouvrir</button>':'')+
      '</td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'fb-pagination','loadFeedback');
  }catch(e){cards.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
function statusBadge(s){return s==='open'?'<span class="badge badge-open">Ouvert</span>':s==='in_progress'?'<span class="badge badge-progress">En cours</span>':'<span class="badge badge-resolved">R&eacute;solu</span>'}
async function setFeedback(id,status){await apiFetch('/admin/feedback/'+id+'/status',{method:'PUT',body:JSON.stringify({status})});loadFeedback()}
document.getElementById('fb-filter-status').addEventListener('change',e=>{fbStatus=e.target.value;fbPage=1;loadFeedback()});
document.getElementById('fb-filter-category').addEventListener('change',e=>{fbCategory=e.target.value;fbPage=1;loadFeedback()});

/* ── Audit ── */
let auditAction='';
async function loadAudit(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('audit-tbody');
  tbody.innerHTML='<tr><td colspan="6" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/audit-logs?action='+auditAction+'&page='+currentPage+'&per_page=20');
    if(!d.logs.length){tbody.innerHTML='<tr><td colspan="6" class="empty"><p>Aucune action enregistr&eacute;e</p></td></tr>';return}
    tbody.innerHTML=d.logs.map(l=>'<tr>'+
      '<td><span class="badge badge-admin">'+esc(l.action)+'</span></td>'+
      '<td style="color:var(--on-surface-v)">'+esc(l.admin_email||'-')+'</td>'+
      '<td style="color:var(--on-surface-v)">'+esc(l.target_email||'-')+'</td>'+
      '<td class="error-text" style="font-size:12px">'+esc(l.details||'')+'</td>'+
      '<td>'+(l.result==='success'?'<span class="badge badge-active">OK</span>':'<span class="badge badge-error">Err</span>')+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(l.created_at)+'</td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'audit-pagination','loadAudit');
    const sel=document.getElementById('audit-filter');
    if(sel.options.length<=1){sel.innerHTML='<option value="">Toutes les actions</option>'+d.actions.map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('')}
  }catch(e){tbody.innerHTML='<tr><td colspan="6" class="empty">Erreur de chargement</td></tr>'}
}
document.getElementById('audit-filter').addEventListener('change',e=>{auditAction=e.target.value;currentPage=1;loadAudit()});

/* ── System ── */
async function loadSystem(){
  const el=document.getElementById('system-content');
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const s=await apiFetch('/admin/system');
    const c=s.config;
    el.innerHTML=
      '<div class="sys-grid">'+
        '<div class="sys-card"><h3><span class="status-dot '+(s.database.ok?'ok':'err')+'"></span>Base de donn&eacute;es</h3>'+
          '<div class="sys-row"><span class="key">Statut</span><span class="val">'+(s.database.ok?'Connect&eacute;e':'Erreur')+'</span></div>'+
          '<div class="sys-row"><span class="key">Erreurs (24h)</span><span class="val">'+s.errors_24h+'</span></div>'+
          (s.database.error?'<div class="sys-row"><span class="key">Erreur</span><span class="val error-text">'+esc(s.database.error)+'</span></div>':'')+
        '</div>'+
        '<div class="sys-card"><h3>Configuration</h3>'+
          '<div class="sys-row"><span class="key">Environnement</span><span class="val">'+esc(c.environment)+'</span></div>'+
          '<div class="sys-row"><span class="key">LLM</span><span class="val">'+esc(c.llm_primary)+' / '+esc(c.llm_model)+'</span></div>'+
          '<div class="sys-row"><span class="key">Mon&eacute;tisation</span><span class="val">'+esc(c.monetization_mode)+'</span></div>'+
          '<div class="sys-row"><span class="key">Sessions gratuites</span><span class="val">'+c.free_sessions_per_week+'/sem</span></div>'+
          '<div class="sys-row"><span class="key">Rate limiting</span><span class="val">'+(c.rate_limit_enabled?'Activ&eacute; ('+c.rate_limit_chat+')':'D&eacute;sactiv&eacute;')+'</span></div>'+
          '<div class="sys-row"><span class="key">Chiffrement PII</span><span class="val">'+(c.field_encryption_enabled?'Activ&eacute;':'D&eacute;sactiv&eacute;')+'</span></div>'+
          '<div class="sys-row"><span class="key">Prix premium</span><span class="val">'+c.premium_price_monthly+'$ / '+c.premium_price_yearly+'$</span></div>'+
          '<div class="sys-row"><span class="key">Origines CORS</span><span class="val">'+c.cors_origins+'</span></div>'+
        '</div>'+
      '</div>';
    loadErrorLogs();
  }catch(e){el.innerHTML='<p class="empty">Erreur de chargement</p>'}
}
async function loadErrorLogs(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('errors-tbody');
  tbody.innerHTML='<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/system/errors?page='+currentPage+'&per_page=20');
    if(!d.errors.length){tbody.innerHTML='<tr><td colspan="5" class="empty"><p>Aucune erreur enregistr&eacute;e</p></td></tr>';return}
    tbody.innerHTML=d.errors.map(e=>'<tr>'+
      '<td><span class="badge badge-error">'+esc(e.source)+'</span></td>'+
      '<td style="color:var(--on-surface-v);font-size:13px">'+(e.method||'')+' '+esc(e.path||'')+'</td>'+
      '<td class="error-text">'+esc(e.message)+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+esc(e.detail||'')+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(e.created_at)+'</td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total,'errors-pagination','loadErrorLogs');
  }catch(e){tbody.innerHTML='<tr><td colspan="5" class="empty">Erreur de chargement</td></tr>'}
}

if(token)showApp();

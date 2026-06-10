const SUPABASE_URL='https://wuotmkhbutjhkuxlscrd.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1b3Rta2hidXRqaGt1eGxzY3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNDg0NTgsImV4cCI6MjA5NjYyNDQ1OH0.OeMfMvCQL7sMvi5V2Z1pZX7QUkLPVqUPg1Gwl4cMh_Q';
const CLAUDE_KEY='SUA_CHAVE_CLAUDE_AQUI';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const BADGE={
  'Aprovado':'s-aprovado','Aguardando retorno do paciente':'s-aguardando',
  'Sem resposta do paciente':'s-sem-resposta','Cancelado':'s-cancelado',
  'Aguardando OPME':'s-opme','Aguardando Anestesista':'s-anestesista',
  'Aguardando segundo cirurgião':'s-cirurgiao','Aguardando retorno do médico':'s-medico'
};
const COLORS=['#1D9E75','#BA7517','#D85A30','#534AB7','#185FA5','#639922','#993556','#888780'];
let chartInst={};
let editProcId=null,editPacId=null,editPagId=null,editValId=null,editProntId=null;
let evaVal=null,vozRec=null,vozCampoAtivo=null;
let perfilUsuario='secretaria',usuarioNome='';
let cachedPac=[],cachedProcs=[],cachedPags=[],cachedVals=[],cachedPronts=[],cachedUsers=[];
let anexosPendentes=[];
let currentProntId=null;

const fmtBRL=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate=d=>{if(!d)return'—';try{const[y,m,di]=d.split('-');return`${di}/${m}/${y}`}catch{return d}};
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function showToast(msg,err=false){
  const t=document.getElementById('toast');
  t.innerHTML=(err?'<i class="ti ti-x"></i>':'<i class="ti ti-check"></i>')+msg;
  t.className='toast'+(err?' error':'');t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

/* ===== AUTH ===== */
async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pwd=document.getElementById('loginPwd').value;
  const btn=document.getElementById('btnLogin');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i>Entrando...';
  const{data,error}=await sb.auth.signInWithPassword({email,password:pwd});
  btn.disabled=false;btn.innerHTML='<i class="ti ti-lock-open"></i>Entrar';
  if(error){const e=document.getElementById('loginErr');e.style.display='block';e.textContent='E-mail ou senha inválidos.';return}
  await initApp(data.user);
}

async function doLogout(){
  await sb.auth.signOut();
  document.getElementById('mainApp').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginEmail').value='';
  document.getElementById('loginPwd').value='';
}

async function alterarSenha(){
  const nova=document.getElementById('novaSenha').value;
  const conf=document.getElementById('confirmSenha').value;
  const msg=document.getElementById('senhaMsg');
  if(nova.length<6){msg.style.display='block';msg.style.background='#FCEBEB';msg.style.color='#A32D2D';msg.textContent='Mínimo 6 caracteres.';return}
  if(nova!==conf){msg.style.display='block';msg.style.background='#FCEBEB';msg.style.color='#A32D2D';msg.textContent='Senhas não coincidem.';return}
  const{error}=await sb.auth.updateUser({password:nova});
  if(error){msg.style.display='block';msg.style.background='#FCEBEB';msg.style.color='#A32D2D';msg.textContent='Erro: '+error.message;return}
  msg.style.display='block';msg.style.background='#EAF3DE';msg.style.color='#3B6D11';msg.textContent='Senha alterada com sucesso!';
}

/* ===== INIT ===== */
async function initApp(user){
  document.getElementById('loginScreen').style.display='none';
  const m=document.getElementById('mainApp');m.style.display='flex';m.style.flexDirection='column';
  const{data:perfData}=await sb.from('usuarios').select('*').eq('id',user.id).single();
  perfilUsuario=perfData?.perfil||'secretaria';
  usuarioNome=perfData?.nome||user.email;
  document.getElementById('headerSub').textContent=usuarioNome+' · '+(perfilUsuario==='medico'?'Médico':'Secretária');
  document.getElementById('perfilLabel').textContent='Conectado como '+(perfilUsuario==='medico'?'Médico — acesso completo':'Secretária — acesso restrito');
  applyPerfil();
  await Promise.all([loadPac(),loadProcs(),loadVals(),loadPags(),loadPronts(),loadUsers()]);
  renderProc();renderPacientes();renderValores();renderPag();renderProntuarios();renderUsuarios();
  checkFollowUps();
}

function applyPerfil(){
  const isMedico=perfilUsuario==='medico';
  document.querySelectorAll('.medico-only').forEach(el=>{
    el.classList.toggle('hidden',!isMedico);
  });
}

/* ===== DATA LOADERS ===== */
async function loadPac(){const{data}=await sb.from('pacientes').select('*').order('nome');cachedPac=data||[];populateSelects()}
async function loadProcs(){const{data}=await sb.from('procedimentos').select('*').order('created_at',{ascending:false});cachedProcs=data||[]}
async function loadVals(){const{data}=await sb.from('tabela_valores').select('*').order('nome');cachedVals=data||[];populateProcSel()}
async function loadPags(){const{data}=await sb.from('pagamentos').select('*').order('created_at',{ascending:false});cachedPags=data||[]}
async function loadPronts(){const{data}=await sb.from('prontuarios').select('*').order('created_at',{ascending:false});cachedPronts=data||[]}
async function loadUsers(){const{data}=await sb.from('usuarios').select('*').order('nome');cachedUsers=data||[]}

function populateSelects(){
  ['mp_paciente','pront_paciente'].forEach(id=>{
    const s=document.getElementById(id);if(!s)return;
    const cur=s.value;while(s.options.length>1)s.remove(1);
    cachedPac.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.nome;s.appendChild(o)});
    if(cur)s.value=cur;
  });
}
function populateProcSel(){
  const s=document.getElementById('mp_proc');if(!s)return;
  while(s.options.length>1)s.remove(1);
  cachedVals.forEach(v=>{const o=document.createElement('option');o.value=v.nome;o.textContent=v.nome;s.appendChild(o)});
  const ps=document.getElementById('pag_proc_id');if(!ps)return;
  while(ps.options.length>1)ps.remove(1);
  cachedProcs.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.nome_paciente+' — '+p.procedimento;ps.appendChild(o)});
}

/* ===== TABS ===== */
function showTab(t){
  const all=['procedimentos','pacientes','prontuarios','pagamentos','valores','relatorios','usuarios','config'];
  all.forEach(id=>{
    const v=document.getElementById('view-'+id);if(v)v.style.display=id===t?'block':'none';
    const b=document.getElementById('tab-'+id);if(b)b.classList.toggle('active',id===t);
  });
  if(t==='relatorios')renderRelatorios();
  if(t==='pagamentos'){populateProcSel();renderPag()}
}

/* ===== RENDER PROCEDIMENTOS ===== */
function renderProc(){
  const q=(document.getElementById('searchProc').value||'').toLowerCase();
  const st=document.getElementById('filterStatus').value;
  const f=cachedProcs.filter(p=>(!q||(p.nome_paciente+p.procedimento).toLowerCase().includes(q))&&(!st||p.status===st));
  const tb=document.getElementById('tbodyProc');
  if(!f.length){tb.innerHTML='<tr><td colspan="9"><div class="empty"><i class="ti ti-search"></i>Nenhum procedimento</div></td></tr>';return}
  tb.innerHTML=f.map(p=>`<tr>
    <td><strong>${esc(p.nome_paciente)}</strong></td>
    <td>${esc(p.procedimento||'—')}</td>
    <td style="white-space:nowrap">${esc(p.telefone||'—')}</td>
    <td style="white-space:nowrap">${fmtDate(p.d1)}</td>
    <td>${esc(p.hospital||'—')}</td>
    <td>${esc(p.turno||'—')}</td>
    <td>${p.follow_up_count>0?`<span class="fu-badge">${p.follow_up_count}x</span>`:'—'}</td>
    <td><span class="badge ${BADGE[p.status]||'s-sem-resposta'}">${esc(p.status||'—')}</span></td>
    <td style="white-space:nowrap">
      <button class="btn-icon" onclick="editProc('${p.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn-icon danger" onclick="delProc('${p.id}')"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('');
}

/* ===== RENDER PACIENTES ===== */
function renderPacientes(){
  const q=(document.getElementById('searchPac').value||'').toLowerCase();
  const f=cachedPac.filter(p=>!q||p.nome.toLowerCase().includes(q));
  const tb=document.getElementById('tbodyPac');
  if(!f.length){tb.innerHTML='<tr><td colspan="6"><div class="empty"><i class="ti ti-users"></i>Nenhum paciente</div></td></tr>';return}
  tb.innerHTML=f.map(p=>`<tr>
    <td><strong>${esc(p.nome)}</strong></td>
    <td>${esc(p.telefone||'—')}</td>
    <td>${esc(p.convenio||'—')}</td>
    <td>${p.alergias?`<span style="color:#854F0B;font-size:12px"><i class="ti ti-alert-triangle"></i> ${esc(p.alergias)}</span>`:'—'}</td>
    <td>${esc(p.comorbidades||'—')}</td>
    <td style="white-space:nowrap">
      <button class="btn-icon" onclick="editPaciente('${p.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn-icon danger" onclick="delPaciente('${p.id}')"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('');
}

/* ===== RENDER PRONTUÁRIOS ===== */
function renderProntuarios(){
  const q=(document.getElementById('searchPront').value||'').toLowerCase();
  const f=cachedPronts.filter(p=>!q||(p.nome_paciente||'').toLowerCase().includes(q));
  const tb=document.getElementById('tbodyPront');
  if(!f.length){tb.innerHTML='<tr><td colspan="7"><div class="empty"><i class="ti ti-stethoscope"></i>Nenhum prontuário</div></td></tr>';return}
  tb.innerHTML=f.map(p=>`<tr>
    <td><strong>${esc(p.nome_paciente||'—')}</strong></td>
    <td style="white-space:nowrap">${fmtDate(p.created_at?.split('T')[0])}</td>
    <td><span class="badge ${p.tipo_consulta==='Urgência'?'s-cancelado':p.tipo_consulta==='Pós-operatório'?'s-aprovado':'s-aguardando'}">${esc(p.tipo_consulta||'—')}</span></td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.queixa||'—')}</td>
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.hipotese_diagnostica||'—')}</td>
    <td>${p.tem_anexos?`<span class="badge s-opme"><i class="ti ti-paperclip" style="font-size:11px"></i> Sim</span>`:'—'}</td>
    <td style="white-space:nowrap">
      <button class="btn-icon" onclick="editProntuario('${p.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn-icon danger" onclick="delProntuario('${p.id}')"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('');
}

/* ===== RENDER PAGAMENTOS ===== */
function renderPag(){
  const q=(document.getElementById('searchPag').value||'').toLowerCase();
  const f=cachedPags.filter(p=>!q||(p.nome_paciente||'').toLowerCase().includes(q));
  document.getElementById('metricsPag').innerHTML=`
    <div class="metric"><div class="metric-label">Entradas (Agend.)</div><div class="metric-value green">${fmtBRL(f.reduce((a,p)=>a+Number(p.v_agendamento||0),0))}</div></div>
    <div class="metric"><div class="metric-label">Total Cirurgião</div><div class="metric-value amber">${fmtBRL(f.reduce((a,p)=>a+Number(p.v_cirurgiao||0),0))}</div></div>
    <div class="metric"><div class="metric-label">Total Equipe</div><div class="metric-value">${fmtBRL(f.reduce((a,p)=>a+Number(p.v_total_equipe||0),0))}</div></div>
    <div class="metric"><div class="metric-label">Registros</div><div class="metric-value">${f.length}</div></div>
  `;
  const tb=document.getElementById('tbodyPag');
  if(!f.length){tb.innerHTML='<tr><td colspan="11"><div class="empty"><i class="ti ti-cash"></i>Nenhum pagamento</div></td></tr>';return}
  tb.innerHTML=f.map(p=>`<tr>
    <td><strong>${esc(p.nome_paciente)}</strong></td><td>${esc(p.procedimento||'—')}</td>
    <td>${fmtBRL(p.v_cirurgiao)}</td><td>${fmtBRL(p.v_anestesista)}</td>
    <td>${fmtBRL(p.v_auxiliar)}</td><td>${fmtBRL(p.v_instrumentador)}</td>
    <td>${fmtBRL(p.v_opme)}</td><td>${fmtBRL(p.v_agendamento)}</td>
    <td><strong style="color:var(--teal)">${fmtBRL(p.v_total_equipe)}</strong></td>
    <td>${fmtDate(p.data_pagamento)}</td>
    <td style="white-space:nowrap">
      <button class="btn-icon" onclick="editPag('${p.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn-icon danger" onclick="delPag('${p.id}')"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('');
}

/* ===== RENDER VALORES ===== */
function renderValores(){
  const tb=document.getElementById('tbodyValores');
  if(!cachedVals.length){tb.innerHTML='<tr><td colspan="5"><div class="empty"><i class="ti ti-receipt"></i>Nenhum procedimento</div></td></tr>';return}
  tb.innerHTML=cachedVals.map(v=>`<tr>
    <td><strong>${esc(v.nome)}</strong></td>
    <td>${fmtBRL(v.valor)}</td>
    <td style="font-family:monospace;color:var(--text-muted)">${esc(v.tuss||'—')}</td>
    <td><span style="color:${v.segundo_cirurgiao==='sim'?'var(--teal)':'var(--text-muted)'}"><i class="ti ti-${v.segundo_cirurgiao==='sim'?'check':'x'}"></i> ${v.segundo_cirurgiao==='sim'?'Sim':'Não'}</span></td>
    <td style="white-space:nowrap">
      <button class="btn-icon" onclick="editValor('${v.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn-icon danger" onclick="delValor('${v.id}')"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('');
}

/* ===== RENDER USUÁRIOS ===== */
function renderUsuarios(){
  const tb=document.getElementById('tbodyUsuarios');if(!tb)return;
  if(!cachedUsers.length){tb.innerHTML='<tr><td colspan="5"><div class="empty"><i class="ti ti-users"></i>Nenhum usuário</div></td></tr>';return}
  tb.innerHTML=cachedUsers.map(u=>`<tr>
    <td><strong>${esc(u.nome||'—')}</strong></td>
    <td>${esc(u.email||'—')}</td>
    <td><span class="perfil-${u.perfil}">${u.perfil==='medico'?'Médico':'Secretária'}</span></td>
    <td><span class="badge ${u.ativo?'s-aprovado':'s-cancelado'}">${u.ativo?'Ativo':'Inativo'}</span></td>
    <td><button class="btn-icon danger" onclick="toggleUsuario('${u.id}',${u.ativo})"><i class="ti ti-${u.ativo?'ban':'check'}"></i></button></td>
  </tr>`).join('');
}

/* ===== RENDER RELATÓRIOS ===== */
function renderRelatorios(){
  const procs=cachedProcs,pags=cachedPags;
  const aprov=procs.filter(p=>p.status==='Aprovado').length;
  const uniq=[...new Set(procs.map(p=>p.nome_paciente?.trim().toLowerCase()))].length;
  document.getElementById('metricsRel').innerHTML=`
    <div class="metric"><div class="metric-label">Total Procedimentos</div><div class="metric-value">${procs.length}</div></div>
    <div class="metric"><div class="metric-label">Aprovados</div><div class="metric-value green">${aprov}</div></div>
    <div class="metric"><div class="metric-label">Pacientes Únicos</div><div class="metric-value">${uniq}</div></div>
    <div class="metric"><div class="metric-label">Entradas</div><div class="metric-value amber">${fmtBRL(pags.reduce((a,p)=>a+Number(p.v_agendamento||0),0))}</div></div>
    <div class="metric"><div class="metric-label">Total Cirurgião</div><div class="metric-value green">${fmtBRL(pags.reduce((a,p)=>a+Number(p.v_cirurgiao||0),0))}</div></div>
    <div class="metric"><div class="metric-label">Total Equipe</div><div class="metric-value">${fmtBRL(pags.reduce((a,p)=>a+Number(p.v_total_equipe||0),0))}</div></div>
  `;
  const cg=document.getElementById('chartsGrid');
  cg.innerHTML=`
    <div class="chart-box"><div class="chart-title">Status dos procedimentos</div><div style="position:relative;height:220px"><canvas id="cS"></canvas></div></div>
    <div class="chart-box"><div class="chart-title">Hospital mais utilizado</div><div style="position:relative;height:220px"><canvas id="cH"></canvas></div></div>
    <div class="chart-box"><div class="chart-title">Turno das cirurgias</div><div style="position:relative;height:220px"><canvas id="cT"></canvas></div></div>
    <div class="chart-box"><div class="chart-title">Procedimentos frequentes</div><div style="position:relative;height:220px"><canvas id="cP"></canvas></div></div>
    <div class="chart-box chart-full"><div class="chart-title">Financeiro por paciente</div><div style="position:relative;height:200px"><canvas id="cF"></canvas></div></div>
  `;
  ['cS','cH','cT','cP','cF'].forEach(id=>{if(chartInst[id]){chartInst[id].destroy();delete chartInst[id]}});
  const sC={};procs.forEach(p=>{if(p.status)sC[p.status]=(sC[p.status]||0)+1});
  const sL=Object.keys(sC).filter(k=>sC[k]>0);
  chartInst.cS=new Chart(document.getElementById('cS'),{type:'doughnut',data:{labels:sL,datasets:[{data:sL.map(k=>sC[k]),backgroundColor:COLORS,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:12}}}}});
  const hC={};procs.forEach(p=>{if(p.hospital)hC[p.hospital]=(hC[p.hospital]||0)+1});const hL=Object.keys(hC);
  chartInst.cH=new Chart(document.getElementById('cH'),{type:'bar',data:{labels:hL.length?hL:['Sem dados'],datasets:[{data:hL.length?hL.map(k=>hC[k]):[0],backgroundColor:'#1D9E75',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}}}}});
  const tC={};procs.forEach(p=>{if(p.turno)tC[p.turno]=(tC[p.turno]||0)+1});const tL=Object.keys(tC);
  chartInst.cT=new Chart(document.getElementById('cT'),{type:'pie',data:{labels:tL.length?tL:['Sem dados'],datasets:[{data:tL.length?tL.map(k=>tC[k]):[1],backgroundColor:['#1D9E75','#085041'],borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}}}});
  const pC={};procs.forEach(p=>{if(p.procedimento)pC[p.procedimento]=(pC[p.procedimento]||0)+1});const pL=Object.keys(pC).sort((a,b)=>pC[b]-pC[a]).slice(0,7);
  chartInst.cP=new Chart(document.getElementById('cP'),{type:'bar',data:{labels:pL.length?pL:['Sem dados'],datasets:[{data:pL.length?pL.map(k=>pC[k]):[0],backgroundColor:'#BA7517',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1}}}}});
  const pNomes=pags.map(p=>p.nome_paciente?.split(' ')[0]||'');
  chartInst.cF=new Chart(document.getElementById('cF'),{type:'bar',data:{labels:pNomes.length?pNomes:['Sem dados'],datasets:[{label:'Agendamento',data:pags.map(p=>p.v_agendamento||0),backgroundColor:'#BA7517',borderRadius:4},{label:'Cirurgião',data:pags.map(p=>p.v_cirurgiao||0),backgroundColor:'#1D9E75',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}},scales:{y:{beginAtZero:true}}}});
}

/* ===== FOLLOW-UP ===== */
async function checkFollowUps(){
  const hoje=new Date();
  const ag=cachedProcs.filter(p=>p.status==='Aguardando retorno do paciente');
  let n=0;
  for(const p of ag){
    const ref=p.ultimo_follow_up?new Date(p.ultimo_follow_up):new Date(p.created_at);
    const diff=Math.floor((hoje-ref)/(1000*60*60*24));
    if(diff>=5){
      const cnt=(p.follow_up_count||0)+1;
      const novoStatus=cnt>=3?'Sem resposta do paciente':'Aguardando retorno do paciente';
      const{error}=await sb.from('procedimentos').update({follow_up_count:cnt,ultimo_follow_up:hoje.toISOString(),status:novoStatus}).eq('id',p.id);
      if(!error){p.follow_up_count=cnt;p.ultimo_follow_up=hoje.toISOString();p.status=novoStatus;n++}
    }
  }
  showToast(n>0?`${n} follow-up(s) processado(s)!`:'Follow-ups verificados — tudo ok');
  if(n>0)renderProc();
}

/* ===== CRUD PROCEDIMENTOS ===== */
function openModalProc(id){
  editProcId=id||null;
  document.getElementById('modalProcTitle').textContent=id?'Editar Procedimento':'Novo Procedimento';
  ['mp_tel','mp_convenio','mp_hosp','mp_d1','mp_d2','mp_d3','mp_d4','mp_d5'].forEach(f=>document.getElementById(f).value='');
  ['mp_paciente','mp_proc','mp_acomoda','mp_turno'].forEach(f=>document.getElementById(f).value='');
  document.getElementById('mp_status').value='Aguardando retorno do paciente';
  populateSelects();populateProcSel();
  if(id){const p=cachedProcs.find(x=>x.id===id);if(p){
    document.getElementById('mp_paciente').value=p.paciente_id||'';
    document.getElementById('mp_proc').value=p.procedimento||'';
    document.getElementById('mp_tel').value=p.telefone||'';
    document.getElementById('mp_convenio').value=p.convenio||'';
    ['d1','d2','d3','d4','d5'].forEach(d=>document.getElementById('mp_'+d).value=p[d]||'');
    document.getElementById('mp_hosp').value=p.hospital||'';
    document.getElementById('mp_acomoda').value=p.acomoda||'';
    document.getElementById('mp_turno').value=p.turno||'';
    document.getElementById('mp_status').value=p.status||'';
  }}
  document.getElementById('modalProc').classList.add('open');
}
function autoFillTel(){
  const id=document.getElementById('mp_paciente').value;
  const pac=cachedPac.find(p=>p.id===id);
  if(pac?.telefone)document.getElementById('mp_tel').value=pac.telefone;
}
async function saveProc(){
  const pacId=document.getElementById('mp_paciente').value;
  const pac=cachedPac.find(p=>p.id===pacId);
  if(!pac)return showToast('Selecione um paciente.',true);
  const obj={paciente_id:pacId,nome_paciente:pac.nome,procedimento:document.getElementById('mp_proc').value,telefone:document.getElementById('mp_tel').value,convenio:document.getElementById('mp_convenio').value,d1:document.getElementById('mp_d1').value||null,d2:document.getElementById('mp_d2').value||null,d3:document.getElementById('mp_d3').value||null,d4:document.getElementById('mp_d4').value||null,d5:document.getElementById('mp_d5').value||null,status:document.getElementById('mp_status').value,hospital:document.getElementById('mp_hosp').value,acomoda:document.getElementById('mp_acomoda').value,turno:document.getElementById('mp_turno').value};
  let err;
  if(editProcId){const r=await sb.from('procedimentos').update(obj).eq('id',editProcId);err=r.error}
  else{const r=await sb.from('procedimentos').insert(obj);err=r.error}
  if(err)return showToast('Erro: '+err.message,true);
  showToast('Procedimento salvo!');closeModal('modalProc');
  await loadProcs();populateProcSel();renderProc();
}
function editProc(id){openModalProc(id)}
async function delProc(id){if(!confirm('Excluir?'))return;const{error}=await sb.from('procedimentos').delete().eq('id',id);if(error)return showToast('Erro.',true);showToast('Excluído!');cachedProcs=cachedProcs.filter(p=>p.id!==id);renderProc()}

/* ===== CRUD PACIENTES ===== */
function openModalPaciente(id){
  editPacId=id||null;
  document.getElementById('modalPacTitle').textContent=id?'Editar Paciente':'Novo Paciente';
  ['pac_nome','pac_nasc','pac_tel','pac_convenio','pac_alergia','pac_comorbidade','pac_medicamentos'].forEach(f=>document.getElementById(f).value='');
  ['pac_sexo','pac_sangue'].forEach(f=>document.getElementById(f).value='');
  if(id){const p=cachedPac.find(x=>x.id===id);if(p){
    document.getElementById('pac_nome').value=p.nome||'';
    document.getElementById('pac_nasc').value=p.data_nascimento||'';
    document.getElementById('pac_sexo').value=p.sexo||'';
    document.getElementById('pac_tel').value=p.telefone||'';
    document.getElementById('pac_convenio').value=p.convenio||'';
    document.getElementById('pac_sangue').value=p.tipo_sanguineo||'';
    document.getElementById('pac_alergia').value=p.alergias||'';
    document.getElementById('pac_comorbidade').value=p.comorbidades||'';
    document.getElementById('pac_medicamentos').value=p.medicamentos||'';
  }}
  document.getElementById('modalPaciente').classList.add('open');
}
async function savePaciente(){
  const nome=document.getElementById('pac_nome').value.trim();
  if(!nome)return showToast('Informe o nome.',true);
  const obj={nome,data_nascimento:document.getElementById('pac_nasc').value||null,sexo:document.getElementById('pac_sexo').value,telefone:document.getElementById('pac_tel').value,convenio:document.getElementById('pac_convenio').value,tipo_sanguineo:document.getElementById('pac_sangue').value,alergias:document.getElementById('pac_alergia').value,comorbidades:document.getElementById('pac_comorbidade').value,medicamentos:document.getElementById('pac_medicamentos').value};
  let err;
  if(editPacId){const r=await sb.from('pacientes').update(obj).eq('id',editPacId);err=r.error}
  else{const r=await sb.from('pacientes').insert(obj);err=r.error}
  if(err)return showToast('Erro: '+err.message,true);
  showToast('Paciente salvo!');closeModal('modalPaciente');await loadPac();renderPacientes();
}
function editPaciente(id){openModalPaciente(id)}
async function delPaciente(id){if(!confirm('Excluir?'))return;const{error}=await sb.from('pacientes').delete().eq('id',id);if(error)return showToast('Erro.',true);showToast('Excluído!');cachedPac=cachedPac.filter(p=>p.id!==id);populateSelects();renderPacientes()}

/* ===== CRUD PRONTUÁRIOS ===== */
function openModalProntuario(id){
  editProntId=id||null;evaVal=null;anexosPendentes=[];currentProntId=id||null;
  document.getElementById('modalProntTitle').textContent=id?'Editar Prontuário':'Novo Prontuário';
  document.getElementById('pront_paciente').value='';
  document.getElementById('pront_tipo').value='Primeira consulta';
  document.getElementById('pront_data').value=new Date().toISOString().split('T')[0];
  ['pront_queixa','pront_cir_ant','pront_hist_fam','pront_obs_anam','pront_pa','pront_fc','pront_temp','pront_peso','pront_altura','pront_imc','pront_obs_ex','pront_psa','pront_psa_l','pront_creat','pront_outros','pront_orient','pront_obs_cond'].forEach(f=>document.getElementById(f).value='');
  ['pront_abdome','pront_ppl','pront_gen','pront_toque','pront_uroc','pront_proc_ind'].forEach(f=>document.getElementById(f).value='');
  document.getElementById('pront_urg').value='Eletiva';
  document.getElementById('pront_tiporet').value='Presencial';
  document.querySelectorAll('#chips_sint .chip,#chips_exs .chip,#chips_cid .chip').forEach(c=>c.classList.remove('on'));
  document.querySelectorAll('#eva_nums .snum').forEach(c=>c.classList.remove('on'));
  document.getElementById('medList').innerHTML='';
  document.getElementById('anexosList').innerHTML='';
  document.getElementById('psaAlerta').style.display='none';
  document.getElementById('iaBox').style.display='none';
  goPTabByName('anamnese');
  populateSelects();
  if(id){
    const p=cachedPronts.find(x=>x.id===id);
    if(p){
      document.getElementById('pront_paciente').value=p.paciente_id||'';
      document.getElementById('pront_tipo').value=p.tipo_consulta||'';
      document.getElementById('pront_queixa').value=p.queixa||'';
      if(p.sintomas){const s=p.sintomas.split(',');document.querySelectorAll('#chips_sint .chip').forEach(c=>{if(s.includes(c.textContent.trim()))c.classList.add('on')})}
      if(p.eva!=null){evaVal=p.eva;document.querySelectorAll('#eva_nums .snum').forEach((el,i)=>{el.classList.toggle('on',i===p.eva)})}
      document.getElementById('pront_cir_ant').value=p.cirurgias_anteriores||'';
      document.getElementById('pront_hist_fam').value=p.historico_familiar||'';
      document.getElementById('pront_obs_anam').value=p.obs_anamnese||'';
      document.getElementById('pront_pa').value=p.pa||'';document.getElementById('pront_fc').value=p.fc||'';
      document.getElementById('pront_temp').value=p.temperatura||'';document.getElementById('pront_peso').value=p.peso||'';
      document.getElementById('pront_altura').value=p.altura||'';document.getElementById('pront_imc').value=p.imc||'';
      document.getElementById('pront_abdome').value=p.abdome||'';document.getElementById('pront_ppl').value=p.ppl||'';
      document.getElementById('pront_gen').value=p.genitalia||'';document.getElementById('pront_toque').value=p.toque_retal||'';
      document.getElementById('pront_obs_ex').value=p.obs_exame||'';
      if(p.exames_solicitados){const e=p.exames_solicitados.split(',');document.querySelectorAll('#chips_exs .chip').forEach(c=>{if(e.includes(c.textContent.trim()))c.classList.add('on')})}
      document.getElementById('pront_psa').value=p.psa||'';document.getElementById('pront_psa_l').value=p.psa_livre||'';
      document.getElementById('pront_creat').value=p.creatinina||'';document.getElementById('pront_uroc').value=p.urocultura||'';
      document.getElementById('pront_outros').value=p.outros_resultados||'';
      if(p.hipotese_diagnostica){const c=p.hipotese_diagnostica.split(',');document.querySelectorAll('#chips_cid .chip').forEach(ch=>{if(c.includes(ch.textContent.trim()))ch.classList.add('on')})}
      document.getElementById('pront_proc_ind').value=p.procedimento_indicado||'';
      document.getElementById('pront_urg').value=p.urgencia_cirurgica||'Eletiva';
      document.getElementById('pront_ret').value=p.data_retorno||'';
      document.getElementById('pront_tiporet').value=p.tipo_retorno||'Presencial';
      document.getElementById('pront_orient').value=p.orientacoes||'';
      document.getElementById('pront_obs_cond').value=p.obs_conduta||'';
      if(p.medicamentos_prescritos){try{JSON.parse(p.medicamentos_prescritos).forEach(m=>addMedVals(m.nome,m.dose,m.freq,m.dur))}catch{}}
      carregarAnexos(id);
    }
  }
  document.getElementById('modalProntuario').classList.add('open');
}
async function saveProntuario(){
  const pacId=document.getElementById('pront_paciente').value;
  const pac=cachedPac.find(p=>p.id===pacId);
  if(!pac)return showToast('Selecione um paciente.',true);
  const sint=[...document.querySelectorAll('#chips_sint .chip.on')].map(c=>c.textContent.trim()).join(',');
  const exs=[...document.querySelectorAll('#chips_exs .chip.on')].map(c=>c.textContent.trim()).join(',');
  const cids=[...document.querySelectorAll('#chips_cid .chip.on')].map(c=>c.textContent.trim()).join(',');
  const meds=[...document.querySelectorAll('#medList .med-row')].map(r=>({nome:r.querySelector('.mn').value,dose:r.querySelector('.md').value,freq:r.querySelector('.mf').value,dur:r.querySelector('.mdu').value}));
  const obj={paciente_id:pacId,nome_paciente:pac.nome,tipo_consulta:document.getElementById('pront_tipo').value,queixa:document.getElementById('pront_queixa').value,sintomas:sint,eva:evaVal,cirurgias_anteriores:document.getElementById('pront_cir_ant').value,historico_familiar:document.getElementById('pront_hist_fam').value,obs_anamnese:document.getElementById('pront_obs_anam').value,pa:document.getElementById('pront_pa').value,fc:document.getElementById('pront_fc').value,temperatura:document.getElementById('pront_temp').value,peso:document.getElementById('pront_peso').value,altura:document.getElementById('pront_altura').value,imc:document.getElementById('pront_imc').value,abdome:document.getElementById('pront_abdome').value,ppl:document.getElementById('pront_ppl').value,genitalia:document.getElementById('pront_gen').value,toque_retal:document.getElementById('pront_toque').value,obs_exame:document.getElementById('pront_obs_ex').value,exames_solicitados:exs,psa:document.getElementById('pront_psa').value,psa_livre:document.getElementById('pront_psa_l').value,creatinina:document.getElementById('pront_creat').value,urocultura:document.getElementById('pront_uroc').value,outros_resultados:document.getElementById('pront_outros').value,hipotese_diagnostica:cids,medicamentos_prescritos:JSON.stringify(meds),procedimento_indicado:document.getElementById('pront_proc_ind').value,urgencia_cirurgica:document.getElementById('pront_urg').value,data_retorno:document.getElementById('pront_ret').value||null,tipo_retorno:document.getElementById('pront_tiporet').value,orientacoes:document.getElementById('pront_orient').value,obs_conduta:document.getElementById('pront_obs_cond').value,tem_anexos:anexosPendentes.length>0};
  let prontId=editProntId;
  if(editProntId){const{error}=await sb.from('prontuarios').update(obj).eq('id',editProntId);if(error)return showToast('Erro: '+error.message,true)}
  else{const{data,error}=await sb.from('prontuarios').insert(obj).select().single();if(error)return showToast('Erro: '+error.message,true);prontId=data.id}
  if(anexosPendentes.length>0)await uploadAnexosParaStorage(prontId);
  showToast('Prontuário salvo!');closeModal('modalProntuario');await loadPronts();renderProntuarios();
}
function editProntuario(id){openModalProntuario(id)}
async function delProntuario(id){if(!confirm('Excluir?'))return;const{error}=await sb.from('prontuarios').delete().eq('id',id);if(error)return showToast('Erro.',true);showToast('Excluído!');cachedPronts=cachedPronts.filter(p=>p.id!==id);renderProntuarios()}

/* ===== ANEXOS ===== */
function uploadAnexos(files){
  for(const file of files){
    const reader=new FileReader();
    reader.onload=e=>{
      anexosPendentes.push({file,dataUrl:e.target.result});
      renderAnexosPendentes();
    };
    reader.readAsDataURL(file);
  }
}

function renderAnexosPendentes(){
  const el=document.getElementById('anexosList');
  el.innerHTML=anexosPendentes.map((a,i)=>{
    const isImg=a.file.type.startsWith('image/');
    return`<div class="anexo-item">
      <div class="anexo-icon"><i class="ti ti-${isImg?'photo':'file-text'}"></i></div>
      <span class="anexo-nome">${esc(a.file.name)}</span>
      <span style="font-size:11px;color:var(--text-muted)">${(a.file.size/1024).toFixed(0)}KB</span>
      ${isImg?`<button class="btn-icon" onclick="previewImagem('${a.dataUrl}','${esc(a.file.name)}')"><i class="ti ti-eye"></i></button>`:''}
      <button class="btn-icon danger" onclick="remAnexo(${i})"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
}

function remAnexo(i){anexosPendentes.splice(i,1);renderAnexosPendentes()}

async function uploadAnexosParaStorage(prontId){
  for(const a of anexosPendentes){
    const path=`prontuarios/${prontId}/${Date.now()}_${a.file.name}`;
    await sb.storage.from('anexos').upload(path,a.file,{cacheControl:'3600',upsert:false});
  }
}

async function carregarAnexos(prontId){
  const{data}=await sb.storage.from('anexos').list(`prontuarios/${prontId}`);
  if(!data||!data.length)return;
  const el=document.getElementById('anexosList');
  el.innerHTML=data.map(f=>{
    const{data:urlData}=sb.storage.from('anexos').getPublicUrl(`prontuarios/${prontId}/${f.name}`);
    const url=urlData.publicUrl;
    const isImg=/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name);
    return`<div class="anexo-item">
      <div class="anexo-icon"><i class="ti ti-${isImg?'photo':'file-text'}"></i></div>
      <span class="anexo-nome">${esc(f.name)}</span>
      ${isImg?`<button class="btn-icon" onclick="previewImagem('${url}','${esc(f.name)}')"><i class="ti ti-eye"></i></button>`:''}
      <a href="${url}" target="_blank" class="btn-icon" title="Baixar"><i class="ti ti-download"></i></a>
    </div>`;
  }).join('');
}

function previewImagem(src,nome){
  document.getElementById('imgModalTitle').textContent=nome;
  document.getElementById('imgModalSrc').src=src;
  document.getElementById('modalImagem').classList.add('open');
}

/* ===== CRUD PAGAMENTOS ===== */
function openModalPag(id){
  editPagId=id||null;
  document.getElementById('modalPagTitle').textContent=id?'Editar Pagamento':'Registrar Pagamento';
  populateProcSel();
  document.getElementById('pag_proc_id').value='';document.getElementById('pag_proc').value='';
  document.getElementById('pag_hosp').value='';document.getElementById('pag_data').value='';
  ['pag_vhosp','pag_vcirg','pag_vaux','pag_vanest','pag_vinstr','pag_opme','pag_vagend'].forEach(f=>document.getElementById(f).value='0');
  calcTotais();
  if(id){const p=cachedPags.find(x=>x.id===id);if(p){
    document.getElementById('pag_proc_id').value=p.procedimento_id||'';
    document.getElementById('pag_proc').value=p.procedimento||'';
    document.getElementById('pag_hosp').value=p.hospital||'';
    document.getElementById('pag_data').value=p.data_pagamento||'';
    document.getElementById('pag_vhosp').value=p.v_hospital||0;
    document.getElementById('pag_vcirg').value=p.v_cirurgiao||0;
    document.getElementById('pag_vaux').value=p.v_auxiliar||0;
    document.getElementById('pag_vanest').value=p.v_anestesista||0;
    document.getElementById('pag_vinstr').value=p.v_instrumentador||0;
    document.getElementById('pag_opme').value=p.v_opme||0;
    document.getElementById('pag_vagend').value=p.v_agendamento||0;
    calcTotais();
  }}
  document.getElementById('modalPag').classList.add('open');
}
function autoFillPag(){
  const id=document.getElementById('pag_proc_id').value;
  const p=cachedProcs.find(x=>x.id===id);
  if(p){
    document.getElementById('pag_proc').value=p.procedimento||'';
    document.getElementById('pag_hosp').value=p.hospital||'';
    const v=cachedVals.find(x=>x.nome===p.procedimento);
    if(v){document.getElementById('pag_vcirg').value=v.valor||0;document.getElementById('pag_vinstr').value=Math.round(Number(v.valor)*0.1)||0;document.getElementById('pag_vagend').value=Math.round(Number(v.valor)*0.05)||0;calcTotais()}
  }
}
function calcTotais(){
  const c=Number(document.getElementById('pag_vcirg').value||0);const a=Number(document.getElementById('pag_vaux').value||0);const an=Number(document.getElementById('pag_vanest').value||0);const i=Number(document.getElementById('pag_vinstr').value||0);const o=Number(document.getElementById('pag_opme').value||0);const ag=Number(document.getElementById('pag_vagend').value||0);
  document.getElementById('totalEq').textContent=fmtBRL(c+a+an+i+o+ag);
  document.getElementById('totalAg').textContent=fmtBRL(ag);
  document.getElementById('totalCi').textContent=fmtBRL(c);
}
async function savePag(){
  const procId=document.getElementById('pag_proc_id').value;if(!procId)return showToast('Selecione um procedimento.',true);
  const pSel=document.getElementById('pag_proc_id');const nome=pSel.options[pSel.selectedIndex]?.text.split(' — ')[0]||'';
  const vc=Number(document.getElementById('pag_vcirg').value||0),va=Number(document.getElementById('pag_vaux').value||0),van=Number(document.getElementById('pag_vanest').value||0),vi=Number(document.getElementById('pag_vinstr').value||0),vo=Number(document.getElementById('pag_opme').value||0),vag=Number(document.getElementById('pag_vagend').value||0);
  const obj={procedimento_id:procId,nome_paciente:nome,procedimento:document.getElementById('pag_proc').value,hospital:document.getElementById('pag_hosp').value,data_pagamento:document.getElementById('pag_data').value||null,v_hospital:Number(document.getElementById('pag_vhosp').value||0),v_cirurgiao:vc,v_auxiliar:va,v_anestesista:van,v_instrumentador:vi,v_opme:vo,v_agendamento:vag,v_total_equipe:vc+va+van+vi+vo+vag};
  let err;
  if(editPagId){const r=await sb.from('pagamentos').update(obj).eq('id',editPagId);err=r.error}
  else{const r=await sb.from('pagamentos').insert(obj);err=r.error}
  if(err)return showToast('Erro: '+err.message,true);
  showToast('Pagamento salvo!');closeModal('modalPag');await loadPags();renderPag();
}
function editPag(id){openModalPag(id)}
async function delPag(id){if(!confirm('Excluir?'))return;const{error}=await sb.from('pagamentos').delete().eq('id',id);if(error)return showToast('Erro.',true);showToast('Excluído!');cachedPags=cachedPags.filter(p=>p.id!==id);renderPag()}

/* ===== CRUD VALORES ===== */
function openModalValor(id){
  editValId=id||null;
  document.getElementById('modalValorTitle').textContent=id?'Editar':'Novo Procedimento';
  document.getElementById('val_nome').value='';document.getElementById('val_valor').value='0';document.getElementById('val_tuss').value='';document.getElementById('val_2cir').value='não';
  if(id){const v=cachedVals.find(x=>x.id===id);if(v){document.getElementById('val_nome').value=v.nome;document.getElementById('val_valor').value=v.valor||0;document.getElementById('val_tuss').value=v.tuss||'';document.getElementById('val_2cir').value=v.segundo_cirurgiao||'não'}}
  document.getElementById('modalValor').classList.add('open');
}
async function saveValor(){
  const nome=document.getElementById('val_nome').value.trim();if(!nome)return showToast('Informe o nome.',true);
  const obj={nome,valor:Number(document.getElementById('val_valor').value||0),tuss:document.getElementById('val_tuss').value,segundo_cirurgiao:document.getElementById('val_2cir').value};
  let err;
  if(editValId){const r=await sb.from('tabela_valores').update(obj).eq('id',editValId);err=r.error}
  else{const r=await sb.from('tabela_valores').insert(obj);err=r.error}
  if(err)return showToast('Erro: '+err.message,true);
  showToast('Salvo!');closeModal('modalValor');await loadVals();renderValores();
}
function editValor(id){openModalValor(id)}
async function delValor(id){if(!confirm('Excluir?'))return;const{error}=await sb.from('tabela_valores').delete().eq('id',id);if(error)return showToast('Erro.',true);showToast('Excluído!');cachedVals=cachedVals.filter(v=>v.id!==id);renderValores();populateProcSel()}

/* ===== USUÁRIOS ===== */
function openModalUsuario(){document.getElementById('usr_nome').value='';document.getElementById('usr_email').value='';document.getElementById('usr_senha').value='';document.getElementById('usr_perfil').value='secretaria';document.getElementById('modalUsuario').classList.add('open')}
async function saveUsuario(){
  const email=document.getElementById('usr_email').value.trim();
  const senha=document.getElementById('usr_senha').value;
  const nome=document.getElementById('usr_nome').value.trim();
  const perfil=document.getElementById('usr_perfil').value;
  if(!email||!senha)return showToast('Preencha e-mail e senha.',true);
  if(senha.length<6)return showToast('Senha mínimo 6 caracteres.',true);
  const{data,error}=await sb.auth.admin.createUser({email,password:senha,email_confirm:true});
  if(error){showToast('Erro ao criar usuário: use o painel do Supabase → Authentication → Users → Invite user.',true);closeModal('modalUsuario');return}
  await sb.from('usuarios').insert({id:data.user.id,nome,email,perfil,ativo:true});
  showToast('Usuário criado!');closeModal('modalUsuario');await loadUsers();renderUsuarios();
}
async function toggleUsuario(id,ativo){
  await sb.from('usuarios').update({ativo:!ativo}).eq('id',id);
  showToast(ativo?'Usuário desativado':'Usuário ativado');await loadUsers();renderUsuarios();
}

/* ===== IA — SUGESTÃO DIAGNÓSTICO ===== */
async function pedirSugestaoIA(){
  const queixa=document.getElementById('pront_queixa').value;
  const sint=[...document.querySelectorAll('#chips_sint .chip.on')].map(c=>c.textContent.trim()).join(', ');
  const psa=document.getElementById('pront_psa').value;
  if(!queixa&&!sint)return showToast('Preencha a queixa ou sintomas primeiro.',true);
  const box=document.getElementById('iaBox');const txt=document.getElementById('iaTxt');
  box.style.display='block';txt.textContent='Analisando...';
  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',max_tokens:400,
        messages:[{role:'user',content:`Você é um assistente clínico especializado em urologia. Com base nos dados abaixo, sugira brevemente os principais diagnósticos diferenciais e exames mais relevantes. Seja conciso e objetivo.\n\nQueixa: ${queixa}\nSintomas: ${sint||'não informados'}\nPSA: ${psa||'não informado'}\n\nResponda em português, sem introdução, direto ao ponto.`}]
      })
    });
    const d=await resp.json();
    txt.textContent=d.content?.[0]?.text||'Não foi possível gerar sugestão.';
  }catch(e){txt.textContent='Configure a chave da API do Claude em app.js para usar este recurso.'}
}

/* ===== VOZ ===== */
function toggleVoz(){
  if(vozRec&&vozRec.recording){pararVoz();return}
  iniciarVozCampo('pront_queixa');
}
function iniciarVozCampo(campoId){
  if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window)){showToast('Navegador não suporta reconhecimento de voz. Use o Chrome.',true);return}
  const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
  const rec=new SpeechRec();
  rec.lang='pt-BR';rec.continuous=true;rec.interimResults=true;
  vozCampoAtivo=campoId;vozRec=rec;
  const status=document.getElementById('vozStatus');const vozTxt=document.getElementById('vozTxt');
  status.style.display='flex';
  rec.onresult=e=>{
    let txt='';for(let i=e.resultIndex;i<e.results.length;i++){txt+=e.results[i][0].transcript}
    const campo=document.getElementById(vozCampoAtivo);if(campo)campo.value=txt;
    vozTxt.textContent='Ouvindo: "'+txt.slice(-60)+'"';
  };
  rec.onerror=()=>{status.style.display='none';showToast('Erro no reconhecimento de voz.',true)};
  rec.onend=()=>{status.style.display='none'};
  rec.start();
  rec.recording=true;
  showToast('Ditado iniciado — fale agora!');
}
function pararVoz(){if(vozRec){vozRec.stop();vozRec=null}document.getElementById('vozStatus').style.display='none'}

/* ===== PRONTUÁRIO HELPERS ===== */
function goPTab(name,btn){
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.ppanel').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');document.getElementById('pp-'+name).classList.add('on');
}
function goPTabByName(name){
  const tabs=['anamnese','exame','exames','conduta','anexos'];
  const btns=document.querySelectorAll('.ptab');const idx=tabs.indexOf(name);if(idx<0)return;
  btns.forEach(t=>t.classList.remove('on'));document.querySelectorAll('.ppanel').forEach(p=>p.classList.remove('on'));
  btns[idx].classList.add('on');document.getElementById('pp-'+name).classList.add('on');
}
function selEva(n){evaVal=n;document.querySelectorAll('#eva_nums .snum').forEach((el,i)=>el.classList.toggle('on',i===n))}
function calcImc(){
  const p=parseFloat(String(document.getElementById('pront_peso').value).replace(',','.'));
  const a=parseFloat(String(document.getElementById('pront_altura').value).replace(',','.'));
  if(p&&a&&a>0){const imc=(p/(a*a)).toFixed(1);let l='';if(imc<18.5)l=' Abaixo peso';else if(imc<25)l=' Normal';else if(imc<30)l=' Sobrepeso';else l=' Obesidade';document.getElementById('pront_imc').value=imc+l}
}
function checkPsa(){
  const v=parseFloat(String(document.getElementById('pront_psa').value).replace(',','.'));
  const box=document.getElementById('psaAlerta'),txt=document.getElementById('psaAlertaTxt');
  if(!isNaN(v)){if(v>10){box.style.display='flex';txt.textContent='PSA elevado ('+v+' ng/mL) — avaliar biópsia ou RM próstata'}else if(v>4){box.style.display='flex';txt.textContent='PSA limítrofe ('+v+' ng/mL) — considerar PSA livre ou RM'}else box.style.display='none'}else box.style.display='none';
}
function addMed(){addMedVals('','','','')}
function addMedVals(nome,dose,freq,dur){
  const div=document.createElement('div');div.className='med-row';
  div.innerHTML=`<input class="mn" placeholder="Medicamento" value="${esc(nome)}" style="flex:2"><input class="md" placeholder="Dose" value="${esc(dose)}" style="flex:1"><input class="mf" placeholder="Frequência" value="${esc(freq)}" style="flex:1"><input class="mdu" placeholder="Duração" value="${esc(dur)}" style="flex:1"><button onclick="this.parentElement.remove()" style="background:none;border:.5px solid var(--border);border-radius:8px;padding:7px 9px;cursor:pointer;font-size:14px;color:var(--text-muted)"><i class="ti ti-trash"></i></button>`;
  document.getElementById('medList').appendChild(div);
}

function closeModal(id){document.getElementById(id).classList.remove('open')}
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open')}));

/* ===== DRAG & DROP ANEXOS ===== */
const dz=document.getElementById('dropZone');
if(dz){
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--teal)'});
  dz.addEventListener('dragleave',()=>{dz.style.borderColor='var(--border)'});
  dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor='var(--border)';uploadAnexos(e.dataTransfer.files)});
}

/* ===== AUTO LOGIN CHECK ===== */
(async()=>{
  const{data:{session}}=await sb.auth.getSession();
  if(session){await initApp(session.user)}
})();

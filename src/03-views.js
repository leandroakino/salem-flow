
/* ---------- ações disponíveis por status ---------- */
function primaryAction(o){
  const adm=isAdm(), prod=canProd(), att=canAtt();
  switch(o.status){
    case 'rascunho': return att?{a:'o-release',l:'Liberar para produção'}:null;
    case 'liberado': case 'aguardando_prod': return prod?{a:'p-start',l:'Iniciar produção'}:null;
    case 'em_producao': return prod?{a:'p-done',l:'Pronto para subir'}:null;
    case 'aguardando_material': return prod?{a:'p-resume',l:'Material chegou, retomar'}:null;
    case 'bloqueado': if(o.block&&o.block.negAuth) return adm?{a:'a-neg',l:'Autorizar estoque negativo'}:null; return prod?{a:'p-resume',l:'Resolvido, retomar'}:null;
    case 'finalizado': return prod?{a:'p-ready',l:'Pronto para subir'}:null;
    case 'pronto_subir': return (prod||att)?{a:'t-start',l:'Iniciar transporte'}:null;
    case 'em_transporte': return att?{a:'r-receive',l:'Receber e conferir'}:null;
    case 'divergencia': return prod?{a:'p-fix',l:'Corrigido, reenviar'}:null;
    case 'recebido': if(isDrv()) return o.type==='entrega'?{a:'d-out',l:'Peguei para entregar'}:null; return att?(o.type==='entrega'?{a:'d-out',l:'Saiu para entrega'}:{a:'d-pick',l:'Registrar retirada'}):null;
    case 'saiu_entrega': return (att||(isDrv()&&mine(o)))?{a:'d-done',l:isDrv()?'Entreguei':'Confirmar entrega'}:null;
    case 'entrega_problema': return (att||(isDrv()&&mine(o)))?{a:'d-out',l:'Sair novamente'}:null;
  }
  return null;
}
function secondary(o){
  const a=[], att=canAtt(), prod=canProd(), open=isActive(o)||o.status==='rascunho';
  if(att&&open) a.push({a:'o-edit',l:'Editar pedido'});
  if(att&&['liberado','aguardando_prod'].includes(o.status)) a.push({a:'o-direct',l:'Não passa pela produção'});
  if(att&&open&&o.status!=='rascunho'&&o.card!=='sem'&&!o.cardDone) a.push({a:'card-done',l:'Cartão pronto'});
  if(att) a.push({a:'o-dup',l:'Duplicar pedido'});
  if(prod&&o.status==='liberado') a.push({a:'p-accept',l:'Aceitar na fila'});
  if(prod&&['liberado','aguardando_prod','em_producao'].includes(o.status)) a.push({a:'p-wait',l:'Avisar falta de material'},{a:'p-problem',l:'Informar problema'});
  if(prod&&['em_producao','finalizado'].includes(o.status)&&!o.confReq) a.push({a:'p-confreq',l:'Solicitar conferência'});
  if(att&&['pronto_subir','em_transporte'].includes(o.status)) a.push({a:'r-receive',l:'Receber e conferir'});
  if((att||(isDrv()&&mine(o)))&&o.status==='saiu_entrega') a.push({a:'d-prob',l:'Problema na entrega'});
  a.push({a:'o-ficha',l:'Ficha do pedido'});
  if(att&&open) a.push({a:'o-cancel',l:'Cancelar pedido'});
  return a;
}
function flags(o){
  const f=[];
  if(isLate(o)) f.push('<span class="chip c-red solid">Atrasado</span>');
  else if(o.urgent&&isActive(o)) f.push('<span class="chip c-orange solid">Urgente</span>');
  else if(isSoon(o)) f.push('<span class="chip c-amber solid">Prazo próximo</span>');
  if(o.skipProd) f.push('<span class="chip c-gray">Sem produção</span>');
  if(o.changedAt&&PIPE.includes(o.status)&&o.changedAt>((o.times&&(o.times.aceitoAt||o.times.liberadoAt))||0)) f.push('<span class="chip c-violet">Alterado</span>');
  return f.join('');
}
const thumbsHTML=o=>(o.photos&&o.photos.length)?`<div class="thumbs">${o.photos.map(p=>`<img src="/_blob/${esc(p.id)}" alt="Foto de referência" data-act="photo-zoom" data-src="/_blob/${esc(p.id)}">`).join('')}</div>`:'';
function prodCard(o){
  const pa=primaryAction(o);
  const descs=(o.items||[]).filter(i=>i.desc).map(i=>`<div class="cardmsg">${esc(i.name)}: ${esc(i.desc)}</div>`).join('');
  return `<article class="ocard ${isLate(o)?'late':''}" style="--c:var(--s-${ST[o.status].c})" data-act="o-open" data-id="${o.id}">
    <div class="row between"><span class="onum">${orderNum(o)}</span><span class="row" style="gap:6px">${flags(o)}</span></div>
    <div class="otitle">${esc(prodItemsText(o))}</div>
    <div class="ometa"><span>Para ${o.time?o.time:'(sem horário)'} · ${fDS(o.date)}</span><span>${TYPES[o.type]}</span>${o.responsible?`<span>Resp.: ${esc(o.responsible)}</span>`:''}${o.status==='em_transporte'?'<span>Em transporte</span>':''}</div>
    ${thumbsHTML(o)}${descs}
    ${o.buildNotes?`<div class="ometa">Montagem: ${esc(o.buildNotes)}</div>`:''}
    ${o.block&&o.status==='bloqueado'?`<div class="cardmsg">Bloqueio: ${esc(o.block.reason)}</div>`:''}
    ${o.div&&o.status==='divergencia'?`<div class="cardmsg">Divergência: ${esc(o.div.label)}. ${esc(o.div.note)}</div>`:''}
    ${pa?`<button class="btn primary lg" data-act="${pa.a}" data-id="${o.id}">${pa.l}</button>`:''}
  </article>`;
}
function orderRow(o){
  const pa=primaryAction(o);
  return `<article class="ocard ${isLate(o)?'late':''}" style="--c:var(--s-${ST[o.status].c})" data-act="o-open" data-id="${o.id}">
    <div class="row between"><span class="onum">${orderNum(o)}</span><span class="row" style="gap:6px">${flags(o)}${chip(o)}</span></div>
    <div class="otitle">${esc(o.client.name)} · ${esc(itemsText(o))}</div>
    ${thumbsHTML(o)}
    <div class="ometa"><span>${fDS(o.date)} ${o.time||'sem horário'}</span><span>${TYPES[o.type]}</span><span>${CHANNELS[o.channel]}</span><span>${money(o.total)} · ${PAYS[o.pay.status]}</span></div>
    ${pa?`<div class="row"><button class="btn primary" data-act="${pa.a}" data-id="${o.id}">${pa.l}</button></div>`:''}
  </article>`;
}

/* ---------- navegação ---------- */
const NAV={
  admin:['pend','dash','pedidos','fila','receber','entregas','entregadores','materiais','expositor','estoque','clientes','cad','audit'],
  atendimento:['pend','pedidos','receber','entregas','entregadores','materiais','expositor','clientes'],
  producao:['pend','fila','materiais','estoque','reposicoes'],
  entregador:['minhas']
};
const NAVL={minhas:'Minhas entregas',entregadores:'Entregadores',pend:'Pendências',dash:'Gestão',pedidos:'Pedidos',fila:'Produção',receber:'Receber',entregas:'Entregas e retiradas',materiais:'Materiais',expositor:'Expositor',estoque:'Estoque',reposicoes:'Reposições',clientes:'Clientes',cad:'Cadastros',audit:'Auditoria'};
const LEAF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/></svg>';
function setView(v){ view=v; try{ if(location.hash!=='#'+v) location.hash=v; }catch(e){} render(); }

let rafId=0, dirty=false, wlOn=false;
const sched=()=>{ if(rafId) return; rafId=requestAnimationFrame(()=>{rafId=0;render();}); };
let lastInput=0; document.addEventListener('input',()=>{ lastInput=Date.now(); },true);
const typing=()=>{const a=document.activeElement; return !!(a&&a.closest&&a.closest('#view')&&/INPUT|TEXTAREA/.test(a.tagName)&&!/checkbox|radio|button/.test(a.type||'')&&Date.now()-lastInput<8000);};
setInterval(()=>{ if(dirty&&!typing()) render(); },2000);
document.addEventListener('focusout',()=>setTimeout(()=>{ if(dirty&&!typing()) render(); },250));

function renderHdr(){
  const pendingW=Object.values(pendW).some(Boolean);
  const sy=!navigator.onLine?{c:'bad',t:'Sem internet: alterações ainda não sincronizadas'}:pendingW?{c:'warn',t:'Sincronizando…'}:staleMsg?{c:'warn',t:'Dados podem estar desatualizados'}:{c:'',t:'Sincronizado'};
  $('#hdr').innerHTML=`<div class="wrap"><div class="brand">${LEAF}Salém Flow</div><span class="sp"></span><span class="sync" role="status"><i class="dot ${sy.c}"></i>${sy.t}</span>${me?`<span class="who"><b>${esc(me.name)}</b> · ${ROLES[me.role]}</span><button class="hbtn" data-act="logout">Trocar usuário</button>`:''}</div>`;
}
function fitBoards(){ document.querySelectorAll('#view .board').forEach(b=>{ b.style.removeProperty('--bh'); const top=b.getBoundingClientRect().top; const h=Math.max(300,Math.floor(window.innerHeight-top-44)); b.style.setProperty('--bh',h+'px'); }); }
function boardScroll(){ const b=document.querySelector('#view .board,#view .tvcols'); if(!b) return null; return {x:b.scrollLeft,c:[...b.querySelectorAll('.col .cb,.tvlist')].map(e=>e.scrollTop),y:window.scrollY}; }
function restoreBoard(s){ if(!s) return; const b=document.querySelector('#view .board,#view .tvcols'); if(!b) return; b.scrollLeft=s.x; b.querySelectorAll('.col .cb,.tvlist').forEach((e,i)=>{ if(s.c[i]) e.scrollTop=s.c[i]; }); }
window.addEventListener('resize',()=>fitBoards()); window.addEventListener('orientationchange',()=>setTimeout(fitBoards,200));
function render(force){
  dirty=false;
  const tv=view==='tv'&&me;
  document.body.classList.toggle('is-tv',!!tv);
  $('#hdr').hidden=!!tv; $('#nav').parentElement.hidden=!!tv;
  if(!force&&typing()){
    dirty=true; renderHdr();
    const a=document.activeElement; if(view==='pedidos'&&a&&/^pf-/.test(a.id)&&$('#plist')) { const bs=boardScroll(); $('#plist').innerHTML=pedidosList(); fitBoards(); restoreBoard(bs); }
    return;
  }
  renderHdr();
  if(!me){ renderLogin(); $('#nav').innerHTML=''; return; }
  if(tv){ if(!wlOn){ wlOn=true; try{ if(navigator.wakeLock) navigator.wakeLock.request('screen').catch(()=>{}); }catch(e){} } const bs=boardScroll(); $('#view').innerHTML=viewTV(); restoreBoard(bs); tvTick(); return; }
  const allowed=NAV[R()];
  if(!allowed.includes(view)) view=allowed[0];
  const P=pendencies();
  const navEl=$('#nav'), sx=navEl.scrollLeft;
  navEl.innerHTML=allowed.map(v=>`<button class="tab" data-act="nav" data-v="${v}" ${v===view?'aria-current="page"':''}>${NAVL[v]}${v==='pend'&&P.length?`<span class="badge">${P.length}</span>`:''}</button>`).join('')+(isDrv()?'':`<button class="tab" data-act="nav" data-v="tv">Painel TV</button>`);
  navEl.scrollLeft=sx;
  const fn={entregadores:viewEntregadores,minhas:viewMinhas,pend:viewPend,materiais:viewMateriais,dash:viewDash,pedidos:viewPedidos,fila:viewFila,receber:viewReceber,entregas:viewEntregas,expositor:viewExpositor,estoque:viewEstoque,reposicoes:viewReposicoes,clientes:viewClientes,cad:viewCad,audit:viewAudit}[view];
  const bs=boardScroll(); $('#view').innerHTML=fn(P); fitBoards(); restoreBoard(bs);
  if(drawerId&&!$('#drawer').hidden){ const a=document.activeElement; if(!(a&&$('#drawer').contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))) refreshDrawer(); }
}

/* ---------- login ---------- */
function renderLogin(){
  const v=$('#view');
  if(!loaded.users){ v.innerHTML='<div class="center card"><h2>Conectando…</h2><p class="muted" id="ld">Carregando o banco de dados compartilhado.</p></div>'; return; }
  const users=arr('users').filter(u=>u.active!==false);
  if(!users.length){
    v.innerHTML=`<div class="center card stack"><h2>Primeiro acesso</h2><p class="muted">Cadastre o administrador da Floricultura Salém. Depois ele cadastra a equipe.</p>
      <label class="fld"><span>Nome do administrador</span><input class="inp" id="su-name" autocomplete="off"></label>
      <label class="row"><input type="checkbox" id="su-team" checked> Criar usuários de teste (Atendimento 1, Atendimento 2, Produção)</label>
      <label class="row"><input type="checkbox" id="su-demo" checked> Carregar catálogo e estoque de exemplo (apague ou edite depois)</label>
      <button class="btn primary lg" data-act="setup">Começar</button></div>`;
    return;
  }
  v.innerHTML=`<div class="center stack"><h2>Quem está usando?</h2><p class="muted">Toque no seu nome para entrar.</p>${users.sort((a,b)=>a.name.localeCompare(b.name)).map(u=>`<button class="btn lg userbtn" data-act="login" data-id="${u.id}"><b>${esc(u.name)}</b><span class="chip c-gray">${ROLES[u.role]}</span></button>`).join('')}</div>`;
}

/* ---------- pendências + mural ---------- */
function viewPend(P){
  const sevC={3:'red',2:'amber',1:'blue'}, sevL={3:'Urgente',2:'Atenção',1:'Informação'};
  const items=P.map(p=>{
    let btn='';
    if(p.oid) btn+=`<button class="btn sm" data-act="o-open" data-id="${p.oid}">Abrir pedido</button>`;
    if(p.neg&&isAdm()) btn+=`<button class="btn sm primary" data-act="a-neg" data-id="${p.oid}">Autorizar estoque negativo</button>`;
    if(p.cardDone) btn+=`<button class="btn sm primary" data-act="card-done" data-id="${p.oid}">Cartão pronto</button>`;
    if(p.mid){ const m=S.matreq[p.mid]; if(m&&m.status==='aberto'&&canAtt()) btn+=`<button class="btn sm primary" data-act="mr-prov" data-id="${p.mid}">Providenciado</button>`; if(m&&m.status==='providenciado'&&canProd()) btn+=`<button class="btn sm primary" data-act="mr-got" data-id="${p.mid}">Chegou</button>`; btn+=`<button class="btn sm" data-act="nav" data-v="materiais">Ver materiais</button>`; }
    if(p.clearConf) btn+=`<button class="btn sm primary" data-act="conf-ok" data-id="${p.oid}">Conferi</button>`;
    if(p.rid){ const rp=S.replen[p.rid]; if(rp&&rp.status==='pedida'&&canProd()) btn+=`<button class="btn sm primary" data-act="rp-sep" data-id="${p.rid}">Separei</button>`; if(rp&&rp.status==='separada'&&canAtt()) btn+=`<button class="btn sm primary" data-act="rp-rec" data-id="${p.rid}">Recebi</button>`; }
    if(p.sid) btn+=`<button class="btn sm" data-act="nav" data-v="estoque">Ver estoque</button>`;
    return `<div class="pend c-${sevC[p.sev]}"><span class="chip c-${sevC[p.sev]}">${sevL[p.sev]}</span><div class="t">${esc(p.text)}</div><div class="row">${btn}</div></div>`;
  }).join('');
  const posts=arr('mural').sort((a,b)=>b.at-a.at).slice(0,12).map(m=>`<div class="post"><div class="small muted">${esc(m.by)} · ${fDT(m.at)}</div>${esc(m.text)}</div>`).join('');
  return `<div class="row between"><h2>Central de Pendências</h2><span class="muted">${P.length} ${P.length===1?'item':'itens'}</span></div>
    <div class="stack sec" style="margin-top:10px">${items||'<div class="empty">Nada pendente agora. Tudo em dia.</div>'}</div>
    <div class="sec"><div class="row between"><h2>Mural da equipe</h2><button class="btn" data-act="mural-new">Registrar ocorrência</button></div>
    <div class="mural" style="margin-top:10px">${posts||'<div class="empty">Nenhuma ocorrência registrada.</div>'}</div></div>`;
}

/* ---------- pedidos ---------- */
let PF={q:'',status:'abertos',channel:'',when:'todos',date:'',slot:''};
function pedidosList(){
  let L=arr('orders');
  const q=PF.q.trim().toLowerCase(), qd=digits(PF.q);
  if(q) L=L.filter(o=>String(o.num)===String(Number(qd))||(o.client&&o.client.name.toLowerCase().includes(q))||(o.recipient&&o.recipient.toLowerCase().includes(q))||(qd.length>=4&&digits(o.client&&o.client.phone).includes(qd)));
  if(PF.status==='abertos') L=L.filter(o=>o.status!=='concluido'&&o.status!=='cancelado');
  else if(PF.status==='atrasados') L=L.filter(isLate);
  else if(PF.status!=='todos') L=L.filter(o=>o.status===PF.status);
  if(PF.channel) L=L.filter(o=>o.channel===PF.channel);
  if(PF.when==='hoje') L=L.filter(o=>o.date===todayKey());
  else if(PF.when==='amanha') L=L.filter(o=>o.date===dayKey(now()+864e5));
  else if(PF.when==='data'&&PF.date) L=L.filter(o=>o.date===PF.date);
  if(PF.slot) L=L.filter(o=>{ if(!o.time) return false; const h=Number(o.time.slice(0,2)); return PF.slot==='manha'?h<12:PF.slot==='tarde'?h>=12&&h<18:h>=18; });
  L.sort((a,b)=>PF.status==='abertos'||PF.status==='atrasados'?(deadline(a)||0)-(deadline(b)||0):b.num-a.num);
  if(!L.length) return '<div class="empty">Nenhum pedido encontrado com esses filtros.</div>';
  const groups=[['Rascunhos',['rascunho'],'gray'],['Liberados',['liberado','aguardando_prod'],'blue'],['Em produção',['em_producao','aguardando_material'],'amber'],['Problemas e bloqueios',['bloqueado','divergencia','entrega_problema'],'red'],['Finalizados',['finalizado'],'teal'],['Prontos para subir / em transporte',['pronto_subir','em_transporte'],'green'],['Aguardando retirada ou entrega',['recebido'],'green'],['Saiu para entrega',['saiu_entrega'],'sky'],['Concluídos',['concluido'],'gray'],['Cancelados',['cancelado'],'gray']];
  const shown=L.slice(0,150);
  return `<div class="board">${groups.map(([t,sts,c],i)=>{ const G=shown.filter(o=>sts.includes(o.status)); if(!G.length&&i>=8) return ''; return `<section class="col" style="border-top:4px solid var(--s-${c})"><header><span>${t}</span><span class="cnt">${G.length}</span></header><div class="cb">${G.map(orderRow).join('')||'<div class="empty small">Vazio</div>'}</div></section>`; }).join('')}</div>`;
}
function viewPedidos(){
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${l}</option>`).join('');
  const stOpts={abertos:'Abertos',atrasados:'Atrasados',todos:'Todos',concluido:'Concluídos',cancelado:'Cancelados',...Object.fromEntries(Object.entries(ST).filter(([k])=>!['concluido','cancelado'].includes(k)).map(([k,v])=>[k,v.l]))};
  return `<div class="toolbar"><div class="grow"><input id="pf-q" class="inp" type="search" placeholder="Buscar por número, cliente ou telefone" value="${esc(PF.q)}" aria-label="Buscar pedido"></div>
    <select id="pf-status" class="sel" aria-label="Status">${opt(stOpts,PF.status)}</select>
    <select id="pf-channel" class="sel" aria-label="Canal"><option value="">Todos os canais</option>${opt(CHANNELS,PF.channel)}</select>
    <select id="pf-when" class="sel" aria-label="Data"><option value="todos" ${PF.when==='todos'?'selected':''}>Qualquer data</option><option value="hoje" ${PF.when==='hoje'?'selected':''}>Hoje</option><option value="amanha" ${PF.when==='amanha'?'selected':''}>Amanhã</option><option value="data" ${PF.when==='data'?'selected':''}>Escolher data</option></select>
    ${PF.when==='data'?`<input id="pf-date" class="inp" type="date" value="${PF.date}" aria-label="Data">`:''}
    <select id="pf-slot" class="sel" aria-label="Horário"><option value="">Qualquer horário</option><option value="manha" ${PF.slot==='manha'?'selected':''}>Manhã</option><option value="tarde" ${PF.slot==='tarde'?'selected':''}>Tarde</option><option value="noite" ${PF.slot==='noite'?'selected':''}>Noite</option></select>
    <button class="btn primary lg" data-act="o-new">+ Novo pedido</button></div><div id="plist">${pedidosList()}</div>`;
}

/* ---------- fila de produção ---------- */
function viewFila(){
  const defs=[['Novos liberados',['liberado'],'blue'],['Aguardando produção',['aguardando_prod'],'violet'],['Em produção',['em_producao','aguardando_material'],'amber'],['Finalizados',['finalizado'],'teal'],['Prontos para subir',['pronto_subir','em_transporte'],'green'],['Problemas e bloqueios',['bloqueado','divergencia'],'red']];
  const O=arr('orders');
  return `<div class="row between" style="margin:6px 0 12px"><h2>Fila de produção</h2><span class="muted small">Atualiza sozinha. Toque no pedido para ver detalhes.</span></div><div class="board">${defs.map(([t,sts,c])=>{
    const L=O.filter(o=>sts.includes(o.status)).sort((a,b)=>(deadline(a)||9e15)-(deadline(b)||9e15));
    return `<section class="col" style="border-top:4px solid var(--s-${c})"><header><span>${t}</span><span class="cnt">${L.length}</span></header><div class="cb">${L.map(prodCard).join('')||'<div class="empty small">Vazio</div>'}</div></section>`;
  }).join('')}</div>`;
}

/* ---------- receber ---------- */
function viewReceber(){
  const O=arr('orders'); const trans=O.filter(o=>o.status==='em_transporte'), wait=O.filter(o=>o.status==='pronto_subir'), div=O.filter(o=>o.status==='divergencia');
  const sec=(t,L,empty)=>`<div class="sec"><h2>${t} <span class="muted">(${L.length})</span></h2><div class="list" style="margin-top:10px">${L.map(prodCard).join('')||`<div class="empty">${empty}</div>`}</div></div>`;
  return `<h2>Receber da produção</h2><div class="card row" style="margin:10px 0"><label class="fld grow"><span>Número do pedido que chegou</span><input class="inp" id="rcv-num" inputmode="numeric" placeholder="Ex.: 12"></label><button class="btn primary lg" data-act="r-find">Conferir pedido</button></div>
    ${sec('A caminho do atendimento',trans,'Nada em transporte.')}${sec('Prontos, aguardando transporte',wait,'Nenhum pedido aguardando.')}${sec('Divergências em correção',div,'Nenhuma divergência aberta.')}`;
}

/* ---------- entregador ---------- */
function drvCard(o,k){
  const d=o.delivery||{}, tel=digits(o.client.phone), pend=o.pay&&o.pay.status!=='pago';
  const pa=primaryAction(o), pr=(k==='mine'||k==='prob')&&o.status==='saiu_entrega';
  return `<article class="ocard ${isLate(o)?'late':''}" style="--c:var(--s-${ST[o.status].c})" data-act="o-open" data-id="${o.id}">
    <div class="row between"><span class="onum">${orderNum(o)}</span><span class="row" style="gap:6px">${flags(o)}${chip(o)}</span></div>
    <div class="otitle">${esc(o.recipient||o.client.name)}</div>
    ${o.recipient?`<div class="small muted">Comprador: ${esc(o.client.name)}</div>`:''}
    <div class="small">${esc(o.address||'Sem endereço')}</div>
    <div class="ometa"><span>${fDS(o.date)} ${o.time||'sem horário'}</span><span>${esc(itemsText(o))}</span></div>
    ${pend?`<div class="cardmsg">Pagamento ${PAYS[o.pay.status].toLowerCase()}: combine com o atendimento antes de entregar.</div>`:''}
    ${o.status==='entrega_problema'&&d.problem?`<div class="cardmsg">Problema: ${esc(d.problem)}</div>`:''}
    <div class="row" style="flex-wrap:wrap;gap:8px">
      ${pa?`<button class="btn primary lg" data-act="${pa.a}" data-id="${o.id}">${pa.l}</button>`:''}
      ${pr?`<button class="btn" data-act="d-prob" data-id="${o.id}">Problema</button>`:''}
      ${o.recipientPhone&&digits(o.recipientPhone)?`<a class="btn" data-act="noop" href="tel:${digits(o.recipientPhone)}">Ligar p/ destinatário</a>`:''}${tel?`<a class="btn" data-act="noop" href="tel:${tel}">${o.recipientPhone?'Ligar p/ comprador':'Ligar'}</a>`:''}
    </div></article>`;
}
function viewMinhas(){
  const O=arr('orders'), tk=todayKey(), byDl=(a,b)=>(deadline(a)||9e15)-(deadline(b)||9e15);
  const mineOut=O.filter(o=>o.status==='saiu_entrega'&&mine(o)).sort(byDl);
  const prob=O.filter(o=>o.status==='entrega_problema'&&mine(o)).sort(byDl);
  const wait=O.filter(o=>o.status==='recebido'&&o.type==='entrega').sort(byDl);
  const done=O.filter(o=>o.status==='concluido'&&o.outcome==='entrega'&&o.delivery&&o.delivery.by===me.name&&dayKey((o.times&&o.times.concluidoAt)||0)===tk).sort((a,b)=>b.times.concluidoAt-a.times.concluidoAt);
  const sec=(t,L,k,c,empty)=>`<section class="stack"><h3 class="row between"><span>${t}</span><span class="cnt">${L.length}</span></h3>${L.map(o=>drvCard(o,k)).join('')||`<div class="empty small">${empty}</div>`}</section>`;
  return `<h2 style="margin:6px 0 12px">Minhas entregas</h2><div class="stack" style="max-width:720px">
    ${sec('Comigo agora',mineOut,'mine','sky','Nenhuma entrega com você. Pegue uma na lista abaixo.')}
    ${prob.length?sec('Com problema',prob,'prob','red',''):''}
    ${sec('Prontas para pegar',wait,'wait','green','Nenhuma entrega pronta no momento.')}
    <section class="stack"><h3 class="row between"><span>Entregues hoje</span><span class="cnt">${done.length}</span></h3>${done.map(o=>`<div class="card small"><b>${orderNum(o)}</b> · ${esc(o.client.name)} · recebido por ${esc(o.delivery.receivedBy||'—')} às ${p2(new Date(o.times.concluidoAt).getHours())}:${p2(new Date(o.times.concluidoAt).getMinutes())}</div>`).join('')||'<div class="empty small">Ainda nenhuma hoje.</div>'}</section>
  </div>`;
}

const drivers=(all)=>arr('users').filter(u=>u.role==='entregador'&&(all||u.active!==false)).sort((a,b)=>a.name.localeCompare(b.name));
const driverBusy=u=>arr('orders').filter(o=>(o.status==='saiu_entrega'||o.status==='entrega_problema')&&o.delivery&&o.delivery.driver===u.name);
function viewEntregadores(){
  const D=drivers(true), tk=todayKey(), O=arr('orders');
  const rows=D.map(u=>{
    const busy=driverBusy(u).length, today=O.filter(o=>o.status==='concluido'&&o.outcome==='entrega'&&o.delivery&&o.delivery.driver===u.name&&dayKey((o.times&&o.times.concluidoAt)||0)===tk).length;
    const off=u.active===false;
    return `<tr><td><b>${esc(u.name)}</b></td><td>${off?'<span class="chip c-gray">Removido</span>':'<span class="chip c-green">Ativo</span>'}</td><td class="n">${busy}</td><td class="n">${today}</td><td><div class="row" style="gap:6px">${off?`<button class="btn sm" data-act="dr-on" data-id="${u.id}">Reativar</button>`:`<button class="btn sm" data-act="dr-edit" data-id="${u.id}">Renomear</button><button class="btn sm ghost" data-act="dr-off" data-id="${u.id}">Remover</button>`}</div></td></tr>`;
  }).join('');
  return `<div class="row between"><h2>Entregadores</h2><button class="btn primary" data-act="dr-new">Novo entregador</button></div>
  <p class="muted small" style="margin:6px 0 12px">Quem está aqui aparece na lista "Quem vai entregar" e pode entrar no sistema com o próprio nome. Remover não apaga o histórico de entregas.</p>
  ${D.length?`<div class="tablewrap"><table><thead><tr><th>Nome</th><th>Situação</th><th class="n">Em rota</th><th class="n">Entregues hoje</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty">Nenhum entregador cadastrado.</div>'}`;
}

/* ---------- entregas ---------- */
function viewEntregas(){
  const O=arr('orders'), tk=todayKey();
  const defs=[['Aguardando retirada',o=>o.status==='recebido'&&o.type!=='entrega','green'],['Aguardando entrega',o=>o.status==='recebido'&&o.type==='entrega','green'],['Saiu para entrega',o=>o.status==='saiu_entrega','sky'],['Problemas na entrega',o=>o.status==='entrega_problema','red'],['Concluídos hoje',o=>o.status==='concluido'&&dayKey((o.times&&o.times.concluidoAt)||0)===tk,'gray']];
  return `<h2 style="margin:6px 0 12px">Entregas e retiradas</h2><div class="board">${defs.map(([t,f,c])=>{
    const L=O.filter(f).sort((a,b)=>(deadline(a)||9e15)-(deadline(b)||9e15));
    return `<section class="col" style="border-top:4px solid var(--s-${c})"><header><span>${t}</span><span class="cnt">${L.length}</span></header><div class="cb">${L.map(orderRow).join('')||'<div class="empty small">Vazio</div>'}</div></section>`;
  }).join('')}</div>`;
}

/* ---------- materiais (comunicação entre setores) ---------- */
const MRST={aberto:['Falta','red'],providenciado:['Providenciado','sky'],resolvido:['Chegou','green'],cancelado:['Cancelado','gray']};
function viewMateriais(){
  const L=arr('matreq');
  const open=L.filter(m=>m.status==='aberto'||m.status==='providenciado').sort((a,b)=>b.at-a.at);
  const done=L.filter(m=>m.status==='resolvido'||m.status==='cancelado').sort((a,b)=>(b.resAt||b.at)-(a.resAt||a.at)).slice(0,15);
  const card=m=>{
    const ord=m.orderId&&S.orders[m.orderId];
    return `<div class="card stack"><div class="row between"><b>${esc(m.name)}${m.qty?' · '+num(m.qty)+' '+esc(m.unit||''):''}</b><span class="chip c-${MRST[m.status][1]}">${MRST[m.status][0]}</span></div>
      <div class="small muted">Avisado por ${esc(m.by)}, ${fDT(m.at)}${ord?` · pedido ${orderNum(ord)}`:''}</div>
      ${m.text?`<div class="cardmsg">${esc(m.text)}</div>`:''}${m.note?`<div class="cardmsg">${esc(m.provBy||'')}: ${esc(m.note)}</div>`:''}
      ${m.status==='providenciado'?`<div class="small muted">Providenciado por ${esc(m.provBy)}, ${fDT(m.provAt)}</div>`:''}${m.status==='resolvido'?`<div class="small muted">Recebido por ${esc(m.resBy)}, ${fDT(m.resAt)}</div>`:''}
      <div class="row">${ord?`<button class="btn sm" data-act="o-open" data-id="${ord.id}">Abrir pedido</button>`:''}
      ${m.status==='aberto'&&canAtt()?`<button class="btn sm primary" data-act="mr-prov" data-id="${m.id}">Providenciado</button>`:''}
      ${m.status!=='resolvido'&&m.status!=='cancelado'&&canProd()?`<button class="btn sm ${m.status==='providenciado'?'primary':''}" data-act="mr-got" data-id="${m.id}">Chegou</button>`:''}
      ${m.status==='aberto'||m.status==='providenciado'?`<button class="btn sm ghost" data-act="mr-cancel" data-id="${m.id}">Cancelar aviso</button>`:''}</div></div>`;
  };
  return `<div class="toolbar"><h2 class="grow">Materiais</h2><button class="btn primary lg" data-act="mr-new">Avisar falta de material</button></div>
    <p class="muted small">A produção avisa o que está faltando, o atendimento marca "Providenciado" e a produção confirma quando chegar. O pedido continua em produção enquanto isso.</p>
    <div class="sec"><h2>Em aberto <span class="muted">(${open.length})</span></h2><div class="list" style="margin-top:10px">${open.map(card).join('')||'<div class="empty">Nenhuma falta de material no momento.</div>'}</div></div>
    ${done.length?`<div class="sec"><h2>Resolvidos recentemente</h2><div class="list" style="margin-top:10px">${done.map(card).join('')}</div></div>`:''}`;
}

/* ---------- estoque ---------- */
let SF={q:'',cat:''};
function stockTable(){
  let L=arr('stock'); const q=SF.q.trim().toLowerCase();
  if(q) L=L.filter(i=>i.name.toLowerCase().includes(q)||(i.code||'').toLowerCase().includes(q));
  if(SF.cat) L=L.filter(i=>i.cat===SF.cat);
  L.sort((a,b)=>a.name.localeCompare(b.name));
  if(!L.length) return '<div class="empty">Nenhum item encontrado. '+(isAdm()?'Use "Novo item" para cadastrar.':'')+'</div>';
  return `<div class="tablewrap"><table><thead><tr><th>Item</th><th class="n">Produção</th><th class="n">Reserva</th><th class="n">Expositor</th><th class="n">Total</th><th class="n">Mínimo</th>${isAdm()?'<th class="n">Valor</th>':''}<th>Ações</th></tr></thead><tbody>${L.map(i=>{
    const q=i.qty||{}, t=totalQty(i), low=i.min>0&&t<i.min;
    return `<tr><td><b>${esc(i.name)}</b><div class="small muted">${esc(i.cat)}${i.code?' · '+esc(i.code):''}${i.locPhys?' · '+esc(i.locPhys):''}</div></td>
      <td class="n ${(q.producao||0)<0?'low':''}">${num(q.producao||0)}</td><td class="n ${(q.reserva||0)<0?'low':''}">${num(q.reserva||0)}</td><td class="n ${(q.expositor||0)<0?'low':''}">${num(q.expositor||0)}</td>
      <td class="n ${low?'low':''}">${num(t)} ${esc(i.unit)}${low?'<div class="small">abaixo do mínimo</div>':''}</td><td class="n">${num(i.min||0)}</td>${isAdm()?`<td class="n">${money(t*(i.cost||0))}</td>`:''}
      <td><div class="row" style="gap:6px"><button class="btn sm" data-act="s-in" data-id="${i.id}">Entrada</button><button class="btn sm" data-act="s-tr" data-id="${i.id}">Transferir</button><button class="btn sm" data-act="s-loss" data-id="${i.id}">Perda</button><button class="btn sm ghost" data-act="s-hist" data-id="${i.id}">Histórico</button>${isAdm()?`<button class="btn sm ghost" data-act="s-edit" data-id="${i.id}">Editar</button>`:''}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function viewEstoque(){
  const loss=arr('losses').sort((a,b)=>b.at-a.at).slice(0,15);
  const lossTot=arr('losses').reduce((a,l)=>a+(l.cost||0),0);
  return `<div class="toolbar"><h2 class="grow">Controle de estoque</h2><input id="sf-q" class="inp" type="search" placeholder="Buscar item ou código" value="${esc(SF.q)}" aria-label="Buscar item"><select id="sf-cat" class="sel" aria-label="Categoria"><option value="">Todas as categorias</option>${SCAT.map(c=>`<option ${SF.cat===c?'selected':''}>${c}</option>`).join('')}</select>${isAdm()?'<button class="btn primary" data-act="s-new">Novo item</button>':''}<button class="btn" data-act="s-loss" data-id="">Registrar perda</button></div>
    <div id="stbl">${stockTable()}</div>
    <div class="sec"><div class="row between"><h2>Perdas recentes</h2><span class="muted">Total registrado: ${money(lossTot)}</span></div><div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Quando</th><th>Item</th><th class="n">Qtd</th><th>Motivo</th><th class="n">Custo</th><th>Quem</th></tr></thead><tbody>${loss.map(l=>`<tr><td>${fDT(l.at)}</td><td>${esc(l.name)}<div class="small muted">${LOC[l.loc]||''}</div></td><td class="n">${num(l.qty)} ${esc(l.unit)}</td><td>${esc(l.motive)}${l.note?`<div class="small muted">${esc(l.note)}</div>`:''}</td><td class="n">${money(l.cost)}</td><td>${esc(l.by)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Nenhuma perda registrada.</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- reposições (produção) e expositor ---------- */
const RPST={pedida:['Pedida','violet'],separada:['Separada, aguardando recebimento','teal'],recebida:['Recebida','green'],cancelada:['Cancelada','gray']};
function replenTable(L){
  if(!L.length) return '<div class="empty">Nenhuma reposição.</div>';
  return `<div class="tablewrap"><table><thead><tr><th>Item</th><th class="n">Qtd</th><th>Origem</th><th>Situação</th><th>Pedido por</th><th>Ação</th></tr></thead><tbody>${L.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="n">${num(r.qty)} ${esc(r.unit)}</td><td>${LOC[r.from]}</td><td><span class="chip c-${RPST[r.status][1]}">${RPST[r.status][0]}</span></td><td>${esc(r.by)} · ${fDT(r.at)}</td><td>${r.status==='pedida'&&canProd()?`<button class="btn sm primary" data-act="rp-sep" data-id="${r.id}">Separei</button>`:''}${r.status==='separada'&&canAtt()?`<button class="btn sm primary" data-act="rp-rec" data-id="${r.id}">Recebi no expositor</button>`:''}${(r.status==='pedida'||r.status==='separada')&&canAtt()?`<button class="btn sm ghost" data-act="rp-cancel" data-id="${r.id}">Cancelar</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function viewReposicoes(){
  const L=arr('replen').sort((a,b)=>({pedida:0,separada:1,recebida:2,cancelada:3}[a.status]-{pedida:0,separada:1,recebida:2,cancelada:3}[b.status])||b.at-a.at).slice(0,60);
  return `<h2>Reposições do expositor</h2><p class="muted">Pedidos feitos pelo atendimento. Separe os itens e marque "Separei"; o atendimento confirma o recebimento.</p><div style="margin-top:10px">${replenTable(L)}</div>`;
}
function viewExpositor(){
  const showAll=SF.expAll;
  const L=arr('stock').filter(i=>showAll||(i.qty&&i.qty.expositor>0)||i.minExp>0).sort((a,b)=>a.name.localeCompare(b.name));
  const reps=arr('replen').sort((a,b)=>b.at-a.at).slice(0,25);
  const lastC=arr('confs').sort((a,b)=>b.at-a.at)[0];
  return `<div class="toolbar"><h2 class="grow">Expositor</h2><label class="row"><input type="checkbox" id="exp-all" ${showAll?'checked':''}> Mostrar todos os itens</label><button class="btn primary" data-act="conf-new">Conferência do expositor</button></div>
    ${lastC?`<p class="muted small">Última conferência: ${esc(lastC.turno)} por ${esc(lastC.by)}, ${fDT(lastC.at)}${lastC.diffs?` (${lastC.diffs} diferença${lastC.diffs>1?'s':''})`:' (sem diferenças)'}.</p>`:'<p class="muted small">Nenhuma conferência registrada ainda. Faça na abertura, no meio do expediente e no fechamento.</p>'}
    <div class="tablewrap"><table><thead><tr><th>Item</th><th class="n">No expositor</th><th class="n">Reservadas</th><th class="n">Reserva da loja</th><th class="n">Produção</th><th>Ações</th></tr></thead><tbody>${L.map(i=>{
      const q=i.qty||{}, low=i.minExp>0&&(q.expositor||0)<i.minExp;
      return `<tr><td><b>${esc(i.name)}</b><div class="small muted">${esc(i.cat)}</div></td><td class="n ${low?'low':''}">${num(q.expositor||0)} ${esc(i.unit)}${low?`<div class="small">mín. ${num(i.minExp)}: repor</div>`:''}</td><td class="n">${num(i.rsv||0)}</td><td class="n">${num(q.reserva||0)}</td><td class="n">${num(q.producao||0)}</td>
      <td><div class="row" style="gap:6px"><button class="btn sm primary" data-act="rp-new" data-id="${i.id}">Pedir reposição</button><button class="btn sm" data-act="x-sell" data-id="${i.id}">Vendido</button><button class="btn sm" data-act="s-loss" data-id="${i.id}" data-loc="expositor">Descartar</button><button class="btn sm" data-act="x-rsv" data-id="${i.id}">Reservar</button><button class="btn sm ghost" data-act="s-tr" data-id="${i.id}">Transferir</button></div></td></tr>`;
    }).join('')||'<tr><td colspan="6" class="muted">Nenhum item no expositor. Marque "Mostrar todos" ou transfira itens para o expositor.</td></tr>'}</tbody></table></div>
    <div class="sec"><h2>Pedidos de reposição</h2><div style="margin-top:10px">${replenTable(reps)}</div></div>`;
}

/* ---------- clientes ---------- */
let CF='';
function clientsList(){
  const q=CF.trim().toLowerCase(), qd=digits(CF);
  let L=arr('clients'); if(q) L=L.filter(c=>c.name.toLowerCase().includes(q)||(qd.length>=3&&digits(c.phone).includes(qd)));
  const O=arr('orders');
  L.sort((a,b)=>a.name.localeCompare(b.name));
  return L.length?`<div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th class="n">Pedidos</th><th>Último pedido</th><th>Ações</th></tr></thead><tbody>${L.slice(0,200).map(c=>{
    const mine=O.filter(o=>digits(o.client&&o.client.phone)===digits(c.phone)&&o.status!=='cancelado'), last=mine.sort((a,b)=>b.createdAt-a.createdAt)[0];
    return `<tr><td><b>${esc(c.name)}</b>${c.notes?`<div class="small muted">${esc(c.notes)}</div>`:''}</td><td>${esc(c.phone)}</td><td class="n">${mine.length}</td><td>${last?fDT(last.createdAt):'—'}</td><td><div class="row" style="gap:6px"><button class="btn sm primary" data-act="o-new" data-cid="${c.id}">Novo pedido</button><button class="btn sm ghost" data-act="c-edit" data-id="${c.id}">Editar</button></div></td></tr>`;
  }).join('')}</tbody></table></div>`:'<div class="empty">Nenhum cliente cadastrado. Os clientes entram automaticamente quando você salva um pedido.</div>';
}
function viewClientes(){ return `<div class="toolbar"><h2 class="grow">Clientes</h2><input id="cf-q" class="inp" type="search" placeholder="Buscar nome ou telefone" value="${esc(CF)}" aria-label="Buscar cliente"><button class="btn primary" data-act="c-new">Novo cliente</button></div><div id="clist">${clientsList()}</div>`; }

/* ---------- cadastros ---------- */
let CT='produtos';
function viewCad(){
  const tabs=`<div class="pillbtns" style="margin:8px 0 14px"><button class="btn ${CT==='produtos'?'primary':''}" data-act="cad-tab" data-v="produtos">Produtos e fichas técnicas</button><button class="btn ${CT==='usuarios'?'primary':''}" data-act="cad-tab" data-v="usuarios">Usuários</button></div>`;
  if(CT==='usuarios'){
    const U=arr('users').sort((a,b)=>a.name.localeCompare(b.name));
    return `<div class="row between"><h2>Usuários</h2><button class="btn primary" data-act="u-new">Novo usuário</button></div>${tabs}<div class="tablewrap"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${U.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${ROLES[u.role]}</td><td>${u.active===false?'<span class="chip c-gray">Inativo</span>':'<span class="chip c-green">Ativo</span>'}</td><td><button class="btn sm" data-act="u-edit" data-id="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  const P=arr('products').sort((a,b)=>a.name.localeCompare(b.name));
  return `<div class="row between"><h2>Produtos e fichas técnicas</h2><button class="btn primary" data-act="pr-new">Novo produto</button></div>${tabs}<div class="tablewrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th class="n">Preço</th><th>Ficha técnica</th><th>Ação</th></tr></thead><tbody>${P.map(p=>`<tr><td><b>${esc(p.name)}</b>${p.custom?'<div class="small muted">Exige descrição (personalizado)</div>':''}${p.direct?'<div class="small muted">Direto da loja, sem produção</div>':''}${p.active===false?' <span class="chip c-gray">Inativo</span>':''}</td><td>${esc(p.category)}</td><td class="n">${money(p.price)}</td><td class="small">${(p.recipe||[]).map(r=>`${num(r.qty)} ${esc((S.stock[r.sid]||{}).unit||'')} ${esc((S.stock[r.sid]||{}).name||'?')}`).join(', ')||'<span class="muted">Sem ficha: baixa manual</span>'}</td><td><button class="btn sm" data-act="pr-edit" data-id="${p.id}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">Nenhum produto cadastrado.</td></tr>'}</tbody></table></div>`;
}

/* ---------- gestão ---------- */
let DP='mes';
function periodStart(){ const d=new Date(); d.setHours(0,0,0,0); if(DP==='hoje') return d.getTime(); if(DP==='semana'){ d.setDate(d.getDate()-6); return d.getTime(); } if(DP==='mes'){ d.setDate(1); return d.getTime(); } return 0; }
function avg(a){ return a.length?a.reduce((x,y)=>x+y,0)/a.length:0; }
function barsHTML(rows,fmt){ const mx=Math.max(1,...rows.map(r=>r[1])); return `<div class="bars">${rows.map(([l,v,x])=>`<div class="bar"><span>${esc(l)}</span><i style="width:${Math.max(1,v/mx*100)}%"></i><span class="tnum">${fmt(v)}${x?` · ${x}`:''}</span></div>`).join('')||'<span class="muted">Sem dados no período.</span>'}</div>`; }
function viewDash(){
  const t0=periodStart(); const O=arr('orders');
  const sold=O.filter(o=>o.status!=='rascunho'&&o.status!=='cancelado');
  const sum=(from)=>{const L=sold.filter(o=>o.createdAt>=from);return {t:L.reduce((a,o)=>a+o.total,0),n:L.length};};
  const d0=new Date();d0.setHours(0,0,0,0); const w0=d0.getTime()-6*864e5; const m0=new Date(d0.getFullYear(),d0.getMonth(),1).getTime();
  const sd=sum(d0.getTime()), sw=sum(w0), sm=sum(m0);
  const P=sold.filter(o=>o.createdAt>=t0); const tot=P.reduce((a,o)=>a+o.total,0);
  const byCh={}, byCat={}; P.forEach(o=>{ byCh[o.channel]=(byCh[o.channel]||0)+o.total; o.items.forEach(i=>{byCat[i.category]=(byCat[i.category]||0)+i.qty*i.price;}); });
  const act=O.filter(isActive);
  const prodT=P.filter(o=>o.times&&o.times.inicioAt&&o.times.finalizadoAt).map(o=>o.times.finalizadoAt-o.times.inicioAt);
  const lib2ini=P.filter(o=>o.times&&o.times.liberadoAt&&o.times.inicioAt).map(o=>o.times.inicioAt-o.times.liberadoAt);
  const fin2rec=P.filter(o=>o.times&&o.times.finalizadoAt&&o.times.recebidoAt).map(o=>o.times.recebidoAt-o.times.finalizadoAt);
  const retr=P.reduce((a,o)=>a+(o.divCount||0),0);
  const stalled=act.filter(o=>STALL[o.status]&&now()-(o.statusAt||o.createdAt)>STALL[o.status]*60000).length;
  const stock=arr('stock'); const below=stock.filter(i=>i.min>0&&totalQty(i)<i.min); const val=stock.reduce((a,i)=>a+totalQty(i)*(i.cost||0),0);
  const used={}; arr('moves').filter(m=>m.type==='baixa_pedido'&&m.at>=t0).forEach(m=>{used[m.name]=(used[m.name]||0)+m.qty;});
  const usedRows=Object.entries(used).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const lossP=arr('losses').filter(l=>l.at>=t0); const lossFlow=lossP.filter(l=>/flor/i.test(l.motive));
  const buys=arr('moves').filter(m=>m.type==='entrada').sort((a,b)=>b.at-a.at).slice(0,8);
  const occ=arr('mural').filter(m=>m.at>=t0).length+arr('orders').reduce((a,o)=>a+((o.history||[]).filter(h=>h.at>=t0&&/problema|diverg|bloque/i.test(h.act)).length),0);
  const K=(v,l)=>`<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="row between"><h2>Gestão da operação</h2><div class="row"><div class="pillbtns">${[['hoje','Hoje'],['semana','7 dias'],['mes','Este mês'],['tudo','Tudo']].map(([k,l])=>`<button class="btn sm ${DP===k?'primary':''}" data-act="dp" data-v="${k}">${l}</button>`).join('')}</div></div></div>
    <div class="sec" style="margin-top:14px"><h2>Vendas</h2><div class="kpis" style="margin-top:10px">${K(money(sd.t),'Hoje · '+sd.n+' pedidos')}${K(money(sw.t),'Últimos 7 dias · '+sw.n+' pedidos')}${K(money(sm.t),'Este mês · '+sm.n+' pedidos')}${K(money(P.length?tot/P.length:0),'Ticket médio no período')}</div>
    <div class="grid2" style="margin-top:12px"><div class="card"><h3>Por canal (período)</h3><div style="margin-top:10px">${barsHTML(Object.entries(byCh).map(([k,v])=>[CHANNELS[k]||k,v]).sort((a,b)=>b[1]-a[1]),money)}</div></div><div class="card"><h3>Por categoria (período)</h3><div style="margin-top:10px">${barsHTML(Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,7),money)}</div></div></div></div>
    <div class="sec"><h2>Produção</h2><div class="kpis" style="margin-top:10px">${K(act.filter(o=>['liberado','aguardando_prod'].includes(o.status)).length,'Aguardando produção')}${K(act.filter(o=>['em_producao','aguardando_material'].includes(o.status)).length,'Em andamento')}${K(act.filter(isLate).length,'Atrasados agora')}${K(prodT.length?dur(avg(prodT)):'—','Tempo médio de produção')}${K(P.filter(o=>o.times&&o.times.finalizadoAt).length,'Finalizados no período')}${K(retr,'Divergências e retrabalhos')}</div></div>
    <div class="sec"><h2>Tempos e ocorrências</h2><div class="kpis" style="margin-top:10px">${K(lib2ini.length?dur(avg(lib2ini)):'—','Liberação até início da produção')}${K(fin2rec.length?dur(avg(fin2rec)):'—','Finalização até recebimento')}${K(stalled,'Pedidos sem atualização')}${K(occ,'Ocorrências registradas')}</div></div>
    <div class="sec"><h2>Estoque</h2><div class="kpis" style="margin-top:10px">${K(below.length,'Itens abaixo do mínimo')}${K(money(val),'Valor estimado do estoque')}${K(num(lossFlow.reduce((a,l)=>a+l.qty,0)),'Flores perdidas no período')}${K(money(lossP.reduce((a,l)=>a+(l.cost||0),0)),'Perdas financeiras no período')}</div>
    <div class="grid2" style="margin-top:12px"><div class="card"><h3>Mais utilizados (período)</h3><div style="margin-top:10px">${barsHTML(usedRows,num)}</div></div><div class="card"><h3>Últimas compras</h3><div class="stack small" style="margin-top:10px">${buys.map(b=>`<div class="row between"><span>${esc(b.name)} · ${num(b.qty)} ${esc(b.unit)}</span><span class="muted">${money(b.qty*b.cost)} · ${fDT(b.at)}</span></div>`).join('')||'<span class="muted">Nenhuma entrada registrada.</span>'}</div></div></div></div>
    <div class="sec"><h2>Relatórios</h2><div class="row" style="margin-top:10px"><button class="btn" data-act="exp-orders">Exportar pedidos (CSV)</button><button class="btn" data-act="exp-stock">Exportar estoque (CSV)</button><button class="btn" data-act="exp-losses">Exportar perdas (CSV)</button></div><p class="muted small">Os arquivos CSV abrem direto no Excel. O filtro de período acima vale para os pedidos exportados.</p></div>`;
}

/* ---------- auditoria ---------- */
let AF='';
function auditList(){
  const E=[]; arr('orders').forEach(o=>(o.history||[]).forEach(h=>E.push({at:h.at,by:h.by,act:h.act,detail:h.detail,ref:orderNum(o)})));
  arr('log').forEach(l=>E.push({at:l.at,by:l.by,act:l.act,detail:l.detail,ref:l.ref}));
  arr('moves').forEach(m=>E.push({at:m.at,by:m.by,act:'Estoque: '+m.type.replace(/_/g,' '),detail:`${num(m.qty)} ${m.unit} de ${m.name} (${LOC[m.from]||'fora'} → ${LOC[m.to]||'fora'})${m.note?'. '+m.note:''}`,ref:m.orderId?orderNum(S.orders[m.orderId]||{num:0}):''}));
  const q=AF.trim().toLowerCase();
  const L=E.filter(e=>!q||(e.by+' '+e.act+' '+e.detail+' '+e.ref).toLowerCase().includes(q)).sort((a,b)=>b.at-a.at).slice(0,300);
  return `<div class="tablewrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th><th>Ref.</th></tr></thead><tbody>${L.map(e=>`<tr><td class="tnum">${fDT(e.at)}</td><td>${esc(e.by)}</td><td>${esc(e.act)}</td><td class="small">${esc(e.detail)}</td><td>${esc(e.ref)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Sem registros.</td></tr>'}</tbody></table></div>`;
}
function viewAudit(){ return `<div class="toolbar"><h2 class="grow">Auditoria</h2><input id="af-q" class="inp" type="search" placeholder="Filtrar por pessoa, ação ou pedido" value="${esc(AF)}" aria-label="Filtrar auditoria"></div><p class="muted small">Mostra os 300 registros mais recentes. Nada é apagado: pedidos são cancelados e o estoque é estornado, com histórico.</p><div id="alist">${auditList()}</div>`; }

/* ---------- painel de TV ---------- */
let tvPrev=null, tvPrevAt=0; const tvFx={};
function tvTrack(panels){
  const t=now(), cur={};
  panels.forEach(([,,L],pi)=>L.forEach(o=>{ (cur[o.id]=cur[o.id]||[]).push(pi); }));
  if(tvPrev&&t-tvPrevAt<300000){
    Object.entries(cur).forEach(([id,ps])=>{ const was=tvPrev[id]; ps.forEach(pi=>{ if(!was||!was.includes(pi)){ const k=tvFx[id+'|'+pi]; if(!k||t-k.at>8000) tvFx[id+'|'+pi]={k:was?'moved':'new',at:t}; } }); });
  }
  Object.keys(tvFx).forEach(k=>{ if(t-tvFx[k].at>9000) delete tvFx[k]; });
  tvPrev=cur; tvPrevAt=t;
}
const fmtMin=m=>m<60?m+' min':Math.floor(m/60)+'h'+(m%60?p2(m%60):'');
function tvWhen(dl){ if(dl==null) return {k:'',t:''}; const m=Math.round((dl-now())/60000); return m<0?{k:'late',t:'Atrasado '+fmtMin(-m)}:m<90?{k:'soon',t:'em '+fmtMin(m)}:{k:'',t:'no prazo'}; }
function tvCard(o,c,pi){
  const fx=tvFx[o.id+'|'+pi], el=fx?now()-fx.at:0, dl=deadline(o), w=tvWhen(dl), on=fx&&el<8000;
  const its=(o.items||[]).filter(i=>!i.direct);
  const rows=its.length?its.map(i=>`<div class="it"><em>${esc(i.qty)}×</em>${esc(i.name)}${i.desc?`<span class="d">${esc(i.desc)}</span>`:''}</div>`).join(''):`<div class="it">${esc(prodItemsText(o))}</div>`;
  const flag=o.status==='aguardando_material'?'Falta material':o.status==='bloqueado'?'Bloqueado':'';
  const ph=o.photos&&o.photos.length?`<img class="ph" src="/_blob/${esc(o.photos[0].id)}" alt="Foto de referência" data-act="photo-zoom" data-src="/_blob/${esc(o.photos[0].id)}">`:'';
  return `<article class="tvi ${w.k} ${on?'fx-'+fx.k:''}" ${on?`style="animation-delay:${-el}ms,${600-el}ms"`:''} data-act="o-open" data-id="${o.id}">${on?`<span class="tvtag">${fx.k==='new'?'NOVO':'MOVIDO'}</span>`:''}
    <div class="tvh"><span><span class="n">${orderNum(o)}</span><span class="ty">${o.type==='entrega'?'Entrega':'Retirada'}</span></span><span class="tvt"><b>${esc(o.time||'--:--')}</b><small data-dl="${dl==null?'':dl}">${w.t}</small></span></div>
    <div class="tvb">${rows}${flag?`<span class="flag">${flag}</span>`:''}${o.buildNotes?`<p class="nt">Montagem: ${esc(o.buildNotes)}</p>`:''}</div>${ph}</article>`;
}
function viewTV(){
  const O=arr('orders').filter(o=>PIPE.includes(o.status)&&isActive(o));
  const sort=L=>L.sort((a,b)=>(deadline(a)||9e15)-(deadline(b)||9e15));
  const panels=[['Aguardando produção','violet',sort(O.filter(o=>['liberado','aguardando_prod'].includes(o.status)))],['Em produção','amber',sort(O.filter(o=>['em_producao','aguardando_material','bloqueado'].includes(o.status)))],['Prontos para subir','green',sort(O.filter(o=>['finalizado','pronto_subir','em_transporte'].includes(o.status)))]];
  tvTrack(panels);
  const late=O.filter(isLate).length, soon=O.filter(isSoon).length, ctl=!!me;
  const stale=!navigator.onLine||staleMsg;
  return `<div class="tv"><div class="tvtop"><div class="brand">${LEAF}Produção</div>
    <div class="tvkpi"><span class="kpi k-late ${late?'on':''}"><b>${late}</b>atrasados</span><span class="kpi k-soon ${soon?'on':''}"><b>${soon}</b>perto do prazo</span><span class="kpi"><b>${O.length}</b>no fluxo</span>${stale?'<span class="tvsync">Sem conexão: dados podem estar desatualizados</span>':''}</div>
    <div class="tvclock"><b id="tvclock"></b><span id="tvdate"></span></div>
    ${ctl?`<div class="tvctl"><button class="tvbtn" data-act="tv-full">Tela cheia</button><button class="tvbtn" data-act="nav" data-v="${NAV[R()][0]}">Sair do painel</button></div>`:''}</div>
    <div class="tvcols">${panels.map(([t,c,L],pi)=>`<section class="tvcol" style="--c:var(--s-${c})"><div class="tvch"><i></i><h3>${t}</h3><span class="ct">${L.length}</span></div><div class="tvlist">${L.map(o=>tvCard(o,c,pi)).join('')||'<div class="tvempty">Nenhum pedido nesta etapa</div>'}</div></section>`).join('')}</div></div>`;
}
let tvIdle=Date.now();
['pointermove','wheel','touchstart','keydown','pointerdown'].forEach(e=>document.addEventListener(e,()=>{ tvIdle=Date.now(); },{passive:true,capture:true}));
function tvTick(){
  if(view!=='tv') return;
  const d=new Date(), c=$('#tvclock'); if(!c) return;
  c.textContent=p2(d.getHours())+':'+p2(d.getMinutes());
  try{ $('#tvdate').textContent=d.toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,''); }catch(e){}
  document.querySelectorAll('.tv .tvi small[data-dl]').forEach(s=>{ const dl=s.dataset.dl; const w=tvWhen(dl===''?null:+dl); s.textContent=w.t; const card=s.closest('.tvi'); card.classList.toggle('late',w.k==='late'); card.classList.toggle('soon',w.k==='soon'); });
  document.querySelectorAll('.tv .tvlist').forEach(l=>l.classList.toggle('has-more',l.scrollHeight>l.clientHeight+4&&l.scrollTop+l.clientHeight<l.scrollHeight-4));
}
setInterval(tvTick,15000);
const tvScr=new Map();
setInterval(()=>{ if(view!=='tv'||drawerId||Date.now()-tvIdle<30000) return;
  document.querySelectorAll('.tv .tvlist').forEach(l=>{ if(l.scrollHeight<=l.clientHeight+4) return; const s=tvScr.get(l)||{w:0}; tvScr.set(l,s); const t=Date.now(); if(t<s.w) return;
    if(l.scrollTop+l.clientHeight>=l.scrollHeight-2){ s.w=t+4000; if(!s.back){ s.back=true; return; } s.back=false; l.scrollTop=0; s.w=t+4000; return; } s.back=false; l.scrollTop+=1; });
  tvTick(); },40);

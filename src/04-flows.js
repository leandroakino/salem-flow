
/* ---------- camadas, avisos, diálogos ---------- */
const LY=id=>document.getElementById(id);
function openLayer(id,html){ const l=LY(id); l.innerHTML=html; l.hidden=false; }
function closeLayer(id){ const l=LY(id); l.hidden=true; l.innerHTML=''; if(id==='drawer') drawerId=null; }
function toast(msg,err){ const d=document.createElement('div'); d.className='toast'+(err?' err':''); d.textContent=msg; $('#toasts').appendChild(d); setTimeout(()=>d.remove(),err?6500:4200); }
async function run(fn){ try{ await fn(); }catch(e){ console.error(e); toast(e&&e.message?e.message:'Não foi possível concluir. Tente novamente.',true); } }

function fieldHTML(f){
  const id='q-'+f.id, v=f.value==null?'':f.value;
  if(f.type==='note') return `<p class="muted">${f.html}</p>`;
  if(f.type==='checkbox') return `<label class="row"><input type="checkbox" id="${id}" ${f.value?'checked':''}> ${esc(f.label)}</label>`;
  let ctl;
  if(f.type==='select') ctl=`<select class="sel" id="${id}">${(f.options||[]).map(o=>{const ov=typeof o==='object'?o.v:o, ol=typeof o==='object'?o.l:o; return `<option value="${esc(ov)}" ${String(ov)===String(v)?'selected':''}>${esc(ol)}</option>`;}).join('')}</select>`;
  else if(f.type==='textarea') ctl=`<textarea class="txt" id="${id}">${esc(v)}</textarea>`;
  else ctl=`<input class="inp" id="${id}" type="${f.type==='number'?'number':f.type==='date'?'date':'text'}" ${f.type==='number'?'step="any" min="0"':''} value="${esc(v)}" ${f.ph?`placeholder="${esc(f.ph)}"`:''} autocomplete="off">`;
  return `<label class="fld"><span>${esc(f.label)}${f.required?' *':''}</span>${ctl}</label>`;
}
function ask(o){
  return new Promise(res=>{
    const f=o.fields||[];
    openLayer('dlg',`<div class="sheet small" role="dialog" aria-modal="true"><h2>${esc(o.title)}</h2>${o.note?`<p class="muted">${o.note}</p>`:''}<form id="askf" class="stack">${f.map(fieldHTML).join('')}<div class="row end"><button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn ${o.danger?'danger':'primary'}">${esc(o.ok||'Confirmar')}</button></div></form></div>`);
    const close=v=>{closeLayer('dlg');res(v);};
    $('#askf').onsubmit=e=>{
      e.preventDefault(); const v={};
      for(const fl of f){
        if(fl.type==='note') continue; const el=$('#q-'+fl.id);
        v[fl.id]=fl.type==='checkbox'?el.checked:fl.type==='number'?(el.value===''?0:Number(el.value)):el.value.trim();
        if(fl.required&&(fl.type==='number'?!(v[fl.id]>0):!v[fl.id])){ toast('Preencha: '+fl.label,true); el.focus(); return; }
      }
      close(v);
    };
    $('#askf [data-x=cancel]').onclick=()=>close(null);
    const first=$('#askf input:not([type=checkbox]),#askf select,#askf textarea'); if(first) first.focus();
  });
}
const confirmDlg=(title,note,ok,danger)=>ask({title,note,ok,danger,fields:[]}).then(v=>!!v);

/* editor de materiais (ficha técnica e baixa manual) */
const stockOptions=sel=>'<option value="">Material…</option>'+arr('stock').sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${i.id}" ${i.id===sel?'selected':''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('');
const matRow=r=>`<div class="matrow"><select class="sel">${stockOptions(r.sid)}</select><input class="inp" type="number" step="any" min="0" placeholder="Qtd" value="${r.qty||''}"><button type="button" class="btn sm ghost" data-mat-del aria-label="Remover">Remover</button></div>`;
const matEditor=(id,rows)=>`<div id="${id}">${rows.map(matRow).join('')}</div><button type="button" class="btn sm" data-mat-add="${id}">+ material</button>`;
const readMat=id=>$$('#'+id+' .matrow').map(r=>({sid:r.querySelector('select').value,qty:Number(r.querySelector('input').value)})).filter(x=>x.sid&&x.qty>0);

/* ---------- gaveta do pedido ---------- */
const kv=(l,v)=>v?`<dt>${l}</dt><dd>${v}</dd>`:'';
function drawerHTML(o){
  const prodOnly=R()==='producao', drv=isDrv(), pa=primaryAction(o), sec=secondary(o).filter(s=>!pa||s.a!==pa.a);
  const T=o.times||{}, tr=o.transport||{};
  const tl=[['Criado',o.createdAt],['Liberado',T.liberadoAt],['Aceito na fila',T.aceitoAt],['Produção iniciada',T.inicioAt],['Produção concluída',T.finalizadoAt],['Pronto para subir',T.prontoAt===T.finalizadoAt?0:T.prontoAt],['Transporte iniciado',tr.startedAt],['Transporte concluído',tr.endedAt],['Recebido no atendimento',T.recebidoAt],['Concluído',T.concluidoAt]].filter(x=>x[1]);
  const dl_=o.delivery||{};
  return `<div class="drawer" role="dialog" aria-label="Pedido ${orderNum(o)}">
    <div class="row between"><div class="row"><h2 style="font-size:1.9rem">${orderNum(o)}</h2>${chip(o)}${flags(o)}</div><button class="btn sm" data-act="close-drawer">Fechar</button></div>
    ${pa?`<button class="btn primary lg" data-act="${pa.a}" data-id="${o.id}">${pa.l}</button>`:''}
    ${o.block&&o.status==='bloqueado'?`<div class="cardmsg">Bloqueio: ${esc(o.block.reason)} (${esc(o.block.by)}, ${fDT(o.block.at)})</div>`:''}
    ${o.div&&o.status==='divergencia'?`<div class="cardmsg">Divergência: ${esc(o.div.label)}. ${esc(o.div.note)} (${esc(o.div.by)}, ${fDT(o.div.at)})</div>`:''}
    ${o.confReq?'<div class="cardmsg">A produção pediu conferência deste pedido.</div>':''}
    <div class="card"><h3>Itens</h3><div class="stack" style="margin-top:8px">${(o.items||[]).map(i=>`<div><b>${i.qty}× ${esc(i.name)}</b>${(prodOnly||drv)?'':` <span class="muted">${money(i.price)} cada</span>`}${i.desc?`<div class="cardmsg">${esc(i.desc)}</div>`:''}</div>`).join('')}</div>${thumbsHTML(o)}</div>
    <dl class="kv">${kv('Entrega/retirada',`${fDS(o.date)} às ${o.time||'(sem horário)'} · ${TYPES[o.type]}`)}${prodOnly?'':kv('Cliente',`${esc(o.client.name)} · ${esc(o.client.phone)}`)}${prodOnly?'':kv(o.type==='entrega'?'Destinatário':'Quem retira',o.recipient?esc(o.recipient)+(o.recipientPhone?' · '+esc(o.recipientPhone):''):'')}${prodOnly?'':kv('Endereço',esc(o.address))}${prodOnly?'':kv('Cartão',o.card==='com'?`"${esc(o.cardMsg)}" (${o.cardDone?'feito':'a fazer'})`:o.card==='sem'?'Sem cartão':'A definir pelo atendimento')}${kv('Montagem',esc(o.buildNotes))}${(prodOnly||drv)?'':kv('Obs. internas',esc(o.notes))}${(prodOnly||drv)?'':kv('Canal',CHANNELS[o.channel])}${prodOnly?'':kv('Pagamento',`${PAYM[o.pay.method]} · ${PAYS[o.pay.status]}`)}${(prodOnly||drv)?'':kv('Valores',`Produtos ${money(o.sub)} + taxa ${money(o.fee)} − desconto ${money(o.discount)} = <b>${money(o.total)}</b>`)}${kv('Responsável',esc(o.responsible))}${kv('Retirada/entrega',dl_.who?`Retirado por ${esc(dl_.who)} (${esc(dl_.by)}, ${fDT(dl_.at)})${dl_.obs?'. '+esc(dl_.obs):''}`:dl_.receivedBy?`Recebido por ${esc(dl_.receivedBy)}, entregue por ${esc(dl_.driver||'')} ${dl_.obs?'. '+esc(dl_.obs):''}`:dl_.driver?`Entregador: ${esc(dl_.driver)}`:'')}</dl>
    ${sec.length?`<div class="pillbtns">${sec.map(s=>`<button class="btn sm" data-act="${s.a}" data-id="${o.id}">${s.l}</button>`).join('')}</div>`:''}
    <div class="card"><h3>Linha do tempo</h3><div class="tl" style="margin-top:8px">${tl.map(([l,t],i)=>`<div><b>${l}</b> · ${fDT(t)}${i&&tl[i-1]?` <span class="muted">(+${dur(t-tl[i-1][1])})</span>`:''}</div>`).join('')}</div></div>
    <div class="card"><h3>Histórico de alterações</h3><div class="hist" style="margin-top:8px">${[...(o.history||[])].reverse().map(h=>`<div><b>${esc(h.act)}</b>${h.detail?': '+esc(h.detail):''}<div class="muted">${esc(h.by)} · ${fDT(h.at)}</div></div>`).join('')}</div></div>
  </div>`;
}
function openDrawer(id){ drawerId=id; refreshDrawer(); LY('drawer').hidden=false; }
function refreshDrawer(){ const o=S.orders[drawerId]; if(!o){ closeLayer('drawer'); return; } const l=LY('drawer'), sc=l.firstElementChild?l.firstElementChild.scrollTop:0; l.innerHTML=drawerHTML(o); l.hidden=false; if(l.firstElementChild) l.firstElementChild.scrollTop=sc; }

/* ---------- ficha de produção ---------- */
const payLine=o=>o.pay&&o.pay.status==='pago'?'PAGO':o.pay&&o.pay.status==='sinal'?'SINAL PAGO - COBRAR O RESTANTE':'A COBRAR NA ENTREGA/RETIRADA';
const cardLine=o=>o.card==='com'?('COM CARTAO'+(o.cardMsg?': "'+o.cardMsg+'"':'')):o.card==='sem'?'SEM CARTAO':'CARTAO A DEFINIR';
function fichaText(o){
  const ent=o.type==='entrega';
  const L=[`FICHA DO PEDIDO ${orderNum(o)}`,'',`${ent?'Destinatário':'Quem retira'}: ${o.recipient||o.client.name}`];
  if(o.recipient&&o.recipientPhone) L.push('Fone do destinatário: '+o.recipientPhone);
  L.push('','Descrição:'); (o.items||[]).forEach(i=>{ L.push(`- ${i.qty}× ${i.name}${i.desc?': '+i.desc:''}`); });
  if(o.buildNotes) L.push('Montagem: '+o.buildNotes);
  if(ent) L.push('',`Endereço: ${o.address}`);
  L.push('',`Data/horário: ${fDS(o.date)} às ${o.time||'(sem horário)'} (${TYPES[o.type]})`,'',`Remetente: ${o.client.name}`,`Fone: ${o.client.phone}`,'');
  L.push('Cartão: '+cardLine(o)); if(o.notes) L.push('Obs.: '+o.notes); L.push('Pagamento: '+payLine(o));
  return L.join('\n');
}

/* ---------- formulário de pedido ---------- */
let FM=null;
function itemRowHTML(it,i){
  const p=S.products[it.productId], cust=(p&&p.custom)||it.isCustom;
  return `<div class="itemrow"><label class="fld"><span>${esc(it.name)}${cust?' · personalizado':''}</span>${it.productId?'':`<input class="inp" data-f="name" data-i="${i}" value="${esc(it.name)}" aria-label="Nome do item">`}</label>
    <label class="fld"><span>Qtd</span><input class="inp" type="number" min="1" step="1" data-f="qty" data-i="${i}" value="${esc(it.qty)}"></label>
    <label class="fld"><span>Preço (R$)</span><input class="inp" type="number" min="0" step="0.01" data-f="price" data-i="${i}" value="${esc(it.price)}"></label>
    <button type="button" class="btn sm ghost" data-act="f-del" data-i="${i}">Remover</button>
    <label class="fld full"><span>Descrição do item${cust?' *':' (opcional)'}</span><textarea class="txt" style="min-height:56px" data-f="desc" data-i="${i}" placeholder="Cores, flores, tamanho, ocasião…">${esc(it.desc||'')}</textarea></label></div>`;
}
function checksHTML(E){
  const b=E.filter(e=>e.block), w=E.filter(e=>!e.block);
  if(!b.length&&!w.length) return '<div class="checks"><span class="ok">Tudo certo para liberar.</span></div>';
  return `<div class="checks">${b.map(e=>`<span class="bad">Falta: ${esc(e.t)}</span>`).join('')}${w.map(e=>`<span class="warn">Atenção: ${esc(e.t)}</span>`).join('')}</div>`;
}
function formHTML(){
  const F=FM, ex=F.id&&S.orders[F.id], draft=!F.id||(ex&&ex.status==='rascunho');
  const E=validate(F), blk=E.filter(e=>e.block).length;
  const radio=(name,val,label)=>`<label><input type="radio" name="${name}" data-f="${name}" value="${val}" ${F[name]===val?'checked':''}> ${label}</label>`;
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${l}</option>`).join('');
  const prods=arr('products').filter(p=>p.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="Pedido">
    <div class="row between"><h2>${F.id?'Editar '+orderNum(ex):'Novo pedido'}</h2><button class="btn sm" data-act="f-close">Fechar</button></div>
    ${ex&&PIPE.includes(ex.status)&&ex.status!=='liberado'?'<div class="cardmsg">Este pedido já está na produção. Avise a produção sobre qualquer mudança.</div>':''}
    <section class="grid2"><label class="fld"><span>Telefone *</span><input class="inp" id="fo-phone" data-f="phone" inputmode="tel" value="${esc(F.phone)}" placeholder="(92) 9 0000-0000" autocomplete="off"></label>
      <label class="fld"><span>Nome do cliente *</span><input class="inp" id="fo-name" data-f="name" list="fo-clients" value="${esc(F.name)}" autocomplete="off"><datalist id="fo-clients">${arr('clients').map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist></label>
      <label class="fld"><span>Canal</span><select class="sel" data-f="channel">${opt(CHANNELS,F.channel)}</select></label></section>
    <section class="stack"><div class="radio" role="radiogroup" aria-label="Tipo de atendimento">${radio('type','retirada','Retirada')}${radio('type','entrega','Entrega')}${radio('type','imediata','Venda imediata')}</div>
      <div class="grid2"><label class="fld"><span>Data *</span><input class="inp" type="date" data-f="date" value="${F.date}"></label>
      <label class="fld"><span>Horário combinado</span><input class="inp" type="time" data-f="time" value="${F.noTime?'':esc(F.time)}" ${F.noTime?'disabled':''}></label></div>
      <label class="row"><input type="checkbox" data-f="noTime" ${F.noTime?'checked':''}> Sem horário marcado</label>
      ${F.type==='entrega'?`<label class="fld"><span>Endereço de entrega *</span><textarea class="txt" style="min-height:60px" data-f="address">${esc(F.address)}</textarea></label>`:''}
      <div class="grid2"><label class="fld"><span>${F.type==='entrega'?'Destinatário (quem vai receber)':'Quem vai retirar (se for outra pessoa)'}</span><input class="inp" data-f="recipient" value="${esc(F.recipient)}" placeholder="Deixe em branco se for o próprio cliente" autocomplete="off"></label>
      <label class="fld"><span>Telefone do destinatário</span><input class="inp" data-f="recipientPhone" inputmode="tel" value="${esc(F.recipientPhone)}" autocomplete="off"></label></div>
      <label class="row"><input type="checkbox" data-f="urgent" ${F.urgent?'checked':''}> Marcar como urgente</label>
      <label class="row"><input type="checkbox" data-f="noProd" ${F.noProd?'checked':''}> Não passa pela produção (vai direto para retirada/entrega)</label></section>
    <section class="stack"><h3>Produtos</h3><div class="pillbtns">${prods.map(p=>`<button type="button" class="btn sm" data-act="f-add" data-pid="${p.id}">+ ${esc(p.name)}</button>`).join('')}<button type="button" class="btn sm ghost" data-act="f-addfree">+ Item avulso</button></div>
      ${prods.length?'':'<span class="muted small">Nenhum produto cadastrado. Use "Item avulso" ou peça ao administrador para cadastrar produtos.</span>'}
      ${F.items.map(itemRowHTML).join('')||'<div class="empty">Toque em um produto acima para adicionar.</div>'}</section>
    <section class="stack"><h3>Cartão</h3><p class="muted small">O cartão é feito no atendimento. Pode deixar para definir depois; a confirmação acontece quando o pedido subir.</p><div class="radio" role="radiogroup" aria-label="Cartão">${radio('card','','Definir depois')}${radio('card','com','Com cartão')}${radio('card','sem','Sem cartão')}</div>
      ${F.card==='com'?`<label class="fld"><span>Mensagem do cartão (se já tiver)</span><textarea class="txt" data-f="cardMsg">${esc(F.cardMsg)}</textarea></label>`:''}</section>
    <section class="grid2"><label class="fld"><span>Observações de montagem (a produção vê)</span><textarea class="txt" data-f="buildNotes">${esc(F.buildNotes)}</textarea></label>
      <label class="fld"><span>Observações internas (só atendimento)</span><textarea class="txt" data-f="notes">${esc(F.notes)}</textarea></label></section>
    <section class="stack"><h3>Fotos de referência</h3><div class="thumbs">${F.photos.map((p,i)=>`<span><img src="/_blob/${esc(p.id)}" alt="Referência"><br><button type="button" class="btn sm ghost" data-act="f-photo-del" data-i="${i}">Remover</button></span>`).join('')}</div>
      ${assets?'<input type="file" id="fo-photo" accept="image/*" multiple class="inp">':'<span class="muted small">O envio de fotos não está disponível para o seu acesso. Peça ao administrador para ajustar o compartilhamento.</span>'}</section>
    <section class="stack"><h3>Pagamento</h3><div class="grid2"><label class="fld"><span>Forma</span><select class="sel" data-f="payMethod">${opt(PAYM,F.payMethod)}</select></label><label class="fld"><span>Situação</span><select class="sel" data-f="payStatus">${opt(PAYS,F.payStatus)}</select></label>
      <label class="fld"><span>Taxa de entrega (R$)</span><input class="inp" type="number" min="0" step="0.01" data-f="fee" value="${esc(F.fee)}"></label><label class="fld"><span>Desconto (R$)</span><input class="inp" type="number" min="0" step="0.01" data-f="discount" value="${esc(F.discount)}"></label></div>
      <div class="row between"><span class="muted">Valor total</span><span class="tot" id="f-tot">${money(fToOrder(F).total)}</span></div></section>
    <div id="f-checks">${checksHTML(E)}</div>
    <div class="row end">${draft?'<button class="btn" data-act="f-save" data-release="0">Salvar rascunho</button>':''}<button class="btn primary lg" id="f-release" data-act="f-save" data-release="1" ${blk?'disabled':''}>${blk?`Faltam ${blk} item(ns)`:(draft?(FM.noProd?'Salvar e enviar sem produção':'Salvar e liberar para produção'):'Salvar alterações')}</button></div>
  </div>`;
}
function renderForm(){ const l=LY('form'), sc=l.scrollTop; l.innerHTML=formHTML(); l.hidden=false; l.scrollTop=sc; }
function liveForm(){
  const E=validate(FM), blk=E.filter(e=>e.block).length, ex=FM.id&&S.orders[FM.id], draft=!FM.id||(ex&&ex.status==='rascunho');
  $('#f-tot').textContent=money(fToOrder(FM).total); $('#f-checks').innerHTML=checksHTML(E);
  const b=$('#f-release'); if(b){ b.disabled=blk>0; b.textContent=blk?`Faltam ${blk} item(ns)`:(draft?(FM.noProd?'Salvar e enviar sem produção':'Salvar e liberar para produção'):'Salvar alterações'); }
}
function openForm(F){ FM=F; renderForm(); setTimeout(()=>{ const e=$('#fo-phone'); if(e&&!FM.phone) e.focus(); },50); }
function setField(t){
  const f=t.dataset.f; let v=t.type==='checkbox'?t.checked:t.value;
  if(t.dataset.i!==undefined) FM.items[+t.dataset.i][f]=v; else FM[f]=v;
}
LY('form').addEventListener('input',e=>{
  const t=e.target; if(!t.dataset||!t.dataset.f) return; if(t.type==='radio'&&!t.checked) return;
  setField(t);
  if(t.dataset.f==='phone'){ const c=S.clients['c'+digits(t.value)]; if(c&&!FM.name){ FM.name=c.name; $('#fo-name').value=c.name; } }
  if(t.dataset.f==='name'){ const c=arr('clients').find(c=>c.name.toLowerCase()===t.value.trim().toLowerCase()); if(c&&!FM.phone){ FM.phone=c.phone; $('#fo-phone').value=c.phone; } }
  if(['type','card','noTime'].includes(t.dataset.f)) renderForm(); else liveForm();
});
LY('form').addEventListener('change',async e=>{
  const t=e.target;
  if(t.id==='fo-photo'&&assets){
    for(const file of Array.from(t.files)){
      try{ const r=await assets.upload(file); FM.photos.push({id:r.id}); }catch(err){ toast('Não consegui enviar a foto '+file.name+(err&&err.code==='unsupported_type'?' (formato não aceito)':''),true); }
    }
    renderForm();
  }
});

/* ---------- recebimento e conferência ---------- */
function receiveDialog(o){
  openLayer('dlg',`<div class="sheet small" role="dialog" aria-modal="true"><h2>Conferir ${orderNum(o)}</h2><p class="muted">Confira o que chegou da produção com o pedido.</p>
    <div class="card stack">${(o.items||[]).map(i=>`<div><b>${i.qty}× ${esc(i.name)}</b>${i.desc?`<div class="cardmsg">${esc(i.desc)}</div>`:''}</div>`).join('')}${thumbsHTML(o)}<div class="small muted">Para ${o.time||'sem horário'} · ${fDS(o.date)} · ${TYPES[o.type]}</div></div>
    ${o.card==='sem'?'':`<div class="stack"><h3>Cartão</h3>${o.card==='com'?'':'<div class="radio"><label><input type="radio" name="rc-cs" value="com" checked> Com cartão</label><label><input type="radio" name="rc-cs" value="sem"> Sem cartão</label></div>'}<div id="rc-cardwrap" class="stack"><label class="fld"><span>Mensagem do cartão</span><textarea class="txt" id="rc-msg" style="min-height:60px">${esc(o.cardMsg)}</textarea></label><label class="row"><input type="checkbox" id="rc-3" ${o.cardDone?'checked':''}> Cartão feito e colocado no produto</label></div></div>`}
    <label class="row"><input type="checkbox" id="rc-1"> O produto confere com o pedido</label><label class="row"><input type="checkbox" id="rc-2"> A quantidade confere</label>
    <div class="row end"><button class="btn" id="rc-x">Cancelar</button><button class="btn danger" id="rc-div">Registrar divergência</button><button class="btn primary" id="rc-ok" disabled>Confirmar recebimento</button></div></div>`);
  const cardSel=()=>o.card==='sem'?'sem':(o.card==='com'?'com':(($('input[name=rc-cs]:checked')||{}).value||'com'));
  const upd=()=>{ const s=cardSel(), w=$('#rc-cardwrap'); if(w) w.hidden=s==='sem'; const cardOk=s==='sem'||($('#rc-3').checked&&$('#rc-msg').value.trim()!==''); $('#rc-ok').disabled=!($('#rc-1').checked&&$('#rc-2').checked&&cardOk); };
  $('.sheet').addEventListener('change',upd); $('.sheet').addEventListener('input',upd); upd(); $('#rc-x').onclick=()=>closeLayer('dlg');
  $('#rc-ok').onclick=()=>run(async()=>{
    const cur=S.orders[o.id]; if(!['pronto_subir','em_transporte'].includes(cur.status)) throw new Error('Este pedido não está mais aguardando recebimento');
    const tr=cur.transport||{};
    await oact(cur,{status:'recebido',divOpen:false,receivedBy:me.name,card:cardSel(),cardMsg:cardSel()==='com'?$('#rc-msg').value.trim():'',cardDone:true,times:{recebidoAt:now()},transport:{startedAt:tr.startedAt||now(),startedBy:tr.startedBy||me.name,endedAt:tr.endedAt||now(),endedBy:tr.endedBy||me.name}},'Recebimento conferido','Produto e quantidade conferidos por '+me.name);
    closeLayer('dlg'); toast(orderNum(cur)+' recebido no atendimento');
  });
  $('#rc-div').onclick=()=>run(async()=>{
    const v=await ask({title:'Registrar divergência',note:'O pedido volta para a fila de correção da produção.',danger:true,ok:'Registrar divergência',fields:[{id:'type',label:'O que aconteceu?',type:'select',options:Object.entries(DIVT).map(([v,l])=>({v,l}))},{id:'note',label:'Detalhes',type:'textarea',required:true}]});
    if(!v) return;
    const cur=S.orders[o.id];
    await oact(cur,{status:'divergencia',divOpen:true,div:{type:v.type,label:DIVT[v.type],note:v.note,by:me.name,at:now()},divCount:(cur.divCount||0)+1},'Divergência registrada',DIVT[v.type]+'. '+v.note);
    closeLayer('dlg'); toast('Pedido enviado para correção');
  });
}

/* ---------- formulários de cadastro ---------- */
const stockPick=(sel)=>({id:'sid',label:'Item',type:'select',options:[{v:'',l:'Escolha o item'},...arr('stock').sort((a,b)=>a.name.localeCompare(b.name)).map(i=>({v:i.id,l:i.name+' ('+i.unit+')'}))],value:sel||'',required:true});
const locOpts=Object.entries(LOC).map(([v,l])=>({v,l}));
async function stockForm(it){
  const v=await ask({title:it?'Editar item':'Novo item de estoque',ok:'Salvar',fields:[
    {id:'name',label:'Nome',type:'text',required:true,value:it&&it.name},{id:'cat',label:'Categoria',type:'select',options:SCAT,value:it&&it.cat},
    {id:'code',label:'Código',type:'text',value:it&&it.code},{id:'unit',label:'Unidade de medida (un, m, kg…)',type:'text',required:true,value:it?it.unit:'un'},
    {id:'min',label:'Estoque mínimo (total)',type:'number',value:it&&it.min},{id:'minExp',label:'Mínimo no expositor (opcional)',type:'number',value:it&&it.minExp},
    {id:'cost',label:'Custo de aquisição (R$ por unidade)',type:'number',value:it&&it.cost},{id:'supplier',label:'Fornecedor',type:'text',value:it&&it.supplier},{id:'locPhys',label:'Localização física (prateleira, câmara…)',type:'text',value:it&&it.locPhys}]});
  if(!v) return;
  if(it){ await patch('stock',it.id,v); await logEv('Item de estoque editado',v.name); }
  else { const id='s'+uid(); await put('stock',id,{...v,qty:{producao:0,reserva:0,expositor:0},rsv:0,entryAt:now()}); await logEv('Item de estoque criado',v.name); }
}
async function productForm(p){
  openLayer('dlg',`<div class="sheet" role="dialog" aria-modal="true"><h2>${p?'Editar produto':'Novo produto'}</h2><div class="grid2">
    <label class="fld"><span>Nome *</span><input class="inp" id="pf-n" value="${esc(p&&p.name)}"></label><label class="fld"><span>Categoria</span><select class="sel" id="pf-c">${PCAT.map(c=>`<option ${p&&p.category===c?'selected':''}>${c}</option>`).join('')}</select></label>
    <label class="fld"><span>Preço (R$)</span><input class="inp" id="pf-p" type="number" min="0" step="0.01" value="${p?p.price:''}"></label></div>
    <label class="row"><input type="checkbox" id="pf-cu" ${p&&p.custom?'checked':''}> Produto personalizado (exige descrição no pedido)</label><label class="row"><input type="checkbox" id="pf-ac" ${!p||p.active!==false?'checked':''}> Ativo</label>
    <label class="row"><input type="checkbox" id="pf-di" ${p&&p.direct?'checked':''}> Fica no atendimento: vendido direto, sem passar pela produção</label>
    <label class="fld"><span>Se for direto, sai do estoque de</span><select class="sel" id="pf-dl">${locOpts.map(l=>`<option value="${l.v}" ${((p&&p.directLoc)||'expositor')===l.v?'selected':''}>${l.l}</option>`).join('')}</select></label>
    <div><h3>Ficha técnica (por unidade)</h3><p class="muted small">Materiais que saem do estoque de produção quando o pedido é concluído. Sem ficha, a produção informa a baixa manualmente.</p>${matEditor('pf-mat',(p&&p.recipe&&p.recipe.length)?p.recipe.map(r=>({sid:r.sid,qty:r.qty})):[{}])}</div>
    <div class="row end"><button class="btn" id="pf-x">Cancelar</button><button class="btn primary" id="pf-ok">Salvar produto</button></div></div>`);
  $('#pf-x').onclick=()=>closeLayer('dlg');
  $('#pf-ok').onclick=()=>run(async()=>{
    const name=$('#pf-n').value.trim(); if(!name){ toast('Informe o nome do produto',true); return; }
    const d={name,category:$('#pf-c').value,price:Number($('#pf-p').value)||0,custom:$('#pf-cu').checked,active:$('#pf-ac').checked,direct:$('#pf-di').checked,directLoc:$('#pf-dl').value,recipe:readMat('pf-mat')};
    if(p) await patch('products',p.id,d); else await put('products','p'+uid(),d);
    await logEv(p?'Produto editado':'Produto criado',name); closeLayer('dlg');
  });
}

/* ---------- exemplo e primeiro acesso ---------- */
async function loadDemo(){
  const st=[['s-rosa','Rosa vermelha','Flores naturais','un',20,6,4.5,{producao:60,reserva:20,expositor:12}],['s-gira','Girassol','Flores naturais','un',10,4,6,{producao:25,reserva:10,expositor:8}],['s-emb','Embalagem kraft','Embalagens','un',15,0,2.2,{producao:40,reserva:20,expositor:0}],['s-fita','Fita de cetim','Fitas','m',20,0,0.8,{producao:100,reserva:0,expositor:0}],['s-papel','Papel de seda','Papéis','un',30,0,0.5,{producao:120,reserva:0,expositor:0}],['s-lac','Laço pronto','Laços','un',10,0,1.5,{producao:30,reserva:0,expositor:0}],['s-choc','Caixa de chocolate','Chocolates','un',6,3,14,{producao:10,reserva:6,expositor:5}],['s-pel','Pelúcia pequena','Pelúcias','un',4,2,22,{producao:0,reserva:6,expositor:4}],['s-vaso','Vaso de cerâmica','Vasos','un',5,2,18,{producao:8,reserva:6,expositor:5}],['s-cache','Cachepô','Cachepôs','un',6,0,9,{producao:12,reserva:8,expositor:0}],['s-adubo','Adubo orgânico (pacote)','Adubos','un',3,2,7,{producao:0,reserva:6,expositor:4}]];
  for(const [id,name,cat,unit,min,minExp,cost,qty] of st) await put('stock',id,{name,cat,unit,min,minExp,cost,supplier:'',code:'',locPhys:'',qty,rsv:0,entryAt:now()});
  const pr=[['p-buq6','Buquê de 6 rosas','Buquês',89.9,false,[['s-rosa',6],['s-emb',1],['s-fita',1.5],['s-papel',2]]],['p-gira','Buquê de girassóis','Buquês',79.9,false,[['s-gira',5],['s-emb',1],['s-fita',1.5],['s-papel',2]]],['p-arr','Arranjo no cachepô','Arranjos',129.9,false,[['s-rosa',8],['s-cache',1],['s-papel',1]]],['p-cesta','Cesta de presente','Cestas',159.9,true,[['s-choc',1],['s-pel',1],['s-rosa',4],['s-emb',1],['s-lac',1]]],['p-choc','Caixa de chocolate','Presentes',39.9,false,[['s-choc',1]]],['p-pers','Buquê personalizado','Buquês',120,true,[]]];
  for(const [id,name,category,price,custom,rec] of pr) await put('products',id,{name,category,price,custom,active:true,direct:id==='p-choc',directLoc:'expositor',recipe:rec.map(([sid,qty])=>({sid,qty}))});
}
async function setup(){
  const name=$('#su-name').value.trim(); if(!name){ toast('Informe o nome do administrador',true); return; }
  const id='u'+uid(); await put('users',id,{name,role:'admin',active:true});
  if($('#su-team').checked) for(const [n,r] of [['Atendimento 1','atendimento'],['Atendimento 2','atendimento'],['Produção','producao']]) await put('users','u'+uid(),{name:n,role:r,active:true});
  if($('#su-demo').checked) await loadDemo();
  doLogin(id);
}
function doLogin(id){ const u=S.users[id]; if(!u) return; me={id:u.id,name:u.name,role:u.role}; lsSet('salem.me',id); initView(); render(); }
function initView(){ const h=(location.hash||'').replace('#',''); const allowed=NAV[R()].concat(['tv']); view=allowed.includes(h)?h:({admin:'dash',atendimento:'pedidos',producao:'fila',entregador:'minhas'})[R()]; }
function autoLogin(){
  if(me){ const u=S.users[me.id]; me=(u&&u.active!==false)?{id:u.id,name:u.name,role:u.role}:null; return; }
  const id=lsGet('salem.me'); const u=id&&S.users[id]; if(u&&u.active!==false){ me={id:u.id,name:u.name,role:u.role}; initView(); }
}

/* ---------- exportação ---------- */
const csv=rows=>'﻿'+rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(';')).join('\r\n');
async function exportCSV(name,rows){ if(!dl){ toast('A exportação não está disponível nesta visualização',true); return; } try{ await dl.save({filename:name,data:csv(rows)}); }catch(e){ if(!e||e.code!=='declined') toast('Não foi possível exportar',true); } }

/* ---------- notificações ---------- */
function notifMsg(o){
  const n=orderNum(o), r=R();
  if(r==='producao'||r==='admin'){ if(o.status==='liberado'&&r==='producao') return `Novo pedido ${n} liberado para produção`; if(o.status==='divergencia') return `${n} voltou para correção: ${o.div?o.div.label:''}`; }
  if(r==='atendimento'||r==='admin'){ if(o.status==='pronto_subir'&&r==='atendimento') return `${n} está pronto para subir`; if(o.status==='bloqueado') return `${n} bloqueado: ${o.block?o.block.reason:''}`; }
  return null;
}
function handleOrderChanges(snap){
  snap.docChanges().forEach(ch=>{
    const o=ch.doc.data(), id=ch.doc.id, prev=lastStatus[id]; lastStatus[id]=o.status;
    if(ordersSeen&&me&&prev!==o.status&&ch.type!=='removed'&&!ch.doc.metadata.hasPendingWrites){ const m=notifMsg(o); if(m) toast(m); }
  });
  ordersSeen=true;
}

/* ---------- ações ---------- */
const H={};
const ordr=d=>S.orders[d.id];
const TV_URL='https://claude.ai/artifact/NxdWdZfLGYEwhLZty42yHC#tv';
function tvDialog(){
  openLayer('dlg',`<div class="sheet small" role="dialog" aria-modal="true"><h2>Painel de TV</h2><p class="muted">Para a TV não atrapalhar quem movimenta os pedidos, abra o painel em uma janela ou aparelho separado, por exemplo o computador ligado à TV da produção.</p>
    <div class="stack"><a class="btn primary lg" href="${TV_URL}" target="_blank" rel="noopener">Abrir o painel em uma nova aba</a><button class="btn" id="tv-copy">Copiar o link do painel</button>
    <p class="small muted">No computador da TV, abra esse link, escolha o usuário uma vez e toque em "Tela cheia". O painel atualiza sozinho. Esta janela continua livre para movimentar os pedidos.</p><button class="btn ghost" id="tv-here">Ver o painel nesta janela mesmo</button></div>
    <div class="row end"><button class="btn" id="tv-x">Fechar</button></div></div>`);
  $('#tv-x').onclick=()=>closeLayer('dlg');
  $('#tv-here').onclick=()=>{ closeLayer('dlg'); closeLayer('drawer'); setView('tv'); };
  $('#tv-copy').onclick=async()=>{ try{ await navigator.clipboard.writeText(TV_URL); toast('Link copiado'); }catch(e){ toast('Não consegui copiar. Use o botão "Abrir o painel em uma nova aba".',true); } };
}
H.nav=d=>{ if(d.v==='tv'){ tvDialog(); return; } closeLayer('drawer'); setView(d.v); };
H.logout=()=>{ me=null; lsSet('salem.me',''); ['drawer','form','dlg'].forEach(closeLayer); render(); };
H.login=d=>doLogin(d.id);
H.setup=()=>setup();
H['close-drawer']=()=>closeLayer('drawer');
H['f-close']=()=>{ closeLayer('form'); FM=null; };
H['o-open']=d=>openDrawer(d.id);
H['o-new']=d=>{ const F=newF(); if(d.cid&&S.clients[d.cid]){ F.name=S.clients[d.cid].name; F.phone=S.clients[d.cid].phone; } openForm(F); };
H['o-edit']=d=>openForm(orderToF(ordr(d)));
H['o-dup']=d=>{ const F=orderToF(ordr(d)); openForm({...F,id:null,key:uid(),date:todayKey(),time:'',noTime:false,photos:[],urgent:false}); };
H['o-release']=async d=>{ const o=ordr(d); const F=orderToF(o); if(validate(F).some(e=>e.block)){ toast('Faltam dados. Complete o pedido para liberar.',true); openForm(F); return; } if((await releaseOrder(o,{},[]))===false) return; const n=await waitOrder(o.id); if(n) openFicha(n,'Pedido liberado. Imprima a ficha e envie com o pedido.'); };
function slipHTML(o){
  const ent=o.type==='entrega', dest=o.recipient||o.client.name;
  const items=(o.items||[]).map(i=>`<div class="s-i">${i.qty}x ${esc(i.name)}${i.desc?`<br><span>${esc(i.desc)}</span>`:''}${i.direct?'<br><span>(item da loja, nao montar)</span>':''}</div>`).join('');
  return `<div class="slip" id="slip"><div class="s-h">SALEM FLORICULTURA</div><div class="s-n">${orderNum(o)}</div><svg id="slip-bc"></svg>
    ${o.urgent||isLate(o)?'<div class="s-b">*** URGENTE ***</div>':''}${o.changedAt?'<div class="s-b">PEDIDO ALTERADO<br>Descarte a ficha antiga</div>':''}
    <div class="s-l">${ent?'DESTINATARIO:':'QUEM RETIRA:'}</div><div class="s-v s-big">${esc(dest)}</div>${o.recipient&&o.recipientPhone?`<div class="s-v">Fone dest.: ${esc(o.recipientPhone)}</div>`:''}
    <div class="s-l">DESCRICAO:</div><div class="s-v">${items}${o.buildNotes?`<div><b>Montagem:</b> ${esc(o.buildNotes)}</div>`:''}</div>
    ${ent?`<div class="s-l">ENDERECO:</div><div class="s-v s-big">${esc(o.address)}</div>`:''}
    <div class="s-l">DATA/HORARIO:</div><div class="s-v s-big">${ent?'ENTREGA':'RETIRADA'} ${o.time||'sem horario'}<br>${fDS(o.date)}</div>
    <div class="s-l">REMETENTE:</div><div class="s-v">${esc(o.client.name)}</div>
    <div class="s-l">FONE:</div><div class="s-v">${esc(o.client.phone)}</div><hr>
    <div><b>${esc(cardLine(o))}</b></div>${o.notes?`<div>Obs: ${esc(o.notes)}</div>`:''}<div><b>${esc(payLine(o))}</b></div><hr>
    <div class="s-f">Cole na embalagem e envie<br>junto com o pedido.</div><div class="s-f small">Impresso ${fT(now())}${me?' por '+esc(me.name):''}</div></div>`;
}
const SLIP_CSS=`@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000}.slip{width:72mm;margin:0 auto;padding:3mm 2mm;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.3}.s-h{text-align:center;font-weight:700}.s-n{text-align:center;font-weight:700;font-size:40px;line-height:1.1;margin:4px 0}.s-b{text-align:center;font-weight:700;border:2px solid #000;margin:6px 0;padding:2px}.s-l{font-weight:700;font-size:13px;margin-top:8px;border-top:1px solid #000;padding-top:3px}.s-v{margin-bottom:2px}.s-big{font-weight:700;font-size:16px}hr{border:0;border-top:1px dashed #000;margin:7px 0}svg{display:block;margin:0 auto;max-width:100%}.s-i{margin-bottom:5px;font-weight:700}.s-i span{font-weight:400}.s-f{text-align:center;margin-top:6px}.small{font-size:10px}`;
const slipDoc=o=>`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha ${orderNum(o)}</title><style>${SLIP_CSS}</style></head><body>${$('#slip').outerHTML}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`;
function openFicha(o,note){
  openLayer('dlg',`<div class="sheet small"><h2>Ficha ${orderNum(o)}</h2><p class="muted small">${note||'Ficha com todas as informações do pedido, sem valores. Papel de 80 mm.'}</p>${slipHTML(o)}<div class="row end" style="flex-wrap:wrap"><button class="btn" id="fch-c">Copiar texto</button><button class="btn primary" id="fch-d">Baixar para imprimir</button><button class="btn" id="fch-x">Fechar</button></div><p class="muted small">Baixar para imprimir: abra o arquivo baixado e o navegador já abre a impressão em 80 mm. A impressão automática, sem clicar, entra na versão definitiva.</p></div>`);
  try{ if(window.JsBarcode) window.JsBarcode('#slip-bc',String(o.num).padStart(4,'0'),{format:'CODE128',width:2,height:44,displayValue:false,margin:0,background:'#ffffff',lineColor:'#000000'}); }catch(e){}
  $('#fch-x').onclick=()=>closeLayer('dlg');
  $('#fch-d').onclick=async()=>{ if(!dl){ toast('Download indisponível nesta visualização',true); return; } try{ await dl.save({filename:'ficha-'+String(o.num).padStart(4,'0')+'.html',data:slipDoc(o)}); }catch(e){ if(!e||e.code!=='declined') toast('Não consegui baixar a ficha',true); } };
  $('#fch-c').onclick=async()=>{ try{ await navigator.clipboard.writeText(fichaText(o)); toast('Ficha copiada'); }catch(e){ const r=document.createRange(); r.selectNodeContents($('#slip')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selecionei o texto. Use copiar do seu aparelho.'); } };
}
async function waitOrder(id){ for(let k=0;k<40&&!S.orders[id];k++) await new Promise(r=>setTimeout(r,50)); return S.orders[id]; }
H['o-ficha']=d=>openFicha(ordr(d));
H['o-cancel']=async d=>{ const o=ordr(d); const canBack=(o.stockDone&&o.stockUsed&&!o.stockReturned)||(o.directUsed&&o.directUsed.length&&!o.directReturned); const v=await ask({title:`Cancelar ${orderNum(o)}?`,ok:'Cancelar pedido',danger:true,note:'O pedido não é apagado: fica no histórico como cancelado.',fields:[{id:'reason',label:'Motivo',type:'text',required:true},...(canBack?[{id:'back',label:'Devolver ao estoque os materiais e produtos já baixados',type:'checkbox',value:true}]:[])]}); if(!v) return;
  await oact(o,{status:'cancelado',cancel:{reason:v.reason,by:me.name,at:now()}},'Pedido cancelado',v.reason);
  if(v.back){
    if(o.stockDone&&o.stockUsed&&!o.stockReturned) for(const [sid,q] of Object.entries(o.stockUsed)) await moveStock({sid,from:'ext',to:'producao',qty:q,type:'estorno_pedido',orderId:o.id,note:'Cancelamento '+orderNum(o)});
    if(o.directUsed&&!o.directReturned) for(const p of o.directUsed) await moveStock({sid:p.sid,from:'ext',to:p.loc,qty:p.qty,type:'estorno_pedido',orderId:o.id,note:'Cancelamento '+orderNum(o)});
    await oact(S.orders[o.id]||o,{stockReturned:true,directReturned:true},'Estoque estornado','Materiais e produtos devolvidos ao estoque');
  }
  closeLayer('drawer'); toast(orderNum(o)+' cancelado'); };
H['o-direct']=async d=>{ const o=ordr(d);
  const v=await ask({title:'Sem produção: '+orderNum(o),ok:'Enviar para retirada/entrega',note:'Para produtos que ficam no andar do atendimento (chocolates, pelúcias…). O pedido pula a produção e já fica aguardando retirada ou entrega.',fields:[{id:'sid',label:'Baixar do estoque',type:'select',options:[{v:'',l:'Não baixar estoque'},...arr('stock').sort((a,b)=>a.name.localeCompare(b.name)).map(i=>({v:i.id,l:i.name+' ('+i.unit+')'}))],value:''},{id:'qty',label:'Quantidade a baixar',type:'number',value:1},{id:'loc',label:'Sai de',type:'select',options:locOpts,value:'expositor'}]}); if(!v) return;
  const plan=v.sid?[{sid:v.sid,loc:v.loc,qty:v.qty||1}]:[];
  if(plan.length&&!(await checkDirectStock(plan))) return;
  const cur=S.orders[o.id];
  await oact(cur,{status:'recebido',skipProd:true,receivedBy:me.name,times:{recebidoAt:now()},...(plan.length?{directUsed:[...(cur.directUsed||[]),...plan]}:{})},'Sem produção','Produto do atendimento'+(plan.length?'. Baixa de '+S.stock[v.sid].name:''));
  await applyDirect(o.id,plan,o); toast(orderNum(o)+' enviado direto para retirada/entrega'); };
H['p-accept']=d=>oact(ordr(d),{status:'aguardando_prod',responsible:me.name,times:{aceitoAt:now()}},'Aceito na fila de produção');
H['p-start']=async d=>{ const o=ordr(d), resume=o.status==='aguardando_material'; const pt={status:'em_producao',responsible:o.responsible||me.name,block:null,times:{}}; if(!(o.times&&o.times.inicioAt)) pt.times.inicioAt=now(); if(!(o.times&&o.times.aceitoAt)) pt.times.aceitoAt=now(); await oact(o,pt,resume?'Produção retomada':'Produção iniciada'); if(!resume){ const n=await waitOrder(o.id); if(n) openFicha(n,'Produção iniciada. Imprima a ficha e cole no produto. Lá em cima, o número da ficha tem que bater com o pedido que subiu.'); } };
H['p-resume']=d=>oact(ordr(d),{status:'em_producao',block:null,waitReason:null},'Produção retomada');
async function newMatReq(orderId){
  const o=orderId&&S.orders[orderId];
  const v=await ask({title:'Avisar falta de material',ok:'Avisar',note:o?'Pedido '+orderNum(o)+'. O pedido continua em produção.':'Os outros setores veem este aviso na aba Materiais.',fields:[{id:'sid',label:'Material do estoque',type:'select',options:[{v:'',l:'Outro (descrever abaixo)'},...arr('stock').sort((a,b)=>a.name.localeCompare(b.name)).map(i=>({v:i.id,l:i.name+' ('+i.unit+')'}))],value:''},{id:'text',label:'Descrição ou observação',type:'text'},{id:'qty',label:'Quantidade necessária (opcional)',type:'number'},...(o?[]:[{id:'ord',label:'Número do pedido (opcional)',type:'text'}])]});
  if(!v) return;
  if(!v.sid&&!v.text) throw new Error('Escolha o material ou descreva qual está faltando');
  let oid=orderId||'';
  if(!oid&&v.ord){ const n=Number(digits(v.ord)); const f=arr('orders').find(x=>x.num===n); if(!f) throw new Error('Pedido '+v.ord+' não encontrado'); oid=f.id; }
  const it=v.sid&&S.stock[v.sid];
  await put('matreq',uid(),{sid:v.sid||'',name:it?it.name:v.text,unit:it?it.unit:'',text:v.sid?v.text:'',qty:v.qty||0,orderId:oid,status:'aberto',by:me.name,role:me.role,at:now()});
  if(oid) await oact(S.orders[oid],{},'Falta de material avisada',it?it.name:v.text);
  toast('Aviso enviado ao atendimento');
}
H['p-wait']=d=>newMatReq(d.id);
H['mr-new']=()=>newMatReq(null);
H['mr-prov']=async d=>{ const m=S.matreq[d.id]; const v=await ask({title:'Material providenciado: '+m.name,ok:'Marcar providenciado',fields:[{id:'note',label:'Observação (previsão de chegada, onde comprar…)',type:'text'}]}); if(v) await patch('matreq',m.id,{status:'providenciado',provBy:me.name,provAt:now(),note:v.note}); };
H['mr-got']=async d=>{ const m=S.matreq[d.id]; await patch('matreq',m.id,{status:'resolvido',resBy:me.name,resAt:now()}); if(m.orderId&&S.orders[m.orderId]) await oact(S.orders[m.orderId],{},'Material recebido',m.name); toast('Material marcado como recebido'); };
H['mr-cancel']=async d=>{ if(await confirmDlg('Cancelar este aviso?','','Cancelar aviso',true)) await patch('matreq',d.id,{status:'cancelado',resBy:me.name,resAt:now()}); };
H['p-problem']=async d=>{ const v=await ask({title:'Informar problema',ok:'Bloquear pedido',danger:true,fields:[{id:'t',label:'O que aconteceu?',type:'textarea',required:true}]}); if(v) await oact(ordr(d),{status:'bloqueado',block:{reason:v.t,by:me.name,at:now(),negAuth:false}},'Pedido bloqueado',v.t); };
H['p-done']=d=>{ const o=ordr(d); if(o.status!=='em_producao') return;
  openLayer('dlg',`<div class="sheet small" role="dialog" aria-modal="true"><h2>Pronto para subir ${orderNum(o)}</h2>
    <div class="cardmsg">${esc(prodItemsText(o))}</div>${o.buildNotes?`<div class="small"><b>Montagem:</b> ${esc(o.buildNotes)}</div>`:''}${thumbsHTML(o)}
    <label class="row"><input type="checkbox" id="cm-ok"> Conferi a montagem com a descrição, a foto e o cartão: está de acordo</label>
    <div class="row end"><button class="btn" id="cm-x">Cancelar</button><button class="btn primary lg" id="cm-go">Pronto para subir</button></div></div>`);
  $('#cm-x').onclick=()=>closeLayer('dlg');
  $('#cm-go').onclick=()=>run(async()=>{
    if(!$('#cm-ok').checked){ toast('Marque que conferiu a montagem',true); return; }
    const cur=S.orders[o.id]; if(!cur||cur.status!=='em_producao'){ closeLayer('dlg'); return; }
    const r=await completeProduction(cur); closeLayer('dlg');
    toast(orderNum(cur)+' pronto para subir'+(r.neg.length?'. Atenção: estoque negativo em '+r.neg.join(', '):''));
  }); };
H['p-confreq']=d=>oact(ordr(d),{confReq:true},'Conferência solicitada à loja');
H['conf-ok']=d=>oact(ordr(d),{confReq:false},'Conferência feita pelo atendimento');
H['card-done']=async d=>{ const o=ordr(d); const v=await ask({title:'Cartão '+orderNum(o),ok:'Cartão pronto',fields:[{id:'none',label:'Este pedido não terá cartão',type:'checkbox',value:o.card==='sem'},{id:'msg',label:'Mensagem do cartão',type:'textarea',value:o.cardMsg}]}); if(!v) return; if(!v.none&&!v.msg) throw new Error('Escreva a mensagem do cartão ou marque que não terá cartão'); await oact(o,{card:v.none?'sem':'com',cardMsg:v.none?'':v.msg,cardDone:true},v.none?'Confirmado: sem cartão':'Cartão feito',v.none?'':v.msg); };
H['p-ready']=d=>oact(ordr(d),{status:'pronto_subir',readyBy:me.name,times:{prontoAt:now()}},'Pronto para subir');
H['t-start']=d=>oact(ordr(d),{status:'em_transporte',transport:{startedAt:now(),startedBy:me.name,endedAt:null,endedBy:null}},'Transporte iniciado');
H['r-receive']=d=>receiveDialog(ordr(d));
H['r-find']=()=>{ const n=Number(digits($('#rcv-num').value)); const o=arr('orders').find(x=>x.num===n); if(!o){ toast('Pedido '+(n||'')+' não encontrado',true); return; } if(!['pronto_subir','em_transporte'].includes(o.status)){ toast(`${orderNum(o)} está em "${stLabel(o)}" e não aguarda recebimento`,true); return; } receiveDialog(o); };
H['p-fix']=d=>{ const o=ordr(d); return oact(o,{status:'pronto_subir',divOpen:false,transport:null},'Correção concluída','Pedido reenviado ao atendimento'); };
function guardCard(o){ if(o.card!=='sem'&&!o.cardDone) throw new Error(isDrv()?'O cartão deste pedido ainda não foi feito. Avise o atendimento.':'O cartão deste pedido ainda não foi feito. Use "Cartão pronto" no pedido.'); }
function guardConclude(o){ if(o.divOpen) throw new Error('Conclusão bloqueada: há uma divergência em aberto'); }
H['d-pick']=async d=>{ const o=ordr(d); guardConclude(o); guardCard(o); const v=await ask({title:`Retirada ${orderNum(o)}`,ok:'Concluir retirada',fields:[{id:'who',label:'Quem retirou',type:'text',required:true,value:o.recipient||o.client.name},{id:'obs',label:'Observações',type:'text'}]}); if(v) await oact(o,{status:'concluido',outcome:'retirada',times:{concluidoAt:now()},delivery:{who:v.who,by:me.name,at:now(),obs:v.obs}},'Retirada concluída','Retirado por '+v.who); };
H['noop']=()=>{};
H['photo-zoom']=(d)=>{ const old=document.getElementById('zoom'); if(old) old.remove(); const z=document.createElement('div'); z.id='zoom'; z.innerHTML='<img alt="Foto de referência"><span>Toque para fechar</span>'; z.firstChild.src=d.src; z.onclick=()=>z.remove(); document.body.appendChild(z); };
const dupName=(n,id)=>arr('users').some(u=>u.id!==id&&u.name.trim().toLowerCase()===n.trim().toLowerCase());
H['dr-new']=async()=>{ const v=await ask({title:'Novo entregador',ok:'Cadastrar',fields:[{id:'name',label:'Nome do entregador',type:'text',required:true}]}); if(!v) return; const n=v.name.trim(); if(!n) return; if(dupName(n)) throw new Error('Já existe um usuário com este nome'); await put('users','u'+uid(),{name:n,role:'entregador',active:true}); await logEv('Entregador cadastrado',n); toast(n+' cadastrado'); };
H['dr-edit']=async d=>{ const u=S.users[d.id]; if(driverBusy(u).length) throw new Error('Este entregador tem entrega em andamento. Renomeie depois que ele terminar.'); const v=await ask({title:'Renomear entregador',ok:'Salvar',fields:[{id:'name',label:'Nome',type:'text',required:true,value:u.name}]}); if(!v) return; const n=v.name.trim(); if(!n||n===u.name) return; if(dupName(n,u.id)) throw new Error('Já existe um usuário com este nome'); await patch('users',u.id,{name:n}); await logEv('Entregador renomeado',u.name+' → '+n); };
H['dr-off']=async d=>{ const u=S.users[d.id]; if(driverBusy(u).length) throw new Error('Este entregador tem entrega em andamento. Remova depois que ele terminar.'); if(!(await confirmDlg('Remover '+u.name+'?','Ele deixa de aparecer na lista e não consegue mais entrar. O histórico das entregas dele continua guardado. Dá para reativar depois.','Remover',true))) return; await patch('users',u.id,{active:false}); await logEv('Entregador removido',u.name); };
H['dr-on']=async d=>{ const u=S.users[d.id]; await patch('users',u.id,{active:true}); await logEv('Entregador reativado',u.name); };
H['d-out']=async d=>{ const o=ordr(d); guardCard(o); if(isDrv()){ await oact(o,{status:'saiu_entrega',delivery:{driver:me.name,outAt:now(),problem:null}},'Saiu para entrega',me.name); toast(orderNum(o)+' com você'); return; } const D=drivers(); const v=await ask({title:`Saída para entrega ${orderNum(o)}`,ok:'Saiu para entrega',note:D.length?'':'Nenhum entregador cadastrado. Cadastre na aba Entregadores para ele ver a entrega no celular.',fields:[D.length?{id:'driver',label:'Quem vai entregar',type:'select',options:D.map(u=>({v:u.name,l:u.name})),value:D[0].name}:{id:'driver',label:'Quem vai entregar',type:'text',required:true}]}); if(v) await oact(o,{status:'saiu_entrega',delivery:{driver:v.driver,outAt:now(),problem:null}},'Saiu para entrega',v.driver); };
H['d-done']=async d=>{ const o=ordr(d); guardConclude(o); guardCard(o); const v=await ask({title:`Confirmar entrega ${orderNum(o)}`,ok:'Entrega confirmada',fields:[{id:'who',label:'Quem recebeu',type:'text',required:true,value:o.recipient||''},{id:'obs',label:'Observações',type:'text'}]}); if(v) await oact(o,{status:'concluido',outcome:'entrega',times:{concluidoAt:now()},delivery:{...(o.delivery||{}),receivedBy:v.who,doneAt:now(),by:me.name,obs:v.obs}},'Entrega confirmada','Recebido por '+v.who); };
H['d-prob']=async d=>{ const o=ordr(d); const v=await ask({title:'Problema na entrega',ok:'Registrar',danger:true,fields:[{id:'t',label:'O que aconteceu?',type:'textarea',required:true}]}); if(v) await oact(o,{status:'entrega_problema',delivery:{problem:v.t}},'Problema na entrega',v.t); };
H['a-neg']=async d=>{ const o=ordr(d); if(!await confirmDlg('Liberar pedido bloqueado?',esc(o.block?o.block.reason:''),'Liberar e concluir')) return; await completeProduction(o); toast('Pedido pronto para subir.'); };
H['f-add']=d=>{ const p=S.products[d.pid]; const ex=!p.custom&&FM.items.find(i=>i.productId===p.id); if(ex) ex.qty=(Number(ex.qty)||0)+1; else FM.items.push({productId:p.id,name:p.name,category:p.category,qty:1,price:p.price,desc:'',isCustom:!!p.custom}); renderForm(); };
H['f-addfree']=()=>{ FM.items.push({productId:'',name:'Item avulso',category:'Outros',qty:1,price:0,desc:'',isCustom:true}); renderForm(); };
H['f-del']=d=>{ FM.items.splice(Number(d.i),1); renderForm(); };
H['f-photo-del']=d=>{ FM.photos.splice(Number(d.i),1); renderForm(); };
const sigO=o=>JSON.stringify([o.items,o.date,o.time,o.buildNotes,o.address,o.recipient||'',o.recipientPhone||'',o.card,o.cardMsg,o.client,o.type,o.urgent,o.notes]);
H['f-save']=async(d,el)=>{ if(el.disabled) return; const rel=d.release==='1'; el.disabled=true; try{ const before=FM.id&&S.orders[FM.id], wasDraft=!before||before.status==='rascunho', sigBefore=before?sigO(before):''; const body=fToOrder(FM); const ok=await saveOrder(FM,rel); if(ok===false) return; closeLayer('form'); toast(rel?'Pedido liberado':'Pedido salvo'); const id=typeof ok==='string'?ok:null; FM=null;
  if(id&&((rel&&wasDraft)||(!wasDraft&&sigO(body)!==sigBefore))){ const o=await waitOrder(id); if(o) openFicha(o,wasDraft?'Pedido liberado. Imprima a ficha e envie com o pedido.':'Pedido alterado. Imprima a ficha nova e troque a antiga.'); } }finally{ el.disabled=false; } };
H['mural-new']=async()=>{ const v=await ask({title:'Registrar ocorrência',ok:'Publicar no mural',fields:[{id:'t',label:'O que aconteceu?',type:'textarea',required:true}]}); if(v) await put('mural',uid(),{at:now(),by:me.name,role:me.role,text:v.t}); };
H['s-new']=()=>stockForm(null);
H['s-edit']=d=>stockForm(S.stock[d.id]);
H['s-in']=async d=>{ const it=S.stock[d.id]; const v=await ask({title:'Entrada: '+it.name,ok:'Registrar entrada',fields:[{id:'loc',label:'Entrou em',type:'select',options:locOpts,value:'producao'},{id:'qty',label:'Quantidade ('+it.unit+')',type:'number',required:true},{id:'cost',label:'Custo por unidade (R$)',type:'number',value:it.cost},{id:'supplier',label:'Fornecedor',type:'text',value:it.supplier}]}); if(!v) return;
  await patch('stock',it.id,{cost:v.cost,supplier:v.supplier,entryAt:now()}); await moveStock({sid:it.id,from:'ext',to:v.loc,qty:v.qty,type:'entrada',cost:v.cost,note:v.supplier}); toast('Entrada registrada'); };
H['s-tr']=async d=>{ const v=await ask({title:'Transferir entre locais',ok:'Transferir',fields:[stockPick(d.id),{id:'from',label:'De',type:'select',options:locOpts,value:'producao'},{id:'to',label:'Para',type:'select',options:locOpts,value:'expositor'},{id:'qty',label:'Quantidade',type:'number',required:true}]}); if(!v) return; if(v.from===v.to) throw new Error('Origem e destino são iguais'); await moveStock({sid:v.sid,from:v.from,to:v.to,qty:v.qty,type:'transferencia'}); toast('Transferência registrada'); };
H['s-loss']=async d=>{ const v=await ask({title:'Registrar perda',ok:'Registrar perda',danger:true,fields:[stockPick(d.id),{id:'loc',label:'Onde estava',type:'select',options:locOpts,value:d.loc||'producao'},{id:'qty',label:'Quantidade',type:'number',required:true},{id:'motive',label:'Motivo',type:'select',options:LOSSM},{id:'note',label:'Observação',type:'text'}]}); if(!v) return; const it=S.stock[v.sid];
  await moveStock({sid:v.sid,from:v.loc,to:'ext',qty:v.qty,type:'perda',note:v.motive}); await put('losses',uid(),{at:now(),by:me.name,sid:v.sid,name:it.name,unit:it.unit,loc:v.loc,qty:v.qty,motive:v.motive,note:v.note,cost:round(v.qty*(it.cost||0))}); toast('Perda registrada'); };
H['s-hist']=d=>{ const it=S.stock[d.id]; const L=arr('moves').filter(m=>m.sid===it.id).sort((a,b)=>b.at-a.at).slice(0,40); openLayer('dlg',`<div class="sheet"><h2>Histórico: ${esc(it.name)}</h2><div class="tablewrap"><table style="min-width:0"><thead><tr><th>Quando</th><th>Tipo</th><th class="n">Qtd</th><th>De → Para</th><th>Quem</th></tr></thead><tbody>${L.map(m=>`<tr><td>${fDT(m.at)}</td><td>${esc(m.type.replace(/_/g,' '))}${m.orderId?` <span class="muted">${orderNum(S.orders[m.orderId]||{num:0})}</span>`:''}</td><td class="n">${num(m.qty)}</td><td>${LOC[m.from]||'fora'} → ${LOC[m.to]||'fora'}</td><td>${esc(m.by)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Sem movimentações.</td></tr>'}</tbody></table></div><div class="row end"><button class="btn primary" id="hx">Fechar</button></div></div>`); $('#hx').onclick=()=>closeLayer('dlg'); };
H['rp-new']=async d=>{ const it=S.stock[d.id], q=it.qty||{}; const v=await ask({title:'Pedir reposição: '+it.name,ok:'Pedir reposição',note:`No expositor: ${num(q.expositor||0)} · Reserva da loja: ${num(q.reserva||0)} · Produção: ${num(q.producao||0)} ${esc(it.unit)}`,fields:[{id:'qty',label:'Quantidade ('+it.unit+')',type:'number',required:true},{id:'from',label:'Separar de',type:'select',options:[{v:'producao',l:'Estoque de produção'},{v:'reserva',l:'Reserva da loja'}],value:(q.reserva||0)>0?'reserva':'producao'}]}); if(!v) return;
  await put('replen',uid(),{sid:it.id,name:it.name,unit:it.unit,qty:v.qty,from:v.from,status:'pedida',by:me.name,at:now()}); toast('Reposição pedida'); };
H['rp-sep']=d=>patch('replen',d.id,{status:'separada',sepBy:me.name,sepAt:now()});
H['rp-rec']=async d=>{ const r=S.replen[d.id]; await moveStock({sid:r.sid,from:r.from,to:'expositor',qty:r.qty,type:'reposicao_expositor',note:'Pedido de reposição'}); await patch('replen',d.id,{status:'recebida',recBy:me.name,recAt:now()}); toast('Reposição recebida e estoque atualizado'); };
H['rp-cancel']=d=>patch('replen',d.id,{status:'cancelada'});
H['x-sell']=async d=>{ const it=S.stock[d.id]; const v=await ask({title:'Vendido do expositor: '+it.name,ok:'Registrar venda',fields:[{id:'qty',label:'Quantidade ('+it.unit+')',type:'number',required:true,value:1}]}); if(v) await moveStock({sid:it.id,from:'expositor',to:'ext',qty:v.qty,type:'venda_expositor'}); };
H['x-rsv']=async d=>{ const it=S.stock[d.id]; const v=await ask({title:'Reservadas: '+it.name,ok:'Salvar',note:'Quantas unidades do expositor estão reservadas para clientes?',fields:[{id:'qty',label:'Quantidade reservada',type:'number',value:it.rsv||0}]}); if(v) await patch('stock',it.id,{rsv:v.qty}); };
H['conf-new']=()=>{ const L=arr('stock').filter(i=>(i.qty&&i.qty.expositor>0)||i.minExp>0).sort((a,b)=>a.name.localeCompare(b.name));
  openLayer('dlg',`<div class="sheet"><h2>Conferência do expositor</h2><label class="fld"><span>Momento</span><select class="sel" id="cf-t"><option>Abertura</option><option>Meio do expediente</option><option>Fechamento</option></select></label><p class="muted small">Conte o que há no expositor. Deixe em branco o que não contou.</p>
  <div class="tablewrap"><table style="min-width:0"><thead><tr><th>Item</th><th class="n">Sistema</th><th class="n">Contado</th></tr></thead><tbody>${L.map(i=>`<tr><td>${esc(i.name)}</td><td class="n">${num((i.qty||{}).expositor||0)}</td><td class="n"><input class="inp" style="width:90px" type="number" min="0" step="any" data-cs="${i.id}"></td></tr>`).join('')||'<tr><td colspan="3" class="muted">Nenhum item no expositor.</td></tr>'}</tbody></table></div>
  <div class="row end"><button class="btn" id="cfx">Cancelar</button><button class="btn primary" id="cfok">Registrar conferência</button></div></div>`);
  $('#cfx').onclick=()=>closeLayer('dlg');
  $('#cfok').onclick=()=>run(async()=>{ const rows=[]; let diffs=0; for(const el of $$('[data-cs]')){ if(el.value==='') continue; const i=S.stock[el.dataset.cs], sys=(i.qty||{}).expositor||0, cnt=Number(el.value); rows.push({sid:i.id,name:i.name,sys,cnt}); if(cnt!==sys){ diffs++; const df=round(Math.abs(cnt-sys)); await moveStock({sid:i.id,from:cnt<sys?'expositor':'ext',to:cnt<sys?'ext':'expositor',qty:df,type:'ajuste_conferencia',note:$('#cf-t').value+': sistema '+sys+', contado '+cnt,allowNeg:true}); } }
    await put('confs',uid(),{at:now(),by:me.name,turno:$('#cf-t').value,rows,diffs}); closeLayer('dlg'); toast(diffs?`Conferência registrada com ${diffs} diferença(s) ajustada(s)`:'Conferência registrada sem diferenças'); }); };
H['c-new']=async()=>{ const v=await ask({title:'Novo cliente',ok:'Salvar',fields:[{id:'name',label:'Nome',type:'text',required:true},{id:'phone',label:'Telefone',type:'text',required:true},{id:'notes',label:'Observações',type:'text'}]}); if(v) await put('clients','c'+digits(v.phone),{...v,createdAt:now(),updatedAt:now()}); };
H['c-edit']=async d=>{ const c=S.clients[d.id]; const v=await ask({title:'Editar cliente',ok:'Salvar',fields:[{id:'name',label:'Nome',type:'text',required:true,value:c.name},{id:'notes',label:'Observações',type:'text',value:c.notes}]}); if(v) await patch('clients',c.id,{name:v.name,notes:v.notes,updatedAt:now()}); };
H['cad-tab']=d=>{ CT=d.v; render(true); };
H['pr-new']=()=>productForm(null);
H['pr-edit']=d=>productForm(S.products[d.id]);
H['u-new']=async()=>{ const v=await ask({title:'Novo usuário',ok:'Criar',fields:[{id:'name',label:'Nome',type:'text',required:true},{id:'role',label:'Perfil',type:'select',options:Object.entries(ROLES).map(([v,l])=>({v,l})),value:'atendimento'}]}); if(v){ await put('users','u'+uid(),{name:v.name,role:v.role,active:true}); await logEv('Usuário criado',v.name+' ('+ROLES[v.role]+')'); } };
H['u-edit']=async d=>{ const u=S.users[d.id]; const v=await ask({title:'Editar usuário',ok:'Salvar',fields:[{id:'name',label:'Nome',type:'text',required:true,value:u.name},{id:'role',label:'Perfil',type:'select',options:Object.entries(ROLES).map(([v,l])=>({v,l})),value:u.role},{id:'active',label:'Usuário ativo',type:'checkbox',value:u.active!==false}]}); if(!v) return; if(u.id===me.id&&(!v.active||v.role!=='admin')) throw new Error('Você não pode remover o seu próprio acesso de administrador'); await patch('users',u.id,{name:v.name,role:v.role,active:v.active}); await logEv('Usuário alterado',v.name); };
H.dp=d=>{ DP=d.v; render(true); };
H['exp-orders']=()=>{ const t0=periodStart(); return exportCSV('pedidos.csv',[['Nº','Criado em','Cliente','Telefone','Canal','Tipo','Data','Hora','Itens','Produtos','Taxa','Desconto','Total','Pagamento','Situação pgto','Status'],...arr('orders').filter(o=>o.createdAt>=t0).sort((a,b)=>a.num-b.num).map(o=>[o.num,fDT(o.createdAt),o.client.name,o.client.phone,CHANNELS[o.channel],TYPES[o.type],o.date,o.time,itemsText(o),o.sub,o.fee,o.discount,o.total,PAYM[o.pay.method],PAYS[o.pay.status],stLabel(o)])]); };
H['exp-stock']=()=>exportCSV('estoque.csv',[['Item','Categoria','Código','Unidade','Produção','Reserva','Expositor','Total','Mínimo','Custo','Valor','Fornecedor'],...arr('stock').map(i=>{const q=i.qty||{};return [i.name,i.cat,i.code,i.unit,q.producao||0,q.reserva||0,q.expositor||0,totalQty(i),i.min||0,i.cost||0,round(totalQty(i)*(i.cost||0)),i.supplier];})]);
H['exp-losses']=()=>exportCSV('perdas.csv',[['Quando','Item','Qtd','Unidade','Local','Motivo','Custo','Quem','Obs.'],...arr('losses').sort((a,b)=>a.at-b.at).map(l=>[fDT(l.at),l.name,l.qty,l.unit,LOC[l.loc],l.motive,l.cost,l.by,l.note])]);
H['tv-snd']=async()=>{ if(tvSnd&&!tvAudioOn()){ tvAudio(); await new Promise(r=>setTimeout(r,150)); tvChime(); } else { tvSnd=!tvSnd; try{ localStorage.setItem('salem.tvsound',tvSnd?'on':'off'); }catch(e){} if(tvSnd){ tvAudio(); await new Promise(r=>setTimeout(r,150)); tvChime(); } } tvTick(); };
H['tv-full']=async()=>{ try{ await document.documentElement.requestFullscreen(); }catch(e){ toast('Seu navegador não permitiu tela cheia aqui'); } };

document.addEventListener('click',e=>{
  const t=e.target;
  if(t.id==='drawer'){ closeLayer('drawer'); return; }
  const add=t.closest('[data-mat-add]'); if(add){ $('#'+add.dataset.matAdd).insertAdjacentHTML('beforeend',matRow({})); return; }
  const rm=t.closest('[data-mat-del]'); if(rm){ rm.parentElement.remove(); return; }
  const el=t.closest('[data-act]'); if(!el) return;
  const fn=H[el.dataset.act]; if(!fn) return;
  e.stopPropagation(); run(()=>fn(el.dataset,el));
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ const z=document.getElementById('zoom'); if(z){ z.remove(); return; } for(const id of ['dlg','form','drawer']){ if(!LY(id).hidden){ closeLayer(id); break; } } } });

/* filtros das listas (atualizam só a lista, sem perder o foco) */
$('#view').addEventListener('input',e=>{
  const id=e.target.id;
  if(id==='pf-q'){ PF.q=e.target.value; $('#plist').innerHTML=pedidosList(); fitBoards(); }
  else if(id==='pf-date'){ PF.date=e.target.value; $('#plist').innerHTML=pedidosList(); fitBoards(); }
  else if(id==='sf-q'){ SF.q=e.target.value; $('#stbl').innerHTML=stockTable(); }
  else if(id==='cf-q'){ CF=e.target.value; $('#clist').innerHTML=clientsList(); }
  else if(id==='af-q'){ AF=e.target.value; $('#alist').innerHTML=auditList(); }
});
$('#view').addEventListener('change',e=>{
  const id=e.target.id, v=e.target.value;
  if(id==='pf-status') PF.status=v; else if(id==='pf-channel') PF.channel=v; else if(id==='pf-slot') PF.slot=v;
  else if(id==='pf-when'){ PF.when=v; render(true); return; }
  else if(id==='sf-cat'){ SF.cat=v; $('#stbl').innerHTML=stockTable(); return; }
  else if(id==='exp-all'){ SF.expAll=e.target.checked; render(true); return; }
  else return;
  $('#plist').innerHTML=pedidosList(); fitBoards();
});

/* ---------- conexão com o banco ---------- */
let timerFired=false;
function subscribe(){
  Object.entries(COLS).forEach(([n,o])=>{
    let q=db.collection(n); if(o) q=q.orderBy(o[0],'desc').limit(o[1]);
    q.onSnapshot(snap=>{
      const m={}; snap.docs.forEach(d=>{ m[d.id]={...d.data(),id:d.id}; }); S[n]=m;
      loaded[n]=true; pendW[n]=snap.metadata.hasPendingWrites; cacheOnly[n]=snap.metadata.fromCache;
      staleMsg=timerFired&&Object.keys(COLS).some(k=>!loaded[k]||cacheOnly[k]);
      if(n==='orders') handleOrderChanges(snap);
      if(n==='users') autoLogin();
      sched();
    },err=>{ console.error(n,err); staleMsg=true; sched(); });
  });
  setTimeout(()=>{ timerFired=true; staleMsg=Object.keys(COLS).some(k=>!loaded[k]||cacheOnly[k]); const ld=$('#ld'); if(ld&&!loaded.users) ld.textContent='Ainda não consegui alcançar o banco de dados. Verifique a internet.'; sched(); },10000);
}
window.addEventListener('online',sched); window.addEventListener('offline',sched);
window.addEventListener('hashchange',()=>{ if(!me) return; const h=location.hash.replace('#',''); if(NAV[R()].concat(['tv']).includes(h)&&h!==view){ view=h; render(true); } });
setInterval(sched,30000);
subscribe();
render();
})();
</script>

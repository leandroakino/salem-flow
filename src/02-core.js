(async function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-5);
const p2=n=>String(n).padStart(2,'0');
const now=()=>Date.now();
const round=n=>Math.round(n*1000)/1000;
const digits=s=>String(s||'').replace(/\D/g,'');
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const money=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=v=>(Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const fT=ms=>{const d=new Date(ms);return p2(d.getHours())+':'+p2(d.getMinutes())};
const fD=ms=>{const d=new Date(ms);return p2(d.getDate())+'/'+p2(d.getMonth()+1)};
const fDT=ms=>ms?fD(ms)+' '+fT(ms):'—';
const dayKey=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())};
const todayKey=()=>dayKey(now());
const fDS=s=>s?s.split('-').reverse().slice(0,2).join('/'):'—';
const dur=ms=>ms<60000?'menos de 1 min':ms<3600000?Math.round(ms/60000)+' min':(ms/3600000).toFixed(1).replace('.',',')+' h';

/* ---------- capacidades ---------- */
let db=null,assets=null,dl=null;
try{ if(window.claude&&window.claude.use){ db=await window.claude.use('db'); assets=await window.claude.use('assets'); dl=await window.claude.use('downloads'); } }catch(e){ console.error(e); }
if(!db){
  $('#view').innerHTML='<div class="center card"><h2>Banco de dados indisponível</h2><p class="muted">Abra esta página pelo Claude, com a sua conta conectada, para o Salém Flow acessar o banco de dados compartilhado.</p></div>';
  return;
}

/* ---------- constantes ---------- */
const ST={
  rascunho:{l:'Rascunho',c:'gray'}, liberado:{l:'Liberado',c:'blue'}, aguardando_prod:{l:'Aguardando produção',c:'violet'},
  em_producao:{l:'Em produção',c:'amber'}, aguardando_material:{l:'Aguardando material',c:'orange'}, finalizado:{l:'Finalizado',c:'teal'},
  pronto_subir:{l:'Pronto para subir',c:'green'}, em_transporte:{l:'Em transporte',c:'sky'}, recebido:{l:'Recebido no atendimento',c:'green'},
  divergencia:{l:'Divergência: correção',c:'red'}, bloqueado:{l:'Problema / bloqueio',c:'red'}, saiu_entrega:{l:'Saiu para entrega',c:'sky'},
  entrega_problema:{l:'Problema na entrega',c:'red'}, concluido:{l:'Concluído',c:'gray'}, cancelado:{l:'Cancelado',c:'gray'}
};
const PIPE=['liberado','aguardando_prod','em_producao','aguardando_material','bloqueado','finalizado','pronto_subir','em_transporte','divergencia'];
const CHANNELS={presencial:'Presencial',whatsapp:'WhatsApp',instagram:'Instagram',outro:'Outro'};
const TYPES={retirada:'Retirada',entrega:'Entrega',imediata:'Venda imediata'};
const PAYM={pix:'Pix',dinheiro:'Dinheiro',cartao:'Cartão',transferencia:'Transferência',outro:'Outro'};
const PAYS={pendente:'Pendente',sinal:'Sinal pago',pago:'Pago'};
const LOC={producao:'Produção',reserva:'Reserva da loja',expositor:'Expositor'};
const SCAT=['Flores naturais','Flores artificiais','Embalagens','Papéis','Fitas','Laços','Chocolates','Pelúcias','Vasos','Cachepôs','Adubos','Pedras decorativas','Outros produtos'];
const PCAT=['Buquês','Arranjos','Cestas','Presentes','Plantas','Outros'];
const LOSSM=['Flores murchas','Flores congeladas ou danificadas','Materiais quebrados','Produtos vencidos','Erros de montagem','Outros descartes'];
const DIVT={produto_errado:'Produto errado',danificado:'Produto danificado',qtd_incorreta:'Quantidade incorreta',incompleto:'Pedido incompleto',nao_recebido:'Produto não recebido'};
const ROLES={admin:'Administrador',atendimento:'Atendimento',producao:'Produção',entregador:'Entregador'};
const STALL={liberado:15,aguardando_prod:30,aguardando_material:60,finalizado:15,pronto_subir:20,em_transporte:20,divergencia:30,bloqueado:30,em_producao:180};

/* ---------- estado ---------- */
const COLS={users:null,products:null,clients:null,orders:null,stock:null,replen:null,matreq:['at',200],moves:['at',600],losses:['at',300],confs:['at',100],mural:['at',100],log:['at',500]};
const S={}, loaded={}, pendW={}, cacheOnly={};
Object.keys(COLS).forEach(k=>S[k]={});
let me=null, view='pend', drawerId=null, staleMsg=false, ordersSeen=false;
const lastStatus={};
const arr=c=>Object.values(S[c]);
const R=()=>me&&me.role, isAdm=()=>R()==='admin', canAtt=()=>R()==='atendimento'||R()==='admin', canProd=()=>R()==='producao'||R()==='admin', isDrv=()=>R()==='entregador', mine=o=>!!(o.delivery&&o.delivery.driver===(me&&me.name));

/* ---------- gravação ---------- */
const Q={};
const seq=(key,fn)=>{const p=(Q[key]||Promise.resolve()).catch(()=>{}).then(fn);Q[key]=p;return p;};
const put=(c,i,d)=>seq(c+'/'+i,()=>db.doc(c+'/'+i).set(d));
/* ---------- senhas (SHA-256 salgado e repetido; funciona em qualquer navegador) ---------- */
const SHA_K=[],SHA_H=[]; (()=>{ const pr=[]; for(let n=2;pr.length<64;n++){ if(pr.every(p=>n%p)) pr.push(n); } pr.forEach((p,i)=>{ SHA_K[i]=Math.floor((Math.cbrt(p)%1)*4294967296)>>>0; if(i<8) SHA_H[i]=Math.floor((Math.sqrt(p)%1)*4294967296)>>>0; }); })();
function sha256(m){
  const l=m.length, n=(((l+9+63)>>6)<<6), b=new Uint8Array(n); b.set(m); b[l]=0x80; const dv=new DataView(b.buffer); dv.setUint32(n-8,Math.floor(l/536870912)); dv.setUint32(n-4,(l<<3)>>>0);
  const h=SHA_H.slice(), w=new Uint32Array(64), r=(x,k)=>(x>>>k)|(x<<(32-k));
  for(let o=0;o<n;o+=64){
    for(let i=0;i<16;i++) w[i]=dv.getUint32(o+i*4);
    for(let i=16;i<64;i++){ const a=w[i-15], c=w[i-2]; w[i]=(w[i-16]+(r(a,7)^r(a,18)^(a>>>3))+w[i-7]+(r(c,17)^r(c,19)^(c>>>10)))>>>0; }
    let [a,b2,c2,d,e,f,g,hh]=h;
    for(let i=0;i<64;i++){ const t1=(hh+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+SHA_K[i]+w[i])>>>0, t2=((r(a,2)^r(a,13)^r(a,22))+((a&b2)^(a&c2)^(b2&c2)))>>>0; hh=g; g=f; f=e; e=(d+t1)>>>0; d=c2; c2=b2; b2=a; a=(t1+t2)>>>0; }
    [a,b2,c2,d,e,f,g,hh].forEach((v,i)=>{ h[i]=(h[i]+v)>>>0; });
  }
  const out=new Uint8Array(32), ov=new DataView(out.buffer); h.forEach((v,i)=>ov.setUint32(i*4,v)); return out;
}
const toHex=u=>Array.from(u).map(x=>x.toString(16).padStart(2,'0')).join('');
const fromHex=s=>new Uint8Array((s.match(/../g)||[]).map(x=>parseInt(x,16)));
function cat(...a){ const o=new Uint8Array(a.reduce((s,x)=>s+x.length,0)); let p=0; a.forEach(x=>{ o.set(x,p); p+=x.length; }); return o; }
async function pwHash(pw,saltHex){
  const salt=saltHex?fromHex(saltHex):crypto.getRandomValues(new Uint8Array(16)), pb=new TextEncoder().encode(pw);
  let h=sha256(cat(salt,pb)); for(let i=0;i<20000;i++){ h=sha256(cat(h,salt,pb)); if(i%4000===3999) await new Promise(r=>setTimeout(r)); }
  return {s:toHex(salt),h:toHex(h),at:Date.now()};
}
async function pwCheck(u,pw){ if(!u||!u.pw) return false; const x=await pwHash(pw,u.pw.s); return x.h===u.pw.h; }
const patch=(c,i,d)=>seq(c+'/'+i,()=>db.doc(c+'/'+i).update(d));
const del=(c,i)=>seq(c+'/'+i,()=>db.doc(c+'/'+i).delete());
const logEv=(act,detail,ref)=>put('log',uid(),{at:now(),by:me?me.name:'—',role:me?me.role:'',act,detail:detail||'',ref:ref||''});
async function oact(o,pt,...args){
  const cur=S.orders[o.id]||o;
  const entries=(typeof args[0]==='string')?[[args[0],args[1]||'']]:args;
  const h=[...(cur.history||[]),...entries.map(([act,detail])=>({at:now(),by:me.name,role:me.role,act,detail:detail||''}))].slice(-200);
  const extra={history:h,updatedAt:now()};
  if(pt.status&&pt.status!==cur.status) extra.statusAt=now();
  await patch('orders',o.id,{...pt,...extra});
}
async function moveStock({sid,from,to,qty,type,orderId,note,allowNeg,cost}){
  const it=S.stock[sid]; if(!it) throw new Error('Item de estoque não encontrado');
  qty=Number(qty); if(!(qty>0)) throw new Error('Quantidade inválida');
  const q={producao:0,reserva:0,expositor:0,...(it.qty||{})};
  if(from&&from!=='ext'){ if((q[from]||0)<qty&&!allowNeg){const e=new Error('Saldo insuficiente de '+it.name+' em '+LOC[from]);e.neg=true;throw e;} q[from]=round(q[from]-qty); }
  if(to&&to!=='ext') q[to]=round((q[to]||0)+qty);
  await patch('stock',sid,{qty:q});
  await put('moves',uid(),{at:now(),by:me.name,type,sid,name:it.name,unit:it.unit,from:from||'ext',to:to||'ext',qty,orderId:orderId||null,note:note||'',cost:cost!=null?cost:(it.cost||0)});
}
async function nextNum(){
  const ref=db.doc('meta/seq');
  for(let i=0;i<10;i++){
    const r=await ref.acquire({holder:me.id,ttlMs:4000});
    if(r.acquired){
      const s=await ref.get(); const maxO=Math.max(0,...arr('orders').map(o=>o.num||0));
      const n=Math.max((s.exists&&s.data().n)||0,maxO)+1; await ref.set({n}); return n;
    }
    await sleep(250+Math.random()*350);
  }
  throw new Error('Não foi possível gerar o número do pedido agora. Tente novamente.');
}

/* ---------- regras de negócio ---------- */
function deadline(o){
  if(!o.date) return null; const [y,m,d]=o.date.split('-').map(Number); const [hh,mm]=(o.time||'23:59').split(':').map(Number);
  return new Date(y,m-1,d,hh,mm).getTime();
}
const isActive=o=>o.status!=='concluido'&&o.status!=='cancelado'&&o.status!=='rascunho';
const isLate=o=>isActive(o)&&deadline(o)!=null&&now()>deadline(o);
const isSoon=o=>isActive(o)&&!isLate(o)&&deadline(o)!=null&&deadline(o)-now()<90*60000&&PIPE.includes(o.status);
const itemsText=o=>(o.items||[]).map(i=>i.qty+'× '+i.name).join(', ');
const stLabel=o=>o.status==='recebido'?(o.type==='entrega'?'Aguardando entrega':'Aguardando retirada'):o.status==='concluido'?(o.outcome==='entrega'?'Entregue':'Retirada concluída'):ST[o.status].l;
const chip=o=>`<span class="chip c-${ST[o.status].c}">${esc(stLabel(o))}</span>`;
const orderNum=o=>'#'+String(o.num).padStart(4,'0');
const calcSub=items=>items.reduce((a,i)=>a+(Number(i.qty)||0)*(Number(i.price)||0),0);
function needFor(o){
  const need={};
  (o.items||[]).forEach(it=>{if(it.direct) return; const p=S.products[it.productId]; if(p&&p.recipe) p.recipe.forEach(r=>{need[r.sid]=round((need[r.sid]||0)+r.qty*it.qty);});});
  return need;
}
const noRecipe=o=>(o.items||[]).filter(it=>{if(it.direct) return false; const p=S.products[it.productId];return !p||!p.recipe||!p.recipe.length;});
const prodItemsText=o=>(o.items||[]).filter(i=>!i.direct).map(i=>i.qty+'× '+i.name).join(', ')||itemsText(o);
const allDirect=items=>items.length>0&&items.every(i=>i.direct);
const skipOf=o=>!!o.noProd||allDirect(o.items||[]);
function directPlan(items){
  const m={};
  (items||[]).forEach(it=>{ if(!it.direct) return; const p=S.products[it.productId]; if(!p||!p.recipe) return; const loc=p.directLoc||'expositor';
    p.recipe.forEach(r=>{ const k=r.sid+'|'+loc; m[k]=m[k]||{sid:r.sid,loc,qty:0}; m[k].qty=round(m[k].qty+r.qty*it.qty); }); });
  return Object.values(m);
}
async function checkDirectStock(plan){
  const short=plan.filter(p=>(((S.stock[p.sid]||{}).qty||{})[p.loc]||0)<p.qty).map(p=>`${(S.stock[p.sid]||{}).name||p.sid}: precisa ${num(p.qty)}, tem ${num((((S.stock[p.sid]||{}).qty||{})[p.loc])||0)} em ${LOC[p.loc]}`);
  if(!short.length) return true;
  if(!isAdm()) throw new Error('Sem estoque no atendimento. '+short.join('; ')+'. Reponha o estoque ou peça ao administrador para autorizar.');
  return confirmDlg('Estoque insuficiente',esc(short.join('; '))+'. Autorizar saldo negativo e liberar mesmo assim?','Autorizar e liberar');
}
async function applyDirect(id,plan,o){ for(const p of plan) await moveStock({sid:p.sid,from:p.loc,to:'ext',qty:p.qty,type:'venda_loja',orderId:id,allowNeg:true,note:'Pedido '+orderNum(o)}); }
async function releaseOrder(cur,pt,ents){
  const plan=directPlan(cur.items), skip=skipOf(cur);
  if(plan.length&&!(await checkDirectStock(plan))) return false;
  const p2={...pt,status:skip?'recebido':'liberado',times:{liberadoAt:now(),...(skip?{recebidoAt:now()}:{})}};
  if(skip){ p2.skipProd=true; p2.receivedBy=me.name; }
  if(plan.length) p2.directUsed=plan;
  await oact(cur,p2,...ents,skip?['Liberado sem produção',plan.length?'Itens do atendimento. Baixa de estoque da loja':'Itens do atendimento']:['Pedido liberado para produção','']);
  await applyDirect(cur.id,plan,cur);
  return true;
}
const totalQty=it=>{const q=it.qty||{};return round((q.producao||0)+(q.reserva||0)+(q.expositor||0));};

function validate(F){
  const e=[]; const B=(k,t)=>e.push({k,t,block:true}), W=(k,t)=>e.push({k,t,block:false});
  if(!F.items.length) B('items','Adicione ao menos um produto');
  F.items.forEach((it,i)=>{
    if(!(Number(it.qty)>0)) B('qty'+i,'Quantidade inválida em "'+it.name+'"');
    const p=S.products[it.productId];
    if(((p&&p.custom)||it.isCustom)&&!String(it.desc||'').trim()) B('desc'+i,'Descreva o item personalizado: '+it.name);
  });
  if(!F.name.trim()) B('name','Informe o nome do cliente');
  if(digits(F.phone).length<8) B('phone','Informe o telefone com DDD');
  if(!F.date) B('date','Defina a data de entrega ou retirada');
  else if(F.date<todayKey()) W('date','A data é anterior a hoje');
  if(!F.time&&!F.noTime) B('time','Defina o horário ou marque "Sem horário marcado"');
  if(F.type==='entrega'&&!F.address.trim()) B('address','Entrega sem endereço');
  if((Number(F.discount)||0)>calcSub(F.items)) B('discount','Desconto maior que o valor dos produtos');
  return e;
}
function newF(){return {id:null,key:uid(),name:'',phone:'',channel:'presencial',type:'retirada',date:todayKey(),time:'',noTime:false,address:'',items:[],photos:[],card:'',cardMsg:'',buildNotes:'',notes:'',payMethod:'pix',payStatus:'pendente',fee:0,discount:0,urgent:false,noProd:false,recipient:'',recipientPhone:''};}
function orderToF(o){return {id:o.id,key:o.key,name:o.client.name,phone:o.client.phone,channel:o.channel,type:o.type,date:o.date,time:o.time||'',noTime:!!o.noTime,address:o.address||'',items:(o.items||[]).map(i=>({...i})),photos:(o.photos||[]).map(p=>({...p})),card:o.card||'',cardMsg:o.cardMsg||'',buildNotes:o.buildNotes||'',notes:o.notes||'',payMethod:o.pay.method,payStatus:o.pay.status,fee:o.fee||0,discount:o.discount||0,urgent:!!o.urgent,noProd:!!o.noProd,recipient:o.recipient||'',recipientPhone:o.recipientPhone||''};}
function fToOrder(F){
  const items=F.items.map(i=>({productId:i.productId||'',name:i.name,category:i.category||'Outros',qty:Number(i.qty)||0,price:Number(i.price)||0,desc:(i.desc||'').trim(),isCustom:!!i.isCustom,direct:!!(S.products[i.productId]&&S.products[i.productId].direct)}));
  const sub=calcSub(items), fee=Number(F.fee)||0, discount=Number(F.discount)||0;
  return {client:{name:F.name.trim(),phone:F.phone.trim()},channel:F.channel,type:F.type,date:F.date,time:F.noTime?'':F.time,noTime:!!F.noTime,address:F.type==='entrega'?F.address.trim():'',items,photos:F.photos,card:F.card,cardMsg:F.card==='com'?F.cardMsg.trim():'',buildNotes:F.buildNotes.trim(),notes:F.notes.trim(),pay:{method:F.payMethod,status:F.payStatus},sub,fee,discount,total:Math.max(0,sub+fee-discount),urgent:!!F.urgent,noProd:!!F.noProd,recipient:(F.recipient||'').trim(),recipientPhone:(F.recipientPhone||'').trim()};
}
async function upsertClient(F){
  const d=digits(F.phone); if(!d) return; const id='c'+d; const cur=S.clients[id]||{};
  await put('clients',id,{name:F.name.trim(),phone:F.phone.trim(),notes:cur.notes||'',createdAt:cur.createdAt||now(),updatedAt:now()});
}
async function saveOrder(F,release){
  const errs=validate(F).filter(x=>x.block);
  if(release&&errs.length) throw new Error('Faltam dados para liberar o pedido');
  if(!F.name.trim()&&!F.items.length) throw new Error('Preencha ao menos o cliente ou um produto');
  const body=fToOrder(F); let savedId=F.id||null;
  if(F.id){
    const cur=S.orders[F.id]; const ent=[]; const pt={...body};
    if(JSON.stringify(cur.items)!==JSON.stringify(body.items)) ent.push(['Itens alterados',itemsText(body)]);
    if(cur.date!==body.date||(cur.time||'')!==body.time) ent.push(['Prazo alterado',`${fDS(cur.date)} ${cur.time||'s/h'} → ${fDS(body.date)} ${body.time||'s/h'}`]);
    if(cur.pay.method!==body.pay.method||cur.pay.status!==body.pay.status||cur.total!==body.total) ent.push(['Pagamento atualizado',`${PAYS[body.pay.status]} · ${money(body.total)}`]);
    if(cur.client.name!==body.client.name||cur.client.phone!==body.client.phone||cur.address!==body.address||(cur.recipient||'')!==body.recipient||(cur.recipientPhone||'')!==body.recipientPhone||cur.card!==body.card||cur.cardMsg!==body.cardMsg||cur.buildNotes!==body.buildNotes||cur.notes!==body.notes||cur.type!==body.type||cur.channel!==body.channel) ent.push(['Pedido editado','Dados do cliente, entrega ou observações']);
    if(!ent.length) ent.push(['Pedido salvo','Sem alterações de conteúdo']);
    if(cur.status==='rascunho'&&release){ if((await releaseOrder({...cur,items:body.items,noProd:body.noProd},pt,ent))===false) return false; }
    else { if(cur.status!=='rascunho') pt.changedAt=now(); await oact(cur,pt,...ent); }
  } else {
    if(arr('orders').some(o=>o.key===F.key)) return true;
    const plan=release?directPlan(body.items):[], skip=release&&skipOf(body);
    if(plan.length&&!(await checkDirectStock(plan))) return false;
    const n=await nextNum(); const id='o'+String(n).padStart(4,'0');
    const hist=[{at:now(),by:me.name,role:me.role,act:'Pedido criado',detail:CHANNELS[body.channel]}];
    if(release) hist.push({at:now(),by:me.name,role:me.role,act:skip?'Liberado sem produção':'Pedido liberado para produção',detail:skip?(body.noProd?'Marcado pelo atendimento':'Itens do atendimento'):''});
    await put('orders',id,{...body,num:n,key:F.key,createdAt:now(),createdBy:me.name,status:release?(skip?'recebido':'liberado'):'rascunho',statusAt:now(),times:release?{liberadoAt:now(),...(skip?{recebidoAt:now()}:{})}:{},...(skip?{skipProd:true,receivedBy:me.name}:{}),...(plan.length?{directUsed:plan}:{}),history:hist,updatedAt:now()});
    await applyDirect(id,plan,{num:n}); savedId=id;
  }
  await upsertClient(F);
  return savedId||true;
}
async function completeProduction(o){
  const cur=S.orders[o.id]; if(cur.stockDone) throw new Error('Este pedido já foi concluído pela produção');
  const need=needFor(cur);
  const neg=Object.entries(need).filter(([sid,q])=>(((S.stock[sid]||{}).qty||{}).producao||0)<q).map(([sid])=>(S.stock[sid]||{}).name||sid);
  const t=now();
  await oact(cur,{status:'pronto_subir',stockDone:true,stockUsed:need,block:null,doneBy:me.name,readyBy:me.name,times:{finalizadoAt:t,prontoAt:t}},
    ['Pronto para subir',Object.keys(need).length?'Baixa de estoque: '+Object.entries(need).map(([s,q])=>q+' '+((S.stock[s]||{}).unit||'')+' '+((S.stock[s]||{}).name||s)).join(', '):'Sem baixa de estoque (produto sem ficha técnica)']
    ,...(neg.length?[['Estoque ficou negativo',neg.join(', ')]]:[]));
  for(const [sid,q] of Object.entries(need)) await moveStock({sid,from:'producao',to:'ext',qty:q,type:'baixa_pedido',orderId:cur.id,allowNeg:true,note:'Pedido '+orderNum(cur)});
  return {ok:true,need,neg};
}

/* ---------- pendências ---------- */
function pendencies(){
  const P=[]; const r=R();
  const add=(sev,text,roles,extra)=>{ if(roles.includes(r)||r==='admin') P.push({sev,text,...extra}); };
  const ALL=['atendimento','producao'];
  arr('orders').forEach(o=>{
    const on=orderNum(o), ref={oid:o.id};
    if(o.status==='rascunho'){ add(1,`${on} é um rascunho ainda não liberado (${o.client?.name||'sem cliente'})`,['atendimento'],ref); return; }
    if(!isActive(o)) return;
    if(isLate(o)) add(3,`${on} atrasado: prazo ${fDS(o.date)} ${o.time||''} · ${stLabel(o)}`,ALL,ref);
    else if(isSoon(o)) add(2,`${on} vence em ${dur(deadline(o)-now())} · ${stLabel(o)}`,ALL,ref);
    if(o.status==='liberado') add(2,`${on} liberado e sem responsável: ${itemsText(o)}`,['producao'],ref);
    if(o.status==='divergencia') add(3,`${on} em correção: ${o.div?.label||''}. ${o.div?.note||''}`,['producao','atendimento'],ref);
    if(o.status==='bloqueado') add(3,`${on} bloqueado: ${o.block?.reason||''}`,o.block?.negAuth?['atendimento']:['producao','atendimento'],{...ref,neg:!!o.block?.negAuth});
    if(o.status==='entrega_problema') add(3,`${on} com problema na entrega: ${o.delivery?.problem||''}`,['atendimento'],ref);
    if(o.status==='pronto_subir') add(1,`${on} pronto, aguardando transporte`,ALL,ref);
    if(o.status==='em_transporte') add(1,`${on} em transporte, aguardando conferência do atendimento`,['atendimento'],ref);
    if((PIPE.includes(o.status)||o.status==='recebido')&&o.card!=='sem'&&!o.cardDone) add(1,`Cartão do ${on}: ${o.card==='com'&&o.cardMsg?'"'+o.cardMsg+'"':'definir a mensagem ou marcar sem cartão'}`,['atendimento'],{...ref,cardDone:true});
    if(o.confReq) add(1,`A produção pediu conferência do ${on}`,['atendimento'],{...ref,clearConf:true});
    const lim=STALL[o.status], ms=o.statusAt||o.createdAt;
    if(lim&&ms&&now()-ms>lim*60000) add(2,`${on} parado há ${dur(now()-ms)} em "${stLabel(o)}"`,ALL,ref);
  });
  arr('stock').forEach(it=>{
    const t=totalQty(it), neg=['producao','reserva','expositor'].some(l=>((it.qty||{})[l]||0)<0);
    if(neg) add(3,`Estoque negativo: ${it.name}`,['producao'],{sid:it.id});
    else if(it.min>0&&t<it.min) add(2,`Estoque abaixo do mínimo: ${it.name} (${num(t)} de ${num(it.min)} ${it.unit})`,['producao'],{sid:it.id});
  });
  arr('replen').forEach(rp=>{
    if(rp.status==='pedida') add(2,`Reposição pedida: ${rp.qty} ${rp.unit} de ${rp.name} (de ${LOC[rp.from]})`,['producao'],{rid:rp.id});
    if(rp.status==='separada') add(2,`Reposição separada: ${rp.qty} ${rp.unit} de ${rp.name}. Confirme o recebimento`,['atendimento'],{rid:rp.id});
  });
  arr('matreq').forEach(m=>{
    const ord=m.orderId&&S.orders[m.orderId], what=`${m.name}${m.qty?' · '+num(m.qty)+' '+(m.unit||''):''}${ord?' (pedido '+orderNum(ord)+')':''}`;
    if(m.status==='aberto') add(2,`Falta de material: ${what}. Avisado por ${m.by}`,['atendimento'],{mid:m.id});
    if(m.status==='providenciado') add(1,`Material providenciado: ${what}. Confirme quando chegar`,['producao'],{mid:m.id});
  });
  return P.sort((a,b)=>b.sev-a.sev);
}

/* ====================================================================
   Versão online (Supabase): login por e-mail e senha, painel da TV por link com chave,
   criação de usuários e numeração dos pedidos pelo banco. Só entra na versão "web".
   ==================================================================== */
const W=window.SALEM_WEB, sb=W&&W.sb;
let webSession=null, webSubscribed=false, webBusy=false;
TV_URL=location.origin+location.pathname+'#tv';
const authMsg=e=>{ const m=(e&&e.message)||''; return /invalid login|invalid credentials/i.test(m)?'Usuário ou senha incorretos':/already registered|already been registered/i.test(m)?'Já existe um acesso com este e-mail':/password should be|at least 6/i.test(m)?'A senha precisa ter pelo menos 6 caracteres':/rate limit|too many/i.test(m)?'Muitas tentativas. Aguarde um pouco e tente de novo':/valid email|invalid email/i.test(m)?'E-mail inválido':/email not confirmed/i.test(m)?'E-mail ainda não confirmado. Peça ao administrador para desligar a confirmação por e-mail.':m||'Erro de acesso'; };
const fail=e=>{ throw new Error(authMsg(e)); };
const LOGIN_DOM='@login.floriculturasalem.com.br';
const loginEmail=v=>{ v=String(v||'').trim(); return v.includes('@')?v:v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]/g,'')+LOGIN_DOM; };

async function webBoot(){
  if(!W||W.failed){ $('#view').innerHTML='<div class="center card"><h2>Sem conexão com o servidor</h2><p class="muted">Não consegui carregar o sistema. Verifique a internet e atualize a página.</p></div>'; return; }
  stationInit();
  const m=location.hash.match(/^#tv=([A-Za-z0-9]+)/);
  if(m){ TVONLY=true; view='tv'; tvFeedStart(m[1]); render(); return; }
  const {data}=await sb.auth.getSession(); webSession=data.session;
  sb.auth.onAuthStateChange((ev,s)=>{
    webSession=s;
    if(ev==='PASSWORD_RECOVERY') setTimeout(()=>run(()=>H['pw-recover']()),200);
    if(s&&!webSubscribed){ webSubscribed=true; subscribe(); }
    if(!s){ me=null; } sched();
  });
  if(webSession){ webSubscribed=true; subscribe(); }
  render();
}

/* ---------- painel da TV (sem login, só com a chave do link) ---------- */
let tvToken=null, tvBad=false;
function tvFeedStart(t){
  tvToken=t;
  const go=async()=>{
    try{
      const r=await sb.rpc('tv_feed',{p_token:t});
      if(r.error) throw r.error;
      if(r.data===null){ tvBad=true; $('#view').innerHTML='<div class="center card"><h2>Link do painel inválido</h2><p class="muted">Peça ao administrador o link atualizado do painel da TV.</p></div>'; return; }
      const m={}; r.data.forEach(o=>{ m[o.id]={...o}; }); S.orders=m; loaded.orders=true; staleMsg=false; tvBad=false;
    }catch(e){ console.error(e); staleMsg=true; }
    if(!tvBad) sched();
  };
  go(); setInterval(go,5000);
}

/* ---------- entrada ---------- */
function renderLogin(){
  const v=$('#view');
  if(!webSession){
    v.innerHTML=`<div class="center card stack"><h2>Entrar no Salém Flow</h2>
      <label class="fld"><span>Usuário ou e-mail</span><input class="inp" id="w-email" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
      <label class="fld"><span>Senha</span><input class="inp" id="w-pw" type="password" autocomplete="current-password"></label>
      <button class="btn primary lg" data-act="w-login">Entrar</button>
      <button class="btn" data-act="w-forgot">Esqueci minha senha</button>
      <button class="btn" data-act="w-first">Primeira configuração do sistema</button></div>`;
    return;
  }
  if(!loaded.users||webBusy){ v.innerHTML='<div class="center card"><h2>Conectando…</h2><p class="muted" id="ld">Carregando os dados da floricultura.</p></div>'; return; }
  v.innerHTML=`<div class="center card stack"><h2>Acesso não liberado</h2><p class="muted">Este e-mail entrou, mas ainda não tem um perfil no sistema. Peça ao administrador para cadastrá-lo.</p><button class="btn" data-act="logout">Sair</button></div>`;
}
H['w-login']=async()=>{
  const email=loginEmail($('#w-email').value), password=$('#w-pw').value;
  if(!$('#w-email').value.trim()||!password) throw new Error('Informe o usuário e a senha');
  const r=await sb.auth.signInWithPassword({email,password}); if(r.error) fail(r.error);
};
H['w-forgot']=async()=>{
  const v=await ask({title:'Redefinir senha',ok:'Enviar e-mail',note:'Enviaremos um link para você criar uma nova senha.',fields:[{id:'e',label:'E-mail do seu acesso',type:'text',required:true,value:($('#w-email')||{}).value||''}]});
  if(!v) return; const r=await sb.auth.resetPasswordForEmail(v.e,{redirectTo:location.origin+location.pathname}); if(r.error) fail(r.error); toast('Se o e-mail existir, o link foi enviado');
};
H['w-first']=async()=>{
  const v=await ask({title:'Primeira configuração',ok:'Criar administrador',note:'Use só na primeira vez, para criar o administrador da Floricultura Salém. Depois ele cadastra a equipe.',fields:[{id:'name',label:'Nome do administrador',type:'text',required:true},{id:'email',label:'E-mail',type:'text',required:true},{id:'pw',label:'Senha (mínimo 6 caracteres)',type:'password',required:true}]});
  if(!v) return; if(v.pw.length<6) throw new Error('A senha precisa ter pelo menos 6 caracteres');
  webBusy=true;
  try{
    const r=await sb.auth.signUp({email:v.email,password:v.pw}); if(r.error) fail(r.error);
    if(!r.data.session) throw new Error('O Supabase está exigindo confirmação por e-mail. Desligue essa opção em Authentication > Sign In / Providers > Email.');
    const b=await sb.rpc('bootstrap_admin',{p_name:v.name});
    if(b.error) throw new Error(/já foi configurado/.test(b.error.message)?'O sistema já foi configurado. Entre com o seu e-mail e senha.':b.error.message);
    const u=await sb.from('users').select('id,data').eq('id',b.data).maybeSingle();
    if(u.data){ S.users[u.data.id]={...u.data.data,id:u.data.id}; loaded.users=true; }
    await sb.from('users').update({data:{...(u.data?u.data.data:{}),email:v.email}}).eq('id',b.data);
    toast('Administrador criado');
  }catch(e){ await sb.auth.signOut(); throw e; }
  finally{ webBusy=false; sched(); }
};
function autoLogin(){
  if(!webSession) return;
  const u=arr('users').find(x=>x.authId===webSession.user.id);
  const ok=u&&u.active!==false;
  if(me){ if(!ok){ me=null; sched(); } else me={id:u.id,name:u.name,role:u.role}; return; }
  if(ok){ me={id:u.id,name:u.name,role:u.role}; initView(); if(me.role==='admin') webTvLink(); }
}
async function webTvLink(){ try{ const r=await sb.from('app_settings').select('value').eq('key','tv_token').maybeSingle(); if(r.data&&r.data.value){ TV_URL=location.origin+location.pathname+'#tv='+r.data.value; } else { const t=Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b=>b.toString(16).padStart(2,'0')).join(''); const w=await sb.from('app_settings').upsert({key:'tv_token',value:t}); if(!w.error) TV_URL=location.origin+location.pathname+'#tv='+t; } }catch(e){ console.error(e); } }
H.logout=async()=>{ ['drawer','form','dlg'].forEach(closeLayer); try{ await sb.auth.signOut(); }catch(e){} location.hash=''; location.reload(); };
async function enforcePw(){}

/* ---------- senhas ---------- */
async function newPwDialog(note){
  const v=await ask({title:'Nova senha',ok:'Salvar senha',note,fields:[{id:'a',label:'Nova senha (mínimo 6 caracteres)',type:'password',required:true},{id:'b',label:'Repita a nova senha',type:'password',required:true}]});
  if(!v) return false; if(v.a.length<6) throw new Error('A senha precisa ter pelo menos 6 caracteres'); if(v.a!==v.b) throw new Error('As senhas não conferem');
  const r=await sb.auth.updateUser({password:v.a}); if(r.error) fail(r.error); return true;
}
H['pw-change']=async()=>{ if(await newPwDialog('Escolha a nova senha.')){ await logEv('Senha alterada',me.name); toast('Senha salva'); } };
H['pw-recover']=async()=>{ if(await newPwDialog('Crie a sua nova senha.')){ toast('Senha salva'); location.hash=''; } };
H['u-pw']=async d=>{
  const u=S.users[d.id];
  const v=await ask({title:'Nova senha para '+u.name,ok:'Salvar senha',note:'Informe a nova senha. Passe-a para a pessoa, que pode trocá-la depois em "Alterar senha".',fields:[{id:'p',label:'Nova senha (mínimo 6 caracteres)',type:'password',required:true}]});
  if(!v) return; if(v.p.length<6) throw new Error('A senha precisa ter pelo menos 6 caracteres');
  if(!u.authId) throw new Error('Este usuário ainda não tem acesso criado');
  const r=await sb.rpc('admin_set_password',{p_auth_id:u.authId,p_pw:v.p});
  if(r.error) throw new Error(/function|schema cache|does not exist/i.test(r.error.message)?'Falta ativar a redefinição de senha no banco (peça ao Claude para rodar o SQL atualizado).':r.error.message);
  await logEv('Senha redefinida',u.name); toast('Senha de '+u.name+' alterada');
};

/* ---------- equipe: cada pessoa tem o próprio acesso ---------- */
async function createStaff(role,title,okLabel){
  const fields=[{id:'name',label:'Nome',type:'text',required:true},{id:'email',label:'Usuário para entrar (ex.: ana) — ou um e-mail',type:'text',required:true},{id:'pw',label:'Senha inicial (mínimo 6 caracteres)',type:'password',required:true}];
  if(!role) fields.splice(1,0,{id:'role',label:'Perfil',type:'select',options:Object.entries(ROLES).map(([v,l])=>({v,l})),value:'atendimento'});
  const v=await ask({title,ok:okLabel,note:'A pessoa entra com este usuário e senha e pode trocar a senha depois em "Alterar senha".',fields}); if(!v) return;
  const n=v.name.trim(); if(!n) return; if(dupName(n)) throw new Error('Já existe um usuário com este nome'); if(v.pw.length<6) throw new Error('A senha precisa ter pelo menos 6 caracteres');
  const aux=W.createClient(W.url,W.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'sb-aux'}});
  const mail=loginEmail(v.email); if(!v.email.trim()||mail.startsWith('@')) throw new Error('Informe um usuário válido');
  if(arr('users').some(x=>(x.email||'').toLowerCase()===mail.toLowerCase())) throw new Error('Já existe um usuário com este login');
  const r=await aux.auth.signUp({email:mail,password:v.pw}); if(r.error) fail(r.error);
  if(!r.data.user||!r.data.user.id) throw new Error('Não consegui criar o acesso');
  const rl=role||v.role;
  await put('users','u'+uid(),{name:n,role:rl,active:true,authId:r.data.user.id,email:mail,login:mail.endsWith(LOGIN_DOM)?mail.slice(0,-LOGIN_DOM.length):mail});
  await logEv('Usuário criado',n+' ('+ROLES[rl]+')'); toast(n+' cadastrado');
}
H['u-new']=()=>createStaff(null,'Novo usuário','Criar');
H['dr-new']=()=>createStaff('entregador','Novo entregador','Cadastrar');

/* ---------- número do pedido: sequência no banco ---------- */
async function nextNum(){ const r=await sb.rpc('next_order_number'); if(r.error||r.data==null) throw new Error('Não foi possível gerar o número do pedido agora. Tente novamente.'); return Number(r.data); }

/* ====================================================================
   Estação de impressão: um computador com a Bematech vira "estação" e imprime a ficha sozinho,
   não importa de qual aparelho veio o toque. Precisa do Chrome aberto com --kiosk-printing
   (os atalhos prontos estão na pasta estacoes/).
     ?estacao=cima   -> imprime quando um pedido é LIBERADO (atendimento, em cima)
     ?estacao=baixo  -> imprime quando a PRODUÇÃO INICIA o pedido (embaixo)
     ?estacao=off    -> desliga
   ==================================================================== */
let STATION='', stLast='', stSkipped=0;
const ST_WINDOW=10*60*1000; // só imprime o que aconteceu nos últimos 10 min (não reimprime pedidos antigos ao ligar)
const stBusy=new Set();
function stationInit(){
  try{ const q=new URLSearchParams(location.search).get('estacao'); if(q!==null){ lsSet('salem.station',q==='cima'||q==='baixo'?q:''); history.replaceState(null,'',location.pathname+location.hash); } }catch(e){}
  STATION=lsGet('salem.station')||'';
  if(STATION){ setInterval(stationScan,2000); setInterval(stationPill,1000); }
}
function stationPill(){
  let el=$('#estacao'); if(!STATION){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('div'); el.id='estacao'; el.style.cssText='position:fixed;left:8px;bottom:8px;z-index:44;background:#12432D;color:#fff;font:12px/1.3 system-ui,sans-serif;padding:6px 10px;border-radius:8px;opacity:.92;max-width:70vw'; document.body.appendChild(el); }
  el.textContent='Impressão automática: '+(STATION==='cima'?'liberação (atendimento)':'início da produção')+(me?'':' · faça login')+(stLast?' · última: '+stLast:'')+(stSkipped?' · '+stSkipped+' antigo(s) ignorado(s)':'');
}
function stationScan(){
  if(!STATION||!me||!loaded.orders||webBusy) return;
  const t=now(), kind=STATION==='cima'?'lib':'prod';
  for(const o of arr('orders')){
    const at=kind==='lib'?(o.status==='liberado'&&!o.skipProd?(o.times||{}).liberadoAt:0):(o.status==='em_producao'?(o.times||{}).inicioAt:0);
    if(!at||(o.printed&&o.printed[kind])||stBusy.has(o.id+kind)) continue;
    if(t-at>ST_WINDOW){ continue; }
    stBusy.add(o.id+kind); run(()=>stationJob(o,kind));
  }
}
async function stationJob(o,kind){
  // marca como impresso ANTES de imprimir, para nunca sair duas vezes (mesmo se a página recarregar)
  await patch('orders',o.id,{printed:{...(o.printed||{}),[kind]:now()}});
  await stationPrint(S.orders[o.id]||o);
  stLast=orderNum(o)+' às '+fT(now());
}
function stationPrint(o){
  return new Promise(res=>{
    const box=document.createElement('div'); box.style.cssText='position:fixed;left:-9999px;top:0'; box.innerHTML=slipHTML(o); document.body.appendChild(box);
    try{ if(window.JsBarcode) window.JsBarcode('#slip-bc',String(o.num).padStart(4,'0'),{format:'CODE128',width:2,height:44,displayValue:false,margin:0,background:'#ffffff',lineColor:'#000000'}); }catch(e){}
    const html=slipDoc(o); box.remove();
    const f=document.createElement('iframe'); f.style.cssText='position:fixed;width:0;height:0;border:0;visibility:hidden'; f.srcdoc=html; document.body.appendChild(f);
    setTimeout(()=>{ f.remove(); res(); },20000);
  });
}
H['est-teste']=async()=>{ const o=arr('orders').sort((a,b)=>(b.num||0)-(a.num||0))[0]; if(!o) throw new Error('Ainda não há pedidos para imprimir um teste'); await stationPrint(o); toast('Ficha de teste enviada para a impressora'); };

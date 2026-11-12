const { chromium } = require('playwright');
const fs = require('fs');
const dir = __dirname;
const page_html = fs.readFileSync(dir + '/../dist/index.html', 'utf8');
const wrapped = '<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + page_html + '</body></html>';

const mock = `
(function(){
  const store = {}; const subs = [];
  const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const colOf = p => p.split('/').slice(0,-1).join('/');
  const idOf = p => p.split('/').pop();
  function merge(a,b){ const o = Object.assign({}, a); for (const k in b){ const v=b[k]; if (v && typeof v==='object' && !Array.isArray(v) && o[k] && typeof o[k]==='object' && !Array.isArray(o[k])) o[k]=merge(o[k],v); else o[k]=clone(v);} return o; }
  function notify(){ subs.forEach(s=>s.run()); }
  function docSnap(path){ const d=store[path]; return {id:idOf(path),exists:d!==undefined,data:()=>clone(d),metadata:{hasPendingWrites:false,fromCache:false}}; }
  function mkQuery(col, ord, lim){
    const q = {
      orderBy:(f,d)=>mkQuery(col,[f,d||'asc'],lim), limit:n=>mkQuery(col,ord,n), where:()=>q,
      _docs(){ let ids=Object.keys(store).filter(p=>colOf(p)===col); let L=ids.map(p=>({p,d:store[p]})); if(ord){ L=L.filter(x=>x.d[ord[0]]!==undefined); L.sort((a,b)=>ord[1]==='desc'?b.d[ord[0]]-a.d[ord[0]]:a.d[ord[0]]-b.d[ord[0]]);} else L.sort((a,b)=>a.p<b.p?-1:1); if(lim) L=L.slice(0,lim); return L.map(x=>docSnap(x.p)); },
      get(){ const docs=q._docs(); return Promise.resolve({docs,size:docs.length,empty:!docs.length,metadata:{}}); },
      onSnapshot(next){ let prev={}; const run=()=>{ const docs=q._docs(); const changes=[]; const cur={}; docs.forEach(d=>{cur[d.id]=JSON.stringify(d.data()); if(!(d.id in prev)) changes.push({type:'added',doc:d}); else if(prev[d.id]!==cur[d.id]) changes.push({type:'modified',doc:d});}); Object.keys(prev).forEach(id=>{ if(!(id in cur)) changes.push({type:'removed',doc:{id,data:()=>({}),metadata:{}}}); }); prev=cur; next({docs,size:docs.length,empty:!docs.length,metadata:{hasPendingWrites:false,fromCache:false},docChanges:()=>changes}); }; const s={run}; subs.push(s); setTimeout(run,0); return ()=>{ const i=subs.indexOf(s); if(i>=0) subs.splice(i,1); }; }
    };
    return q;
  }
  const leases={};
  const db = {
    doc(path){ return { id:idOf(path), path,
      get:()=>Promise.resolve(docSnap(path)),
      set:d=>{ store[path]=clone(d); notify(); return Promise.resolve(); },
      update:d=>{ if(store[path]===undefined) return Promise.reject({code:'invalid_argument',message:'missing '+path}); store[path]=merge(store[path],d); notify(); return Promise.resolve(); },
      delete:()=>{ delete store[path]; notify(); return Promise.resolve(); },
      acquire:o=>{ const t=Date.now(); if(leases[path]&&leases[path].until>t&&leases[path].h!==o.holder) return Promise.resolve({acquired:false}); leases[path]={h:o.holder,until:t+(o.ttlMs||30000)}; return Promise.resolve({acquired:true}); },
      onSnapshot(){ return ()=>{}; } }; },
    collection(name){ const q=mkQuery(name,null,null); q.doc=id=>db.doc(name+'/'+(id||Math.random().toString(36).slice(2))); q.path=name; return q; }
  };
  window.__store=store; window.__notify=notify;
  window.claude={ use: async name => name==='db'?db:name==='downloads'?{save:async()=>({status:'saved'})}:null };
})();`;

(async () => {
  const browser = await chromium.launch(); const errors=[];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route(/googleapis|gstatic/, r=>r.abort());
  await page.addInitScript(mock);
  await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
  await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
  let saved=null; const reload=async()=>{ saved=await page.evaluate(()=>JSON.stringify(window.__store)); await page.addInitScript(s=>{ const st=window.__store; Object.keys(st).forEach(k=>delete st[k]); Object.assign(st,JSON.parse(s)); },saved); await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'}); };
  const ok=(n,c)=>console.log(c?'OK  ':'FAIL',n);
  const toast=async()=>await page.locator('.toast,#toast,[role=status]').allInnerTexts().then(a=>a.join(' | ')).catch(()=>'');
  const dlgOpen=async()=>(await page.locator('#askf').count())>0;
  const submit=()=>page.locator('#askf button.primary').click();
  const user=n=>page.locator('.userbtn',{hasText:n}).first();
  const logout=async()=>{ await page.locator('[data-act="user-menu"]').click(); await page.locator('#um-out').click(); };
  // primeiro acesso exige senha
  await page.waitForSelector('#su-name'); await page.fill('#su-name','Leo');
  await page.fill('#su-pw','123'); await page.fill('#su-pw2','123'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForTimeout(300);
  ok('senha curta no cadastro do admin é recusada', (await page.locator('#su-name').count())===1);
  await page.fill('#su-pw','segredo1'); await page.fill('#su-pw2','outra'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForTimeout(300);
  ok('senhas diferentes são recusadas', (await page.locator('#su-name').count())===1);
  await page.fill('#su-pw2','segredo1'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
  const st=await page.evaluate(()=>JSON.stringify(window.__store));
  ok('a senha não fica gravada em texto', !/segredo1/.test(st) && /"pw":\{"s":"[0-9a-f]{32}","h":"[0-9a-f]{64}"/.test(st));
  await logout();
  // senha errada
  await user('Leo').click(); await page.fill('#q-p','errada'); await submit(); await page.waitForTimeout(400);
  ok('senha errada não entra', (await page.locator('text=Quem está usando').count())===1);
  // 5 erradas bloqueiam, mesmo com a certa
  for(let i=0;i<4;i++){ await user('Leo').click(); await page.fill('#q-p','x'+i); await submit(); await page.waitForTimeout(250); }
  await user('Leo').click().catch(()=>{}); await page.waitForTimeout(300);
  ok('após 5 erros fica bloqueado (nem abre o campo de senha)', !(await dlgOpen()));
  // reinicia a página para zerar o bloqueio (ele é só em memória) e entra com a senha certa
  await reload(); await page.waitForSelector('.userbtn');
  await user('Leo').click(); await page.fill('#q-p','segredo1'); await submit(); await page.waitForSelector('text=Gestão da operação');
  ok('senha certa entra', true);
  // usuários de teste ainda sem senha: primeiro acesso cria
  await logout(); await user('Atendimento 1').click(); await page.waitForSelector('#q-b');
  await page.fill('#q-a','abc'); await page.fill('#q-b','abc'); await submit(); await page.waitForTimeout(300);
  const hasPw=async n=>page.evaluate(n=>Object.entries(window.__store).some(([k,v])=>k.startsWith('users/')&&v.name===n&&v.pw&&v.pw.h),n);
  ok('Atendimento 1 ainda sem senha', !(await hasPw('Atendimento 1')));
  if(!(await dlgOpen())) await user('Atendimento 1').click();
  await page.waitForSelector('#q-b'); await page.fill('#q-a','atend123'); await page.fill('#q-b','atend123'); await submit(); await page.waitForSelector('text=+ Novo pedido');
  ok('Atendimento 1 criou a senha e entrou', await hasPw('Atendimento 1'));
  // perfil do atendimento não vê o cadastro de usuários
  ok('atendimento não tem aba de usuários', (await page.locator('.tab',{hasText:'Cadastros'}).count())===0);
  // alterar senha
  await (async()=>{ await page.locator('[data-act="user-menu"]').click(); await page.locator('#um-pw').click(); })(); await page.fill('#q-p','atend123'); await submit();
  await page.waitForSelector('#q-b'); await page.fill('#q-a','nova456'); await page.fill('#q-b','nova456'); await submit(); await page.waitForTimeout(400);
  await logout(); await user('Atendimento 1').click(); await page.fill('#q-p','atend123'); await submit(); await page.waitForTimeout(300);
  ok('senha antiga não vale mais', (await page.locator('text=Quem está usando').count())===1);
  await user('Atendimento 1').click(); await page.fill('#q-p','nova456'); await submit(); await page.waitForSelector('text=+ Novo pedido'); ok('senha nova entra', true);
  // admin redefine
  await logout(); await user('Leo').click(); await page.fill('#q-p','segredo1'); await submit(); await page.waitForSelector('text=Gestão da operação');
  await page.locator('.tab',{hasText:'Cadastros'}).click(); await page.getByRole('tab',{name:'Usuários'}).click().catch(async()=>{ await page.locator('text=Usuários').first().click(); });
  await page.waitForSelector('[data-act="u-pw"]');
  await page.locator('tr',{hasText:'Atendimento 1'}).locator('[data-act="u-pw"]').click(); await submit(); await page.waitForTimeout(400);
  ok('admin redefiniu: Atendimento 1 sem senha', !(await hasPw('Atendimento 1')));
  await logout(); await user('Atendimento 1').click(); await page.waitForSelector('#q-b'); ok('depois de redefinir, pede para criar senha nova', true);
  await page.locator('#askf [data-x=cancel]').click();
  // sessão lembrada: usuário sem senha é obrigado a criar
  await page.evaluate(()=>{ const k=Object.entries(window.__store).find(([k,v])=>k.startsWith('users/')&&v.name==='Produção'); localStorage.setItem('salem.me',k[0].split('/')[1]); localStorage.setItem('salem.meAt',String(Date.now())); });
  await reload(); await page.waitForSelector('#q-b',{timeout:6000}); ok('sessão lembrada sem senha pede para criar uma', true);
  await page.locator('#askf [data-x=cancel]').click(); await page.waitForTimeout(300);
  ok('cancelando, sai da conta', (await page.locator('text=Quem está usando').count())===1);
  // sessão do admin expira em 8h
  await page.evaluate(()=>{ const k=Object.entries(window.__store).find(([k,v])=>k.startsWith('users/')&&v.name==='Leo'); localStorage.setItem('salem.me',k[0].split('/')[1]); localStorage.setItem('salem.meAt',String(Date.now()-9*3600*1000)); });
  await reload(); await page.waitForTimeout(800);
  ok('sessão do admin vencida (9 h) pede a senha de novo', (await page.locator('text=Quem está usando').count())===1);
  await page.evaluate(()=>{ const k=Object.entries(window.__store).find(([k,v])=>k.startsWith('users/')&&v.name==='Leo'); localStorage.setItem('salem.me',k[0].split('/')[1]); localStorage.setItem('salem.meAt',String(Date.now()-3600*1000)); });
  await reload(); await page.waitForTimeout(800);
  ok('sessão do admin recente (1 h) continua', (await page.locator('text=Gestão da operação').count())===1);
  console.log(errors.length?errors:'no errors'); await browser.close();
})();

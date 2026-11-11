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
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.route(/googleapis|gstatic/, r=>r.abort());
  await page.addInitScript(mock);
  await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
  await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0], (e.stack.match(/test.js:\d+/)||[''])[0]); } };
  const btn = (n, opt) => page.getByRole('button', { name: n, exact: opt === undefined ? false : opt }).first();
  const store = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__store)));
  const login = async n => { await btn('Trocar usuário').click(); await page.locator('.userbtn', { hasText: n }).first().click(); };


  await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:fs.readFileSync('/tmp/claude-0/-home-claude/1f9ecbd4-7c06-5327-b215-0c2935f1848a/scratchpad/artifact-files/b1d451e0-8614-451a-acdd-d71f9b5e41a3/0a6e79af65f66e9a4f8f099f12ff4688.png')}));
  await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await btn('Começar').click(); await page.waitForSelector('text=Gestão da operação');

  const fsx=require('fs'); const dd='orders-dump2/orders/';
  const docs={}; fsx.readdirSync(dd).forEach(f=>{ const j=JSON.parse(fsx.readFileSync(dd+f)); docs['orders/'+(j.id||f.replace('.json',''))]=j.data||j; });
  await page.evaluate(d=>{ Object.assign(window.__store,d); window.__notify(); },docs);
  await page.evaluate(()=>{ window.__store['users/u-at']={id:'u-at',name:'Atendimento',role:'atendimento',active:true}; window.__store['orders/o0012'].status='liberado'; window.__store['orders/o0012'].times={liberadoAt:Date.now()}; window.__notify(); });
  await page.getByRole('button',{name:'Trocar usuário'}).first().click(); await page.locator('.userbtn',{hasText:'Atendimento'}).first().click();
  await page.waitForTimeout(500);
  await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
  await page.locator('#pf-status').selectOption('abertos'); await page.locator('#pf-slot').selectOption('noite'); await page.locator('#pf-slot').selectOption('');
  await page.evaluate(()=>{ const o={...window.__store['orders/o0012']}; o.id='o0013'; o.num=13; o.key='k13'; o.status='liberado'; window.__store['orders/o0013']=o; window.__notify(); });
  await page.waitForTimeout(600);
  console.log('novo pedido apareceu com select focado:', await page.locator('.ocard',{hasText:'#0013'}).count(), '| foto no cartão:', await page.locator('.ocard .thumbs img').count());
  await page.locator('#pf-q').click(); await page.keyboard.type('ab');
  await page.evaluate(()=>{ const o={...window.__store['orders/o0012']}; o.id='o0014'; o.num=14; o.key='k14'; o.client={name:'Abel',phone:'1'}; o.status='liberado'; window.__store['orders/o0014']=o; window.__notify(); });
  await page.waitForTimeout(600);
  console.log('com busca focada, #0014 aparece (nome Abel):', await page.locator('.ocard',{hasText:'#0014'}).count());
  console.log(JSON.stringify(Object.values(docs).map(o=>[o.num,o.status])));
  await page.screenshot({path:'ped.png'});
  await browser.close();
})();

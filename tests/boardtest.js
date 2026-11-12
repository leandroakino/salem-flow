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
  const login = async n => { await (async()=>{ await page.locator('[data-act="user-menu"]').click(); await page.locator('#um-out').click(); })(); await page.locator('.userbtn', { hasText: n }).first().click(); };



  await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
  await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await btn('Começar').click(); await page.waitForSelector('text=Gestão da operação');
  const fsx=require('fs'); const docs={};
  fsx.readdirSync('seed').forEach(f=>{ const o=JSON.parse(fsx.readFileSync('seed/'+f)); docs['orders/'+o.id]=o; });
  // mais pedidos liberados para estressar
  for(let k=0;k<12;k++){ const o=JSON.parse(JSON.stringify(docs['orders/o0020'])); o.id='o01'+k; o.num=100+k; o.key='x'+k; docs['orders/'+o.id]=o; }
  await page.evaluate(d=>{ Object.assign(window.__store,d); window.__notify(); },docs);
  await page.locator('.tab',{hasText:'Pedidos'}).click(); await page.waitForTimeout(600);
  const info=await page.evaluate(()=>{const b=document.querySelector('.board');const c=[...b.querySelectorAll('.cb')].map(e=>[e.scrollHeight,e.clientHeight]);return {bh:b.getBoundingClientRect().height,win:innerHeight,pageScroll:document.documentElement.scrollHeight,c}});
  console.log('desktop',JSON.stringify(info));
  await page.screenshot({path:'b-desk.png'});
  await page.locator('.cb').nth(1).evaluate(e=>e.scrollTop=300);
  await page.evaluate(()=>window.__store['orders/o0099']={...window.__store['orders/o0020'],id:'o0099',num:99,key:'z'}); await page.evaluate(()=>window.__notify()); await page.waitForTimeout(400);
  console.log('scroll mantido apos atualizar:', await page.locator('.cb').nth(1).evaluate(e=>e.scrollTop));
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(500);
  await page.screenshot({path:'b-mob.png'});
  await page.setViewportSize({width:1920,height:1080}); await page.waitForTimeout(300);
  await page.evaluate(()=>{location.hash='tv'}); await page.waitForSelector('.tv .tvi'); await page.waitForTimeout(800);
  const tv=await page.evaluate(()=>({cls:document.querySelector('.tv').className,items:document.querySelectorAll('.tvi').length,sh:document.documentElement.scrollHeight,ih:innerHeight}));
  console.log('tv',JSON.stringify(tv));
  await page.screenshot({path:'tv-many.png'});
  await page.evaluate(()=>window.scrollTo(0,99999)); await page.waitForTimeout(300); console.log('tv scrollY',await page.evaluate(()=>scrollY));
  await browser.close();
})();

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


  await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:fs.readFileSync('/tmp/claude-0/-home-claude/1f9ecbd4-7c06-5327-b215-0c2935f1848a/scratchpad/artifact-files/b1d451e0-8614-451a-acdd-d71f9b5e41a3/0a6e79af65f66e9a4f8f099f12ff4688.png')}));
  await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await btn('Começar').click(); await page.waitForSelector('text=Gestão da operação');
  await page.evaluate(()=>{ window.__store['orders/o1']={id:'o1',num:12,key:'k',status:'em_producao',type:'retirada',date:new Date().toISOString().slice(0,10),time:'22:20',client:{name:'X',phone:'1'},items:[{name:'Item avulso',qty:1,price:1,desc:'x'}],photos:[{id:'0a6e79af65f66e9a4f8f099f12ff4688'}],pay:{method:'pix',status:'pago'},history:[],times:{},createdAt:Date.now(),statusAt:Date.now()}; window.__notify(); });
  await page.evaluate(()=>{location.hash='tv'}); await page.waitForSelector('.tv img.ph');
  await page.waitForTimeout(1500);
  console.log(await page.evaluate(()=>{const i=document.querySelector('.tv img.ph');const r=i.getBoundingClientRect();return JSON.stringify({w:i.naturalWidth,c:i.complete,rect:[r.width,r.height]})}));
  await page.evaluate(()=>{for(let k=2;k<=6;k++){window.__store['orders/o'+k]={...window.__store['orders/o1'],id:'o'+k,num:12+k,key:'k'+k,photos:k%2?[]:window.__store['orders/o1'].photos,status:k>4?'liberado':'em_producao'};} window.__notify();}); await page.waitForTimeout(500);
  await page.screenshot({path:'tv.png'});
  await page.locator('.tvi .tvb').first().click(); await page.waitForSelector('.drawer'); await page.waitForTimeout(400); await page.screenshot({path:'tv-drawer.png'});
  await page.locator('.drawer .thumbs img').first().click(); await page.waitForSelector('#zoom img'); await page.waitForTimeout(400); await page.screenshot({path:'tv-zoom.png'});
  await page.keyboard.press('Escape'); console.log('zoom gone', (await page.locator('#zoom').count())===0);
  await page.keyboard.press('Escape'); await page.locator('.tvi img.ph').first().click(); await page.waitForSelector('#zoom img'); console.log('zoom from tv ok, drawer hidden:', await page.locator('#drawer').isHidden());
  await browser.close();
})();

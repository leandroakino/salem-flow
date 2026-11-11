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
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.route(/googleapis|gstatic/, r=>r.abort());
  await page.addInitScript(mock);
  await page.addInitScript(()=>{ const now=Date.now(); const base={status:'em_producao',type:'retirada',date:new Date().toISOString().slice(0,10),time:'22:20',client:{name:'X',phone:'1'},pay:{method:'pix',status:'pago'},history:[],times:{},createdAt:now,statusAt:now,key:'k'};
    window.__seed=()=>{ for(let k=1;k<=16;k++){ window.__store['orders/o'+k]={...base,id:'o'+k,num:100+k,key:'k'+k,status:k%3?'em_producao':'liberado',items:[{name:'Buquê '+k,qty:1,price:1,desc:'Descrição longa do item '+k+' com rosas vermelhas e laço'}],buildNotes:k%2?'Obs: cartão junto':''}; } window.__store['users/u1']={id:'u1',name:'Leo',role:'admin',active:true}; window.__notify(); }; });
  await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
  await page.goto('http://salem.test/#tv',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>window.__seed());
  await page.waitForSelector('.tv .tvi');
  const ok=(n,c)=>console.log(c?'OK  ':'FAIL',n);
  ok('no login/signup shown', (await page.locator('#su-name').count())===0);
  ok('no buttons in tv', (await page.locator('.tv button').count())===0);
  ok('has description', (await page.locator('.tvi .d').count())>0);
  await page.locator('.tvi .tvb').first().click(); await page.waitForTimeout(300);
  ok('click does not open drawer', (await page.locator('.drawer:visible').count())===0);
  ok('cursor hidden', await page.evaluate(()=>getComputedStyle(document.body).cursor==='none'));
  await page.screenshot({path:'tv-info.png'});
  const y0=await page.evaluate(()=>window.pageYOffset);
  const sh=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
  console.log('scrollable',sh);
  await page.waitForTimeout(17000);
  const y1=await page.evaluate(()=>window.pageYOffset); console.log('y',y0,y1);
  ok('auto-scroll or fits', sh<=8||y1>y0);
  await page.evaluate(()=>{ window.__store['orders/o1'].status='pronto_subir'; window.__notify(); }); await page.waitForTimeout(1500);
  ok('moved fx present', (await page.locator('.tvi.fx-moved,.tvi.fx-new').count())>0);
  ok('reset to top on move', (await page.evaluate(()=>window.pageYOffset))<5);
  await page.setViewportSize({width:1366,height:768}); await page.waitForTimeout(500); await page.screenshot({path:'tv-info-1366.png'});
  console.log(errors.length?errors:'no errors');
  await browser.close();
})();

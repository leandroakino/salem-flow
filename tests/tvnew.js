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
  const errors=[];
  for (const [w,h] of [[1920,1080],[1366,768],[1440,900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage(); page.setDefaultTimeout(5000);
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await page.route(/googleapis|gstatic/, r=>r.abort());
    await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
    await page.addInitScript(mock);
    await page.addInitScript(()=>{ const now=Date.now(); const day=new Date().toISOString().slice(0,10);
      window.__seed=()=>{ const names=['Buquê de rosas vermelhas','Cesta café da manhã','Arranjo de girassóis','Orquídea phalaenopsis','Buquê de noiva','Coroa de flores','Caixa Ferrero e rosas'];
        for(let k=1;k<=14;k++){ const mm=(k*37)%240-60; const d=new Date(now+mm*60000); const st=k<=5?'liberado':k<=10?'em_producao':'pronto_subir';
          window.__store['orders/o'+k]={id:'o'+k,num:100+k,key:'k'+k,status:st,type:k%3?'entrega':'retirada',date:day,time:('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),client:{name:'Cliente '+k,phone:'1'},items:[{name:names[k%7],qty:1+(k%3==0?1:0),price:1,desc:k%2?'Rosas vermelhas, eucalipto e laço de cetim dourado':''},...(k%4==0?[{name:'Cartão personalizado',qty:1,price:1,desc:''}]:[])],photos:k%3==0?[{id:'x'}]:[],buildNotes:k%5==0?'Cartão junto, embrulhar para presente':'',pay:{method:'pix',status:'pago'},history:[],times:{},createdAt:now,statusAt:now}; }
        window.__store['users/u1']={id:'u1',name:'Leo',role:'admin',active:true}; window.__notify(); }; });
    await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
    await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
    await page.evaluate(()=>window.__seed()); await page.evaluate(()=>{location.hash='tv'}); 
    await page.evaluate(()=>{ const e=[...document.querySelectorAll('[data-act="nav"][data-v="tv"]')][0]; });
    await page.waitForTimeout(300);
    await page.evaluate(()=>{ window.dispatchEvent(new HashChangeEvent('hashchange')); });
    const ok = await page.locator('.tv .tvi').count();
    if(!ok){ // abre pelo menu
      await page.getByRole('button',{name:/TV/}).first().click().catch(()=>{}); await page.waitForTimeout(300); const a=page.locator('#tv-here'); if(await a.count()) await a.click(); }
    await page.waitForSelector('.tv .tvi',{timeout:4000}).catch(()=>{});
    await page.waitForTimeout(800);
    console.log('clock:',JSON.stringify(await page.evaluate(()=>{const c=document.querySelector('#tvclock');const r=document.querySelector('.tvclock');return [c&&c.textContent, r&&r.getBoundingClientRect().width, getComputedStyle(r).display]}))); console.log(w,h,'cards',await page.locator('.tv .tvi').count(),'overflow-x',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
    await page.screenshot({path:`tv-new-${w}.png`});
    await ctx.close();
  }
  console.log(errors.length?errors:'no errors'); await browser.close();
})();

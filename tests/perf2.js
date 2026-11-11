const { chromium } = require('playwright');
const fs = require('fs');
const dir = __dirname;

const wrapOf=page_html=> '<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + page_html + '</body></html>';

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
  window.__up=[]; window.claude={ use: async name => name==='assets'?{upload:async f=>{ window.__up.push({n:f.name,t:f.type,s:f.size,at:performance.now()}); return {id:'p'+window.__up.length}; }}:name==='db'?db:name==='downloads'?{save:async()=>({status:'saved'})}:null };
})();`;



const html=fs.readFileSync('/tmp/cur.html','utf8'); const IMG='/tmp/claude-0/-home-claude/1f9ecbd4-7c06-5327-b215-0c2935f1848a/scratchpad/demo/orig.jpg';
(async () => {
  const browser = await chromium.launch();
  for (const rate of [1,4]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate',{rate});
    await page.route(/googleapis|gstatic/, r=>r.abort());
    await page.addInitScript(mock);
    await page.addInitScript(()=>{ window.__lt=[]; try{ new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']}); }catch(e){} });
    await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapOf(html)}));
    await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
    await page.evaluate(()=>{ window.__store['users/u2']={id:'u2',name:'Atendimento 1',role:'atendimento',active:true}; window.__notify(); });
    await page.getByRole('button',{name:'Trocar usuário'}).first().click(); await page.locator('.userbtn',{hasText:'Atendimento 1'}).first().click();
    await page.getByRole('button',{name:'+ Novo pedido'}).first().click(); await page.waitForSelector('#fo-photo');
    await page.evaluate(()=>{ window.__lt=[]; window.__t0=performance.now(); });
    await page.setInputFiles('#fo-photo',IMG);
    await page.waitForFunction(()=>window.__up.length>0,null,{timeout:30000});
    const r=await page.evaluate(()=>({ms:Math.round(window.__up[0].at-window.__t0),size:Math.round(window.__up[0].s/1024),lt:window.__lt}));
    console.log('CPU '+rate+'x:', 'original',Math.round(fs.statSync(IMG).size/1024)+' KB ->',r.size+' KB; tempo total',r.ms,'ms; travamentos (long tasks, ms):',JSON.stringify(r.lt));
    await ctx.close();
  }
  await browser.close();
})();

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


const variants={'v26 (antes)':fs.readFileSync('/tmp/v26.html','utf8'),'atual (v32)':fs.readFileSync('/tmp/cur.html','utf8')};
(async () => {
  const browser = await chromium.launch();
  for (const [name,html] of Object.entries(variants)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4}); await cdp.send('Performance.enable');
    await page.route(/googleapis|gstatic/, r=>r.abort());
    await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
    await page.addInitScript(mock);
    await page.addInitScript(()=>{ const now=Date.now(), day=new Date().toISOString().slice(0,10);
      window.__seed=()=>{ for(let k=1;k<=17;k++){ const d=new Date(now+((k*37)%240-60)*60000); window.__store['orders/o'+k]={id:'o'+k,num:100+k,key:'k'+k,status:k<=6?'liberado':k<=12?'em_producao':'pronto_subir',type:k%3?'entrega':'retirada',date:day,time:('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),client:{name:'Cliente '+k,phone:'1'},items:[{name:'Buquê '+k,qty:1,price:1,desc:'Rosas vermelhas e laço'}],photos:k%2?[{id:'x'}]:[],buildNotes:'',pay:{method:'pix',status:'pago'},history:[{act:'Pedido criado',at:now,by:'A',role:'atendimento'}],times:{},createdAt:now,statusAt:now}; } window.__store['users/u2']={id:'u2',name:'Atendimento 1',role:'atendimento',active:true}; window.__notify(); }; });
    await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapOf(html)}));
    await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
    await page.evaluate(()=>window.__seed());
    const m=async()=>{ const r=(await cdp.send('Performance.getMetrics')).metrics; const g=n=>r.find(x=>x.name===n).value; return {task:g('TaskDuration'),script:g('ScriptDuration')}; };
    const out={};
    // 1) Pedidos (admin) ocioso
    await page.locator('.tab',{hasText:'Pedidos'}).click().catch(()=>{}); await page.waitForTimeout(1500);
    let a=await m(); await page.waitForTimeout(8000); let b=await m(); out.pedidos_ocioso_cpu_pct=((b.task-a.task)/8*100/4).toFixed(1);
    // 2) Painel TV ocioso (rolagem automática começa após 30s ocioso; aqui mede o estado normal)
    await page.evaluate(()=>{ location.hash='tv'; }); await page.waitForSelector('.tv,.tvgrid'); await page.waitForTimeout(1500);
    a=await m(); await page.waitForTimeout(8000); b=await m(); out.tv_ocioso_cpu_pct=((b.task-a.task)/8*100/4).toFixed(1);
    // 3) Atualização ao vivo: 10 mudanças de pedido seguidas
    a=await m(); const t0=Date.now(); for(let i=0;i<10;i++){ await page.evaluate(i=>{ window.__store['orders/o'+(i+1)].statusAt=Date.now(); window.__store['orders/o'+(i+1)].status=i%2?'em_producao':'liberado'; window.__notify(); },i); await page.waitForTimeout(150); } await page.waitForTimeout(1000); b=await m(); out.tv_10_mudancas_ms_cpu=(((b.task-a.task)*1000)/4).toFixed(0);
    console.log(name, JSON.stringify(out));
    // 4) Envio de foto (só na versão atual tem compressão)
    await page.evaluate(()=>{ location.hash=''; });
    await ctx.close();
  }
  await browser.close();
})();

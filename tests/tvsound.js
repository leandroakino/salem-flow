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
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route(/googleapis|gstatic/, r=>r.abort());
  await page.addInitScript(mock);
  await page.addInitScript(()=>{ window.__osc=0; window.AudioContext=function(){ this.state='suspended'; this.currentTime=0; this.destination={}; this.resume=()=>{ this.state='running'; return Promise.resolve(); };
      this.createOscillator=()=>{ window.__osc++; return {type:'',frequency:{value:0},connect(){},start(){},stop(){}}; };
      this.createGain=()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}); };
    const now=Date.now(), day=new Date().toISOString().slice(0,10);
    window.__mk=(k,st)=>({id:'o'+k,num:100+k,key:'k'+k,status:st,type:'entrega',date:day,time:'23:59',client:{name:'X',phone:'1'},items:[{name:'Buquê '+k,qty:1,price:1,desc:''}],photos:[],buildNotes:'',pay:{method:'pix',status:'pago'},history:[],times:{},createdAt:now,statusAt:now});
  });
  await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
  await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
  const ok=(n,c)=>console.log(c?'OK  ':'FAIL',n);
  await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
  await page.evaluate(()=>{ window.__store['orders/o1']=window.__mk(1,'em_producao'); window.__notify(); location.hash='tv'; });
  await page.waitForSelector('.tv');
  ok('botão avisa que precisa tocar', /Toque para ativar/.test(await page.locator('#tvsnd').getAttribute('aria-label')));
  await page.evaluate(()=>{ window.__store['orders/o2']=window.__mk(2,'liberado'); window.__notify(); }); await page.waitForTimeout(600);
  ok('sem toque na tela, não soa', (await page.evaluate(()=>window.__osc))===0);
  await page.locator('#tvsnd').click(); await page.waitForTimeout(500);
  ok('ativar toca o teste', (await page.evaluate(()=>window.__osc))===2);
  ok('botão mostra Som ligado', /Som ligado/.test(await page.locator('#tvsnd').getAttribute('aria-label')));
  await page.evaluate(()=>{ window.__store['orders/o3']=window.__mk(3,'liberado'); window.__notify(); }); await page.waitForTimeout(600);
  ok('pedido novo em Aguardando soa', (await page.evaluate(()=>window.__osc))===4);
  await page.evaluate(()=>{ window.__store['orders/o3'].status='em_producao'; window.__notify(); }); await page.waitForTimeout(600);
  ok('mudar de etapa não soa', (await page.evaluate(()=>window.__osc))===4);
  await page.locator('#tvsnd').click(); await page.waitForTimeout(300);
  ok('desligar: rótulo', /Som desligado/.test(await page.locator('#tvsnd').getAttribute('aria-label')));
  await page.evaluate(()=>{ window.__store['orders/o4']=window.__mk(4,'liberado'); window.__notify(); }); await page.waitForTimeout(600);
  ok('desligado não soa', (await page.evaluate(()=>window.__osc))===4);
  console.log(errors.length?errors:'no errors'); await browser.close();
})();

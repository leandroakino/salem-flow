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
  window.__up=[]; window.claude={ use: async name => name==='assets'?{upload:async f=>{ window.__up.push({n:f.name,t:f.type,s:f.size}); return {id:'p'+window.__up.length}; }}:name==='db'?db:name==='downloads'?{save:async()=>({status:'saved'})}:null };
})();`;

(async () => {
  const browser = await chromium.launch(); const errors=[];
  const page = await (await browser.newContext({viewport:{width:1280,height:900}})).newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route(/googleapis|gstatic/, r=>r.abort());
  await page.route('**/_blob/**', r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
  await page.addInitScript(mock);
  await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
  await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
  const ok=(n,c)=>console.log(c?'OK  ':'FAIL',n);
  await page.waitForSelector('#su-name'); await page.fill('#su-name','L'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
  await page.evaluate(()=>{ window.__store['users/u2']={id:'u2',name:'Atendimento 1',role:'atendimento',active:true}; window.__notify(); });
  await (async()=>{ await page.locator('[data-act="user-menu"]').click(); await page.locator('#um-out').click(); })(); await page.locator('.userbtn',{hasText:'Atendimento 1'}).first().click(); await page.waitForSelector('#q-b'); await page.fill('#q-a','teste123'); await page.fill('#q-b','teste123'); await page.locator('#askf button.primary').click();
  await page.getByRole('button',{name:'+ Novo pedido'}).first().click(); await page.waitForSelector('#fo-photo');
  const buf = await page.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=4000; c.height=3000; const x=c.getContext('2d'); const g=x.createLinearGradient(0,0,4000,3000); g.addColorStop(0,'#c33'); g.addColorStop(1,'#36c'); x.fillStyle=g; x.fillRect(0,0,4000,3000); for(let i=0;i<6000;i++){ x.fillStyle='hsl('+(i%360)+',70%,'+(30+(i*7)%40)+'%)'; x.beginPath(); x.arc(Math.random()*4000,Math.random()*3000,5+Math.random()*60,0,7); x.fill(); } const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.95)); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode.apply(null,u.subarray(i,i+8192)); return btoa(s); });
  const data=Buffer.from(buf,'base64'); ok('imagem de teste grande (>1 MB)', data.length>1024*1024);
  await page.setInputFiles('#fo-photo',{name:'IMG_1234.jpg',mimeType:'image/jpeg',buffer:data});
  await page.waitForTimeout(2500);
  const up=await page.evaluate(()=>window.__up);
  console.log(JSON.stringify(up),'original',(data.length/1024).toFixed(0),'KB');
  ok('enviou 1 arquivo', up.length===1);
  ok('ficou menor (<= 400 KB)', up[0]&&up[0].s<=400*1024);
  ok('ficou JPEG', up[0]&&up[0].t==='image/jpeg'&&/\.jpg$/.test(up[0].n));
  // arquivo que não é imagem aceita: segue sem quebrar
  await page.setInputFiles('#fo-photo',{name:'x.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')});
  await page.waitForTimeout(800);
  const up2=await page.evaluate(()=>window.__up); ok('PNG minúsculo: envia sem piorar o tamanho', up2.length===2&&up2[1].s<=70);
  console.log(errors.length?errors:'no errors'); await browser.close();
})();

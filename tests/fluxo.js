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
  for (const [name,w,h] of [['PC 1366x768',1366,768],['iPad horizontal 1180x820',1180,820],['iPad vertical 820x1180',820,1180],['Celular 390x844',390,844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w<1000 });
    const page = await ctx.newPage(); page.setDefaultTimeout(6000);
    await page.route(/googleapis|gstatic/, r=>r.abort());
    await page.addInitScript(mock);
    await page.route('http://salem.test/', r=>r.fulfill({contentType:'text/html',body:wrapped}));
    await page.goto('http://salem.test/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#su-name'); await page.fill('#su-name','Leo'); await page.fill('#su-pw','teste123'); await page.fill('#su-pw2','teste123'); await page.getByRole('button',{name:'Começar'}).click(); await page.waitForSelector('text=Gestão da operação');
    const now=Date.now(), day=new Date().toISOString().slice(0,10);
    await page.evaluate(([now,day])=>{ for(let k=1;k<=9;k++){ const st=k<=3?'liberado':k<=6?'em_producao':'pronto_subir'; const d=new Date(now+k*30*60000); window.__store['orders/o'+k]={id:'o'+k,num:100+k,key:'k'+k,status:st,type:'entrega',date:day,time:('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),client:{name:'C'+k,phone:'1'},items:[{name:'Buquê '+k,qty:1,price:1,desc:'Rosas vermelhas e laço'}],photos:[],buildNotes:'',pay:{method:'pix',status:'pago'},history:[],times:{},createdAt:now,statusAt:now}; } window.__notify(); },[now,day]);
    await (async()=>{ await page.locator('[data-act="user-menu"]').click(); await page.locator('#um-out').click(); })(); await page.locator('.userbtn',{hasText:'Produção'}).first().click(); await page.waitForSelector('#q-b'); await page.fill('#q-a','teste123'); await page.fill('#q-b','teste123'); await page.locator('#askf button.primary').click();
    await page.waitForSelector('.board'); await page.waitForTimeout(500);
    let taps=0; const tap=async(loc,label)=>{ taps++; await loc.click(); };
    // visibilidade sem rolar
    const vis=async(loc)=>{ const b=await loc.boundingBox(); if(!b) return false; return b.x>=0&&b.y>=0&&b.x+b.width<=w&&b.y+b.height<=h; };
    const firstStart=page.getByRole('button',{name:'Iniciar produção'}).first();
    const startVisible=await vis(firstStart);
    const cols=await page.evaluate(()=>[...document.querySelectorAll('.board .col')].map(c=>{const r=c.getBoundingClientRect();return [c.querySelector('header span').textContent,Math.round(r.left),Math.round(r.width)]}));
    const colsInView=cols.filter(([,l,wd])=>l>=-2&&l+wd<=w+2).length;
    await page.screenshot({path:`fila-${w}.png`});
    const t0=Date.now();
    await tap(firstStart);
    await page.waitForSelector('#fchbar:not([hidden])'); await page.waitForTimeout(300); await page.screenshot({path:`fila-bar-${w}.png`}); const closeBtns=await page.locator('#fchbar button').allInnerTexts();
    await page.waitForTimeout(400);
    const doneBtn=page.getByRole('button',{name:'Pronto para subir'}).first();
    const doneVisible=await vis(doneBtn);
    await tap(doneBtn); await page.waitForSelector('#cm-ok');
    const dlgBox=await page.locator('#dlg .sheet').boundingBox();
    await tap(page.locator('#cm-ok')); await tap(page.locator('#cm-go')); await page.waitForTimeout(500);
    const st=await page.evaluate(()=>{ return Object.values(window.__store).filter(o=>o.status).map(o=>o.status+':'+o.num).filter(s=>/10[1-3]/.test(s)).join(',') });
    console.log(JSON.stringify({tela:name,toques:taps,botoesDaFicha:closeBtns.join(' | '),iniciarVisivelSemRolar:startVisible,prontoVisivelSemRolar:doneVisible,colunas:cols.length,colunasInteirasNaTela:colsInView,janelaConferenciaAltura:Math.round(dlgBox.height)+'/'+h,maquinaMs:Date.now()-t0,situacao:st}));
    await ctx.close();
  }
  await browser.close();
})();

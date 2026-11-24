const { chromium } = require('playwright'); const fs=require('fs');
const src=fs.readFileSync(__dirname+'/test.js','utf8'); const mock=src.match(/const mock = `([\s\S]*?)`;\n/)[1];
let html=fs.readFileSync(__dirname+'/../web/index.html','utf8');
html=html.replace(/<script src="https:\/\/cdn\.jsdelivr[^>]*><\/script>\n?/,'').replace(/<script>\n\/\* Salém Flow — adaptador[\s\S]*?<\/script>\n/,'').replace(/<script src="https:\/\/cdnjs[^>]*><\/script>\n?/,'');
const wrapped='<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+html+'</body></html>';
const web=`${mock}
window.SALEM_WEB={ db:window.claude&&null, sb:{auth:{getSession:async()=>({data:{session:{user:{id:'A1'}}}}),onAuthStateChange(){},signOut:async()=>{}},rpc:async()=>({data:null}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})}, assets:null, dl:{save:async()=>({})}, photoURL:id=>'/x/'+id, url:'',key:'',createClient:()=>null };
window.claude.use(\"db\").then(d=>{ window.SALEM_WEB.db=d; });
`;
let fails=0; const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext(); const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/*',r=>{ const u=r.request().url(); if(u==='http://salem.test/'||u.startsWith('http://salem.test/?')) return r.fulfill({contentType:'text/html',body:wrapped}); if(/salem\.test/.test(u)) return r.fulfill({body:''}); return r.abort(); });
  await page.addInitScript(web);
  await page.addInitScript(()=>{ try{ localStorage.setItem('salem.station','baixo'); }catch(e){} });
  await page.goto('http://salem.test/'); await page.waitForTimeout(300);
  // dados: usuário ligado ao login A1, pedido recente iniciado, pedido antigo, pedido não iniciado
  await page.evaluate(async()=>{ const now=Date.now(); const db=window.SALEM_WEB.db;
    await db.doc('users/u1').set({name:'Prod',role:'producao',active:true,authId:'A1'});
    const base={client:{name:'Ana',phone:'1'},type:'retirada',channel:'presencial',date:'2026-11-25',time:'10:00',items:[{name:'Buquê',qty:1,price:10}],history:[],createdAt:now};
    await db.doc('orders/o1').set({...base,id:'o1',num:11,status:'em_producao',times:{inicioAt:now-5000}});
    await db.doc('orders/o2').set({...base,id:'o2',num:12,status:'em_producao',times:{inicioAt:now-3600000}});
    await db.doc('orders/o3').set({...base,id:'o3',num:13,status:'liberado',times:{liberadoAt:now-2000}}); });
  await page.waitForTimeout(1500); await page.reload(); await page.waitForTimeout(300);
  // após reload o store do mock é refeito: recria
  await page.evaluate(async()=>{ const now=Date.now(); const db=window.SALEM_WEB.db;
    await db.doc('users/u1').set({name:'Prod',role:'producao',active:true,authId:'A1'});
    const base={client:{name:'Ana',phone:'1'},type:'retirada',channel:'presencial',date:'2026-11-25',time:'10:00',items:[{name:'Buquê',qty:1,price:10}],history:[],createdAt:now};
    await db.doc('orders/o1').set({...base,id:'o1',num:11,status:'em_producao',times:{inicioAt:now-5000}});
    await db.doc('orders/o2').set({...base,id:'o2',num:12,status:'em_producao',times:{inicioAt:now-3600000}});
    await db.doc('orders/o3').set({...base,id:'o3',num:13,status:'liberado',times:{liberadoAt:now-2000}}); });
  await page.waitForTimeout(5000);
  const r=await page.evaluate(()=>({ifr:[...document.querySelectorAll('iframe')].map(f=>f.srcdoc.includes('#0011')||/0011/.test(f.srcdoc)?'0011':/0012/.test(f.srcdoc)?'0012':/0013/.test(f.srcdoc)?'0013':'?'), o1:window.__store['orders/o1'].printed, o2:window.__store['orders/o2'].printed, o3:window.__store['orders/o3'].printed, pill:(document.querySelector('#estacao')||{}).textContent}));
  console.log(JSON.stringify(r));
  ok(r.ifr.length===1&&r.ifr[0]==='0011','estação "baixo" imprimiu só o pedido 0011 (recente, iniciado)');
  ok(r.o1&&r.o1.prod,'pedido 0011 marcado como impresso');
  ok(!r.o2,'pedido antigo (1 h) ignorado');
  ok(!r.o3,'pedido só liberado não imprime na estação de baixo');
  await page.waitForTimeout(3000);
  const n=await page.evaluate(()=>document.querySelectorAll('iframe').length); ok(n<=1,'não repete a impressão');
  ok(errs.length===0,'sem erros de página '+errs.join('|'));
  await b.close(); process.exit(fails?1:0);
})();

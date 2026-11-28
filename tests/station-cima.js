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
  await page.addInitScript(()=>{ try{ localStorage.setItem('salem.station','cima'); }catch(e){} });
  await page.goto('http://salem.test/'); await page.waitForTimeout(300);
  await page.waitForTimeout(500);
  await page.evaluate(async()=>{ const now=Date.now(); const db=window.SALEM_WEB.db;
    await db.doc('users/u1').set({name:'Atendimento',role:'atendimento',active:true,authId:'A1'});
    const d=new Date(now+86400000); const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const base={client:{name:'Ana',phone:'92 99999-1111'},type:'retirada',channel:'presencial',date,time:'10:00',items:[{name:'Buquê',qty:1,price:10,isCustom:true,desc:'rosas'}],history:[],createdAt:now,card:'sem',pay:{method:'pix',status:'pago'},total:10,sub:10};
    await db.doc('orders/o1').set({...base,id:'o1',num:11,status:'liberado',times:{liberadoAt:now-5000}});
    await db.doc('orders/o2').set({...base,id:'o2',num:12,status:'liberado',times:{liberadoAt:now-30*60000}});
    await db.doc('orders/o3').set({...base,id:'o3',num:13,status:'liberado',skipProd:true,times:{liberadoAt:now-2000}});
    await db.doc('orders/o4').set({...base,id:'o4',num:14,status:'em_producao',times:{liberadoAt:now-60000},printed:{lib:now-50000}});
    await db.doc('orders/o5').set({...base,id:'o5',num:15,status:'liberado',times:{liberadoAt:now-60000},printed:{lib:now-50000},changedAt:now-3000}); });
  await page.waitForTimeout(5000);
  const r=await page.evaluate(()=>({ifr:[...document.querySelectorAll('iframe')].map(f=>(f.srcdoc.match(/#00(\d\d)/)||[])[1]), st:Object.fromEntries(['o1','o2','o3','o4','o5'].map(k=>[k,window.__store['orders/'+k].printed||null]))}));
  console.log(JSON.stringify(r));
  const has=x=>r.ifr.includes(x);
  ok(has('11')&&r.st.o1&&r.st.o1.lib,'cima: imprime ao liberar');
  ok(!has('12')&&!r.st.o2,'cima: liberado há 30 min é ignorado');
  ok(!has('13')&&!r.st.o3,'cima: pedido sem produção não imprime');
  ok(!has('14'),'cima: pedido já impresso não repete');
  ok(has('15')&&r.st.o5.lib>Date.now()-10000,'cima: pedido alterado reimprime');
  // liberar pela tela: sem pop-up quando a estação de cima está ligada
  await page.evaluate(async()=>{ const db=window.SALEM_WEB.db; const now=Date.now(); const d=new Date(now+86400000); const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    await db.doc('orders/o6').set({id:'o6',num:16,key:'k6',status:'rascunho',client:{name:'Bia',phone:'92 99999-2222'},type:'retirada',channel:'presencial',date,time:'11:00',items:[{name:'Buquê',qty:1,price:10,isCustom:true,desc:'girassóis'}],history:[],createdAt:now,card:'sem',pay:{method:'pix',status:'pago'},total:10,sub:10}); });
  await page.waitForTimeout(1500);
  const bt=page.getByRole('button',{name:'Liberar para produção'}); 
  if(await bt.count()){ await bt.first().click(); await page.waitForTimeout(2500);
    const pop=await page.locator('#dlg .sheet').count(); const toast=(await page.locator('#toasts').innerText()).trim();
    ok(pop===0,'liberar com a estação de cima ligada não abre o pop-up da ficha'); ok(/ficha enviada/i.test(toast),'aviso curto: '+toast.replace(/\n/g,' | ')); }
  else ok(false,'botão Liberar para produção não encontrado');
  ok(errs.length===0,'sem erros de página '+errs.join('|'));
  await b.close(); process.exit(fails?1:0);
})();

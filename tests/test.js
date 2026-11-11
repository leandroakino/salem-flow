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
  window.claude={ use: async name => name==='db'?db:name==='downloads'?{save:async(a)=>{window.__dl=a;return {status:'saved'}}}:null };
})();`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
  const closeFicha = async () => { try { await page.locator('#fch-x').click({ timeout: 1200 }); } catch (e) {} };
  const login = async n => { await btn('Trocar usuário').click(); await page.locator('.userbtn', { hasText: n }).first().click(); };

  await step('primeiro acesso', async () => {
    await page.waitForSelector('#su-name');
    await page.fill('#su-name', 'Leandro');
    await btn('Começar').click();
    await page.waitForSelector('text=Gestão da operação');
  });
  await step('login atendimento', async () => { await login('Atendimento 1'); await page.waitForSelector('text=+ Novo pedido'); });
  await step('novo pedido: bloqueio por campos', async () => {
    await btn('+ Novo pedido').click();
    await page.waitForSelector('#fo-phone');
    await btn('+ Buquê personalizado').click();
    const dis = await page.locator('#f-release').isDisabled();
    const txt = await page.locator('#f-checks').innerText();
    if (!dis) throw new Error('botão liberar deveria estar bloqueado');
    if (!/Descreva|Falta/.test(txt)) throw new Error('checks: ' + txt);
  });
  await step('preencher e liberar', async () => {
    await page.fill('#fo-phone', '92 99999-1111');
    await page.fill('#fo-name', 'Maria Teste');
    await page.locator('textarea[data-f=desc]').fill('Buquê rosa e branco, estilo campestre');
    await page.fill('input[data-f=time]', '23:30');
    await page.locator('input[data-f=card][value=com]').check();
    await page.locator('textarea[data-f=cardMsg]').fill('Feliz aniversário!');
    await page.waitForFunction(() => !document.querySelector('#f-release').disabled);
    await page.locator('#f-release').click(); await closeFicha();
    await page.waitForSelector('#form[hidden]', { state: 'attached' });
    const s = await store(); const o = s['orders/o0001'];
    if (!o || o.status !== 'liberado') throw new Error('pedido: ' + JSON.stringify(o && o.status));
    if (!s['clients/c92999991111']) throw new Error('cliente não criado');
  });
  await step('produção inicia e vai direto para pronto para subir', async () => {
    await login('Produção'); await page.waitForSelector('text=Fila de produção');
    await btn('Iniciar produção').click();
    await page.waitForFunction(() => document.body.innerText.includes('Em produção'));
    await btn('Pronto para subir').click(); await page.waitForSelector('#cm-ok');
    await page.locator('#cm-go').click(); await page.waitForTimeout(300);
    if ((await store())['orders/o0001'].status !== 'em_producao') throw new Error('subiu sem conferir');
    await page.locator('#cm-ok').check(); await page.locator('#cm-go').click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'pronto_subir');
    const s = await store();
    if (!s['orders/o0001'].stockDone) throw new Error('stockDone');
    if (!s['orders/o0001'].times.finalizadoAt || !s['orders/o0001'].times.prontoAt) throw new Error('tempos');
  });
  await step('pronto, transporte (sem "concluir transporte")', async () => {
    await btn('Iniciar transporte').click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'em_transporte');
    if (await page.getByRole('button', { name: 'Concluir transporte' }).count()) throw new Error('ainda existe concluir transporte');
  });
  await step('divergência no recebimento bloqueia conclusão', async () => {
    await login('Atendimento 1'); await btn('Receber', true).first().click().catch(()=>{});
    await page.locator('.tab', { hasText: 'Receber' }).click();
    await page.fill('#rcv-num', '1'); await btn('Conferir pedido').click();
    await page.waitForSelector('#rc-div');
    await btn('Registrar divergência').click();
    await page.waitForSelector('#askf');
    await page.selectOption('#q-type', 'produto_errado');
    await page.fill('#q-note', 'Cores diferentes do pedido');
    await btn('Registrar divergência').last().click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'divergencia');
  });
  await step('produção corrige e reenvia', async () => {
    await login('Produção');
    await btn('Corrigido, reenviar').click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'pronto_subir');
    await btn('Iniciar transporte').click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'em_transporte');
  });
  await step('recebimento ok e retirada', async () => {
    await login('Atendimento 1'); await page.locator('.tab', { hasText: 'Receber' }).click();
    await page.fill('#rcv-num', '1'); await btn('Conferir pedido').click();
    await page.waitForSelector('#rc-ok');
    await page.locator('#rc-1').check(); await page.locator('#rc-2').check();
    if (!(await page.locator('#rc-ok').isDisabled())) throw new Error('liberou sem conferir o cartão');
    await page.locator('#rc-3').check();
    await page.locator('#rc-ok').click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'recebido');
    await page.locator('.tab', { hasText: 'Entregas' }).click();
    await btn('Registrar retirada').click();
    await page.waitForSelector('#askf');
    await btn('Concluir retirada').click();
    await page.waitForFunction(() => window.__store['orders/o0001'].status === 'concluido');
    const s = await store(); const o = s['orders/o0001'];
    if (o.history.length < 10) throw new Error('histórico curto ' + o.history.length);
    const baixas = Object.values(s).filter(d => d.type === 'baixa_pedido');
    if (baixas.length !== 0) throw new Error('baixas=' + baixas.length);
  });
  await step('estoque insuficiente: conclui e fica negativo com aviso', async () => {
    // novo pedido liberado por script: zerar rosas e criar pedido buquê 6 rosas
    await page.evaluate(() => { window.__store['stock/s-rosa'].qty.producao = 2; window.__notify(); });
    await login('Atendimento 1'); await page.locator('.tab', { hasText: 'Pedidos' }).click(); await btn('+ Novo pedido').click(); await page.waitForSelector('#fo-phone');
    await page.fill('#fo-phone', '92 98888-2222'); await page.fill('#fo-name', 'João');
    await btn('+ Buquê de 6 rosas').click();
    await page.fill('input[data-f=time]', '23:00');
    await page.waitForFunction(() => !document.querySelector('#f-release').disabled);
    await page.locator('#f-release').click(); await closeFicha();
    await page.waitForFunction(() => window.__store['orders/o0002']);
    await login('Produção'); await page.locator('.tab', { hasText: 'Produção' }).click(); await btn('Iniciar produção').click();
    await page.waitForFunction(() => window.__store['orders/o0002'].status === 'em_producao');
    await btn('Pronto para subir').click(); await page.waitForSelector('#cm-ok'); await page.locator('#cm-ok').check(); await page.locator('#cm-go').click();
    await page.waitForFunction(() => window.__store['orders/o0002'].status === 'pronto_subir');
    const s = await store(); if (s['stock/s-rosa'].qty.producao !== -4) throw new Error('rosa=' + s['stock/s-rosa'].qty.producao);
    if (!s['orders/o0002'].history.some(h => h.act === 'Estoque ficou negativo')) throw new Error('sem aviso de estoque negativo');
  });
  await step('painel TV, gestão, auditoria, estoque', async () => {
    await login('Leandro');
    await page.locator('.tab', { hasText: 'Gestão' }).click(); await page.waitForSelector('text=Vendas');
    await page.locator('.tab', { hasText: 'Auditoria' }).click(); await page.waitForSelector('text=Pedido criado');
    await page.locator('.tab', { hasText: 'Estoque' }).click(); await page.waitForSelector('text=Rosa vermelha');
    await page.locator('.tab', { hasText: 'Expositor' }).click(); await page.waitForSelector('text=Conferência do expositor');
    await page.locator('.tab', { hasText: 'Cadastros' }).click(); await page.waitForSelector('text=Ficha técnica');
    await page.evaluate(() => { window.__store['orders/o0002'].photos = [{ id: 'abc' }]; window.__notify(); });
    await page.locator('.tab', { hasText: 'Painel TV' }).click(); await page.waitForSelector('#tv-here');
    if (!(await page.locator('a[href$="#tv"]').count())) throw new Error('sem link do painel');
    await page.locator('#tv-here').click(); await page.waitForSelector('.tv');
    await page.waitForSelector('.tv img.ph');
    const t = await page.locator('.tv').innerText(); if (/Maria|João/.test(t)) throw new Error('TV mostra nome de cliente');
    await page.evaluate(() => { const o = window.__store['orders/o0002']; o.items[0].desc = 'rosas vermelhas abertas'; o.buildNotes = 'laco dourado'; window.__notify(); });
    await page.waitForFunction(() => /rosas vermelhas abertas/.test(document.querySelector('.tv').innerText) && /Montagem: laco dourado/.test(document.querySelector('.tv').innerText));
  });
  await step('gaveta do pedido atualiza após clicar na ação', async () => {
    await page.getByRole('button', { name: 'Sair do painel' }).click();
    await page.locator('.tab', { hasText: 'Pedidos' }).click();
    if (!(await page.locator('#plist .col header', { hasText: 'Finalizados' }).count())) throw new Error('sem seção Finalizados');
    await page.locator('.ocard', { hasText: '#0002' }).first().click();
    await page.waitForSelector('.drawer');
    await page.locator('.drawer').getByRole('button', { name: 'Iniciar transporte' }).click();
    await page.waitForFunction(() => document.querySelector('.drawer') && document.querySelector('.drawer').innerText.includes('Receber e conferir'));
  });
  await step('aba Materiais: avisar, providenciar, receber', async () => {
    await page.keyboard.press('Escape');
    await login('Produção'); await page.locator('.tab', { hasText: 'Materiais' }).click();
    await btn('Avisar falta de material').click(); await page.waitForSelector('#askf');
    await page.selectOption('#q-sid', 's-fita'); await page.fill('#q-qty', '10');
    await btn('Avisar', true).last().click();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.status === 'aberto' && d.name === 'Fita de cetim'));
    await login('Atendimento'); await page.locator('.tab', { hasText: 'Materiais' }).click();
    await btn('Providenciado', true).first().click(); await page.waitForSelector('#askf'); await btn('Marcar providenciado').click();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.status === 'providenciado'));
    await login('Produção'); await page.locator('.tab', { hasText: 'Materiais' }).click();
    await btn('Chegou', true).first().click();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.status === 'resolvido' && d.name === 'Fita de cetim'));
    const nav = await page.locator('#nav').innerText(); if (/Aguardando materiais/.test(await page.locator('#view').innerText())) throw new Error('coluna antiga ainda aparece');
  });
  await step('produto do atendimento pula a produção e baixa o expositor', async () => {
    await page.keyboard.press('Escape'); await login('Atendimento 1'); await page.locator('.tab', { hasText: 'Pedidos' }).click();
    await btn('+ Novo pedido').click(); await page.waitForSelector('#fo-phone');
    await page.fill('#fo-phone', '92 97777-3333'); await page.fill('#fo-name', 'Ana');
    await btn('+ Caixa de chocolate').click(); await page.fill('input[data-f=time]', '22:00');
    await page.locator('input[data-f=card][value=sem]').check();
    await page.waitForFunction(() => !document.querySelector('#f-release').disabled);
    await page.locator('#f-release').click(); await closeFicha();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.skipProd && d.status === 'recebido'));
    const s = await store(); if (s['stock/s-choc'].qty.expositor !== 4) throw new Error('expositor=' + s['stock/s-choc'].qty.expositor);
  });
  await step('item avulso: Não passa pela produção', async () => {
    await btn('+ Novo pedido').click(); await page.waitForSelector('#fo-phone');
    await page.fill('#fo-phone', '92 96666-4444'); await page.fill('#fo-name', 'Beto');
    await btn('+ Item avulso').click(); await page.locator('textarea[data-f=desc]').fill('Ferrero Rocher 16 un');
    await page.fill('input[data-f=time]', '21:00'); await page.locator('input[data-f=card][value=sem]').check();
    await page.waitForFunction(() => !document.querySelector('#f-release').disabled);
    await page.locator('#f-release').click(); await closeFicha();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.client && d.client.name === 'Beto' && d.status === 'liberado'));
    await page.locator('.ocard', { hasText: 'Beto' }).first().click(); await page.waitForSelector('.drawer');
    await page.locator('.drawer').getByRole('button', { name: 'Não passa pela produção' }).click(); await page.waitForSelector('#askf');
    await btn('Enviar para retirada/entrega').click();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.client && d.client.name === 'Beto' && d.status === 'recebido' && d.skipProd));
  });
  await step('checkbox no formulário: não passa pela produção', async () => {
    await page.keyboard.press('Escape');
    await btn('+ Novo pedido').click(); await page.waitForSelector('#fo-phone');
    await page.fill('#fo-phone', '92 96666-5555'); await page.fill('#fo-name', 'Carla');
    await btn('+ Item avulso').click(); await page.locator('textarea[data-f=desc]').fill('Caixa de bombons');
    await page.fill('input[data-f=time]', '20:00'); await page.locator('input[data-f=card][value=sem]').check();
    await page.locator('input[data-f=noProd]').check();
    await page.waitForFunction(() => !document.querySelector('#f-release').disabled);
    const t = await page.locator('#f-release').innerText(); if (!/sem produ/.test(t)) throw new Error('label: ' + t);
    await page.locator('#f-release').click(); await closeFicha();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.client && d.client.name === 'Carla' && d.status === 'recebido' && d.skipProd && d.noProd));
  });
  await step('entregador: pega, entrega e fecha o fluxo', async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const st = window.__store;
      st['users/u-ent'] = { id: 'u-ent', name: 'Rui Entregador', role: 'entregador', active: true };
      const src = Object.values(st).find(d => d.client && d.client.name === 'Carla');
      st['orders/o0900'] = { ...JSON.parse(JSON.stringify(src)), id: 'o0900', num: 900, key: 'k900', type: 'entrega', address: 'Rua das Flores 10', status: 'recebido', card: 'sem', client: { name: 'Dona Marta', phone: '92 99999-1111' }, delivery: null, skipProd: false };
      window.__notify();
    });
    await login('Rui');
    await page.waitForSelector('text=Minhas entregas');
    const tabs = await page.locator('#nav .tab').allInnerTexts(); if (tabs.length !== 1) throw new Error('tabs: ' + tabs.join('|'));
    const card = page.locator('.ocard', { hasText: 'Dona Marta' }); await card.waitFor();
    if (!(await card.innerText()).includes('Rua das Flores 10')) throw new Error('sem endereço');
    await card.getByRole('button', { name: 'Peguei para entregar' }).click();
    await page.waitForFunction(() => window.__store['orders/o0900'].status === 'saiu_entrega' && window.__store['orders/o0900'].delivery.driver === 'Rui Entregador');
    await page.locator('.ocard', { hasText: 'Dona Marta' }).getByRole('button', { name: 'Entreguei' }).click(); await page.waitForSelector('#askf');
    await page.locator('#askf input').first().fill('Filha da Marta');
    await btn('Entrega confirmada').click();
    await page.waitForFunction(() => { const o = window.__store['orders/o0900']; return o.status === 'concluido' && o.outcome === 'entrega' && o.delivery.receivedBy === 'Filha da Marta' && o.delivery.driver === 'Rui Entregador'; });
    await page.waitForSelector('text=recebido por Filha da Marta');
    await login('Atendimento 1'); await page.locator('.tab', { hasText: 'Pedidos' }).click();
  });
  await step('cadastrar, escolher e remover entregador', async () => {
    await page.keyboard.press('Escape'); await login('Atendimento 1');
    await page.locator('.tab', { hasText: 'Entregadores' }).click();
    await btn('Novo entregador').click(); await page.waitForSelector('#askf');
    await page.locator('#askf input').first().fill('Tiago'); await btn('Cadastrar').click();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.name === 'Tiago' && d.role === 'entregador' && d.active));
    await page.evaluate(() => { window.__store['orders/o0901'] = { ...JSON.parse(JSON.stringify(window.__store['orders/o0900'])), id: 'o0901', num: 901, key: 'k901', status: 'recebido', outcome: null, delivery: null, client: { name: 'Seu Lauro', phone: '92 98888-2222' } }; window.__notify(); });
    await page.locator('.tab', { hasText: 'Entregas e retiradas' }).click();
    await page.locator('.ocard', { hasText: 'Seu Lauro' }).getByRole('button', { name: 'Saiu para entrega' }).click(); await page.waitForSelector('#askf select');
    const opts = await page.locator('#askf select option').allInnerTexts(); if (!opts.includes('Tiago') || !opts.includes('Rui Entregador')) throw new Error('opts ' + opts);
    await page.locator('#askf select').selectOption('Tiago'); await page.locator('#dlg').getByRole('button', { name: 'Saiu para entrega' }).click();
    await page.waitForFunction(() => window.__store['orders/o0901'].delivery.driver === 'Tiago');
    await page.locator('.tab', { hasText: 'Entregadores' }).click();
    await page.locator('tr', { hasText: 'Tiago' }).getByRole('button', { name: 'Remover' }).click();
    await page.waitForSelector('.toast, #toasts *');
    if (Object.values(await page.evaluate(() => window.__store)).find(d => d.name === 'Tiago').active === false) throw new Error('removeu com entrega em rota');
    await page.evaluate(() => { window.__store['orders/o0901'].status = 'concluido'; window.__notify(); });
    await page.locator('.tab', { hasText: 'Pedidos' }).click(); await page.locator('.tab', { hasText: 'Entregadores' }).click();
    await page.locator('tr', { hasText: 'Tiago' }).getByRole('button', { name: 'Remover' }).click(); await page.waitForSelector('#askf');
    await page.locator('#dlg').getByRole('button', { name: 'Remover' }).click();
    await page.waitForFunction(() => Object.values(window.__store).some(d => d.name === 'Tiago' && d.active === false));
  });
  await step('ficha do pedido (80 mm): tudo, menos valores', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.tab', { hasText: 'Pedidos' }).click();
    await page.locator('.ocard', { hasText: 'Beto' }).first().click(); await page.waitForSelector('.drawer');
    await page.locator('.drawer').getByRole('button', { name: 'Ficha do pedido' }).click(); await page.waitForSelector('#slip');
    const txt = await page.locator('#slip').innerText();
    if (!/SALEM FLORICULTURA/.test(txt) || !/#000\d/.test(txt)) throw new Error('ficha: ' + txt.slice(0, 80));
    if (!/Beto/.test(txt) || !/9666/.test(txt)) throw new Error('faltou cliente/telefone');
    if (/R\$/.test(txt)) throw new Error('ficha mostra valor');
    const w = await page.locator('#slip').evaluate(e => e.getBoundingClientRect().width); if (w > 304) throw new Error('largura ' + w);
    await btn('Baixar para imprimir').click();
    await page.waitForTimeout(300); if(0) console.log('DL', JSON.stringify(await page.evaluate(() => window.__dl && { f: window.__dl.filename, p: /window\.print\(\)/.test(window.__dl.data), pg: window.__dl.data.slice(0, 200) })));
    await page.waitForFunction(() => window.__dl && /ficha-\d{4}\.html/.test(window.__dl.filename) && /window\.print\(\)/.test(window.__dl.data) && /@page\{size:80mm/.test(window.__dl.data));
    await closeFicha();
  });
  await step('ao liberar, a ficha abre sozinha (entrega com endereço)', async () => {
    await page.keyboard.press('Escape');
    await btn('+ Novo pedido').click(); await page.waitForSelector('#fo-phone');
    await page.fill('#fo-phone', '92 97777-1212'); await page.fill('#fo-name', 'Dona Zuleide');
    await page.locator('input[data-f=type][value=entrega]').check(); await page.locator('textarea[data-f=address]').fill('Rua das Acácias 77, quadra 5, Adrianópolis');
    await page.fill('input[data-f=recipient]', 'Maria Helena'); await page.fill('input[data-f=recipientPhone]', '92 95555-3030');
    await btn('+ Item avulso').click(); await page.locator('textarea[data-f=desc]').fill('Buquê de rosas');
    await page.fill('input[data-f=time]', '15:00'); await page.locator('input[data-f=card][value=com]').check();
    await page.waitForFunction(() => !document.querySelector('#f-release').disabled);
    await page.locator('#f-release').click(); await page.waitForSelector('#slip');
    const txt = await page.locator('#slip').innerText();
    if (!/DESTINATARIO:\s*Maria Helena/.test(txt) || !/REMETENTE:\s*Dona Zuleide/.test(txt) || !/95555/.test(txt) || txt.indexOf('Maria Helena') > txt.indexOf('Dona Zuleide')) throw new Error('sem destinatário: ' + txt);
    if (!/Rua das Acácias 77/.test(txt) || !/ENTREGA 15:00/.test(txt) || !/Dona Zuleide/.test(txt)) throw new Error('ficha sem endereço: ' + txt);
    if (/R\$/.test(txt)) throw new Error('valor na ficha');
    await page.waitForTimeout(300); await page.locator('#slip').screenshot({ path: 'slip2.png' });
    await page.locator('#slip').screenshot({ path: 'slip.png' });
    await closeFicha();
  });
  await page.screenshot({ path: dir + '/slip.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();

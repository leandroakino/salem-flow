<script>
/* Salém Flow — adaptador Supabase: oferece ao sistema a mesma interface (db/assets/dl) usada na versão de teste. */
(function(){
const SUPABASE_URL=location.origin+'/sb'; // passa pelo túnel do próprio site (functions/sb): mais rápido e funciona em redes que bloqueiam o supabase.co
const SUPABASE_KEY='sb_publishable_WcBIbNv6K8p07Yn3hn0PzQ__Rqns3bP'; // chave pública (feita para ficar no navegador); a segurança está nas regras (RLS) do banco
if(!window.supabase){ window.SALEM_WEB={failed:true}; return; }
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const must=r=>{ if(r.error) throw r.error; return r; };
const clone=x=>JSON.parse(JSON.stringify(x));

const live={}; // cache por coleção, para emitir "snapshots" completos
function row2doc(r){ return {id:r.id,exists:true,data:()=>clone(r.data),metadata:{hasPendingWrites:false,fromCache:false}}; }

function collection(name,ord,lim){
  const q={
    orderBy:(f,d)=>collection(name,[f,d||'asc'],lim), limit:n=>collection(name,ord,n),
    doc:id=>docRef(name,id),
    onSnapshot(next,err){
      let rows=new Map(), first=true, closed=false, chan=null;
      const sorted=()=>{ let L=[...rows.values()]; if(ord){ L.sort((a,b)=>((b.at||0)-(a.at||0))); } if(lim) L=L.slice(0,lim); return L; };
      const emit=(changes)=>{ if(closed) return; const L=sorted(); const docs=L.map(row2doc);
        next({docs,size:docs.length,empty:!docs.length,metadata:{hasPendingWrites:false,fromCache:false},docChanges:()=>changes.filter(c=>docs.some(d=>d.id===c.id)||c.type==='removed').map(c=>({type:c.type,doc:c.type==='removed'?{id:c.id,data:()=>({}),metadata:{hasPendingWrites:false}}:docs.find(d=>d.id===c.id)}))}); };
      const load=async()=>{
        let b=sb.from(name).select('id,data,at'); if(ord) b=b.order('at',{ascending:false,nullsFirst:false}); if(lim) b=b.limit(lim);
        const r=await b; if(r.error){ if(err) err(r.error); return; }
        const next_=new Map(r.data.map(x=>[x.id,x])); const ch=[];
        next_.forEach((v,id)=>{ if(!rows.has(id)) ch.push({type:'added',id}); else if(JSON.stringify(rows.get(id).data)!==JSON.stringify(v.data)) ch.push({type:'modified',id}); });
        rows.forEach((v,id)=>{ if(!next_.has(id)) ch.push({type:'removed',id}); });
        rows=next_; if(first||ch.length){ emit(ch); } first=false;
      };
      load();
      chan=sb.channel('rt-'+name+'-'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'*',schema:'public',table:name},p=>{
        if(p.eventType==='DELETE'){ const id=p.old&&p.old.id; if(rows.delete(id)) emit([{type:'removed',id}]); return; }
        const n=p.new; const had=rows.has(n.id); rows.set(n.id,{id:n.id,data:n.data,at:n.data&&n.data.at!=null?Number(n.data.at):null}); emit([{type:had?'modified':'added',id:n.id}]);
      }).subscribe(st=>{ if(st==='SUBSCRIBED'&&!first) load(); });
      const poll=setInterval(load,20000); const vis=()=>{ if(!document.hidden) load(); }; document.addEventListener('visibilitychange',vis); window.addEventListener('online',vis);
      (live[name]=live[name]||[]).push(load);
      return ()=>{ closed=true; clearInterval(poll); document.removeEventListener('visibilitychange',vis); window.removeEventListener('online',vis); sb.removeChannel(chan); };
    }
  };
  return q;
}
const refresh=name=>(live[name]||[]).forEach(f=>f());
function docRef(c,id){
  return {id,path:c+'/'+id,
    async get(){ const r=must(await sb.from(c).select('id,data').eq('id',id).maybeSingle()); return r.data?{...row2doc(r.data)}:{id,exists:false,data:()=>undefined}; },
    async set(d){ must(await sb.from(c).upsert({id,data:clone(d),updated_at:new Date().toISOString()})); refresh(c); },
    async update(d){ must(await sb.rpc('doc_update',{p_coll:c,p_id:id,p:clone(d)})); refresh(c); },
    async delete(){ must(await sb.from(c).delete().eq('id',id)); refresh(c); }
  };
}
const db={ doc:p=>{ const [c,id]=p.split('/'); return docRef(c,id); }, collection:n=>collection(n,null,null) };

// fotos: enviadas para a pasta "fotos"; o "id" guardado no pedido é o caminho do arquivo
const assets={ async upload(file){
  const ext=(file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.type==='image/gif'?'gif':'jpg');
  const id=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2))+'.'+ext;
  must(await sb.storage.from('fotos').upload(id,file,{contentType:file.type||'image/jpeg',cacheControl:'31536000',upsert:false}));
  return {id};
} };
const dl={ async save({filename,data}){
  const blob=new Blob([data],{type:/\.html$/.test(filename)?'text/html;charset=utf-8':'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500); return {status:'saved'};
} };
const photoURL=id=>SUPABASE_URL+'/storage/v1/object/public/fotos/'+encodeURIComponent(id);
window.SALEM_WEB={sb,db,assets,dl,photoURL,url:SUPABASE_URL,key:SUPABASE_KEY,createClient:window.supabase.createClient};
})();
</script>

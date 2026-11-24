// Túnel para o Supabase: o navegador fala com /sb/... (mesmo endereço do sistema) e o Cloudflare repassa ao banco.
// Serve para redes que não alcançam *.supabase.co diretamente. Só repassa para o projeto salem-flow-sp.
const TARGET = 'https://ckdxemisvchffwkmqvyv.supabase.co';
const OK = /^\/(auth|rest|realtime|storage)\/v1(\/|$)/;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/sb/, '') || '/';
  if (!OK.test(path)) return new Response('Não encontrado', { status: 404 });
  // repassa método, cabeçalhos, corpo e também conexões em tempo real (WebSocket)
  return fetch(new Request(TARGET + path + url.search, request));
}

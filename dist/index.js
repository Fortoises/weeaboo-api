// @bun
var{serve:I}=globalThis.Bun;import s from"axios";import{load as F}from"cheerio";import m from"fuse.js";var G="https://samehadaku.now/",U="/anime-terbaru/";var P=s.create({baseURL:G,headers:{"User-Agent":"Mozilla/5.0 (Windows NT)"}});async function S(J,p=3,n=2000){for(let y=0;y<p;y++)try{return await J()}catch(T){if(T.response?.status===429&&y<p-1)await new Promise((O)=>setTimeout(O,n));else throw T}}var H=()=>S(()=>P.get(U)).then(({data:J})=>{let p=F(J),n=[],y=p(".thumb").toArray(),T=p(".dtla").toArray(),O=Math.min(y.length,T.length);for(let C=0;C<O;C++){let j=p(y[C]),w=p(T[C]),g=w.text().replace(/\s+/g," ").trim(),K=g,f=g.match(/^(.*?)(?:Episode|Posted by:|Released on:)/i);if(f&&typeof f[1]==="string")K=f[1].trim();let V="",q=g.match(/Released on: ([^\n]+)/i);if(q&&typeof q[1]==="string")V=q[1].trim();let X=j.attr("url")||j.find("a").attr("href")||w.attr("url")||w.find("a").attr("href")||"",Q="";try{if(X)Q=new URL(X,G).pathname.replace(/^\/anime\//,"").replace(/\/$/,"")}catch{}let Z=j.find("img").attr("src")||j.attr("cover")||"";if(K&&X&&Z)n.push({title:K,cover:Z,videoID:Q,releaseDate:V})}return n}),_=()=>S(()=>P.get("/")).then(({data:J})=>{let p=F(J);return p(".topten-animesu li").map((y,T)=>{let O=p(T).find("a .judul").text().trim(),C=p(T).find("a").attr("href")||"",j=p(T).find("img").attr("src")||"",w="";try{if(C)w=new URL(C,G).pathname.replace(/^\/anime\//,"").replace(/\/$/,"")}catch{}return{title:O,cover:j,videoID:w}}).get()});var k=async(J)=>{let{data:p}=await S(()=>P.get("/",{params:{s:J}})),n=F(p),y=[];n("article .animepost").each((C,j)=>{let w=n(j).find(".title").text().trim(),g=n(j).find("a").attr("href")||"",K=n(j).find("img").attr("src")||"",f="";try{if(g)f=new URL(g,G).pathname.replace(/^\/anime\//,""),f=f.replace(/\/$/,"")}catch{}if(w&&g)y.push({title:w,url:g,cover:K,videoID:f})});let O=new m(y,{keys:["title"],threshold:0.5}).search(J);return O.length?O.map((C)=>C.item):y},R=async(J)=>S(()=>P.get(J)).then(({data:p})=>{let n=F(p),y=[];for(let T of n("#server ul li div")){let O=n(T);y.push({post:O.attr("data-post"),name:O.text().trim(),nume:O.attr("data-nume"),type:O.attr("data-type")})}return y}),b=({name:J,...p})=>{let n=new FormData;n.append("action","player_ajax");for(let y of Object.keys(p))n.append(y,p[y]);return S(()=>P.post("wp-admin/admin-ajax.php",n)).then(({data:y})=>{return F(y)("iframe").attr("src")})};async function z(J,p){try{let n=await H();return new Response(JSON.stringify({data:n}),{headers:{"Content-Type":"application/json"}})}catch(n){return new Response(JSON.stringify({error:n.message}),{status:500,headers:{"Content-Type":"application/json"}})}}async function A(J,p){try{let n=await H();return new Response(JSON.stringify({data:n}),{headers:{"Content-Type":"application/json"}})}catch(n){return new Response(JSON.stringify({error:n.message}),{status:500,headers:{"Content-Type":"application/json"}})}}async function L(J,p){let n=p.searchParams.get("q");if(!n)return new Response(JSON.stringify({error:"Missing query parameter 'q'"}),{status:400,headers:{"Content-Type":"application/json"}});try{let y=await k(n);return new Response(JSON.stringify({data:y}),{headers:{"Content-Type":"application/json"}})}catch(y){return new Response(JSON.stringify({error:y.message}),{status:500,headers:{"Content-Type":"application/json"}})}}import o from"axios";import{load as D}from"cheerio";async function W(J,p){let y=p.pathname.match(/^\/anime\/([^/?#]+)/)?.[1];if(!y)return new Response(JSON.stringify({error:"Missing or invalid Samehadaku slug"}),{status:400,headers:{"Content-Type":"application/json"}});try{let T=`${G}anime/${y}`,{data:O}=await o.get(T,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT)"}}),C=D(O),j=C(".infoanime .entry-title").text().trim().replace(/^Nonton Anime /,""),w=C(".sinopsis").text().trim(),g=C(".genre-info a").map((x,N)=>C(N).text().trim()).get(),K=C(".infoanime .thumb img").attr("src"),f=K,V={};C(".spe span").each((x,N)=>{let Y=C(N).text().replace(/[:\uFF1A]/g,"").trim(),E=C(N).next().text().trim();if(Y&&E)V[Y]=E});let q=C(".epsleft a").map((x,N)=>{return{title:C(N).text().trim(),videoID:new URL(C(N).attr("href"),G).pathname}}).get();q=q.slice().reverse();let X=p.searchParams.get("episode"),Q=null;if(q.length>0){let x=q.length-1;if(X){let N=parseInt(X,10)-1;if(!isNaN(N)&&N>=0&&N<q.length)x=N}Q=q[x]}let Z=null,M={};if(Q){let x=await R(Q.videoID);M.servers=x,Z=await Promise.all(x.map(async(N)=>{if(N.nume&&typeof N.nume==="string")try{let Y=await b(N);return{name:N.name,src:Y}}catch(Y){return{name:N.name,src:null,error:Y.message}}else return{name:N.name,src:null,error:"Invalid server"}}))}return new Response(JSON.stringify({slug:y,title:j,description:w,genres:g,coverImage:K,bannerImage:f,...V,episodes:q,selectedEpisode:Q,embed:Z,debug:M,url:T}),{headers:{"Content-Type":"application/json"}})}catch(T){return new Response(JSON.stringify({error:T.message}),{status:500,headers:{"Content-Type":"application/json"}})}}async function B(J,p){try{let n=await _();return new Response(JSON.stringify({data:n}),{headers:{"Content-Type":"application/json"}})}catch(n){return new Response(JSON.stringify({error:n.message}),{status:500,headers:{"Content-Type":"application/json"}})}}var a=`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Animbus API Documentation</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f9f9f9; color: #222; margin: 0; padding: 0; }
    .container { max-width: 800px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px; }
    h1 { color: #2b6cb0; }
    h2 { color: #2b6cb0; margin-top: 2em; }
    code, pre { background: #f4f4f4; border-radius: 4px; padding: 2px 6px; }
    pre { padding: 12px; overflow-x: auto; }
    .endpoint { margin-bottom: 2em; }
    .method { font-weight: bold; color: #3182ce; }
    .path { font-family: monospace; color: #2d3748; }
    .desc { margin-bottom: 0.5em; }
    .example { margin: 0.5em 0 1em 0; }
    .footer { margin-top: 3em; color: #888; font-size: 0.95em; }
    @media (max-width: 600px) { .container { padding: 12px; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Animbus API</h1>
    <p>API modern untuk scraping anime dari Samehadaku. Cepat, modular, siap untuk frontend/bot.</p>
    <h2>Endpoints</h2>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path">/home</span>
      <div class="desc">Daftar anime terbaru dari Samehadaku</div>
      <div class="example"><b>Contoh:</b>
        <pre>{
  "data": [
    { "title": "Jujutsu Kaisen", "cover": "https://...", "videoID": "jujutsu-kaisen", "releaseDate": "" },
    ...
  ]
}</pre>
      </div>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path">/top</span>
      <div class="desc">Daftar anime populer dari Samehadaku (top anime)</div>
      <div class="example"><b>Contoh:</b>
        <pre>{ "data": [ ... ] }</pre>
      </div>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path">/ongoing</span>
      <div class="desc">Daftar anime yang sedang tayang (ongoing) dari Samehadaku</div>
      <div class="example"><b>Contoh:</b>
        <pre>{ "data": [ ... ] }</pre>
      </div>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path">/search?q=keyword</span>
      <div class="desc">Fuzzy search anime berdasarkan judul (menggunakan Fuse.js)</div>
      <div class="example"><b>Contoh:</b>
        <pre>{ "data": [ ... ] }</pre>
      </div>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path">/anime/:slug</span>
      <div class="desc">Detail anime + daftar episode + semua link embed untuk episode terpilih dari Samehadaku.</div>
      <div class="example"><b>Contoh:</b>
        <pre>{
  "slug": "jujutsu-kaisen-season-2",
  "title": "Jujutsu Kaisen Season 2",
  "description": "...",
  "genres": ["Action", "Supernatural"],
  "coverImage": "https://...",
  "episodes": [ { "title": "Episode 1", "videoID": "/jujutsu-kaisen-s2-episode-1-subtitle-indonesia/" }, ... ],
  "selectedEpisode": { "title": "Episode 3", "videoID": "/jujutsu-kaisen-s2-episode-3-subtitle-indonesia/" },
  "embed": [ { "name": "Blogger 360p", "src": "https://..." }, ... ]
}</pre>
      </div>
    </div>
    <h2>Error Handling</h2>
    <p>Semua endpoint akan mengembalikan <code>{ "error": "..." }</code> dengan status 400/500 jika terjadi error atau parameter tidak valid.</p>
    <h2>Jalankan API</h2>
    <pre>bun run build
bun run start</pre>
    <div class="footer">
      &copy; 2025 Animbus API &mdash; <a href="https://samehadaku.now" target="_blank">Samehadaku</a> | <b>Open Source</b>
    </div>
  </div>
</body>
</html>
`,c=[{path:"/home",method:"GET",handler:z},{path:"/top",method:"GET",handler:B},{path:"/ongoing",method:"GET",handler:A},{path:"/search",method:"GET",handler:L},{path:/^\/anime\/(.+)/,method:"GET",handler:W}];I({port:3000,fetch(J){let p=new URL(J.url),n=p.pathname,y=J.method;if(n==="/"&&y==="GET")return new Response(a,{headers:{"Content-Type":"text/html; charset=utf-8"}});for(let T of c)if(T.method===y&&(typeof T.path==="string"&&T.path===n||T.path instanceof RegExp&&T.path.test(n)))return T.handler(J,p);return new Response(JSON.stringify({error:"Not found"}),{status:404,headers:{"Content-Type":"application/json"}})}});console.log("\uD83D\uDE80 API server running at http://localhost:3000");

// @bun @bun-cjs
(function(exports, require, module, __filename, __dirname) {var h=Object.create;var{getPrototypeOf:v,defineProperty:_,getOwnPropertyNames:t}=Object;var r=Object.prototype.hasOwnProperty;var z=(C,y,n)=>{n=C!=null?h(v(C)):{};let p=y||!C||!C.__esModule?_(n,"default",{value:C,enumerable:!0}):n;for(let T of t(C))if(!r.call(p,T))_(p,T,{get:()=>C[T],enumerable:!0});return p};var c=globalThis.Bun;var R=z(require("axios")),Z=require("cheerio"),b=z(require("fuse.js"));var G="https://samehadaku.now/",k="/anime-terbaru/";var P=R.default.create({baseURL:G,headers:{"User-Agent":"Mozilla/5.0 (Windows NT)"}});async function S(C,y=3,n=2000){for(let p=0;p<y;p++)try{return await C()}catch(T){if(T.response?.status===429&&p<y-1)await new Promise((O)=>setTimeout(O,n));else throw T}}var H=()=>S(()=>P.get(k)).then(({data:C})=>{let y=Z.load(C),n=[],p=y(".thumb").toArray(),T=y(".dtla").toArray(),O=Math.min(p.length,T.length);for(let J=0;J<O;J++){let j=y(p[J]),w=y(T[J]),g=w.text().replace(/\s+/g," ").trim(),K=g,f=g.match(/^(.*?)(?:Episode|Posted by:|Released on:)/i);if(f&&typeof f[1]==="string")K=f[1].trim();let V="",q=g.match(/Released on: ([^\n]+)/i);if(q&&typeof q[1]==="string")V=q[1].trim();let X=j.attr("url")||j.find("a").attr("href")||w.attr("url")||w.find("a").attr("href")||"",Q="";try{if(X)Q=new URL(X,G).pathname.replace(/^\/anime\//,"").replace(/\/$/,"")}catch{}let F=j.find("img").attr("src")||j.attr("cover")||"";if(K&&X&&F)n.push({title:K,cover:F,videoID:Q,releaseDate:V})}return n}),s=()=>S(()=>P.get("/")).then(({data:C})=>{let y=Z.load(C);return y(".topten-animesu li").map((p,T)=>{let O=y(T).find("a .judul").text().trim(),J=y(T).find("a").attr("href")||"",j=y(T).find("img").attr("src")||"",w="";try{if(J)w=new URL(J,G).pathname.replace(/^\/anime\//,"").replace(/\/$/,"")}catch{}return{title:O,cover:j,videoID:w}}).get()});var m=async(C)=>{let{data:y}=await S(()=>P.get("/",{params:{s:C}})),n=Z.load(y),p=[];n("article .animepost").each((J,j)=>{let w=n(j).find(".title").text().trim(),g=n(j).find("a").attr("href")||"",K=n(j).find("img").attr("src")||"",f="";try{if(g)f=new URL(g,G).pathname.replace(/^\/anime\//,""),f=f.replace(/\/$/,"")}catch{}if(w&&g)p.push({title:w,url:g,cover:K,videoID:f})});let O=new b.default(p,{keys:["title"],threshold:0.5}).search(C);return O.length?O.map((J)=>J.item):p},o=async(C)=>S(()=>P.get(C)).then(({data:y})=>{let n=Z.load(y),p=[];for(let T of n("#server ul li div")){let O=n(T);p.push({post:O.attr("data-post"),name:O.text().trim(),nume:O.attr("data-nume"),type:O.attr("data-type")})}return p}),D=({name:C,...y})=>{let n=new FormData;n.append("action","player_ajax");for(let p of Object.keys(y))n.append(p,y[p]);return S(()=>P.post("wp-admin/admin-ajax.php",n)).then(({data:p})=>{return Z.load(p)("iframe").attr("src")})};async function A(C,y){try{let n=await H();return new Response(JSON.stringify({data:n}),{headers:{"Content-Type":"application/json"}})}catch(n){return new Response(JSON.stringify({error:n.message}),{status:500,headers:{"Content-Type":"application/json"}})}}async function L(C,y){try{let n=await H();return new Response(JSON.stringify({data:n}),{headers:{"Content-Type":"application/json"}})}catch(n){return new Response(JSON.stringify({error:n.message}),{status:500,headers:{"Content-Type":"application/json"}})}}async function W(C,y){let n=y.searchParams.get("q");if(!n)return new Response(JSON.stringify({error:"Missing query parameter 'q'"}),{status:400,headers:{"Content-Type":"application/json"}});try{let p=await m(n);return new Response(JSON.stringify({data:p}),{headers:{"Content-Type":"application/json"}})}catch(p){return new Response(JSON.stringify({error:p.message}),{status:500,headers:{"Content-Type":"application/json"}})}}var I=z(require("axios")),a=require("cheerio");async function B(C,y){let p=y.pathname.match(/^\/anime\/([^/?#]+)/)?.[1];if(!p)return new Response(JSON.stringify({error:"Missing or invalid Samehadaku slug"}),{status:400,headers:{"Content-Type":"application/json"}});try{let T=`${G}anime/${p}`,{data:O}=await I.default.get(T,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT)"}}),J=a.load(O),j=J(".infoanime .entry-title").text().trim().replace(/^Nonton Anime /,""),w=J(".sinopsis").text().trim(),g=J(".genre-info a").map((x,N)=>J(N).text().trim()).get(),K=J(".infoanime .thumb img").attr("src"),f=K,V={};J(".spe span").each((x,N)=>{let Y=J(N).text().replace(/[:\uFF1A]/g,"").trim(),U=J(N).next().text().trim();if(Y&&U)V[Y]=U});let q=J(".epsleft a").map((x,N)=>{return{title:J(N).text().trim(),videoID:new URL(J(N).attr("href"),G).pathname}}).get();q=q.slice().reverse();let X=y.searchParams.get("episode"),Q=null;if(q.length>0){let x=q.length-1;if(X){let N=parseInt(X,10)-1;if(!isNaN(N)&&N>=0&&N<q.length)x=N}Q=q[x]}let F=null,M={};if(Q){let x=await o(Q.videoID);M.servers=x,F=await Promise.all(x.map(async(N)=>{if(N.nume&&typeof N.nume==="string")try{let Y=await D(N);return{name:N.name,src:Y}}catch(Y){return{name:N.name,src:null,error:Y.message}}else return{name:N.name,src:null,error:"Invalid server"}}))}return new Response(JSON.stringify({slug:p,title:j,description:w,genres:g,coverImage:K,bannerImage:f,...V,episodes:q,selectedEpisode:Q,embed:F,debug:M,url:T}),{headers:{"Content-Type":"application/json"}})}catch(T){return new Response(JSON.stringify({error:T.message}),{status:500,headers:{"Content-Type":"application/json"}})}}async function E(C,y){try{let n=await s();return new Response(JSON.stringify({data:n}),{headers:{"Content-Type":"application/json"}})}catch(n){return new Response(JSON.stringify({error:n.message}),{status:500,headers:{"Content-Type":"application/json"}})}}var i=`
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
`,$=[{path:"/home",method:"GET",handler:A},{path:"/top",method:"GET",handler:E},{path:"/ongoing",method:"GET",handler:L},{path:"/search",method:"GET",handler:W},{path:/^\/anime\/(.+)/,method:"GET",handler:B}];c.serve({port:3000,fetch(C){let y=new URL(C.url),n=y.pathname,p=C.method;if(n==="/"&&p==="GET")return new Response(i,{headers:{"Content-Type":"text/html; charset=utf-8"}});for(let T of $)if(T.method===p&&(typeof T.path==="string"&&T.path===n||T.path instanceof RegExp&&T.path.test(n)))return T.handler(C,y);return new Response(JSON.stringify({error:"Not found"}),{status:404,headers:{"Content-Type":"application/json"}})}});console.log("\uD83D\uDE80 API server running at http://localhost:3000");})

import { serve } from "bun";

// Import handler dari routes (nanti diisi implementasi)
import homeHandler from "./samehadaku/routes/home.route";
import ongoingHandler from "./samehadaku/routes/ongoing.route";
import searchHandler from "./samehadaku/routes/search.route";
import animeHandler from "./samehadaku/routes/anime.route";
import topHandler from "./samehadaku/routes/top.route";

const apiDocsHtml = `
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
`;

const router = [
  {
    path: "/home",
    method: "GET",
    handler: homeHandler,
  },
  {
    path: "/top",
    method: "GET",
    handler: topHandler,
  },
  {
    path: "/ongoing",
    method: "GET",
    handler: ongoingHandler,
  },
  {
    path: "/search",
    method: "GET",
    handler: searchHandler,
  },
  {
    path: /^\/anime\/(.+)/,
    method: "GET",
    handler: animeHandler,
  },
];

serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;
    if (pathname === "/" && method === "GET") {
      return new Response(apiDocsHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    for (const route of router) {
      if (
        route.method === method &&
        ((typeof route.path === "string" && route.path === pathname) ||
          (route.path instanceof RegExp && route.path.test(pathname)))
      ) {
        return route.handler(req, url);
      }
    }
    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },
});

console.log("🚀 API server running at http://localhost:3000");

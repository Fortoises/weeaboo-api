import axios from "axios";
import { load } from "cheerio";
import type * as cheerio from "cheerio";
import { db } from "./db";
import { telegramBackup } from "./telegram";

const axiosInstance = axios.create({
  baseURL: "https://samehadaku.now/",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT)"
  }
});

export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  
  // /anime:slug/episode:slug
  if (pathname.startsWith("/anime") && pathname.includes("/episode")) {
    const parts = pathname.split("/");
    const animeSlug = parts[2];
    const episodeSlug = parts[4];
    if (!animeSlug || !episodeSlug) {
      return new Response("Invalid URL", { status: 400 });
    }
    return await getAnimeEpisodeDetailRealtime(animeSlug, episodeSlug);
  }
  
  // /anime:slug/scrape-episodes (untuk scraping episode on-demand)
  if (pathname.startsWith("/anime") && pathname.includes("/scrape-episodes")) {
    const parts = pathname.split("/");
    const animeSlug = parts[2];
    if (!animeSlug) {
      return new Response("Invalid URL", { status: 400 });
    }
    return await scrapeAnimeEpisodesOnDemand(animeSlug);
  }
  
  // /anime:slug
  if (pathname.startsWith("/anime")) {
    const slug = pathname.split("/")[2];
    if (!slug) {
      return new Response("Invalid URL", { status: 400 });
    }
    const detail = await getAnimeDetailRealtime(slug);
    if (!detail) return new Response("Anime not found", { status: 404 });
    return Response.json(detail);
  }
  
  // /home
  if (pathname === "/home") {
    return await getHomeRealtime();
  }
  
  // /search?q=keyword
  if (pathname === "/search") {
    const keyword = url.searchParams.get("q") || "";
    return searchAnime(keyword);
  }
  
  // Debug database endpoint
  if (pathname === "/debug/db") {
    const totalAnime = db.query(`SELECT COUNT(*) as count FROM anime`).get() as any;
    const totalGenre = db.query(`SELECT COUNT(*) as count FROM anime_genre`).get() as any;
    const sampleAnime = db.query(`SELECT * FROM anime LIMIT 3`).all() as any[];
    const sampleGenre = db.query(`SELECT * FROM anime_genre LIMIT 3`).all() as any[];
    
    return Response.json({
      total_anime: totalAnime.count,
      total_genre_entries: totalGenre.count,
      sample_anime: sampleAnime,
      sample_genre: sampleGenre
    });
  }
  
  // Backup system monitoring endpoint
  if (pathname === "/debug/backup") {
    const { telegramBackup } = await import("./telegram");
    const queueStatus = telegramBackup.getQueueStatus();
    
    return Response.json({
      backup_system: {
        queue_length: queueStatus.length,
        is_processing: queueStatus.isProcessing,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  // Smart rate limiter monitoring endpoint
  if (pathname === "/debug/rate-limiter") {
    const { smartRateLimiter } = await import("./scraper");
    const status = smartRateLimiter.getStatus();
    
    return Response.json({
      smart_rate_limiter: {
        request_count: status.requestCount,
        consecutive_errors: status.consecutiveErrors,
        success_streak: status.successStreak,
        error_streak: status.errorStreak,
        error_rate: status.errorRate,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  // /genres (untuk mendapatkan daftar genre) - HARUS SEBELUM /genre/:genre
  if (pathname === "/genres") {
    return getAvailableGenres();
  }
  
  // /genre/:genre?page=1
  if (pathname.startsWith("/genre")) {
    const parts = pathname.split("/");
    const genre = parts[2];
    
    if (!genre) {
      return new Response("Genre not specified", { status: 400 });
    }
    
    return await getAnimeByGenre(genre);
  }
  
  // /stats
  if (pathname === "/stats") {
    return getDatabaseStats();
  }
  
  // /telegram/test
  if (pathname === "/telegram/test") {
    return testTelegramConnection();
  }
  
  // /telegram/backup
  if (pathname === "/telegram/backup") {
    return triggerManualBackup();
  }
  
  // /telegram/senddb
  if (pathname === "/telegram/senddb") {
    return sendDatabaseFileToTelegram();
  }
  
  // /test/genre/:genre - untuk test scraping genre manual
  if (pathname.startsWith("/test/genre")) {
    const parts = pathname.split("/");
    const genre = parts[3];
    
    if (!genre) {
      return new Response("Genre not specified", { status: 400 });
    }
    
    return await testGenreScraping(genre);
  }
  
  // /test/save/:genre - untuk test penyimpanan database
  if (pathname.startsWith("/test/save")) {
    const parts = pathname.split("/");
    const genre = parts[3];
    
    if (!genre) {
      return new Response("Genre not specified", { status: 400 });
    }
    
    return await testDatabaseSave(genre);
  }
  
  return new Response("Not found", { status: 404 });
}

function getAnimeBySlug(slug: string): Response {
  const anime = db.query("SELECT * FROM anime WHERE slug = ?").get(slug) as any;
  if (!anime) {
    return new Response("Anime not found", { status: 404 });
  }
  
  const episodes = db.query("SELECT * FROM episode WHERE anime_id = ? ORDER BY episode_number").all(anime.id);
  
  return Response.json({
    ...anime,
    episodes: episodes
  });
}

async function getAnimeDetailRealtime(slug: string): Promise<any> {
  try {
    const { data } = await axiosInstance.get(`/anime/${slug}`);
    const $ = load(data);
    
    // Ambil detail anime
    const title = $("h2.entry-title").text().trim().replace("Nonton Anime ", "");
    const synopsis = $(".desc p").text().trim();
    const ratingText = $(".rt").text().trim();
    const rating = parseFloat(ratingText.split("/")[0]?.trim()) || 0;
    const speText = $(".spe").text().trim();
    const statusMatch = speText.match(/Status\s+(\w+)/);
    const typeMatch = speText.match(/Type\s+(\w+)/);
    const status = statusMatch ? statusMatch[1] : "Ongoing";
    const type = typeMatch ? typeMatch[1] : "TV";
    
    // Tambahkan studio dan producers
    const studioMatch = speText.match(/Studio\s+([^\n\r]+)/);
    const producersMatch = speText.match(/Producers?\s+([^\n\r]+)/);
    const studio = studioMatch?.[1]?.trim() || null;
    const producers = producersMatch?.[1]?.trim() || null;
    // Genre array - perbaiki parsing agar tidak memotong kata-kata
    const genreRaw = $(".genre-info").text().trim();
    let genre: string[] = [];
    
    if (genreRaw) {
      // Gunakan pendekatan yang lebih tepat untuk memisahkan genre
      // Pertama, handle kasus khusus dengan urutan yang tepat
      let processedText = genreRaw
        .replace(/Slice of Life/g, "SliceOfLife")
        .replace(/Sci-Fi/g, "SciFi")
        .replace(/Super Power/g, "SuperPower")
        .replace(/Team Sports/g, "TeamSports");
      
      // Kemudian split berdasarkan huruf kapital dengan penanganan khusus
      const genreParts = processedText
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/\s+/)
        .map(g => g.trim())
        .filter(Boolean);
      
      // Restore nama genre yang benar dan gabungkan yang terpotong
      const restoredGenre: string[] = [];
      for (let i = 0; i < genreParts.length; i++) {
        const part = genreParts[i];
        
        switch(part) {
          case "SliceOfLife": 
            restoredGenre.push("Slice of Life");
            break;
          case "SciFi": 
            restoredGenre.push("Sci-Fi");
            break;
          case "SuperPower": 
            restoredGenre.push("Super Power");
            break;
          case "TeamSports": 
            restoredGenre.push("Team Sports");
            break;
          case "Slice":
            // Cek apakah ada "Of" dan "Life" setelahnya
            if (genreParts[i + 1] === "Of" && genreParts[i + 2] === "Life") {
              restoredGenre.push("Slice of Life");
              i += 2; // Skip "Of" dan "Life"
            } else {
              restoredGenre.push(part);
            }
            break;
          case "Sci":
            // Cek apakah ada "Fi" setelahnya
            if (genreParts[i + 1] === "Fi") {
              restoredGenre.push("Sci-Fi");
              i += 1; // Skip "Fi"
            } else {
              restoredGenre.push(part);
            }
            break;
          case "Super":
            // Cek apakah ada "Power" setelahnya
            if (genreParts[i + 1] === "Power") {
              restoredGenre.push("Super Power");
              i += 1; // Skip "Power"
            } else {
              restoredGenre.push(part);
            }
            break;
          case "Team":
            // Cek apakah ada "Sports" setelahnya
            if (genreParts[i + 1] === "Sports") {
              restoredGenre.push("Team Sports");
              i += 1; // Skip "Sports"
            } else {
              restoredGenre.push(part);
            }
            break;
          default:
            restoredGenre.push(part);
        }
      }
      
      genre = [...new Set(restoredGenre)];
    }
    // Episode parsing - perbaiki untuk handle anime dengan 1 episode atau special/movie
    const episodes: any[] = [];
    $(".epsleft").each((index: number, el: any) => {
      const href = $(el).find("a").attr("href");
      if (href) {
        const episodeSlug = href.split("/").filter(Boolean).pop() || "";
        if (episodeSlug) {
          // Coba pattern episode biasa dulu
          let episodeMatch = episodeSlug.match(/episode-(\d+)/);
          let episodeNumber = 1; // Default untuk special/movie
          
          if (episodeMatch) {
            // Episode biasa dengan nomor
            episodeNumber = parseInt(episodeMatch[1]);
          } else {
            // Cek apakah ini special/movie/ova yang tidak punya nomor episode
            const specialPatterns = [
              /movie/i,
              /special/i,
              /ova/i,
              /ona/i,
              /tv-special/i,
              /web/i
            ];
            
            const isSpecial = specialPatterns.some(pattern => episodeSlug.match(pattern));
            if (isSpecial) {
              episodeNumber = 1; // Special/movie dianggap episode 1
            } else {
              // Coba pattern lain untuk episode tanpa nomor
              const noNumberMatch = episodeSlug.match(/(\d+)/);
              if (noNumberMatch) {
                episodeNumber = parseInt(noNumberMatch[1]);
              } else {
                // Jika tidak ada pattern yang cocok, anggap episode 1
                episodeNumber = 1;
              }
            }
          }
          
          episodes.push({
            episode_number: episodeNumber,
            title: `${title} ${episodeNumber === 1 && !episodeMatch ? 'Special' : `Episode ${episodeNumber}`}`,
            slug: episodeSlug,
            url: href
          });
        }
      }
    });
    return {
      slug,
      title,
      synopsis,
      status,
      type,
      rating,
      genre,
      studio,
      producers,
      episodes: episodes.sort((a, b) => a.episode_number - b.episode_number)
    };
  } catch (e) {
    console.error("Error fetching anime detail:", e);
    return null;
  }
}

async function getAnimeEpisodeDetailRealtime(animeSlug: string, episodeSlug: string): Promise<Response> {
  console.log(`[ROUTES] User mengakses episode: ${animeSlug}/${episodeSlug}`);
  
  // Scrap detail anime
  const anime = await getAnimeDetailRealtime(animeSlug);
  if (!anime) return new Response("Anime not found", { status: 404 });
  // Cari episode
  const episode = anime.episodes.find((ep: any) => ep.slug === episodeSlug);
  if (!episode) return new Response("Episode not found", { status: 404 });

  // Cek di database
  const dbEpisode = db.query("SELECT * FROM episode WHERE slug = ?").get(episodeSlug) as any;
  
  if (dbEpisode) {
    console.log(`[ROUTES] Episode ditemukan di database: ${episodeSlug}`);
    
    // Ambil semua embed dari database
    const dbEmbeds = db.query(`
      SELECT server, resolution, embed_url 
      FROM episode_embed 
      WHERE episode_id = ? AND is_active = 1 
      ORDER BY 
        CASE 
          WHEN resolution IS NULL THEN 0 
          ELSE CAST(REPLACE(REPLACE(resolution, 'p', ''), 'P', '') AS INTEGER) 
        END DESC,
        server ASC
    `).all(dbEpisode.id) as any[];
    
    if (dbEmbeds.length > 0) {
      console.log(`[ROUTES] Menggunakan ${dbEmbeds.length} embed dari database untuk ${anime.title} Episode ${episode.episode_number}`);
      
      return Response.json({
        anime: {
          slug: anime.slug,
          title: anime.title,
          synopsis: anime.synopsis,
          status: anime.status,
          type: anime.type,
          rating: anime.rating,
          genre: anime.genre,
          studio: anime.studio,
          producers: anime.producers
        },
        episode: {
          episode_number: episode.episode_number,
          title: episode.title,
          slug: episode.slug,
          embeds: dbEmbeds
        }
      });
    }
  }

  // Jika tidak ada di database atau tidak ada embed, scrap realtime
  console.log(`[ROUTES] Episode belum ada di database atau tidak ada embed, mulai scraping realtime: ${episodeSlug}`);
  
  let embeds: any[] = [];
  try {
    const { data } = await axiosInstance.get(`/${episodeSlug}`);
    const $ = load(data);
    
    // Ambil semua server dan proses secara paralel
    const serverPromises: Promise<any>[] = [];
    
    $("#server ul li div").each((_: number, el: any) => {
      const server = $(el).text().trim();
      const post = $(el).attr("data-post") || "";
      const nume = $(el).attr("data-nume") || "";
      const type = $(el).attr("data-type") || "";
      
      // Info resolusi (jika ada di text)
      let resolution = null;
      const resMatch = server.match(/(\d{3,4}p)/i);
      if (resMatch) resolution = resMatch[1];
      
      // POST ke wp-admin/admin-ajax.php
      const form = new URLSearchParams();
      form.append("action", "player_ajax");
      form.append("post", post);
      form.append("nume", nume);
      form.append("type", type);
      
      const promise = axiosInstance.post("/wp-admin/admin-ajax.php", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }).then(ajaxRes => {
        const $$ = load(ajaxRes.data);
        const embed_url = $$('iframe').attr('src') || null;
        if (embed_url) {
          console.log(`[ROUTES] Berhasil scrap server ${server} (${resolution || 'Unknown'})`);
          return { server, resolution, embed_url };
        }
        console.log(`[ROUTES] Gagal scrap server ${server} - tidak ada embed URL`);
        return null;
      }).catch(e => {
        console.error(`[ROUTES] Error scrap server ${server}:`, e);
        return null;
      });
      
      serverPromises.push(promise);
    });
    
    // Tunggu semua request selesai
    const results = await Promise.all(serverPromises);
    embeds = results.filter(Boolean);
    
    // Fallback: jika tidak ada, cari iframe di halaman episode
    if (embeds.length === 0) {
      console.log(`[ROUTES] Tidak ada embed dari server, mencoba fallback...`);
      let embed_url = $(".player-area iframe").attr("src") || null;
      if (embed_url && embed_url.includes("facebook.com/plugins/like")) {
        embed_url = $("iframe").not('[src*="facebook.com/plugins/like"]').attr("src") || null;
      }
      if (embed_url) {
        embeds.push({ server: "Fallback", resolution: null, embed_url });
        console.log(`[ROUTES] Berhasil mendapatkan fallback embed`);
      }
    }
    
    // Urutkan berdasarkan resolusi (1080p, 720p, 480p, dll)
    embeds.sort((a, b) => {
      const getResolutionValue = (res: string | null) => {
        if (!res) return 0;
        const match = res.match(/(\d+)p/i);
        return match ? parseInt(match[1]) : 0;
      };
      
      const aRes = getResolutionValue(a.resolution);
      const bRes = getResolutionValue(b.resolution);
      
      // Urutkan dari tinggi ke rendah
      if (bRes !== aRes) {
        return bRes - aRes;
      }
      
      // Jika resolusi sama, urutkan berdasarkan nama server
      return (a.server || "").localeCompare(b.server || "");
    });
    
    console.log(`[ROUTES] Berhasil scrap ${embeds.length} embed untuk ${anime.title} Episode ${episode.episode_number}`);
    
    // Simpan episode dan semua embed ke database
    if (embeds.length > 0) {
      const animeRecord = db.query("SELECT id FROM anime WHERE slug = ?").get(animeSlug) as any;
      
      if (animeRecord) {
        let episodeId;
        
        if (!dbEpisode) {
          // Insert episode baru
          const result = db.query(`
            INSERT INTO episode (anime_id, episode_number, slug, title, embed_url) 
            VALUES (?, ?, ?, ?, ?)
          `).run(animeRecord.id, episode.episode_number, episodeSlug, episode.title, embeds[0].embed_url);
          
          episodeId = result.lastInsertRowid;
          console.log(`[ROUTES] Episode baru berhasil disimpan ke database dengan ID: ${episodeId}`);
        } else {
          // Update episode yang sudah ada
          db.query("UPDATE episode SET embed_url = ? WHERE id = ?").run(embeds[0].embed_url, dbEpisode.id);
          episodeId = dbEpisode.id;
          console.log(`[ROUTES] Episode berhasil diupdate di database dengan ID: ${episodeId}`);
        }
        
        // Simpan semua embed ke database
        for (const embed of embeds) {
          // Cek apakah embed sudah ada dan manual
          const existingEmbed = db.query(`
            SELECT is_manual 
            FROM episode_embed 
            WHERE episode_id = ? AND server = ? AND is_manual = 1
          `).get(episodeId, embed.server) as any;
          
          if (existingEmbed) {
            console.log(`[ROUTES] ⏭️ Embed ${embed.server} adalah data manual admin, skip...`);
            continue;
          }
          
          db.query(`
            INSERT OR IGNORE INTO episode_embed (episode_id, server, resolution, embed_url) 
            VALUES (?, ?, ?, ?)
          `).run(episodeId, embed.server, embed.resolution, embed.embed_url);
        }
        
        console.log(`[ROUTES] ${embeds.length} embed berhasil disimpan ke database untuk episode ID: ${episodeId}`);
        
        // Backup embed baru ke Telegram
        telegramBackup.backupNewEmbeds(anime.title, episode.episode_number, embeds).catch(e => 
          console.error("[ROUTES] Error backup embed ke Telegram:", e)
        );
        
        // Auto-backup file database setelah embed baru
        console.log(`[ROUTES] Auto-backup file database setelah embed baru...`);
        telegramBackup.sendDatabaseFile(`Auto Backup Database - Embed Baru - ${anime.title} Episode ${episode.episode_number} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
          console.error("[ROUTES] Error auto-backup file database setelah embed baru:", e)
        );
      }
    } else {
      console.log(`[ROUTES] Tidak ada embed yang berhasil di-scrap untuk ${anime.title} Episode ${episode.episode_number}`);
      
      // Backup error ke Telegram
      telegramBackup.backupError(
        `Scrap embed episode ${episodeSlug}`, 
        "Tidak ada embed yang berhasil di-scrap"
      ).catch(e => console.error("[ROUTES] Error backup error ke Telegram:", e));
    }
    
  } catch (e) {
    console.error(`[ROUTES] Error fetching episode page ${episodeSlug}:`, e);
    telegramBackup.backupError(`Fetch episode page ${episodeSlug}`, e).catch(() => {});
  }
  
  return Response.json({
    anime: {
      slug: anime.slug,
      title: anime.title,
      synopsis: anime.synopsis,
      status: anime.status,
      type: anime.type,
      rating: anime.rating,
      genre: anime.genre,
      studio: anime.studio,
      producers: anime.producers
    },
    episode: {
      episode_number: episode.episode_number,
      title: episode.title,
      slug: episode.slug,
      embeds
    }
  });
}

function getEpisodeBySlug(animeSlug: string, episodeSlug: string): Response {
  const anime = db.query("SELECT * FROM anime WHERE slug = ?").get(animeSlug) as any;
  if (!anime) {
    return new Response("Anime not found", { status: 404 });
  }
  
  const episode = db.query("SELECT * FROM episode WHERE anime_id = ? AND slug = ?").get(anime.id, episodeSlug);
  if (!episode) {
    return new Response("Episode not found", { status: 404 });
  }
  
  return Response.json({
    anime: anime,
    episode: episode
  });
}

async function getHomeRealtime(): Promise<Response> {
  try {
    const { data } = await axiosInstance.get("/anime-terbaru/");
    const $ = load(data);
    const animes: any[] = [];
    
    // Perbaiki selector berdasarkan hasil scan
    $("div.post-show ul li").each((_: number, el: any) => {
      const title = $(el).find("h2.entry-title").text().trim();
      const href = $(el).find("a").attr("href") || "";
      const slug = href.split("/").filter(Boolean).pop() || "";
      const cover = $(el).find("img.npws").attr("src") || "";
      
      if (title) {
        animes.push({ title, slug, cover });
      }
    });
    
    return Response.json({ animes });
  } catch (e) {
    console.error("Error fetching home data:", e);
    return new Response("Failed to fetch realtime home data", { status: 500 });
  }
}

function searchAnime(keyword: string): Response {
  const animes = db.query("SELECT id, title, slug, cover, rating FROM anime WHERE title LIKE ? LIMIT 20").all(`%${keyword}%`);
  return Response.json({ animes });
}

async function getAnimeByGenre(genre: string): Promise<Response> {
  try {
    console.log(`[ROUTES] 🎭 Smart database system for genre: ${genre}`);
    
    // Step 1: Check data from database first
    console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Checking database for cached data...`);
    
    // Try simpler query first
    const totalAnime = db.query(`SELECT COUNT(*) as count FROM anime`).get() as any;
    const totalGenre = db.query(`SELECT COUNT(*) as count FROM anime_genre WHERE genre = ?`).get(genre) as any;
    
    console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Debug - Total anime in DB: ${totalAnime.count}, Total genre entries: ${totalGenre.count}`);
    
    // Check if we have any data for this genre
    if (totalGenre.count > 0) {
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${totalGenre.count} genre entries, using cached data`);
      
      const cachedAnime = db.query(`
        SELECT a.id, a.title, a.slug, a.cover, a.rating
        FROM anime a
        JOIN anime_genre ag ON a.id = ag.anime_id
        WHERE ag.genre = ?
        ORDER BY a.rating DESC
      `).all(genre) as any[];
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Database query result: ${cachedAnime.length} anime found`);
      
      if (cachedAnime.length > 0) {
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Returning cached data immediately`);
        
        // Start background check for new anime
        setTimeout(async () => {
          try {
            console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: Checking for new anime...`);
            const newAnime = await checkForNewAnimeOnly(genre);
            
            if (newAnime.length > 0) {
              console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: Found ${newAnime.length} new anime, adding to database...`);
              
              for (const anime of newAnime) {
                try {
                  const result = db.query(`
                    INSERT OR IGNORE INTO anime (title, slug, cover, rating) 
                    VALUES (?, ?, ?, ?)
                  `).run(anime.title, anime.slug, anime.cover, anime.rating);
                  
                  if (result.changes > 0) {
                    db.query(`
                      INSERT INTO anime_genre (anime_id, genre) 
                      VALUES (?, ?)
                    `).run(result.lastInsertRowid, genre);
                    
                    console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: Added new anime: ${anime.title}`);
                  }
                } catch (e) {
                  // Anime already exists, skip
                }
              }
              
              console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: Database updated with ${newAnime.length} new anime`);
            } else {
              console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: No new anime found`);
            }
          } catch (e) {
            console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background check error:`, e);
          }
        }, 100);
        
        return Response.json({
          animes: cachedAnime,
          new_anime_count: 0,
          message: `Cached data for genre: ${genre} (${cachedAnime.length} anime)`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Step 2: If database empty, return empty and trigger background full scrape
    console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Database empty, trigger background full scrape...`);
    setTimeout(async () => {
      try {
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: Start full scrape all pages...`);
        const fullAnimeList = await scrapeGenreRealTime(genre);
        let savedCount = 0;
        let skippedCount = 0;
        for (const anime of fullAnimeList) {
          try {
            const result = db.query(`
              INSERT OR IGNORE INTO anime (title, slug, cover, rating) 
              VALUES (?, ?, ?, ?)
            `).run(anime.title, anime.slug, anime.cover, anime.rating);
            if (result.changes > 0) {
              const genreResult = db.query(`
                INSERT INTO anime_genre (anime_id, genre) 
                VALUES (?, ?)
              `).run(result.lastInsertRowid, genre);
              savedCount++;
            } else {
              // Anime already exists, check if genre relationship exists
              const existingAnime = db.query(`SELECT id FROM anime WHERE slug = ?`).get(anime.slug) as any;
              if (existingAnime) {
                const existingGenre = db.query(`SELECT id FROM anime_genre WHERE anime_id = ? AND genre = ?`).get(existingAnime.id, genre) as any;
                if (!existingGenre) {
                  db.query(`
                    INSERT INTO anime_genre (anime_id, genre) 
                    VALUES (?, ?)
                  `).run(existingAnime.id, genre);
                  savedCount++;
                } else {
                  skippedCount++;
                }
              }
            }
          } catch (e) {
            console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Error saving anime ${anime.title}:`, e);
          }
        }
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background: Full scrape done. Saved: ${savedCount}, Skipped: ${skippedCount}`);
      } catch (e) {
        console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Background full scrape error:`, e);
      }
    }, 100);
    return Response.json({
      animes: [],
      new_anime_count: 0,
      message: `Database empty for genre: ${genre}. Full background scrape started. Please refresh in a moment.`,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error(`[ROUTES] 🎭 Error smart database for genre ${genre}:`, e);
    return Response.json({ 
      animes: [],
      error: e.message || e,
      message: `Error getting data for genre: ${genre}`,
      timestamp: new Date().toISOString()
    });
  }
}

// Pure real-time scraping tanpa save ke database dengan auto-detect total pages
async function scrapeGenreRealTime(genre: string): Promise<any[]> {
  const BASE_URL = "https://samehadaku.now";
  const animeList: any[] = [];
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Pure real-time scraping with auto-detect...`);
  
  // Step 1: Detect total pages using binary search
  const totalPages = await detectTotalPages(genre);
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Detected ${totalPages} total pages`);
  
  // Step 2: Scrape all pages
  for (let page = 1; page <= totalPages; page++) {
    try {
      const url = page === 1 
        ? `${BASE_URL}/genre/${genre}/`
        : `${BASE_URL}/genre/${genre}/page/${page}/`;
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Scraping page ${page}/${totalPages}: ${url}`);
      
      const { data } = await axiosInstance.get(url);
      const $ = load(data);
      const animeElements = $("article .animepost");
      
      if (animeElements.length === 0) {
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] No more anime found on page ${page}, stopping...`);
        break;
      }
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${animeElements.length} anime on page ${page}`);
      
      animeElements.each((_, element) => {
        const anime = $(element);
        
        // Extract title
        let title = anime.find(".tt").text().trim();
        if (!title) title = anime.find(".title").text().trim();
        if (!title) title = anime.find("h2").text().trim();
        if (!title) title = anime.find("h3").text().trim();
        if (!title) {
          const titleAttr = anime.find("a").attr("title");
          title = titleAttr || "";
        }
        if (!title) {
          const altAttr = anime.find("img").attr("alt");
          title = altAttr || "";
        }
        if (!title) {
          const fullText = anime.text().trim();
          const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length > 0) {
            title = lines[0];
          }
        }
        
        // Extract slug from href
        const href = anime.find("a").attr("href");
        let slug = "";
        if (href) {
          const slugMatch = href.match(/\/anime\/([^\/]+)/);
          if (slugMatch) {
            slug = slugMatch[1];
          }
        }
        
        // Extract cover image
        const cover = anime.find("img").attr("src") || "";
        
        if (title && slug) {
          animeList.push({
            title: title,
            slug: slug,
            cover: cover,
            rating: null, // No rating in real-time
            genre: genre
          });
        }
      });
      
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (e) {
      console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Error scraping page ${page}:`, e);
      break;
    }
  }
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Pure real-time scraping completed: ${animeList.length} anime found from ${totalPages} pages`);
  return animeList;
}

// Quick scrape for first time (only 5 pages max)
async function scrapeGenreQuick(genre: string): Promise<any[]> {
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Quick scraping (max 5 pages)...`);
  
  const BASE_URL = "https://samehadaku.now";
  const animeList: any[] = [];
  
  // Only scrape first 5 pages for speed
  for (let page = 1; page <= 5; page++) {
    try {
      const url = page === 1 
        ? `${BASE_URL}/genre/${genre}/`
        : `${BASE_URL}/genre/${genre}/page/${page}/`;
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Quick scraping page ${page}: ${url}`);
      
      const { data } = await axiosInstance.get(url);
      const $ = load(data);
      const animeElements = $("article .animepost");
      
      if (animeElements.length === 0) {
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] No anime found on page ${page}`);
        break;
      }
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${animeElements.length} anime on page ${page}`);
      
      animeElements.each((_, element) => {
        const anime = $(element);
        
        // Extract title
        let title = anime.find(".tt").text().trim();
        if (!title) title = anime.find(".title").text().trim();
        if (!title) title = anime.find("h2").text().trim();
        if (!title) title = anime.find("h3").text().trim();
        if (!title) {
          const titleAttr = anime.find("a").attr("title");
          title = titleAttr || "";
        }
        if (!title) {
          const altAttr = anime.find("img").attr("alt");
          title = altAttr || "";
        }
        if (!title) {
          const fullText = anime.text().trim();
          const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length > 0) {
            title = lines[0];
          }
        }
        
        // Extract slug from href
        const href = anime.find("a").attr("href");
        let slug = "";
        if (href) {
          const slugMatch = href.match(/\/anime\/([^\/]+)/);
          if (slugMatch) {
            slug = slugMatch[1];
          }
        }
        
        // Extract cover image
        const cover = anime.find("img").attr("src") || "";
        
        if (title && slug) {
          animeList.push({
            title: title,
            slug: slug,
            cover: cover,
            rating: null,
            genre: genre
          });
        }
      });
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (e) {
      console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Error quick scraping page ${page}:`, e);
      break;
    }
  }
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Quick scraping completed: ${animeList.length} anime found`);
  return animeList;
}

// Check for new anime only (skip existing ones)
async function checkForNewAnimeOnly(genre: string): Promise<any[]> {
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Checking for new anime only...`);
  
  const BASE_URL = "https://samehadaku.now";
  const newAnimeList: any[] = [];
  
  // Only check first 2 pages for speed
  for (let page = 1; page <= 2; page++) {
    try {
      const url = page === 1 
        ? `${BASE_URL}/genre/${genre}/`
        : `${BASE_URL}/genre/${genre}/page/${page}/`;
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Checking page ${page}: ${url}`);
      
      const { data } = await axiosInstance.get(url);
      const $ = load(data);
      const animeElements = $("article .animepost");
      
      if (animeElements.length === 0) {
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] No anime found on page ${page}`);
        break;
      }
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${animeElements.length} anime on page ${page}`);
      
      animeElements.each((_, element) => {
        const anime = $(element);
        
        // Extract title
        let title = anime.find(".tt").text().trim();
        if (!title) title = anime.find(".title").text().trim();
        if (!title) title = anime.find("h2").text().trim();
        if (!title) title = anime.find("h3").text().trim();
        if (!title) {
          const titleAttr = anime.find("a").attr("title");
          title = titleAttr || "";
        }
        if (!title) {
          const altAttr = anime.find("img").attr("alt");
          title = altAttr || "";
        }
        if (!title) {
          const fullText = anime.text().trim();
          const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length > 0) {
            title = lines[0];
          }
        }
        
        // Extract slug from href
        const href = anime.find("a").attr("href");
        let slug = "";
        if (href) {
          const slugMatch = href.match(/\/anime\/([^\/]+)/);
          if (slugMatch) {
            slug = slugMatch[1];
          }
        }
        
        // Extract cover image
        const cover = anime.find("img").attr("src") || "";
        
        if (title && slug) {
          // Check if anime already exists in database
          const existingAnime = db.query(`
            SELECT id FROM anime WHERE slug = ?
          `).get(slug) as any;
          
          if (!existingAnime) {
            console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found NEW anime: ${title}`);
            newAnimeList.push({
              title: title,
              slug: slug,
              cover: cover,
              rating: null,
              genre: genre
            });
          } else {
            console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Skipping existing anime: ${title}`);
          }
        }
      });
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (e) {
      console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Error checking page ${page}:`, e);
      break;
    }
  }
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${newAnimeList.length} new anime`);
  return newAnimeList;
}

// Quick check for new anime (only first 2 pages for speed)
async function checkForNewAnime(genre: string): Promise<any[]> {
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Checking for new anime...`);
  
  const BASE_URL = "https://samehadaku.now";
  const newAnimeList: any[] = [];
  
  // Only check first 2 pages for speed
  for (let page = 1; page <= 2; page++) {
    try {
      const url = page === 1 
        ? `${BASE_URL}/genre/${genre}/`
        : `${BASE_URL}/genre/${genre}/page/${page}/`;
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Checking page ${page}: ${url}`);
      
      const { data } = await axiosInstance.get(url);
      const $ = load(data);
      const animeElements = $("article .animepost");
      
      if (animeElements.length === 0) {
        console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] No anime found on page ${page}`);
        break;
      }
      
      console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${animeElements.length} anime on page ${page}`);
      
      animeElements.each((_, element) => {
        const anime = $(element);
        
        // Extract title
        let title = anime.find(".tt").text().trim();
        if (!title) title = anime.find(".title").text().trim();
        if (!title) title = anime.find("h2").text().trim();
        if (!title) title = anime.find("h3").text().trim();
        if (!title) {
          const titleAttr = anime.find("a").attr("title");
          title = titleAttr || "";
        }
        if (!title) {
          const altAttr = anime.find("img").attr("alt");
          title = altAttr || "";
        }
        if (!title) {
          const fullText = anime.text().trim();
          const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length > 0) {
            title = lines[0];
          }
        }
        
        // Extract slug from href
        const href = anime.find("a").attr("href");
        let slug = "";
        if (href) {
          const slugMatch = href.match(/\/anime\/([^\/]+)/);
          if (slugMatch) {
            slug = slugMatch[1];
          }
        }
        
        // Extract cover image
        const cover = anime.find("img").attr("src") || "";
        
        if (title && slug) {
          // Check if anime already exists in database
          const existingAnime = db.query(`
            SELECT id FROM anime WHERE slug = ?
          `).get(slug) as any;
          
          if (!existingAnime) {
            console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found new anime: ${title}`);
            newAnimeList.push({
              title: title,
              slug: slug,
              cover: cover,
              rating: null,
              genre: genre
            });
          }
        }
      });
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (e) {
      console.error(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Error checking page ${page}:`, e);
      break;
    }
  }
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Found ${newAnimeList.length} new anime`);
  return newAnimeList;
}

// Auto-detect total pages using binary search
async function detectTotalPages(genre: string): Promise<number> {
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Detecting total pages...`);
  
  const BASE_URL = "https://samehadaku.now";
  let left = 1;
  let right = 100; // Start with 100 as max
  let lastValidPage = 1;
  
  // First, try to find a reasonable upper bound
  for (let testPage = 10; testPage <= 200; testPage += 10) {
    try {
      const testUrl = `${BASE_URL}/genre/${genre}/page/${testPage}/`;
      const { data } = await axiosInstance.get(testUrl);
      const $ = load(data);
      const animeElements = $("article .animepost");
      
      if (animeElements.length > 0) {
        right = testPage + 10;
        lastValidPage = testPage;
      } else {
        right = testPage;
        break;
      }
    } catch (e) {
      right = testPage;
      break;
    }
  }
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Upper bound detected: ${right} pages`);
  
  // Binary search to find the exact last page
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    try {
      const testUrl = `${BASE_URL}/genre/${genre}/page/${mid}/`;
      const { data } = await axiosInstance.get(testUrl);
      const $ = load(data);
      const animeElements = $("article .animepost");
      
      if (animeElements.length > 0) {
        lastValidPage = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    } catch (e) {
      right = mid - 1;
    }
  }
  
  console.log(`[ROUTES] 🎭 [GENRE: ${genre.toUpperCase()}] Total pages detected: ${lastValidPage}`);
  return lastValidPage;
}

async function getAvailableGenres(): Promise<Response> {
  try {
    const genres = db.query("SELECT DISTINCT genre FROM anime_genre ORDER BY genre ASC").all() as string[];
    return Response.json({ genres });
  } catch (e) {
    console.error("[ROUTES] Error getting available genres:", e);
    return new Response("Error getting genres", { status: 500 });
  }
}

function getDatabaseStats(): Response {
  try {
    const animeCount = db.query("SELECT COUNT(*) as count FROM anime").get() as any;
    const episodeCount = db.query("SELECT COUNT(*) as count FROM episode").get() as any;
    const embedCount = db.query("SELECT COUNT(*) as count FROM episode_embed").get() as any;
    const activeEmbedCount = db.query("SELECT COUNT(*) as count FROM episode_embed WHERE is_active = 1").get() as any;
    
    const stats = {
      anime: animeCount.count,
      episode: episodeCount.count,
      total_embed: embedCount.count,
      active_embed: activeEmbedCount.count,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[ROUTES] Database stats: ${JSON.stringify(stats)}`);
    return Response.json(stats);
  } catch (e) {
    console.error("[ROUTES] Error getting database stats:", e);
    return new Response("Error getting stats", { status: 500 });
  }
}

async function testTelegramConnection(): Promise<Response> {
  try {
    await telegramBackup.testConnection();
    return Response.json({ 
      success: true, 
      message: "Telegram connection test completed",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("[ROUTES] Error test Telegram connection:", e);
    return Response.json({ 
      success: false, 
      error: e.message || e,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function triggerManualBackup(): Promise<Response> {
  try {
    // Backup database stats
    await telegramBackup.backupDatabaseStats();
    
    // Send log buffer
    await telegramBackup.sendLogBuffer();
    
    return Response.json({ 
      success: true, 
      message: "Manual backup completed",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("[ROUTES] Error manual backup:", e);
    return Response.json({ 
      success: false, 
      error: e.message || e,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function sendDatabaseFileToTelegram(): Promise<Response> {
  try {
    await telegramBackup.sendDatabaseFile("Backup Database Manual");
    return Response.json({
      success: true,
      message: "Database file sent to Telegram",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("[ROUTES] Error send database file:", e);
    return Response.json({
      success: false,
      error: e.message || e,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Fungsi untuk scraping episode on-demand
async function scrapeAnimeEpisodesOnDemand(animeSlug: string): Promise<Response> {
  try {
    console.log(`[ROUTES] 🎬 Scraping episode on-demand untuk anime: ${animeSlug}`);
    
    // Cek apakah anime ada di database
    const anime = db.query("SELECT * FROM anime WHERE slug = ?").get(animeSlug) as any;
    if (!anime) {
      return Response.json({ 
        success: false, 
        error: "Anime not found in database" 
      }, { status: 404 });
    }
    
    // Scrap episode dari website
    const url = `https://samehadaku.now/anime/${animeSlug}`;
    const { data } = await axiosInstance.get(url);
    const $ = load(data);
    
    // Ambil daftar episode
    const episodes = $(".epsleft a");
    let episodeCount = 0;
    let newEpisodes: any[] = [];
    
    console.log(`[ROUTES] 🎬 Ditemukan ${episodes.length} episode untuk ${animeSlug}`);
    
    episodes.each((index: number, el: any) => {
      const href = $(el).attr("href") || "";
      const episodeSlug = href.split("/").filter(Boolean).pop() || "";
      const episodeNumber = index + 1;
      
      if (episodeSlug) {
        // Cek apakah episode sudah ada dan manual
        const existingEpisode = db.query(`
          SELECT e.is_manual 
          FROM episode e 
          JOIN anime a ON e.anime_id = a.id 
          WHERE a.slug = ? AND e.slug = ?
        `).get(animeSlug, episodeSlug) as any;
        
        if (existingEpisode && existingEpisode.is_manual === 1) {
          console.log(`[ROUTES] 🎬 ⏭️ Episode ${episodeNumber} adalah data manual admin, skip...`);
        } else {
          // Simpan episode ke database
          const result = db.query(`
            INSERT OR IGNORE INTO episode (anime_id, episode_number, slug, title) 
            SELECT id, ?, ?, ? FROM anime WHERE slug = ?
          `).run(episodeNumber, episodeSlug, `Episode ${episodeNumber}`, animeSlug);
          
          if (result.changes > 0) {
            episodeCount++;
            newEpisodes.push({
              episode_number: episodeNumber,
              slug: episodeSlug,
              title: `Episode ${episodeNumber}`
            });
            console.log(`[ROUTES] 🎬 ✅ Episode ${episodeNumber} berhasil disimpan ke database`);
            
            // Backup episode baru ke Telegram
            telegramBackup.backupNewEpisode(anime.title, episodeNumber, episodeSlug).catch(e => 
              console.error("[ROUTES] Error backup episode ke Telegram:", e)
            );
          } else {
            console.log(`[ROUTES] 🎬 ⏭️ Episode ${episodeNumber} sudah ada di database`);
          }
        }
      }
    });
    
    console.log(`[ROUTES] 🎬 ✅ Selesai scraping episode on-demand: ${animeSlug}, total episode baru: ${episodeCount}`);
    
    // Auto-backup file database jika ada episode baru
    if (episodeCount > 0) {
      console.log(`[ROUTES] 🎬 Auto-backup file database setelah scrap episode baru...`);
      telegramBackup.sendDatabaseFile(`Auto Backup Database - Episode Baru - ${animeSlug} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
        console.error("[ROUTES] Error auto-backup file database setelah episode baru:", e)
      );
    }
    
    return Response.json({
      success: true,
      message: `Successfully scraped ${episodeCount} new episodes`,
      anime_title: anime.title,
      total_episodes_found: episodes.length,
      new_episodes: newEpisodes,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error(`[ROUTES] 🎬 ❌ Error scraping episode on-demand ${animeSlug}:`, error);
    telegramBackup.backupError(`Scrap episode on-demand ${animeSlug}`, error).catch(() => {});
    
    return Response.json({
      success: false,
      error: error.message || "Failed to scrape episodes",
      anime_slug: animeSlug
    }, { status: 500 });
  }
}

async function testGenreScraping(genre: string): Promise<Response> {
  try {
    console.log(`[ROUTES] Test scraping genre: ${genre}`);
    
    // Test URL dan response terlebih dahulu
    const axios = require("axios");
    const { load } = require("cheerio");
    
    const testUrl = `https://samehadaku.now/genre/${genre}/`;
    console.log(`[ROUTES] Testing URL: ${testUrl}`);
    
    const { data } = await axios.get(testUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT)"
      }
    });
    
    const $ = load(data);
    const animeList = $("article .animepost");
    
    console.log(`[ROUTES] Found ${animeList.length} anime with selector "article .animepost"`);
    
    // Test selector alternatif
    const altSelectors = [
      ".animepost", 
      "article",
      ".anime-list .anime-item",
      ".anime-grid .anime-item"
    ];
    
    const selectorResults = {};
    for (const selector of altSelectors) {
      const testList = $(selector);
      selectorResults[selector] = testList.length;
      console.log(`[ROUTES] Selector "${selector}": ${testList.length} items`);
    }
    
    // Import scraping function
    const { scrapeAnimeByGenre } = await import("./scraper");
    const result = await scrapeAnimeByGenre(genre, true); // Speed mode
    
    return Response.json({
      success: true,
      message: `Genre ${genre} scraping completed`,
      testUrl: testUrl,
      animeFound: result,
      selectorResults: selectorResults,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error(`[ROUTES] Error test scraping genre ${genre}:`, e);
    return Response.json({
      success: false,
      error: e.message || e,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function testDatabaseSave(genre: string): Promise<Response> {
  try {
    console.log(`[ROUTES] Test database save for genre: ${genre}`);
    
    // Test data
    const testAnime = {
      title: "Test Anime Database Save",
      slug: `test-anime-db-save-${Date.now()}`,
      cover: "https://example.com/cover.jpg",
      rating: 8.5
    };
    
    console.log(`[ROUTES] Attempting to save test anime to database...`);
    
    // Try to insert anime
    const result = db.query(`
      INSERT INTO anime (title, slug, cover, rating) 
      VALUES (?, ?, ?, ?)
    `).run(testAnime.title, testAnime.slug, testAnime.cover, testAnime.rating);
    
    console.log(`[ROUTES] Anime insert result: changes=${result.changes}, lastInsertRowid=${result.lastInsertRowid}`);
    
    if (result.changes > 0) {
      // Try to insert genre
      const genreResult = db.query(`
        INSERT INTO anime_genre (anime_id, genre) 
        VALUES (?, ?)
      `).run(result.lastInsertRowid, genre);
      
      console.log(`[ROUTES] Genre insert result: changes=${genreResult.changes}`);
      
      // Verify data was saved
      const savedAnime = db.query(`SELECT * FROM anime WHERE id = ?`).get(result.lastInsertRowid) as any;
      const savedGenre = db.query(`SELECT * FROM anime_genre WHERE anime_id = ? AND genre = ?`).get(result.lastInsertRowid, genre) as any;
      
      return Response.json({
        success: true,
        message: `Test database save completed`,
        anime_inserted: result.changes > 0,
        genre_inserted: genreResult.changes > 0,
        saved_anime: savedAnime,
        saved_genre: savedGenre,
        timestamp: new Date().toISOString()
      });
    } else {
      return Response.json({
        success: false,
        message: `Failed to insert anime`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e: any) {
    console.error(`[ROUTES] Error test database save for genre ${genre}:`, e);
    return Response.json({
      success: false,
      error: e.message || e,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

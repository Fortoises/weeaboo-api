import { db } from "./db";
import { telegramBackup } from "./telegram";

// Konfigurasi keamanan
const ADMIN_TOKEN = Bun.env.ADMIN_TOKEN || "admin123456";
const ADMIN_USERNAME = Bun.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = Bun.env.ADMIN_PASSWORD || "password123";

// Fungsi untuk validasi token
function validateAdminToken(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  
  const token = authHeader.replace("Bearer ", "");
  return token === ADMIN_TOKEN;
}

// Fungsi untuk validasi basic auth
function validateBasicAuth(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  
  const credentials = atob(authHeader.replace("Basic ", ""));
  const [username, password] = credentials.split(":");
  
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

// Fungsi untuk cek autentikasi
function checkAuth(req: Request): Response | null {
  // Cek token atau basic auth
  if (!validateAdminToken(req) && !validateBasicAuth(req)) {
    return new Response(JSON.stringify({
      success: false,
      message: "Unauthorized - Token atau credentials salah"
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer realm=\"Admin API\""
      }
    });
  }
  
  return null; // Auth berhasil
}

// Fungsi untuk menambah anime manual (admin)
export async function addAnimeManual(data: {
  slug: string;
  title: string;
  cover?: string;
  synopsis?: string;
  status?: string;
  type?: string;
  rating?: number;
  studio?: string;
  producers?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    // Cek apakah anime sudah ada
    const existing = db.query("SELECT id FROM anime WHERE slug = ?").get(data.slug) as any;
    if (existing) {
      return { success: false, message: "Anime dengan slug tersebut sudah ada" };
    }

    // Insert anime dengan flag is_manual = 1
    db.query(`
      INSERT INTO anime (slug, title, cover, synopsis, status, type, rating, studio, producers, is_manual) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      data.slug,
      data.title,
      data.cover || null,
      data.synopsis || null,
      data.status || "ongoing",
      data.type || "TV",
      data.rating || 0,
      data.studio || null,
      data.producers || null
    );

    // Backup ke Telegram
    telegramBackup.backupNewAnime(data.title, data.slug).catch(e => 
      console.error("[ADMIN] Error backup anime manual ke Telegram:", e)
    );

    // Auto-backup file database setelah menambah anime manual
    telegramBackup.sendDatabaseFile(`🎌 Admin Manual - Anime Baru - ${data.title} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah menambah anime manual:", e)
    );

    return { success: true, message: "Anime berhasil ditambahkan sebagai data manual" };
  } catch (error) {
    console.error("[ADMIN] Error menambah anime manual:", error);
    return { success: false, message: "Error menambah anime" };
  }
}

// Fungsi untuk menambah episode manual (admin)
export async function addEpisodeManual(data: {
  animeSlug: string;
  episodeNumber: number;
  episodeSlug: string;
  title?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    // Cek apakah anime ada
    const anime = db.query("SELECT id FROM anime WHERE slug = ?").get(data.animeSlug) as any;
    if (!anime) {
      return { success: false, message: "Anime tidak ditemukan" };
    }

    // Cek apakah episode sudah ada
    const existing = db.query("SELECT id FROM episode WHERE slug = ?").get(data.episodeSlug) as any;
    if (existing) {
      return { success: false, message: "Episode dengan slug tersebut sudah ada" };
    }

    // Insert episode dengan flag is_manual = 1
    db.query(`
      INSERT INTO episode (anime_id, episode_number, slug, title, is_manual) 
      VALUES (?, ?, ?, ?, 1)
    `).run(
      anime.id,
      data.episodeNumber,
      data.episodeSlug,
      data.title || `Episode ${data.episodeNumber}`
    );

    // Backup ke Telegram
    telegramBackup.backupNewEpisode("Manual Anime", data.episodeNumber, data.episodeSlug).catch(e => 
      console.error("[ADMIN] Error backup episode manual ke Telegram:", e)
    );

    // Auto-backup file database setelah menambah episode manual
    telegramBackup.sendDatabaseFile(`🎬 Admin Manual - Episode Baru - EP${data.episodeNumber} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah menambah episode manual:", e)
    );

    return { success: true, message: "Episode berhasil ditambahkan sebagai data manual" };
  } catch (error) {
    console.error("[ADMIN] Error menambah episode manual:", error);
    return { success: false, message: "Error menambah episode" };
  }
}

// Fungsi untuk scraping episode on-demand (admin)
export async function scrapeAnimeEpisodesOnDemand(animeSlug: string): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    console.log(`[ADMIN] 🎬 Scraping episode on-demand untuk anime: ${animeSlug}`);
    
    // Cek apakah anime ada di database
    const anime = db.query("SELECT * FROM anime WHERE slug = ?").get(animeSlug) as any;
    if (!anime) {
      return { success: false, message: "Anime tidak ditemukan di database" };
    }
    
    // Import axios dan cheerio
    const axios = require("axios");
    const { load } = require("cheerio");
    
    // Scrap episode dari website
    const url = `https://samehadaku.now/anime/${animeSlug}`;
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT)"
      }
    });
    const $ = load(data);
    
    // Ambil daftar episode
    const episodes = $(".epsleft a");
    let episodeCount = 0;
    let newEpisodes: any[] = [];
    
    console.log(`[ADMIN] 🎬 Ditemukan ${episodes.length} episode untuk ${animeSlug}`);
    
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
          console.log(`[ADMIN] 🎬 ⏭️ Episode ${episodeNumber} adalah data manual admin, skip...`);
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
            console.log(`[ADMIN] 🎬 ✅ Episode ${episodeNumber} berhasil disimpan ke database`);
            
            // Backup episode baru ke Telegram
            telegramBackup.backupNewEpisode(anime.title, episodeNumber, episodeSlug).catch(e => 
              console.error("[ADMIN] Error backup episode ke Telegram:", e)
            );
          } else {
            console.log(`[ADMIN] 🎬 ⏭️ Episode ${episodeNumber} sudah ada di database`);
          }
        }
      }
    });
    
    console.log(`[ADMIN] 🎬 ✅ Selesai scraping episode on-demand: ${animeSlug}, total episode baru: ${episodeCount}`);
    
    // Auto-backup file database jika ada episode baru
    if (episodeCount > 0) {
      console.log(`[ADMIN] 🎬 Auto-backup file database setelah scrap episode baru...`);
      telegramBackup.sendDatabaseFile(`🎬 Admin Manual - Episode Baru - ${animeSlug} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
        console.error("[ADMIN] Error auto-backup file database setelah episode baru:", e)
      );
    }
    
    return { 
      success: true, 
      message: `Berhasil scraping ${episodeCount} episode baru`,
      data: {
        anime_title: anime.title,
        total_episodes_found: episodes.length,
        new_episodes: newEpisodes
      }
    };
    
  } catch (error: any) {
    console.error(`[ADMIN] 🎬 ❌ Error scraping episode on-demand ${animeSlug}:`, error);
    telegramBackup.backupError(`Scrap episode on-demand ${animeSlug}`, error).catch(() => {});
    
    return { 
      success: false, 
      message: `Error scraping episode: ${error.message || "Unknown error"}` 
    };
  }
}

// Fungsi untuk menambah/edit embed manual (admin)
export async function addEmbedManual(data: {
  episodeSlug: string;
  server: string;
  resolution?: string;
  embedUrl: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    // Cek apakah episode ada
    const episode = db.query("SELECT id FROM episode WHERE slug = ?").get(data.episodeSlug) as any;
    if (!episode) {
      return { success: false, message: "Episode tidak ditemukan" };
    }

    // Insert embed dengan flag is_manual = 1
    db.query(`
      INSERT INTO episode_embed (episode_id, server, resolution, embed_url, is_manual) 
      VALUES (?, ?, ?, ?, 1)
    `).run(
      episode.id,
      data.server,
      data.resolution || "720p",
      data.embedUrl
    );

    // Auto-backup file database setelah menambah embed manual
    telegramBackup.sendDatabaseFile(`🔗 Admin Manual - Embed Baru - ${data.server} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah menambah embed manual:", e)
    );

    return { success: true, message: "Embed berhasil ditambahkan sebagai data manual" };
  } catch (error) {
    console.error("[ADMIN] Error menambah embed manual:", error);
    return { success: false, message: "Error menambah embed" };
  }
}

// Fungsi untuk mendapatkan data manual
export function getManualAnimes(): any[] {
  return db.query("SELECT * FROM anime WHERE is_manual = 1 ORDER BY created_at DESC").all() as any[];
}

export function getManualEpisodes(): any[] {
  return db.query(`
    SELECT e.*, a.title as anime_title, a.slug as anime_slug 
    FROM episode e 
    JOIN anime a ON e.anime_id = a.id 
    WHERE e.is_manual = 1 
    ORDER BY e.created_at DESC
  `).all() as any[];
}

export function getManualEmbeds(): any[] {
  return db.query(`
    SELECT ee.*, e.slug as episode_slug, e.episode_number, a.title as anime_title, a.slug as anime_slug
    FROM episode_embed ee
    JOIN episode e ON ee.episode_id = e.id
    JOIN anime a ON e.anime_id = a.id
    WHERE ee.is_manual = 1
    ORDER BY ee.created_at DESC
  `).all() as any[];
}

// Fungsi untuk mendapatkan statistik database
export function getDatabaseStats() {
  try {
    const totalAnime = db.query("SELECT COUNT(*) as count FROM anime").get() as any;
    const totalEpisodes = db.query("SELECT COUNT(*) as count FROM episode").get() as any;
    const totalEmbeds = db.query("SELECT COUNT(*) as count FROM episode_embed").get() as any;
    const manualAnime = db.query("SELECT COUNT(*) as count FROM anime WHERE is_manual = 1").get() as any;
    const manualEpisodes = db.query("SELECT COUNT(*) as count FROM episode WHERE is_manual = 1").get() as any;
    const manualEmbeds = db.query("SELECT COUNT(*) as count FROM episode_embed WHERE is_manual = 1").get() as any;
    
    return {
      total: {
        anime: totalAnime.count,
        episodes: totalEpisodes.count,
        embeds: totalEmbeds.count
      },
      manual: {
        anime: manualAnime.count,
        episodes: manualEpisodes.count,
        embeds: manualEmbeds.count
      }
    };
  } catch (error) {
    console.error("[ADMIN] Error getting database stats:", error);
    return null;
  }
}

// Fungsi untuk backup data manual ke Telegram
export async function backupManualDataToTelegram(): Promise<{ success: boolean; message: string }> {
  try {
    const anime = getManualAnimes();
    const episodes = getManualEpisodes();
    const embeds = getManualEmbeds();
    
    let message = "📊 **Backup Data Manual**\n\n";
    message += `🎌 **Anime Manual:** ${anime.length}\n`;
    message += `🎬 **Episode Manual:** ${episodes.length}\n`;
    message += `🔗 **Embed Manual:** ${embeds.length}\n\n`;
    
    if (anime.length > 0) {
      message += "**Anime Terbaru:**\n";
      anime.slice(0, 5).forEach(a => {
        message += `• ${a.title} (${a.slug})\n`;
      });
    }
    
    if (episodes.length > 0) {
      message += "\n**Episode Terbaru:**\n";
      episodes.slice(0, 5).forEach(e => {
        message += `• ${e.anime_title} EP${e.episode_number} (${e.slug})\n`;
      });
    }
    
    await telegramBackup.sendMessage(message);
    return { success: true, message: "Backup data manual berhasil dikirim ke Telegram" };
  } catch (error) {
    console.error("[ADMIN] Error backup data manual:", error);
    return { success: false, message: "Error backup data manual" };
  }
}

// Fungsi untuk menghapus data manual
export async function deleteManualData(type: "anime" | "episode" | "embed", id: number): Promise<{ success: boolean; message: string }> {
  try {
    if (type === "anime") {
          db.query("DELETE FROM anime WHERE id = ? AND is_manual = 1").run(id);
  } else if (type === "episode") {
    db.query("DELETE FROM episode WHERE id = ? AND is_manual = 1").run(id);
  } else if (type === "embed") {
    db.query("DELETE FROM episode_embed WHERE id = ? AND is_manual = 1").run(id);
  }
  
  // Auto-backup file database setelah menghapus data manual
  telegramBackup.sendDatabaseFile(`🗑️ Admin Manual - Hapus ${type} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
    console.error(`[ADMIN] Error auto-backup file database setelah menghapus ${type}:`, e)
  );
  
  return { success: true, message: `${type} berhasil dihapus` };
  } catch (error) {
    console.error(`[ADMIN] Error menghapus ${type}:`, error);
    return { success: false, message: `Error menghapus ${type}` };
  }
}

// Fungsi untuk mengubah data anime manual
export async function updateAnimeManual(id: number, data: {
  title?: string;
  cover?: string;
  synopsis?: string;
  status?: string;
  type?: string;
  rating?: number;
  studio?: string;
  producers?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const anime = db.query("SELECT * FROM anime WHERE id = ? AND is_manual = 1").get(id) as any;
    if (!anime) {
      return { success: false, message: "Anime tidak ditemukan atau bukan data manual" };
    }

    // Update fields yang ada
    const updates = [];
    const values = [];
    
    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.cover !== undefined) {
      updates.push("cover = ?");
      values.push(data.cover);
    }
    if (data.synopsis !== undefined) {
      updates.push("synopsis = ?");
      values.push(data.synopsis);
    }
    if (data.status !== undefined) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.type !== undefined) {
      updates.push("type = ?");
      values.push(data.type);
    }
    if (data.rating !== undefined) {
      updates.push("rating = ?");
      values.push(data.rating);
    }
    if (data.studio !== undefined) {
      updates.push("studio = ?");
      values.push(data.studio);
    }
    if (data.producers !== undefined) {
      updates.push("producers = ?");
      values.push(data.producers);
    }

    if (updates.length === 0) {
      return { success: false, message: "Tidak ada data yang diubah" };
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    db.query(`UPDATE anime SET ${updates.join(", ")} WHERE id = ? AND is_manual = 1`).run(...values);

    // Auto-backup file database setelah update anime manual
    telegramBackup.sendDatabaseFile(`🎌 Admin Manual - Update Anime - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah update anime manual:", e)
    );

    return { success: true, message: "Anime berhasil diupdate" };
  } catch (error) {
    console.error("[ADMIN] Error mengubah anime:", error);
    return { success: false, message: "Error mengubah anime" };
  }
}

// Fungsi untuk mengubah data episode manual
export async function updateEpisodeManual(id: number, data: {
  episodeNumber?: number;
  title?: string;
  slug?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const episode = db.query("SELECT * FROM episode WHERE id = ? AND is_manual = 1").get(id) as any;
    if (!episode) {
      return { success: false, message: "Episode tidak ditemukan atau bukan data manual" };
    }

    // Update fields yang ada
    const updates = [];
    const values = [];
    
    if (data.episodeNumber !== undefined) {
      updates.push("episode_number = ?");
      values.push(data.episodeNumber);
    }
    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.slug !== undefined) {
      // Cek apakah slug baru sudah ada
      const existing = db.query("SELECT id FROM episode WHERE slug = ? AND id != ?").get(data.slug, id) as any;
      if (existing) {
        return { success: false, message: "Episode dengan slug tersebut sudah ada" };
      }
      updates.push("slug = ?");
      values.push(data.slug);
    }

    if (updates.length === 0) {
      return { success: false, message: "Tidak ada data yang diubah" };
    }

    values.push(id);

    db.query(`UPDATE episode SET ${updates.join(", ")} WHERE id = ? AND is_manual = 1`).run(...values);

    // Auto-backup file database setelah update episode manual
    telegramBackup.sendDatabaseFile(`🎬 Admin Manual - Update Episode - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah update episode manual:", e)
    );

    return { success: true, message: "Episode berhasil diupdate" };
  } catch (error) {
    console.error("[ADMIN] Error mengubah episode:", error);
    return { success: false, message: "Error mengubah episode" };
  }
}

// Fungsi untuk mengubah data embed manual
export async function updateEmbedManual(id: number, data: {
  server?: string;
  resolution?: string;
  embedUrl?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const embed = db.query("SELECT * FROM episode_embed WHERE id = ? AND is_manual = 1").get(id) as any;
    if (!embed) {
      return { success: false, message: "Embed tidak ditemukan atau bukan data manual" };
    }

    // Update fields yang ada
    const updates = [];
    const values = [];
    
    if (data.server !== undefined) {
      updates.push("server = ?");
      values.push(data.server);
    }
    if (data.resolution !== undefined) {
      updates.push("resolution = ?");
      values.push(data.resolution);
    }
    if (data.embedUrl !== undefined) {
      updates.push("embed_url = ?");
      values.push(data.embedUrl);
    }

    if (updates.length === 0) {
      return { success: false, message: "Tidak ada data yang diubah" };
    }

    values.push(id);

    db.query(`UPDATE episode_embed SET ${updates.join(", ")} WHERE id = ? AND is_manual = 1`).run(...values);

    // Auto-backup file database setelah update embed manual
    telegramBackup.sendDatabaseFile(`🔗 Admin Manual - Update Embed - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah update embed manual:", e)
    );

    return { success: true, message: "Embed berhasil diupdate" };
  } catch (error) {
    console.error("[ADMIN] Error mengubah embed:", error);
    return { success: false, message: "Error mengubah embed" };
  }
}

// Fungsi untuk mengubah SEMUA data anime (tidak hanya manual)
export async function updateAnimeAll(id: number, data: {
  title?: string;
  cover?: string;
  synopsis?: string;
  status?: string;
  type?: string;
  rating?: number;
  studio?: string;
  producers?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const anime = db.query("SELECT * FROM anime WHERE id = ?").get(id) as any;
    if (!anime) {
      return { success: false, message: "Anime tidak ditemukan" };
    }

    // Update fields yang ada
    const updates = [];
    const values = [];
    
    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.cover !== undefined) {
      updates.push("cover = ?");
      values.push(data.cover);
    }
    if (data.synopsis !== undefined) {
      updates.push("synopsis = ?");
      values.push(data.synopsis);
    }
    if (data.status !== undefined) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.type !== undefined) {
      updates.push("type = ?");
      values.push(data.type);
    }
    if (data.rating !== undefined) {
      updates.push("rating = ?");
      values.push(data.rating);
    }
    if (data.studio !== undefined) {
      updates.push("studio = ?");
      values.push(data.studio);
    }
    if (data.producers !== undefined) {
      updates.push("producers = ?");
      values.push(data.producers);
    }

    if (updates.length === 0) {
      return { success: false, message: "Tidak ada data yang diubah" };
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    db.query(`UPDATE anime SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    // Auto-backup file database setelah update anime (semua data)
    telegramBackup.sendDatabaseFile(`🎌 Admin Edit - Update Anime - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah update anime:", e)
    );

    return { success: true, message: "Anime berhasil diupdate" };
  } catch (error) {
    console.error("[ADMIN] Error mengubah anime:", error);
    return { success: false, message: "Error mengubah anime" };
  }
}

// Fungsi untuk mengubah SEMUA data episode (tidak hanya manual)
export async function updateEpisodeAll(id: number, data: {
  episodeNumber?: number;
  title?: string;
  slug?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const episode = db.query("SELECT * FROM episode WHERE id = ?").get(id) as any;
    if (!episode) {
      return { success: false, message: "Episode tidak ditemukan" };
    }

    // Update fields yang ada
    const updates = [];
    const values = [];
    
    if (data.episodeNumber !== undefined) {
      updates.push("episode_number = ?");
      values.push(data.episodeNumber);
    }
    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.slug !== undefined) {
      // Cek apakah slug baru sudah ada
      const existing = db.query("SELECT id FROM episode WHERE slug = ? AND id != ?").get(data.slug, id) as any;
      if (existing) {
        return { success: false, message: "Episode dengan slug tersebut sudah ada" };
      }
      updates.push("slug = ?");
      values.push(data.slug);
    }

    if (updates.length === 0) {
      return { success: false, message: "Tidak ada data yang diubah" };
    }

    values.push(id);

    db.query(`UPDATE episode SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    // Auto-backup file database setelah update episode (semua data)
    telegramBackup.sendDatabaseFile(`🎬 Admin Edit - Update Episode - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah update episode:", e)
    );

    return { success: true, message: "Episode berhasil diupdate" };
  } catch (error) {
    console.error("[ADMIN] Error mengubah episode:", error);
    return { success: false, message: "Error mengubah episode" };
  }
}

// Fungsi untuk mengubah SEMUA data embed (tidak hanya manual)
export async function updateEmbedAll(id: number, data: {
  server?: string;
  resolution?: string;
  embedUrl?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const embed = db.query("SELECT * FROM episode_embed WHERE id = ?").get(id) as any;
    if (!embed) {
      return { success: false, message: "Embed tidak ditemukan" };
    }

    // Update fields yang ada
    const updates = [];
    const values = [];
    
    if (data.server !== undefined) {
      updates.push("server = ?");
      values.push(data.server);
    }
    if (data.resolution !== undefined) {
      updates.push("resolution = ?");
      values.push(data.resolution);
    }
    if (data.embedUrl !== undefined) {
      updates.push("embed_url = ?");
      values.push(data.embedUrl);
    }

    if (updates.length === 0) {
      return { success: false, message: "Tidak ada data yang diubah" };
    }

    values.push(id);

    db.query(`UPDATE episode_embed SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    // Auto-backup file database setelah update embed (semua data)
    telegramBackup.sendDatabaseFile(`🔗 Admin Edit - Update Embed - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error("[ADMIN] Error auto-backup file database setelah update embed:", e)
    );

    return { success: true, message: "Embed berhasil diupdate" };
  } catch (error) {
    console.error("[ADMIN] Error mengubah embed:", error);
    return { success: false, message: "Error mengubah embed" };
  }
}

// Router untuk admin API endpoints
export async function adminRouter(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Cek autentikasi
  const authResponse = checkAuth(req);
  if (authResponse) {
    return authResponse;
  }

  // API endpoints
  if (pathname === "/admin/api/add-anime" && req.method === "POST") {
    return await handleAddAnime(req);
  }
  if (pathname === "/admin/api/add-episode" && req.method === "POST") {
    return await handleAddEpisode(req);
  }
  if (pathname === "/admin/api/add-embed" && req.method === "POST") {
    return await handleAddEmbed(req);
  }
  if (pathname === "/admin/api/delete" && req.method === "POST") {
    return await handleDeleteData(req);
  }
  if (pathname === "/admin/api/data" && req.method === "GET") {
    return handleGetManualData();
  }
  if (pathname === "/admin/api/stats" && req.method === "GET") {
    return handleGetStats();
  }
  if (pathname === "/admin/api/backup" && req.method === "POST") {
    return await handleBackupData(req);
  }
  if (pathname === "/admin/api/test-telegram" && req.method === "POST") {
    return await handleTestTelegram(req);
  }
  if (pathname === "/admin/api/trigger-scraping" && req.method === "POST") {
    return await handleTriggerScraping(req);
  }
  if (pathname === "/admin/api/update-anime" && req.method === "PUT") {
    return await handleUpdateAnime(req);
  }
  if (pathname === "/admin/api/update-episode" && req.method === "PUT") {
    return await handleUpdateEpisode(req);
  }
  if (pathname === "/admin/api/update-embed" && req.method === "PUT") {
    return await handleUpdateEmbed(req);
  }
  if (pathname === "/admin/api/edit-anime" && req.method === "PUT") {
    return await handleEditAnime(req);
  }
  if (pathname === "/admin/api/edit-episode" && req.method === "PUT") {
    return await handleEditEpisode(req);
  }
  if (pathname === "/admin/api/edit-embed" && req.method === "PUT") {
    return await handleEditEmbed(req);
  }
  if (pathname === "/admin/api/trigger-scraping-genre" && req.method === "POST") {
    return await handleTriggerScrapingGenre(req);
  }
  if (pathname === "/admin/api/scrape-episodes" && req.method === "POST") {
    return await handleScrapeEpisodes(req);
  }

  return null; // Tidak ada route yang cocok
}

// API Handlers
async function handleAddAnime(req: Request): Promise<Response> {
  try {
    const data = await req.json();
    const result = await addAnimeManual(data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleAddEpisode(req: Request): Promise<Response> {
  try {
    const data = await req.json();
    const result = await addEpisodeManual(data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleAddEmbed(req: Request): Promise<Response> {
  try {
    const data = await req.json();
    const result = await addEmbedManual(data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleDeleteData(req: Request): Promise<Response> {
  try {
    const { type, id } = await req.json();
    const result = await deleteManualData(type, id);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

export function handleGetManualData(): Response {
  const anime = getManualAnimes();
  const episodes = getManualEpisodes();
  const embeds = getManualEmbeds();
  
  return Response.json({ anime, episodes, embeds });
}

export function handleGetStats(): Response {
  const stats = getDatabaseStats();
  return Response.json(stats);
}

async function handleBackupData(req: Request): Promise<Response> {
  const result = await backupManualDataToTelegram();
  return Response.json(result);
}

async function handleTestTelegram(req: Request): Promise<Response> {
  try {
    const result = await telegramBackup.testConnection();
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error testing Telegram connection" });
  }
}

async function handleTriggerScraping(req: Request): Promise<Response> {
  try {
    console.log("[ADMIN] 🎌 ========================================");
    console.log("[ADMIN] 🎌 ADMIN TRIGGER: MEMULAI SCRAPING ANIME LIST");
    console.log("[ADMIN] 🎌 ========================================");
    
    // Import scraping function
    const { scrapeAllAnime } = await import("./scraper");
    await scrapeAllAnime();
    
    console.log("[ADMIN] 🎌 ========================================");
    console.log("[ADMIN] 🎌 ADMIN TRIGGER: SCRAPING ANIME LIST SELESAI");
    console.log("[ADMIN] 🎌 ========================================");
    
    return Response.json({ success: true, message: "Scraping berhasil dijalankan" });
  } catch (error) {
    console.error("[ADMIN] 🎌 Error triggering scraping:", error);
    return Response.json({ success: false, message: "Error menjalankan scraping" });
  }
}

async function handleTriggerScrapingGenre(req: Request): Promise<Response> {
  try {
    console.log("[ADMIN] 🎭 ========================================");
    console.log("[ADMIN] 🎭 ADMIN TRIGGER: MEMULAI SCRAPING GENRE");
    console.log("[ADMIN] 🎭 ========================================");
    
    // Import scraping function
    const { scrapeAllGenre } = await import("./scraper");
    await scrapeAllGenre();
    
    console.log("[ADMIN] 🎭 ========================================");
    console.log("[ADMIN] 🎭 ADMIN TRIGGER: SCRAPING GENRE SELESAI");
    console.log("[ADMIN] 🎭 ========================================");
    
    return Response.json({ success: true, message: "Scraping genre berhasil dijalankan" });
  } catch (error) {
    console.error("[ADMIN] 🎭 Error triggering scraping genre:", error);
    return Response.json({ success: false, message: "Error menjalankan scraping genre" });
  }
}

async function handleUpdateAnime(req: Request): Promise<Response> {
  try {
    const { id, ...data } = await req.json();
    if (!id) {
      return Response.json({ success: false, message: "ID anime diperlukan" });
    }
    const result = await updateAnimeManual(id, data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleUpdateEpisode(req: Request): Promise<Response> {
  try {
    const { id, ...data } = await req.json();
    if (!id) {
      return Response.json({ success: false, message: "ID episode diperlukan" });
    }
    const result = await updateEpisodeManual(id, data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleUpdateEmbed(req: Request): Promise<Response> {
  try {
    const { id, ...data } = await req.json();
    if (!id) {
      return Response.json({ success: false, message: "ID embed diperlukan" });
    }
    const result = await updateEmbedManual(id, data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleEditAnime(req: Request): Promise<Response> {
  try {
    const { id, ...data } = await req.json();
    if (!id) {
      return Response.json({ success: false, message: "ID anime diperlukan" });
    }
    const result = await updateAnimeAll(id, data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleEditEpisode(req: Request): Promise<Response> {
  try {
    const { id, ...data } = await req.json();
    if (!id) {
      return Response.json({ success: false, message: "ID episode diperlukan" });
    }
    const result = await updateEpisodeAll(id, data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleEditEmbed(req: Request): Promise<Response> {
  try {
    const { id, ...data } = await req.json();
    if (!id) {
      return Response.json({ success: false, message: "ID embed diperlukan" });
    }
    const result = await updateEmbedAll(id, data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

async function handleScrapeEpisodes(req: Request): Promise<Response> {
  try {
    const { animeSlug } = await req.json();
    if (!animeSlug) {
      return Response.json({ success: false, message: "animeSlug is required" });
    }
    
    const result = await scrapeAnimeEpisodesOnDemand(animeSlug);
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, message: "Error parsing request" });
  }
}

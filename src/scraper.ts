import axios from "axios";
import { load } from "cheerio";
import type * as cheerio from "cheerio";
import { db } from "./db";
import { telegramBackup } from "./telegram";

const BASE_URL = "https://samehadaku.now";

// Intelligent Rate Limiting System
class SmartRateLimiter {
  private requestCount = 0;
  private lastRequestTime = 0;
  private consecutiveErrors = 0;
  private baseDelay = 3000; // 3 detik base delay
  private maxDelay = 30000; // 30 detik max delay
  private successStreak = 0;
  private errorStreak = 0;
  
  // Adaptive delay berdasarkan performance
  private getAdaptiveDelay(): number {
    const errorRate = this.errorStreak / Math.max(this.requestCount, 1);
    
    if (errorRate > 0.3) {
      // Jika error rate tinggi, increase delay
      return Math.min(this.baseDelay * 2, this.maxDelay);
    } else if (errorRate < 0.1 && this.successStreak > 5) {
      // Jika performance bagus, decrease delay
      return Math.max(this.baseDelay * 0.5, 1000);
    } else {
      // Default delay dengan random factor
      return this.baseDelay + Math.random() * 2000;
    }
  }
  
  // Exponential backoff untuk error
  getBackoffDelay(): number {
    const backoffMultiplier = Math.pow(2, this.consecutiveErrors);
    return Math.min(this.baseDelay * backoffMultiplier, this.maxDelay);
  }
  
  // Smart delay sebelum request
  async smartDelay(): Promise<void> {
    const delay = this.getAdaptiveDelay();
    console.log(`[SMART RATE LIMITER] ⏳ Adaptive delay: ${Math.round(delay/1000)}s (errors: ${this.consecutiveErrors}, success: ${this.successStreak})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // Record successful request
  recordSuccess(): void {
    this.requestCount++;
    this.consecutiveErrors = 0;
    this.successStreak++;
    this.errorStreak = Math.max(0, this.errorStreak - 1);
    this.lastRequestTime = Date.now();
  }
  
  // Record failed request
  recordError(): void {
    this.requestCount++;
    this.consecutiveErrors++;
    this.successStreak = 0;
    this.errorStreak++;
    this.lastRequestTime = Date.now();
  }
  
  // Get status
  getStatus(): any {
    return {
      requestCount: this.requestCount,
      consecutiveErrors: this.consecutiveErrors,
      successStreak: this.successStreak,
      errorStreak: this.errorStreak,
      errorRate: this.errorStreak / Math.max(this.requestCount, 1)
    };
  }
}

// Global rate limiter instance
const smartRateLimiter = new SmartRateLimiter();

// Rotating User Agents untuk menghindari blocking
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Enhanced headers untuk menghindari blocking
function getEnhancedHeaders(): any {
  return {
    "User-Agent": getRandomUserAgent(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0"
  };
}

// Create axios instance dengan enhanced headers
const axiosInstance = axios.create({
  timeout: 30000, // 30 detik timeout
  headers: getEnhancedHeaders()
});

// Smart request wrapper dengan enhanced error handling
async function smartRequest(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Smart delay sebelum request
      await smartRateLimiter.smartDelay();
      
      // Update headers setiap request untuk menghindari pattern detection
      axiosInstance.defaults.headers = getEnhancedHeaders();
      
      console.log(`[SMART REQUEST] 🔄 Attempt ${attempt}/${retries} for ${url}`);
      const response = await axiosInstance.get(url);
      
      // Record success
      smartRateLimiter.recordSuccess();
      console.log(`[SMART REQUEST] ✅ Success on attempt ${attempt}`);
      
      return response;
      
    } catch (error: any) {
      console.log(`[SMART REQUEST] ❌ Attempt ${attempt} failed: ${error.message}`);
      
      // Record error
      smartRateLimiter.recordError();
      
      if (error.response?.status === 403) {
        console.log(`[SMART REQUEST] ⚠️ Access forbidden (403), mungkin diblokir. Mencoba dengan delay lebih lama...`);
        const blockDelay = 15000 + Math.random() * 15000; // 15-30 detik untuk 403
        console.log(`[SMART REQUEST] ⏳ Block delay: ${Math.round(blockDelay/1000)}s`);
        await new Promise(resolve => setTimeout(resolve, blockDelay));
      } else if (error.response?.status === 429) {
        console.log(`[SMART REQUEST] ⚠️ Rate limit hit, using exponential backoff...`);
        const backoffDelay = smartRateLimiter.getBackoffDelay();
        console.log(`[SMART REQUEST] ⏳ Backoff delay: ${Math.round(backoffDelay/1000)}s`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else if (error.response?.status >= 500) {
        // Server error, wait longer
        console.log(`[SMART REQUEST] ⚠️ Server error ${error.response.status}, waiting 10s...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
        // Connection issues, wait and retry
        console.log(`[SMART REQUEST] ⚠️ Connection issue ${error.code}, waiting 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // If last attempt, throw error
      if (attempt === retries) {
        throw error;
      }
    }
  }
}

export async function scrapeAllAnime(skipDetection = false) {
  let animeCount = 0;
  console.log("[SCRAPER] Memulai scraping anime list...");
  
  // Backup progress setiap 5 halaman
  let progressBackupCount = 0;
  
  // Auto detect jumlah page atau set limit tinggi
  const MAX_PAGES = 1000; // Set limit tinggi untuk handle update
  let totalPages = 21; // Default, akan di-update jika ada lebih banyak
  
  // Skip detection jika diminta (untuk speed)
  if (skipDetection) {
    console.log("[SCRAPER] ⚡ Skip detection, langsung gunakan limit tinggi untuk speed");
    totalPages = MAX_PAGES;
  } else {
    // Cek halaman terakhir untuk auto detect dengan method yang lebih cepat
    try {
      console.log("[SCRAPER] Mencoba detect jumlah halaman terakhir dengan method cepat...");
      
      // Method 1: Cek halaman 100 dulu (lebih cepat dari 1000)
      const quickTestUrl = `${BASE_URL}/daftar-anime-2/page/100/`;
      const { data: quickData } = await smartRequest(quickTestUrl);
      const $quick = load(quickData);
      const quickList = $quick("article .animepost");
      
      if (quickList.length > 0) {
        console.log(`[SCRAPER] ✅ Halaman 100 masih ada anime, gunakan limit tinggi`);
        totalPages = MAX_PAGES;
      } else {
        // Method 2: Binary search untuk cari halaman terakhir yang cepat
        console.log("[SCRAPER] Melakukan binary search untuk halaman terakhir...");
        let left = 21;
        let right = 100;
        let lastValidPage = 21;
        
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          try {
            const testUrl = `${BASE_URL}/daftar-anime-2/page/${mid}/`;
            const { data: testData } = await smartRequest(testUrl);
            const $$ = load(testData);
            const testList = $$("article .animepost");
            
            if (testList.length > 0) {
              lastValidPage = mid;
              left = mid + 1; // Cari yang lebih tinggi
            } else {
              right = mid - 1; // Cari yang lebih rendah
            }
          } catch (e) {
            right = mid - 1; // Halaman tidak ada, cari yang lebih rendah
          }
        }
        
        totalPages = lastValidPage;
        console.log(`[SCRAPER] ✅ Ditemukan halaman terakhir: ${totalPages} (dengan binary search)`);
      }
    } catch (error) {
      console.log(`[SCRAPER] ⚠️ Tidak bisa detect halaman terakhir, gunakan default: ${totalPages}`);
    }
  }
  
  console.log(`[SCRAPER] Akan scrape dari page 1 sampai ${totalPages}...`);
  
  // Scrap dari page 1 sampai totalPages
  for (let page = 1; page <= totalPages; page++) {
    console.log(`[SCRAPER] Scraping page ${page}/${totalPages}...`);
    
    const url = `${BASE_URL}/daftar-anime-2/${page > 1 ? `page/${page}/` : ""}`;
    
    try {
      const { data } = await smartRequest(url);
      const $ = load(data);
      const list = $("article .animepost");
      
      if (list.length === 0) {
        console.log(`[SCRAPER] No more anime found on page ${page}, stopping...`);
        break;
      }
      
      let pageAnimeCount = 0;
      list.each((_: number, el: any) => {
        const title = $(el).find(".title").text().trim();
        const href = $(el).find("a").attr("href") || "";
        const slug = href.split("/").filter(Boolean).pop() || "";
        const cover = $(el).find("img").attr("src") || "";
        
        if (slug && title) {
          // Cek apakah anime sudah ada dan manual
          const existingAnime = db.query("SELECT is_manual FROM anime WHERE slug = ?").get(slug) as any;
          
          if (existingAnime && existingAnime.is_manual === 1) {
            console.log(`[SCRAPER] ⏭️ ${title} adalah data manual admin, skip scraping...`);
          } else {
            // Simpan ke database (skeleton, insert or ignore)
            const result = db.query(
              `INSERT OR IGNORE INTO anime (slug, title, cover) VALUES (?, ?, ?)`
            ).run(slug, title, cover);
            
            if (result.changes > 0) {
              animeCount++;
              pageAnimeCount++;
              console.log(`[SCRAPER] ✅ ${title} berhasil di scrap dan disimpan ke database`);
              
              // Backup anime baru ke Telegram
              if (title) {
              telegramBackup.backupNewAnime(title, slug).catch(e => 
                console.error("[SCRAPER] Error backup anime ke Telegram:", e)
              );
              }
              
              // Scrap detail anime untuk episode dengan smart delay
              setTimeout(() => {
                scrapeAnimeDetail(slug).catch(e => {
                  console.error(`[SCRAPER] ❌ Error scrap detail ${slug}:`, e);
                  telegramBackup.backupError(`Scrap detail anime ${slug}`, e).catch(() => {});
                });
              }, 1000 + Math.random() * 2000); // Smart delay 1-3 detik
            } else {
              console.log(`[SCRAPER] ⏭️ ${title} sudah ada di database, skip...`);
            }
          }
        }
      });
      
      console.log(`[SCRAPER] Page ${page} selesai, anime baru: ${pageAnimeCount}, total: ${animeCount}`);
      
      // Backup progress setiap 10 halaman (kurangi frekuensi)
      progressBackupCount++;
      if (progressBackupCount >= 10) {
        telegramBackup.backupScrapingProgress(page, totalPages, animeCount).catch(e => 
          console.error("[SCRAPER] Error backup progress ke Telegram:", e)
        );
        progressBackupCount = 0;
      }
      
    } catch (error: any) {
      console.error(`[SCRAPER] ❌ Error pada page ${page}:`, error);
      telegramBackup.backupError(`Scrap page ${page}`, error).catch(() => {});
      break; // Stop jika ada error
    }
  }
  
  console.log(`[SCRAPER] ✅ Selesai scrap ${animeCount} anime baru dari ${totalPages} halaman.`);
  
  // Backup final stats
  telegramBackup.backupDatabaseStats().catch(e => 
    console.error("[SCRAPER] Error backup final stats ke Telegram:", e)
  );
  
  // Auto-backup file database setelah scraping selesai (jika ada anime baru)
  if (animeCount > 0) {
    console.log("[SCRAPER] Auto-backup file database setelah scraping selesai...");
    telegramBackup.sendDatabaseFile("Auto Backup Database - Setelah Scraping - " + new Date().toLocaleString('id-ID')).catch(e => 
      console.error("[SCRAPER] Error auto-backup file database:", e)
    );
  }
}

export async function scrapeAnimeDetail(animeSlug: string) {
  console.log(`[SCRAPER] Memulai scraping detail anime: ${animeSlug}`);
  
  try {
    const url = `${BASE_URL}/anime/${animeSlug}`;
    const { data } = await smartRequest(url);
    const $ = load(data);
    
    // Ambil detail anime termasuk studio dan producers
    const animeTitle = $("h2.entry-title").text().trim().replace("Nonton Anime ", "");
    const synopsis = $(".desc p").text().trim();
    const ratingText = $(".rt").text().trim();
    const rating = parseFloat(ratingText.split("/")[0]?.trim() || "0") || 0;
    
    // Ambil studio dan producers dari spe text
    const speText = $(".spe").text().trim();
    const statusMatch = speText.match(/Status\s+(\w+)/);
    const typeMatch = speText.match(/Type\s+(\w+)/);
    
    // Regex yang lebih tepat untuk studio dan producer
    const studioMatch = speText.match(/Studio\s+([^\n\r]+)/);
    const producersMatch = speText.match(/Producers?\s+([^\n\r]+)/);
    
    const status = statusMatch?.[1] || "Ongoing";
    const type = typeMatch?.[1] || "TV";
    const studio = studioMatch?.[1]?.trim() || null;
    const producers = producersMatch?.[1]?.trim() || null;
    
    // Ambil genre dari halaman
    const genreRaw = $(".genre-info").text().trim();
    let genre: string[] = [];
    
    if (genreRaw) {
      // Gunakan pendekatan yang lebih tepat untuk memisahkan genre
      let processedText = genreRaw
        .replace(/Slice of Life/g, "SliceOfLife")
        .replace(/Sci-Fi/g, "SciFi")
        .replace(/Super Power/g, "SuperPower")
        .replace(/Team Sports/g, "TeamSports");
      
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
            if (genreParts[i + 1] === "Of" && genreParts[i + 2] === "Life") {
              restoredGenre.push("Slice of Life");
              i += 2;
            } else {
              restoredGenre.push(part);
            }
            break;
          case "Sci":
            if (genreParts[i + 1] === "Fi") {
              restoredGenre.push("Sci-Fi");
              i += 1;
            } else {
              restoredGenre.push(part);
            }
            break;
          case "Super":
            if (genreParts[i + 1] === "Power") {
              restoredGenre.push("Super Power");
              i += 1;
            } else {
              restoredGenre.push(part);
            }
            break;
          case "Team":
            if (genreParts[i + 1] === "Sports") {
              restoredGenre.push("Team Sports");
              i += 1;
            } else {
              restoredGenre.push(part);
            }
            break;
          default:
            restoredGenre.push(part);
        }
      }
      
      genre = restoredGenre;
    }
    
    // Update anime dengan detail yang lebih lengkap
    const anime = db.query("SELECT id FROM anime WHERE slug = ?").get(animeSlug) as any;
    if (anime) {
    db.query(`
        UPDATE anime SET 
          synopsis = ?, 
          status = ?, 
          type = ?, 
          rating = ?, 
          studio = ?, 
          producers = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(synopsis, status, type, rating, studio, producers, anime.id);
      
      // Hapus genre lama dan tambah yang baru
      db.query("DELETE FROM anime_genre WHERE anime_id = ?").run(anime.id);
      
      // Tambah genre baru
      for (const g of genre) {
        db.query("INSERT INTO anime_genre (anime_id, genre) VALUES (?, ?)").run(anime.id, g);
      }
      
      console.log(`[SCRAPER] ✅ Detail anime ${animeSlug} berhasil diupdate`);
    }
    
  } catch (error: any) {
    console.error(`[SCRAPER] ❌ Error scraping detail anime ${animeSlug}:`, error);
    telegramBackup.backupError(`Scrap detail anime ${animeSlug}`, error).catch(() => {});
  }
}

export async function scrapeAnimeByGenre(genre: string, skipDetection = false) {
  console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Memulai scraping anime genre: ${genre}`);
  
  const BASE_URL = "https://samehadaku.now";
  const MAX_PAGES = 30; // Turunkan lagi untuk lebih cepat
  let totalPages = 21; // Default, will be updated
  
  if (skipDetection) {
    console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ⚡ Skip detection, langsung gunakan limit ${MAX_PAGES} untuk speed`);
    totalPages = MAX_PAGES;
  } else {
    try {
      console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Mencoba detect jumlah halaman terakhir dengan method cepat...`);
      const quickTestUrl = `${BASE_URL}/genre/${genre}/page/100/`;
      const { data: quickData } = await axiosInstance.get(quickTestUrl);
      const $quick = load(quickData);
      const quickList = $quick("article .animepost");
      
      if (quickList.length > 0) {
        console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ✅ Halaman 100 masih ada anime, gunakan limit tinggi`);
        totalPages = MAX_PAGES;
      } else {
        console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Melakukan binary search untuk halaman terakhir...`);
        let left = 1;
        let right = 30; // Turunkan lagi untuk lebih cepat
        let lastValidPage = 1;
        
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          try {
            const testUrl = `${BASE_URL}/genre/${genre}/page/${mid}/`;
            const { data: testData } = await axiosInstance.get(testUrl);
            const $$ = load(testData);
            const testList = $$("article .animepost");
            
            if (testList.length > 0) {
              lastValidPage = mid;
              left = mid + 1;
            } else {
              right = mid - 1;
            }
          } catch (e) {
            right = mid - 1;
          }
        }
        totalPages = lastValidPage;
        console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ✅ Ditemukan halaman terakhir: ${totalPages} (dengan binary search)`);
      }
    } catch (error) {
      console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ⚠️ Tidak bisa detect halaman terakhir, gunakan default: ${totalPages}`);
    }
  }
  
  console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Akan scrape dari page 1 sampai ${totalPages}...`);
  
  let totalNewAnime = 0;
  
  for (let page = 1; page <= totalPages; page++) {
    try {
      console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Scraping page ${page}/${totalPages}...`);
      const url = page === 1 
        ? `${BASE_URL}/genre/${genre}/`
        : `${BASE_URL}/genre/${genre}/page/${page}/`;
      
      console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] URL: ${url}`);
      
      const { data } = await axiosInstance.get(url);
      const $ = load(data);
      
      const animeList = $("article .animepost");
      let pageNewAnime = 0;
      
      console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Ditemukan ${animeList.length} anime di page ${page}`);
      
      // Auto-detect: stop jika tidak ada anime lagi
      if (animeList.length === 0) {
        console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] No more anime found on page ${page}, stopping...`);
        break;
      }
      
      // Debug: cek apakah ada selector lain (hanya untuk debugging)
      if (animeList.length === 0) {
        const altSelectors = [
          "article .animepost",
          ".animepost", 
          "article",
          ".anime-list .anime-item",
          ".anime-grid .anime-item"
        ];
        
        for (const selector of altSelectors) {
          const testList = $(selector);
          console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Selector "${selector}": ${testList.length} items`);
        }
      }
      
      for (let i = 0; i < animeList.length; i++) {
        const anime = animeList.eq(i);
        
        // Coba beberapa selector yang mungkin benar untuk title
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
        
        // Dari scan, title sebenarnya ada di dalam text elemen animepost
        if (!title) {
          const fullText = anime.text().trim();
          // Ambil baris pertama yang berisi judul anime
          const lines = fullText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length > 0) {
            title = lines[0];
          }
        }
        
        const slug = anime.find("a").attr("href")?.split("/").filter(Boolean).pop() || "";
        const cover = anime.find("img").attr("src") || "";
        
        console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Debug - Title: "${title}", Slug: "${slug}"`);
        
        if (!slug) continue;
        
        // Check if anime already exists
        const existingAnime = db.query("SELECT id FROM anime WHERE slug = ?").get(slug) as any;
        if (existingAnime) {
          console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ⏭️ ${title} sudah ada di database, skip...`);
          continue;
        }
        
        // Insert new anime
        db.query(`
          INSERT INTO anime (slug, title, cover, is_manual) 
          VALUES (?, ?, ?, 0)
        `).run(slug, title || "", cover);
        
        console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ✅ ${title} berhasil ditambahkan`);
        pageNewAnime++;
        totalNewAnime++;
        
        // Backup anime baru ke Telegram
        if (title) {
        telegramBackup.backupNewAnime(title, slug).catch(e => 
          console.error(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Error backup anime ke Telegram:`, e)
        );
        }
        
        // Scrape detail anime untuk mendapatkan genre
        await scrapeAnimeDetail(slug);
      }
      
      console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Page ${page} selesai, anime baru: ${pageNewAnime}, total: ${totalNewAnime}`);
      
      // Progress backup setiap 10 halaman (dari 5 halaman)
      if (page % 10 === 0) {
        telegramBackup.backupScrapingProgress(`🎭 Genre ${genre}: Page ${page}/${totalPages} - ${totalNewAnime} anime baru`).catch(e =>
          console.error(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Error backup progress:`, e)
        );
      }
      
      // Delay untuk menghindari rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.error(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ❌ Error scraping page ${page}:`, error.message);
      telegramBackup.backupError(`Scraping genre ${genre} page ${page}`, error).catch(() => {});
    }
  }
  
  console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ========================================`);
  console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] SELESAI SCRAPING GENRE: ${genre.toUpperCase()}`);
  console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Total anime baru: ${totalNewAnime}`);
  console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] ========================================`);
  
  telegramBackup.backupScrapingProgress(`🎭 Genre ${genre}: ${totalNewAnime} anime baru`);
  
  // Auto-backup file database jika ada anime baru dari genre
  if (totalNewAnime > 0) {
    console.log(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Auto-backup file database setelah scraping genre...`);
    telegramBackup.sendDatabaseFile(`🎭 Auto Backup Database - Genre ${genre.toUpperCase()} - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error(`[SCRAPER] 🎭 [GENRE: ${genre.toUpperCase()}] Error auto-backup file database:`, e)
    );
  }
  
  return totalNewAnime;
}

export async function scrapeAllGenre() {
  console.log("[SCRAPER] 🎭 ========================================");
  console.log("[SCRAPER] 🎭 MEMULAI SCRAPING SEMUA GENRE");
  console.log("[SCRAPER] 🎭 ========================================");
  
  const genres = [
    "action", "adventure", "comedy", "drama", "fantasy", 
    "horror", "romance", "school", "sci-fi", "slice-of-life",
    "super-power", "supernatural", "shounen", "seinen"
  ];
  
  // Tambahkan log untuk debugging
  console.log(`[SCRAPER] 🎭 Total genre yang akan di-scrape: ${genres.length}`);
  console.log(`[SCRAPER] 🎭 Genre list: ${genres.join(', ')}`);
  
  let totalNewAnime = 0;
  let genreCount = 0;
  
  console.log(`[SCRAPER] 🎭 Akan scrape ${genres.length} genre: ${genres.join(', ')}`);
  
  for (const genre of genres) {
    genreCount++;
    try {
      console.log(`\n[SCRAPER] 🎭 [${genreCount}/${genres.length}] Scraping genre: ${genre}`);
      telegramBackup.addLog(`Genre Scraping: Memulai genre ${genre} (${genreCount}/${genres.length})`);
      
      const newAnime = await scrapeAnimeByGenre(genre, true); // Speed mode
      totalNewAnime += newAnime;
      
      console.log(`[SCRAPER] 🎭 [${genreCount}/${genres.length}] Genre ${genre} selesai, anime baru: ${newAnime}`);
      telegramBackup.addLog(`Genre Scraping: Genre ${genre} selesai, ${newAnime} anime baru`);
      
      // Progress backup untuk setiap genre yang selesai
      telegramBackup.backupScrapingProgress(`🎭 Genre ${genre} selesai: ${newAnime} anime baru (${genreCount}/${genres.length})`).catch(e =>
        console.error(`[SCRAPER] 🎭 Error backup progress genre ${genre}:`, e)
      );
      
      // Delay antar genre
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`[SCRAPER] 🎭 ❌ Error scraping genre ${genre}:`, error.message);
      telegramBackup.backupError(`Scraping genre ${genre}`, error).catch(() => {});
    }
  }
  
  console.log(`\n[SCRAPER] 🎭 ========================================`);
  console.log(`[SCRAPER] 🎭 SELESAI SCRAPING SEMUA GENRE`);
  console.log(`[SCRAPER] 🎭 Total anime baru: ${totalNewAnime}`);
  console.log(`[SCRAPER] 🎭 Total genre yang di-scrape: ${genreCount}`);
  console.log(`[SCRAPER] 🎭 ========================================`);
  
  telegramBackup.backupScrapingProgress(`🎭 Genre Scraping Selesai: ${totalNewAnime} anime baru dari ${genreCount} genre`);
  
  // Auto-backup file database jika ada anime baru dari semua genre
  if (totalNewAnime > 0) {
    console.log(`[SCRAPER] 🎭 Auto-backup file database setelah scraping semua genre...`);
    telegramBackup.sendDatabaseFile(`🎭 Auto Backup Database - All Genre Scraping - ${new Date().toLocaleString('id-ID')}`).catch(e => 
      console.error(`[SCRAPER] 🎭 Error auto-backup file database setelah scraping semua genre:`, e)
    );
  }
  
  return totalNewAnime;
}

export function startScraperScheduler() {
  // Test Telegram connection saat startup
  telegramBackup.testConnection().catch(e => 
    console.error("[SCRAPER] Error test Telegram connection:", e)
  );
  
  // Scrap anime list setiap 30 menit (dengan detection) - INCREASED dari 20 menit
  setInterval(() => {
    console.log("[SCRAPER] Running scheduled anime scraping...");
    telegramBackup.addLog("Scheduler: Memulai scraping anime list");
    scrapeAllAnime(false).catch((e) => {
      console.error("[SCRAPER] Error:", e);
      telegramBackup.backupError("Scheduled anime scraping", e).catch(() => {});
    });
  }, 30 * 60 * 1000); // 30 menit (dari 20 menit)
  
  // Genre scraping sekarang real-time, tidak lagi menggunakan scheduler
  
  // Scrap anime list setiap 8 jam (speed mode tanpa detection) - INCREASED dari 6 jam
  setInterval(() => {
    console.log("[SCRAPER] Running scheduled anime scraping (speed mode)...");
    telegramBackup.addLog("Scheduler: Memulai scraping anime list (speed mode)");
    scrapeAllAnime(true).catch((e) => {
      console.error("[SCRAPER] Error:", e);
      telegramBackup.backupError("Scheduled anime scraping (speed mode)", e).catch(() => {});
    });
  }, 8 * 60 * 60 * 1000); // 8 jam (dari 6 jam)
  
  // Scrap episode detail setiap 60 menit - INCREASED dari 30 menit
  setInterval(async () => {
    console.log("[SCRAPER] Running scheduled episode detail scraping...");
    telegramBackup.addLog("Scheduler: Memulai scraping episode detail");
    try {
      const animes = db.query("SELECT slug FROM anime ORDER BY created_at DESC LIMIT 5").all() as any[]; // REDUCED dari 10
      for (const anime of animes) {
        await scrapeAnimeDetail(anime.slug);
        await new Promise(resolve => setTimeout(resolve, 5000)); // INCREASED delay dari 2 detik ke 5 detik
      }
    } catch (e) {
      console.error("[SCRAPER] Error scraping episode details:", e);
      telegramBackup.backupError("Scheduled episode detail scraping", e).catch(() => {});
    }
  }, 60 * 60 * 1000); // 60 menit (dari 30 menit)
  
  // Kirim log buffer setiap 15 menit - INCREASED dari 10 menit
  setInterval(() => {
    telegramBackup.sendLogBuffer().catch(e => 
      console.error("[SCRAPER] Error send log buffer:", e)
    );
  }, 15 * 60 * 1000); // 15 menit (dari 10 menit)
  
  // Auto-backup file database setiap 8 jam - INCREASED dari 6 jam
  setInterval(() => {
    console.log("[SCRAPER] Running scheduled database file backup...");
    telegramBackup.addLog("Scheduler: Memulai backup file database");
    telegramBackup.sendDatabaseFile("Auto Backup Database - " + new Date().toLocaleString('id-ID')).catch(e => {
      console.error("[SCRAPER] Error backup file database:", e);
      telegramBackup.backupError("Scheduled database file backup", e).catch(() => {});
    });
  }, 8 * 60 * 60 * 1000); // 8 jam (dari 6 jam)
  
  console.log("[SCRAPER] Scheduler started (anime list: 30min, genre: real-time, episode details: 60min, log buffer: 15min, db file: 8h)");
}

// Export untuk monitoring
export { smartRateLimiter };
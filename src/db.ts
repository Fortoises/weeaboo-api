import { Database } from "bun:sqlite";
import { telegramBackup } from "./telegram";

// Konfigurasi database
const DB_NAME = Bun.env.DB_NAME || "weeaboo.sqlite";

const rawDb = new Database(DB_NAME);

// Database wrapper untuk auto backup
class DatabaseWrapper {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  // Wrapper untuk query dengan auto backup
  query(sql: string) {
    const originalQuery = this.db.query(sql);
    
    return {
      ...originalQuery,
      run: (...params: any[]) => {
        const result = originalQuery.run(...params);
        this.handleDatabaseChange(sql, params, result);
        return result;
      },
      get: (...params: any[]) => {
        return originalQuery.get(...params);
      },
      all: (...params: any[]) => {
        return originalQuery.all(...params);
      }
    };
  }

  // Handle database changes untuk auto backup
  private handleDatabaseChange(sql: string, params: any[], result: any): void {
    try {
      const sqlUpper = sql.toUpperCase().trim();
      
      // Deteksi jenis operasi
      if (sqlUpper.startsWith('INSERT')) {
        this.handleInsert(sql, params, result);
      } else if (sqlUpper.startsWith('UPDATE')) {
        this.handleUpdate(sql, params, result);
      } else if (sqlUpper.startsWith('DELETE')) {
        this.handleDelete(sql, params, result);
      }
    } catch (error) {
      console.error("[DB WRAPPER] Error handling database change:", error);
    }
  }

  // Handle INSERT operations
  private handleInsert(sql: string, params: any[], result: any): void {
    if (result.changes === 0) return; // Tidak ada perubahan

    const sqlUpper = sql.toUpperCase();
    
    if (sqlUpper.includes('INSERT INTO ANIME')) {
      // Anime insert
      const title = params[1] || 'Unknown';
      const slug = params[0] || 'unknown';
      telegramBackup.autoBackupAnimeInsert(title, slug);
      
    } else if (sqlUpper.includes('INSERT INTO EPISODE')) {
      // Episode insert
      const episodeNumber = params[1] || 1;
      const episodeSlug = params[2] || 'unknown';
      const animeId = params[0];
      
      // Get anime title
      const anime = this.db.query("SELECT title FROM anime WHERE id = ?").get(animeId) as any;
      const animeTitle = anime?.title || 'Unknown Anime';
      
      telegramBackup.autoBackupEpisodeInsert(animeTitle, episodeNumber, episodeSlug);
      
    } else if (sqlUpper.includes('INSERT INTO EPISODE_EMBED')) {
      // Embed insert
      const episodeId = params[0];
      const server = params[1] || 'Unknown';
      const resolution = params[2] || 'Unknown';
      
      // Get anime and episode info
      const episodeInfo = this.db.query(`
        SELECT e.episode_number, a.title as anime_title 
        FROM episode e 
        JOIN anime a ON e.anime_id = a.id 
        WHERE e.id = ?
      `).get(episodeId) as any;
      
      if (episodeInfo) {
        telegramBackup.autoBackupEmbedInsert(
          episodeInfo.anime_title, 
          episodeInfo.episode_number, 
          [{ server, resolution }]
        );
      }
      
    } else if (sqlUpper.includes('INSERT INTO ANIME_GENRE')) {
      // Genre insert
      const animeId = params[0];
      const genre = params[1] || 'Unknown';
      
      // Get anime title
      const anime = this.db.query("SELECT title FROM anime WHERE id = ?").get(animeId) as any;
      const animeTitle = anime?.title || 'Unknown Anime';
      
      telegramBackup.autoBackupGenreInsert(animeTitle, genre);
    }
  }

  // Handle UPDATE operations
  private handleUpdate(sql: string, params: any[], result: any): void {
    if (result.changes === 0) return; // Tidak ada perubahan

    const sqlUpper = sql.toUpperCase();
    
    if (sqlUpper.includes('UPDATE ANIME')) {
      // Anime update
      const id = params[params.length - 1]; // ID biasanya di akhir
      const anime = this.db.query("SELECT title, slug FROM anime WHERE id = ?").get(id) as any;
      
      if (anime) {
        const changes = this.detectChanges(sql, params);
        telegramBackup.autoBackupAnimeUpdate(id, anime.title, anime.slug, changes);
      }
      
    } else if (sqlUpper.includes('UPDATE EPISODE')) {
      // Episode update
      const id = params[params.length - 1]; // ID biasanya di akhir
      const episodeInfo = this.db.query(`
        SELECT e.episode_number, e.slug, a.title as anime_title 
        FROM episode e 
        JOIN anime a ON e.anime_id = a.id 
        WHERE e.id = ?
      `).get(id) as any;
      
      if (episodeInfo) {
        const changes = this.detectChanges(sql, params);
        telegramBackup.autoBackupEpisodeUpdate(
          episodeInfo.anime_title, 
          episodeInfo.episode_number, 
          episodeInfo.slug, 
          changes
        );
      }
      
    } else if (sqlUpper.includes('UPDATE EPISODE_EMBED')) {
      // Embed update
      const id = params[params.length - 1]; // ID biasanya di akhir
      const embedInfo = this.db.query(`
        SELECT ee.server, ee.resolution, e.episode_number, a.title as anime_title 
        FROM episode_embed ee
        JOIN episode e ON ee.episode_id = e.id 
        JOIN anime a ON e.anime_id = a.id 
        WHERE ee.id = ?
      `).get(id) as any;
      
      if (embedInfo) {
        const changes = this.detectChanges(sql, params);
        telegramBackup.autoBackupEmbedUpdate(
          embedInfo.anime_title, 
          embedInfo.episode_number, 
          embedInfo.server, 
          embedInfo.resolution, 
          changes
        );
      }
    }
  }

  // Handle DELETE operations
  private handleDelete(sql: string, params: any[], result: any): void {
    if (result.changes === 0) return; // Tidak ada perubahan

    const sqlUpper = sql.toUpperCase();
    
    if (sqlUpper.includes('DELETE FROM ANIME')) {
      // Anime delete - perlu ambil data sebelum dihapus
      const id = params[0];
      const anime = this.db.query("SELECT title, slug FROM anime WHERE id = ?").get(id) as any;
      
      if (anime) {
        telegramBackup.autoBackupAnimeDelete(anime.title, anime.slug);
      }
      
    } else if (sqlUpper.includes('DELETE FROM EPISODE')) {
      // Episode delete - perlu ambil data sebelum dihapus
      const id = params[0];
      const episodeInfo = this.db.query(`
        SELECT e.episode_number, e.slug, a.title as anime_title 
        FROM episode e 
        JOIN anime a ON e.anime_id = a.id 
        WHERE e.id = ?
      `).get(id) as any;
      
      if (episodeInfo) {
        telegramBackup.autoBackupEpisodeDelete(
          episodeInfo.anime_title, 
          episodeInfo.episode_number, 
          episodeInfo.slug
        );
      }
      
    } else if (sqlUpper.includes('DELETE FROM EPISODE_EMBED')) {
      // Embed delete - perlu ambil data sebelum dihapus
      const id = params[0];
      const embedInfo = this.db.query(`
        SELECT ee.server, ee.resolution, e.episode_number, a.title as anime_title 
        FROM episode_embed ee
        JOIN episode e ON ee.episode_id = e.id 
        JOIN anime a ON e.anime_id = a.id 
        WHERE ee.id = ?
      `).get(id) as any;
      
      if (embedInfo) {
        telegramBackup.autoBackupEmbedDelete(
          embedInfo.anime_title, 
          embedInfo.episode_number, 
          embedInfo.server, 
          embedInfo.resolution
        );
      }
      
    } else if (sqlUpper.includes('DELETE FROM ANIME_GENRE')) {
      // Genre delete - perlu ambil data sebelum dihapus
      const animeId = params[0];
      const genre = params[1];
      
      const anime = this.db.query("SELECT title FROM anime WHERE id = ?").get(animeId) as any;
      const animeTitle = anime?.title || 'Unknown Anime';
      
      telegramBackup.autoBackupGenreDelete(animeTitle, genre);
    }
  }

  // Detect changes dari SQL dan parameters
  private detectChanges(sql: string, params: any[]): string[] {
    const changes: string[] = [];
    const sqlUpper = sql.toUpperCase();
    
    if (sqlUpper.includes('TITLE = ?')) changes.push('title');
    if (sqlUpper.includes('SLUG = ?')) changes.push('slug');
    if (sqlUpper.includes('COVER = ?')) changes.push('cover');
    if (sqlUpper.includes('SYNOPSIS = ?')) changes.push('synopsis');
    if (sqlUpper.includes('STATUS = ?')) changes.push('status');
    if (sqlUpper.includes('TYPE = ?')) changes.push('type');
    if (sqlUpper.includes('RATING = ?')) changes.push('rating');
    if (sqlUpper.includes('STUDIO = ?')) changes.push('studio');
    if (sqlUpper.includes('PRODUCERS = ?')) changes.push('producers');
    if (sqlUpper.includes('EPISODE_NUMBER = ?')) changes.push('episode_number');
    if (sqlUpper.includes('EMBED_URL = ?')) changes.push('embed_url');
    if (sqlUpper.includes('SERVER = ?')) changes.push('server');
    if (sqlUpper.includes('RESOLUTION = ?')) changes.push('resolution');
    if (sqlUpper.includes('IS_ACTIVE = ?')) changes.push('is_active');
    
    return changes;
  }
}

// Buat wrapper instance
const dbWrapper = new DatabaseWrapper(rawDb);

export function initDatabase() {
  console.log(`[DB] Initializing database: ${DB_NAME}`);
  
  // Tabel anime
  dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS anime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      cover TEXT,
      synopsis TEXT,
      status TEXT DEFAULT 'ongoing',
      type TEXT DEFAULT 'TV',
      rating REAL DEFAULT 0,
      studio TEXT,
      producers TEXT,
      is_manual BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Tabel episode
  dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS episode (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      title TEXT,
      slug TEXT NOT NULL,
      embed_url TEXT,
      is_manual BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anime_id) REFERENCES anime(id)
    )
  `).run();

  // Tabel embed (untuk menyimpan semua embed URL)
  dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS episode_embed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL,
      server TEXT NOT NULL,
      resolution TEXT,
      embed_url TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      is_manual BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (episode_id) REFERENCES episode(id)
    )
  `).run();

  // Tabel anime_genre (untuk menyimpan genre anime)
  dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS anime_genre (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER NOT NULL,
      genre TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anime_id) REFERENCES anime(id),
      UNIQUE(anime_id, genre)
    )
  `).run();

  // Migrasi kolom embed_url dan is_manual jika belum ada
  try { dbWrapper.query('ALTER TABLE episode ADD COLUMN embed_url TEXT').run(); } catch {}
  try { dbWrapper.query('ALTER TABLE episode ADD COLUMN is_manual BOOLEAN DEFAULT 0').run(); } catch {}
  try { dbWrapper.query('ALTER TABLE episode_embed ADD COLUMN is_manual BOOLEAN DEFAULT 0').run(); } catch {}
  
  // Migrasi kolom studio dan producers jika belum ada
  try { dbWrapper.query('ALTER TABLE anime ADD COLUMN studio TEXT').run(); } catch {}
  try { dbWrapper.query('ALTER TABLE anime ADD COLUMN producers TEXT').run(); } catch {}

  console.log(`[DB] Database initialized: ${DB_NAME}`);
}

// Export wrapper sebagai db untuk backward compatibility
export { dbWrapper as db };

// Inisialisasi database saat import
initDatabase();

import axios from "axios";

interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

interface BackupQueueItem {
  type: 'anime_insert' | 'anime_update' | 'anime_delete' | 
        'episode_insert' | 'episode_update' | 'episode_delete' |
        'embed_insert' | 'embed_update' | 'embed_delete' |
        'genre_insert' | 'genre_delete' |
        'error' | 'progress' | 'stats' | 'file';
  data: any;
  timestamp: number;
}

class TelegramBackup {
  private config: TelegramConfig;
  private logBuffer: string[] = [];
  private maxBufferSize = 50;
  private lastMessageTime = 0;
  private minIntervalBetweenMessages = 2000; // 2 detik minimum interval
  
  // Sistem queue untuk mencegah backup bersamaan
  private backupQueue: BackupQueueItem[] = [];
  private isProcessingQueue = false;
  private queueProcessingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = {
      botToken: Bun.env.TELEGRAM_BOT_TOKEN || "",
      chatId: Bun.env.TELEGRAM_CHAT_ID || "",
      enabled: Bun.env.TELEGRAM_ENABLED === "true"
    };
    
    // Mulai processing queue
    this.startQueueProcessing();
  }

  // Mulai processing queue
  private startQueueProcessing(): void {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
    }
    
    this.queueProcessingInterval = setInterval(() => {
      this.processBackupQueue();
    }, 3000); // Process queue setiap 3 detik
  }

  // Process backup queue
  private async processBackupQueue(): Promise<void> {
    if (this.isProcessingQueue || this.backupQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    
    try {
      // Ambil item pertama dari queue
      const item = this.backupQueue.shift();
      if (!item) return;

      // Process berdasarkan type
      switch (item.type) {
        case 'anime_insert':
          await this.backupNewAnime(item.data.title, item.data.slug);
          break;
        case 'anime_update':
          await this.backupAnimeUpdate(item.data);
          break;
        case 'anime_delete':
          await this.backupAnimeDelete(item.data);
          break;
        case 'episode_insert':
          await this.backupNewEpisode(item.data.animeTitle, item.data.episodeNumber, item.data.episodeSlug);
          break;
        case 'episode_update':
          await this.backupEpisodeUpdate(item.data);
          break;
        case 'episode_delete':
          await this.backupEpisodeDelete(item.data);
          break;
        case 'embed_insert':
          await this.backupNewEmbeds(item.data.animeTitle, item.data.episodeNumber, item.data.embeds);
          break;
        case 'embed_update':
          await this.backupEmbedUpdate(item.data);
          break;
        case 'embed_delete':
          await this.backupEmbedDelete(item.data);
          break;
        case 'genre_insert':
          await this.backupGenreUpdate(item.data);
          break;
        case 'genre_delete':
          await this.backupGenreDelete(item.data);
          break;
        case 'error':
          await this.backupError(item.data.context, item.data.error);
          break;
        case 'progress':
          if (typeof item.data === 'string') {
            await this.backupScrapingProgress(item.data);
          } else {
            await this.backupScrapingProgress(item.data.page, item.data.totalPages, item.data.animeCount);
          }
          break;
        case 'stats':
          await this.backupDatabaseStats();
          break;
        case 'file':
          await this.sendDatabaseFile(item.data.caption);
          break;
      }
    } catch (error) {
      console.error("[TELEGRAM] Error processing backup queue:", error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Tambah item ke backup queue
  private addToBackupQueue(type: BackupQueueItem['type'], data: any): void {
    this.backupQueue.push({
      type,
      data,
      timestamp: Date.now()
    });
    
    // Batasi queue size (max 100 items)
    if (this.backupQueue.length > 100) {
      this.backupQueue = this.backupQueue.slice(-50); // Keep last 50 items
    }
  }

  // Simple rate limiting helper
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    
    if (timeSinceLastMessage < this.minIntervalBetweenMessages) {
      const waitTime = this.minIntervalBetweenMessages - timeSinceLastMessage;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Kirim pesan dengan simple rate limiting
  async sendMessage(message: string, parseMode: "HTML" | "Markdown" = "HTML"): Promise<void> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      console.log("[TELEGRAM] Telegram backup disabled or config missing");
      return;
    }

    try {
      // Simple rate limiting - tunggu 2 detik antar pesan
      await this.waitForRateLimit();
      
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
      const data = {
        chat_id: this.config.chatId,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true
      };

      await axios.post(url, data);
      this.lastMessageTime = Date.now();
      console.log("[TELEGRAM] ✅ Pesan berhasil dikirim ke Telegram");
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.log("[TELEGRAM] ⚠️ Rate limit hit, menunggu 60 detik...");
        // Tunggu 60 detik jika terkena rate limit
        await new Promise(resolve => setTimeout(resolve, 60000));
        // Coba lagi sekali
        try {
          const retryUrl = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
          const retryData = {
            chat_id: this.config.chatId,
            text: message,
            parse_mode: parseMode,
            disable_web_page_preview: true
          };
          await axios.post(retryUrl, retryData);
          this.lastMessageTime = Date.now();
          console.log("[TELEGRAM] ✅ Pesan berhasil dikirim setelah retry");
        } catch (retryError) {
          console.error("[TELEGRAM] ❌ Error mengirim pesan ke Telegram setelah retry:", retryError);
        }
      } else {
      console.error("[TELEGRAM] ❌ Error mengirim pesan ke Telegram:", error);
      }
    }
  }

  // Kirim log buffer
  async sendLogBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logs = this.logBuffer.join("\n");
    this.logBuffer = [];

    await this.sendMessage(`📋 <b>Log Buffer</b>\n\n<code>${logs}</code>`);
  }

  // Tambah log ke buffer
  addLog(log: string): void {
    this.logBuffer.push(`[${new Date().toISOString()}] ${log}`);
    
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.sendLogBuffer();
    }
  }

  // Backup database stats
  async backupDatabaseStats(): Promise<void> {
    try {
      const { db } = await import("./db");
      
      const animeCount = db.query("SELECT COUNT(*) as count FROM anime").get() as any;
      const episodeCount = db.query("SELECT COUNT(*) as count FROM episode").get() as any;
      const embedCount = db.query("SELECT COUNT(*) as count FROM episode_embed").get() as any;
      const activeEmbedCount = db.query("SELECT COUNT(*) as count FROM episode_embed WHERE is_active = 1").get() as any;

      const message = `
📊 <b>Database Backup Report</b>

🆕 <b>Statistics:</b>
• Anime: ${animeCount.count}
• Episode: ${episodeCount.count}
• Total Embed: ${embedCount.count}
• Active Embed: ${activeEmbedCount.count}

⏰ <b>Timestamp:</b> ${new Date().toLocaleString('id-ID')}
      `.trim();

      await this.sendMessage(message);
    } catch (error) {
      console.error("[TELEGRAM] ❌ Error backup database stats:", error);
    }
  }

  // Backup anime baru
  async backupNewAnime(title: string, slug: string): Promise<void> {
    const message = `
🆕 <b>Anime Baru Ditambahkan</b>

📺 <b>Title:</b> ${title}
🔗 <b>Slug:</b> ${slug}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup anime update
  async backupAnimeUpdate(data: { id: number; title: string; slug: string; changes: string[] }): Promise<void> {
    const message = `
✏️ <b>Anime Diupdate</b>

📺 <b>Title:</b> ${data.title}
🔗 <b>Slug:</b> ${data.slug}
📝 <b>Changes:</b> ${data.changes.join(', ')}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup anime delete
  async backupAnimeDelete(data: { title: string; slug: string }): Promise<void> {
    const message = `
🗑️ <b>Anime Dihapus</b>

📺 <b>Title:</b> ${data.title}
🔗 <b>Slug:</b> ${data.slug}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup episode baru
  async backupNewEpisode(animeTitle: string, episodeNumber: number, episodeSlug: string): Promise<void> {
    const message = `
🎬 <b>Episode Baru Ditambahkan</b>

📺 <b>Anime:</b> ${animeTitle}
📺 <b>Episode:</b> ${episodeNumber}
🔗 <b>Slug:</b> ${episodeSlug}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup episode update
  async backupEpisodeUpdate(data: { animeTitle: string; episodeNumber: number; episodeSlug: string; changes: string[] }): Promise<void> {
    const message = `
✏️ <b>Episode Diupdate</b>

📺 <b>Anime:</b> ${data.animeTitle}
📺 <b>Episode:</b> ${data.episodeNumber}
🔗 <b>Slug:</b> ${data.episodeSlug}
📝 <b>Changes:</b> ${data.changes.join(', ')}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup episode delete
  async backupEpisodeDelete(data: { animeTitle: string; episodeNumber: number; episodeSlug: string }): Promise<void> {
    const message = `
🗑️ <b>Episode Dihapus</b>

📺 <b>Anime:</b> ${data.animeTitle}
📺 <b>Episode:</b> ${data.episodeNumber}
🔗 <b>Slug:</b> ${data.episodeSlug}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup embed baru
  async backupNewEmbeds(animeTitle: string, episodeNumber: number, embeds: any[]): Promise<void> {
    const embedList = embeds.map(embed => 
      `• ${embed.server} (${embed.resolution || 'Unknown'})`
    ).join('\n');

    const message = `
🔗 <b>Embed Baru Ditambahkan</b>

📺 <b>Anime:</b> ${animeTitle}
📺 <b>Episode:</b> ${episodeNumber}
🔗 <b>Total Embed:</b> ${embeds.length}

<b>Embed List:</b>
${embedList}

⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup embed update
  async backupEmbedUpdate(data: { animeTitle: string; episodeNumber: number; server: string; resolution: string; changes: string[] }): Promise<void> {
    const message = `
✏️ <b>Embed Diupdate</b>

📺 <b>Anime:</b> ${data.animeTitle}
📺 <b>Episode:</b> ${data.episodeNumber}
🔗 <b>Server:</b> ${data.server}
📺 <b>Resolution:</b> ${data.resolution}
📝 <b>Changes:</b> ${data.changes.join(', ')}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup embed delete
  async backupEmbedDelete(data: { animeTitle: string; episodeNumber: number; server: string; resolution: string }): Promise<void> {
    const message = `
🗑️ <b>Embed Dihapus</b>

📺 <b>Anime:</b> ${data.animeTitle}
📺 <b>Episode:</b> ${data.episodeNumber}
🔗 <b>Server:</b> ${data.server}
📺 <b>Resolution:</b> ${data.resolution}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup genre update
  async backupGenreUpdate(data: { animeTitle: string; genre: string }): Promise<void> {
    const message = `
🎭 <b>Genre Ditambahkan</b>

📺 <b>Anime:</b> ${data.animeTitle}
🎭 <b>Genre:</b> ${data.genre}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup genre delete
  async backupGenreDelete(data: { animeTitle: string; genre: string }): Promise<void> {
    const message = `
🗑️ <b>Genre Dihapus</b>

📺 <b>Anime:</b> ${data.animeTitle}
🎭 <b>Genre:</b> ${data.genre}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup error
  async backupError(context: string, error: any): Promise<void> {
    const message = `
❌ <b>Error Report</b>

🔍 <b>Context:</b> ${context}
💥 <b>Error:</b> ${error.message || error}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();

    await this.sendMessage(message);
  }

  // Backup scraping progress
  async backupScrapingProgress(page: number, totalPages: number, animeCount: number): Promise<void>;
  async backupScrapingProgress(message: string): Promise<void>;
  async backupScrapingProgress(pageOrMessage: number | string, totalPages?: number, animeCount?: number): Promise<void> {
    let message: string;
    
    if (typeof pageOrMessage === 'string') {
      // Overload untuk pesan custom
      message = `
🔄 <b>Scraping Progress</b>

📝 <b>Message:</b> ${pageOrMessage}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
    `.trim();
    } else {
      // Overload untuk progress dengan angka
      const progress = Math.round((pageOrMessage / (totalPages || 1)) * 100);
      
      message = `
🔄 <b>Scraping Progress</b>

📄 <b>Page:</b> ${pageOrMessage}/${totalPages || 1} (${progress}%)
📺 <b>Anime Count:</b> ${animeCount || 0}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
      `.trim();
    }

    await this.sendMessage(message);
  }

  // Backup user activity (DISABLED untuk privacy)
  async backupUserActivity(action: string, details: string): Promise<void> {
    // Disabled untuk privacy - tidak mengirim user activity ke Telegram
    console.log(`[TELEGRAM] User activity logged (not sent to Telegram): ${action} - ${details}`);
  }

  // Test connection
  async testConnection(): Promise<void> {
    if (!this.config.enabled) {
      console.log("[TELEGRAM] Telegram backup disabled");
      return;
    }

    try {
      const message = `
🧪 <b>Telegram Backup Test</b>

✅ <b>Status:</b> Connected
🔧 <b>Bot Token:</b> ${this.config.botToken ? '✅ Set' : '❌ Not Set'}
💬 <b>Chat ID:</b> ${this.config.chatId ? '✅ Set' : '❌ Not Set'}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
      `.trim();

      await this.sendMessage(message);
      console.log("[TELEGRAM] ✅ Test connection successful");
    } catch (error) {
      console.error("[TELEGRAM] ❌ Test connection failed:", error);
    }
  }

  // Kirim file database ke Telegram
  async sendDatabaseFile(caption: string = "Backup Database"): Promise<void> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      console.log("[TELEGRAM] Telegram backup disabled or config missing");
      return;
    }
    try {
      const dbName = Bun.env.DB_NAME || "weeaboo.sqlite";
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendDocument`;
      const file = Bun.file(dbName);
      if (!(await file.exists())) {
        console.error(`[TELEGRAM] File tidak ditemukan: ${dbName}`);
        return;
      }
      const formData = new FormData();
      formData.append("chat_id", this.config.chatId);
      formData.append("caption", caption);
      formData.append("document", file, dbName);
      await axios.post(url, formData);
      console.log(`[TELEGRAM] ✅ File database berhasil dikirim ke Telegram: ${dbName}`);
    } catch (error) {
      console.error("[TELEGRAM] ❌ Error mengirim file database ke Telegram:", error);
    }
  }

  // ===== PUBLIC METHODS UNTUK AUTO BACKUP =====

  // Auto backup untuk anime insert
  autoBackupAnimeInsert(title: string, slug: string): void {
    this.addToBackupQueue('anime_insert', { title, slug });
  }

  // Auto backup untuk anime update
  autoBackupAnimeUpdate(id: number, title: string, slug: string, changes: string[]): void {
    this.addToBackupQueue('anime_update', { id, title, slug, changes });
  }

  // Auto backup untuk anime delete
  autoBackupAnimeDelete(title: string, slug: string): void {
    this.addToBackupQueue('anime_delete', { title, slug });
  }

  // Auto backup untuk episode insert
  autoBackupEpisodeInsert(animeTitle: string, episodeNumber: number, episodeSlug: string): void {
    this.addToBackupQueue('episode_insert', { animeTitle, episodeNumber, episodeSlug });
  }

  // Auto backup untuk episode update
  autoBackupEpisodeUpdate(animeTitle: string, episodeNumber: number, episodeSlug: string, changes: string[]): void {
    this.addToBackupQueue('episode_update', { animeTitle, episodeNumber, episodeSlug, changes });
  }

  // Auto backup untuk episode delete
  autoBackupEpisodeDelete(animeTitle: string, episodeNumber: number, episodeSlug: string): void {
    this.addToBackupQueue('episode_delete', { animeTitle, episodeNumber, episodeSlug });
  }

  // Auto backup untuk embed insert
  autoBackupEmbedInsert(animeTitle: string, episodeNumber: number, embeds: any[]): void {
    this.addToBackupQueue('embed_insert', { animeTitle, episodeNumber, embeds });
  }

  // Auto backup untuk embed update
  autoBackupEmbedUpdate(animeTitle: string, episodeNumber: number, server: string, resolution: string, changes: string[]): void {
    this.addToBackupQueue('embed_update', { animeTitle, episodeNumber, server, resolution, changes });
  }

  // Auto backup untuk embed delete
  autoBackupEmbedDelete(animeTitle: string, episodeNumber: number, server: string, resolution: string): void {
    this.addToBackupQueue('embed_delete', { animeTitle, episodeNumber, server, resolution });
  }

  // Auto backup untuk genre insert
  autoBackupGenreInsert(animeTitle: string, genre: string): void {
    this.addToBackupQueue('genre_insert', { animeTitle, genre });
  }

  // Auto backup untuk genre delete
  autoBackupGenreDelete(animeTitle: string, genre: string): void {
    this.addToBackupQueue('genre_delete', { animeTitle, genre });
  }

  // Auto backup untuk error
  autoBackupError(context: string, error: any): void {
    this.addToBackupQueue('error', { context, error });
  }

  // Auto backup untuk progress
  autoBackupProgress(page: number, totalPages: number, animeCount: number): void;
  autoBackupProgress(message: string): void;
  autoBackupProgress(pageOrMessage: number | string, totalPages?: number, animeCount?: number): void {
    if (typeof pageOrMessage === 'string') {
      this.addToBackupQueue('progress', pageOrMessage);
    } else {
      this.addToBackupQueue('progress', { page: pageOrMessage, totalPages, animeCount });
    }
  }

  // Auto backup untuk stats
  autoBackupStats(): void {
    this.addToBackupQueue('stats', {});
  }

  // Auto backup untuk file database
  autoBackupFile(caption: string): void {
    this.addToBackupQueue('file', { caption });
  }

  // Get queue status
  getQueueStatus(): { length: number; isProcessing: boolean } {
    return {
      length: this.backupQueue.length,
      isProcessing: this.isProcessingQueue
    };
  }
}

export const telegramBackup = new TelegramBackup(); 
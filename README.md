# Weeaboo API

API untuk scraping dan mengelola data anime dari Samehadaku.

## Fitur

- Scraping anime dari Samehadaku
- Scraping episode on-demand (tidak otomatis)
- **Auto Backup System** - Backup otomatis setiap perubahan database ke Telegram
- Rate limiting untuk menghindari error 429
- Konfigurasi untuk menonaktifkan notifikasi episode

## Sistem Auto Backup

### Fitur Auto Backup
Sistem auto backup yang komprehensif dengan fitur:

1. **Queue System** - Mencegah backup bersamaan dengan sistem antrian
2. **Real-time Backup** - Setiap perubahan database otomatis terbackup
3. **Comprehensive Coverage** - Backup untuk INSERT, UPDATE, DELETE semua tabel
4. **Rate Limiting** - Otomatis handle rate limit Telegram
5. **Error Handling** - Retry otomatis jika gagal

### Jenis Backup yang Tersedia
- ✅ **Anime Insert/Update/Delete**
- ✅ **Episode Insert/Update/Delete** 
- ✅ **Embed Insert/Update/Delete**
- ✅ **Genre Insert/Delete**
- ✅ **Error Reports**
- ✅ **Progress Reports**
- ✅ **Database Stats**
- ✅ **File Database**

### Monitoring Systems
```bash
# Cek status backup system
curl http://localhost:3000/debug/backup

# Cek status intelligent rate limiter
curl http://localhost:3000/debug/rate-limiter

# Response examples:
{
  "backup_system": {
    "queue_length": 5,
    "is_processing": false,
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "smart_rate_limiter": {
    "request_count": 150,
    "consecutive_errors": 0,
    "success_streak": 25,
    "error_streak": 2,
    "error_rate": 0.013,
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

### Konfigurasi Telegram

### Simple Rate Limiting
Bot Telegram memiliki sistem rate limiting sederhana yang otomatis:

- **Interval**: Minimal 2 detik antar pesan
- **Retry**: Otomatis retry setelah 60 detik jika terkena rate limit
- **Queue System**: Mencegah backup bersamaan dengan antrian
- **No Configuration**: Tidak perlu setting apapun, otomatis bekerja

### Environment Variables

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
TELEGRAM_ENABLED=true
```

## Solusi Masalah Rate Limiting & Anti-Blocking

Sistem **Intelligent Rate Limiting** dengan algoritma pintar untuk mengatasi error 429 dan **Anti-Blocking System** untuk mengatasi error 403:

### 1. **Adaptive Delay Algorithm** 🧠
- **High Error Rate (>30%)**: Double delay (max 30s)
- **Low Error Rate (<10%) + Success Streak (>5)**: Half delay (min 1s)
- **Normal**: Base delay + random factor (2-4s)

### 2. **Exponential Backoff** 📈
- **Error 429**: 2^consecutive_errors * base_delay
- **Server Error (5xx)**: Fixed 10s delay
- **Smart Retry**: 3 attempts dengan backoff

### 3. **Performance Tracking** 📊
- **Request Count**: Total request yang dibuat
- **Success Streak**: Berapa kali request berhasil berturut-turut
- **Error Rate**: Persentase error dari total request
- **Auto Adjustment**: Delay otomatis menyesuaikan performance

### 4. **Smart Request Wrapper** 🔄
- **Adaptive Delay**: Delay berdasarkan performance
- **Exponential Backoff**: Backoff untuk error 429
- **Multiple Retries**: 3 attempts dengan smart strategy
- **Performance Monitoring**: Real-time tracking

### 5. **Anti-Blocking System** 🛡️
- **Rotating User Agents**: 6 different browser signatures
- **Enhanced Headers**: Complete browser-like headers
- **Dynamic Updates**: Headers berubah setiap request
- **403 Error Handling**: 15-30 detik delay untuk bypass blocking

### 4. **Episode scraping on-demand**:
   - Episode tidak lagi di-scrap otomatis
   - Hanya di-scrap saat user request
   - Mengurangi spam notifikasi Telegram

### 5. **Queue system**:
   - Mencegah backup bersamaan dengan antrian
   - Rate limiting otomatis untuk Telegram
   - Tidak perlu setting apapun

## Scraping Episode On-Demand

Episode sekarang hanya di-scrap saat diperlukan dan disimpan di database:

### Flow Sistem Episode:
1. **User request episode** → Cek database dulu
2. **Jika ada di database** → Return data dari database (cepat)
3. **Jika tidak ada** → Scrap realtime dari website
4. **Admin bisa scrap episode** → Simpan ke database untuk user lain
5. **Admin bisa edit episode** → Via admin panel

### Scrap Episode Manual:
```bash
# Scrap episode untuk anime tertentu
curl -X POST http://localhost:3000/anime/one-piece/scrape-episodes

# Via admin panel
curl -X POST http://localhost:3000/admin/api/scrape-episodes \
  -H "Authorization: Bearer admin123456" \
  -H "Content-Type: application/json" \
  -d '{"animeSlug": "one-piece"}'
```

### Edit Episode via Admin:
```bash
# Update episode
curl -X PUT http://localhost:3000/admin/api/edit-episode \
  -H "Authorization: Bearer admin123456" \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "title": "Episode 1 - The Beginning"}'

# Update embed
curl -X PUT http://localhost:3000/admin/api/edit-embed \
  -H "Authorization: Bearer admin123456" \
  -H "Content-Type: application/json" \
  -d '{"id": 456, "server": "Server 1", "resolution": "720p"}'
```

## Installation

```bash
npm install
```

## Usage

```bash
# Run with Bun
bun run start

# Test scraping
bun run test_scraping
```

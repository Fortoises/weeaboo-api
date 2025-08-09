# Weeaboo Api

Api scrapper anime dengan sistem bun dan Elysia.js. Menggunakan real time scrapping dan sistem cache database dengan automasi backup ke telegram
## Authors

- [@Fortoises](https://www.github.com/Fortoises)

![NodeJS](https://img.shields.io/badge/nodejs-green)
## Fitur
- **Real-time Scraping**: Fetch real time data dari website anime.
- **Manual Override**: Bisa menambahkan anime secara manual menggunakan sistem admin.
- **Embed Caching**: Otomatis menyimpan data ke database untuk link embed agar mempercepat proses.
- **Fuzzy Search**: Meggunakan Fuzzy agar lebih gampang untuk mencari anime.
- **Secure Endpoints**: Menggunakan sistem keamanan simple untuk mengamankan API.
- **Automated Backups**: Otomatis backup database setiap ada perubahan, backup akan ke kirim ke bot telegram ( Delay 10 detik ).
- **API Documentation**: Otomatis generate dokumentasi menggunakan swagger dengan tampilan interaktif.
# Installation
1. **Clone repo:**
```bash
git clone https://github.com/Fortoises/weeaboo-api
cd weeaboo-api
```

2. **Install dependencies:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install curl -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
```
```bash
curl -fsSL https://bun.sh/install | bash
```
```bash
npm install
```
3. **Konfigurasi:**
-- Copy isi file ```.env.example``` lalu isi di file ```.env``` kamu
```dotenv
# Security
API_KEY=your_master_api_key # Security untuk pemakaian api
ADMIN_TOKEN= # Token untuk pemakaian route admin

# Telegram Backup
TELEGRAM_BOT_TOKEN= # Token bot telegram dari @botfather
TELEGRAM_CHAT_ID=

# Base URL
BASE_URL=https://v1.samehadaku.how # Base URL website anime scrapper
```

4. **Run Script**
- Run nodemon ( dev )
```bash
bun run dev
```
- Run 
```bash
bun run start
```
## Documentation

-    **URL**: your-api-url/docs:3000

### Authentication

-   **Public API**: Requires an `X-API-KEY` header with the value of `API_KEY` from your `.env` file.
-   **Admin API**: Requires an `Authorization` header with the value `Bearer <ADMIN_TOKEN>` where `<ADMIN_TOKEN>` is the value from your `.env` file.

### Main Endpoints

-   `GET /home`: Latest anime update
-   `GET /search?q={keyword}`: Search anime berdasarkan keyword
-   `GET /anime/genre/{slug}`: Search anime berdasarkan genre
-   `GET /anime/{slug}`: Mendapatkan detail anime
-   `GET /anime/{slug}/episode/{episode_slug}`: Mendapatkan link embeds anime
- `GET /top10/`: Top 10 anime minggu ini

(For a full list of admin endpoints, please refer to the interactive documentation).


## License

[LICENSE](https://github.com/Fortoises/weeaboo-api/blob/main/LICENSE)


# Weeaboo API

API Scrapper Anime yang dibangun dengan Bun dan Elysia.js. Dilengkapi dengan sistem caching database, pembaruan otomatis, backup ke Telegram, dan proxy streaming untuk pengalaman menonton yang lancar.

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun)
![ElysiaJS](https://img.shields.io/badge/ElysiaJS-red?style=for-the-badge&logo=elysia)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=for-the-badge&logo=typescript)

## Penulis

- [@Fortoises](https://www.github.com/Fortoises)

## Fitur Unggulan

- **Sistem Slug Cerdas & Fleksibel**: API dapat menerima berbagai format slug (baik slug bersih seperti `one-piece` maupun slug spesifik dari sumber seperti `one-piece-season-20`) dan secara cerdas menemukannya di situs sumber. Ini membuat API lebih tangguh dan mudah digunakan.
- **Caching Database Cerdas**: Data stream (link video) untuk setiap episode disimpan di database. API akan selalu memeriksa database terlebih dahulu sebelum melakukan scraping, sehingga respons menjadi sangat cepat jika data sudah ada.
- **Scraping Otomatis dari Berbagai Sumber**: Jika data episode tidak ditemukan di database, API akan secara otomatis melakukan scraping dari **Samehadaku & Oploverz**, lalu menggabungkan hasilnya dan menyimpannya untuk permintaan berikutnya.
- **Proxy Streaming Canggih (Mendukung Seeking)**: Endpoint `/anime/stream` berfungsi sebagai proxy cerdas. Ini tidak hanya mengatasi masalah di mana penyedia video memaksa unduhan, tetapi juga sepenuhnya mendukung *seeking* (memajukan/memundurkan video) dengan menangani permintaan `Range` HTTP secara benar.
- **Penanganan Link Mati**: Rute streaming secara otomatis akan mencoba beberapa link (jika tersedia untuk kualitas yang sama) hingga menemukan link yang berfungsi, membuatnya lebih tangguh terhadap link yang rusak.
- **Pembaruan Otomatis Terjadwal**:
    - **Halaman Utama**: Konten di-cache dan diperbarui secara otomatis setiap jam.
    - **Top 10**: Diperbarui secara otomatis setiap hari Senin pukul 15:00 WIB.
- **Pencarian Fuzzy**: Menggunakan Fuse.js untuk pencarian anime yang lebih fleksibel.
- **Backup Otomatis ke Telegram**: Setiap kali ada pembaruan data, database akan di-backup secara otomatis.
- **Endpoint Aman & Fleksibel**: Menggunakan sistem kunci API dan token Bearer. Kebutuhan kunci API dapat dimatikan untuk kemudahan pengembangan.
- **Dokumentasi Interaktif**: Dokumentasi API dibuat secara otomatis menggunakan Swagger (`/docs`).

## Instalasi

1.  **Clone Repositori:**
    ```bash
    git clone https://github.com/Fortoises/weeaboo-api
    cd weeaboo-api
    ```

2.  **Install Dependensi:**
    ```bash
    bun install
    ```

3.  **Konfigurasi:**

    **File .env**
    Salin atau ganti nama file `.env.example` menjadi `.env`, kemudian isi nilainya.
    ```dotenv
    # Keamanan
    API_KEY=your_master_api_key       # Kunci untuk mengakses API publik
    ADMIN_TOKEN=your_admin_token      # Token untuk mengakses endpoint admin
    ENABLE_API_KEY=true               # Atur ke 'false' untuk mematikan kebutuhan API Key saat development

    # Backup via Telegram
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token
    TELEGRAM_CHAT_ID=your_telegram_chat_id
    ```

    **File config.json**
    Ubah URL dasar jika domain situs sumber berubah.
    ```json
    {
      "samehadaku": { "baseUrl": "https://v1.samehadaku.how/" },
      "oploverz": { "baseUrl": "https://www.oploverz.now/" }
    }
    ```

4.  **Menjalankan Aplikasi:**
    ```bash
    bun run dev # Untuk development
    # bun run start # Untuk produksi
    ```
    
    Server akan secara otomatis menangani pembaruan data di latar belakang.

## Alur Kerja API

Alur kerja untuk mendapatkan dan memutar video dirancang agar efisien dan mudah digunakan.

1.  **Panggil Detail Episode**: Pertama, panggil endpoint `GET /anime/{slug}/episode/{episode_identifier}`.
    -   `{slug}`: Slug anime yang ingin dicari. Bisa berupa slug bersih (misal: `one-piece`) atau slug spesifik dari hasil pencarian (misal: `one-piece-season-20`).
    -   `{episode_identifier}`: Nomor episode (misal: `1088`) atau identifier untuk episode spesial (misal: `spesial`).
    -   API akan memeriksa databasenya. Jika data stream untuk episode ini tidak ada, API akan melakukan scraping, menyimpannya ke database, lalu mengirimkan hasilnya.
    -   Respons dari endpoint ini akan berisi daftar stream yang tersedia, lengkap dengan `provider`, `quality`, `source` (sumber scrape), dan sebuah `stream_url` yang sudah jadi.

2.  **Gunakan `stream_url`**: Di aplikasi Anda, gunakan `stream_url` yang didapat dari langkah pertama untuk memutar video. URL ini mengarah ke proxy streaming API, yang akan menangani semua detail teknis untuk memastikan video dapat diputar.

## Dokumentasi API

-   **URL**: `http://<alamat-api-anda>:3000/docs`

### Endpoint Utama

-   `GET /home`: Menampilkan daftar anime terbaru dari cache.
-   `GET /top10`: Menampilkan 10 anime teratas minggu ini dari cache.
-   `GET /search?q={keyword}`: Mencari anime.
-   `GET /anime/genre/{slug}`: Mencari anime berdasarkan genre.
-   `GET /anime/{slug}`: Mendapatkan detail lengkap sebuah anime. Responsnya kini berisi array `episodes` dengan format `{ "title": "...", "episode": "..." }`.
-   `GET /anime/{slug}/episode/{episode_identifier}`: Mendapatkan daftar stream video yang tersedia untuk sebuah episode. **(Langkah 1)**
-   `GET /anime/stream/{episode_slug}.mp4`: Memutar video berdasarkan `provider` dan `quality` yang dipilih. **(Langkah 2)**

*(Untuk daftar lengkap endpoint admin, silakan merujuk ke dokumentasi interaktif di /docs)*

## Lisensi

[LICENSE](https://github.com/Fortoises/weeaboo-api/blob/main/LICENSE)
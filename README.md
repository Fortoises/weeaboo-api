# Weeaboo API

API Scrapper Anime yang dibangun dengan Bun dan Elysia.js. Dilengkapi dengan sistem caching database, pembaruan otomatis, dan backup ke Telegram.

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun)
![ElysiaJS](https://img.shields.io/badge/ElysiaJS-red?style=for-the-badge&logo=elysia)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=for-the-badge&logo=typescript)

## Penulis

- [@Fortoises](https://www.github.com/Fortoises)

## Fitur Unggulan

- **Scraping Real-time**: Mengambil data secara langsung dari situs sumber untuk detail anime dan episode.
- **Caching Database Cerdas**: Halaman utama dan top 10 tidak melakukan scraping setiap saat, melainkan mengambil data dari database yang sudah disiapkan, sehingga respons API sangat cepat.
- **Pembaruan Otomatis Terjadwal**:
    - **Halaman Utama**: Konten di-cache dan diperbarui secara otomatis setiap jam. Anime dengan episode baru akan naik ke urutan teratas tanpa duplikasi.
    - **Top 10**: Diperbarui secara otomatis setiap hari Senin pukul 15:00 WIB.
- **Pencarian Fuzzy**: Menggunakan Fuse.js untuk pencarian anime yang lebih fleksibel dan toleran terhadap salah ketik.
- **Backup Otomatis ke Telegram**: Setiap kali ada pembaruan data, database akan di-backup secara otomatis ke chat Telegram yang Anda tentukan (dengan debounce 10 detik).
- **Endpoint Aman**: Menggunakan sistem kunci API dan token Bearer untuk mengamankan endpoint.
- **Dokumentasi Interaktif**: Dokumentasi API dibuat secara otomatis menggunakan Swagger, lengkap dengan antarmuka yang interaktif.
- **Manajemen Manual**: Tersedia endpoint admin untuk menambahkan anime secara manual jika diperlukan.

## Instalasi

1.  **Clone Repositori:**
    ```bash
    git clone https://github.com/Fortoises/weeaboo-api
    cd weeaboo-api
    ```

2.  **Install Dependensi:**
    ```bash
    # Update sistem dan install Node.js & cURL
    sudo apt update && sudo apt upgrade -y
    sudo apt install curl -y
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs

    # Install Bun
    curl -fsSL https://bun.sh/install | bash

    # Install dependensi proyek
    bun install
    ```

3.  **Konfigurasi Lingkungan:**
    Salin isi dari file `.env.example` ke dalam file baru bernama `.env`, kemudian isi nilainya sesuai kebutuhan Anda.
    ```dotenv
    # Keamanan
    API_KEY=your_master_api_key # Kunci untuk mengakses API publik
    ADMIN_TOKEN=your_admin_token # Token untuk mengakses endpoint admin

    # Backup via Telegram
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token # Token dari @BotFather
    TELEGRAM_CHAT_ID=your_telegram_chat_id # ID chat tujuan backup

    # Base URL (jika diperlukan)
    BASE_URL=https://v1.samehadaku.how # URL situs sumber scraping
    ```

4.  **Menjalankan Aplikasi:**
    Aplikasi ini memerlukan dua proses yang berjalan secara bersamaan: satu untuk API utama, dan satu lagi untuk proses updater.

    -   **Terminal 1: Jalankan API Utama**
        ```bash
        # Untuk mode development dengan auto-reload
        bun run dev
        ```
        ```bash
        # Untuk mode produksi
        bun run start
        ```

    -   **Terminal 2: Jalankan Proses Updater**
        ```bash
        bun run update
        ```
        Proses ini akan berjalan di latar belakang untuk terus memperbarui data halaman utama dan top 10 sesuai jadwal.

## Dokumentasi API

-   **URL**: `http://<alamat-api-anda>:3000/docs`

### Autentikasi

-   **API Publik**: Memerlukan header `X-API-KEY` dengan nilai `API_KEY` dari file `.env` Anda.
-   **API Admin**: Memerlukan header `Authorization` dengan nilai `Bearer <ADMIN_TOKEN>`, di mana `<ADMIN_TOKEN>` adalah nilai dari file `.env` Anda.

### Endpoint Utama

-   `GET /home`: Menampilkan daftar anime terbaru dari cache database.
-   `GET /top10`: Menampilkan 10 anime teratas minggu ini dari cache database.
-   `GET /search?q={keyword}`: Mencari anime berdasarkan kata kunci.
-   `GET /anime/genre/{slug}`: Mencari anime berdasarkan genre.
-   `GET /anime/{slug}`: Mendapatkan detail lengkap sebuah anime.
-   `GET /anime/{slug}/episode/{episode_slug}`: Mendapatkan link embed untuk sebuah episode.

*(Untuk daftar lengkap endpoint admin, silakan merujuk ke dokumentasi interaktif di /docs)*

## Lisensi

[LICENSE](https://github.com/Fortoises/weeaboo-api/blob/main/LICENSE)
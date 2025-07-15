# Animbus

**Animbus** adalah library TypeScript untuk scraping anime dari [Samehadaku](https://samehadaku.now) dengan integrasi metadata dari [AniList](https://anilist.co). Library ini juga mendukung ekstraksi video streaming dari Samehadaku (Server tersedia: Blogger, Filedon, dan Pixeldrain).

---

## 🚀 Fitur

- 🔍 Scrape anime dari Samehadaku (Top, Terbaru, Berdasarkan Genre, Pencarian)
- 🧠 Integrasi metadata lengkap dari AniList (deskripsi, skor, genre, studio, trailer, dll)
- 🎥 Mendukung streaming dari Blogger, Premium direct link, Filedon, dan Pixeldrain
- 🧩 Fuzzy search anime berdasarkan judul & sinonim
- 💡 Ditulis dengan TypeScript, mendukung ESM dan CJS
- 🧪 Siap dipakai di project API, bot, CLI, atau desktop app

---

## 📦 Instalasi

```bash
bun add animbus
```

---

## 🔰 Contoh Penggunaan

### ✅ Ringkasan Anime dari AniList

```ts
import { getAnimeSummary } from "animbus";

const anime = await getAnimeSummary("Jujutsu Kaisen");
console.log(anime);
/*
{
  id: 12345,
  title: 'Jujutsu Kaisen',
  year: 2020,
  coverImage: 'https://...',
  averageScore: 86
}
*/
```

### 📖 Detail Lengkap dari AniList

```ts
import { getAnimeDetail } from "animbus";

const detail = await getAnimeDetail(12345);
console.log(detail.description); // Deskripsi lengkap
console.log(detail.genres); // ['Action', 'Supernatural']
```

### 📥 Scrape Anime Terpopuler dari Samehadaku

```ts
import { getTopAnime } from "animbus";

const list = await getTopAnime();
console.log(list[0].title); // Judul + metadata dari AniList
```

### 📺 Scrape Episode dari Halaman Anime

```ts
import { getAnime } from "animbus";

const anime = await getAnime("jujutsu-kaisen-season-2-subtitle-indonesia");

console.log(anime.title); // 'Jujutsu Kaisen Season 2'
console.log(anime.streamingEpisodes[0].videoID); // Path Samehadaku episode
```

### 🔗 Ambil Server Streaming & Iframe URL

```ts
import { getServerList, getStreamResource } from "animbus";

const servers = await getServerList(
  "/jujutsu-kaisen-s2-episode-1-subtitle-indonesia/"
);
const url = await getStreamResource(servers[0]);

console.log(url); // iframe src
```

### 🎞️ Streaming Video (Pipe ke File)

```ts
import { streamBlogger } from "animbus";
import { createWriteStream } from "fs";

const { stream, abort } = await streamBlogger("https://blogger.com/embed-link");

stream.pipe(createWriteStream("output.mp4"));

// Bisa dibatalkan:
// abort();
```

---

## ⚠️ Disclaimer

Library ini melakukan scraping terhadap situs pihak ketiga secara **tidak resmi**. Gunakan dengan bijak dan **hormati hak cipta** dari pemilik konten. Jangan gunakan untuk tujuan komersial tanpa izin.

---

# Animbus API

## 📚 API Endpoints

### 1. GET `/home`
- **Deskripsi:** Daftar anime populer dari Samehadaku (top anime)
- **Contoh Response:**
```json
{
  "data": [
    {
      "id": 12345,
      "title": "Jujutsu Kaisen",
      "year": 2020,
      "coverImage": "https://...",
      "averageScore": 86,
      "animeID": "/jujutsu-kaisen-season-2-subtitle-indonesia"
    },
    ...
  ]
}
```

### 2. GET `/ongoing`
- **Deskripsi:** Daftar anime yang sedang tayang (ongoing) dari Samehadaku
- **Contoh Response:**
```json
{
  "data": [ ... ]
}
```

### 3. GET `/search?q=keyword`
- **Deskripsi:** Fuzzy search anime berdasarkan judul (menggunakan Fuse.js)
- **Query Param:** `q` (kata kunci pencarian)
- **Contoh Response:**
```json
{
  "data": [ ... ]
}
```

### 4. GET `/anime/:id`
- **Deskripsi:** Detail anime + daftar episode + semua link embed untuk episode terpilih
- **Path Param:** `id` (ID Anilist, angka)
- **Query Param:** `episode` (nomor urut episode, 1 = episode pertama, default: episode terakhir)
- **Contoh Request:**
```http
/anime/124410?episode=3
```
- **Contoh Response:**
```json
{
  "anilistId": 124410,
  "title": "Jujutsu Kaisen Season 2",
  "samehadaku": {
    "slug": "jujutsu-kaisen-season-2-subtitle-indonesia",
    "episodes": [
      { "title": "Episode 1", "videoID": "/jujutsu-kaisen-s2-episode-1-subtitle-indonesia/" },
      ...
    ],
    "selectedEpisode": {
      "title": "Episode 3",
      "videoID": "/jujutsu-kaisen-s2-episode-3-subtitle-indonesia/"
    },
    "embed": [
      { "name": "Blogspot 360p", "src": "https://..." },
      { "name": "Premium 480p", "src": "https://..." },
      ...
    ]
  },
  "anilist": { ... },
  "debug": { ... }
}
```
- **Penjelasan:**
  - Jika `?episode` tidak diisi, akan otomatis mengembalikan episode terakhir.
  - Field `selectedEpisode` berisi info episode yang dipilih.
  - Field `embed` adalah array semua link streaming dari berbagai server untuk episode tersebut.

### 5. GET `/info/:id`
- **Deskripsi:** Informasi lengkap anime dari Anilist
- **Path Param:** `id` (ID Anilist, angka)
- **Contoh Response:**
```json
{
  "data": {
    "id": 12345,
    "title": "Jujutsu Kaisen",
    "description": "...",
    "genres": ["Action", "Supernatural"],
    ...
  }
}
```

## ⚠️ Error Handling
- Semua endpoint akan mengembalikan `{ "error": "..." }` dengan status 400/500 jika terjadi error atau parameter tidak valid.

## 🚀 Jalankan API
```bash
bun run animbus-main/src/index.ts
```

API akan berjalan di: [http://localhost:3000](http://localhost:3000)

---

> Untuk detail scraping dan integrasi, lihat dokumentasi kode di masing-masing folder (`scrapers`, `services`, `routes`).

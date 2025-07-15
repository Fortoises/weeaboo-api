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

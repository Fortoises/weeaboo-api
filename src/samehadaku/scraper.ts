import axios from "axios";
import { load } from "cheerio";
import Fuse from "fuse.js";
import { BASE_URL, ENDPOINT_ANIME_TERBARU } from "./config";

export type ServerResource = {
  post: string;
  nume: string;
  type: string;
  name: string;
};

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT)",
  },
});

// Helper retry
async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e.response?.status === 429 && i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw e;
      }
    }
  }
}

export const getTopAnime = () =>
  fetchWithRetry(() => client.get("/")).then(({ data }) => {
    const $ = load(data);
    const list = $(".topten-animesu a");
    return list.map((_, el) => {
      const url = $(el).attr("href") || "";
      const title = $($(el).find(".judul")[0]).text().trim();
      const cover = $(el).find("img").attr("src") || "";
      let videoID = "";
      try {
        if (url) {
          const path = new URL(url, BASE_URL).pathname;
          videoID = path.replace(/^\/anime\//, "").replace(/\/$/, "");
        }
      } catch {}
      return { title, cover, videoID };
    }).get();
  });

// Ambil anime terbaru dari Samehadaku (benar-benar scan layout /anime-terbaru)
export const getLatestUpdate = () =>
  fetchWithRetry(() => client.get(ENDPOINT_ANIME_TERBARU)).then(({ data }) => {
    const $ = load(data);
    const result: { title: string; cover: string; videoID: string; releaseDate: string }[] = [];
    // Ambil semua pasangan .thumb dan .dtla secara berurutan
    const thumbs = $(".thumb").toArray();
    const dtlas = $(".dtla").toArray();
    const len = Math.min(thumbs.length, dtlas.length);
    for (let i = 0; i < len; i++) {
      const thumb = $(thumbs[i]);
      const dtla = $(dtlas[i]);
      const raw = dtla.text().replace(/\s+/g, " ").trim();
      // Ekstrak judul (sebelum 'Episode', 'Posted by:', atau 'Released on:')
      let title = raw;
      const titleMatch = raw.match(/^(.*?)(?:Episode|Posted by:|Released on:)/i);
      if (titleMatch && typeof titleMatch[1] === "string") {
        title = titleMatch[1].trim();
      }
      // Ekstrak releaseDate
      let releaseDate = "";
      const dateMatch = raw.match(/Released on: ([^\n]+)/i);
      if (dateMatch && typeof dateMatch[1] === "string") {
        releaseDate = dateMatch[1].trim();
      }
      const url = thumb.attr("url") || thumb.find("a").attr("href") || dtla.attr("url") || dtla.find("a").attr("href") || "";
      let videoID = "";
      try {
        if (url) {
          const path = new URL(url, BASE_URL).pathname;
          videoID = path.replace(/^\/anime\//, "").replace(/\/$/, "");
        }
      } catch {}
      const cover = thumb.find("img").attr("src") || thumb.attr("cover") || "";
      if (title && url && cover) {
        result.push({ title, cover, videoID, releaseDate });
      }
    }
    return result;
  });

export const getTop10AnimeWeek = () =>
  fetchWithRetry(() => client.get("/")).then(({ data }) => {
    const $ = load(data);
    const list = $(".topten-animesu li");
    return list.map((_, el) => {
      const title = $(el).find("a .judul").text().trim();
      const url = $(el).find("a").attr("href") || "";
      const cover = $(el).find("img").attr("src") || "";
      let videoID = "";
      try {
        if (url) {
          const path = new URL(url, BASE_URL).pathname;
          videoID = path.replace(/^\/anime\//, "").replace(/\/$/, "");
        }
      } catch {}
      return { title, cover, videoID };
    }).get();
  });

export const getTopByCategory = (...category: string[]) =>
  fetchWithRetry(() => client.get("/daftar-anime-2", {
    params: {
      order: "popular",
      genre: category,
    },
  })).then(({ data }) => {
    const $ = load(data);
    const list = $("article .animepost a");
    return list.map((_, el) => {
      const title = $($(el).find(".title")[0]).text().trim();
      const url = $(el).attr("href") || "";
      let videoID = "";
      try {
        if (url) {
          const path = new URL(url, BASE_URL).pathname;
          videoID = path.replace(/^\/anime\//, "").replace(/\/$/, "");
        }
      } catch {}
      return { title, videoID };
    }).get();
  });

export const getAnime = async (id: string) => {
  const page = await fetchWithRetry(() => client.get(`/anime/${id}`)).then(({ data }) => {
    const $ = load(data);
    const title = $(".infoanime .entry-title")
      .text()
      .trim()
      .replace("Nonton Anime ", "");
    const episodes: { title: string; videoID: string }[] = [];
    $(".epsleft a").each((_, el) => {
      episodes.push({
        title: $(el).text().trim(),
        videoID: new URL($(el).attr("href")!, BASE_URL).pathname,
      });
    });
    return { title, episodes: [...episodes.reverse()] };
  });
  return page;
};

export const searchAnime = async (keyword: string) => {
  // Scrape hasil pencarian dari Samehadaku
  const { data } = await fetchWithRetry(() => client.get("/", {
    params: { s: keyword },
  }));
  const $ = load(data);
  // Ambil semua hasil dari selector utama
  const results: { title: string; url: string; cover: string; videoID: string }[] = [];
  $("article .animepost").each((_, el) => {
    const title = $(el).find(".title").text().trim();
    const url = $(el).find("a").attr("href") || "";
    const cover = $(el).find("img").attr("src") || "";
    // Ambil videoID dari path url (slug saja, tanpa /anime/)
    let videoID = "";
    try {
      if (url) {
        const path = new URL(url, BASE_URL).pathname;
        // Remove leading '/anime/' if present
        videoID = path.replace(/^\/anime\//, "");
        // Remove trailing slash if present
        videoID = videoID.replace(/\/$/, "");
      }
    } catch {}
    if (title && url) results.push({ title, url, cover, videoID });
  });
  // Fuzzy search lokal pakai Fuse.js
  const fuse = new Fuse(results, {
    keys: ["title"],
    threshold: 0.5,
  });
  const fuzzy = fuse.search(keyword);
  // Return semua hasil fuzzy, atau semua jika tidak ada hasil
  return (fuzzy.length ? fuzzy.map(f => f.item) : results);
};

export const getServerList = async (videoID: string) =>
  fetchWithRetry(() => client.get(videoID)).then(({ data }) => {
    const $ = load(data);
    const resources: ServerResource[] = [];
    for (const resource of $("#server ul li div")) {
      const current = $(resource);
      resources.push({
        post: current.attr("data-post")!,
        name: current.text().trim(),
        nume: current.attr("data-nume")!,
        type: current.attr("data-type")!,
      });
    }
    return resources;
  });

export const getStreamResource = ({ name: _, ...resource }: ServerResource) => {
  const form = new FormData();
  form.append("action", "player_ajax");
  for (const key of Object.keys(resource)) {
    form.append(key, resource[key as keyof typeof resource]);
  }
  return fetchWithRetry(() => client.post("wp-admin/admin-ajax.php", form)).then(({ data }) => {
    const $ = load(data);
    return $("iframe").attr("src")!;
  });
}; 
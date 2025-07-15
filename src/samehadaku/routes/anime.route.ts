/* eslint-disable */
import { getServerList, getStreamResource } from "../scraper";
import axios from "axios";
import { load } from "cheerio";
import { BASE_URL } from "../config";

export default async function animeHandler(req: any, url: any) {
  // Ekstrak slug dari url.pathname
  const match = url.pathname.match(/^\/anime\/([^/?#]+)/);
  const slug = match?.[1];
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing or invalid Samehadaku slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    // Scrape halaman detail anime Samehadaku
    const detailUrl = `${BASE_URL}anime/${slug}`;
    const { data } = await axios.get(detailUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT)" },
    });
    const $ = load(data);
    // Field utama
    const title = $(".infoanime .entry-title").text().trim().replace(/^Nonton Anime /, "");
    const description = $(".sinopsis").text().trim();
    const genres = $(".genre-info a").map((_, el) => $(el).text().trim()).get();
    const coverImage = $(".infoanime .thumb img").attr("src");
    const bannerImage = coverImage;
    // Field .spe (berantai)
    const spe: Record<string, string> = {};
    $(".spe span").each((_, el) => {
      const label = $(el).text().replace(/[:：]/g, "").trim();
      const value = $(el).next().text().trim();
      if (label && value) spe[label] = value;
    });
    // Daftar episode
    let episodes = $(".epsleft a").map((_, el) => {
      return {
        title: $(el).text().trim(),
        videoID: new URL($(el).attr("href")!, BASE_URL).pathname,
      };
    }).get();
    // Reverse agar urutan dari episode 1 ke terakhir
    episodes = episodes.slice().reverse();
    // Sistem request episode: ?episode=N (1-based, default: terakhir)
    const episodeParam = url.searchParams.get("episode");
    let selectedEpisode = null;
    if (episodes.length > 0) {
      let idx = episodes.length - 1;
      if (episodeParam) {
        const n = parseInt(episodeParam, 10) - 1;
        if (!isNaN(n) && n >= 0 && n < episodes.length) idx = n;
      }
      selectedEpisode = episodes[idx];
    }
    // Ambil semua link embed untuk episode terpilih
    let embed = null;
    let debug: Record<string, any> = {};
    if (selectedEpisode) {
      const servers = await getServerList(selectedEpisode.videoID);
      debug["servers"] = servers;
      embed = await Promise.all(
        servers.map(async (s: any) => {
          if (s.nume && typeof s.nume === "string") {
            try {
              const iframeSrc = await getStreamResource(s);
              return { name: s.name, src: iframeSrc };
            } catch (err) {
              return { name: s.name, src: null, error: (err as Error).message };
            }
          } else {
            return { name: s.name, src: null, error: "Invalid server" };
          }
        })
      );
    }
    // Response
    return new Response(JSON.stringify({
      slug,
      title,
      description,
      genres,
      coverImage,
      bannerImage,
      ...spe,
      episodes,
      selectedEpisode,
      embed,
      debug,
      url: detailUrl,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
} 
import axios from "axios";
import { load } from "cheerio";
import { db } from "../db/schema";
import { scheduleBackup } from "./backup";
import config from "../../config.json";
import { SimpleCache } from "./cache";

// --- Cache Instances ---
// Cache for 5 minutes
const animeCache = new SimpleCache<any>(300);
const genreCache = new SimpleCache<any>(300);
const latestUpdateCache = new SimpleCache<any>(300);
const top10Cache = new SimpleCache<any>(300);

const client = axios.create({
  baseURL: config.samehadaku.baseUrl,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT)",
  },
  timeout: 8000, // 8 second timeout
});

const parseRating = (ratingText: string | undefined) => {
  if (!ratingText) return null;
  const rating = ratingText.split("/")[0].trim();
  return !isNaN(parseFloat(rating)) ? rating : null;
};

export const getLatestUpdate = async () => {
  const cachedData = latestUpdateCache.get('latest');
  if (cachedData) return cachedData;

  const { data } = await client.get("anime-terbaru/");
  const $ = load(data);
  const list = $("div.post-show ul li");

  const promises = list
    .map((_, el) => {
      const element = $(el);
      const title = element.find("h2.entry-title a").text().trim();
      const animeID = new URL(element.find("h2.entry-title a").attr("href")!)
        .pathname;

      if (title && animeID) {
        return (async () => {
          try {
            const detailResponse = await client.get(animeID.startsWith('/') ? animeID.substring(1) : animeID);
            const detail$ = load(detailResponse.data);
            const thumbnail = detail$("div.thumb img.anmsa").attr("src");
            const rating = parseRating(detail$("div.rtg").text().trim());

            return {
              title,
              animeID,
              thumbnail,
              rating,
            };
          } catch (error) {
            return null;
          }
        })();
      }
      return null;
    })
    .get();

  const results = await Promise.all(promises);
  const filteredResults = results.filter((el) => el !== null);
  latestUpdateCache.set('latest', filteredResults);
  return filteredResults;
};

export const getAnime = async (id: string) => {
  const cachedData = animeCache.get(id);
  if (cachedData) return cachedData;

  const { data } = await client.get(`anime/${id}`);
  const $ = load(data);

  const title = $(".infoanime .entry-title").text().trim().replace("Nonton Anime ", "");
  const thumbnail = $("div.thumb img.anmsa").attr("src");
  const rating = parseRating($("div.rtg").text().trim());
  const synopsis = $("div.infox .desc p").text().trim();

  const details: { [key: string]: string } = {};
  $("div.spe > span").each((_, el) => {
    const element = $(el);
    const key = element.find("b").text().replace(":", "").trim().toLowerCase();
    const value = element.text().replace(element.find("b").text(), "").trim();
    if (key && value) {
      details[key] = value;
    }
  });

  const genres: string[] = [];
  $("div.genre-info a").each((_, el) => {
    genres.push($(el).text().trim());
  });

  const episodes: { title: string, videoID: string }[] = [];
  $(".epsleft a").each((_, episode) => {
    episodes.push({
        title: $(episode).text().trim(),
        videoID: new URL($(episode).attr('href')!).pathname
    });
  });

  const result = {
    title,
    thumbnail,
    rating,
    synopsis,
    status: details["status"],
    type: details["type"],
    source: details["source"],
    season: details["season"],
    studio: details["studio"],
    producers: details["producers"],
    genres,
    streamingEpisodes: episodes.reverse(),
  };

  animeCache.set(id, result);
  return result;
};

export const getAnimeByGenre = async (genre: string) => {
  const cachedData = genreCache.get(genre);
  if (cachedData) return cachedData;

  const { data } = await client.get(`genre/${genre}/`);
  const $ = load(data);

  const paginationText = $("div.pagination span").first().text();
  const totalPagesMatch = paginationText.match(/of (\d+)/);
  const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1], 10) : 1;

  const pagePromises = [];
  for (let i = 1; i <= totalPages; i++) {
    pagePromises.push(client.get(`genre/${genre}/page/${i}/`));
  }

  const pageResponses = await Promise.all(pagePromises);

  let allAnime: any[] = [];

  for (const response of pageResponses) {
    const page$ = load(response.data);
    page$("div.relat article.animpost").each((_, el) => {
      const element = page$(el);
      const title = element.find("div.title h2").text().trim();
      const animeID = new URL(element.find("a").attr("href")!).pathname;
      const thumbnail = element.find("img").attr("src");
      const ratingText = element.find("div.score").text().trim();
      const rating = ratingText.replace(/\s/g, "");

      if (title && animeID) {
        allAnime.push({ title, animeID, thumbnail, rating });
      }
    });
  }

  genreCache.set(genre, allAnime);
  return allAnime;
};

export const getServerList = async (videoID: string) => {
  const { data } = await client.get(videoID);
  const $ = load(data);
  const resources: any[] = [];
  $("#server ul li div").each((_, resource) => {
    const current = $(resource);
    resources.push({
      post: current.attr("data-post")!,
      name: current.text().trim(),
      nume: current.attr("data-nume")!,
      type: current.attr("data-type")!,
    });
  });
  return resources;
};

export const getStreamResource = ({ name: _, ...resource }: any) => {
  const form = new FormData();
  form.append("action", "player_ajax");
  for (const key of Object.keys(resource)) {
    form.append(key, resource[key as keyof typeof resource]);
  }
  return client.post("wp-admin/admin-ajax.php", form).then(({ data }) => {
    const $ = load(data);
    return $("iframe").attr("src")!;
  });
};

export const getEpisodeStream = async (episodeSlug: string) => {
  const cachedEmbeds = db.query(
    `SELECT server_name, url FROM embeds WHERE episode_slug = ?`
  ).all(episodeSlug) as { server_name: string; url: string }[];

  if (cachedEmbeds.length > 0) {
    console.log(`[Cache HIT] Serving embeds for ${episodeSlug} from database.`);
    const episodeDetails = db.query(`SELECT episode_title as title FROM episodes WHERE episode_slug = ?`).get(episodeSlug) as any;
    return {
        title: episodeDetails?.title || episodeSlug,
        streams: cachedEmbeds.map(e => ({ server: e.server_name, url: e.url }))
    }
  }

  const fullUrl = new URL(episodeSlug, config.samehadaku.baseUrl).href;
  console.log(`[Samehadaku] Attempting to scrape URL: ${fullUrl}`);

  try {
    const servers = await getServerList(episodeSlug);
    if (!servers || servers.length === 0) {
      console.log("[Samehadaku] No servers found for this episode.");
      return { title: "", streams: [] };
    }

    const { data } = await client.get(episodeSlug);
    const $ = load(data);
    const title = $("h1.entry-title").text().trim();

    const streamPromises = servers.map(async (server) => {
      try {
        const streamUrl = await getStreamResource(server);
        // Only insert into the database if the streamUrl is valid.
        if (streamUrl) {
          db.query(
            `INSERT INTO embeds (episode_slug, server_name, url) VALUES (?, ?, ?)`
          ).run(episodeSlug, server.name, streamUrl);
        }
        return { server: server.name, url: streamUrl };
      } catch (error) {
        console.error(`[Samehadaku] Failed to get stream resource for server: ${server.name}`, error);
        return { server: server.name, url: null };
      }
    });

    const streams = await Promise.all(streamPromises);
    const successfulStreams = streams.filter(s => s.url);

    if (successfulStreams.length > 0) {
        scheduleBackup();
    }

    console.log(`[Samehadaku] Successfully scraped. Found ${successfulStreams.length} streams.`);
    console.log("[Samehadaku] Streams:", successfulStreams);

    return {
      title,
      streams: successfulStreams,
    };
  } catch (error) {
    console.error(`[Samehadaku] Failed to scrape ${fullUrl}:`, error);
    return { title: "", streams: [] };
  }
};

export const getTop10Anime = async () => {
  const cachedData = top10Cache.get('top10');
  if (cachedData) return cachedData;

  const { data } = await client.get("/");
  const $ = load(data);
  const animeList: any[] = [];

  $(".topten-animesu ul li").each((_, el) => {
    const element = $(el);
    const title = element.find(".judul").text().trim();
    const cover = element.find("img").attr("src");
    const rating = element.find(".rating").text().trim().replace("\n", "").trim();
    const videoID = new URL(element.find("a.series").attr("href")!).pathname;

    if (title && videoID) {
      animeList.push({ title, cover, rating, videoID });
    }
  });

  top10Cache.set('top10', animeList);
  return animeList;
};

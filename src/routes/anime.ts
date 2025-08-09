import { Elysia, t } from "elysia";
import { getAnime, getEpisodeStream } from "../lib/scraper";
import { db } from "../db/schema";

export const animeRoutes = new Elysia({ prefix: "/anime" })
  .get("/:slug", async ({ params }) => {
    const manualAnime = db.query(`SELECT * FROM animes WHERE slug = ?`).get(params.slug) as any;

    if (manualAnime) {
        const manualEpisodes = db.query(`SELECT episode_slug as videoID, episode_title as title FROM episodes WHERE anime_slug = ?`).all(params.slug);
        manualAnime.streamingEpisodes = manualEpisodes;
        manualAnime.genres = [];
        return manualAnime;
    }

    return getAnime(params.slug);
  })
  .get("/:slug/episode/:episode_slug", async ({ params }) => {
    const manualEmbeds = db.query(`SELECT server_name, url FROM embeds WHERE episode_slug = ?`).all(params.episode_slug);

    if (manualEmbeds.length > 0) {
        const episodeDetails = db.query(`SELECT episode_title as title FROM episodes WHERE episode_slug = ?`).get(params.episode_slug) as any;
        return {
            title: episodeDetails?.title || params.episode_slug,
            streams: manualEmbeds.map(e => ({ server: e.server_name, url: e.url }))
        }
    }

    return getEpisodeStream(params.episode_slug);
  });
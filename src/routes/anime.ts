import { Elysia, t } from "elysia";
import { getAnime, getEpisodeStream } from "../lib/samehadaku_scraper";
import { db } from "../db/schema";
import { getOploverzEpisodeStream } from "../lib/oploverz_scraper";

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
  .get("/:slug/episode/:episode_slug", async ({ params, set }) => {
    const [samehadakuResult, oploverzResult] = await Promise.all([
        getEpisodeStream(params.episode_slug),
        getOploverzEpisodeStream(params.episode_slug)
    ]);

    let allStreams: { server: string; url: string | null; }[] = [];

    if (samehadakuResult && samehadakuResult.streams) {
        allStreams.push(...samehadakuResult.streams);
    }
    if (oploverzResult && oploverzResult.streams) {
        allStreams.push(...oploverzResult.streams);
    }

    // Deduplicate streams based on the URL to ensure uniqueness
    const uniqueStreams = allStreams.filter((stream, index, self) =>
        stream.url && index === self.findIndex((s) => s.url === stream.url)
    );

    if (uniqueStreams.length === 0) {
        set.status = 404;
        return { message: "Episode not found on any provider." };
    }

    // Prioritize title from Samehadaku, then Oploverz, then the slug itself
    const title = samehadakuResult?.title || oploverzResult?.title || params.episode_slug;

    return {
        title,
        streams: uniqueStreams
    };
  });
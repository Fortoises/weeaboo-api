import { Elysia, t } from "elysia";
import { getAnime, getEpisodeStream } from "../lib/samehadaku_scraper";
import { db } from "../db/schema";
import { getOploverzEpisodeStream } from "../lib/oploverz_scraper";
import { resolveStreamUrl, isCacheableHost } from "../lib/resolver";
import { scheduleBackup } from "../lib/backup";

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
  .get("/:slug/episode/:episode_slug", async ({ params, set, request }) => {
    const slug = params.episode_slug;

    // Step 1: Get all cached streams from the database.
    const cachedStreams = db.query(
        `SELECT server_name, embed_url, direct_url FROM streams WHERE episode_slug = ?`
    ).all(slug) as { server_name: string; embed_url: string; direct_url: string | null }[];

    // Step 2: Scrape for a fresh list of streams from all providers.
    const [samehadakuResult, oploverzResult] = await Promise.all([
        getEpisodeStream(slug),
        getOploverzEpisodeStream(slug)
    ]);

    const freshStreams: any[] = [];
    if (samehadakuResult?.streams) freshStreams.push(...samehadakuResult.streams);
    if (oploverzResult?.streams) freshStreams.push(...oploverzResult.streams);

    // Step 3: Combine and process the lists.
    const finalStreamList: any[] = [];
    const processedEmbedUrls = new Set();
    let hasNewCachedContent = false;

    // First, process the fresh streams from the scrape.
    for (const freshStream of freshStreams) {
        if (!freshStream.embed_url || processedEmbedUrls.has(freshStream.embed_url)) {
            continue; // Skip duplicates
        }

        const cacheable = isCacheableHost(freshStream.embed_url);
        const existingCachedStream = cachedStreams.find(cs => cs.embed_url === freshStream.embed_url);

        if (existingCachedStream) {
            // If it exists in cache, add it to the final list.
            finalStreamList.push(existingCachedStream);
        } else {
            // If it's new, add it to the final list.
            finalStreamList.push({ ...freshStream, direct_url: null }); // Add with null direct_url for now
            // And if it's cacheable, save it to the DB.
            if (cacheable) {
                db.query(
                    `INSERT INTO streams (episode_slug, server_name, embed_url) VALUES (?, ?, ?)`
                ).run(slug, freshStream.server, freshStream.embed_url);
                hasNewCachedContent = true;
            }
        }
        processedEmbedUrls.add(freshStream.embed_url);
    }

    if (hasNewCachedContent) {
        scheduleBackup();
    }

    if (finalStreamList.length === 0) {
        set.status = 404;
        return { message: "Episode not found on any provider." };
    }

    // Step 4: Resolve direct URLs.
    const clientIp = request.headers.get('x-forwarded-for');
    const resolutionPromises = finalStreamList.map(async (stream) => {
        const cacheable = isCacheableHost(stream.embed_url);

        // If it's cacheable and we have a direct_url, use it.
        if (cacheable && stream.direct_url) {
            return stream;
        }

        // Otherwise, resolve it in real-time.
        const resolvedUrl = await resolveStreamUrl(stream.embed_url, request.headers, clientIp || undefined);

        // If resolution is successful and the host is cacheable, update the DB.
        if (resolvedUrl && cacheable) {
            db.query(
                `UPDATE streams SET direct_url = ? WHERE embed_url = ?`
            ).run(resolvedUrl, stream.embed_url);
        }
        
        return { ...stream, direct_url: resolvedUrl };
    });

    const resolvedStreams = await Promise.all(resolutionPromises);
    const title = samehadakuResult?.title || oploverzResult?.title || slug;

    return {
        title,
        streams: resolvedStreams.map(s => ({
            server: s.server_name || s.server,
            embed_url: s.embed_url,
            direct_url: s.direct_url
        }))
    };
  });

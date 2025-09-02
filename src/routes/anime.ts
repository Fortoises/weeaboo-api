import { Elysia, t } from "elysia";
import { getAnime, getEpisodeStream } from "../lib/samehadaku_scraper";
import { db } from "../db/schema";
import { getOploverzEpisodeStream } from "../lib/oploverz_scraper";
import { scheduleBackup } from "../lib/backup";
import { resolveSamehadakuSlug } from "../lib/anilist_mapper";

function parseServerString(server: string, embedUrl: string): { provider: string | null, quality: string } {
    if (!server) return { provider: null, quality: "default" };

    let provider: string | null = null;
    const lowerEmbedUrl = embedUrl.toLowerCase();

    if (lowerEmbedUrl.includes('blogger.com') || lowerEmbedUrl.includes('blogspot.com')) {
        provider = 'blogger';
    } else if (lowerEmbedUrl.includes('filedon.co')) {
        provider = 'filedon';
    } else if (lowerEmbedUrl.includes('pixeldrain.com')) {
        provider = 'pixeldrain';
    } else if (lowerEmbedUrl.includes('mega.nz')) {
        provider = 'mega';
    } else if (lowerEmbedUrl.includes('wibufile.com')) {
        provider = 'wibufile';
    }

    let quality: string = 'default';
    const qualityMatch = server.match(/(1080p|720p|480p|360p)/i);
    if (qualityMatch) {
        quality = qualityMatch[0].toLowerCase();
    }

    return { provider, quality };
}

export const animeRoutes = new Elysia({ prefix: "/anime" })
  .get("/:slug", async ({ params, set }) => {
    const { slug } = params;

    // First, check for manually added anime in the DB.
    const manualAnime = db.query(`SELECT * FROM animes WHERE slug = ?`).get(slug) as any;
    if (manualAnime) {
        const manualEpisodes = db.query(`SELECT episode_slug, episode_title FROM episodes WHERE anime_slug = ?`).all(slug) as { episode_slug: string, episode_title: string }[];
        
        manualAnime.episodes = manualEpisodes.map(ep => {
            const episodeMatch = ep.episode_slug.match(/episode-(\d+)/);
            return {
                title: ep.episode_title,
                episode: episodeMatch ? episodeMatch[1] : "0"
            };
        });
        manualAnime.genres = []; // Genres are not stored for manual entries in this structure
        return manualAnime;
    }

    const resolvedSlug = await resolveSamehadakuSlug(slug);
    if (!resolvedSlug) {
        set.status = 404;
        return { message: `Anime with slug '${slug}' could not be found or mapped.` };
    }

    // Fetch anime details using the resolved Samehadaku slug.
    return getAnime(resolvedSlug.replace(/\/anime\/|\//g, ""));

  }, { detail: { summary: 'Get Anime Details by Slug', description: 'Accepts a clean (Anilist-style) or Samehadaku-style slug and returns the anime details.', tags: ['Anime'] } })

  .get("/:slug/episode/:episode_number", async ({ params, set }) => {
    const { slug, episode_number } = params;

    const samehadakuBaseSlug = await resolveSamehadakuSlug(slug);
    if (!samehadakuBaseSlug) {
        set.status = 404;
        return { message: `Anime with slug '${slug}' could not be found or mapped.` };
    }

    const cleanedBaseSlug = samehadakuBaseSlug.replace(/\/anime\/|\//g, "");
    const constructedEpisodeSlug = `${cleanedBaseSlug}-episode-${episode_number}`;
    let title = `${slug} Episode ${episode_number}`;

    let streamsFromDb = db.query(
        `SELECT server_name, embed_url, provider, quality, source FROM streams WHERE episode_slug = ?`
    ).all(constructedEpisodeSlug) as { server_name: string; embed_url: string; provider: string | null; quality: string | null; source: string | null }[];

    if (streamsFromDb.length === 0) {
        console.log(`[Cache] No streams found in DB for ${constructedEpisodeSlug}. Scraping...`);
        const [samehadakuResult, oploverzResult] = await Promise.all([
            getEpisodeStream(constructedEpisodeSlug),
            getOploverzEpisodeStream(constructedEpisodeSlug)
        ]);

        const freshStreams: any[] = [];
        if (samehadakuResult?.streams) {
            samehadakuResult.streams.forEach(s => freshStreams.push({ ...s, source: 'Samehadaku' }));
        }
        if (oploverzResult?.streams) {
            oploverzResult.streams.forEach(s => freshStreams.push({ ...s, source: 'Oploverz' }));
        }
        
        if (samehadakuResult?.title) title = samehadakuResult.title;
        else if (oploverzResult?.title) title = oploverzResult.title;

        if (freshStreams.length > 0) {
            const insertStmt = db.prepare(
                `INSERT OR IGNORE INTO streams (episode_slug, server_name, embed_url, provider, quality, source) VALUES (?, ?, ?, ?, ?, ?)`
            );
            db.transaction(() => {
                for (const stream of freshStreams) {
                    const { provider, quality } = parseServerString(stream.server, stream.embed_url);
                    insertStmt.run(constructedEpisodeSlug, stream.server, stream.embed_url, provider, quality, stream.source);
                }
            })();
            scheduleBackup();
            console.log(`[Cache] Saved ${freshStreams.length} new streams to DB for ${constructedEpisodeSlug}.`);
            
            streamsFromDb = db.query(
                `SELECT server_name, embed_url, provider, quality, source FROM streams WHERE episode_slug = ?`
            ).all(constructedEpisodeSlug) as any;
        }
    } else {
        console.log(`[Cache] Found ${streamsFromDb.length} streams in DB for ${constructedEpisodeSlug}.`);
    }

    if (streamsFromDb.length === 0) {
        set.status = 404;
        return { message: "Episode not found on any provider." };
    }

    return {
        title,
        streams: streamsFromDb.map(s => {
            const streamUrl = s.provider && s.quality
                ? `/anime/stream/${constructedEpisodeSlug}?provider=${s.provider}&quality=${s.quality}`
                : null;

            return {
                server: s.server_name,
                provider: s.provider,
                quality: s.quality,
                embed_url: s.embed_url,
                stream_url: streamUrl,
                source: s.source ?? 'Unknown'
            }
        })
    };
  }, {
    params: t.Object({
        slug: t.String(),
        episode_number: t.Numeric()
    }),
    detail: {
        summary: "Get Episode Streams by Number",
        description: "Returns available streams for a specific episode number using a consistent anime slug. It uses a cache-first strategy. If streams are not in the database, it will scrape them and store them for future requests.",
        tags: ["Anime"],
    },
    response: {
        200: t.Object({
            title: t.String(),
            streams: t.Array(t.Object({
                server: t.String(),
                provider: t.Nullable(t.String()),
                quality: t.Nullable(t.String()),
                embed_url: t.String(),
                stream_url: t.Nullable(t.String()),
                source: t.String()
            }))
        }),
        404: t.Object({ message: t.String() })
    }
  });

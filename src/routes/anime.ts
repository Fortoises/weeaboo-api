import { Elysia, t } from "elysia";
import { getAnime, getEpisodeStream } from "../lib/samehadaku_scraper";
import { db } from "../db/schema";
import { getOploverzEpisodeStream } from "../lib/oploverz_scraper";
import { scheduleBackup } from "../lib/backup";
import { resolveSlugs } from "../lib/slug_resolver";

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

    const resolved = await resolveSlugs(slug);
    if (!resolved?.samehadaku_slug) {
        set.status = 404;
        return { message: `Anime with slug '${slug}' could not be found or mapped to a Samehadaku entry.` };
    }

    // Fetch anime details using the resolved Samehadaku slug.
    return getAnime(resolved.samehadaku_slug);

  }, { 
      detail: { 
          summary: 'Get Anime Details by Anilist Slug', 
          description: 'Accepts a clean Anilist-style slug and returns the anime details from the first available provider.', 
          tags: ['Anime'] 
        }
    })

  .get("/:slug/episode/:episode_identifier", async ({ params, set }) => {
    const { slug, episode_identifier } = params;

    const resolved = await resolveSlugs(slug);
    if (!resolved?.samehadaku_slug) {
        set.status = 404;
        return { message: `Anime with slug '${slug}' could not be found or mapped.` };
    }

    const constructedEpisodeSlug = `${resolved.samehadaku_slug}-episode-${episode_identifier}`;
    let title = `${slug} Episode ${episode_identifier}`;

    let streamsFromDb = db.query(
        `SELECT server_name, embed_url, provider, quality, source FROM streams WHERE episode_slug = ?`
    ).all(constructedEpisodeSlug) as { server_name: string; embed_url: string; provider: string | null; quality: string | null; source: string | null }[];

    if (streamsFromDb.length === 0) {
        console.log(`[Cache] No streams found in DB for ${constructedEpisodeSlug}. Scraping...`);
        
        // For now, we still rely on the Samehadaku slug to find the Oploverz episode.
        // This can be improved later if Oploverz mapping is also added to the resolver.
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
            
            streamsFromDb = freshStreams.map(stream => {
                const { provider, quality } = parseServerString(stream.server, stream.embed_url);
                return {
                    server_name: stream.server,
                    embed_url: stream.embed_url,
                    provider,
                    quality,
                    source: stream.source
                };
            });
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
        episode_identifier: t.String()
    }),
    detail: {
        summary: "Get Episode Streams by Number",
        description: "Fetches streams for an episode. It resolves the Anilist slug to a provider slug, then uses a cache-first strategy. If streams are not in the database, it will scrape them and store them for future requests.",
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
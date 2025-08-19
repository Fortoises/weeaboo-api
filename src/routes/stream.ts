import { Elysia, t } from "elysia";
import { db } from "../db/schema";
import { resolveStreamUrl } from "../lib/resolver";
import axios from "axios";

export const streamRoutes = new Elysia({ prefix: "/anime/stream" })
  .get("/:slugepisode", async ({ params, query, set, request }) => {
    const startTime = Date.now();
    // Elysia captures params with dots literally. We access it and remove the extension.
    const slugepisode = params['slugepisode'];
    
    const { quality, provider } = query;

    if (!slugepisode || !provider || !quality) {
        set.status = 400;
        return { message: "Missing required parameters: slugepisode, provider, and quality." };
    }

    console.log(`[Stream] Request for ${slugepisode} - Provider: ${provider}, Quality: ${quality}`);

    const dbQueryStart = Date.now();
    const matchingStreams = db.query(
        `SELECT embed_url FROM streams WHERE episode_slug = ? AND provider = ? AND quality = ?`
    ).all(slugepisode, provider, quality) as { embed_url: string }[];
    console.log(`[Stream] DB query took ${Date.now() - dbQueryStart}ms`);

    if (!matchingStreams || matchingStreams.length === 0) {
        set.status = 404;
        return { message: `Stream not found in database for provider '${provider}' and quality '${quality}'. Please fetch /anime/episode/${slugepisode} first.` };
    }

    console.log(`[Stream] Found ${matchingStreams.length} matching stream(s) in DB. Attempting to resolve...`);

    for (const streamToTry of matchingStreams) {
        console.log(`[Stream] Attempting to resolve: ${streamToTry.embed_url}`);
        const resolveStart = Date.now();
        const clientIp = request.headers.get('x-forwarded-for');
        const directUrl = await resolveStreamUrl(streamToTry.embed_url, request.headers, clientIp || undefined);
        console.log(`[Stream] Resolving URL took ${Date.now() - resolveStart}ms`);

        if (directUrl) {
            console.log(`[Stream] Resolved to: ${directUrl}. Starting video stream proxy.`);
            try {
                const proxyStart = Date.now();
                const response = await axios.get(directUrl, { 
                    responseType: 'stream', 
                    headers: { 'Referer': streamToTry.embed_url } 
                });
                console.log(`[Stream] Axios TTFB (Time To First Byte) took ${Date.now() - proxyStart}ms`);

                const headers = {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Content-Length': response.headers['content-length'],
                    'Accept-Ranges': 'bytes',
                    'Content-Disposition': 'inline'
                };

                const videoStream = new ReadableStream({
                    start(controller) {
                        response.data.on('data', (chunk: any) => {
                            controller.enqueue(chunk);
                        });
                        response.data.on('end', () => {
                            controller.close();
                            console.log(`[Stream] Finished streaming. Total time: ${Date.now() - startTime}ms`);
                        });
                        response.data.on('error', (err: any) => {
                            controller.error(err);
                            console.error(`[Stream] Error during streaming. Total time: ${Date.now() - startTime}ms`);
                        });
                    }
                });
                
                return new Response(videoStream, { headers });
            } catch (error) {
                console.error(`[Stream] Proxy failed for resolved URL: ${directUrl}. Trying next link. Total time: ${Date.now() - startTime}ms`, error);
            }
        }
    }

    set.status = 502;
    console.error(`[Stream] All found stream links failed to resolve or proxy for ${slugepisode}. Total time: ${Date.now() - startTime}ms`);
    return { message: "Could not resolve or stream from any of the available sources." };

}, {
    query: t.Object({
        quality: t.Optional(t.String({ description: "Example: '720p', '1080p', or 'default'" })),
        provider: t.Optional(t.String({ description: "Example: 'blogger', 'filedon'" }))
    }),
    params: t.Object({
        'slugepisode': t.String({ description: "The episode slug, e.g., 'one-piece-episode-1'" })
    }),
    detail: {
        summary: "Proxy Video Stream",
        description: `Proxies a video stream from the source to the client. This route is designed to be used with the 'stream_url' provided by the /anime/episode/{slug} endpoint. It reads stream information from the database, resolves the original embed URL in real-time, and then streams the video with the correct headers to prevent forced downloads and allow in-browser playback.\n\nThis route will try multiple links if available for the same quality and provider, making it resilient to dead links.`,
        tags: ["Anime"]
    }
});
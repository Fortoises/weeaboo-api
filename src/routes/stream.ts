import { Elysia, t } from "elysia";
import { db } from "../db/schema";
import { resolveStreamUrl } from "../lib/resolver";
import axios from "axios";
import config from "../../config.json";
import { SimpleCache } from "../lib/cache";

// Cache for resolved direct stream URLs. From the logs, these URLs seem to be valid for at least an hour.
// We cache them for 55 minutes to be safe. This prevents re-resolving the URL for every single video chunk request.
const resolvedUrlCache = new SimpleCache<string>(3300);

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
        let directUrl = resolvedUrlCache.get(streamToTry.embed_url);
        const refererUrl = new URL(slugepisode, config.samehadaku.baseUrl).href;

        if (!directUrl) {
            console.log(`[Cache] No resolved URL in cache for ${streamToTry.embed_url}. Resolving...`);
            const resolveStart = Date.now();
            const clientIp = request.headers.get('x-forwarded-for');
            directUrl = await resolveStreamUrl(streamToTry.embed_url, request.headers, clientIp || undefined, refererUrl);
            console.log(`[Stream] Resolving URL took ${Date.now() - resolveStart}ms`);
    
            if (directUrl) {
                resolvedUrlCache.set(streamToTry.embed_url, directUrl);
            }
        } else {
            console.log(`[Cache] Found resolved URL in cache for ${streamToTry.embed_url}.`);
        }

        if (directUrl) {
            try {
                // --- Transparent Proxy Logic ---
                // 1. Clone incoming headers from the client.
                const proxyHeaders: Record<string, any> = { ...request.headers };

                // 2. Delete headers that are set by the proxy or are connection-specific.
                delete proxyHeaders['host'];
                delete proxyHeaders['connection'];
                delete proxyHeaders['sec-fetch-site'];
                delete proxyHeaders['sec-fetch-mode'];
                delete proxyHeaders['sec-fetch-dest'];

                // 3. Set the correct Referer based on the provider.
                // Using the original content page as the referer for all providers ensures consistent behavior
                // for features like HTTP Range requests (seeking).
                const finalReferer = refererUrl;
                proxyHeaders['referer'] = finalReferer;

                // 4. Explicitly handle the Range header to ensure seeking works.
                const range = request.headers.get('range');
                delete proxyHeaders['range']; // Remove original to avoid duplicates
                if (range) {
                    proxyHeaders['Range'] = range; // Ensure correct capitalization
                }

                console.log(`[Stream] Resolved to: ${directUrl}. Starting transparent proxy with Referer: ${finalReferer}`);

                const proxyStart = Date.now();
                const response = await axios.get(directUrl, { 
                    responseType: 'stream', 
                    headers: proxyHeaders as Record<string, string>,
                    timeout: 300000, // 5 minutes timeout
                    validateStatus: status => status >= 200 && status < 400 // Accept 2xx and 3xx responses
                });
                console.log(`[Stream] Axios TTFB (Time To First Byte) took ${Date.now() - proxyStart}ms. Source status: ${response.status}`);

                // Prepare headers for the client response, copying from the source.
                const responseHeaders = new Headers();
                
                // --- Content-Type Logic ---
                let contentType = response.headers['content-type']; // Start with source's content-type
                if (directUrl.includes('.m3u8')) {
                    contentType = 'application/vnd.apple.mpegurl';
                } else if (directUrl.includes('.mp4')) {
                    contentType = 'video/mp4';
                }
                responseHeaders.set('Content-Type', contentType || 'video/mp4'); // Fallback to video/mp4

                responseHeaders.set('Accept-Ranges', 'bytes');
                responseHeaders.set('Content-Disposition', 'inline');

                if (response.headers['content-length']) {
                    responseHeaders.set('Content-Length', response.headers['content-length']);
                }
                if (response.headers['content-range']) {
                    responseHeaders.set('Content-Range', response.headers['content-range']);
                }

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
                
                // Return response with the source's status code (e.g., 200 for full, 206 for partial)
                return new Response(videoStream, { 
                    status: response.status,
                    headers: responseHeaders
                });

            } catch (error: any) {
                if (error.response) {
                    console.error(`[Stream] Proxy failed for resolved URL: ${directUrl}. Source responded with ${error.response.status}.`, error.response.data);
                } else {
                    console.error(`[Stream] Proxy failed for resolved URL: ${directUrl}. Trying next link. Total time: ${Date.now() - startTime}ms`, error.message);
                }
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

import axios from "axios";
import { load } from "cheerio";
import config from "../../config.json";
import { CookieJar } from 'tough-cookie';
import { wrapper as axiosCookieJarSupport } from 'axios-cookiejar-support';

// --- Blogger Resolver ---
async function resolveBlogger(url: string, headers: any, ip: string | undefined): Promise<string | null> {
  try {
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': headers['user-agent'],
            'Referer': url,
            'X-Forwarded-For': ip, // Forward the user's IP
        }
    });
    const match = (data as string).match(/var VIDEO_CONFIG = (.*)\n/m);
    if (!match || !match[1]) return null;

    const configJson = JSON.parse(match[1]);
    
    const hlsStream = configJson.streams.find((s: any) => s.play_url && s.play_url.includes('.m3u8'));
    if (hlsStream) {
        return hlsStream.play_url;
    }

    const stream = configJson.streams.sort((a: any, b: any) => b.height - a.height)[0];
    return stream ? stream.play_url : null;
  } catch (error) {
    console.error(`[Resolver] Failed to resolve Blogger URL: ${url}`, error);
    return null;
  }
}

// --- Wibufile Resolver (Robust Regex) ---
async function resolveWibufile(url: string, headers: any, refererUrl?: string): Promise<string | null> {
    const finalReferer = refererUrl || config.samehadaku.baseUrl;
    console.log(`[Resolver] Attempting to resolve Wibufile embed page: ${url} with Referer: ${finalReferer}`);

    try {
        const { data: pageHtml } = await axios.get(url, {
            headers: {
                'User-Agent': headers['user-agent'],
                'Referer': finalReferer,
            },
        });

        // Use a more robust regex to find the URL, tolerating different quotes and spacing.
        const apiUrlMatch = pageHtml.match(/url:\s*["'](.*api\.wibufile\.com\/api\/\?.*?)["']/);
        if (!apiUrlMatch || !apiUrlMatch[1]) {
            console.error(`[Resolver] Could not find dynamic API URL in Wibufile page with robust regex.`);
            return null;
        }
        // Prepend https: if the URL starts with //
        const dynamicApiUrl = apiUrlMatch[1].startsWith('//') ? `https:${apiUrlMatch[1]}` : apiUrlMatch[1];
        console.log(`[Resolver] Found dynamic Wibufile API URL: ${dynamicApiUrl}`);

        const { data: apiResponse } = await axios.get(dynamicApiUrl, {
            headers: {
                'User-Agent': headers['user-agent'],
                'Referer': url, 
            }
        });

        if (apiResponse.status !== 'ok' || !apiResponse.sources || apiResponse.sources.length === 0) {
            console.error(`[Resolver] Wibufile dynamic API call failed or returned no sources. Response:`, apiResponse.message || 'No message');
            return null;
        }

        const sources = apiResponse.sources;
        const hlsSource = sources.find((s: any) => s.file && s.file.includes('.m3u8'));
        if (hlsSource && hlsSource.file) {
            return hlsSource.file;
        }

        const firstSource = sources[0];
        if (firstSource && firstSource.file) {
            return firstSource.file;
        }

        return null;

    } catch (error: any) {
        console.error(`[Resolver] Failed to resolve Wibufile embed page ${url}:`, error.message);
        return null;
    }
}


// --- Pixeldrain Resolver ---
async function resolvePixeldrain(url: string): Promise<string | null> {
    const id = new URL(url).pathname.split('/').pop();
    if (!id) return null;

    const infoUrl = `https://pixeldrain.com/api/file/${id}/info`;
    const downloadUrl = `https://pixeldrain.com/api/file/${id}`;

    try {
        const { data: info } = await axios.get(infoUrl);
        if (!info.success) {
            console.warn(`[Resolver] Pixeldrain file ${id} is not available or info check failed.`);
            return null;
        }
        return downloadUrl;
    } catch (error: any) {
        return null;
    }
}

// --- Filedon Resolver ---
async function resolveFiledon(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get(url);
    const $ = load(data);

    const scriptContent = $("script").text();
    const m3u8Match = scriptContent.match(/"(https?:[^"]+\.m3u8[^"]*)"/);
    if (m3u8Match && m3u8Match[1]) {
      return m3u8Match[1];
    }

    const dataPage = $("#app").attr('data-page');
    if (!dataPage) return null;

    const pageProps = JSON.parse(dataPage);
    return pageProps?.props?.url || null;

  } catch (error) {
    console.error(`[Resolver] Failed to resolve Filedon URL: ${url}`, error);
    return null;
  }
}

// --- Main Resolver Function ---
export async function resolveStreamUrl(streamUrl: string, headers: any, ip: string | undefined, refererUrl?: string): Promise<string | null> {
  // If the URL is already a direct video link, return it immediately.
  if (streamUrl.includes('.mp4') || streamUrl.includes('.m3u8') || streamUrl.includes('s0.wibufile.com')) {
    console.log(`[Resolver] URL is already a direct link, skipping resolution: ${streamUrl}`);
    return streamUrl;
  }

  const hostname = new URL(streamUrl).hostname;

  if (hostname.includes('blogger.com')) {
    return resolveBlogger(streamUrl, headers, ip);
  }
  if (hostname.includes('api.wibufile.com')) {
    return resolveWibufile(streamUrl, headers, refererUrl);
  }
  if (hostname.includes('pixeldrain.com')) {
    return resolvePixeldrain(streamUrl);
  }
  if (hostname.includes('filedon.co')) {
    return resolveFiledon(streamUrl);
  }
  if (hostname.includes('mega.nz')) {
    console.log(`[Resolver] Mega.nz URLs are not supported due to encryption.`);
    return null;
  }

  console.warn(`[Resolver] No resolver found for hostname: ${hostname}`);
  return null;
}
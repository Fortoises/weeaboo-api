import axios from "axios";
import { load } from "cheerio";
import config from "../../config.json";

// --- Helper Function ---
export const isCacheableHost = (embedUrl: string) => {
    // Links from these hosts are temporary or require special handling, so they shouldn't be cached.
    const nonCacheableHosts = ['api.wibufile.com', 'blogger.com', 'googlevideo.com'];
    return !nonCacheableHosts.some(host => embedUrl.includes(host));
}

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
    // Find the highest quality stream
    const stream = configJson.streams.sort((a: any, b: any) => b.height - a.height)[0];
    return stream ? stream.play_url : null;
  } catch (error) {
    console.error(`[Resolver] Failed to resolve Blogger URL: ${url}`, error);
    return null;
  }
}

// --- Wibufile Resolver (Hybrid Approach - Final) ---
async function resolveWibufile(url: string, headers: any): Promise<string | null> {
    if (url.includes('.mp4')) {
        return url;
    }

    // This resolver returns the intermediate API URL. 
    // The client MUST call this URL to get the final .mp4 link.
    try {
        const { data: pageHtml } = await axios.get(url, {
            headers: {
                'Referer': config.samehadaku.baseUrl,
                'User-Agent': headers['user-agent'],
            }
        });
        
        const ajaxUrlMatch = pageHtml.match(/"(\/\/api.wibufile.com\/api\/\?.*?)"/);
        if (!ajaxUrlMatch || !ajaxUrlMatch[1]) {
            console.log(`[Resolver] Could not find Wibufile AJAX URL on page: ${url}`);
            return null;
        }
        
        return `https:${ajaxUrlMatch[1]}`;

    } catch (error) {
        console.error(`[Resolver] Failed to resolve Wibufile URL: ${url}`);
        return null;
    }
}

// --- Pixeldrain Resolver ---
async function resolvePixeldrain(url: string): Promise<string | null> {
  try {
    const id = new URL(url).pathname.split('/').pop();
    if (!id) return null;
    return `https://pixeldrain.com/api/file/${id}`;
  } catch (error) {
    console.error(`[Resolver] Failed to resolve Pixeldrain URL: ${url}`, error);
    return null;
  }
}

// --- Filedon Resolver ---
async function resolveFiledon(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get(url);
    const $ = load(data);

    const dataPage = $("#app").attr('data-page');
    if (!dataPage) {
        return null;
    }

    const pageProps = JSON.parse(dataPage);
    const directUrl = pageProps?.props?.url;

    if (directUrl) {
        return directUrl;
    }

    return null;

  } catch (error) {
    console.error(`[Resolver] Failed to resolve Filedon URL: ${url}`, error);
    return null;
  }
}

// --- Main Resolver Function ---
export async function resolveStreamUrl(streamUrl: string, headers: any, ip: string | undefined): Promise<string | null> {
  const hostname = new URL(streamUrl).hostname;

  if (hostname.includes('blogger.com')) {
    return resolveBlogger(streamUrl, headers, ip);
  }
  if (hostname.includes('wibufile.com')) {
    return resolveWibufile(streamUrl, headers);
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

  return null;
}

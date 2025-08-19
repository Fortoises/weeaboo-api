import axios from "axios";
import { load } from "cheerio";
import config from "../../config.json";

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
    
    // Prioritize HLS stream if available
    const hlsStream = configJson.streams.find((s: any) => s.play_url && s.play_url.includes('.m3u8'));
    if (hlsStream) {
        return hlsStream.play_url;
    }

    // Fallback to the highest quality stream
    const stream = configJson.streams.sort((a: any, b: any) => b.height - a.height)[0];
    return stream ? stream.play_url : null;
  } catch (error) {
    console.error(`[Resolver] Failed to resolve Blogger URL: ${url}`, error);
    return null;
  }
}

// --- Wibufile Resolver (Hybrid Approach - Final) ---
async function resolveWibufile(url: string, headers: any): Promise<string | null> {
    if (url.includes('.m3u8') || url.includes('.mp4')) {
        return url;
    }

    try {
        const { data: pageHtml } = await axios.get(url, {
            headers: {
                'Referer': config.samehadaku.baseUrl, // Or any valid referer
                'User-Agent': headers['user-agent'],
            }
        });

        const jwpConfigMatch = pageHtml.match(/sources: \[(.*?)(\\s*\\n.*?)?\]/);
        if (!jwpConfigMatch || !jwpConfigMatch[1]) {
            console.log(`[Resolver] Could not find jwplayer config on page: ${url}`);
            return null;
        }

        const sourceConfigString = `[${jwpConfigMatch[1].replace(/\\/g, '')}]`;
        const sources = JSON.parse(sourceConfigString);

        // Find HLS (m3u8) source first
        const hlsSource = sources.find((s: any) => s.file && s.file.includes('.m3u8'));
        if (hlsSource) {
            return hlsSource.file;
        }

        // Fallback to the first available source if no HLS is found
        const firstSource = sources[0];
        if (firstSource && firstSource.file) {
            return firstSource.file;
        }

        console.log(`[Resolver] Could not extract file URL from jwplayer config: ${url}`);
        return null;

    } catch (error) {
        console.error(`[Resolver] Failed to resolve Wibufile URL: ${url}`, error);
        return null;
    }
}

// --- Pixeldrain Resolver ---
async function resolvePixeldrain(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get(url);
    const $ = load(data);
    const scriptContent = $("script").text();
    const m3u8Match = scriptContent.match(/"(https?:[^"]+\.m3u8[^"]*)"/);

    if (m3u8Match && m3u8Match[1]) {
      return m3u8Match[1];
    }

    // Fallback to the old method if no m3u8 is found
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

    // First, try to find an m3u8 URL in the script tags
    const scriptContent = $("script").text();
    const m3u8Match = scriptContent.match(/"(https?:[^"]+\.m3u8[^"]*)"/);
    if (m3u8Match && m3u8Match[1]) {
      return m3u8Match[1];
    }

    // If no m3u8 is found, fall back to the data-page attribute
    const dataPage = $("#app").attr('data-page');
    if (!dataPage) {
        return null;
    }

    const pageProps = JSON.parse(dataPage);
    const directUrl = pageProps?.props?.url;

    if (directUrl) {
        // No specific m3u8 check here as it seems to be a direct link
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

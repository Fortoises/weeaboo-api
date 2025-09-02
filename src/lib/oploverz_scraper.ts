import axios from "axios";
import { load } from "cheerio";
import config from "../../config.json";

const client = axios.create({
  baseURL: config.oploverz.baseUrl,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT)",
  },
  timeout: 45000, // 45 second timeout
});

const animeNameMap: { [key: string]: string } = {
    'kaijuu-8-gou': 'kaiju-no-8',
};

/**
 * Parses a Samehadaku episode slug into its core components.
 * Now handles numeric and text-based episode identifiers.
 */
const parseSamehadakuSlug = (slug: string) => {
    if (!slug) return null;
    const match = slug.match(/^(.*?)(-season-\d+)?-episode-(.+)$/);

    if (!match) return null;

    return {
        animePart: match[1],
        season: match[2] ? match[2].replace('-season-', '') : null,
        episodeIdentifier: match[3], // Can be "12" or "spesial"
    };
};

/**
 * Transforms the parsed Samehadaku slug components into an Oploverz slug.
 */
const transformToOploverzSlug = (parsedSlug: any): string | null => {
    if (!parsedSlug) return null;

    let { animePart, season, episodeIdentifier } = parsedSlug;

    if (animeNameMap[animePart]) {
        animePart = animeNameMap[animePart];
    }

    const seasonPart = season ? `-s${season}` : '';

    const episodeNumber = parseInt(episodeIdentifier, 10);
    let episodePart: string;

    // Check if the identifier is a number or text
    if (!isNaN(episodeNumber)) {
        // It's a number, apply padding and special One Piece logic
        if (animePart === 'one-piece' && episodeNumber < 1000) {
            return `${animePart}-episode-${String(episodeNumber).padStart(3, '0')}-remastered`;
        }
        episodePart = episodeNumber < 100 ? `-${String(episodeNumber).padStart(2, '0')}` : `-${String(episodeNumber).padStart(3, '0')}`;
    } else {
        // It's text (e.g., "spesial"), use it directly
        episodePart = `-${episodeIdentifier}`;
    }

    return `${animePart}${seasonPart}-episode${episodePart}-subtitle-indonesia`;
};


export const getOploverzEpisodeStream = async (samehadakuSlug: string) => {
  const parsed = parseSamehadakuSlug(samehadakuSlug);
  const oploverzSlug = transformToOploverzSlug(parsed);

  if (!oploverzSlug) {
      console.log(`[Oploverz] Could not parse Samehadaku slug: ${samehadakuSlug}`);
      return null;
  }

  const sourceUrl = new URL(oploverzSlug, config.oploverz.baseUrl).href;
  console.log(`[Oploverz] Scraping for episode streams: ${sourceUrl}`); 

  try {
    const { data } = await client.get(oploverzSlug);
    const $ = load(data);

    const streams: { server: string; embed_url: string | null }[] = [];
    
    $('select.mirror option').each((_, el) => {
        const serverName = $(el).text().trim();
        const base64Iframe = $(el).attr('value');

        if (serverName && base64Iframe) {
            try {
                const decodedIframe = Buffer.from(base64Iframe, 'base64').toString('utf-8');
                const iframe$ = load(decodedIframe);
                const embedUrl = iframe$('iframe').attr('src');
                if (embedUrl) {
                    streams.push({ server: serverName, embed_url: embedUrl });
                }
            } catch (e) {
                // ignore
            }
        }
    });

    const title = $("h1.entry-title").text().trim();

    return {
      title: title || oploverzSlug,
      streams,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`[Oploverz] 404 Not Found for slug: ${oploverzSlug}`);
    } else {
        console.error(`[Oploverz] Failed to scrape ${sourceUrl}:`, error);
    }
    return null;
  }
};
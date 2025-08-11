import axios from "axios";
import { load } from "cheerio";
import config from "../../config.json";

const client = axios.create({
  baseURL: config.oploverz.baseUrl,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT)",
  },
  timeout: 20000, // 20 second timeout
});

/**
 * A dictionary for known anime name variations between Samehadaku and Oploverz.
 * This can be expanded over time.
 * Key: Samehadaku name part, Value: Oploverz name part
 */
const animeNameMap: { [key: string]: string } = {
    'kaijuu-8-gou': 'kaiju-no-8',
    // Add other known variations here
};

/**
 * Parses a Samehadaku slug into its core components in a generic way.
 * @param slug The episode slug from Samehadaku.
 * @returns An object containing the anime part, season number, and episode number.
 */
const parseSamehadakuSlug = (slug: string) => {
    // Regex to capture the main anime title part, optional season, and episode number.
    // It looks for "-episode-" as a primary separator. Using a non-greedy (.*?) match.
    const match = slug.match(/^(.*?)(-season-\d+)?-episode-(\d+)$/);

    if (!match) {
        // Fallback for slugs without "-episode-" (less common, but good to have)
        const fallbackMatch = slug.match(/^(.*)-(\d+)$/);
        if (!fallbackMatch) return null;
        return {
            animePart: fallbackMatch[1],
            season: null,
            episode: fallbackMatch[2],
        };
    }

    return {
        animePart: match[1],
        season: match[2] ? match[2].replace('-season-', '') : null, // a number like '2'
        episode: match[3], // a number like '4'
    };
};

/**
 * Transforms the parsed Samehadaku slug components into an Oploverz slug.
 * @param parsedSlug The parsed components from a Samehadaku slug.
 * @returns A string representing the potential Oploverz slug.
 */
const transformToOploverzSlug = (parsedSlug: any): string | null => {
    if (!parsedSlug) return null;

    let { animePart, season, episode } = parsedSlug;

    // 1. Transform Anime Name
    // Check if the anime name is in our manual map for known complex variations.
    if (animeNameMap[animePart]) {
        animePart = animeNameMap[animePart];
    }
    // Future-proofing: could add more generic string normalization here if needed.

    // 2. Transform Season
    const seasonPart = season ? `-s${season}` : '';

    // 3. Transform Episode Number
    // Oploverz seems to use 2 or 3 digits. We'll pad based on magnitude.
    const episodeNumber = parseInt(episode, 10);
    const episodePart = episodeNumber < 100 ? `-${String(episodeNumber).padStart(2, '0')}` : `-${String(episodeNumber).padStart(3, '0')}`;

    // 4. Construct the final slug
    // Oploverz slugs often end with "-subtitle-indonesia" or "-remastered". 
    // We will try the most common one first.
    // The logic in the route handler can try multiple variations if this one fails.
    const constructedSlug = `${animePart}${seasonPart}-episode${episodePart}-subtitle-indonesia`;

    // Handle special cases like One Piece remastered
    if (animePart === 'one-piece' && episodeNumber < 1000) { // Assuming remastered is for earlier episodes
        return `${animePart}-episode-${String(episodeNumber).padStart(3, '0')}-remastered`;
    }

    return constructedSlug;
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
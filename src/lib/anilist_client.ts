import axios from 'axios';

const ANILIST_API_URL = 'https://graphql.anilist.co';

interface AnilistTitle {
    romaji: string;
    english: string | null;
    native: string;
}

export interface AnilistMedia {
    id: number;
    title: AnilistTitle;
    synonyms: string[];
    season: string | null;
    seasonYear: number | null;
}

/**
 * Searches for an anime on AniList using its title or slug.
 * @param search The search term (title or slug).
 * @returns The AnilistMedia object or null if not found.
 */
export async function searchAnilist(search: string): Promise<AnilistMedia | null> {
    const query = `
        query ($search: String) {
            Media (search: $search, type: ANIME) {
                id
                title {
                    romaji
                    english
                    native
                }
                synonyms
                season
                seasonYear
            }
        }
    `;

    const variables = {
        search: search
    };

    try {
        console.log(`[Anilist] Searching for: "${search}"`);
        const response = await axios.post(ANILIST_API_URL, {
            query: query,
            variables: variables
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            timeout: 10000 // 10-second timeout
        });

        if (response.data.data && response.data.data.Media) {
            console.log(`[Anilist] Found: "${response.data.data.Media.title.romaji}" (ID: ${response.data.data.Media.id})`);
            return response.data.data.Media;
        } else {
            console.warn(`[Anilist] No media found for search term: "${search}"`);
            return null;
        }
    } catch (error) {
        console.error(`[Anilist] API request failed for search term "${search}":`, error);
        return null;
    }
}

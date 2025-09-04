import Fuse from 'fuse.js';
import { getAnimeByGenre } from './samehadaku_scraper';
import { SimpleCache } from './cache';
import { searchAnilist } from './anilist_client';
import { db } from '../db/schema';

// --- Interfaces ---
export interface ResolvedSlugs {
    anilist_slug: string;
    samehadaku_slug: string | null;
    oploverz_slug: string | null; // For future use
}

// --- Caches ---
const samehadakuAnimeListCache = new SimpleCache<any[]>(21600); // 6 hours

// --- Database Functions ---
function getMappingFromDB(anilist_slug: string): ResolvedSlugs | null {
    const result = db.query(
        `SELECT anilist_slug, samehadaku_slug, oploverz_slug FROM slug_mappings WHERE anilist_slug = ?`
    ).get(anilist_slug) as ResolvedSlugs | null;
    return result;
}

function saveMappingToDB(slugs: ResolvedSlugs) {
    db.query(`
        INSERT INTO slug_mappings (anilist_slug, samehadaku_slug, oploverz_slug, updated_at) 
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(anilist_slug) DO UPDATE SET
        samehadaku_slug = excluded.samehadaku_slug,
        oploverz_slug = excluded.oploverz_slug,
        updated_at = CURRENT_TIMESTAMP
    `).run(slugs.anilist_slug, slugs.samehadaku_slug, slugs.oploverz_slug);
}

// --- Indexing Functions ---
async function getSamehadakuAnimeIndex(): Promise<any[]> {
    const cachedList = samehadakuAnimeListCache.get('all_anime_index');
    if (cachedList) return cachedList;

    console.log('[Resolver] Building Samehadaku anime index...');
    const animeList = await getAnimeByGenre('action'); 
    if (animeList && animeList.length > 0) {
        samehadakuAnimeListCache.set('all_anime_index', animeList);
        console.log(`[Resolver] Built Samehadaku index with ${animeList.length} anime.`);
    }
    return animeList || [];
}

// --- Mapping Logic ---
async function mapToSamehadaku(anilistData: any): Promise<string | null> {
    const samehadakuIndex = await getSamehadakuAnimeIndex();
    if (samehadakuIndex.length === 0) {
        console.error('[Resolver] Samehadaku index is empty. Cannot perform search.');
        return null;
    }

    const fuse = new Fuse(samehadakuIndex, {
        keys: ['title'],
        includeScore: true,
        threshold: 0.4,
        ignoreLocation: true,
    });

    const searchTerms = [
        anilistData.title.romaji,
        anilistData.title.english,
        ...anilistData.synonyms
    ].filter(term => term) as string[];

    let bestResult: Fuse.FuseResult<any> | null = null;

    for (const term of searchTerms) {
        const results = fuse.search(term);
        if (results.length > 0) {
            const currentBest = results[0];
            if (!bestResult || (currentBest.score! < bestResult.score!)) {
                bestResult = currentBest;
            }
        }
    }

    if (bestResult && bestResult.score! < 0.5) { // Only accept good matches
        const finalSlug = bestResult.item.animeID.replace(/\/anime\/|\//g, "");
        console.log(`[Resolver] Mapped "${anilistData.title.romaji}" to Samehadaku "${bestResult.item.title}" (Slug: ${finalSlug}, Score: ${bestResult.score})`);
        return finalSlug;
    }

    return null;
}

// --- Main Resolver Function ---
export async function resolveSlugs(anilistSlugOrTitle: string): Promise<ResolvedSlugs | null> {
    const normalizedSlug = anilistSlugOrTitle.toLowerCase();

    // Step 1: Check DB cache first
    const dbCache = getMappingFromDB(normalizedSlug);
    if (dbCache) {
        console.log(`[Resolver DB Cache HIT] Found mapping for "${normalizedSlug}"`);
        return dbCache;
    }

    console.log(`[Resolver] No DB cache. Resolving slugs for Anilist entry: "${normalizedSlug}"`);

    // Step 2: Get canonical data from Anilist
    const anilistData = await searchAnilist(normalizedSlug);
    if (!anilistData) {
        console.error(`[Resolver] Could not find "${normalizedSlug}" on Anilist. Cannot proceed.`);
        return null;
    }

    // Step 3: Map to providers
    const samehadakuSlug = await mapToSamehadaku(anilistData);
    // TODO: Add Oploverz mapping logic here in the future

    const resolvedSlugs: ResolvedSlugs = {
        anilist_slug: normalizedSlug,
        samehadaku_slug: samehadakuSlug,
        oploverz_slug: null, // Placeholder
    };

    // Step 4: Save the new mapping to the database
    if (samehadakuSlug) { // Only save if we found at least one mapping
        saveMappingToDB(resolvedSlugs);
    }

    return resolvedSlugs;
}

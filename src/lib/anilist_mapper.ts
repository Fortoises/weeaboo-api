import axios from 'axios';
import Fuse from 'fuse.js';
import { getAnimeByGenre } from './samehadaku_scraper';
import { SimpleCache } from './cache';

// Cache for resolved slugs. Cache for 1 day.
const slugMappingCache = new SimpleCache<string>(86400);
// Cache for the full anime list from Samehadaku. Cache for 6 hours.
const samehadakuAnimeListCache = new SimpleCache<any[]>(21600);

/**
 * Fetches a comprehensive list of anime from Samehadaku to be used for searching.
 * Caches the result to avoid repeated scraping.
 */
async function getSamehadakuAnimeIndex(): Promise<any[]> {
    const cachedList = samehadakuAnimeListCache.get('all_anime_index');
    if (cachedList) {
        return cachedList;
    }

    console.log('[Resolver] Building Samehadaku anime index...');
    // Fetching from a popular genre to get a large, representative list.
    const animeList = await getAnimeByGenre('action'); 
    if (animeList && animeList.length > 0) {
        samehadakuAnimeListCache.set('all_anime_index', animeList);
        console.log(`[Resolver] Built index with ${animeList.length} anime.`);
    } else {
        console.warn('[Resolver] Failed to build Samehadaku anime index. The source might be unavailable or structure changed.');
    }
    return animeList || [];
}

/**
 * Smartly resolves any given slug (clean or Samehadaku-style) to a definitive Samehadaku anime slug path.
 * @param anySlug The slug to resolve (e.g., 'kaiju-no-8' or 'kaijuu-8-gou-season-2').
 * @returns The corresponding Samehadaku slug path (e.g., '/anime/kaijuu-8-gou-season-2/') or null.
 */
export async function resolveSamehadakuSlug(anySlug: string): Promise<string | null> {
    const normalizedInputSlug = anySlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const cacheKey = `resolved-${normalizedInputSlug}`;
    const cachedSlug = slugMappingCache.get(cacheKey);
    if (cachedSlug) {
        console.log(`[Resolver Cache HIT] Found mapping for "${anySlug}" -> "${cachedSlug}"`);
        return cachedSlug;
    }

    console.log(`[Resolver] Resolving slug for "${anySlug}"...`);
    const animeIndex = await getSamehadakuAnimeIndex();
    if (animeIndex.length === 0) {
        return null;
    }

    // --- Step 1: Try to find a direct match first ---
    // This handles cases where the user provides a valid Samehadaku slug directly.
    for (const anime of animeIndex) {
        // anime.animeID is in the format '/anime/slug-name/'
        const normalizedIndexSlug = anime.animeID.replace(/\/anime\/|\//g, '');
        if (normalizedIndexSlug === normalizedInputSlug) {
            console.log(`[Resolver] Found direct match for "${anySlug}" -> "${anime.animeID}"`);
            slugMappingCache.set(cacheKey, anime.animeID);
            return anime.animeID;
        }
    }

    // --- Step 2: If no direct match, use fuzzy search as a fallback ---
    // This handles clean/Anilist-style slugs.
    console.log(`[Resolver] No direct match found for "${anySlug}". Using fuzzy search...`);
    const fuse = new Fuse(animeIndex, {
        keys: ['title'],
        includeScore: true,
        threshold: 0.4, // Looser threshold is okay here as it's a fallback
    });

    const results = fuse.search(anySlug.replace(/-/g, ' ')); // Search with spaces for better matching

    if (results.length > 0) {
        const bestMatch = results[0].item;
        console.log(`[Resolver] Best fuzzy match for "${anySlug}" is "${bestMatch.title}" with score ${results[0].score}`);
        slugMappingCache.set(cacheKey, bestMatch.animeID);
        return bestMatch.animeID; // animeID from scraper is the slug path
    }

    console.warn(`[Resolver] Could not resolve slug "${anySlug}" by any method.`);
    return null;
}

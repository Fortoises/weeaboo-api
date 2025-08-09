
import { Elysia, t } from "elysia";
import Fuse from 'fuse.js';
import { getAnimeByGenre } from "../lib/scraper";

export const searchRoutes = new Elysia({ prefix: "/search" })
  .get("/", async ({ query }) => {
    const q = query.q;
    if (!q) {
        return [];
    }

    const animeList = await getAnimeByGenre('action'); 

    const fuse = new Fuse(animeList, {
        keys: ['title'],
        includeScore: true,
        threshold: 0.4, // Bisa di ubah sesuai dengan keinginan
    });

    return fuse.search(q).map(result => result.item);

  }, {
      query: t.Object({
          q: t.String()
      }),
      detail: {
          summary: "Search anime",
          tags: ["Search"]
      }
  });

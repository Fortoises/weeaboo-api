import { Elysia, t } from "elysia";
import { getAnimeByGenre } from "../lib/samehadaku_scraper";

const animeInfoSchema = t.Object({
  title: t.String(),
  animeID: t.String(),
  thumbnail: t.Union([t.String(), t.Null()]),
  rating: t.Union([t.String(), t.Null()]),
});

export const genreRoutes = new Elysia({ prefix: "/anime/genre" }).get(
  "/:slug",
  ({ params }) => getAnimeByGenre(params.slug),
  {
    params: t.Object({
      slug: t.String(),
    }),
    detail: {
      summary: "Mencari anime berdasarkan genre",
      tags: ["Genre"],
    },
    response: {
      200: t.Array(animeInfoSchema),
    },
  }
);

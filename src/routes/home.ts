import { Elysia, t } from "elysia";
import { getLatestUpdate } from "../lib/samehadaku_scraper";

const animeInfoSchema = t.Object({
  title: t.String(),
  animeID: t.String(),
  thumbnail: t.Union([t.String(), t.Null()]),
  rating: t.Union([t.String(), t.Null()]),
});

export const homeRoutes = new Elysia({ prefix: "/home" }).get(
  "/",
  () => getLatestUpdate(),
  {
    detail: {
      summary: "Mendapatkan Anime Terbaru",
      tags: ["Home"],
    },
    response: {
      200: t.Array(animeInfoSchema),
    },
  }
);

import { Elysia, t } from "elysia";
import { db } from "../db/schema";

const homeAnimeSchema = t.Object({
  title: t.String(),
  cover: t.Union([t.String(), t.Null()]),
  rating: t.Union([t.String(), t.Null()]),
  videoID: t.String(),
});

export const homeRoutes = new Elysia({ prefix: "/home" }).get(
  "/",
  () => {
    const query = db.query(
      "SELECT title, thumbnail as cover, rating, slug as videoID FROM home_anime ORDER BY updated_at DESC LIMIT 20"
    );
    return query.all();
  },
  {
    detail: {
      summary: "Mendapatkan Anime Terbaru dari Database",
      tags: ["Home"],
    },
    response: {
      200: t.Array(homeAnimeSchema),
    },
  }
);

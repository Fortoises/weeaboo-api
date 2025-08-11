import { Elysia, t } from "elysia";
import { db } from "../db/schema";

const top10AnimeSchema = t.Object({
  title: t.String(),
  cover: t.Union([t.String(), t.Null()]),
  rating: t.Union([t.String(), t.Null()]),
  slug: t.String(),
});

export const top10Routes = new Elysia({ prefix: "/top10" }).get(
  "/",
  () => {
    const query = db.query(
      "SELECT title, cover, rating, slug FROM top10_anime"
    );
    return query.all();
  },
  {
    detail: {
      summary: "Top 10 anime minggu ini dari Database",
      tags: ["Top 10"],
    },
    response: {
      200: t.Array(top10AnimeSchema),
    },
  }
);

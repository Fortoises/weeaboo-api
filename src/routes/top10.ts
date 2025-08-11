import { Elysia, t } from "elysia";
import { getTop10Anime } from "../lib/samehadaku_scraper";

export const top10Routes = new Elysia({ prefix: "/top10" })
  .get("/", async () => {
    return getTop10Anime();
  }, {
      detail: {
          summary: "Top 10 anime minggu ini",
          tags: ["Top 10"]
      }
  });
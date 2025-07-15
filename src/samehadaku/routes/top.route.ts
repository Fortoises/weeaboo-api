import { getTop10AnimeWeek } from "../scraper";

export default async function topHandler(req: any, url: any) {
  try {
    const data = await getTop10AnimeWeek();
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
} 
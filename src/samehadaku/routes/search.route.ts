/* eslint-disable */
import { searchAnime } from "../scraper";

export default async function searchHandler(req: any, url: any) {
  const q = url.searchParams.get("q");
  if (!q) {
    // @ts-ignore
    return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const data = await searchAnime(q);
    // @ts-ignore
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // @ts-ignore
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
} 
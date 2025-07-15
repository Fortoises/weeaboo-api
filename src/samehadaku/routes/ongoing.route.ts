/* eslint-disable */
import { getLatestUpdate } from "../scraper";

export default async function ongoingHandler(req: any, url: any) {
  try {
    const data = await getLatestUpdate();
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
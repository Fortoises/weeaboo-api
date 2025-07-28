import { serve } from "bun";
import { router } from "./routes";
import { startScraperScheduler, scrapeAllAnime, scrapeAllGenre } from "./scraper";
import { adminRouter } from "./admin";

// Jalankan scraping untuk pertama kali
console.log("[STARTUP] ========================================");
console.log("[STARTUP] MEMULAI SCRAPING PERTAMA KALI");
console.log("[STARTUP] ========================================");

console.log("[STARTUP] 🎌 Memulai scraping anime list...");
scrapeAllAnime().catch((e) => console.error("[STARTUP] Error anime scraping:", e));

console.log("[STARTUP] 🎭 Genre scraping sekarang real-time, tidak perlu startup scraping");

startScraperScheduler();

serve({
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Handle admin routes
    if (url.pathname.startsWith("/admin")) {
      const adminResponse = await adminRouter(req);
      if (adminResponse) {
        return adminResponse;
      }
      // Jika tidak ada route admin yang cocok, return 404
      return new Response("Admin endpoint not found", { status: 404 });
    }
    
    // Handle regular routes
    return router(req);
  },
  port: Bun.env.PORT ? Number(Bun.env.PORT) : 3000,
});

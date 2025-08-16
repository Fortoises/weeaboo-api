import {
  Elysia,
} from "elysia";
import {
  swagger,
} from "@elysiajs/swagger";
import { config } from "dotenv";
import { cors } from "@elysiajs/cors";

// Load environment variables
config();

import { animeRoutes } from "./routes/anime";
import { homeRoutes } from "./routes/home";
import { genreRoutes } from "./routes/genre";
import { adminRoutes } from "./routes/admin";
import { searchRoutes } from "./routes/search";
import { top10Routes } from "./routes/top10";
import { streamRoutes } from "./routes/stream";

const app = new Elysia()
  .use(cors())
  // --- Hooks ---
  .onBeforeHandle(({ request, set }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/docs')) {
      return;
    }

    // Allow disabling API key check for development
    const apiKeyEnabled = process.env.ENABLE_API_KEY !== 'false';

    if (apiKeyEnabled) {
        const apiKey = request.headers.get("x-api-key");
        if (apiKey !== process.env.API_KEY) {
            set.status = 401;
            return { message: "Unauthorized: Invalid or missing API Key" };
        }
    }
  })
  // --- Plugins ---
  .use(
    swagger({
      path: '/docs',
      documentation: {
        info: {
          title: 'Weeaboo API',
          version: '1.2.1',
          description: 'API Scrapper anime dari website SAMEHADAKU. Cocok untuk diimplementasikan ke aplikasi streaming atau sejenisnya\n\n[Kode Sumber di GitHub](https://github.com/Fortoises/weeaboo-api)',
        },
        components: {
          securitySchemes: {
            ApiKeyAuth: {
              type: 'apiKey',
              name: 'X-API-KEY',
              in: 'header',
              description: 'Enter your API key to access the API'
            }
          }
        },
        security: [
          {
            ApiKeyAuth: []
          }
        ]
      },
      theme: {
        head: {
          meta: [
            {
              name: 'viewport',
              content: 'width=device-width, initial-scale=1.0'
            }
          ]
        }
      }
    })
  )
  // --- Public Routes ---
  .get("/", ({ redirect }) => redirect("/docs"))

  // --- API Routes ---
  .use(animeRoutes)
  .use(homeRoutes)
  .use(genreRoutes)
  .use(adminRoutes)
  .use(searchRoutes)
  .use(top10Routes)
  .use(streamRoutes)
  .listen({ port: 3000, idleTimeout: 30 });

console.log(
  `Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app;
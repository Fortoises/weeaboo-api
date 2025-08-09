import { Elysia, t } from "elysia";
import { db } from "../db/schema";
import { scheduleBackup } from "../lib/backup";

// --- Schemas ---
const errorResponse = t.Object({ message: t.String() });
const successResponse = t.Object({ message: t.String() });

const episodeSchema = t.Object({
    episode_slug: t.String({ minLength: 1, description: "Unique slug for the episode, e.g., anime-slug-episode-1" }),
    episode_title: t.String({ minLength: 1 }),
});

const animeBodySchema = t.Object({
    slug: t.String({ minLength: 1, description: 'Unique identifier for the anime URL.' }),
    title: t.String({ minLength: 1 }),
    thumbnail: t.String({ format: 'uri' }),
    synopsis: t.String(),
    rating: t.String(),
    status: t.String(),
    type: t.String(),
    source: t.String(),
    season: t.String(),
    studio: t.String(),
    producers: t.String(),
    genres: t.Array(t.String()),
    streamingEpisodes: t.Array(episodeSchema)
});

const embedSchema = t.Object({
    id: t.Number(),
    server_name: t.String(),
    url: t.String(),
});

// --- Main Admin Routes ---
export const adminRoutes = new Elysia({ prefix: "/admin" })
  .group('', { detail: { tags: ['Admin Management'], security: [{ BearerAuth: [] }] } }, (app) => app
    .onBeforeHandle(({ set, headers }) => {
        const authHeader = headers.authorization;
        const adminToken = process.env.ADMIN_TOKEN;

        if (!adminToken) {
            set.status = 500;
            return { message: "ADMIN_TOKEN is not set on the server." };
        }

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            set.status = 401;
            return { message: "Unauthorized: Missing Bearer token." };
        }

        const token = authHeader.split(" ")[1];

        if (token !== adminToken) {
            set.status = 403;
            return { message: "Forbidden: Invalid token." };
        }
    })
    .get("/test", () => {
        return { message: "Admin access successful!" };
    }, { detail: { summary: 'Test Admin' } })
    .post("/anime", ({ body, set }) => {
        const { streamingEpisodes, ...animeDetails } = body;
        const insertAnime = db.transaction(anime => {
            const { genres, streamingEpisodes, ...rest } = anime;
            const stmt = db.prepare(`INSERT INTO animes (slug, title, thumbnail, synopsis, rating, status, type, source, season, studio, producers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run(rest.slug, rest.title, rest.thumbnail, rest.synopsis, rest.rating, rest.status, rest.type, rest.source, rest.season, rest.studio, rest.producers);
            for (const episode of streamingEpisodes) {
                db.query(`INSERT INTO episodes (anime_slug, episode_slug, episode_title) VALUES (?, ?, ?)`).run(anime.slug, episode.episode_slug, episode.episode_title);
            }
        });
        try {
            insertAnime(body);
            scheduleBackup();
            set.status = 201;
            return { message: "Anime and its episodes added successfully." };
        } catch (e) {
            set.status = 500;
            return { message: "Failed to add anime." };
        }
    }, { body: animeBodySchema, response: { 201: successResponse, 500: errorResponse }, detail: { summary: 'Add a New Anime Manually' } })
    
    // --- Embed Management ---
    .get("/episode/:episode_slug/embeds", ({ params }) => {
        const { episode_slug } = params;
        return db.query(`SELECT id, server_name, url FROM embeds WHERE episode_slug = ?`).all(episode_slug);
    }, {
        response: { 200: t.Array(embedSchema) },
        detail: { summary: 'Mendapatkan link embeds' }
    })
    .post("/episode/:episode_slug/embeds", ({ params, body, set }) => {
        const { episode_slug } = params;
        const { server_name, url } = body;
        try {
            db.query(`INSERT INTO embeds (episode_slug, server_name, url) VALUES (?, ?, ?)`).run(episode_slug, server_name, url);
            scheduleBackup();
            set.status = 201;
            return { message: "Embed link added successfully." };
        } catch (error) {
            set.status = 500;
            return { message: "Failed to add embed link." };
        }
    }, {
        body: t.Object({ server_name: t.String({ minLength: 1 }), url: t.String({ format: 'uri' }) }),
        response: { 201: successResponse, 500: errorResponse },
        detail: { summary: 'Menambahkan link embed ke episode tertentu' }
    })
    .put("/embeds/:embed_id", ({ params, body, set }) => {
        const { embed_id } = params;
        const updates: string[] = [];
        const values: (string | number)[] = [];

        if (body.server_name) {
            updates.push("server_name = ?");
            values.push(body.server_name);
        }
        if (body.url) {
            updates.push("url = ?");
            values.push(body.url);
        }

        if (updates.length === 0) {
            set.status = 400;
            return { message: "Request body must contain at least 'server_name' or 'url'." };
        }

        values.push(embed_id);

        try {
            const query = `UPDATE embeds SET ${updates.join(", ")} WHERE id = ?`;
            db.query(query).run(...values);
            scheduleBackup();
            return { message: `Embed with ID ${embed_id} updated successfully.` };
        } catch (error) {
            set.status = 500;
            return { message: "Failed to update embed link." };
        }
    }, {
        body: t.Object({
            server_name: t.Optional(t.String({ minLength: 1 })),
            url: t.Optional(t.String({ format: 'uri' })),
        }),
        response: { 200: successResponse, 400: errorResponse, 500: errorResponse },
        detail: { summary: 'Update link embed berdasarkan ID' }
    })
    .delete("/embeds/:embed_id", ({ params, set }) => {
        const { embed_id } = params;
        try {
            db.query(`DELETE FROM embeds WHERE id = ?`).run(embed_id);
            scheduleBackup();
            return { message: `Embed with ID ${embed_id} deleted successfully.` };
        } catch (error) {
            set.status = 500;
            return { message: "Failed to delete embed link." };
        }
    }, {
        response: { 200: successResponse, 500: errorResponse },
        detail: { summary: 'Delete an Existing Embed by ID' }
    })
  );
import { Database } from "bun:sqlite";

export const db = new Database("weeaboo.sqlite");

const schema = `
    CREATE TABLE IF NOT EXISTS animes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT,
      thumbnail TEXT,
      synopsis TEXT,
      rating TEXT,
      status TEXT,
      type TEXT,
      source TEXT,
      season TEXT,
      studio TEXT,
      producers TEXT
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_slug TEXT NOT NULL,
      episode_slug TEXT UNIQUE NOT NULL,
      episode_title TEXT NOT NULL,
      FOREIGN KEY (anime_slug) REFERENCES animes(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_slug TEXT NOT NULL,
      server_name TEXT NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (episode_slug) REFERENCES episodes(episode_slug) ON DELETE CASCADE
    );
`;


db.exec(schema);

console.log("Database schema verified.");

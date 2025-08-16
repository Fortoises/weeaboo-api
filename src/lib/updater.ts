import cron from 'node-cron';
import { db } from '../db/schema';
import { getHomeAnime, getTop10Anime } from './samehadaku_scraper';
import { scheduleBackup } from './backup';

const updateHomeAnime = async () => {
  console.log('Starting home anime update...');

  const homeAnime = await getHomeAnime();

  if (!homeAnime || homeAnime.length === 0) {
    console.log('No new anime found.');
    return;
  }

  const upsertStmt = db.prepare(
    'INSERT INTO home_anime (slug, title, thumbnail, synopsis, rating, status, type, source, season, studio, producers, latest_episode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET updated_at = CURRENT_TIMESTAMP, latest_episode = excluded.latest_episode'
  );

  for (const anime of homeAnime) {
    if (anime) {
        upsertStmt.run(
            anime.slug,
            anime.title,
            anime.thumbnail,
            anime.synopsis,
            anime.rating,
            anime.status,
            anime.type,
            anime.source,
            anime.season,
            anime.studio,
            anime.producers,
            anime.latest_episode
        );
    }
  }

  console.log('Upserted', homeAnime.length, 'anime.');

  console.log('Home anime update finished.');
  scheduleBackup();
};

// Schedule the task to run every hour
cron.schedule('0 * * * *', () => {
  console.log('Running scheduled home anime update...');
  updateHomeAnime();
});

console.log('Cron job for home anime update scheduled to run every hour.');

// Initial run
updateHomeAnime();

const updateTop10Anime = async () => {
  console.log('Starting top 10 anime update...');

  const top10Anime = await getTop10Anime();

  if (!top10Anime || top10Anime.length === 0) {
    console.log('No top 10 anime found.');
    return;
  }

  db.exec('DELETE FROM top10_anime');
  const insertStmt = db.prepare(
    'INSERT INTO top10_anime (slug, title, cover, rating) VALUES (?, ?, ?, ?)'
  );

  for (const anime of top10Anime) {
    if (anime) {
        insertStmt.run(
            anime.videoID.replace('/anime/', '').replace('/', ''),
            anime.title,
            anime.cover,
            anime.rating
        );
    }
  }

  console.log('Inserted', top10Anime.length, 'top 10 anime.');

  console.log('Top 10 anime update finished.');
  scheduleBackup();
};

// Schedule the task to run every Monday at 3 PM
cron.schedule('0 15 * * 1', () => {
  console.log('Running scheduled top 10 anime update...');
  updateTop10Anime();
});

console.log('Cron job for top 10 anime update scheduled to run every Monday at 3 PM.');

// Initial run
updateTop10Anime();

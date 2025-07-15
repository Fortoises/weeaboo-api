import axios from "axios";
import { load } from "cheerio";
import { getAnimeDetail, getAnimeID, getAnimeSummary } from "../information";

export type ServerResource = {
  post: string;
  nume: string;
  type: string;
  name: string;
};

const client = axios.create({
  baseURL: "https://samehadaku.now/",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT)",
  },
});

export const getTopAnime = () =>
  client.get("/").then(({ data }) => {
    const $ = load(data);

    const list = $(".topten-animesu a");

    return Promise.all(
      list.map((_, el) => {
        const animeID = new URL($(el).attr("href")!).pathname;
        const title = $($(el).find(".judul")[0]).text().trim();

        return getAnimeSummary(title)
          .then((data) => ({
            data,
            animeID,
          }))
          .catch(() => undefined);
      })
    ).then((data) =>
      data
        .filter((el) => el)
        .map((item) => ({
          ...(item!.data as Awaited<ReturnType<typeof getAnimeSummary>>),
          animeID: item!.animeID,
        }))
    );
  });

export const getLatestUpdate = () =>
  client.get("/").then(({ data }) => {
    const $ = load(data);

    const list = $(".widget_senction .post-show .entry-title a");

    return Promise.all(
      list.map((_, el) => {
        const title = $(el).text().trim();
        const animeID = new URL($(el).attr("href")!).pathname;

        return getAnimeSummary(title)
          .then((data) => ({
            data,
            animeID,
          }))
          .catch(() => undefined);
      })
    ).then((data) =>
      data
        .filter((el) => el)
        .map((item) => ({
          ...(item!.data as Awaited<ReturnType<typeof getAnimeSummary>>),
          animeID: item!.animeID,
        }))
    );
  });

export const getTopByCategory = (...category: string[]) =>
  client
    .get("/daftar-anime-2", {
      params: {
        order: "popular",
        genre: category,
      },
    })
    .then(({ data }) => {
      const $ = load(data);

      const list = $("article .animepost a");

      return Promise.all(
        list.map((_, el) => {
          const title = $($(el).find(".title")[0]).text().trim();
          const animeID = new URL($(el).attr("href")!).pathname;

          return getAnimeSummary(title)
            .then((data) => ({
              data,
              animeID,
            }))
            .catch(() => undefined);
        })
      ).then((data) =>
        data
          .filter((el) => el)
          .map((item) => ({
            ...(item!.data as Awaited<ReturnType<typeof getAnimeSummary>>),
            animeID: item!.animeID,
          }))
      );
    });

export const getAnime = async (id: string) => {
  const page = await client.get(`/anime/${id}`).then(({ data }) => {
    const $ = load(data);

    const title = $(".infoanime .entry-title")
      .text()
      .trim()
      .replace("Nonton Anime ", "");
    const episodes: string[] = [];

    for (const episode of $(".epsleft a")) {
      episodes.push($(episode).attr("href")!);
    }

    return { title, episodes: [...episodes.reverse()] };
  });

  const detail = await getAnimeID(page.title).then((id) => getAnimeDetail(id));
  const streamingEpisodes: {
    title: string;
    thumbnail: string | null;
    videoID: string;
  }[] =
    detail.streamingEpisodes.length < page.episodes.length
      ? page.episodes
          .map((item, index) => ({
            title: `Episode ${index + 1}`,
            thumbnail: null,
            videoID: new URL(item).pathname,
          }))
          .reverse()
      : detail.streamingEpisodes
          .reverse()
          .filter((_, index) => page.episodes[index])
          .map((item, index) => {
            return {
              ...item,
              videoID: new URL(page.episodes[index]!).pathname,
            };
          })
          .reverse();

  return {
    ...detail,
    movieID:
      detail.streamingEpisodes.length > 1
        ? undefined
        : new URL(page.episodes[0]!).pathname,
    streamingEpisodes,
  };
};

export const searchAnime = (keyword: string) =>
  client
    .get("/", {
      params: {
        s: keyword,
      },
    })
    .then(({ data }) => {
      const $ = load(data);

      const list = $("article .animepost a");

      return Promise.all(
        list.map((_, el) => {
          const title = $($(el).find(".title")[0]).text().trim();
          const animeID = new URL($(el).attr("href")!).pathname;

          return getAnimeSummary(title)
            .then((data) => ({
              data,
              animeID,
            }))
            .catch(() => undefined);
        })
      ).then((data) =>
        data
          .filter((el) => el)
          .map((item) => ({
            ...(item!.data as Awaited<ReturnType<typeof getAnimeSummary>>),
            animeID: item!.animeID,
          }))
      );
    });

export const getServerList = async (videoID: string) =>
  client.get(videoID).then(({ data }) => {
    const $ = load(data);

    const resources: ServerResource[] = [];

    for (const resource of $("#server ul li div")) {
      const current = $(resource);

      resources.push({
        post: current.attr("data-post")!,
        name: current.text().trim(),
        nume: current.attr("data-nume")!,
        type: current.attr("data-type")!,
      });
    }

    return resources;
  });

export const getStreamResource = ({ name: _, ...resource }: ServerResource) => {
  const form = new FormData();

  form.append("action", "player_ajax");

  for (const key of Object.keys(resource)) {
    form.append(key, resource[key as keyof typeof resource]);
  }

  return client.post("wp-admin/admin-ajax.php", form).then(({ data }) => {
    const $ = load(data);

    return $("iframe").attr("src")!;
  });
};

export const getAnimeSummary = async (title: string) => {
  console.log(`Getting summary for ${title}`);
  return {
    title,
    thumbnail: "https://via.placeholder.com/150",
  };
};

export const getAnimeID = async (title: string) => {
  console.log(`Getting ID for ${title}`);
  return "12345";
};

export const getAnimeDetail = async (id: string) => {
  console.log(`Getting detail for ${id}`);
  return {
    title: "Anime Title",
    streamingEpisodes: [],
  };
};

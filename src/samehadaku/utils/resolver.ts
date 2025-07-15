// Resolver untuk memilih embed video terbaik (resolusi/validitas)
// Pilih server dengan prioritas tertentu dan validasi src

export type EmbedServer = {
  name: string;
  src: string;
  type?: string;
};

const PRIORITY = [
  "Blogger",
  "Filedon",
  "Pixeldrain",
  // Tambahkan prioritas lain jika perlu
];

export function pickBestEmbed(servers: EmbedServer[]): EmbedServer | undefined {
  // Filter server yang src-nya valid
  const valid = servers.filter((s) => s.src && typeof s.src === "string");
  // Urutkan berdasarkan prioritas
  valid.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.name);
    const pb = PRIORITY.indexOf(b.name);
    if (pa === -1 && pb === -1) return 0;
    if (pa === -1) return 1;
    if (pb === -1) return -1;
    return pa - pb;
  });
  return valid[0];
} 
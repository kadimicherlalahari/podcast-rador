export type SpotifyCandidate = { id: string; name: string; publisher: string; totalEpisodes: number };

export const spotifyEnabled = () => process.env.SPOTIFY_ENABLED === "true";

async function appToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token ${res.status}`);
  return (await res.json()).access_token;
}

// Client-credentials is enough for search. Returns [] when Spotify is disabled.
export async function searchShows(name: string, limit = 5): Promise<SpotifyCandidate[]> {
  if (!spotifyEnabled()) return [];
  const token = await appToken();
  const res = await fetch(
    `https://api.spotify.com/v1/search?${new URLSearchParams({ q: name, type: "show", limit: String(limit) })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Spotify search ${res.status}`);
  const data = await res.json();
  return (data.shows?.items ?? []).filter(Boolean).map(
    (s: { id: string; name: string; publisher: string; total_episodes: number }) => ({
      id: s.id,
      name: s.name,
      publisher: s.publisher,
      totalEpisodes: s.total_episodes,
    }),
  );
}

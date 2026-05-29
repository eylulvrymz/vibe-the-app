const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ||
  (window.location.origin + window.location.pathname).replace(/\/+$/, "");
const SCOPES = [
  "user-read-private",
  "user-read-email",
].join(" ");
const VERIFIER_KEY = "spotify_pkce_verifier";

function toBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function buildPkce() {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(hash) };
}

export async function initiateSpotifyLogin() {
  if (!CLIENT_ID) {
    throw new Error(
      "Spotify Client ID is not set. Add VITE_SPOTIFY_CLIENT_ID to apps/frontend/.env"
    );
  }
  const { verifier, challenge } = await buildPkce();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeSpotifyCode(code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("PKCE verifier not found — please restart the login flow");
  sessionStorage.removeItem(VERIFIER_KEY);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error_description || "Failed to obtain Spotify token");
  }
  const data = await response.json();
  console.log("[Spotify] token exchange response:", data);
  if (!data.access_token) throw new Error(`Token error: ${data.error || JSON.stringify(data)}`);
  return data.access_token;
}

export async function getSpotifyProfile(accessToken) {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[Spotify] /v1/me raw response:", response.status, response.headers.get("content-type"), text);
    throw new Error(`Failed to fetch Spotify profile (${response.status}): ${text || "(empty)"}`);
  }
  return response.json();
}

function loadSdk() {
  return new Promise((resolve) => {
    if (window.Spotify) { resolve(); return; }
    if (!document.getElementById("spotify-sdk")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.head.appendChild(script);
    }
    window.onSpotifyWebPlaybackSDKReady = resolve;
  });
}

export async function createPlayer(accessToken) {
  await loadSdk();
  return new Promise((resolve, reject) => {
    const player = new window.Spotify.Player({
      name: "Vibe",
      getOAuthToken: (cb) => cb(accessToken),
      volume: 0.6,
    });
    const timer = setTimeout(() => reject(new Error("Connection timed out")), 10000);
    const done = (result) => { clearTimeout(timer); result instanceof Error ? reject(result) : resolve(result); };
    player.addListener("ready", ({ device_id }) => done({ player, deviceId: device_id }));
    player.addListener("not_ready", () => done(new Error("Player not ready")));
    player.addListener("initialization_error", ({ message }) => done(new Error(message)));
    player.addListener("authentication_error", ({ message }) => done(new Error(message)));
    player.addListener("account_error", () => done(new Error("Spotify Premium required")));
    player.connect();
  });
}

export async function playTrack(accessToken, deviceId, spotifyTrackId) {
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [`spotify:track:${spotifyTrackId}`] }),
  });
  if (!res.ok && res.status !== 204) throw new Error("Failed to start playback");
}

export async function searchSpotifyTracks(accessToken, query) {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query, type: "track", limit: 8 });
  const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.tracks?.items || []).map((item) => ({
    spotifyId: item.id,
    title: item.name,
    artist: item.artists.map((a) => a.name).join(", "),
    album: item.album.name,
    genre: "Spotify",
    coverUrl: item.album.images[1]?.url || item.album.images[0]?.url || "",
    previewUrl: item.preview_url || null,
  }));
}

import { demoUserPassword, follows, seedLikes, seedPosts, tracks, users } from "./mockData.js";

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? "http://localhost:8080/api" : "");
const STORAGE_KEY = "vibe-local-state";

// Local "demo" fallback is ONLY for deployments with no backend configured.
// When a real backend IS configured, never silently fall back to offline mode —
// surface the real error instead. Falling back would create a mixed state where
// auth is local (with a local user id) while reads hit the backend (returning a
// DIFFERENT user that happens to share that id). That is the root cause of
// "my new account shows someone else's profile".
const OFFLINE_FALLBACK = !API_BASE;

function normalizeLocalState(state) {
  const credentials = { ...(state.credentials || {}) };
  for (const user of users) {
    credentials[user.username.toLowerCase()] = credentials[user.username.toLowerCase()] || demoUserPassword;
  }

  return {
    users: state.users || [...users],
    tracks: state.tracks || [...tracks],
    follows: state.follows || [...follows],
    posts: (state.posts || seedPosts).map((post) => {
      const { likedByMe, likeCount, ...cleanPost } = post;
      return cleanPost;
    }),
    likes: state.likes || [...seedLikes],
    credentials,
  };
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return normalizeLocalState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return normalizeLocalState({
    users: [...users],
    tracks: [...tracks],
    follows: [...follows],
    posts: seedPosts.map((post) => ({ ...post })),
    likes: [...seedLikes],
    credentials: Object.fromEntries(users.map((user) => [user.username.toLowerCase(), demoUserPassword])),
  });
}

function saveLocalState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLocalState(state)));
}

async function request(path, { method = "GET", body, token } = {}) {
  if (!API_BASE) {
    throw new Error("API is not configured for this deployment");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function localTokenFor(user) {
  return `local-${user.id}-${user.username}`;
}

function userFromToken(token, state) {
  if (!token || !token.startsWith("local-")) {
    return state.users[0];
  }
  const id = Number(token.split("-")[1]);
  return state.users.find((user) => user.id === id) || state.users[0];
}

function decoratedPost(post, currentUser, state) {
  const postId = Number(post.id);
  const currentUserId = currentUser?.id || 0;
  return {
    ...post,
    likeCount: state.likes.filter(([, likedPostId]) => Number(likedPostId) === postId).length,
    likedByMe: state.likes.some(
      ([likerId, likedPostId]) => Number(likerId) === currentUserId && Number(likedPostId) === postId
    ),
  };
}

function decoratedPosts(posts, currentUser, state) {
  return posts.map((post) => decoratedPost(post, currentUser, state));
}

function profilePayload(state, currentUser, userId) {
  const user = state.users.find((item) => item.id === Number(userId)) || state.users[0];
  const followerUsers = state.follows
    .filter(([, followingId]) => followingId === user.id)
    .map(([followerId]) => state.users.find((item) => item.id === followerId))
    .filter(Boolean);
  const followingUsers = state.follows
    .filter(([followerId]) => followerId === user.id)
    .map(([, followingId]) => state.users.find((item) => item.id === followingId))
    .filter(Boolean);
  const posts = decoratedPosts(
    state.posts.filter((post) => post.user.id === user.id),
    currentUser,
    state
  );

  return {
    ...user,
    followers: followerUsers.length,
    following: followingUsers.length,
    followerUsers,
    followingUsers,
    postCount: posts.length,
    posts,
    isFollowing: state.follows.some(([from, to]) => from === currentUser.id && to === user.id),
  };
}

export async function login(username, password) {
  try {
    return await request("/auth/login", { method: "POST", body: { username, password } });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const user = state.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      throw new Error("Invalid username or password");
    }
    const normalizedUsername = user.username.toLowerCase();
    const storedPassword = state.credentials[normalizedUsername];
    if (storedPassword && password !== storedPassword) {
      throw new Error("Invalid username or password");
    }
    if (!storedPassword) {
      state.credentials[normalizedUsername] = password;
      saveLocalState(state);
    }
    return { user, token: localTokenFor(user), offline: true };
  }
}

export async function connectSpotify(spotifyId, displayName, username) {
  try {
    return await request("/auth/spotify/connect", {
      method: "POST",
      body: { spotifyId, displayName, username },
    });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    let user = state.users.find((u) => u.spotifyId === spotifyId);
    if (!user) {
      const base = (username || displayName || "user")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 20) || "user";
      let name = base;
      let n = 1;
      while (state.users.some((u) => u.username.toLowerCase() === name)) {
        name = base + n++;
      }
      user = {
        id: Math.max(0, ...state.users.map((u) => u.id)) + 1,
        username: name,
        displayName: displayName || username || "Spotify User",
        spotifyId,
        avatarKey: "spark",
        bio: "Spotify üzerinden katıldı.",
        favoriteGenres: [],
      };
      state.users.push(user);
      state.credentials[name] = "";
      saveLocalState(state);
    }
    return { user, token: localTokenFor(user), offline: true };
  }
}

export async function register(displayName, username, password, genres, photoUrl) {
  try {
    return await request("/auth/register", {
      method: "POST",
      body: { displayName, username, password, genres, ...(photoUrl ? { photoUrl } : {}) },
    });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username is already taken");
    }
    const user = {
      id: Math.max(...state.users.map((item) => item.id)) + 1,
      username,
      displayName,
      avatarKey: "spark",
      bio: "Fresh ears, fresh playlists, new favorite chorus loading.",
      favoriteGenres: genres.split(",").map((genre) => genre.trim()).filter(Boolean),
      photoUrl: photoUrl || "",
    };
    state.users.push(user);
    state.credentials[username.toLowerCase()] = password;
    saveLocalState(state);
    return { user, token: localTokenFor(user), offline: true };
  }
}

export async function updateProfile(token, updates, currentUser) {
  // Always persist to local state first so changes survive regardless of backend
  const state = loadLocalState();
  const current = currentUser
    ? (state.users.find((u) => u.id === currentUser.id) || currentUser)
    : userFromToken(token, state);
  let idx = state.users.findIndex((u) => u.id === current.id);
  if (idx < 0 && currentUser) {
    // User missing from local state — add them so future saves work
    state.users.push({ ...currentUser });
    idx = state.users.length - 1;
  }
  if (idx >= 0) {
    const oldUsername = state.users[idx].username || "";
    state.users[idx] = { ...state.users[idx], ...updates };
    state.posts = state.posts.map((p) =>
      p.user && p.user.id === current.id ? { ...p, user: { ...p.user, ...updates } } : p
    );
    if (updates.username && updates.username.toLowerCase() !== oldUsername.toLowerCase()) {
      const oldKey = oldUsername.toLowerCase();
      const newKey = updates.username.toLowerCase();
      if (state.credentials[oldKey] !== undefined) {
        state.credentials[newKey] = state.credentials[oldKey];
        delete state.credentials[oldKey];
      } else {
        state.credentials[newKey] = state.credentials[newKey] ?? "";
      }
    }
    saveLocalState(state);
  }
  // Then attempt backend (no-op in offline/GitHub Pages mode)
  try {
    return await request("/users/me", { method: "PATCH", token, body: updates });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    return { user: idx >= 0 ? state.users[idx] : current, offline: true };
  }
}

export async function getPost(token, postId) {
  try {
    return await request(`/posts/${postId}`, { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = userFromToken(token, state);
    const post = state.posts.find((p) => p.id === Number(postId));
    return { post: post ? decoratedPost(post, current, state) : null };
  }
}

export async function getFeed(token) {
  try {
    return await request("/feed", { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = userFromToken(token, state);
    return { posts: decoratedPosts(state.posts, current, state) };
  }
}

export async function getTrending(token) {
  try {
    return await request("/trending", { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = userFromToken(token, state);
    const posts = decoratedPosts(state.posts, current, state).sort((left, right) => right.likeCount - left.likeCount);
    return { posts };
  }
}

export async function getTracks() {
  try {
    return await request("/tracks");
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    return { tracks: loadLocalState().tracks };
  }
}

export async function createPost(token, payload, currentUser) {
  try {
    return await request("/posts", { method: "POST", token, body: payload });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    // prefer the explicitly passed user (avoids token-fallback to wrong mock user)
    const user = currentUser
      ? (state.users.find((u) => u.id === currentUser.id) || currentUser)
      : userFromToken(token, state);
    let track;
    if (payload.spotifyTrackId) {
      track = state.tracks.find((t) => t.spotifyId === payload.spotifyTrackId);
      if (!track) {
        track = {
          id: Math.max(0, ...state.tracks.map((t) => t.id)) + 1,
          spotifyId: payload.spotifyTrackId,
          title: payload.spotifyTitle || "Unknown",
          artist: payload.spotifyArtist || "Unknown",
          album: payload.spotifyAlbum || "Unknown",
          genre: "Spotify",
          mood: "fresh",
          coverUrl: payload.spotifyCoverUrl || "",
          previewUrl: payload.spotifyPreviewUrl || "",
        };
        state.tracks.push(track);
      }
    } else if (payload.trackId) {
      track = state.tracks.find((item) => item.id === Number(payload.trackId)) || null;
    } else {
      track = null;
    }
    const post = {
      id: Math.max(...state.posts.map((item) => item.id)) + 1,
      user,
      track,
      mood: payload.mood || "Fresh",
      caption: payload.caption || "",
      createdAt: new Date().toISOString(),
    };
    state.posts.unshift(post);
    saveLocalState(state);
    return { post: decoratedPost(post, user, state), offline: true };
  }
}

export async function likePost(token, postId, currentUser) {
  try {
    return await request(`/posts/${postId}/like`, { method: "POST", token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = currentUser
      ? (state.users.find((u) => u.id === currentUser.id) || currentUser)
      : userFromToken(token, state);
    const numericPostId = Number(postId);
    const existingIndex = state.likes.findIndex(
      ([likerId, likedPostId]) => likerId === current.id && likedPostId === numericPostId
    );
    if (existingIndex >= 0) {
      state.likes.splice(existingIndex, 1);
    } else {
      state.likes.push([current.id, numericPostId]);
    }
    saveLocalState(state);
    const post = state.posts.find((item) => item.id === numericPostId);
    return { post: post ? decoratedPost(post, current, state) : null, offline: true };
  }
}

export async function getProfile(token, userId) {
  try {
    return await request(`/users/${userId}`, { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = userFromToken(token, state);
    return { user: profilePayload(state, current, userId) };
  }
}

export async function getComments(token, postId) {
  try {
    return await request(`/posts/${postId}/comments`, { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    return { comments: [] };
  }
}

export async function addComment(token, postId, content, currentUser, parentId) {
  try {
    return await request(`/posts/${postId}/comments`, { method: "POST", token, body: { content, ...(parentId ? { parentId } : {}) } });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    if (err.message === "Authentication required") throw err;
    return { comment: { id: Date.now(), content, parentId: parentId || null, createdAt: new Date().toISOString(), likeCount: 0, likedByMe: false, user: currentUser || { username: "you", displayName: "You", avatarKey: "U" } } };
  }
}

export async function deletePost(token, postId) {
  try {
    return await request(`/posts/${postId}`, { method: "DELETE", token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    return { ok: true, offline: true };
  }
}

export async function likeComment(token, postId, commentId) {
  try {
    return await request(`/posts/${postId}/comments/${commentId}/like`, { method: "POST", token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    return { likeCount: 0, likedByMe: false };
  }
}

export async function deleteComment(token, postId, commentId) {
  try {
    return await request(`/posts/${postId}/comments/${commentId}`, { method: "DELETE", token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    return { ok: true, offline: true };
  }
}

export async function followUser(token, userId, currentUser) {
  try {
    return await request(`/users/${userId}/follow`, { method: "POST", token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = currentUser
      ? (state.users.find((u) => u.id === currentUser.id) || currentUser)
      : userFromToken(token, state);
    if (!state.follows.some(([from, to]) => from === current.id && to === userId)) {
      state.follows.push([current.id, userId]);
      saveLocalState(state);
    }
    return { ok: true, offline: true };
  }
}

export async function unfollowUser(token, userId, currentUser) {
  try {
    return await request(`/users/${userId}/follow`, { method: "DELETE", token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = currentUser
      ? (state.users.find((u) => u.id === currentUser.id) || currentUser)
      : userFromToken(token, state);
    state.follows = state.follows.filter(([from, to]) => !(from === current.id && to === userId));
    saveLocalState(state);
    return { ok: true, offline: true };
  }
}

export async function getSuggestions(token) {
  try {
    return await request("/suggestions", { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const current = userFromToken(token, state);
    const direct = new Set(state.follows.filter(([from]) => from === current.id).map(([, to]) => to));
    const counts = new Map();
    for (const [, friendId] of state.follows.filter(([from]) => from === current.id)) {
      for (const [, candidateId] of state.follows.filter(([from]) => from === friendId)) {
        if (candidateId !== current.id && !direct.has(candidateId)) {
          counts.set(candidateId, (counts.get(candidateId) || 0) + 1);
        }
      }
    }
    const ranked = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id, score]) => ({ ...state.users.find((user) => user.id === id), score }))
      .filter(Boolean);
    return { users: ranked.length ? ranked : state.users.filter((user) => user.id !== current.id).slice(0, 3) };
  }
}

export async function search(token, query) {
  try {
    return await request(`/search?q=${encodeURIComponent(query)}`, { token });
  } catch (err) {
    if (!OFFLINE_FALLBACK) throw err;
    const state = loadLocalState();
    const needle = query.toLowerCase();
    return {
      tracks: state.tracks.filter((track) =>
        `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(needle)
      ),
      users: state.users.filter((user) =>
        `${user.username} ${user.displayName} ${user.favoriteGenres.join(" ")}`.toLowerCase().includes(needle)
      ),
    };
  }
}
// ─── PLAYLIST API ─────────────────────────────────────────────────────────────
// Add these functions to apps/frontend/src/api.js

export async function getPlaylists(token, userId) {
  try {
    return await request(`/users/${userId}/playlists`, { token });
  } catch {
    const state = loadLocalState();
    const playlists = (state.playlists || []).filter(
      (p) => p.user.id === Number(userId)
    );
    return { playlists };
  }
}

export async function createPlaylist(token, { title, description, isPublic }) {
  try {
    return await request("/playlists", {
      method: "POST",
      token,
      body: { title, description, isPublic },
    });
  } catch {
    const state = loadLocalState();
    const current = userFromToken(token, state);
    const playlist = {
      id: Math.max(0, ...(state.playlists || []).map((p) => p.id)) + 1,
      title: title || "Untitled Playlist",
      description: description || "",
      coverUrl: "",
      shareKey: Math.random().toString(36).slice(2, 14),
      isPublic: isPublic !== false,
      createdAt: new Date().toISOString(),
      user: current,
      likeCount: 0,
      likedByMe: false,
      trackCount: 0,
      tracks: [],
    };
    if (!state.playlists) state.playlists = [];
    state.playlists.unshift(playlist);
    saveLocalState(state);
    return { playlist };
  }
}

export async function addTrackToPlaylist(token, playlistId, trackId) {
  try {
    return await request(`/playlists/${playlistId}/tracks`, {
      method: "POST",
      token,
      body: { trackId },
    });
  } catch {
    const state = loadLocalState();
    if (!state.playlists) state.playlists = [];
    const playlist = state.playlists.find((p) => p.id === Number(playlistId));
    if (playlist) {
      const track =
        state.tracks.find((t) => t.id === Number(trackId)) || state.tracks[0];
      if (track && !playlist.tracks.find((t) => t.id === track.id)) {
        playlist.tracks.push(track);
        playlist.trackCount = playlist.tracks.length;
        if (!playlist.coverUrl && track.coverUrl) playlist.coverUrl = track.coverUrl;
      }
      saveLocalState(state);
      return { playlist };
    }
    return { playlist: null };
  }
}

export async function removeTrackFromPlaylist(token, playlistId, trackId) {
  try {
    return await request(`/playlists/${playlistId}/tracks/${trackId}`, {
      method: "DELETE",
      token,
    });
  } catch {
    const state = loadLocalState();
    if (!state.playlists) return { ok: true };
    const playlist = state.playlists.find((p) => p.id === Number(playlistId));
    if (playlist) {
      playlist.tracks = playlist.tracks.filter((t) => t.id !== Number(trackId));
      playlist.trackCount = playlist.tracks.length;
      playlist.coverUrl = playlist.tracks[0]?.coverUrl || "";
      saveLocalState(state);
      return { playlist };
    }
    return { ok: true };
  }
}

export async function likePlaylist(token, playlistId) {
  try {
    return await request(`/playlists/${playlistId}/like`, {
      method: "POST",
      token,
    });
  } catch {
    const state = loadLocalState();
    if (!state.playlists) return {};
    const current = userFromToken(token, state);
    const playlist = state.playlists.find((p) => p.id === Number(playlistId));
    if (playlist) {
      if (playlist.likedByMe) {
        playlist.likeCount = Math.max(0, playlist.likeCount - 1);
        playlist.likedByMe = false;
      } else {
        playlist.likeCount = (playlist.likeCount || 0) + 1;
        playlist.likedByMe = true;
      }
      saveLocalState(state);
      return { playlist };
    }
    return {};
  }
}

export async function deletePlaylist(token, playlistId) {
  try {
    return await request(`/playlists/${playlistId}`, {
      method: "DELETE",
      token,
    });
  } catch {
    const state = loadLocalState();
    if (!state.playlists) return { ok: true };
    state.playlists = state.playlists.filter(
      (p) => p.id !== Number(playlistId)
    );
    saveLocalState(state);
    return { ok: true };
  }
}

export async function getPlaylistByShareKey(shareKey) {
  try {
    return await request(`/playlists/share/${shareKey}`);
  } catch {
    const state = loadLocalState();
    const playlist = (state.playlists || []).find(
      (p) => p.shareKey === shareKey
    );
    return playlist ? { playlist } : { playlist: null };
  }
}

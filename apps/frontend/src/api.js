import { demoUserPassword, follows, seedPosts, tracks, users } from "./mockData.js";

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? "http://localhost:8080/api" : "");
const STORAGE_KEY = "vibe-local-state";

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return {
    users: [...users],
    tracks: [...tracks],
    follows: [...follows],
    posts: seedPosts.map((post) => ({ ...post })),
  };
}

function saveLocalState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

export async function login(username, password) {
  try {
    return await request("/auth/login", { method: "POST", body: { username, password } });
  } catch {
    const state = loadLocalState();
    const user = state.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || password !== demoUserPassword) {
      throw new Error("Invalid username or password");
    }
    return { user, token: localTokenFor(user), offline: true };
  }
}

export async function register(displayName, username, password, genres) {
  try {
    return await request("/auth/register", {
      method: "POST",
      body: { displayName, username, password, genres },
    });
  } catch {
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
    };
    state.users.push(user);
    saveLocalState(state);
    return { user, token: localTokenFor(user), offline: true };
  }
}

export async function getFeed(token) {
  try {
    return await request("/feed", { token });
  } catch {
    return { posts: loadLocalState().posts };
  }
}

export async function getTrending(token) {
  try {
    return await request("/trending", { token });
  } catch {
    const posts = [...loadLocalState().posts].sort((left, right) => right.likeCount - left.likeCount);
    return { posts };
  }
}

export async function getTracks() {
  try {
    return await request("/tracks");
  } catch {
    return { tracks: loadLocalState().tracks };
  }
}

export async function createPost(token, payload) {
  try {
    return await request("/posts", { method: "POST", token, body: payload });
  } catch {
    const state = loadLocalState();
    const user = userFromToken(token, state);
    const track = state.tracks.find((item) => item.id === Number(payload.trackId)) || state.tracks[0];
    const post = {
      id: Math.max(...state.posts.map((item) => item.id)) + 1,
      user,
      track,
      mood: payload.mood || "Fresh",
      caption: payload.caption || "",
      createdAt: new Date().toISOString(),
      likeCount: 0,
      likedByMe: false,
    };
    state.posts.unshift(post);
    saveLocalState(state);
    return { post, offline: true };
  }
}

export async function likePost(token, postId) {
  try {
    return await request(`/posts/${postId}/like`, { method: "POST", token });
  } catch {
    const state = loadLocalState();
    const post = state.posts.find((item) => item.id === postId);
    if (post && !post.likedByMe) {
      post.likedByMe = true;
      post.likeCount += 1;
      saveLocalState(state);
    }
    return { post, offline: true };
  }
}

export async function getProfile(token, userId) {
  try {
    return await request(`/users/${userId}`, { token });
  } catch {
    const state = loadLocalState();
    const user = state.users.find((item) => item.id === userId) || state.users[0];
    return {
      user: {
        ...user,
        followers: state.follows.filter((follow) => follow[1] === user.id).length,
        following: state.follows.filter((follow) => follow[0] === user.id).length,
        postCount: state.posts.filter((post) => post.user.id === user.id).length,
        posts: state.posts.filter((post) => post.user.id === user.id),
      },
    };
  }
}

export async function followUser(token, userId) {
  try {
    return await request(`/users/${userId}/follow`, { method: "POST", token });
  } catch {
    const state = loadLocalState();
    const current = userFromToken(token, state);
    if (!state.follows.some(([from, to]) => from === current.id && to === userId)) {
      state.follows.push([current.id, userId]);
      saveLocalState(state);
    }
    return { ok: true, offline: true };
  }
}

export async function getSuggestions(token) {
  try {
    return await request("/suggestions", { token });
  } catch {
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
  } catch {
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

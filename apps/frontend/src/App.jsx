import {
  Flame,
  Heart,
  Home,
  LogOut,
  Music2,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createPost,
  followUser,
  getFeed,
  getProfile,
  getSuggestions,
  getTracks,
  getTrending,
  likePost,
  login,
  register,
  search,
} from "./api.js";

const savedSession = JSON.parse(localStorage.getItem("vibe-session") || "null");

export default function App() {
  const [session, setSession] = useState(savedSession);
  const [view, setView] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [query, setQuery] = useState("synth");
  const [results, setResults] = useState({ tracks: [], users: [] });
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!session) {
      return;
    }
    localStorage.setItem("vibe-session", JSON.stringify(session));
    refreshAll(session.token, session.user.id);
  }, [session]);

  async function refreshAll(token, userId) {
    const [feedData, trendingData, trackData, profileData, suggestionData] = await Promise.all([
      getFeed(token),
      getTrending(token),
      getTracks(),
      getProfile(token, userId),
      getSuggestions(token),
    ]);
    setPosts(feedData.posts);
    setTrending(trendingData.posts);
    setTracks(trackData.tracks);
    setProfile(profileData.user);
    setSuggestions(suggestionData.users);
  }

  async function handleLogin(username, password) {
    const payload = await login(username, password);
    setSession({ token: payload.token, user: payload.user, offline: payload.offline });
    setStatus(payload.offline ? "Local demo mode" : "Connected to Java API");
  }

  async function handleRegister(form) {
    const payload = await register(form.displayName, form.username, form.password, form.genres);
    setSession({ token: payload.token, user: payload.user, offline: payload.offline });
    setStatus(payload.offline ? "Local demo mode" : "Connected to Java API");
  }

  async function handleCreatePost(payload) {
    const created = await createPost(session.token, payload);
    setPosts((current) => [created.post, ...current]);
    const trend = await getTrending(session.token);
    setTrending(trend.posts);
  }

  async function handleLike(postId) {
    const payload = await likePost(session.token, postId);
    const update = (items) => items.map((post) => (post.id === postId ? payload.post : post));
    setPosts(update);
    setTrending(update);
  }

  async function handleSearch(event) {
    event.preventDefault();
    const payload = await search(session.token, query);
    setResults(payload);
    setView("search");
  }

  async function handleFollow(userId) {
    await followUser(session.token, userId);
    const suggestionData = await getSuggestions(session.token);
    setSuggestions(suggestionData.users);
  }

  function logout() {
    localStorage.removeItem("vibe-session");
    setSession(null);
  }

  if (!session) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  const activePosts = view === "trending" ? trending : posts;

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} user={session.user} onLogout={logout} />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Vibe radar</p>
            <h1>{view === "trending" ? "Trending now" : view === "profile" ? "Your profile" : view === "search" ? "Search" : "Home feed"}</h1>
          </div>
          <form className="search-pill" onSubmit={handleSearch}>
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Vibe" />
          </form>
        </header>

        {status && <div className="status-strip">{status}</div>}

        {view === "profile" ? (
          <ProfileView profile={profile} posts={profile?.posts || []} onLike={handleLike} />
        ) : view === "search" ? (
          <SearchView results={results} onFollow={handleFollow} />
        ) : (
          <FeedView
            posts={activePosts}
            tracks={tracks}
            suggestions={suggestions}
            trending={trending}
            isTrending={view === "trending"}
            onCreate={handleCreatePost}
            onLike={handleLike}
            onFollow={handleFollow}
          />
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    username: "luna",
    displayName: "Luna Vale",
    password: "vibe1234",
    genres: "Synth Pop, Dream Pop, Electronic",
  });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "login") {
        await onLogin(form.username, form.password);
      } else {
        await onRegister(form);
      }
    } catch (exception) {
      setError(exception.message);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-visual">
        <div className="brand-mark">
          <Music2 size={32} />
        </div>
        <h1>Vibe</h1>
        <p>Post the track, mood, and moment before it disappears.</p>
        <div className="hero-albums">
          <img src="/assets/covers/afterglow-loop.png" alt="Afterglow Loop cover" />
          <img src="/assets/covers/velvet-static.png" alt="Velvet Static cover" />
          <img src="/assets/covers/glass-coast.png" alt="Glass Coast cover" />
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Register
          </button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <label>
              Display name
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
          )}
          <label>
            Username
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          {mode === "register" && (
            <label>
              Favorite genres
              <input value={form.genres} onChange={(event) => setForm({ ...form, genres: event.target.value })} />
            </label>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" type="submit">
            <Sparkles size={18} />
            {mode === "login" ? "Enter Vibe" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Sidebar({ view, setView, user, onLogout }) {
  const items = [
    ["feed", Home, "Feed"],
    ["trending", TrendingUp, "Trending"],
    ["profile", User, "Profile"],
    ["search", Search, "Search"],
  ];

  return (
    <aside className="sidebar">
      <button className="logo-button" onClick={() => setView("feed")} title="Vibe home">
        <Music2 size={24} />
      </button>
      <nav>
        {items.map(([key, Icon, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)} title={label}>
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-user">
        <Avatar user={user} />
        <span>{user.username}</span>
        <button onClick={onLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

function FeedView({ posts, tracks, suggestions, trending, isTrending, onCreate, onLike, onFollow }) {
  return (
    <div className="content-grid">
      <section className="feed-column">
        {!isTrending && <Composer tracks={tracks} onCreate={onCreate} />}
        <div className="post-list">
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} rank={isTrending ? index + 1 : null} onLike={onLike} />
          ))}
        </div>
      </section>
      <aside className="insight-column">
        <Panel title="Hot tracks" icon={Flame}>
          {trending.slice(0, 3).map((post, index) => (
            <MiniTrack key={post.id} post={post} rank={index + 1} />
          ))}
        </Panel>
        <Panel title="Suggested follows" icon={UserPlus}>
          {suggestions.slice(0, 4).map((user) => (
            <div className="suggestion-row" key={user.id}>
              <Avatar user={user} />
              <div>
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
              </div>
              <button onClick={() => onFollow(user.id)} title={`Follow ${user.username}`}>
                <Plus size={16} />
              </button>
            </div>
          ))}
        </Panel>
      </aside>
    </div>
  );
}

function Composer({ tracks, onCreate }) {
  const [trackId, setTrackId] = useState(1);
  const [mood, setMood] = useState("Late-night");
  const [caption, setCaption] = useState("This track is carrying the whole evening.");
  const selectedTrack = useMemo(() => tracks.find((track) => track.id === Number(trackId)) || tracks[0], [tracks, trackId]);

  async function submit(event) {
    event.preventDefault();
    await onCreate({ trackId: Number(trackId), mood, caption });
    setCaption("");
  }

  if (!selectedTrack) {
    return null;
  }

  return (
    <form className="composer" onSubmit={submit}>
      <img src={selectedTrack.coverUrl} alt={`${selectedTrack.title} cover`} />
      <div className="composer-fields">
        <div className="composer-row">
          <select value={trackId} onChange={(event) => setTrackId(event.target.value)}>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.title} - {track.artist}
              </option>
            ))}
          </select>
          <input value={mood} onChange={(event) => setMood(event.target.value)} aria-label="Mood" />
        </div>
        <textarea value={caption} onChange={(event) => setCaption(event.target.value)} aria-label="Caption" />
      </div>
      <button className="icon-primary" title="Post vibe">
        <Plus size={20} />
      </button>
    </form>
  );
}

function PostCard({ post, rank, onLike }) {
  return (
    <article className="post-card">
      {rank && <div className="rank-badge">#{rank}</div>}
      <img className="cover" src={post.track.coverUrl} alt={`${post.track.title} cover`} />
      <div className="post-body">
        <div className="post-meta">
          <Avatar user={post.user} />
          <div>
            <strong>{post.user.displayName}</strong>
            <span>@{post.user.username} mixed {post.mood}</span>
          </div>
        </div>
        <h2>{post.track.title}</h2>
        <p className="artist">{post.track.artist} · {post.track.album}</p>
        <p className="caption">{post.caption}</p>
        <div className="post-actions">
          <button className={post.likedByMe ? "liked" : ""} onClick={() => onLike(post.id)} title="Like post">
            <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
            {post.likeCount}
          </button>
          <span>{post.track.genre}</span>
          <span>{formatDate(post.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ProfileView({ profile, posts, onLike }) {
  if (!profile) {
    return null;
  }

  return (
    <div className="profile-layout">
      <section className="profile-hero">
        <Avatar user={profile} large />
        <div>
          <p className="eyebrow">@{profile.username}</p>
          <h1>{profile.displayName}</h1>
          <p>{profile.bio}</p>
          <div className="genre-row">
            {profile.favoriteGenres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
        </div>
        <div className="profile-stats">
          <div>
            <strong>{profile.postCount}</strong>
            <span>posts</span>
          </div>
          <div>
            <strong>{profile.followers}</strong>
            <span>followers</span>
          </div>
          <div>
            <strong>{profile.following}</strong>
            <span>following</span>
          </div>
        </div>
      </section>
      <div className="post-list compact">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onLike={onLike} />
        ))}
      </div>
    </div>
  );
}

function SearchView({ results, onFollow }) {
  return (
    <div className="search-grid">
      <Panel title="Tracks" icon={Music2}>
        {results.tracks.map((track) => (
          <div className="track-result" key={track.id}>
            <img src={track.coverUrl} alt={`${track.title} cover`} />
            <div>
              <strong>{track.title}</strong>
              <span>{track.artist} · {track.genre}</span>
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="People" icon={User}>
        {results.users.map((user) => (
          <div className="suggestion-row" key={user.id}>
            <Avatar user={user} />
            <div>
              <strong>{user.displayName}</strong>
              <span>@{user.username}</span>
            </div>
            <button onClick={() => onFollow(user.id)} title={`Follow ${user.username}`}>
              <Plus size={16} />
            </button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="panel">
      <h2>
        <Icon size={18} />
        {title}
      </h2>
      <div className="panel-list">{children}</div>
    </section>
  );
}

function MiniTrack({ post, rank }) {
  return (
    <div className="mini-track">
      <span>{rank}</span>
      <img src={post.track.coverUrl} alt={`${post.track.title} cover`} />
      <div>
        <strong>{post.track.title}</strong>
        <small>{post.likeCount} likes</small>
      </div>
    </div>
  );
}

function Avatar({ user, large = false }) {
  return <div className={`avatar avatar-${user.avatarKey || "spark"} ${large ? "large" : ""}`}>{user.displayName.slice(0, 1)}</div>;
}

function formatDate(value) {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return "now";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

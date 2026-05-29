import {
  Flame,
  Heart,
  Home,
  LogOut,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectSpotify,
  createPost,
  followUser,
  unfollowUser,
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
import { createPlayer, exchangeSpotifyCode, getSpotifyProfile, initiateSpotifyLogin, playTrack, searchSpotifyTracks } from "./spotify.js";

const savedSession = JSON.parse(localStorage.getItem("vibe-session") || "null");
const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;

export default function App() {
  const [session, setSession] = useState(savedSession);
  const [view, setView] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState(savedSession?.user?.id || null);
  const [suggestions, setSuggestions] = useState([]);
  const [query, setQuery] = useState("synth");
  const [results, setResults] = useState({ tracks: [], users: [] });
  const [status, setStatus] = useState("");
  const [spotifyError, setSpotifyError] = useState("");
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    if (oauthError || code) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (!code || session) return;
    (async () => {
      try {
        const spotifyToken = await exchangeSpotifyCode(code);
        const profile = await getSpotifyProfile(spotifyToken);
        const payload = await connectSpotify(
          profile.id,
          profile.display_name || profile.id,
          profile.id
        );
        setSelectedProfileId(payload.user.id);
        setSession({ token: payload.token, user: payload.user, offline: payload.offline, spotifyToken });
        setStatus(payload.offline ? "Local demo (Spotify)" : "Connected via Spotify");
      } catch (err) {
        console.error("Spotify auth error:", err);
        setSpotifyError(err?.message || "Spotify girişi başarısız. Lütfen tekrar deneyin.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const token = session?.spotifyToken;
    if (!token) return;
    let current = null;
    (async () => {
      try {
        const { player: p, deviceId: id } = await createPlayer(token);
        current = p;
        p.addListener("player_state_changed", (state) => {
          if (!state) { setIsPlaying(false); return; }
          setIsPlaying(!state.paused);
          setPlayingTrackId(state.track_window?.current_track?.id || null);
        });
        setPlayer(p);
        setDeviceId(id);
      } catch {
        // Premium yoksa sessizce geç — play butonları gösterilmez
      }
    })();
    return () => { if (current) current.disconnect(); };
  }, [session?.spotifyToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) {
      return;
    }
    const profileId = selectedProfileId || session.user.id;
    localStorage.setItem("vibe-session", JSON.stringify(session));
    refreshAll(session.token, session.user.id, profileId);
  }, [session, selectedProfileId]);

  async function refreshAll(token, currentUserId, profileId = currentUserId) {
    const [feedData, trendingData, trackData, profileData, suggestionData] = await Promise.all([
      getFeed(token),
      getTrending(token),
      getTracks(),
      getProfile(token, profileId),
      getSuggestions(token),
    ]);
    setPosts(feedData.posts);
    setTrending(trendingData.posts);
    setTracks(trackData.tracks);
    setProfile(profileData.user);
    setSuggestions(suggestionData.users);
  }

  async function refreshProfile(profileId = selectedProfileId || session.user.id) {
    const profileData = await getProfile(session.token, profileId);
    setProfile(profileData.user);
  }

  async function handleLogin(username, password) {
    const payload = await login(username, password);
    setSelectedProfileId(payload.user.id);
    setSession({ token: payload.token, user: payload.user, offline: payload.offline });
    setStatus(payload.offline ? "Local demo mode" : "Connected to Java API");
  }

  async function handleRegister(form) {
    const payload = await register(form.displayName, form.username, form.password, form.genres);
    setSelectedProfileId(payload.user.id);
    setSession({ token: payload.token, user: payload.user, offline: payload.offline });
    setStatus(payload.offline ? "Local demo mode" : "Connected to Java API");
  }

  async function handleCreatePost(payload) {
    const created = await createPost(session.token, payload);
    setPosts((current) => [created.post, ...current]);
    const [trend, viewedProfile] = await Promise.all([
      getTrending(session.token),
      getProfile(session.token, selectedProfileId || session.user.id),
    ]);
    setTrending(trend.posts);
    setProfile(viewedProfile.user);
  }

  async function handleLike(postId) {
    const payload = await likePost(session.token, postId);
    if (!payload.post) {
      return;
    }
    const update = (items = []) => items.map((post) => (post.id === postId ? payload.post : post));
    const trend = await getTrending(session.token);
    setPosts(update);
    setTrending(trend.posts);
    setProfile((current) => (current ? { ...current, posts: update(current.posts || []) } : current));
  }

  async function handlePlay(spotifyTrackId) {
    if (!deviceId || !session?.spotifyToken) return;
    if (playingTrackId === spotifyTrackId) {
      isPlaying ? player.pause() : player.resume();
    } else {
      try {
        await playTrack(session.spotifyToken, deviceId, spotifyTrackId);
      } catch {
        setStatus("Çalma başlatılamadı — Spotify Premium gerekiyor olabilir.");
      }
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const payload = await search(session.token, query);
    setResults(payload);
    setView("search");
  }

  async function handleFollow(userId) {
    await followUser(session.token, userId);
    const [suggestionData, profileData] = await Promise.all([
      getSuggestions(session.token),
      getProfile(session.token, selectedProfileId || session.user.id),
    ]);
    setSuggestions(suggestionData.users);
    setProfile(profileData.user);
  }

  async function handleUnfollow(userId) {
    await unfollowUser(session.token, userId);
    const [suggestionData, profileData] = await Promise.all([
      getSuggestions(session.token),
      getProfile(session.token, selectedProfileId || session.user.id),
    ]);
    setSuggestions(suggestionData.users);
    setProfile(profileData.user);
  }

  async function openProfile(userId) {
    setSelectedProfileId(userId);
    setView("profile");
    const profileData = await getProfile(session.token, userId);
    setProfile(profileData.user);
  }

  function openOwnProfile() {
    openProfile(session.user.id);
  }

  function logout() {
    localStorage.removeItem("vibe-session");
    setSession(null);
    setProfile(null);
    setPosts([]);
    setTrending([]);
    setPlayer(null);
    setDeviceId(null);
    setPlayingTrackId(null);
    setIsPlaying(false);
  }

  if (!session) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} spotifyError={spotifyError} />;
  }

  const activePosts = view === "trending" ? trending : posts;
  const activeSpotifyId = isPlaying ? playingTrackId : null;
  const heading =
    view === "trending"
      ? "Trending now"
      : view === "profile"
        ? profile?.id === session.user.id
          ? "Your profile"
          : profile?.displayName || "Profile"
        : view === "search"
          ? "Search"
          : "Home feed";

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} user={session.user} onLogout={logout} onOwnProfile={openOwnProfile} />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Vibe radar</p>
            <h1>{heading}</h1>
          </div>
          <form className="search-pill" onSubmit={handleSearch}>
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Vibe" />
          </form>
        </header>

        {status && <div className="status-strip">{status}</div>}

        {view === "profile" ? (
          <ProfileView
            profile={profile}
            currentUser={session.user}
            onLike={handleLike}
            onNavigate={openProfile}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onPlay={deviceId ? handlePlay : null}
            activeSpotifyId={activeSpotifyId}
          />
        ) : view === "search" ? (
          <SearchView results={results} onFollow={handleFollow} onUnfollow={handleUnfollow} onNavigate={openProfile} />
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
            onNavigate={openProfile}
            spotifyToken={session.spotifyToken}
            onPlay={deviceId ? handlePlay : null}
            activeSpotifyId={activeSpotifyId}
          />
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onLogin, onRegister, spotifyError }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    username: "luna",
    displayName: "Luna Vale",
    password: "vibe1234",
    genres: "Synth Pop, Dream Pop, Electronic",
  });
  const [error, setError] = useState("");
  const [spotifyLoading, setSpotifyLoading] = useState(false);

  async function handleSpotifyLogin() {
    setSpotifyLoading(true);
    try {
      await initiateSpotifyLogin();
    } catch (err) {
      setError(err.message);
      setSpotifyLoading(false);
    }
  }

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
          <img src={assetUrl("assets/covers/afterglow-loop.png")} alt="Afterglow Loop cover" />
          <img src={assetUrl("assets/covers/velvet-static.png")} alt="Velvet Static cover" />
          <img src={assetUrl("assets/covers/glass-coast.png")} alt="Glass Coast cover" />
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
          <div className="spotify-auth-divider">or</div>
          <button
            type="button"
            className="spotify-button"
            onClick={handleSpotifyLogin}
            disabled={spotifyLoading}
          >
            <Music2 size={18} />
            {spotifyLoading ? "Yönlendiriliyor..." : "Spotify ile devam et"}
          </button>
          {spotifyError && <p className="error-text">{spotifyError}</p>}
        </form>
      </section>
    </div>
  );
}

function Sidebar({ view, setView, user, onLogout, onOwnProfile }) {
  const items = [
    ["feed", Home, "Feed", () => setView("feed")],
    ["trending", TrendingUp, "Trending", () => setView("trending")],
    ["profile", User, "Profile", onOwnProfile],
    ["search", Search, "Search", () => setView("search")],
  ];

  return (
    <aside className="sidebar">
      <button className="logo-button" onClick={() => setView("feed")} title="Vibe home">
        <Music2 size={24} />
      </button>
      <nav>
        {items.map(([key, Icon, label, action]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={action} title={label}>
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-user">
        <button className="avatar-button" onClick={onOwnProfile} title="Open your profile">
          <Avatar user={user} />
        </button>
        <span>{user.username}</span>
        <button onClick={onLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

function FeedView({ posts, tracks, suggestions, trending, isTrending, onCreate, onLike, onFollow, onNavigate, spotifyToken, onPlay, activeSpotifyId }) {
  return (
    <div className="content-grid">
      <section className="feed-column">
        {!isTrending && <Composer tracks={tracks} onCreate={onCreate} spotifyToken={spotifyToken} />}
        <div className="post-list">
          {posts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              rank={isTrending ? index + 1 : null}
              onLike={onLike}
              onNavigate={onNavigate}
              onPlay={onPlay}
              activeSpotifyId={activeSpotifyId}
            />
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
              <button className="avatar-button" onClick={() => onNavigate(user.id)} title={`Open ${user.username}`}>
                <Avatar user={user} />
              </button>
              <button className="name-button" onClick={() => onNavigate(user.id)}>
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
              </button>
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

function Composer({ tracks, onCreate, spotifyToken }) {
  const [trackId, setTrackId] = useState("");
  const [mood, setMood] = useState("Late-night");
  const [caption, setCaption] = useState("This track is carrying the whole evening.");
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [spotifyTrack, setSpotifyTrack] = useState(null);
  const [searching, setSearching] = useState(false);

  const localTrack = useMemo(
    () => tracks.find((t) => t.id === Number(trackId)) || tracks[0],
    [tracks, trackId]
  );
  const activeTrack = spotifyTrack || localTrack;

  if (!activeTrack && !spotifyToken) return null;

  async function doSpotifySearch(event) {
    if (event) event.preventDefault();
    if (!spotifyQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchSpotifyTracks(spotifyToken, spotifyQuery);
      setSpotifyResults(results);
    } finally {
      setSearching(false);
    }
  }

  function selectSpotifyTrack(track) {
    setSpotifyTrack(track);
    setSpotifyResults([]);
    setSpotifyQuery("");
  }

  async function submit(event) {
    event.preventDefault();
    const payload = spotifyTrack
      ? {
          spotifyTrackId: spotifyTrack.spotifyId,
          spotifyTitle: spotifyTrack.title,
          spotifyArtist: spotifyTrack.artist,
          spotifyAlbum: spotifyTrack.album,
          spotifyCoverUrl: spotifyTrack.coverUrl,
          spotifyPreviewUrl: spotifyTrack.previewUrl || "",
          mood,
          caption,
        }
      : { trackId: localTrack?.id || 1, mood, caption };
    await onCreate(payload);
    setCaption("");
    setSpotifyTrack(null);
    setSpotifyResults([]);
    setSpotifyQuery("");
  }

  return (
    <form className="composer" onSubmit={submit}>
      <img src={activeTrack?.coverUrl || ""} alt={activeTrack?.title || "Track"} />
      <div className="composer-fields">
        {spotifyToken && (
          <div className="spotify-search-row">
            <input
              className="spotify-search-input"
              value={spotifyQuery}
              onChange={(e) => setSpotifyQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSpotifySearch(); } }}
              placeholder="Spotify'da şarkı ara..."
            />
            <button type="button" className="spotify-search-btn" onClick={doSpotifySearch} disabled={searching}>
              <Search size={15} />
            </button>
          </div>
        )}
        {spotifyResults.length > 0 && (
          <div className="spotify-results">
            {spotifyResults.map((track) => (
              <button
                key={track.spotifyId}
                type="button"
                className="spotify-result-item"
                onClick={() => selectSpotifyTrack(track)}
              >
                <img src={track.coverUrl} alt={track.title} />
                <div>
                  <strong>{track.title}</strong>
                  <span>{track.artist}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="composer-row">
          {spotifyTrack ? (
            <div className="selected-track-chip">
              <span>{spotifyTrack.title} — {spotifyTrack.artist}</span>
              <button type="button" onClick={() => setSpotifyTrack(null)} title="Kaldır">×</button>
            </div>
          ) : (
            <select
              value={trackId || (localTrack?.id ?? "")}
              onChange={(e) => setTrackId(e.target.value)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.title} - {t.artist}</option>
              ))}
            </select>
          )}
          <input value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Mood" />
        </div>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
      </div>
      <button className="icon-primary" title="Post vibe">
        <Plus size={20} />
      </button>
    </form>
  );
}

let _currentAudio = null;

function PostCard({ post, rank, onLike, onNavigate, onPlay, activeSpotifyId }) {
  const isActive = onPlay && post.track.spotifyId && post.track.spotifyId === activeSpotifyId;
  const previewUrl = post.track.previewUrl;
  const audioRef = useRef(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  function togglePreview() {
    if (!previewUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.addEventListener("ended", () => setPreviewPlaying(false));
    }
    if (previewPlaying) {
      audioRef.current.pause();
      setPreviewPlaying(false);
    } else {
      if (_currentAudio && _currentAudio !== audioRef.current) {
        _currentAudio.pause();
      }
      _currentAudio = audioRef.current;
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setPreviewPlaying(true);
    }
  }

  return (
    <article className="post-card">
      {rank && <div className="rank-badge">#{rank}</div>}
      <img className="cover" src={post.track.coverUrl} alt={`${post.track.title} cover`} />
      <div className="post-body">
        <div className="post-meta">
          <button className="avatar-button" onClick={() => onNavigate(post.user.id)} title={`Open ${post.user.username}`}>
            <Avatar user={post.user} />
          </button>
          <button className="profile-link" onClick={() => onNavigate(post.user.id)}>
            <strong>{post.user.displayName}</strong>
            <span>@{post.user.username} mixed {post.mood}</span>
          </button>
        </div>
        <h2>{post.track.title}</h2>
        <p className="artist">{post.track.artist} - {post.track.album}</p>
        <p className="caption">{post.caption}</p>
        <div className="post-actions">
          <button className={post.likedByMe ? "liked" : ""} onClick={() => onLike(post.id)} title={post.likedByMe ? "Unlike post" : "Like post"}>
            <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
            {post.likeCount}
          </button>
          {previewUrl && (
            <button className={`play-btn${previewPlaying ? " playing" : ""}`} onClick={togglePreview} title={previewPlaying ? "Duraklat" : "30sn önizleme"}>
              {previewPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
          )}
          <span>{post.track.genre}</span>
          <span>{formatDate(post.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ProfileView({ profile, currentUser, onLike, onNavigate, onFollow, onUnfollow, onPlay, activeSpotifyId }) {
  if (!profile) {
    return null;
  }

  const isOwnProfile = profile.id === currentUser.id;

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
          {!isOwnProfile && (
            <button
              className={`follow-profile-button${profile.isFollowing ? " following" : ""}`}
              onClick={() => profile.isFollowing ? onUnfollow(profile.id) : onFollow(profile.id)}
            >
              <UserPlus size={17} />
              {profile.isFollowing ? "Takipten çık" : "Takip et"}
            </button>
          )}
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

      <div className="relationship-grid">
        <Panel title="Followers" icon={Users}>
          <RelationshipList users={profile.followerUsers || []} onNavigate={onNavigate} />
        </Panel>
        <Panel title="Following" icon={UserPlus}>
          <RelationshipList users={profile.followingUsers || []} onNavigate={onNavigate} />
        </Panel>
      </div>

      <div className="post-list compact">
        {(profile.posts || []).map((post) => (
          <PostCard key={post.id} post={post} onLike={onLike} onNavigate={onNavigate} onPlay={onPlay} activeSpotifyId={activeSpotifyId} />
        ))}
      </div>
    </div>
  );
}

function RelationshipList({ users, onNavigate }) {
  if (!users.length) {
    return <p className="empty-copy">No users yet.</p>;
  }
  return users.map((user) => (
    <button className="relationship-user" key={user.id} onClick={() => onNavigate(user.id)}>
      <Avatar user={user} />
      <span>
        <strong>{user.displayName}</strong>
        <small>@{user.username}</small>
      </span>
    </button>
  ));
}

function SearchView({ results, onFollow, onUnfollow, onNavigate }) {
  return (
    <div className="search-grid">
      <Panel title="Tracks" icon={Music2}>
        {results.tracks.map((track) => (
          <div className="track-result" key={track.id}>
            <img src={track.coverUrl} alt={`${track.title} cover`} />
            <div>
              <strong>{track.title}</strong>
              <span>{track.artist} - {track.genre}</span>
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="People" icon={User}>
        {results.users.map((user) => (
          <div className="suggestion-row" key={user.id}>
            <button className="avatar-button" onClick={() => onNavigate(user.id)} title={`Open ${user.username}`}>
              <Avatar user={user} />
            </button>
            <button className="name-button" onClick={() => onNavigate(user.id)}>
              <strong>{user.displayName}</strong>
              <span>@{user.username}</span>
            </button>
            {user.isFollowing ? (
              <button className="unfollow-btn" onClick={() => onUnfollow(user.id)} title="Takipten çık">
                <Users size={16} />
              </button>
            ) : (
              <button onClick={() => onFollow(user.id)} title={`Takip et`}>
                <Plus size={16} />
              </button>
            )}
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

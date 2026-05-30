import {
  Flame,
  Heart,
  Home,
  LogOut,
  MessageSquare,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addComment,
  connectSpotify,
  createPost,
  deleteComment,
  deletePost,
  followUser,
  getComments,
  likeComment,
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
        setSpotifyError(err?.message || "Spotify login failed. Please try again.");
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
        setStatus("Playback failed — Spotify Premium may be required.");
      }
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const payload = await search(session.token, query);
    setResults(payload);
    setView("search");
  }

  async function handleDeletePost(postId) {
    await deletePost(session.token, postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setTrending((prev) => prev.filter((p) => p.id !== postId));
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
            token={session.token}
            currentUser={session.user}
            onDelete={handleDeletePost}
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
            token={session.token}
            currentUser={session.user}
            onDelete={handleDeletePost}
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
          <img src={assetUrl("assets/vibe-logo.png")} alt="Vibe" />
        </div>
        <h1>Vibe</h1>
        <p>Post the track, mood, and moment before it disappears.</p>
        <div className="hero-albums">
          <img src="https://upload.wikimedia.org/wikipedia/en/3/3f/Night_Visions_Album_Cover.jpeg" alt="Imagine Dragons – Night Visions" />
          <img src="https://upload.wikimedia.org/wikipedia/en/f/f6/Taylor_Swift_-_1989.png" alt="Taylor Swift – 1989" />
          <img src="https://upload.wikimedia.org/wikipedia/en/3/3d/Coldplay_-_A_Head_Full_of_Dreams.png" alt="Coldplay – A Head Full of Dreams" />
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
            {spotifyLoading ? "Redirecting..." : "Continue with Spotify"}
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
        <img src={assetUrl("assets/vibe-logo.png")} alt="Vibe" />
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

function FeedView({ posts, tracks, suggestions, trending, isTrending, onCreate, onLike, onFollow, onNavigate, spotifyToken, onPlay, activeSpotifyId, token, currentUser, onDelete }) {
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
              token={token}
              currentUser={currentUser}
              onDelete={onDelete}
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

  const searchTimerRef = useRef(null);

  async function doSpotifySearch(q) {
    const query = (q ?? spotifyQuery).trim();
    if (!query) { setSpotifyResults([]); return; }
    setSearching(true);
    try {
      const results = await searchSpotifyTracks(spotifyToken, query);
      setSpotifyResults(results);
    } finally {
      setSearching(false);
    }
  }

  function handleSpotifyQueryChange(e) {
    const val = e.target.value;
    setSpotifyQuery(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSpotifySearch(val), 350);
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
              onChange={handleSpotifyQueryChange}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSpotifySearch(); } }}
              placeholder="Search a track on Spotify..."
            />
            <button type="button" className="spotify-search-btn" onClick={() => doSpotifySearch()} disabled={searching}>
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
              <button type="button" onClick={() => setSpotifyTrack(null)} title="Remove">×</button>
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

function PostCard({ post, rank, onLike, onNavigate, onPlay, activeSpotifyId, token, currentUser, onDelete }) {
  const spotifyId = post.track.spotifyId;
  const [showEmbed, setShowEmbed] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [localCommentCount, setLocalCommentCount] = useState(post.commentCount || 0);

  const isPostOwner = currentUser && post.user.id === currentUser.id;

  async function loadComments() {
    if (comments !== null) { setShowComments((p) => !p); return; }
    const data = await getComments(token, post.id);
    setComments(data.comments || []);
    setShowComments(true);
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    setCommentError("");
    try {
      const data = await addComment(token, post.id, commentText.trim(), currentUser);
      setComments((prev) => [...(prev || []), data.comment]);
      setLocalCommentCount((n) => n + 1);
      setCommentText("");
    } catch {
      setCommentError("Session expired — please log out and log back in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId) {
    await deleteComment(token, post.id, commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setLocalCommentCount((n) => Math.max(0, n - 1));
  }

  async function handleLikeComment(commentId) {
    const data = await likeComment(token, post.id, commentId);
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, likeCount: data.likeCount, likedByMe: data.likedByMe } : c
    ));
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
        {showEmbed && spotifyId && (
          <iframe
            className="spotify-embed"
            src={`https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        )}
        <div className="post-actions">
          <button className={post.likedByMe ? "liked" : ""} onClick={() => onLike(post.id)} title={post.likedByMe ? "Unlike post" : "Like post"}>
            <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
            {post.likeCount}
          </button>
          {spotifyId && (
            <button className={`play-btn${showEmbed ? " playing" : ""}`} onClick={() => setShowEmbed((p) => !p)} title={showEmbed ? "Hide player" : "Play preview"}>
              {showEmbed ? <Pause size={18} /> : <Play size={18} />}
            </button>
          )}
          <button className="comment-btn" onClick={loadComments} title="Comments">
            <MessageSquare size={18} />
            <span>{localCommentCount}</span>
          </button>
          <span>{post.track.genre}</span>
          <span>{formatDate(post.createdAt)}</span>
          {isPostOwner && onDelete && (
            <button className="delete-btn" onClick={() => onDelete(post.id)} title="Delete post">
              <Trash2 size={15} />
            </button>
          )}
        </div>
        {showComments && (
          <div className="comments-section">
            {(comments || []).map((c) => {
              const canDelete = currentUser && (c.user.id === currentUser.id || isPostOwner);
              return (
                <div className="comment-row" key={c.id}>
                  <Avatar user={c.user} />
                  <div className="comment-body">
                    <div className="comment-header">
                      <strong>{c.user.displayName}</strong>
                      <span className="comment-username">@{c.user.username}</span>
                      <span className="comment-time">{formatDate(c.createdAt)}</span>
                      {canDelete && (
                        <button className="delete-btn comment-delete" onClick={() => handleDeleteComment(c.id)} title="Delete comment">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <p className="comment-text">{c.content}</p>
                    <div className="comment-actions">
                      <button
                        className={`comment-like-btn${c.likedByMe ? " liked" : ""}`}
                        onClick={() => handleLikeComment(c.id)}
                        disabled={!token}
                        title="Like comment"
                      >
                        <Heart size={13} fill={c.likedByMe ? "currentColor" : "none"} />
                        {(c.likeCount > 0) && <span>{c.likeCount}</span>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {token && (
              <form className="comment-form" onSubmit={submitComment}>
                {currentUser && <Avatar user={currentUser} />}
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  disabled={submitting}
                />
                <button type="submit" disabled={submitting || !commentText.trim()}>
                  <Plus size={16} />
                </button>
              </form>
            )}
            {commentError && <p className="comment-error">{commentError}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

function ProfileView({ profile, currentUser, onLike, onNavigate, onFollow, onUnfollow, onPlay, activeSpotifyId, token, onDelete }) {
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
              {profile.isFollowing ? "Unfollow" : "Follow"}
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
          <PostCard key={post.id} post={post} onLike={onLike} onNavigate={onNavigate} onPlay={onPlay} activeSpotifyId={activeSpotifyId} token={token} currentUser={currentUser} onDelete={onDelete} />
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
              <button className="unfollow-btn" onClick={() => onUnfollow(user.id)} title="Unfollow">
                <Users size={16} />
              </button>
            ) : (
              <button onClick={() => onFollow(user.id)} title="Follow">
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

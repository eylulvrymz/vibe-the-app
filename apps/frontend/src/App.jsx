import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Flame,
  Globe,
  Heart,
  Home,
  ListMusic,
  Lock,
  LogOut,
  MessageSquare,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  Users,
  X,
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
  getPost,
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
  updateProfile,
  search,
  getPlaylists,
  createPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  likePlaylist,
  deletePlaylist,
  getPlaylistByShareKey,
} from "./api.js";
import { createPlayer, exchangeSpotifyCode, getSpotifyProfile, initiateSpotifyLogin, playTrack, searchSpotifyTracks } from "./spotify.js";

const savedSession = JSON.parse(localStorage.getItem("vibe-session") || "null");
const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;

// Crop to center-square, resize to 300×300, export as JPEG.
// This keeps the payload small (~20–40 KB) and gives a consistent avatar shape.
async function compressImage(file, size = 300, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Geçersiz görsel dosyası."));
      img.onload = () => {
        // Center-square crop: take the largest square from the middle of the image
        const side = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - side) / 2);
        const sy = Math.floor((img.height - side) / 2);

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// V-Note logomark as inline SVG (design handoff spec)
function VibeMark({ size = 32, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Vibe" fill="none">
      <path d="M14 15 L32 47 L50 15" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="20" r="5.5" fill={color} />
    </svg>
  );
}

function FullPageLoader() {
  return (
    <div className="full-page-loader">
      <VibeMark size={40} color="var(--vibe-teal)" />
      <div className="full-page-loader-ring" />
      <span className="full-page-loader-label">Loading…</span>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(savedSession);
  const [showLanding, setShowLanding] = useState(!savedSession);
  const [view, setView] = useState("feed");
  const [prevView, setPrevView] = useState("feed");
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState(savedSession?.user?.id || null);
  const [suggestions, setSuggestions] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ tracks: [], users: [] });
  const [pendingTrackId, setPendingTrackId] = useState("");
  const [status, setStatus] = useState("");
  const [playlists, setPlaylists] = useState([]);
  const [sharedPlaylistKey, setSharedPlaylistKey] = useState(null);
  const [spotifyError, setSpotifyError] = useState("");
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(!!savedSession);
  const skipNextRefreshRef = useRef(false);

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
    if (skipNextRefreshRef.current) {
      skipNextRefreshRef.current = false;
      return;
    }
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
    setPosts(feedData.posts || []);
    setTrending(trendingData.posts || []);
    setTracks(trackData.tracks || []);
    setProfile(profileData.user || null);
    setSuggestions(suggestionData.users || []);
    setGlobalLoading(false);
  }

  async function refreshProfile(profileId = selectedProfileId || session.user.id) {
    const profileData = await getProfile(session.token, profileId);
    setProfile(profileData.user);
  }

  async function handleLogin(username, password) {
    const payload = await login(username, password);
    setGlobalLoading(true);
    setSelectedProfileId(payload.user.id);
    setSession({ token: payload.token, user: payload.user, offline: payload.offline });
    setStatus(payload.offline ? "Local demo mode" : "Connected to Java API");
  }

  async function handleRegister(form) {
    const payload = await register(form.displayName, form.username, form.password, form.genres, form.photoUrl);
    setGlobalLoading(true);
    setSelectedProfileId(payload.user.id);
    setSession({ token: payload.token, user: payload.user, offline: payload.offline });
    setStatus(payload.offline ? "Local demo mode" : "Connected to Java API");
  }

  async function handleUpdatePhoto(photoUrl) {
    setStatus("Fotoğraf yükleniyor…");
    try {
      await updateProfile(session.token, { photoUrl }, session.user);
      const updatedUser = { ...session.user, photoUrl };
      skipNextRefreshRef.current = true;
      setSession((prev) => ({ ...prev, user: updatedUser }));
      setProfile((prev) => (prev ? { ...prev, photoUrl } : prev));
      const uid = session.user.id;
      const patchUser = (u) => (u.id === uid ? { ...u, photoUrl } : u);
      setPosts((prev) => prev.map((p) => ({ ...p, user: patchUser(p.user) })));
      setTrending((prev) => prev.map((p) => ({ ...p, user: patchUser(p.user) })));
      setStatus("Profil fotoğrafı güncellendi ✓");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus("Fotoğraf yüklenemedi: " + (err?.message || "Bilinmeyen hata"));
    }
  }

  async function handleUpdateUsername(newUsername) {
    await updateProfile(session.token, { username: newUsername }, session.user);
    const updatedUser = { ...session.user, username: newUsername };
    // Write session to localStorage immediately (don't rely on React effects)
    try {
      localStorage.setItem("vibe-session", JSON.stringify({ ...session, user: updatedUser }));
    } catch {}
    // 1. Re-read everything from localStorage FIRST (so UI is consistent before session update)
    const profileId = selectedProfileId || session.user.id;
    await refreshAll(session.token, session.user.id, profileId);
    // 2. THEN update session; skipNextRefreshRef prevents the useEffect from calling refreshAll again
    skipNextRefreshRef.current = true;
    setSession((prev) => ({ ...prev, user: updatedUser }));
  }

  async function handleCreatePost(payload) {
    const created = await createPost(session.token, payload, session.user);
    setPosts((current) => [created.post, ...current]);
    const [trend, viewedProfile] = await Promise.all([
      getTrending(session.token),
      getProfile(session.token, selectedProfileId || session.user.id),
    ]);
    setTrending(trend.posts);
    setProfile(viewedProfile.user);
  }

  async function handleLike(postId) {
    // Optimistic update: flip the heart immediately so the UI feels instant,
    // then sync with the backend in the background and reconcile.
    const optimistic = (post) => {
      if (post.id !== postId) return post;
      const liked = !post.likedByMe;
      return {
        ...post,
        likedByMe: liked,
        likeCount: Math.max(0, (post.likeCount || 0) + (liked ? 1 : -1)),
      };
    };
    const applyOptimistic = (items = []) => items.map(optimistic);
    setPosts(applyOptimistic);
    setTrending(applyOptimistic);
    setProfile((current) =>
      current ? { ...current, posts: applyOptimistic(current.posts || []) } : current
    );

    try {
      const payload = await likePost(session.token, postId, session.user);
      if (payload.post) {
        // Reconcile feed/profile with the server's authoritative counts.
        const reconcile = (items = []) =>
          items.map((post) => (post.id === postId ? payload.post : post));
        setPosts(reconcile);
        setProfile((current) =>
          current ? { ...current, posts: reconcile(current.posts || []) } : current
        );
      }
      // Refresh trending order in the background (does not block the heart).
      getTrending(session.token)
        .then((trend) => setTrending(trend.posts))
        .catch(() => {});
    } catch (err) {
      // Revert the optimistic change on failure.
      setPosts(applyOptimistic);
      setTrending(applyOptimistic);
      setProfile((current) =>
        current ? { ...current, posts: applyOptimistic(current.posts || []) } : current
      );
      setStatus("Beğeni kaydedilemedi: " + (err?.message || "bilinmeyen hata"));
      setTimeout(() => setStatus(""), 3000);
    }
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

  function handlePostWithTrack(track) {
    setPendingTrackId(String(track.id));
    setView("feed");
  }
  async function handleCreatePlaylist(form) {
  const data = await createPlaylist(session.token, form);
  setPlaylists((prev) => [data.playlist, ...prev]);
}
  async function handleDeletePlaylist(playlistId) {
  await deletePlaylist(session.token, playlistId);
  setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
}
  async function handleLikePlaylist(playlistId) {
  const data = await likePlaylist(session.token, playlistId);
  if (data.playlist) {
    setPlaylists((prev) => prev.map((p) => p.id === playlistId ? data.playlist : p));
  }
}
  async function handleAddTrackToPlaylist(playlistId, track) {
  const data = await addTrackToPlaylist(session.token, playlistId, track);
  if (data.playlist) {
    setPlaylists((prev) => prev.map((p) => p.id === playlistId ? data.playlist : p));
  }
}
  async function handleRemoveTrackFromPlaylist(playlistId, trackId) {
  const data = await removeTrackFromPlaylist(session.token, playlistId, trackId);
  if (data.playlist) {
    setPlaylists((prev) => prev.map((p) => p.id === playlistId ? data.playlist : p));
  }
}
 
  
  async function handleDeletePost(postId) {
    await deletePost(session.token, postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setTrending((prev) => prev.filter((p) => p.id !== postId));
  }

  async function handleFollow(userId) {
    await followUser(session.token, userId, session.user);
    const [suggestionData, profileData] = await Promise.all([
      getSuggestions(session.token),
      getProfile(session.token, selectedProfileId || session.user.id),
    ]);
    setSuggestions(suggestionData.users);
    setProfile(profileData.user);
  }

  async function handleUnfollow(userId) {
    await unfollowUser(session.token, userId, session.user);
    const [suggestionData, profileData] = await Promise.all([
      getSuggestions(session.token),
      getProfile(session.token, selectedProfileId || session.user.id),
    ]);
    setSuggestions(suggestionData.users);
    setProfile(profileData.user);
  }

  async function handleOpenPost(postId) {
    setPageLoading(true);
    setPrevView(view);
    setSelectedPostId(postId);
    setView("post");
    // Fetch the post so we know when data is ready, then hide the page loader
    await getPost(session.token, postId);
    setPageLoading(false);
  }

  async function openProfile(userId) {
    setPageLoading(true);
    setSelectedProfileId(userId);
    setView("profile");
    const profileData = await getProfile(session.token, userId);
    setProfile(profileData.user);
    setPageLoading(false);
  }

  function openOwnProfile() {
    openProfile(session.user.id);
  }

  function logout() {
    localStorage.removeItem("vibe-session");
    setSession(null);
    setSelectedProfileId(null);
    setProfile(null);
    setPosts([]);
    setTrending([]);
    setPlayer(null);
    setDeviceId(null);
    setPlayingTrackId(null);
    setIsPlaying(false);
    setShowLanding(true);
  }

  if (globalLoading) {
    return <FullPageLoader />;
  }

  if (!session) {
    if (showLanding) {
      return <LandingPage onEnter={() => setShowLanding(false)} />;
    }
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} spotifyError={spotifyError} onBack={() => setShowLanding(true)} />;
  }

  const activePosts = view === "trending" ? trending : posts;
  const activeSpotifyId = isPlaying ? playingTrackId : null;
  const heading =
    view === "post" ? "Post"
    : view === "trending" ? "Trending now"
    : view === "profile"
      ? profile?.id === session.user.id ? "Your profile" : profile?.displayName || "Profile"
      : view === "search" ? "Search"
      : "Home feed";

  return (
    <div className="app-shell">
      <Sidebar
  view={view}
  setView={setView}
  user={session.user}
  onLogout={logout}
  onOwnProfile={openOwnProfile}
  onOpenPlaylists={async () => {
    setView("playlists");
    const data = await getPlaylists(session.token, session.user.id);
    setPlaylists(data.playlists || []);
  }}
/>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Vibe radar</p>
            <h1>{heading}</h1>
          </div>
          <form className="search-pill" onSubmit={handleSearch}>
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Vibe" placeholder="Search..." />
          </form>
        </header>

        {status && <div className="status-strip">{status}</div>}

        {pageLoading ? (
          <PageLoader />
        ) : view === "post" ? (
          <PostDetailView
            postId={selectedPostId}
            token={session.token}
            currentUser={session.user}
            onBack={() => setView(prevView)}
            onLike={handleLike}
            onNavigate={openProfile}
            activeSpotifyId={activeSpotifyId}
            onDelete={handleDeletePost}
          />
        ) : view === "profile" ? (
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
            onDelete={handleDeletePost}
            onOpenPost={handleOpenPost}
            onUpdatePhoto={handleUpdatePhoto}
            onUpdateUsername={handleUpdateUsername}
          />
      ) : view === "search" ? (
          <SearchView
            results={results}
            posts={posts}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onNavigate={openProfile}
            onPostWithTrack={handlePostWithTrack}
            onLike={handleLike}
            onOpenPost={handleOpenPost}
            currentUser={session.user}
            token={session.token}
          />
        ) : view === "playlists" ? (
          <PlaylistsView
            playlists={playlists}
            currentUser={session.user}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onLikePlaylist={handleLikePlaylist}
            onAddTrack={handleAddTrackToPlaylist}
            onRemoveTrack={handleRemoveTrackFromPlaylist}
            tracks={tracks}
            isOwnProfile={true}
            spotifyToken={session.spotifyToken}
          />
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
            onOpenPost={handleOpenPost}
            pendingTrackId={pendingTrackId}
            onClearPendingTrack={() => setPendingTrackId("")}
          />
        )}
      </main>
    </div>
  );
}

// ─── Spotify SVG glyph (inline, matches design) ───────────────────
function SpotifyIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.62.62 0 0 1-.86.21c-2.35-1.44-5.3-1.76-8.79-.96a.62.62 0 1 1-.28-1.22c3.82-.87 7.09-.5 9.72 1.11.3.18.39.57.21.86zm1.23-2.74a.78.78 0 0 1-1.07.26c-2.69-1.65-6.79-2.13-9.97-1.17a.78.78 0 1 1-.45-1.49c3.63-1.1 8.15-.56 11.24 1.33.37.23.49.71.25 1.07zm.1-2.85C14.84 8.04 9.6 7.86 6.53 8.79a.93.93 0 1 1-.54-1.78c3.52-1.07 9.3-.86 12.97 1.31a.93.93 0 1 1-.95 1.6z"/>
    </svg>
  );
}

function AuthScreen({ onLogin, onRegister, spotifyError, onBack }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    genres: "",
    photoUrl: "",
  });
  const [error, setError] = useState("");
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const photoInputRef = useRef(null);

  function validateUsername(u) {
    if (!u) return "Username is required.";
    if (u.length < 3) return "Username must be at least 3 characters.";
    if (u.length > 20) return "Username can be at most 20 characters.";
    if (/\s/.test(u)) return "Username cannot contain spaces.";
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Only letters, numbers, and underscores are allowed.";
    return null;
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("Fotoğraf çok büyük (maks 20 MB)."); return; }
    try {
      const compressed = await compressImage(file);
      setForm((f) => ({ ...f, photoUrl: compressed }));
    } catch (err) {
      setError(err?.message || "Fotoğraf işlenemedi.");
    }
  }

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
    if (mode === "register") {
      const usernameErr = validateUsername(form.username);
      if (usernameErr) { setError(usernameErr); return; }
    }
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
    <div className="new-auth-shell">
      {/* Background glows */}
      <div className="auth-glow auth-glow-tl" />
      <div className="auth-glow auth-glow-br" />

      <div className="new-auth-stage">
        {/* LEFT — brand panel */}
        <div className="new-brand-panel">
          <div className="new-appicon">
            <VibeMark size={42} color="#fff" />
          </div>
          <span className="new-pill">
            <span className="new-pill-dot" />
            Now in early access
          </span>
          <h1 className="new-auth-wordmark">Vibe</h1>
          <p className="new-auth-tag">Post the track, mood, and moment — before it disappears.</p>
          <div className="new-covers">
            <div className="new-cov" style={{ backgroundImage: "linear-gradient(160deg, rgba(255,100,70,.18) 0%, rgba(180,42,100,.24) 55%, rgba(44,16,72,.38) 100%), url('https://upload.wikimedia.org/wikipedia/en/3/3f/Night_Visions_Album_Cover.jpeg')" }}>
              <span className="new-cov-mood">late-night</span>
              <div className="new-cov-label">
                Night Visions<span>Imagine Dragons</span>
              </div>
            </div>
            <div className="new-cov" style={{ backgroundImage: "linear-gradient(160deg, rgba(20,130,240,.18) 0%, rgba(28,200,155,.22) 70%), url('https://upload.wikimedia.org/wikipedia/en/f/f6/Taylor_Swift_-_1989.png')" }}>
              <span className="new-cov-mood">focus</span>
              <div className="new-cov-label">
                1989<span>Taylor Swift</span>
              </div>
            </div>
            <div className="new-cov" style={{ backgroundImage: "linear-gradient(160deg, rgba(110,90,255,.18) 0%, rgba(24,200,230,.22) 100%), url('https://upload.wikimedia.org/wikipedia/en/3/3d/Coldplay_-_A_Head_Full_of_Dreams.png')" }}>
              <span className="new-cov-mood">calm</span>
              <div className="new-cov-label">
                A Head Full of Dreams<span>Coldplay</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — auth card */}
        <form className="new-auth-card" onSubmit={submit}>
          {onBack && (
            <button type="button" className="new-auth-back" onClick={onBack}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          {/* Tabs */}
          <div className="new-auth-tabs">
            <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>
              Log in
            </button>
            <button type="button" className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setError(""); }}>
              Register
            </button>
          </div>

          {mode === "register" && (
            <>
              {/* ── Profile photo upload ── */}
              <div className="avatar-upload-wrap">
                <button
                  type="button"
                  className="avatar-upload-circle"
                  onClick={() => photoInputRef.current?.click()}
                  title="Upload profile photo"
                >
                  {form.photoUrl ? (
                    <img src={form.photoUrl} alt="Preview" />
                  ) : (
                    <Camera size={22} style={{ color: "var(--vibe-faint)" }} />
                  )}
                </button>
                <span className="avatar-upload-label">Profile photo (optional)</span>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="new-field">
                <label>Display name</label>
                <div className="new-inp">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>
                  <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Your name" />
                </div>
              </div>
            </>
          )}

          <div className="new-field">
            <label>Username</label>
            <div className="new-inp">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })}
                placeholder="username"
                autoComplete="username"
                spellCheck="false"
                autoCapitalize="none"
              />
            </div>
            {mode === "register" && (
              <span style={{ fontSize: "11px", color: "var(--vibe-faint)", marginTop: "4px", display: "block" }}>
                3–20 chars · letters, numbers, underscores only
              </span>
            )}
          </div>

          <div className="new-field">
            <label>Password</label>
            <div className="new-inp">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </div>
          </div>

          {mode === "register" && (
            <div className="new-field">
              <label>Favorite genres</label>
              <div className="new-inp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="e.g. Synth Pop, Jazz, Electronic" />
              </div>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          <button className="new-btn-primary" type="submit">
            <Sparkles size={18} />
            {mode === "login" ? "Enter Vibe" : "Create account"}
          </button>

          <div className="new-or">OR</div>

          <button type="button" className="new-btn-spotify" onClick={handleSpotifyLogin} disabled={spotifyLoading}>
            <SpotifyIcon size={18} />
            {spotifyLoading ? "Redirecting…" : "Continue with Spotify"}
          </button>

          {spotifyError && <p className="error-text">{spotifyError}</p>}

          <p className="new-auth-alt">
            {mode === "login" ? (
              <>New to Vibe? <button type="button" onClick={() => { setMode("register"); setError(""); }}>Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => { setMode("login"); setError(""); }}>Log in</button></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}

// ─── Landing Page ──────────────────────────────────────────────────
function LandingPage({ onEnter }) {
  return (
    <div className="landing">
      {/* Background auras */}
      <div className="landing-aura landing-aura-tr" />
      <div className="landing-aura landing-aura-bl" />

      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-wrap landing-nav-in">
          <div className="landing-brand">
            <span className="landing-logo-tile">
              <VibeMark size={20} color="#2dd4bf" />
            </span>
            Vibe
          </div>
          <div className="landing-nav-links">
            <a href="#features">Features</a>
            <a href="#preview">The feed</a>
            <a href="#how">How it works</a>
            <a href="#community">Community</a>
          </div>
          <div className="landing-nav-cta">
            <button className="landing-btn landing-btn-ghost" onClick={onEnter}>Log in</button>
            <button className="landing-btn landing-btn-solid" onClick={onEnter}>Get Vibe</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="landing-hero-wrap">
        <div className="landing-wrap landing-hero">
          <div className="landing-hero-left">
            <span className="landing-pill">
              <span className="landing-pill-dot" />
              Now in early access · Web &amp; Mobile
            </span>
            <h1 className="landing-h1">
              The song is<br />the <span className="landing-grad">whole post.</span>
            </h1>
            <p className="landing-lede">
              Vibe is the social app built for one thing — sharing the track you can't stop playing, the mood it puts you in, and the moment before it disappears.
            </p>
            <div className="landing-hero-cta">
              <button className="landing-btn landing-btn-solid landing-btn-lg landing-btn-spotify" onClick={onEnter}>
                <SpotifyIcon size={18} />
                Continue with Spotify
              </button>
              <button className="landing-btn landing-btn-out landing-btn-lg" onClick={onEnter}>
                Get started free
              </button>
            </div>
            <div className="landing-hero-meta">
              <div className="landing-avs">
                <span style={{ background: "linear-gradient(135deg,#2dd4bf,#5aa8ff)" }}>L</span>
                <span style={{ background: "linear-gradient(135deg,#5aa8ff,#7b6cff)" }}>M</span>
                <span style={{ background: "linear-gradient(135deg,#ffb74d,#ff7a59)" }}>N</span>
                <span style={{ background: "linear-gradient(135deg,#2dd4bf,#23d3a3)" }}>K</span>
              </div>
              Join thousands sharing what's in their headphones
            </div>
          </div>

          {/* Phone mock */}
          <div className="landing-phone-stage">
            <div className="landing-phone-glow" />
            <div className="landing-phone">
              <div className="landing-notch" />
              <div className="landing-screen">
                <div className="landing-app-top">
                  <div className="landing-app-eyebrow">VIBE RADAR</div>
                  <div className="landing-app-title">Home feed</div>
                </div>
                <div className="landing-seg">
                  <span className="on">Following</span>
                  <span>Hot</span>
                  <span>Nearby</span>
                </div>
                <div className="landing-post-card">
                  <div className="landing-post-cover" style={{ backgroundImage: "linear-gradient(160deg, rgba(255,100,70,.48), rgba(180,42,100,.58) 55%, rgba(44,16,72,.76) 100%), url('https://upload.wikimedia.org/wikipedia/en/3/33/Night_visions.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />
                  <div className="landing-post-info">
                    <div className="landing-post-user">
                      <span className="landing-pa" style={{ background: "#5aa8ff" }}>E</span>
                      <div>
                        <div className="landing-pa-name">Emir</div>
                        <div className="landing-pa-handle">@emir · Late-night</div>
                      </div>
                    </div>
                    <div className="landing-post-track">Night Visions</div>
                    <div className="landing-post-artist">Imagine Dragons — Night Visions</div>
                    <p className="landing-post-cap">This track is carrying the whole evening.</p>
                    <div className="landing-chiplets">
                      <span className="landing-chiplet landing-chiplet-like">♥ 24</span>
                      <span className="landing-chiplet">▶</span>
                      <span className="landing-chiplet">💬 2</span>
                      <span className="landing-chiplet">Spotify</span>
                    </div>
                  </div>
                </div>
                <div className="landing-post-card">
                  <div className="landing-post-cover" style={{ backgroundImage: "linear-gradient(160deg, rgba(20,130,240,.44), rgba(28,200,155,.54) 70%), url('https://upload.wikimedia.org/wikipedia/en/f/f6/Taylor_Swift_-_1989.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
                  <div className="landing-post-info">
                    <div className="landing-post-user">
                      <span className="landing-pa" style={{ background: "#2dd4bf", color: "#04130f" }}>L</span>
                      <div>
                        <div className="landing-pa-name">Luna Vale</div>
                        <div className="landing-pa-handle">@luna · Focus</div>
                      </div>
                    </div>
                    <div className="landing-post-track">Amsterdam</div>
                    <div className="landing-post-artist">Imagine Dragons — Night Visions</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Strip */}
        <div className="landing-strip">
          <div className="landing-wrap landing-strip-in">
            <span>POST THE TRACK</span>
            <span className="landing-strip-sep">/</span>
            <span>TAG THE MOOD</span>
            <span className="landing-strip-sep">/</span>
            <span>CATCH THE MOMENT</span>
            <span className="landing-strip-sep">/</span>
            <span>BEFORE IT DISAPPEARS</span>
          </div>
        </div>
      </header>

      {/* ── Features ── */}
      <section className="landing-section landing-features" id="features">
        <div className="landing-wrap">
          <div className="landing-sec-head">
            <span className="landing-eyebrow">Why Vibe</span>
            <h2>A feed that finally sounds like you.</h2>
            <p>No endless scroll of nothing. Every post is a song someone's feeling right now — and the conversation around it.</p>
          </div>
          <div className="landing-fgrid">
            <div className="landing-card">
              <div className="landing-card-ic"><Music2 size={23} /></div>
              <h3>Post the track</h3>
              <p>Pull any song straight from Spotify, tag the mood, drop a thought. Posting takes ten seconds.</p>
            </div>
            <div className="landing-card">
              <div className="landing-card-ic"><MessageSquare size={23} /></div>
              <h3>Talk it out</h3>
              <p>React, reply, and argue about songs with people who actually get the reference.</p>
            </div>
            <div className="landing-card">
              <div className="landing-card-ic"><TrendingUp size={23} /></div>
              <h3>Vibe Radar</h3>
              <p>See what's heating up across your circle before it hits everywhere else.</p>
            </div>
            <div className="landing-card">
              <div className="landing-card-ic"><Users size={23} /></div>
              <h3>Find your people</h3>
              <p>Follow taste, not clout. Suggested follows are built on what you actually listen to.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── App Preview ── */}
      <section className="landing-section landing-preview" id="preview">
        <div className="landing-wrap">
          <div className="landing-sec-head">
            <span className="landing-eyebrow">Inside the app</span>
            <h2>Your home feed, live.</h2>
            <p>Search a track, set the mood, and post. Watch Vibe Radar surface the hot tracks and people worth following.</p>
          </div>
          <div className="landing-winwrap">
            <div className="landing-wintop">
              <span className="landing-tl" />
              <span className="landing-tl" />
              <span className="landing-tl" />
              <span className="landing-win-url">app.vibe.fm/home</span>
            </div>
            <div className="landing-applay">
              <div className="landing-rail">
                <span className="landing-rail-logo"><VibeMark size={20} color="#2dd4bf" /></span>
                <span className="landing-ri landing-ri-on"><Home size={20} /></span>
                <span className="landing-ri"><TrendingUp size={20} /></span>
                <span className="landing-ri"><User size={20} /></span>
                <span className="landing-ri"><Search size={20} /></span>
              </div>
              <div className="landing-main">
                <div className="landing-main-eyebrow">VIBE RADAR</div>
                <h3 className="landing-main-title">Home feed</h3>
                <div className="landing-fcard">
                  <div className="landing-fcard-cov" style={{ backgroundImage: "linear-gradient(160deg, rgba(255,100,70,.48), rgba(180,42,100,.58) 55%, rgba(44,16,72,.76) 100%), url('https://upload.wikimedia.org/wikipedia/en/3/33/Night_visions.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />
                  <div>
                    <div className="landing-fcard-user">
                      <span className="landing-pa" style={{ background: "#5aa8ff" }}>E</span>
                      <div>
                        <div className="landing-pa-name">Emir</div>
                        <div className="landing-pa-handle">@emir · Late-night</div>
                      </div>
                    </div>
                    <div className="landing-fcard-track">Night Visions</div>
                    <div className="landing-fcard-artist">Imagine Dragons — Night Visions</div>
                    <p className="landing-fcard-cap">This track is carrying the whole evening.</p>
                    <div className="landing-chiplets">
                      <span className="landing-chiplet landing-chiplet-like">♥ 2</span>
                      <span className="landing-chiplet">▶</span>
                      <span className="landing-chiplet">💬 2</span>
                      <span className="landing-chiplet">Spotify</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing-side">
                <div className="landing-sb">
                  <h5><Flame size={16} />Hot tracks</h5>
                  <div className="landing-hot"><span className="landing-rk">1</span><span className="landing-th" style={{ backgroundImage: "linear-gradient(135deg,rgba(255,100,70,.2),rgba(180,42,100,.25)), url('https://upload.wikimedia.org/wikipedia/en/3/3f/Night_Visions_Album_Cover.jpeg')", backgroundSize: "cover", backgroundPosition: "center" }} /><div><b>Night Visions</b><span>2 likes</span></div></div>
                  <div className="landing-hot"><span className="landing-rk">2</span><span className="landing-th" style={{ backgroundImage: "linear-gradient(135deg,rgba(20,130,240,.2),rgba(28,200,155,.25)), url('https://upload.wikimedia.org/wikipedia/en/f/f6/Taylor_Swift_-_1989.png')", backgroundSize: "cover", backgroundPosition: "center" }} /><div><b>Amsterdam</b><span>0 likes</span></div></div>
                </div>
                <div className="landing-sb">
                  <h5><UserPlus size={16} />Suggested</h5>
                  <div className="landing-sug"><span className="landing-pa" style={{ background: "#2dd4bf", color: "#04130f" }}>L</span><div className="landing-sug-info"><b>Luna Vale</b><span>@luna</span></div><span className="landing-sug-add">+</span></div>
                  <div className="landing-sug"><span className="landing-pa" style={{ background: "#5aa8ff" }}>M</span><div className="landing-sug-info"><b>Mika Sol</b><span>@mika</span></div><span className="landing-sug-add">+</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-section landing-steps" id="how">
        <div className="landing-wrap">
          <div className="landing-sec-head">
            <span className="landing-eyebrow">How it works</span>
            <h2>Three taps to your first vibe.</h2>
          </div>
          <div className="landing-sgrid">
            <div className="landing-step">
              <span className="landing-step-num">01</span>
              <h4>Search a track</h4>
              <p>Connect Spotify and find the song that's living in your head right now.</p>
            </div>
            <div className="landing-step">
              <span className="landing-step-num">02</span>
              <h4>Tag the mood</h4>
              <p>Late-night, focus, heartbreak, hype — set the feeling and add a line.</p>
            </div>
            <div className="landing-step">
              <span className="landing-step-num">03</span>
              <h4>Drop it &amp; go</h4>
              <p>Your vibe hits the feed. Watch the likes, replies, and plays roll in for 24h.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Community ── */}
      <section className="landing-community" id="community">
        <div className="landing-wrap">
          <div className="landing-sec-head">
            <span className="landing-eyebrow">The community</span>
            <h2>People come for the songs, stay for the takes.</h2>
          </div>
          <div className="landing-qgrid">
            <div className="landing-quote">
              <p>"It's the only feed where I actually discover music anymore. Everything I save comes from here now."</p>
              <div className="landing-quote-who">
                <span className="landing-pa" style={{ background: "linear-gradient(135deg,#2dd4bf,#5aa8ff)", color: "#04130f" }}>M</span>
                <div><div className="landing-pa-name">Mika Sol</div><div className="landing-pa-handle">@mika</div></div>
              </div>
            </div>
            <div className="landing-quote">
              <p>"Posting a song and watching strangers vibe with it at 1am is a feeling I didn't know I needed."</p>
              <div className="landing-quote-who">
                <span className="landing-pa" style={{ background: "linear-gradient(135deg,#5aa8ff,#7b6cff)" }}>N</span>
                <div><div className="landing-pa-name">Nova Hart</div><div className="landing-pa-handle">@nova</div></div>
              </div>
            </div>
            <div className="landing-quote">
              <p>"No followers to chase, no algorithm to game. Just good taste finding good taste."</p>
              <div className="landing-quote-who">
                <span className="landing-pa" style={{ background: "linear-gradient(135deg,#ffb74d,#ff7a59)" }}>K</span>
                <div><div className="landing-pa-name">Kai Rivers</div><div className="landing-pa-handle">@kai</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="landing-section landing-cta-section">
        <div className="landing-wrap">
          <div className="landing-cta-box">
            <div className="landing-cta-glow" />
            <span className="landing-eyebrow">Your turn</span>
            <h2 className="landing-cta-h2">What are you<br />playing right now?</h2>
            <p className="landing-cta-p">Post it before it disappears. Join the people sharing the soundtrack to their day.</p>
            <div className="landing-cta-row">
              <button className="landing-btn landing-btn-solid landing-btn-lg landing-btn-spotify" onClick={onEnter}>
                <SpotifyIcon size={18} />
                Continue with Spotify
              </button>
              <button className="landing-btn landing-btn-out landing-btn-lg" onClick={onEnter}>
                Get started free
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-wrap">
          <div className="landing-foot">
            <div className="landing-foot-brand">
              <div className="landing-brand">
                <span className="landing-logo-tile"><VibeMark size={20} color="#2dd4bf" /></span>
                Vibe
              </div>
              <p>Post the track, mood, and moment — before it disappears.</p>
            </div>
            <div className="landing-fcols">
              <div className="landing-fcol">
                <h5>Product</h5>
                <a href="#features">Features</a>
                <a href="#preview">Vibe Radar</a>
                <a href="#" onClick={onEnter}>Get started</a>
              </div>
              <div className="landing-fcol">
                <h5>Company</h5>
                <a href="#">About</a>
                <a href="#">Careers</a>
                <a href="#">Press</a>
              </div>
              <div className="landing-fcol">
                <h5>Connect</h5>
                <a href="#">Instagram</a>
                <a href="#">TikTok</a>
                <a href="#">X / Twitter</a>
              </div>
            </div>
          </div>
          <div className="landing-copyright">
            <span>© 2026 Vibe Labs</span>
            <span className="landing-mono">made for people with taste</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Sidebar({ view, setView, user, onLogout, onOwnProfile, onOpenPlaylists }) {
 const items = [
    ["feed", Home, "Feed", () => setView("feed")],
    ["trending", TrendingUp, "Trending", () => setView("trending")],
    ["profile", User, "Profile", onOwnProfile],
    ["search", Search, "Search", () => setView("search")],
    ["playlists", ListMusic, "Playlists", onOpenPlaylists],
  ];

  return (
    <aside className="sidebar">
      {/* Gradient logo tile with VibeMark */}
      <button className="logo-mark" onClick={() => setView("feed")} title="Vibe home">
        <VibeMark size={19} color="currentColor" />
      </button>

      {/* Icon-only nav */}
      <div className="nav-icons">
        {items.map(([key, Icon, label, action]) => (
          <button key={key} className={`nav-icon${view === key ? " on" : ""}`} onClick={action} title={label}>
            <Icon size={20} />
          </button>
        ))}
      </div>

      {/* User footer */}
      <div className="sidenav-foot">
        <button className="sidenav-user-av" onClick={onOwnProfile} title="Your profile">
          <Avatar user={user} />
        </button>
        <span className="user-label">{user.username}</span>
        <button className="logout-btn" onClick={onLogout} title="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}

function FeedView({ posts, tracks, suggestions, trending, isTrending, onCreate, onLike, onFollow, onNavigate, spotifyToken, onPlay, activeSpotifyId, token, currentUser, onDelete, onOpenPost, pendingTrackId, onClearPendingTrack }) {
  return (
    <div className="content-grid">
      <section className="feed-column">
        {!isTrending && <Composer tracks={tracks} onCreate={onCreate} spotifyToken={spotifyToken} pendingTrackId={pendingTrackId} onClearPendingTrack={onClearPendingTrack} />}
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
              onOpenPost={onOpenPost}
            />
          ))}
        </div>
      </section>

      <aside className="insight-column">
        <Panel title="Hot tracks" icon={Flame}>
          {trending.slice(0, 5).map((post, index) => (
            <MiniTrack key={post.id} post={post} rank={index + 1} />
          ))}
        </Panel>
        <Panel title="Suggested follows" icon={UserPlus}>
          {suggestions.slice(0, 4).map((u) => (
            <div className="suggestion-row" key={u.id}>
              <button className="avatar-button" onClick={() => onNavigate(u.id)} title={`Open ${u.username}`}>
                <Avatar user={u} />
              </button>
              <button className="name-button" onClick={() => onNavigate(u.id)}>
                <strong>{u.displayName}</strong>
                <span>@{u.username}</span>
              </button>
              <button onClick={() => onFollow(u.id)} title={`Follow ${u.username}`}>
                <Plus size={15} />
              </button>
            </div>
          ))}
        </Panel>
      </aside>
    </div>
  );
}

function Composer({ tracks, onCreate, spotifyToken, pendingTrackId, onClearPendingTrack }) {
  const [trackId, setTrackId] = useState("");
  const [mood, setMood] = useState("");
  const [caption, setCaption] = useState("");
  const [submitError, setSubmitError] = useState("");

  // When a track is selected from search, pre-fill the selector
  useEffect(() => {
    if (pendingTrackId) {
      setTrackId(pendingTrackId);
      setSpotifyTrack(null);
      onClearPendingTrack?.();
    }
  }, [pendingTrackId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [spotifyTrack, setSpotifyTrack] = useState(null);
  const [searching, setSearching] = useState(false);

  const searchTimerRef = useRef(null);
  const localTrack = useMemo(
    () => tracks.find((t) => t.id === Number(trackId)) || tracks[0],
    [tracks, trackId]
  );
  const activeTrack = spotifyTrack || localTrack;

  // Only show a real cover when the user has explicitly chosen something
  const hasExplicitSelection = spotifyTrack !== null || trackId !== "";
  const coverUrl = hasExplicitSelection ? (activeTrack?.coverUrl || "") : "";

  if (!activeTrack && !spotifyToken) return null;

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
    const hasTrack = spotifyTrack || trackId;
    if (!hasTrack && !caption.trim()) {
      setSubmitError("You should write something!");
      return;
    }
    setSubmitError("");
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
      : trackId
        ? { trackId: localTrack?.id, mood, caption }
        : { mood, caption };
    await onCreate(payload);
    setCaption("");
    setMood("");
    setTrackId("");
    setSpotifyTrack(null);
    setSpotifyResults([]);
    setSpotifyQuery("");
  }

  return (
    <form className="composer" onSubmit={submit}>
      {coverUrl ? (
        <img src={coverUrl} alt={activeTrack?.title || "Track"} />
      ) : (
        <div className="composer-placeholder">?</div>
      )}

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
              <button key={track.spotifyId} type="button" className="spotify-result-item" onClick={() => selectSpotifyTrack(track)}>
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
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
              <option value="" disabled>What's next?</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>
              ))}
            </select>
          )}
          <input value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Mood" placeholder="Emotions?" />
        </div>
        <textarea value={caption} onChange={(e) => { setCaption(e.target.value); if (submitError) setSubmitError(""); }} aria-label="Caption" placeholder="What are you thinking?" />
        {submitError && <div className="composer-error">{submitError}</div>}
      </div>

      {/* Post button — 3rd grid column, aligns to bottom of fields */}
      <button className="icon-primary" type="submit" title="Post vibe">
        <Plus size={20} />
      </button>
    </form>
  );
}

function PostCard({ post, rank, onLike, onNavigate, onOpenPost, onPlay, activeSpotifyId, token, currentUser, onDelete }) {
  const spotifyId = post.track?.spotifyId;
  const [showEmbed, setShowEmbed] = useState(false);
  const isPostOwner = currentUser && post.user.id === currentUser.id;

  function handleCardClick() {
    if (onOpenPost) onOpenPost(post.id);
  }

  return (
    <article className={`post-card${post.track ? "" : " no-track"}`} onClick={handleCardClick}>
      {rank && <div className="rank-badge">#{rank}</div>}

      {/* Album art — only when track exists */}
      {post.track && (
        <div className="post-art">
          <img src={post.track.coverUrl} alt={`${post.track.title} cover`} />
        </div>
      )}

      <div className="post-body">
        {/* User meta */}
        <div className="post-meta">
          <button
            className="chip-avatar-btn"
            onClick={(e) => { e.stopPropagation(); onNavigate(post.user.id); }}
            title={`Open ${post.user.username}`}
          >
            <Avatar user={post.user} />
          </button>
          <div>
            <div className="post-user">{post.user.displayName}</div>
            <div className="post-handle">@{post.user.username} · {post.mood}</div>
          </div>
        </div>

        {/* Track info */}
        {post.track && (
          <>
            <div className="post-track">{post.track.title}</div>
            <div className="post-album">{post.track.artist} — {post.track.album}</div>
          </>
        )}
        <p className="post-caption">{post.caption}</p>

        {/* Spotify embed */}
        {showEmbed && spotifyId && (
          <iframe
            className="spotify-embed"
            src={`https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        )}

        {/* Chip action row */}
        <div className="chips">
          <button
            className={`chip love${post.likedByMe ? " loved" : ""}`}
            onClick={(e) => { e.stopPropagation(); onLike(post.id); }}
            title={post.likedByMe ? "Unlike" : "Like"}
          >
            <Heart size={12} fill={post.likedByMe ? "currentColor" : "none"} />
            {post.likeCount}
          </button>

          {spotifyId && (
            <button
              className="chip"
              onClick={(e) => { e.stopPropagation(); setShowEmbed((p) => !p); }}
              title={showEmbed ? "Hide player" : "Play"}
            >
              {showEmbed ? <Pause size={12} /> : <Play size={12} />}
            </button>
          )}

          <button
            className="chip"
            onClick={(e) => { e.stopPropagation(); if (onOpenPost) onOpenPost(post.id); }}
            title="View replies"
          >
            <MessageSquare size={12} />
            {post.commentCount || 0}
          </button>

          {post.track?.genre && <span className="chip src">{post.track.genre}</span>}
          <span className="chip dt">{formatDate(post.createdAt)}</span>

          {isPostOwner && onDelete && (
            <button
              className="chip del"
              onClick={(e) => { e.stopPropagation(); onDelete(post.id); }}
              title="Delete post"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PostDetailView({ postId, token, currentUser, onBack, onLike, onNavigate, activeSpotifyId, onDelete, onLoaded }) {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Set of comment IDs whose direct replies are expanded
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    setPost(null);
    setComments([]);
    setExpanded(new Set());
    Promise.all([getPost(token, postId), getComments(token, postId)]).then(([pd, cd]) => {
      setPost(pd.post);
      setComments(cd.comments || []);
      onLoaded?.();
    });
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPostOwner = currentUser && post && Number(post.user.id) === Number(currentUser.id);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submitReply(parentId) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const data = await addComment(token, postId, replyText.trim(), currentUser, parentId || null);
      setComments((prev) => [...prev, data.comment]);
      setPost((p) => (p ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p));
      // Auto-expand the parent so the new reply is immediately visible
      if (parentId) setExpanded((prev) => new Set([...prev, Number(parentId)]));
      setReplyText("");
      setReplyingTo(null);
    } catch {
      setError("Session expired — please log out and log back in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLikeComment(commentId) {
    const data = await likeComment(token, postId, commentId);
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...data } : c)));
  }

  async function handleDeleteComment(commentId) {
    await deleteComment(token, postId, commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setPost((p) => (p ? { ...p, commentCount: Math.max(0, (p.commentCount || 0) - 1) } : p));
  }

  // Render a comment card + its expandable replies (recursive)
  function renderComment(c) {
    const canDelete = currentUser && (Number(c.user.id) === Number(currentUser.id) || isPostOwner);
    const isReplying = replyingTo === c.id;
    const isExpanded = expanded.has(Number(c.id));
    const directReplies = comments.filter((x) => Number(x.parentId) === Number(c.id));
    const hasReplies = directReplies.length > 0;
    const parentComment = c.parentId ? comments.find((x) => Number(x.id) === Number(c.parentId)) : null;

    return (
      <div key={c.id} className="cc-group">
        {/* ── Comment card (click body to expand replies) ── */}
        <div
          className={`cc-card${hasReplies ? " has-replies" : ""}${isExpanded ? " expanded" : ""}`}
          onClick={hasReplies ? () => toggleExpand(c.id) : undefined}
          role={hasReplies ? "button" : undefined}
        >
          {/* Avatar */}
          <button
            className="avatar-button cc-avatar"
            onClick={(e) => { e.stopPropagation(); onNavigate(c.user.id); }}
            title={`View ${c.user.displayName}'s profile`}
          >
            <Avatar user={c.user} />
          </button>

          {/* Content */}
          <div className="cc-content">
            <div className="cc-header">
              <button className="cc-name" onClick={(e) => { e.stopPropagation(); onNavigate(c.user.id); }}>
                {c.user.displayName}
              </button>
              <span className="cc-handle">@{c.user.username}</span>
              <span className="cc-time">· {formatDate(c.createdAt)}</span>
              {canDelete && (
                <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteComment(c.id); }} title="Delete">
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* "Replying to @user" — always visible so context is clear */}
            {parentComment && (
              <p className="cc-replying-to">
                Replying to{" "}
                <button onClick={(e) => { e.stopPropagation(); onNavigate(parentComment.user.id); }}>
                  @{parentComment.user.username}
                </button>
              </p>
            )}

            <p className="cc-text">{c.content}</p>

            <div className="cc-actions">
              <button
                className={`comment-like-btn${c.likedByMe ? " liked" : ""}`}
                onClick={(e) => { e.stopPropagation(); handleLikeComment(c.id); }}
                disabled={!token}
              >
                <Heart size={14} fill={c.likedByMe ? "currentColor" : "none"} />
                {c.likeCount > 0 && <span>{c.likeCount}</span>}
              </button>

              {token && (
                <button
                  className={`comment-reply-btn${isReplying ? " active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setReplyingTo(isReplying ? null : c.id); setReplyText(""); }}
                >
                  <MessageSquare size={13} /><span>Reply</span>
                </button>
              )}

              {/* Reply count chip — also acts as expand toggle */}
              {hasReplies && (
                <span className="cc-reply-count" onClick={(e) => { e.stopPropagation(); toggleExpand(c.id); }}>
                  <MessageSquare size={12} />
                  {directReplies.length} {directReplies.length === 1 ? "reply" : "replies"}
                  <span className="cc-chevron">{isExpanded ? "▲" : "▼"}</span>
                </span>
              )}
            </div>

            {/* Inline reply form */}
            {isReplying && (
              <div className="inline-reply-form" onClick={(e) => e.stopPropagation()}>
                {currentUser && <Avatar user={currentUser} />}
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to @${c.user.username}…`}
                  autoFocus
                  disabled={submitting}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(c.id); } }}
                />
                <button onClick={(e) => { e.stopPropagation(); submitReply(c.id); }} disabled={submitting || !replyText.trim()}>
                  <Plus size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Direct replies — only for THIS comment, visible when expanded ── */}
        {isExpanded && hasReplies && (
          <div className="cc-replies">
            {directReplies.map((r) => renderComment(r))}
          </div>
        )}
      </div>
    );
  }

  const rootComments = comments.filter((c) => !c.parentId);

  return (
    <div className="post-detail-view">
      <div className="post-detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>

      {post ? (
        <PostCard post={post} token={token} currentUser={currentUser} onLike={onLike} onNavigate={onNavigate} activeSpotifyId={activeSpotifyId} onDelete={onDelete} onOpenPost={null} />
      ) : (
        <div className="post-detail-loading">Loading…</div>
      )}

      {/* Top-level reply bar */}
      {token && (
        <div className="detail-reply-composer">
          {currentUser && <Avatar user={currentUser} />}
          <input
            className="detail-reply-input"
            value={replyingTo === null ? replyText : ""}
            onChange={(e) => { setReplyingTo(null); setReplyText(e.target.value); }}
            placeholder="Post your reply…"
            disabled={submitting}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(null); } }}
          />
          <button
            className="detail-reply-send"
            onClick={() => submitReply(null)}
            disabled={submitting || !replyText.trim() || replyingTo !== null}
          >
            Reply
          </button>
        </div>
      )}

      {/* Comment list — each card expands its own replies on click */}
      <div className="tweet-thread">
        {rootComments.map((c) => renderComment(c))}
        {error && <p className="comment-error">{error}</p>}
        {post && comments.length === 0 && <p className="no-replies">No replies yet — be the first!</p>}
      </div>
    </div>
  );
}

function ProfileView({ profile, currentUser, onLike, onNavigate, onFollow, onUnfollow, onPlay, activeSpotifyId, token, onDelete, onOpenPost, onUpdatePhoto, onUpdateUsername }) {
  const photoInputRef = useRef(null);
  const usernameInputRef = useRef(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert("Fotoğraf çok büyük (maks 20 MB)."); return; }
    try {
      const compressed = await compressImage(file);
      onUpdatePhoto?.(compressed);
    } catch (err) {
      alert("Fotoğraf işlenemedi: " + (err?.message || "bilinmeyen hata"));
    }
  }

  function validateUsername(u) {
    if (!u || u.length < 3) return "En az 3 karakter olmalı.";
    if (u.length > 20) return "En fazla 20 karakter olabilir.";
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Sadece harf, rakam ve _ kullanabilirsin.";
    return "";
  }

  function startEditUsername() {
    setUsernameInput(profile.username);
    setUsernameError("");
    setEditingUsername(true);
    setTimeout(() => usernameInputRef.current?.focus(), 50);
  }

  function cancelEditUsername() {
    setEditingUsername(false);
    setUsernameError("");
  }

  async function saveUsername() {
    const trimmed = usernameInput.trim();
    const err = validateUsername(trimmed);
    if (err) { setUsernameError(err); return; }
    if (trimmed === profile.username) { setEditingUsername(false); return; }
    setSavingUsername(true);
    try {
      await onUpdateUsername?.(trimmed);
      setEditingUsername(false);
    } catch (e) {
      setUsernameError(e.message || "Kaydedilemedi.");
    } finally {
      setSavingUsername(false);
    }
  }

  function handleUsernameKeyDown(e) {
    if (e.key === "Enter") saveUsername();
    if (e.key === "Escape") cancelEditUsername();
  }

  if (!profile) {
    return null;
  }

  const isOwnProfile = profile.id === currentUser.id;

  return (
    <div className="profile-layout">
      <section className="profile-hero">
        {isOwnProfile ? (
          <div className="avatar-edit-wrap" onClick={() => photoInputRef.current?.click()} title="Change profile photo">
            <Avatar user={profile} large />
            <div className="avatar-edit-overlay">
              <Camera size={20} />
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
          </div>
        ) : (
          <Avatar user={profile} large />
        )}
        <div className="profile-info">
          {isOwnProfile ? (
            <div className="username-edit-wrap">
              {editingUsername ? (
                <div className="username-edit-row">
                  <span className="username-at">@</span>
                  <input
                    ref={usernameInputRef}
                    className="username-edit-input"
                    value={usernameInput}
                    onChange={(e) => { setUsernameInput(e.target.value.replace(/\s/g, "")); setUsernameError(""); }}
                    onKeyDown={handleUsernameKeyDown}
                    maxLength={20}
                    disabled={savingUsername}
                  />
                  <button className="username-icon-btn confirm" onClick={saveUsername} disabled={savingUsername} title="Kaydet">
                    <Check size={14} />
                  </button>
                  <button className="username-icon-btn cancel" onClick={cancelEditUsername} disabled={savingUsername} title="İptal">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="username-display-row">
                  <span className="profile-handle">@{profile.username}</span>
                  <button className="username-icon-btn edit" onClick={startEditUsername} title="Username değiştir">
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              {usernameError && <div className="username-error">{usernameError}</div>}
            </div>
          ) : (
            <div className="profile-handle">@{profile.username}</div>
          )}
          <div className="profile-name">{profile.displayName}</div>
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
              <UserPlus size={15} />
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

      <div className="post-list">
        {(profile.posts || []).map((post) => (
          <PostCard key={post.id} post={post} onLike={onLike} onNavigate={onNavigate} onPlay={onPlay} activeSpotifyId={activeSpotifyId} token={token} currentUser={currentUser} onDelete={onDelete} onOpenPost={onOpenPost} />
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
        <strong style={{ color: "var(--vibe-ink)", fontSize: "13px" }}>{user.displayName}</strong>
        <small style={{ color: "var(--vibe-faint)", fontSize: "11px" }}>@{user.username}</small>
      </span>
    </button>
  ));
}

function SearchView({ results, posts, onFollow, onUnfollow, onNavigate, onPostWithTrack, onLike, onOpenPost, currentUser, token }) {
  // Posts in the current feed that match any of the found tracks
  const matchedPosts = useMemo(() => {
    if (!results.tracks.length || !posts.length) return [];
    const titles = new Set(results.tracks.map((t) => t.title.toLowerCase()));
    return posts.filter((p) => p.track && titles.has(p.track.title.toLowerCase()));
  }, [results.tracks, posts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Tracks + People ── */}
      <div className="search-grid">
        <Panel title="Tracks" icon={Music2}>
          {results.tracks.length === 0 && <p className="empty-copy">No tracks found.</p>}
          {results.tracks.map((track) => (
            <div className="track-result" key={track.id}>
              <img src={track.coverUrl} alt={`${track.title} cover`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--vibe-ink)", fontSize: "13px" }}>{track.title}</strong>
                <span style={{ fontSize: "11.5px", color: "var(--vibe-faint)" }}>{track.artist}{track.genre ? ` · ${track.genre}` : ""}</span>
              </div>
              <button
                className="chip"
                style={{ color: "var(--vibe-teal)", borderColor: "rgba(46,230,198,.28)", flexShrink: 0, whiteSpace: "nowrap" }}
                onClick={() => onPostWithTrack?.(track)}
                title="Post with this track"
              >
                <Plus size={11} />
                Post
              </button>
            </div>
          ))}
        </Panel>

        <Panel title="People" icon={User}>
          {results.users.length === 0 && <p className="empty-copy">No people found.</p>}
          {results.users.map((u) => (
            <div className="suggestion-row" key={u.id}>
              <button className="avatar-button" onClick={() => onNavigate(u.id)} title={`Open ${u.username}`}>
                <Avatar user={u} />
              </button>
              <button className="name-button" onClick={() => onNavigate(u.id)}>
                <strong style={{ color: "var(--vibe-ink)", fontSize: "13px" }}>{u.displayName}</strong>
                <span style={{ color: "var(--vibe-faint)", fontSize: "11.5px" }}>@{u.username}</span>
              </button>
              {u.isFollowing ? (
                <button className="unfollow-btn" onClick={() => onUnfollow(u.id)} title="Unfollow" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--vibe-faint)" }}>
                  <Users size={15} />
                </button>
              ) : (
                <button onClick={() => onFollow(u.id)} title="Follow">
                  <Plus size={15} />
                </button>
              )}
            </div>
          ))}
        </Panel>
      </div>

      {/* ── Posts with these tracks ── */}
      {matchedPosts.length > 0 && (
        <div>
          <p className="eyebrow" style={{ marginBottom: 14 }}>
            Posts with {results.tracks.length === 1 ? "this track" : "these tracks"}
          </p>
          <div className="post-list">
            {matchedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={onLike}
                onNavigate={onNavigate}
                onOpenPost={onOpenPost}
                token={token}
                currentUser={currentUser}
                onDelete={null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="panel">
      <h2>
        <Icon size={15} />
        {title}
      </h2>
      <div className="panel-list">{children}</div>
    </section>
  );
}

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-ring" />
    </div>
  );
}

function MiniTrack({ post, rank }) {
  if (!post.track) return null;
  return (
    <div className="mini-track">
      <span>{rank}</span>
      <img src={post.track.coverUrl} alt={`${post.track.title} cover`} />
      <div style={{ minWidth: 0 }}>
        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{post.track.title}</strong>
        <small>{post.likeCount} {post.likeCount === 1 ? "like" : "likes"}</small>
      </div>
    </div>
  );
}

function Avatar({ user, large = false }) {
  if (user.photoUrl) {
    return (
      <div className={`avatar ${large ? "large" : ""}`} style={{ overflow: "hidden", background: "var(--vibe-panel-2)" }}>
        <img src={user.photoUrl} alt={user.displayName} />
      </div>
    );
  }
  return (
    <div className={`avatar avatar-${user.avatarKey || "spark"} ${large ? "large" : ""}`}>
      {user.displayName.slice(0, 1)}
    </div>
  );
}

function formatDate(value) {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return "now";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function PlaylistsView({
  playlists,
  currentUser,
  onCreatePlaylist,
  onDeletePlaylist,
  onLikePlaylist,
  onAddTrack,
  onRemoveTrack,
  tracks,
  isOwnProfile,
  spotifyToken,
}) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", isPublic: true });
  const [expandedId, setExpandedId] = useState(null);
  const [showPickerId, setShowPickerId] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef(null);

  async function doSpotifySearch(q) {
    const query = (q ?? pickerQuery).trim();
    if (!query) { setSpotifyResults([]); return; }
    setSearching(true);
    try {
      const results = await searchSpotifyTracks(spotifyToken, query);
      setSpotifyResults(results);
    } finally {
      setSearching(false);
    }
  }

  function handlePickerQueryChange(e) {
    const val = e.target.value;
    setPickerQuery(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSpotifySearch(val), 350);
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    await onCreatePlaylist(form);
    setForm({ title: "", description: "", isPublic: true });
    setShowModal(false);
  }

  async function handleAddSpotifyTrack(playlistId, track) {
    await onAddTrack(playlistId, {
      spotifyTrackId: track.spotifyId,
      spotifyTitle: track.title,
      spotifyArtist: track.artist,
      spotifyAlbum: track.album,
      spotifyCoverUrl: track.coverUrl,
      spotifyPreviewUrl: track.previewUrl || "",
    });
    setShowPickerId(null);
    setPickerQuery("");
    setSpotifyResults([]);
  }

  async function handleAddLocalTrack(playlistId, track) {
    await onAddTrack(playlistId, track.id);
    setShowPickerId(null);
  }

  async function handleCopyShareLink(playlist) {
    const base = window.location.origin + window.location.pathname;
    const url = `${base}?share=${playlist.shareKey}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }

  return (
    <div className="playlists-view">
      {isOwnProfile && (
        <div className="playlists-toolbar">
          <button className="create-playlist-btn" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New playlist
          </button>
        </div>
      )}

      {playlists.length === 0 ? (
        <div className="empty-playlists">
          <ListMusic size={40} style={{ opacity: 0.3 }} />
          <p>No playlists yet.</p>
          {isOwnProfile && (
            <button className="create-playlist-btn" onClick={() => setShowModal(true)}>
              <Plus size={15} /> Create your first playlist
            </button>
          )}
        </div>
      ) : (
        <div className="playlist-grid">
          {playlists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              currentUser={currentUser}
              isOwnProfile={isOwnProfile}
              expanded={expandedId === pl.id}
              onToggle={() => setExpandedId(expandedId === pl.id ? null : pl.id)}
              onLike={() => onLikePlaylist(pl.id)}
              onDelete={() => onDeletePlaylist(pl.id)}
              onRemoveTrack={(trackId) => onRemoveTrack(pl.id, trackId)}
              onShare={() => handleCopyShareLink(pl)}
              showPicker={showPickerId === pl.id}
              onTogglePicker={() => {
                setShowPickerId(showPickerId === pl.id ? null : pl.id);
                setPickerQuery("");
                setSpotifyResults([]);
              }}
              pickerQuery={pickerQuery}
              onPickerQueryChange={handlePickerQueryChange}
              onPickerSearch={() => doSpotifySearch()}
              spotifyResults={spotifyResults}
              searching={searching}
              localTracks={tracks}
              onAddSpotifyTrack={(track) => handleAddSpotifyTrack(pl.id, track)}
              onAddLocalTrack={(track) => handleAddLocalTrack(pl.id, track)}
              spotifyToken={spotifyToken}
            />
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><ListMusic size={18} /> New Playlist</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-form" onSubmit={handleCreateSubmit}>
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="My playlist"
                  required
                />
              </label>
              <label>
                Description <small>(optional)</small>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What's the vibe?"
                />
              </label>
              <label className="toggle-row">
                <span><Globe size={15} /> Public</span>
                <button
                  type="button"
                  className={`toggle-btn${form.isPublic ? " on" : ""}`}
                  onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
                />
              </label>
              <button className="new-btn-primary" type="submit">
                <Plus size={16} /> Create playlist
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaylistCard({
  playlist,
  currentUser,
  isOwnProfile,
  expanded,
  onToggle,
  onLike,
  onDelete,
  onRemoveTrack,
  onShare,
  showPicker,
  onTogglePicker,
  pickerQuery,
  onPickerQueryChange,
  onPickerSearch,
  spotifyResults,
  searching,
  localTracks,
  onAddSpotifyTrack,
  onAddLocalTrack,
  spotifyToken,
}) {
  const isOwner = currentUser && playlist.user && playlist.user.id === currentUser.id;
  const tracks = playlist.tracks || [];

  function Cover() {
    if (tracks.length === 0) {
      return (
        <div className="playlist-cover-empty">
          <ListMusic size={40} />
        </div>
      );
    }
    if (tracks.length === 1 || playlist.coverUrl) {
      return (
        <img
          className="playlist-cover-single"
          src={playlist.coverUrl || tracks[0]?.coverUrl}
          alt={playlist.title}
        />
      );
    }
    return (
      <div className="playlist-cover-mosaic">
        {[0, 1, 2, 3].map((i) =>
          tracks[i] ? (
            <img key={i} src={tracks[i].coverUrl} alt="" />
          ) : (
            <div key={i} className="playlist-cover-blank" />
          )
        )}
      </div>
    );
  }

  return (
    <div className={`playlist-card${expanded ? " expanded" : ""}`}>
      <div className="playlist-cover-wrap" onClick={onToggle}>
        <Cover />
        <div className="playlist-cover-overlay">
          <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </div>
      </div>

      <div className="playlist-info">
        <div className="playlist-title-row">
          <div>
            <h3>{playlist.title}</h3>
            {playlist.description && <p className="playlist-desc">{playlist.description}</p>}
          </div>
          <div className="playlist-badges">
            {playlist.isPublic ? (
              <span className="badge badge-public" title="Public"><Globe size={13} /></span>
            ) : (
              <span className="badge badge-private" title="Private"><Lock size={13} /></span>
            )}
          </div>
        </div>

        <div className="playlist-meta-row">
          <span>{playlist.trackCount || tracks.length} tracks</span>
          <span>{playlist.likeCount || 0} likes</span>
        </div>

        <div className="playlist-actions">
          <button
            className={`pl-action-btn${playlist.likedByMe ? " liked" : ""}`}
            onClick={onLike}
          >
            <Heart size={14} fill={playlist.likedByMe ? "currentColor" : "none"} />
            {playlist.likedByMe ? "Liked" : "Like"}
          </button>

          {playlist.isPublic && (
            <button className="pl-action-btn" onClick={onShare} title="Copy share link">
              <Share2 size={14} /> Share
            </button>
          )}

          {isOwner && isOwnProfile && (
            <>
              <button className="pl-action-btn" onClick={onTogglePicker}>
                <Plus size={14} /> Add track
              </button>
              <button className="pl-action-btn delete" onClick={onDelete}>
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>

        {showPicker && (
          <div className="track-picker">
            <div className="track-picker-header">
              <input
                value={pickerQuery}
                onChange={onPickerQueryChange}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onPickerSearch(); } }}
                placeholder={spotifyToken ? "Search Spotify or pick below…" : "Pick a track…"}
                autoFocus
              />
              {spotifyToken && (
                <button onClick={onPickerSearch} disabled={searching}>
                  <Search size={14} />
                </button>
              )}
            </div>
            <div className="track-picker-list">
              {spotifyToken && spotifyResults.length > 0 && (
                <>
                  <p className="picker-section-label">Spotify results</p>
                  {spotifyResults.map((t) => (
                    <button key={t.spotifyId} className="picker-track-row" onClick={() => onAddSpotifyTrack(t)}>
                      <img src={t.coverUrl} alt="" />
                      <div>
                        <strong>{t.title}</strong>
                        <span>{t.artist}</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {localTracks.length > 0 && (
                <>
                  <p className="picker-section-label">Your tracks</p>
                  {localTracks
                    .filter((t) => !pickerQuery || `${t.title} ${t.artist}`.toLowerCase().includes(pickerQuery.toLowerCase()))
                    .map((t) => (
                      <button key={t.id} className="picker-track-row" onClick={() => onAddLocalTrack(t)}>
                        <img src={t.coverUrl || ""} alt="" />
                        <div>
                          <strong>{t.title}</strong>
                          <span>{t.artist}</span>
                        </div>
                      </button>
                    ))}
                </>
              )}
              {spotifyResults.length === 0 && localTracks.length === 0 && (
                <p className="picker-empty">No tracks found.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="playlist-tracklist">
          {tracks.length === 0 ? (
            <p className="pl-empty">No tracks yet — add some above!</p>
          ) : (
            tracks.map((t, i) => (
              <div className="pl-track-row" key={t.id}>
                <span className="pl-track-num">{i + 1}</span>
                <img src={t.coverUrl || ""} alt="" />
                <div className="pl-track-info">
                  <strong>{t.title}</strong>
                  <span>{t.artist}</span>
                </div>
                {t.spotifyId && (
          
                  <a
                    className="pl-spotify-link"
                    href={`https://open.spotify.com/track/${t.spotifyId}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Spotify ↗
                  </a>
                )}
                {isOwner && isOwnProfile && (
                  <button className="pl-remove-btn" onClick={() => onRemoveTrack(t.id)}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
      

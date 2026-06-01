package com.vibe.app;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Playlist operations — plug these into Database.java (same Connection).
 * Call initPlaylistSchema(connection) once from Database.createSchema().
 */
public final class PlaylistDatabase {

    private PlaylistDatabase() {}

    // ── Schema ────────────────────────────────────────────────────────────────

    public static void initPlaylistSchema(Connection connection) throws SQLException {
        Statement st = connection.createStatement();
        st.execute(
            "CREATE TABLE IF NOT EXISTS playlists (" +
            "  id        INTEGER PRIMARY KEY AUTOINCREMENT," +
            "  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE," +
            "  title     TEXT    NOT NULL," +
            "  description TEXT  NOT NULL DEFAULT ''," +
            "  cover_url TEXT    NOT NULL DEFAULT ''," +
            "  share_key TEXT    NOT NULL UNIQUE," +
            "  is_public INTEGER NOT NULL DEFAULT 1," +
            "  created_at TEXT   NOT NULL DEFAULT CURRENT_TIMESTAMP" +
            ")"
        );
        st.execute(
            "CREATE TABLE IF NOT EXISTS playlist_tracks (" +
            "  id          INTEGER PRIMARY KEY AUTOINCREMENT," +
            "  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE," +
            "  track_id    INTEGER NOT NULL REFERENCES tracks(id)," +
            "  position    INTEGER NOT NULL DEFAULT 0," +
            "  added_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP," +
            "  UNIQUE(playlist_id, track_id)" +
            ")"
        );
        st.execute(
            "CREATE TABLE IF NOT EXISTS playlist_likes (" +
            "  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE," +
            "  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE," +
            "  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP," +
            "  PRIMARY KEY (user_id, playlist_id)" +
            ")"
        );
    }

    // ── Create ────────────────────────────────────────────────────────────────

    public static synchronized Map<String, Object> createPlaylist(
        Connection conn, long userId, String title, String description, boolean isPublic
    ) throws SQLException {
        String shareKey = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        PreparedStatement st = conn.prepareStatement(
            "INSERT INTO playlists (user_id, title, description, share_key, is_public) VALUES (?, ?, ?, ?, ?)",
            Statement.RETURN_GENERATED_KEYS
        );
        st.setLong(1, userId);
        st.setString(2, title.trim().isEmpty() ? "Untitled Playlist" : title.trim());
        st.setString(3, description == null ? "" : description.trim());
        st.setString(4, shareKey);
        st.setInt(5, isPublic ? 1 : 0);
        st.executeUpdate();
        ResultSet keys = st.getGeneratedKeys();
        long id = keys.next() ? keys.getLong(1) : 0L;
        return getPlaylist(conn, id, userId);
    }

    // ── Add / Remove track ────────────────────────────────────────────────────

    public static synchronized Map<String, Object> addTrackToPlaylist(
        Connection conn, long userId, long playlistId, long trackId
    ) throws SQLException {
        // Verify ownership
        if (!isOwner(conn, userId, playlistId)) throw new RuntimeException("Forbidden");
        long pos = scalar(conn, "SELECT COALESCE(MAX(position),0)+1 FROM playlist_tracks WHERE playlist_id=?", playlistId);
        PreparedStatement st = conn.prepareStatement(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)"
        );
        st.setLong(1, playlistId);
        st.setLong(2, trackId);
        st.setLong(3, pos);
        st.executeUpdate();
        // Update cover_url to first track cover
        conn.createStatement().execute(
            "UPDATE playlists SET cover_url = (" +
            "  SELECT t.cover_url FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id" +
            "  WHERE pt.playlist_id = " + playlistId + " ORDER BY pt.position LIMIT 1" +
            ") WHERE id = " + playlistId
        );
        return getPlaylist(conn, playlistId, userId);
    }

    public static synchronized Map<String, Object> removeTrackFromPlaylist(
        Connection conn, long userId, long playlistId, long trackId
    ) throws SQLException {
        if (!isOwner(conn, userId, playlistId)) throw new RuntimeException("Forbidden");
        PreparedStatement st = conn.prepareStatement(
            "DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?"
        );
        st.setLong(1, playlistId);
        st.setLong(2, trackId);
        st.executeUpdate();
        return getPlaylist(conn, playlistId, userId);
    }

    // ── Like playlist ─────────────────────────────────────────────────────────

    public static synchronized Map<String, Object> likePlaylist(
        Connection conn, long userId, long playlistId
    ) throws SQLException {
        if (scalar(conn, "SELECT COUNT(*) FROM playlist_likes WHERE user_id=? AND playlist_id=?", userId, playlistId) > 0) {
            PreparedStatement del = conn.prepareStatement("DELETE FROM playlist_likes WHERE user_id=? AND playlist_id=?");
            del.setLong(1, userId); del.setLong(2, playlistId); del.executeUpdate();
        } else {
            PreparedStatement ins = conn.prepareStatement("INSERT INTO playlist_likes (user_id, playlist_id) VALUES (?,?)");
            ins.setLong(1, userId); ins.setLong(2, playlistId); ins.executeUpdate();
        }
        return getPlaylist(conn, playlistId, userId);
    }

    // ── Delete playlist ───────────────────────────────────────────────────────

    public static synchronized boolean deletePlaylist(Connection conn, long userId, long playlistId) throws SQLException {
        if (!isOwner(conn, userId, playlistId)) return false;
        PreparedStatement st = conn.prepareStatement("DELETE FROM playlists WHERE id=?");
        st.setLong(1, playlistId);
        return st.executeUpdate() > 0;
    }

    // ── Fetch single ──────────────────────────────────────────────────────────

    public static synchronized Map<String, Object> getPlaylist(
        Connection conn, long playlistId, long currentUserId
    ) throws SQLException {
        PreparedStatement st = conn.prepareStatement(
            "SELECT p.*, u.username, u.display_name, u.avatar_key FROM playlists p " +
            "JOIN users u ON u.id = p.user_id WHERE p.id = ?"
        );
        st.setLong(1, playlistId);
        ResultSet rs = st.executeQuery();
        if (!rs.next()) return null;
        return playlistFromResult(conn, rs, currentUserId);
    }

    public static synchronized Map<String, Object> getPlaylistByShareKey(
        Connection conn, String shareKey, long currentUserId
    ) throws SQLException {
        PreparedStatement st = conn.prepareStatement(
            "SELECT p.*, u.username, u.display_name, u.avatar_key FROM playlists p " +
            "JOIN users u ON u.id = p.user_id WHERE p.share_key = ? AND p.is_public = 1"
        );
        st.setString(1, shareKey);
        ResultSet rs = st.executeQuery();
        if (!rs.next()) return null;
        return playlistFromResult(conn, rs, currentUserId);
    }

    // ── Fetch list for user ───────────────────────────────────────────────────

    public static synchronized List<Map<String, Object>> getUserPlaylists(
        Connection conn, long profileUserId, long currentUserId
    ) throws SQLException {
        String visibility = profileUserId == currentUserId ? "" : " AND p.is_public = 1";
        PreparedStatement st = conn.prepareStatement(
            "SELECT p.*, u.username, u.display_name, u.avatar_key FROM playlists p " +
            "JOIN users u ON u.id = p.user_id WHERE p.user_id = ?" + visibility +
            " ORDER BY p.created_at DESC"
        );
        st.setLong(1, profileUserId);
        ResultSet rs = st.executeQuery();
        List<Map<String, Object>> result = new ArrayList<>();
        while (rs.next()) result.add(playlistFromResult(conn, rs, currentUserId));
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Map<String, Object> playlistFromResult(
        Connection conn, ResultSet rs, long currentUserId
    ) throws SQLException {
        long playlistId = rs.getLong("id");
        Map<String, Object> playlist = new LinkedHashMap<>();
        playlist.put("id", playlistId);
        playlist.put("title", rs.getString("title"));
        playlist.put("description", rs.getString("description"));
        playlist.put("coverUrl", rs.getString("cover_url"));
        playlist.put("shareKey", rs.getString("share_key"));
        playlist.put("isPublic", rs.getInt("is_public") == 1);
        playlist.put("createdAt", rs.getString("created_at"));

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", rs.getLong("user_id"));
        user.put("username", rs.getString("username"));
        user.put("displayName", rs.getString("display_name"));
        user.put("avatarKey", rs.getString("avatar_key"));
        playlist.put("user", user);

        long likeCount = scalar(conn, "SELECT COUNT(*) FROM playlist_likes WHERE playlist_id=?", playlistId);
        long likedByMe = currentUserId > 0
            ? scalar(conn, "SELECT COUNT(*) FROM playlist_likes WHERE user_id=? AND playlist_id=?", currentUserId, playlistId)
            : 0L;
        playlist.put("likeCount", likeCount);
        playlist.put("likedByMe", likedByMe > 0);
        playlist.put("trackCount", scalar(conn, "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id=?", playlistId));
        playlist.put("tracks", getPlaylistTracks(conn, playlistId));
        return playlist;
    }

    private static List<Map<String, Object>> getPlaylistTracks(Connection conn, long playlistId) throws SQLException {
        PreparedStatement st = conn.prepareStatement(
            "SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id " +
            "WHERE pt.playlist_id = ? ORDER BY pt.position"
        );
        st.setLong(1, playlistId);
        ResultSet rs = st.executeQuery();
        List<Map<String, Object>> tracks = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> track = new LinkedHashMap<>();
            track.put("id", rs.getLong("id"));
            track.put("title", rs.getString("title"));
            track.put("artist", rs.getString("artist"));
            track.put("album", rs.getString("album"));
            track.put("genre", rs.getString("genre"));
            track.put("coverUrl", rs.getString("cover_url"));
            try { track.put("spotifyId", rs.getString("spotify_id")); } catch (SQLException ignored) {}
            try { track.put("previewUrl", rs.getString("preview_url")); } catch (SQLException ignored) {}
            tracks.add(track);
        }
        return tracks;
    }

    private static boolean isOwner(Connection conn, long userId, long playlistId) throws SQLException {
        return scalar(conn, "SELECT COUNT(*) FROM playlists WHERE id=? AND user_id=?", playlistId, userId) > 0;
    }

    private static long scalar(Connection conn, String sql, long... params) throws SQLException {
        PreparedStatement st = conn.prepareStatement(sql);
        for (int i = 0; i < params.length; i++) st.setLong(i + 1, params[i]);
        ResultSet rs = st.executeQuery();
        return rs.next() ? rs.getLong(1) : 0L;
    }
}

package com.vibe.app;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Database {
    private final Connection connection;

    public Database(Path databasePath) throws Exception {
        Path parent = databasePath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Class.forName("org.sqlite.JDBC");
        this.connection = DriverManager.getConnection("jdbc:sqlite:" + databasePath.toAbsolutePath());
        this.connection.createStatement().execute("PRAGMA foreign_keys = ON");
        createSchema();
        seedIfEmpty();
    }

    public synchronized Map<String, Object> createUser(String username, String displayName, String password, String genres) throws SQLException {
        PasswordUtil.PasswordRecord record = PasswordUtil.hashPassword(password);
        PreparedStatement statement = connection.prepareStatement(
            "INSERT INTO users (username, display_name, avatar_key, bio, favorite_genres, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setString(1, username.toLowerCase());
        statement.setString(2, displayName);
        statement.setString(3, avatarFor(username));
        statement.setString(4, "Discovering songs that sound like late-night city lights.");
        statement.setString(5, genres == null || genres.trim().isEmpty() ? "Indie Pop, Alt R&B, Electronic" : genres);
        statement.setString(6, record.salt);
        statement.setString(7, record.hash);
        statement.executeUpdate();
        ResultSet keys = statement.getGeneratedKeys();
        long id = keys.next() ? keys.getLong(1) : 0L;
        return findUserById(id);
    }

    public synchronized Map<String, Object> findUserByUsername(String username) throws SQLException {
        PreparedStatement statement = connection.prepareStatement("SELECT * FROM users WHERE username = ?");
        statement.setString(1, username.toLowerCase());
        ResultSet rs = statement.executeQuery();
        if (!rs.next()) {
            return null;
        }
        return userFromResult(rs, true);
    }

    public synchronized Map<String, Object> findUserById(long id) throws SQLException {
        PreparedStatement statement = connection.prepareStatement("SELECT * FROM users WHERE id = ?");
        statement.setLong(1, id);
        ResultSet rs = statement.executeQuery();
        if (!rs.next()) {
            return null;
        }
        return userFromResult(rs, false);
    }

    public synchronized List<Map<String, Object>> feed(long currentUserId) throws SQLException {
        return posts("ORDER BY p.created_at DESC, p.id DESC", currentUserId, 20);
    }

    public synchronized List<Map<String, Object>> trending(long currentUserId) throws SQLException {
        return posts("ORDER BY like_count DESC, p.created_at DESC, p.id DESC", currentUserId, 10);
    }

    public synchronized Map<String, Object> createPost(long userId, long trackId, String mood, String caption) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(
            "INSERT INTO posts (user_id, track_id, mood, caption) VALUES (?, ?, ?, ?)",
            Statement.RETURN_GENERATED_KEYS
        );
        statement.setLong(1, userId);
        statement.setLong(2, trackId);
        statement.setString(3, safe(mood, "Fresh"));
        statement.setString(4, safe(caption, ""));
        statement.executeUpdate();
        ResultSet keys = statement.getGeneratedKeys();
        long id = keys.next() ? keys.getLong(1) : 0L;
        return postById(id, userId);
    }

    public synchronized Map<String, Object> likePost(long userId, long postId) throws SQLException {
        PreparedStatement statement = connection.prepareStatement("INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)");
        statement.setLong(1, userId);
        statement.setLong(2, postId);
        statement.executeUpdate();
        return postById(postId, userId);
    }

    public synchronized Map<String, Object> profile(long profileId, long currentUserId) throws SQLException {
        Map<String, Object> user = findUserById(profileId);
        if (user == null) {
            return null;
        }
        user.put("followers", scalar("SELECT COUNT(*) FROM follows WHERE following_id = ?", profileId));
        user.put("following", scalar("SELECT COUNT(*) FROM follows WHERE follower_id = ?", profileId));
        user.put("postCount", scalar("SELECT COUNT(*) FROM posts WHERE user_id = ?", profileId));
        user.put("isFollowing", scalar("SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?", currentUserId, profileId) > 0);
        user.put("posts", posts("WHERE p.user_id = " + profileId + " ORDER BY p.created_at DESC, p.id DESC", currentUserId, 10));
        return user;
    }

    public synchronized void follow(long followerId, long followingId) throws SQLException {
        PreparedStatement statement = connection.prepareStatement("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)");
        statement.setLong(1, followerId);
        statement.setLong(2, followingId);
        statement.executeUpdate();
    }

    public synchronized List<Map<String, Object>> suggestions(long userId) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(
            "SELECT u.id, u.username, u.display_name, u.avatar_key, u.bio, u.favorite_genres, COUNT(*) AS score " +
            "FROM follows mine " +
            "JOIN follows bridge ON bridge.follower_id = mine.following_id " +
            "JOIN users u ON u.id = bridge.following_id " +
            "WHERE mine.follower_id = ? " +
            "AND bridge.following_id <> ? " +
            "AND bridge.following_id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?) " +
            "GROUP BY u.id ORDER BY score DESC, u.display_name ASC LIMIT 5"
        );
        statement.setLong(1, userId);
        statement.setLong(2, userId);
        statement.setLong(3, userId);
        ResultSet rs = statement.executeQuery();
        List<Map<String, Object>> result = new ArrayList<Map<String, Object>>();
        while (rs.next()) {
            Map<String, Object> user = publicUserFromResult(rs);
            user.put("score", rs.getInt("score"));
            result.add(user);
        }

        if (result.isEmpty()) {
            PreparedStatement fallback = connection.prepareStatement(
                "SELECT * FROM users WHERE id <> ? AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?) ORDER BY id LIMIT 5"
            );
            fallback.setLong(1, userId);
            fallback.setLong(2, userId);
            ResultSet fallbackRs = fallback.executeQuery();
            while (fallbackRs.next()) {
                Map<String, Object> user = userFromResult(fallbackRs, false);
                user.put("score", 1);
                result.add(user);
            }
        }
        return result;
    }

    public synchronized Map<String, Object> search(String query) throws SQLException {
        String like = "%" + query.toLowerCase() + "%";
        PreparedStatement trackStatement = connection.prepareStatement(
            "SELECT * FROM tracks WHERE lower(title) LIKE ? OR lower(artist) LIKE ? OR lower(genre) LIKE ? ORDER BY artist, title LIMIT 8"
        );
        trackStatement.setString(1, like);
        trackStatement.setString(2, like);
        trackStatement.setString(3, like);
        ResultSet trackRs = trackStatement.executeQuery();
        List<Map<String, Object>> tracks = new ArrayList<Map<String, Object>>();
        while (trackRs.next()) {
            tracks.add(trackFromResult(trackRs));
        }

        PreparedStatement userStatement = connection.prepareStatement(
            "SELECT * FROM users WHERE lower(username) LIKE ? OR lower(display_name) LIKE ? OR lower(favorite_genres) LIKE ? ORDER BY display_name LIMIT 8"
        );
        userStatement.setString(1, like);
        userStatement.setString(2, like);
        userStatement.setString(3, like);
        ResultSet userRs = userStatement.executeQuery();
        List<Map<String, Object>> users = new ArrayList<Map<String, Object>>();
        while (userRs.next()) {
            users.add(userFromResult(userRs, false));
        }

        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("tracks", tracks);
        result.put("users", users);
        return result;
    }

    public synchronized List<Map<String, Object>> tracks() throws SQLException {
        Statement statement = connection.createStatement();
        ResultSet rs = statement.executeQuery("SELECT * FROM tracks ORDER BY artist, title");
        List<Map<String, Object>> tracks = new ArrayList<Map<String, Object>>();
        while (rs.next()) {
            tracks.add(trackFromResult(rs));
        }
        return tracks;
    }

    private List<Map<String, Object>> posts(String suffix, long currentUserId, int limit) throws SQLException {
        String sql =
            "SELECT p.id, p.mood, p.caption, p.created_at, " +
            "u.id AS user_id, u.username, u.display_name, u.avatar_key, u.bio, u.favorite_genres, " +
            "t.id AS track_id, t.title, t.artist, t.album, t.genre, t.mood AS track_mood, t.cover_url, " +
            "(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count, " +
            "(SELECT COUNT(*) FROM likes lm WHERE lm.post_id = p.id AND lm.user_id = ?) AS liked_by_me " +
            "FROM posts p JOIN users u ON u.id = p.user_id JOIN tracks t ON t.id = p.track_id " +
            suffix + " LIMIT ?";
        PreparedStatement statement = connection.prepareStatement(sql);
        statement.setLong(1, currentUserId);
        statement.setInt(2, limit);
        ResultSet rs = statement.executeQuery();
        List<Map<String, Object>> result = new ArrayList<Map<String, Object>>();
        while (rs.next()) {
            result.add(postFromResult(rs));
        }
        return result;
    }

    private Map<String, Object> postById(long postId, long currentUserId) throws SQLException {
        String sql =
            "SELECT p.id, p.mood, p.caption, p.created_at, " +
            "u.id AS user_id, u.username, u.display_name, u.avatar_key, u.bio, u.favorite_genres, " +
            "t.id AS track_id, t.title, t.artist, t.album, t.genre, t.mood AS track_mood, t.cover_url, " +
            "(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count, " +
            "(SELECT COUNT(*) FROM likes lm WHERE lm.post_id = p.id AND lm.user_id = ?) AS liked_by_me " +
            "FROM posts p JOIN users u ON u.id = p.user_id JOIN tracks t ON t.id = p.track_id WHERE p.id = ?";
        PreparedStatement statement = connection.prepareStatement(sql);
        statement.setLong(1, currentUserId);
        statement.setLong(2, postId);
        ResultSet rs = statement.executeQuery();
        return rs.next() ? postFromResult(rs) : null;
    }

    private Map<String, Object> postFromResult(ResultSet rs) throws SQLException {
        Map<String, Object> post = new LinkedHashMap<String, Object>();
        post.put("id", rs.getLong("id"));
        post.put("mood", rs.getString("mood"));
        post.put("caption", rs.getString("caption"));
        post.put("createdAt", rs.getString("created_at"));
        post.put("likeCount", rs.getInt("like_count"));
        post.put("likedByMe", rs.getInt("liked_by_me") > 0);

        Map<String, Object> user = new LinkedHashMap<String, Object>();
        user.put("id", rs.getLong("user_id"));
        user.put("username", rs.getString("username"));
        user.put("displayName", rs.getString("display_name"));
        user.put("avatarKey", rs.getString("avatar_key"));
        user.put("bio", rs.getString("bio"));
        user.put("favoriteGenres", splitGenres(rs.getString("favorite_genres")));
        post.put("user", user);

        Map<String, Object> track = new LinkedHashMap<String, Object>();
        track.put("id", rs.getLong("track_id"));
        track.put("title", rs.getString("title"));
        track.put("artist", rs.getString("artist"));
        track.put("album", rs.getString("album"));
        track.put("genre", rs.getString("genre"));
        track.put("mood", rs.getString("track_mood"));
        track.put("coverUrl", rs.getString("cover_url"));
        post.put("track", track);

        return post;
    }

    private Map<String, Object> userFromResult(ResultSet rs, boolean includePassword) throws SQLException {
        Map<String, Object> user = publicUserFromResult(rs);
        if (includePassword) {
            user.put("passwordSalt", rs.getString("password_salt"));
            user.put("passwordHash", rs.getString("password_hash"));
        }
        return user;
    }

    private Map<String, Object> publicUserFromResult(ResultSet rs) throws SQLException {
        Map<String, Object> user = new LinkedHashMap<String, Object>();
        user.put("id", rs.getLong("id"));
        user.put("username", rs.getString("username"));
        user.put("displayName", rs.getString("display_name"));
        user.put("avatarKey", rs.getString("avatar_key"));
        user.put("bio", rs.getString("bio"));
        user.put("favoriteGenres", splitGenres(rs.getString("favorite_genres")));
        return user;
    }

    private Map<String, Object> trackFromResult(ResultSet rs) throws SQLException {
        Map<String, Object> track = new LinkedHashMap<String, Object>();
        track.put("id", rs.getLong("id"));
        track.put("title", rs.getString("title"));
        track.put("artist", rs.getString("artist"));
        track.put("album", rs.getString("album"));
        track.put("genre", rs.getString("genre"));
        track.put("mood", rs.getString("mood"));
        track.put("coverUrl", rs.getString("cover_url"));
        return track;
    }

    private long scalar(String sql, long... params) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(sql);
        for (int index = 0; index < params.length; index++) {
            statement.setLong(index + 1, params[index]);
        }
        ResultSet rs = statement.executeQuery();
        return rs.next() ? rs.getLong(1) : 0L;
    }

    private void createSchema() throws SQLException {
        List<String> statements = Arrays.asList(
            "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_key TEXT NOT NULL, bio TEXT NOT NULL, favorite_genres TEXT NOT NULL, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE IF NOT EXISTS tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL, genre TEXT NOT NULL, mood TEXT NOT NULL, cover_url TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, track_id INTEGER NOT NULL REFERENCES tracks(id), mood TEXT NOT NULL, caption TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, post_id))",
            "CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id))"
        );
        Statement statement = connection.createStatement();
        for (String sql : statements) {
            statement.execute(sql);
        }
    }

    private void seedIfEmpty() throws SQLException {
        if (scalar("SELECT COUNT(*) FROM users") > 0) {
            return;
        }

        insertUser("luna", "Luna Vale", "vinyl", "Collects midnight synth lines and soft chorus hooks.", "Synth Pop, Dream Pop, Electronic");
        insertUser("mika", "Mika Sol", "pulse", "Always chasing warm basslines and festival-sized feelings.", "Alt R&B, House, Neo Soul");
        insertUser("nova", "Nova Hart", "spark", "Makes playlists for rainy windows and long train rides.", "Indie Pop, Bedroom Pop, Lo-Fi");
        insertUser("kai", "Kai Rivers", "wave", "A guitar riff loyalist with a weakness for big bridges.", "Indie Rock, Post-Punk, Shoegaze");
        insertUser("iris", "Iris Lane", "aura", "Searches for songs that feel cinematic before sunrise.", "Ambient Pop, Trip-Hop, Electronic");

        insertTrack("Afterglow Loop", "Mira Vale", "City Lights EP", "Synth Pop", "glowing", "/assets/covers/afterglow-loop.png");
        insertTrack("Blue Hour Signal", "North Arcade", "Late Platform", "Indie Pop", "restless", "/assets/covers/blue-hour-signal.png");
        insertTrack("Velvet Static", "Sena Grey", "Soft Voltage", "Alt R&B", "magnetic", "/assets/covers/velvet-static.png");
        insertTrack("Glass Coast", "The Frameshift", "Borrowed Weather", "Indie Rock", "open-road", "/assets/covers/glass-coast.png");
        insertTrack("Low Orbit", "Iris Mode", "Night Maps", "Electronic", "focused", "/assets/covers/low-orbit.png");
        insertTrack("Sunday Frequency", "June Market", "Small Rooms", "Lo-Fi", "warm", "/assets/covers/sunday-frequency.png");

        insertPost(1, 1, "Late-night", "This one feels like walking home while the whole city is humming.");
        insertPost(2, 3, "Magnetic", "Bassline of the week. No contest.");
        insertPost(3, 2, "Restless", "For anyone turning a bus ride into a music video.");
        insertPost(4, 4, "Open-road", "The chorus opens the windows by itself.");
        insertPost(5, 5, "Focus", "Keeping this on loop while I build the next playlist.");
        insertPost(1, 6, "Warm", "Soft drums, tiny room, big feeling.");

        follow(1, 2);
        follow(1, 3);
        follow(2, 3);
        follow(2, 4);
        follow(3, 4);
        follow(3, 5);
        follow(4, 1);
        follow(5, 1);
        follow(5, 2);

        likePost(1, 2);
        likePost(1, 4);
        likePost(2, 1);
        likePost(2, 3);
        likePost(3, 1);
        likePost(3, 2);
        likePost(4, 2);
        likePost(4, 5);
        likePost(5, 1);
        likePost(5, 3);
    }

    private void insertUser(String username, String displayName, String avatarKey, String bio, String genres) throws SQLException {
        PasswordUtil.PasswordRecord record = PasswordUtil.hashPassword("vibe1234");
        PreparedStatement statement = connection.prepareStatement(
            "INSERT INTO users (username, display_name, avatar_key, bio, favorite_genres, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        statement.setString(1, username);
        statement.setString(2, displayName);
        statement.setString(3, avatarKey);
        statement.setString(4, bio);
        statement.setString(5, genres);
        statement.setString(6, record.salt);
        statement.setString(7, record.hash);
        statement.executeUpdate();
    }

    private void insertTrack(String title, String artist, String album, String genre, String mood, String coverUrl) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(
            "INSERT INTO tracks (title, artist, album, genre, mood, cover_url) VALUES (?, ?, ?, ?, ?, ?)"
        );
        statement.setString(1, title);
        statement.setString(2, artist);
        statement.setString(3, album);
        statement.setString(4, genre);
        statement.setString(5, mood);
        statement.setString(6, coverUrl);
        statement.executeUpdate();
    }

    private void insertPost(long userId, long trackId, String mood, String caption) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(
            "INSERT INTO posts (user_id, track_id, mood, caption) VALUES (?, ?, ?, ?)"
        );
        statement.setLong(1, userId);
        statement.setLong(2, trackId);
        statement.setString(3, mood);
        statement.setString(4, caption);
        statement.executeUpdate();
    }

    private static String safe(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private static String avatarFor(String username) {
        String[] keys = {"vinyl", "pulse", "spark", "wave", "aura"};
        int index = Math.abs(username.hashCode()) % keys.length;
        return keys[index];
    }

    private static List<String> splitGenres(String value) {
        if (value == null || value.trim().isEmpty()) {
            return new ArrayList<String>();
        }
        String[] parts = value.split(",");
        List<String> result = new ArrayList<String>();
        for (String part : parts) {
            result.add(part.trim());
        }
        return result;
    }
}

package com.vibe.app;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class VibeServer {
    private final Database database;

    private VibeServer(Database database) {
        this.database = database;
    }

    public static void main(String[] args) throws Exception {
        String dbPath = System.getenv("VIBE_DB_PATH");
        if (dbPath == null || dbPath.trim().isEmpty()) {
            dbPath = ".build/vibe.db";
        }
        Database database = new Database(Paths.get(dbPath));
        VibeServer app = new VibeServer(database);
        String portEnv = System.getenv("PORT");
        int port = (portEnv != null && !portEnv.isEmpty()) ? Integer.parseInt(portEnv) : 8080;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", app.new Router());
        server.setExecutor(null);
        server.start();
        System.out.println("Vibe backend running on port " + port);
    }

    private final class Router implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            addCors(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 204, "");
                return;
            }

            try {
                route(exchange);
            } catch (ApiException exception) {
                sendJson(exchange, exception.status, Json.object("error", exception.getMessage()));
            } catch (Exception exception) {
                exception.printStackTrace();
                sendJson(exchange, 500, Json.object("error", "Server error"));
            }
        }
    }

    private void route(HttpExchange exchange) throws Exception {
        String method = exchange.getRequestMethod();
        URI uri = exchange.getRequestURI();
        String path = uri.getPath();

        if ("GET".equals(method) && "/api/health".equals(path)) {
            sendJson(exchange, 200, Json.object("status", "ok", "app", "Vibe"));
            return;
        }

        if ("POST".equals(method) && "/api/auth/register".equals(path)) {
            register(exchange);
            return;
        }

        if ("POST".equals(method) && "/api/auth/login".equals(path)) {
            login(exchange);
            return;
        }

        if ("POST".equals(method) && "/api/auth/spotify/connect".equals(path)) {
            spotifyConnect(exchange);
            return;
        }

        if ("GET".equals(method) && "/api/feed".equals(path)) {
            long userId = optionalUser(exchange);
            sendJson(exchange, 200, Json.object("posts", database.feed(userId)));
            return;
        }

        if ("POST".equals(method) && "/api/posts".equals(path)) {
            long userId = requireUser(exchange);
            Map<String, String> body = Json.parseObject(readBody(exchange));
            long trackId;
            String spotifyTrackId = body.get("spotifyTrackId");
            if (spotifyTrackId != null && !spotifyTrackId.trim().isEmpty()) {
                trackId = database.findOrCreateSpotifyTrack(
                    spotifyTrackId,
                    body.get("spotifyTitle"),
                    body.get("spotifyArtist"),
                    body.get("spotifyAlbum"),
                    body.get("spotifyCoverUrl"),
                    body.get("spotifyPreviewUrl")
                );
            } else {
                // No track attached — store the post with a null track (trackId 0 = none).
                trackId = parseLong(body.get("trackId"), 0L);
            }
            Map<String, Object> post = database.createPost(userId, trackId, body.get("mood"), body.get("caption"));
            sendJson(exchange, 201, Json.object("post", post));
            return;
        }

        if ("POST".equals(method) && path.matches("/api/posts/\\d+/like")) {
            long userId = requireUser(exchange);
            long postId = Long.parseLong(path.substring("/api/posts/".length(), path.length() - "/like".length()));
            sendJson(exchange, 200, Json.object("post", database.likePost(userId, postId)));
            return;
        }

        if ("GET".equals(method) && path.matches("/api/posts/\\d+")) {
            long currentUserId = optionalUser(exchange);
            long postId = Long.parseLong(path.substring("/api/posts/".length()));
            Map<String, Object> p = database.getPost(postId, currentUserId);
            if (p == null) 
                // ─── PLAYLIST ROUTES ──────────────────────────────────────────────────────────
// Add these blocks inside VibeServer.route() BEFORE the final 404 throw.
// Also call PlaylistDatabase.initPlaylistSchema(connection) at the end of
// Database.createSchema() (pass the connection field through or expose a getter).

// GET /api/users/:id/playlists
if ("GET".equals(method) && path.matches("/api/users/\\d+/playlists")) {
    long currentUserId = optionalUser(exchange);
    long profileId = Long.parseLong(path.substring("/api/users/".length(), path.length() - "/playlists".length()));
    sendJson(exchange, 200, Json.object(
        "playlists", PlaylistDatabase.getUserPlaylists(database.connection(), profileId, currentUserId)
    ));
    return;
}

// POST /api/playlists
if ("POST".equals(method) && "/api/playlists".equals(path)) {
    long userId = requireUser(exchange);
    Map<String, String> body = Json.parseObject(readBody(exchange));
    String title       = body.getOrDefault("title", "Untitled Playlist");
    String description = body.getOrDefault("description", "");
    boolean isPublic   = !"false".equals(body.get("isPublic"));
    Map<String, Object> playlist = PlaylistDatabase.createPlaylist(
        database.connection(), userId, title, description, isPublic
    );
    sendJson(exchange, 201, Json.object("playlist", playlist));
    return;
}

// GET /api/playlists/share/:shareKey
if ("GET".equals(method) && path.matches("/api/playlists/share/[a-zA-Z0-9]+")) {
    long currentUserId = optionalUser(exchange);
    String shareKey = path.substring("/api/playlists/share/".length());
    Map<String, Object> playlist = PlaylistDatabase.getPlaylistByShareKey(
        database.connection(), shareKey, currentUserId
    );
    if (playlist == null) throw new ApiException(404, "Playlist not found");
    sendJson(exchange, 200, Json.object("playlist", playlist));
    return;
}

// GET /api/playlists/:id
if ("GET".equals(method) && path.matches("/api/playlists/\\d+")) {
    long currentUserId = optionalUser(exchange);
    long playlistId = Long.parseLong(path.substring("/api/playlists/".length()));
    Map<String, Object> playlist = PlaylistDatabase.getPlaylist(
        database.connection(), playlistId, currentUserId
    );
    if (playlist == null) throw new ApiException(404, "Playlist not found");
    sendJson(exchange, 200, Json.object("playlist", playlist));
    return;
}

// POST /api/playlists/:id/tracks
if ("POST".equals(method) && path.matches("/api/playlists/\\d+/tracks")) {
    long userId = requireUser(exchange);
    long playlistId = Long.parseLong(path.substring("/api/playlists/".length(), path.length() - "/tracks".length()));
    Map<String, String> body = Json.parseObject(readBody(exchange));

    long trackId;
    String spotifyTrackId = body.get("spotifyTrackId");
    if (spotifyTrackId != null && !spotifyTrackId.trim().isEmpty()) {
        trackId = database.findOrCreateSpotifyTrack(
            spotifyTrackId,
            body.get("spotifyTitle"),
            body.get("spotifyArtist"),
            body.get("spotifyAlbum"),
            body.get("spotifyCoverUrl"),
            body.get("spotifyPreviewUrl")
        );
    } else {
        trackId = parseLong(body.get("trackId"), 0L);
    }
    if (trackId == 0L) throw new ApiException(400, "trackId is required");

    try {
        Map<String, Object> playlist = PlaylistDatabase.addTrackToPlaylist(
            database.connection(), userId, playlistId, trackId
        );
        sendJson(exchange, 200, Json.object("playlist", playlist));
    } catch (RuntimeException ex) {
        throw new ApiException(403, ex.getMessage());
    }
    return;
}

// DELETE /api/playlists/:id/tracks/:trackId
if ("DELETE".equals(method) && path.matches("/api/playlists/\\d+/tracks/\\d+")) {
    long userId = requireUser(exchange);
    String[] parts = path.split("/");
    long playlistId = Long.parseLong(parts[3]);
    long trackId    = Long.parseLong(parts[5]);
    try {
        Map<String, Object> playlist = PlaylistDatabase.removeTrackFromPlaylist(
            database.connection(), userId, playlistId, trackId
        );
        sendJson(exchange, 200, Json.object("playlist", playlist));
    } catch (RuntimeException ex) {
        throw new ApiException(403, ex.getMessage());
    }
    return;
}

// POST /api/playlists/:id/like
if ("POST".equals(method) && path.matches("/api/playlists/\\d+/like")) {
    long userId = requireUser(exchange);
    long playlistId = Long.parseLong(path.substring("/api/playlists/".length(), path.length() - "/like".length()));
    Map<String, Object> playlist = PlaylistDatabase.likePlaylist(
        database.connection(), userId, playlistId
    );
    sendJson(exchange, 200, Json.object("playlist", playlist));
    return;
}

// DELETE /api/playlists/:id
if ("DELETE".equals(method) && path.matches("/api/playlists/\\d+")) {
    long userId = requireUser(exchange);
    long playlistId = Long.parseLong(path.substring("/api/playlists/".length()));
    boolean deleted = PlaylistDatabase.deletePlaylist(database.connection(), userId, playlistId);
    sendJson(exchange, deleted ? 200 : 403, Json.object("ok", deleted));
    return;
}

// ─── END PLAYLIST ROUTES ──────────────────────────────────────────────────────
//
// In Database.java, add this public getter so VibeServer can pass the
// Connection to PlaylistDatabase:
//
//   public Connection connection() { return this.connection; }
//
// And in Database.createSchema(), at the end, add:
//
//   PlaylistDatabase.initPlaylistSchema(this.connection);
                throw new ApiException(404, "Post not found");
            sendJson(exchange, 200, Json.object("post", p));
            return;
        }

        if ("GET".equals(method) && "/api/trending".equals(path)) {
            long userId = optionalUser(exchange);
            sendJson(exchange, 200, Json.object("posts", database.trending(userId)));
            return;
        }

        if (("PATCH".equals(method) || "PUT".equals(method)) && "/api/users/me".equals(path)) {
            long userId = requireUser(exchange);
            Map<String, String> body = Json.parseObject(readBody(exchange));
            try {
                Map<String, Object> user = database.updateUser(
                    userId,
                    body.get("username"),
                    body.get("displayName"),
                    body.get("bio"),
                    body.get("photoUrl")
                );
                sendJson(exchange, 200, Json.object("user", user));
            } catch (SQLException exception) {
                throw new ApiException(409, "Username is already taken");
            }
            return;
        }

        if ("GET".equals(method) && path.matches("/api/users/\\d+")) {
            long currentUserId = optionalUser(exchange);
            long profileId = Long.parseLong(path.substring("/api/users/".length()));
            Map<String, Object> profile = database.profile(profileId, currentUserId);
            if (profile == null) {
                throw new ApiException(404, "User not found");
            }
            sendJson(exchange, 200, Json.object("user", profile));
            return;
        }

        if ("DELETE".equals(method) && path.matches("/api/posts/\\d+/comments/\\d+")) {
            long userId = requireUser(exchange);
            String[] parts = path.split("/");
            long postId = Long.parseLong(parts[3]);
            long commentId = Long.parseLong(parts[5]);
            boolean deleted = database.deleteComment(userId, postId, commentId);
            sendJson(exchange, deleted ? 200 : 403, Json.object("ok", deleted));
            return;
        }

        if ("DELETE".equals(method) && path.matches("/api/posts/\\d+")) {
            long userId = requireUser(exchange);
            long postId = Long.parseLong(path.substring("/api/posts/".length()));
            boolean deleted = database.deletePost(userId, postId);
            sendJson(exchange, deleted ? 200 : 403, Json.object("ok", deleted));
            return;
        }

        if ("GET".equals(method) && path.matches("/api/posts/\\d+/comments")) {
            long currentUserId = optionalUser(exchange);
            long postId = Long.parseLong(path.substring("/api/posts/".length(), path.length() - "/comments".length()));
            sendJson(exchange, 200, Json.object("comments", database.getComments(postId, currentUserId)));
            return;
        }

        if ("POST".equals(method) && path.matches("/api/posts/\\d+/comments/\\d+/like")) {
            long userId = requireUser(exchange);
            String[] parts = path.split("/");
            long commentId = Long.parseLong(parts[5]);
            sendJson(exchange, 200, database.likeComment(userId, commentId));
            return;
        }

        if ("POST".equals(method) && path.matches("/api/posts/\\d+/comments")) {
            long userId = requireUser(exchange);
            long postId = Long.parseLong(path.substring("/api/posts/".length(), path.length() - "/comments".length()));
            Map<String, String> body = Json.parseObject(readBody(exchange));
            String content = body.get("content");
            if (content == null || content.trim().isEmpty()) {
                sendJson(exchange, 400, Json.object("error", "Content is required"));
                return;
            }
            long parentId = parseLong(body.get("parentId"), 0L);
            Map<String, Object> comment = database.addComment(userId, postId, content.trim(), parentId);
            sendJson(exchange, 201, Json.object("comment", comment));
            return;
        }

        if ("POST".equals(method) && path.matches("/api/users/\\d+/follow")) {
            long currentUserId = requireUser(exchange);
            long followingId = Long.parseLong(path.substring("/api/users/".length(), path.length() - "/follow".length()));
            database.follow(currentUserId, followingId);
            sendJson(exchange, 200, Json.object("ok", true));
            return;
        }

        if ("DELETE".equals(method) && path.matches("/api/users/\\d+/follow")) {
            long currentUserId = requireUser(exchange);
            long followingId = Long.parseLong(path.substring("/api/users/".length(), path.length() - "/follow".length()));
            database.unfollow(currentUserId, followingId);
            sendJson(exchange, 200, Json.object("ok", true));
            return;
        }

        if ("GET".equals(method) && "/api/suggestions".equals(path)) {
            long userId = requireUser(exchange);
            sendJson(exchange, 200, Json.object("users", database.suggestions(userId)));
            return;
        }

        if ("GET".equals(method) && "/api/search".equals(path)) {
            long currentUserId = requireUser(exchange);
            String query = queryParam(uri, "q");
            sendJson(exchange, 200, database.search(query == null ? "" : query, currentUserId));
            return;
        }

        if ("GET".equals(method) && "/api/tracks".equals(path)) {
            sendJson(exchange, 200, Json.object("tracks", database.tracks()));
            return;
        }

        throw new ApiException(404, "Route not found");
    }

    private void register(HttpExchange exchange) throws Exception {
        Map<String, String> body = Json.parseObject(readBody(exchange));
        String username = requireField(body, "username");
        String displayName = requireField(body, "displayName");
        String password = requireField(body, "password");
        if (password.length() < 8) {
            throw new ApiException(400, "Password must be at least 8 characters");
        }
        try {
            Map<String, Object> user = database.createUser(username, displayName, password, body.get("genres"));
            String token = createSession(((Number) user.get("id")).longValue());
            sendJson(exchange, 201, Json.object("token", token, "user", user));
        } catch (SQLException exception) {
            throw new ApiException(409, "Username is already taken");
        }
    }

    private void login(HttpExchange exchange) throws Exception {
        Map<String, String> body = Json.parseObject(readBody(exchange));
        String username = requireField(body, "username");
        String password = requireField(body, "password");
        Map<String, Object> user = database.findUserByUsername(username);
        if (user == null || !PasswordUtil.verify(password, String.valueOf(user.get("passwordSalt")), String.valueOf(user.get("passwordHash")))) {
            throw new ApiException(401, "Invalid username or password");
        }
        user.remove("passwordSalt");
        user.remove("passwordHash");
        String token = createSession(((Number) user.get("id")).longValue());
        sendJson(exchange, 200, Json.object("token", token, "user", user));
    }

    private void spotifyConnect(HttpExchange exchange) throws Exception {
        Map<String, String> body = Json.parseObject(readBody(exchange));
        String spotifyId = requireField(body, "spotifyId");
        String displayName = requireField(body, "displayName");
        String usernameHint = body.get("username");
        Map<String, Object> user = database.findOrCreateSpotifyUser(spotifyId, displayName, usernameHint);
        String token = createSession(((Number) user.get("id")).longValue());
        sendJson(exchange, 200, Json.object("token", token, "user", user));
    }

    private String createSession(long userId) throws Exception {
        String token = UUID.randomUUID().toString().replace("-", "");
        database.saveSession(token, userId);
        return token;
    }

    private long optionalUser(HttpExchange exchange) {
        String header = exchange.getRequestHeaders().getFirst("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return 0L;
        }
        try {
            return database.getUserIdForToken(header.substring("Bearer ".length()).trim());
        } catch (Exception e) {
            return 0L;
        }
    }

    private long requireUser(HttpExchange exchange) throws ApiException {
        long userId = optionalUser(exchange);
        if (userId == 0L) {
            throw new ApiException(401, "Authentication required");
        }
        return userId;
    }

    private static String requireField(Map<String, String> body, String field) throws ApiException {
        String value = body.get(field);
        if (value == null || value.trim().isEmpty()) {
            throw new ApiException(400, field + " is required");
        }
        return value.trim();
    }

    private static long parseLong(String value, long fallback) {
        try {
            return value == null ? fallback : Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private static String queryParam(URI uri, String key) throws IOException {
        String query = uri.getRawQuery();
        if (query == null) {
            return null;
        }
        String[] parts = query.split("&");
        for (String part : parts) {
            int equals = part.indexOf('=');
            String rawKey = equals >= 0 ? part.substring(0, equals) : part;
            if (key.equals(URLDecoder.decode(rawKey, "UTF-8"))) {
                String rawValue = equals >= 0 ? part.substring(equals + 1) : "";
                return URLDecoder.decode(rawValue, "UTF-8");
            }
        }
        return null;
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        InputStream input = exchange.getRequestBody();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    private static void addCors(HttpExchange exchange) {
        Headers headers = exchange.getResponseHeaders();
        headers.add("Access-Control-Allow-Origin", "*");
        headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type");
        headers.add("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    }

    private static void sendJson(HttpExchange exchange, int status, Object payload) throws IOException {
        send(exchange, status, Json.stringify(payload));
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        if (status == 204) {
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
            return;
        }
        exchange.sendResponseHeaders(status, bytes.length);
        OutputStream output = exchange.getResponseBody();
        output.write(bytes);
        output.close();
    }

    private static final class ApiException extends Exception {
        private final int status;

        private ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}

package com.vibe.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

public final class PasswordUtil {
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordUtil() {
    }

    public static PasswordRecord hashPassword(String password) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        String saltHex = toHex(salt);
        return new PasswordRecord(saltHex, hashWithSalt(password, saltHex));
    }

    public static boolean verify(String password, String saltHex, String expectedHash) {
        return hashWithSalt(password, saltHex).equals(expectedHash);
    }

    private static String hashWithSalt(String password, String saltHex) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(fromHex(saltHex));
            byte[] bytes = digest.digest(password.getBytes(StandardCharsets.UTF_8));
            return toHex(bytes);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash password", exception);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder();
        for (byte item : bytes) {
            builder.append(String.format("%02x", item & 0xff));
        }
        return builder.toString();
    }

    private static byte[] fromHex(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int index = 0; index < bytes.length; index++) {
            int offset = index * 2;
            bytes[index] = (byte) Integer.parseInt(hex.substring(offset, offset + 2), 16);
        }
        return bytes;
    }

    public static final class PasswordRecord {
        public final String salt;
        public final String hash;

        public PasswordRecord(String salt, String hash) {
            this.salt = salt;
            this.hash = hash;
        }
    }
}

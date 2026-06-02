package com.vibe.app;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Json {
    private Json() {
    }

    public static String stringify(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof String) {
            return quote((String) value);
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        if (value instanceof Map) {
            StringBuilder builder = new StringBuilder();
            builder.append("{");
            boolean first = true;
            for (Object entryObject : ((Map<?, ?>) value).entrySet()) {
                Map.Entry<?, ?> entry = (Map.Entry<?, ?>) entryObject;
                if (!first) {
                    builder.append(",");
                }
                first = false;
                builder.append(quote(String.valueOf(entry.getKey())));
                builder.append(":");
                builder.append(stringify(entry.getValue()));
            }
            builder.append("}");
            return builder.toString();
        }
        if (value instanceof Iterable) {
            StringBuilder builder = new StringBuilder();
            builder.append("[");
            boolean first = true;
            for (Object item : (Iterable<?>) value) {
                if (!first) {
                    builder.append(",");
                }
                first = false;
                builder.append(stringify(item));
            }
            builder.append("]");
            return builder.toString();
        }
        return quote(String.valueOf(value));
    }

    public static String quote(String value) {
        StringBuilder builder = new StringBuilder();
        builder.append('"');
        for (int index = 0; index < value.length(); index++) {
            char ch = value.charAt(index);
            switch (ch) {
                case '"':
                    builder.append("\\\"");
                    break;
                case '\\':
                    builder.append("\\\\");
                    break;
                case '\n':
                    builder.append("\\n");
                    break;
                case '\r':
                    builder.append("\\r");
                    break;
                case '\t':
                    builder.append("\\t");
                    break;
                default:
                    builder.append(ch);
            }
        }
        builder.append('"');
        return builder.toString();
    }

    // Hand-rolled character scanner. The previous regex-based parser used a
    // recursive group "(?:\\.|[^\"])*" which throws StackOverflowError on large
    // string values (e.g. base64 photo data URLs > ~4 KB), crashing the request
    // thread. This scanner is linear and handles arbitrarily large values.
    public static Map<String, String> parseObject(String raw) {
        Map<String, String> values = new LinkedHashMap<String, String>();
        if (raw == null) {
            return values;
        }
        int i = 0;
        int n = raw.length();
        while (i < n) {
            // Find the start of a key (a double quote).
            while (i < n && raw.charAt(i) != '"') {
                i++;
            }
            if (i >= n) {
                break;
            }
            StringBuilder keyBuilder = new StringBuilder();
            i = readString(raw, i, keyBuilder);
            // Skip whitespace and the ':' separator.
            while (i < n && raw.charAt(i) != ':') {
                // If we hit another quote before a colon, this wasn't a key —
                // treat it as the start of the next token.
                if (raw.charAt(i) == '"') {
                    break;
                }
                i++;
            }
            if (i >= n || raw.charAt(i) != ':') {
                continue;
            }
            i++; // skip ':'
            while (i < n && Character.isWhitespace(raw.charAt(i))) {
                i++;
            }
            if (i >= n) {
                break;
            }
            char c = raw.charAt(i);
            String value;
            if (c == '"') {
                StringBuilder valueBuilder = new StringBuilder();
                i = readString(raw, i, valueBuilder);
                value = valueBuilder.toString();
            } else if (c == '[') {
                int start = i;
                i = skipBracketed(raw, i, '[', ']');
                value = raw.substring(start, Math.min(i, n));
            } else if (c == '{') {
                int start = i;
                i = skipBracketed(raw, i, '{', '}');
                value = raw.substring(start, Math.min(i, n));
            } else {
                int start = i;
                while (i < n && ",}] \t\r\n".indexOf(raw.charAt(i)) < 0) {
                    i++;
                }
                value = raw.substring(start, i).trim();
            }
            values.put(keyBuilder.toString(), value);
        }
        return values;
    }

    public static List<String> parseStringArray(String raw) {
        List<String> result = new ArrayList<String>();
        if (raw == null) {
            return result;
        }
        int i = raw.indexOf('[');
        if (i < 0) {
            return result;
        }
        int n = raw.length();
        while (i < n) {
            if (raw.charAt(i) == ']') {
                break;
            }
            if (raw.charAt(i) == '"') {
                StringBuilder builder = new StringBuilder();
                i = readString(raw, i, builder);
                result.add(builder.toString());
            } else {
                i++;
            }
        }
        return result;
    }

    // Reads a JSON string starting at the opening quote (raw[start] == '"').
    // Appends the unescaped contents to out and returns the index just past
    // the closing quote.
    private static int readString(String raw, int start, StringBuilder out) {
        int n = raw.length();
        int i = start + 1; // skip opening quote
        while (i < n) {
            char ch = raw.charAt(i);
            if (ch == '\\' && i + 1 < n) {
                char next = raw.charAt(i + 1);
                switch (next) {
                    case '"': out.append('"'); break;
                    case '\\': out.append('\\'); break;
                    case '/': out.append('/'); break;
                    case 'n': out.append('\n'); break;
                    case 'r': out.append('\r'); break;
                    case 't': out.append('\t'); break;
                    case 'b': out.append('\b'); break;
                    case 'f': out.append('\f'); break;
                    case 'u':
                        if (i + 5 < n) {
                            try {
                                out.append((char) Integer.parseInt(raw.substring(i + 2, i + 6), 16));
                                i += 4;
                            } catch (NumberFormatException ex) {
                                out.append(next);
                            }
                        } else {
                            out.append(next);
                        }
                        break;
                    default: out.append(next);
                }
                i += 2;
            } else if (ch == '"') {
                return i + 1; // past closing quote
            } else {
                out.append(ch);
                i++;
            }
        }
        return i;
    }

    // Skips a bracketed region (array or object), respecting nested brackets
    // and quoted strings. Returns the index just past the closing bracket.
    private static int skipBracketed(String raw, int start, char open, char close) {
        int n = raw.length();
        int depth = 0;
        int i = start;
        while (i < n) {
            char ch = raw.charAt(i);
            if (ch == '"') {
                StringBuilder ignore = new StringBuilder();
                i = readString(raw, i, ignore);
                continue;
            }
            if (ch == open) {
                depth++;
            } else if (ch == close) {
                depth--;
                if (depth == 0) {
                    return i + 1;
                }
            }
            i++;
        }
        return i;
    }

    public static Map<String, Object> object(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        for (int index = 0; index + 1 < pairs.length; index += 2) {
            map.put(String.valueOf(pairs[index]), pairs[index + 1]);
        }
        return map;
    }

    private static String unescape(String value) {
        return value
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t");
    }
}

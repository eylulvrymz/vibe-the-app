package com.vibe.app;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    public static Map<String, String> parseObject(String raw) {
        Map<String, String> values = new LinkedHashMap<String, String>();
        if (raw == null) {
            return values;
        }

        Pattern field = Pattern.compile("\"([^\"]+)\"\\s*:\\s*(\"((?:\\\\.|[^\"])*)\"|\\[[^\\]]*\\]|-?\\d+(?:\\.\\d+)?|true|false|null)");
        Matcher matcher = field.matcher(raw);
        while (matcher.find()) {
            String key = matcher.group(1);
            String token = matcher.group(2);
            String value;
            if (token.startsWith("\"")) {
                value = unescape(matcher.group(3));
            } else {
                value = token;
            }
            values.put(key, value);
        }
        return values;
    }

    public static List<String> parseStringArray(String raw) {
        List<String> result = new ArrayList<String>();
        if (raw == null || !raw.startsWith("[")) {
            return result;
        }
        Pattern item = Pattern.compile("\"((?:\\\\.|[^\"])*)\"");
        Matcher matcher = item.matcher(raw);
        while (matcher.find()) {
            result.add(unescape(matcher.group(1)));
        }
        return result;
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

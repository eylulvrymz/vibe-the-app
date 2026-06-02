FROM eclipse-temurin:21-jdk-alpine

WORKDIR /app

# Download SQLite JDBC and SLF4J dependencies
RUN apk add --no-cache curl && \
    mkdir -p /app/libs && \
    curl -fsSL -o /app/libs/sqlite-jdbc.jar \
      https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.45.3.0/sqlite-jdbc-3.45.3.0.jar && \
    curl -fsSL -o /app/libs/slf4j-api.jar \
      https://repo1.maven.org/maven2/org/slf4j/slf4j-api/2.0.13/slf4j-api-2.0.13.jar && \
    curl -fsSL -o /app/libs/slf4j-simple.jar \
      https://repo1.maven.org/maven2/org/slf4j/slf4j-simple/2.0.13/slf4j-simple-2.0.13.jar

# Copy and compile source files
COPY src/main/java /app/src
RUN mkdir -p /app/classes && \
    find /app/src -name "*.java" > /app/sources.txt && \
    javac -encoding UTF-8 \
      -cp "/app/libs/sqlite-jdbc.jar:/app/libs/slf4j-api.jar:/app/libs/slf4j-simple.jar" \
      -d /app/classes \
      @/app/sources.txt

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV VIBE_DB_PATH=/app/data/vibe.db

EXPOSE 8080

CMD ["java", \
     "-Xmx384m", \
     "-Xms64m", \
     "-cp", "/app/classes:/app/libs/sqlite-jdbc.jar:/app/libs/slf4j-api.jar:/app/libs/slf4j-simple.jar", \
     "com.vibe.app.VibeServer"]

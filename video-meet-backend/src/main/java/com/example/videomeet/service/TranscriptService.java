package com.example.videomeet.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class TranscriptService {
    private final Path baseDir = Paths.get("transcripts");

    public TranscriptService() throws IOException {
        if (!Files.exists(baseDir)) {
            Files.createDirectories(baseDir);
        }
    }

    public Path append(String meetingId, String speaker, String text) throws IOException {
        Path file = baseDir.resolve("meeting-" + meetingId + ".txt");
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String line = String.format("[%s] %s: %s%n", timestamp, speaker == null ? "user" : speaker, text);
        Files.writeString(file, line, StandardCharsets.UTF_8, Files.exists(file) ? java.nio.file.StandardOpenOption.APPEND : java.nio.file.StandardOpenOption.CREATE);
        return file;
    }

    public Path getFile(String meetingId) {
        return baseDir.resolve("meeting-" + meetingId + ".txt");
    }
}

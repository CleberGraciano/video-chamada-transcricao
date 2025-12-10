package com.example.videomeet.controller;

import com.example.videomeet.service.TranscriptService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@RestController
@RequestMapping("/api/transcripts")
@CrossOrigin(origins = {"http://localhost:4200", "*"})
public class TranscriptController {
    private final TranscriptService transcriptService;

    public TranscriptController(TranscriptService transcriptService) {
        this.transcriptService = transcriptService;
    }

    public record TranscriptRequest(@NotBlank String meetingId, String speaker, @NotBlank String text) {}

    @PostMapping
    public ResponseEntity<?> append(@RequestBody TranscriptRequest req) throws IOException {
        Path f = transcriptService.append(req.meetingId(), req.speaker(), req.text());
        return ResponseEntity.ok(Map.of("path", f.toString()));
    }

    @GetMapping("/{meetingId}")
    public ResponseEntity<?> download(@PathVariable String meetingId) throws IOException {
        Path file = transcriptService.getFile(meetingId);
        if (!Files.exists(file)) {
            return ResponseEntity.notFound().build();
        }
        FileSystemResource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + file.getFileName())
                .contentType(MediaType.TEXT_PLAIN)
                .body(resource);
    }
}

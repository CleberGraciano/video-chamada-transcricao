package com.example.videomeet.controller;

import com.example.videomeet.model.Meeting;
import com.example.videomeet.service.MeetingService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/meetings")
@CrossOrigin(origins = {"http://localhost:4200", "*"})
public class MeetingController {
    private final MeetingService meetingService;

    public MeetingController(MeetingService meetingService) {
        this.meetingService = meetingService;
    }

    @PostMapping
    public ResponseEntity<?> create() {
        Meeting m = meetingService.create();
        return ResponseEntity.ok(Map.of(
                "id", m.getId(),
                "joinUrl", "http://localhost:4200/room/" + m.getId()
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable @NotBlank String id) {
        return meetingService.get(id)
                .<ResponseEntity<?>>map(m -> ResponseEntity.ok(Map.of("id", m.getId(), "createdAt", m.getCreatedAt())))
                .orElse(ResponseEntity.notFound().build());
    }
}

package com.example.videomeet.controller;

import com.example.videomeet.service.MeetingService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins = {"http://localhost:4200", "http://localhost:84", "*"})
public class RoomController {
    private final MeetingService meetingService;

    public RoomController(MeetingService meetingService) {
        this.meetingService = meetingService;
    }

    public record JoinRequest(@NotBlank String clientId) {}

    @PostMapping("/{id}/join")
    public ResponseEntity<?> join(@PathVariable String id, @RequestBody JoinRequest req) {
        if (meetingService.get(id).isEmpty()) return ResponseEntity.notFound().build();
        boolean ok = meetingService.tryJoin(id, req.clientId());
        if (!ok) {
            return ResponseEntity.status(429).body(Map.of("allowed", false, "reason", "Sala excedeu o limite de participantes"));
        }
        return ResponseEntity.ok(Map.of("allowed", true, "participants", meetingService.participants(id), "limit", meetingService.getLimit(id)));
    }

    public record LeaveRequest(@NotBlank String clientId) {}

    @PostMapping("/{id}/leave")
    public ResponseEntity<?> leave(@PathVariable String id, @RequestBody LeaveRequest req) {
        if (meetingService.get(id).isEmpty()) return ResponseEntity.notFound().build();
        meetingService.leave(id, req.clientId());
        return ResponseEntity.ok(Map.of("left", true, "participants", meetingService.participants(id)));
    }
}

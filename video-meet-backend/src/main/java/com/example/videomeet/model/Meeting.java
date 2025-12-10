package com.example.videomeet.model;

import java.time.Instant;
import java.util.UUID;

public class Meeting {
    private final String id;
    private final Instant createdAt;

    public Meeting() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public Meeting(String id) {
        this.id = id;
        this.createdAt = Instant.now();
    }

    public String getId() { return id; }
    public Instant getCreatedAt() { return createdAt; }
}

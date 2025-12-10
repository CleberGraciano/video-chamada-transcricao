package com.example.videomeet.service;

import com.example.videomeet.model.Meeting;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MeetingService {
    private final Map<String, Meeting> meetings = new ConcurrentHashMap<>();

    public Meeting create() {
        Meeting m = new Meeting();
        meetings.put(m.getId(), m);
        return m;
    }

    public Optional<Meeting> get(String id) {
        return Optional.ofNullable(meetings.get(id));
    }
}

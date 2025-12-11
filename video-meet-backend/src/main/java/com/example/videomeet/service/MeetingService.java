package com.example.videomeet.service;

import com.example.videomeet.model.Meeting;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.HashSet;
import java.util.Set;

@Service
public class MeetingService {
    private final Map<String, Meeting> meetings = new ConcurrentHashMap<>();
    private final Map<String, Integer> meetingLimits = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> meetingParticipants = new ConcurrentHashMap<>();

    public Meeting create() {
        Meeting m = new Meeting();
        meetings.put(m.getId(), m);
        meetingLimits.put(m.getId(), Integer.MAX_VALUE);
        meetingParticipants.put(m.getId(), ConcurrentHashMap.newKeySet());
        return m;
    }

    public Optional<Meeting> get(String id) {
        return Optional.ofNullable(meetings.get(id));
    }

    public void setLimit(String id, int limit) {
        meetingLimits.put(id, Math.max(1, limit));
        meetingParticipants.putIfAbsent(id, ConcurrentHashMap.newKeySet());
    }

    public int getLimit(String id) {
        return meetingLimits.getOrDefault(id, Integer.MAX_VALUE);
    }

    public synchronized boolean tryJoin(String id, String clientId) {
        Set<String> set = meetingParticipants.computeIfAbsent(id, k -> ConcurrentHashMap.newKeySet());
        if (set.contains(clientId)) return true;
        int limit = getLimit(id);
        if (set.size() >= limit) return false;
        set.add(clientId);
        return true;
    }

    public void leave(String id, String clientId) {
        Set<String> set = meetingParticipants.get(id);
        if (set != null) set.remove(clientId);
    }

    public Set<String> participants(String id) {
        return meetingParticipants.getOrDefault(id, new HashSet<>());
    }
}

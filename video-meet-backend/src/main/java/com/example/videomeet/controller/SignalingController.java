package com.example.videomeet.controller;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
public class SignalingController {
    private final SimpMessagingTemplate messagingTemplate;

    public SignalingController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // Clients send to /app/room/{roomId}, server broadcasts to /topic/room/{roomId}
    @MessageMapping("/room/{roomId}")
    public void handleSignal(@DestinationVariable String roomId, @Payload Map<String, Object> message) {
        messagingTemplate.convertAndSend("/topic/room/" + roomId, message);
    }
}

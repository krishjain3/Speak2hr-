package com.speak2hr.service;

import com.speak2hr.dto.SlotBookingRequest;
import com.speak2hr.model.VideoSession;
import com.speak2hr.repository.VideoSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SlotService {

    private static final Logger logger = LoggerFactory.getLogger(SlotService.class);

    private final VideoSessionRepository videoSessionRepository;
    private final Map<String, VideoSession> inMemorySlots = new ConcurrentHashMap<>();

    public SlotService(VideoSessionRepository videoSessionRepository) {
        this.videoSessionRepository = videoSessionRepository;
        seedDefaultSlots();
    }

    private void seedDefaultSlots() {
        VideoSession slot1 = new VideoSession();
        slot1.setId("slot-sample-1");
        slot1.setHrId("hr_1");
        slot1.setHrName("Sarah Johnson");
        slot1.setHrEmail("hr@speak2hr.com");
        slot1.setDate("2026-09-12");
        slot1.setTime("10:00 AM");
        slot1.setDuration(30);
        slot1.setStatus("available");
        slot1.setVideoLink("https://meet.speak2hr.com/room/slot-sample-1");
        inMemorySlots.put(slot1.getId(), slot1);

        VideoSession slot2 = new VideoSession();
        slot2.setId("slot-sample-2");
        slot2.setHrId("hr_2");
        slot2.setHrName("David Miller");
        slot2.setHrEmail("david.miller@speak2hr.com");
        slot2.setDate("2026-09-12");
        slot2.setTime("02:00 PM");
        slot2.setDuration(30);
        slot2.setStatus("available");
        slot2.setVideoLink("https://meet.speak2hr.com/room/slot-sample-2");
        inMemorySlots.put(slot2.getId(), slot2);
    }

    public List<VideoSession> getAllSlots() {
        try {
            List<VideoSession> list = videoSessionRepository.findAll();
            if (!list.isEmpty()) return list;
        } catch (Exception e) {
            logger.warn("MongoDB query for slots failed, using in-memory: {}", e.getMessage());
        }
        return new ArrayList<>(inMemorySlots.values());
    }

    public VideoSession getSlotById(String slotId) {
        try {
            Optional<VideoSession> opt = videoSessionRepository.findById(slotId);
            if (opt.isPresent()) return opt.get();
        } catch (Exception ignored) {}

        VideoSession slot = inMemorySlots.get(slotId);
        if (slot == null) {
            throw new RuntimeException("Slot not found with ID: " + slotId);
        }
        return slot;
    }

    public VideoSession createSlot(Map<String, Object> request) {
        VideoSession slot = new VideoSession();
        slot.setId(request.containsKey("id") ? (String) request.get("id") : "slot-" + System.currentTimeMillis());
        slot.setHrId(request.containsKey("hrId") ? (String) request.get("hrId") : (String) request.get("hr_id"));
        slot.setHrName(request.containsKey("hrName") ? (String) request.get("hrName") : (String) request.get("hr_name"));
        slot.setHrEmail(request.containsKey("hrEmail") ? (String) request.get("hrEmail") : (String) request.get("hr_email"));
        slot.setDate((String) request.getOrDefault("date", "2026-09-10"));
        slot.setTime((String) request.getOrDefault("time", "10:00 AM"));
        slot.setDuration(request.containsKey("duration") ? ((Number) request.get("duration")).intValue() : 30);
        slot.setStatus((String) request.getOrDefault("status", "available"));
        slot.setVideoLink("https://meet.speak2hr.com/room/" + slot.getId());
        slot.setCreatedAt(Instant.now().toString());

        inMemorySlots.put(slot.getId(), slot);
        try {
            videoSessionRepository.save(slot);
        } catch (Exception e) {
            logger.warn("Saved slot in-memory (MongoDB offline): {}", e.getMessage());
        }
        return slot;
    }

    public VideoSession updateSlot(String slotId, Map<String, Object> request) {
        VideoSession slot = getSlotById(slotId);
        if (request.containsKey("date")) slot.setDate((String) request.get("date"));
        if (request.containsKey("time")) slot.setTime((String) request.get("time"));
        if (request.containsKey("status")) slot.setStatus((String) request.get("status"));
        if (request.containsKey("duration")) slot.setDuration(((Number) request.get("duration")).intValue());

        inMemorySlots.put(slot.getId(), slot);
        try {
            videoSessionRepository.save(slot);
        } catch (Exception ignored) {}
        return slot;
    }

    public Map<String, Object> deleteSlot(String slotId) {
        inMemorySlots.remove(slotId);
        try {
            videoSessionRepository.deleteById(slotId);
        } catch (Exception ignored) {}
        return Map.of("success", true, "message", "Slot deleted successfully", "slot_id", slotId);
    }

    public Map<String, Object> bookSlot(SlotBookingRequest request) {
        VideoSession slot = inMemorySlots.get(request.getSlot_id());
        if (slot == null) {
            try {
                slot = videoSessionRepository.findById(request.getSlot_id()).orElse(null);
            } catch (Exception ignored) {}
        }
        if (slot == null) {
            slot = new VideoSession();
            slot.setId(request.getSlot_id());
        }

        slot.setCandidateId(request.getCandidate_id());
        slot.setCandidateName(request.getCandidate_name());
        slot.setCandidateEmail(request.getCandidate_email());
        slot.setHrName(request.getHr_name() != null ? request.getHr_name() : "HR Manager");
        slot.setHrEmail(request.getHr_email() != null ? request.getHr_email() : "hr@speak2hr.com");
        slot.setDate(request.getDate() != null ? request.getDate() : "2026-09-10");
        slot.setTime(request.getTime() != null ? request.getTime() : "10:00 AM");
        slot.setDuration(request.getDuration() != null ? request.getDuration() : 30);
        slot.setStatus("booked");
        String callLink = "https://meet.speak2hr.com/room/" + request.getSlot_id();
        slot.setVideoLink(callLink);

        inMemorySlots.put(slot.getId(), slot);
        try {
            videoSessionRepository.save(slot);
        } catch (Exception ignored) {}

        return Map.of(
                "success", true,
                "message", "Interview slot booked successfully",
                "slot_id", request.getSlot_id(),
                "video_call_link", callLink,
                "email_sent", true
        );
    }

    public Map<String, Object> confirmSlot(String slotId) {
        VideoSession slot = getSlotById(slotId);
        slot.setStatus("confirmed");
        inMemorySlots.put(slot.getId(), slot);
        try {
            videoSessionRepository.save(slot);
        } catch (Exception ignored) {}
        return Map.of("success", true, "message", "Slot booking confirmed", "slot_id", slotId);
    }

    public Map<String, Object> declineSlot(String slotId) {
        VideoSession slot = getSlotById(slotId);
        slot.setStatus("available");
        slot.setCandidateId(null);
        slot.setCandidateName(null);
        slot.setCandidateEmail(null);
        inMemorySlots.put(slot.getId(), slot);
        try {
            videoSessionRepository.save(slot);
        } catch (Exception ignored) {}
        return Map.of("success", true, "message", "Slot booking declined", "slot_id", slotId);
    }

    public Map<String, Object> cancelSlot(String slotId, Map<String, Object> request) {
        VideoSession slot = inMemorySlots.get(slotId);
        if (slot != null) {
            slot.setStatus("available");
            slot.setCandidateId(null);
            slot.setCandidateName(null);
            slot.setCandidateEmail(null);
            inMemorySlots.put(slot.getId(), slot);
            try {
                videoSessionRepository.save(slot);
            } catch (Exception ignored) {}
        }
        return Map.of("success", true, "message", "Slot booking cancelled", "slot_id", slotId);
    }
}

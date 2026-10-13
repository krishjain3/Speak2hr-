package com.speak2hr.controller;

import com.speak2hr.dto.SlotBookingRequest;
import com.speak2hr.model.VideoSession;
import com.speak2hr.service.SlotService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/slots")
public class SlotController {

    private final SlotService slotService;

    public SlotController(SlotService slotService) {
        this.slotService = slotService;
    }

    @GetMapping
    public ResponseEntity<List<VideoSession>> getAllSlots() {
        return ResponseEntity.ok(slotService.getAllSlots());
    }

    @PostMapping
    public ResponseEntity<VideoSession> createSlot(@RequestBody Map<String, Object> request) {
        return ResponseEntity.ok(slotService.createSlot(request));
    }

    @PutMapping("/{slot_id}")
    public ResponseEntity<VideoSession> updateSlot(@PathVariable("slot_id") String slotId, @RequestBody Map<String, Object> request) {
        return ResponseEntity.ok(slotService.updateSlot(slotId, request));
    }

    @DeleteMapping("/{slot_id}")
    public ResponseEntity<Map<String, Object>> deleteSlot(@PathVariable("slot_id") String slotId) {
        return ResponseEntity.ok(slotService.deleteSlot(slotId));
    }

    @PostMapping("/book")
    public ResponseEntity<Map<String, Object>> bookSlot(@RequestBody SlotBookingRequest request) {
        return ResponseEntity.ok(slotService.bookSlot(request));
    }

    @PostMapping("/confirm/{slot_id}")
    public ResponseEntity<Map<String, Object>> confirmSlot(@PathVariable("slot_id") String slotId) {
        return ResponseEntity.ok(slotService.confirmSlot(slotId));
    }

    @PostMapping("/decline/{slot_id}")
    public ResponseEntity<Map<String, Object>> declineSlot(@PathVariable("slot_id") String slotId) {
        return ResponseEntity.ok(slotService.declineSlot(slotId));
    }

    @PostMapping("/cancel/{slot_id}")
    public ResponseEntity<Map<String, Object>> cancelSlot(
            @PathVariable("slot_id") String slotId,
            @RequestBody(required = false) Map<String, Object> request
    ) {
        return ResponseEntity.ok(slotService.cancelSlot(slotId, request != null ? request : Map.of()));
    }
}

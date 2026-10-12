package com.speak2hr.controller;

import com.speak2hr.model.Evaluation;
import com.speak2hr.repository.EvaluationRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/evaluations")
public class EvaluationController {

    private final EvaluationRepository evaluationRepository;
    private final Map<String, Evaluation> inMemoryEvals = new ConcurrentHashMap<>();

    public EvaluationController(EvaluationRepository evaluationRepository) {
        this.evaluationRepository = evaluationRepository;
    }

    @GetMapping
    public ResponseEntity<List<Evaluation>> getAllEvaluations() {
        try {
            List<Evaluation> list = evaluationRepository.findAll();
            if (!list.isEmpty()) return ResponseEntity.ok(list);
        } catch (Exception ignored) {}
        return ResponseEntity.ok(new ArrayList<>(inMemoryEvals.values()));
    }

    @PostMapping
    public ResponseEntity<Evaluation> createEvaluation(@RequestBody Map<String, Object> request) {
        Evaluation eval = new Evaluation();
        eval.setId("eval_" + System.currentTimeMillis());
        eval.setCandidateId((String) request.get("candidate_id"));
        eval.setHrId((String) request.get("hr_id"));
        eval.setScore(request.containsKey("score") ? ((Number) request.get("score")).doubleValue() : 85.0);
        eval.setFeedback((String) request.getOrDefault("feedback", "Excellent technical responses and communication."));
        eval.setStatus((String) request.getOrDefault("status", "pending"));
        eval.setCreatedAt(Instant.now().toString());

        inMemoryEvals.put(eval.getId(), eval);
        try {
            evaluationRepository.save(eval);
        } catch (Exception ignored) {}

        return ResponseEntity.ok(eval);
    }

    @PutMapping("/{eval_id}/submit")
    public ResponseEntity<Evaluation> submitEvaluation(@PathVariable("eval_id") String evalId, @RequestBody Map<String, Object> request) {
        Evaluation eval = inMemoryEvals.get(evalId);
        if (eval == null) {
            eval = new Evaluation();
            eval.setId(evalId);
        }

        if (request.containsKey("score")) eval.setScore(((Number) request.get("score")).doubleValue());
        if (request.containsKey("feedback")) eval.setFeedback((String) request.get("feedback"));
        eval.setStatus("completed");

        inMemoryEvals.put(eval.getId(), eval);
        try {
            evaluationRepository.save(eval);
        } catch (Exception ignored) {}

        return ResponseEntity.ok(eval);
    }
}

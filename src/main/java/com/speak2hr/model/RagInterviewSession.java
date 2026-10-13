package com.speak2hr.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Document(collection = "rag_interview_sessions")
@JsonIgnoreProperties(ignoreUnknown = true)
public class RagInterviewSession {

    @Id
    @JsonProperty("session_id")
    private String id;

    @JsonProperty("candidate_id")
    private String candidateId;

    @JsonProperty("resume_id")
    private String resumeId;

    @JsonProperty("candidate_name")
    private String candidateName;

    @JsonProperty("target_role")
    private String targetRole;

    private String difficulty;

    @JsonProperty("total_questions")
    private Integer totalQuestions = 0;

    private List<Map<String, Object>> questions = new ArrayList<>();

    private List<Map<String, Object>> evaluations = new ArrayList<>();

    private String status = "in_progress"; // in_progress, completed

    @JsonProperty("created_at")
    private String createdAt = Instant.now().toString();

    public RagInterviewSession() {}

    public RagInterviewSession(String id, String candidateId, String resumeId, String targetRole, String difficulty) {
        this.id = id;
        this.candidateId = candidateId;
        this.resumeId = resumeId;
        this.targetRole = targetRole;
        this.difficulty = difficulty;
        this.createdAt = Instant.now().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCandidateId() { return candidateId; }
    public void setCandidateId(String candidateId) { this.candidateId = candidateId; }

    public String getResumeId() { return resumeId; }
    public void setResumeId(String resumeId) { this.resumeId = resumeId; }

    public String getCandidateName() { return candidateName; }
    public void setCandidateName(String candidateName) { this.candidateName = candidateName; }

    public String getTargetRole() { return targetRole; }
    public void setTargetRole(String targetRole) { this.targetRole = targetRole; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public Integer getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(Integer totalQuestions) { this.totalQuestions = totalQuestions; }

    public List<Map<String, Object>> getQuestions() { return questions != null ? questions : new ArrayList<>(); }
    public void setQuestions(List<Map<String, Object>> questions) { this.questions = questions; }

    public List<Map<String, Object>> getEvaluations() { return evaluations != null ? evaluations : new ArrayList<>(); }
    public void setEvaluations(List<Map<String, Object>> evaluations) { this.evaluations = evaluations; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}

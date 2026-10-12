package com.speak2hr.dto;

import java.util.List;

public class RagGenerateQuestionsRequest {
    private String candidate_id;
    private String role;
    private String difficulty;
    private Integer num_questions;
    private List<String> focus_topics;
    private String candidate_name;

    public RagGenerateQuestionsRequest() {}

    public String getCandidate_id() { return candidate_id; }
    public void setCandidate_id(String candidate_id) { this.candidate_id = candidate_id; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public Integer getNum_questions() { return num_questions != null ? num_questions : 10; }
    public void setNum_questions(Integer num_questions) { this.num_questions = num_questions; }

    public List<String> getFocus_topics() { return focus_topics; }
    public void setFocus_topics(List<String> focus_topics) { this.focus_topics = focus_topics; }

    public String getCandidate_name() { return candidate_name; }
    public void setCandidate_name(String candidate_name) { this.candidate_name = candidate_name; }
}

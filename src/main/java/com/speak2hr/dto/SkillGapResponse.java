package com.speak2hr.dto;

import java.util.List;
import java.util.Map;

public class SkillGapResponse {
    private List<String> current_skills;
    private List<String> missing_skills;
    private List<Map<String, String>> learning_roadmap;
    private Double readiness_score;

    public SkillGapResponse() {}

    public List<String> getCurrent_skills() { return current_skills; }
    public void setCurrent_skills(List<String> current_skills) { this.current_skills = current_skills; }

    public List<String> getMissing_skills() { return missing_skills; }
    public void setMissing_skills(List<String> missing_skills) { this.missing_skills = missing_skills; }

    public List<Map<String, String>> getLearning_roadmap() { return learning_roadmap; }
    public void setLearning_roadmap(List<Map<String, String>> learning_roadmap) { this.learning_roadmap = learning_roadmap; }

    public Double getReadiness_score() { return readiness_score; }
    public void setReadiness_score(Double readiness_score) { this.readiness_score = readiness_score; }
}

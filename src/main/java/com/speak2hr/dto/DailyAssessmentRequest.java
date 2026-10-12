package com.speak2hr.dto;

import java.util.List;

public class DailyAssessmentRequest {
    private String user_id;
    private String role;
    private String difficulty = "medium";
    private String category = "technical";
    private Integer num_questions = 10;
    private String experience_level = "mid";
    private List<String> skills;

    public DailyAssessmentRequest() {}

    public String getUser_id() { return user_id; }
    public void setUser_id(String user_id) { this.user_id = user_id; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public Integer getNum_questions() { return num_questions; }
    public void setNum_questions(Integer num_questions) { this.num_questions = num_questions; }

    public String getExperience_level() { return experience_level; }
    public void setExperience_level(String experience_level) { this.experience_level = experience_level; }

    public List<String> getSkills() { return skills; }
    public void setSkills(List<String> skills) { this.skills = skills; }
}

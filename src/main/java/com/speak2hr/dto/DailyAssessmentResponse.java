package com.speak2hr.dto;

import java.util.List;
import java.util.Map;

public class DailyAssessmentResponse {
    private String assessment_id;
    private String title;
    private String description;
    private List<Map<String, Object>> questions;
    private Integer total_questions;
    private Integer time_limit_minutes;

    public DailyAssessmentResponse() {}

    public String getAssessment_id() { return assessment_id; }
    public void setAssessment_id(String assessment_id) { this.assessment_id = assessment_id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public List<Map<String, Object>> getQuestions() { return questions; }
    public void setQuestions(List<Map<String, Object>> questions) { this.questions = questions; }

    public Integer getTotal_questions() { return total_questions; }
    public void setTotal_questions(Integer total_questions) { this.total_questions = total_questions; }

    public Integer getTime_limit_minutes() { return time_limit_minutes; }
    public void setTime_limit_minutes(Integer time_limit_minutes) { this.time_limit_minutes = time_limit_minutes; }
}

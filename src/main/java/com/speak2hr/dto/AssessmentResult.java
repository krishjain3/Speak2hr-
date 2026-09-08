package com.speak2hr.dto;

import java.util.Map;

public class AssessmentResult {
    private String assessment_id;
    private Integer total_questions;
    private Integer correct_answers;
    private Double score_percentage;
    private Map<String, Object> category_breakdown;

    public AssessmentResult() {}

    public String getAssessment_id() { return assessment_id; }
    public void setAssessment_id(String assessment_id) { this.assessment_id = assessment_id; }

    public Integer getTotal_questions() { return total_questions; }
    public void setTotal_questions(Integer total_questions) { this.total_questions = total_questions; }

    public Integer getCorrect_answers() { return correct_answers; }
    public void setCorrect_answers(Integer correct_answers) { this.correct_answers = correct_answers; }

    public Double getScore_percentage() { return score_percentage; }
    public void setScore_percentage(Double score_percentage) { this.score_percentage = score_percentage; }

    public Map<String, Object> getCategory_breakdown() { return category_breakdown; }
    public void setCategory_breakdown(Map<String, Object> category_breakdown) { this.category_breakdown = category_breakdown; }
}

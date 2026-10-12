package com.speak2hr.dto;

import java.util.Map;

public class AssessmentSubmission {
    private String assessment_id;
    private String user_id;
    private Map<String, Object> answers;

    public AssessmentSubmission() {}

    public String getAssessment_id() { return assessment_id; }
    public void setAssessment_id(String assessment_id) { this.assessment_id = assessment_id; }

    public String getUser_id() { return user_id; }
    public void setUser_id(String user_id) { this.user_id = user_id; }

    public Map<String, Object> getAnswers() { return answers; }
    public void setAnswers(Map<String, Object> answers) { this.answers = answers; }
}

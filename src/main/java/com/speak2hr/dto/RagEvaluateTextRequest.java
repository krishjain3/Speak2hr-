package com.speak2hr.dto;

import java.util.List;

public class RagEvaluateTextRequest {
    private String session_id;
    private Object question_id;
    private String question;
    private String user_answer;
    private String candidate_id;
    private String code_submission;
    private Object expected_keywords;
    private Double weight;
    private String difficulty;
    private String category;

    public RagEvaluateTextRequest() {}

    public String getSession_id() { return session_id; }
    public void setSession_id(String session_id) { this.session_id = session_id; }

    public Object getQuestion_id() { return question_id; }
    public void setQuestion_id(Object question_id) { this.question_id = question_id; }

    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }

    public String getUser_answer() { return user_answer; }
    public void setUser_answer(String user_answer) { this.user_answer = user_answer; }

    public String getCandidate_id() { return candidate_id; }
    public void setCandidate_id(String candidate_id) { this.candidate_id = candidate_id; }

    public String getCode_submission() { return code_submission; }
    public void setCode_submission(String code_submission) { this.code_submission = code_submission; }

    public Object getExpected_keywords() { return expected_keywords; }
    public void setExpected_keywords(Object expected_keywords) { this.expected_keywords = expected_keywords; }

    public Double getWeight() { return weight != null ? weight : 1.0; }
    public void setWeight(Double weight) { this.weight = weight; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}

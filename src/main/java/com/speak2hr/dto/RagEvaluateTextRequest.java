package com.speak2hr.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class RagEvaluateTextRequest {

    @JsonProperty("session_id")
    @JsonAlias({"sessionId"})
    private String session_id;

    @JsonProperty("question_id")
    @JsonAlias({"questionId"})
    private Object question_id;

    private String question;

    @JsonProperty("user_answer")
    @JsonAlias({"userAnswer", "answerText", "answer_text"})
    private String user_answer;

    @JsonProperty("candidate_id")
    @JsonAlias({"candidateId"})
    private String candidate_id;

    @JsonProperty("code_submission")
    @JsonAlias({"codeSubmission"})
    private String code_submission;

    @JsonProperty("expected_keywords")
    @JsonAlias({"expectedKeywords"})
    private Object expected_keywords;

    private Double weight;

    private String difficulty;

    private String category;

    public RagEvaluateTextRequest() {}

    public String getSession_id() { return session_id; }
    public void setSession_id(String session_id) { this.session_id = session_id; }
    public String getSessionId() { return session_id; }
    public void setSessionId(String sessionId) { this.session_id = sessionId; }

    public Object getQuestion_id() { return question_id; }
    public void setQuestion_id(Object question_id) { this.question_id = question_id; }
    public Object getQuestionId() { return question_id; }
    public void setQuestionId(Object questionId) { this.question_id = questionId; }

    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }

    public String getUser_answer() { return user_answer; }
    public void setUser_answer(String user_answer) { this.user_answer = user_answer; }
    public String getUserAnswer() { return user_answer; }
    public void setUserAnswer(String userAnswer) { this.user_answer = userAnswer; }
    public String getAnswerText() { return user_answer; }
    public void setAnswerText(String answerText) { this.user_answer = answerText; }

    public String getCandidate_id() { return candidate_id; }
    public void setCandidate_id(String candidate_id) { this.candidate_id = candidate_id; }
    public String getCandidateId() { return candidate_id; }
    public void setCandidateId(String candidateId) { this.candidate_id = candidateId; }

    public String getCode_submission() { return code_submission; }
    public void setCode_submission(String code_submission) { this.code_submission = code_submission; }
    public String getCodeSubmission() { return code_submission; }
    public void setCodeSubmission(String codeSubmission) { this.code_submission = codeSubmission; }

    public Object getExpected_keywords() { return expected_keywords; }
    public void setExpected_keywords(Object expected_keywords) { this.expected_keywords = expected_keywords; }
    public Object getExpectedKeywords() { return expected_keywords; }
    public void setExpectedKeywords(Object expectedKeywords) { this.expected_keywords = expectedKeywords; }

    public Double getWeight() { return weight != null ? weight : 1.0; }
    public void setWeight(Double weight) { this.weight = weight; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}

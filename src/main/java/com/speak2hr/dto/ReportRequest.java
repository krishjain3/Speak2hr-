package com.speak2hr.dto;

public class ReportRequest {
    private String session_id;
    private String candidate_name;
    private String email;
    private Boolean send_email;

    public ReportRequest() {}

    public String getSession_id() { return session_id; }
    public void setSession_id(String session_id) { this.session_id = session_id; }

    public String getCandidate_name() { return candidate_name; }
    public void setCandidate_name(String candidate_name) { this.candidate_name = candidate_name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public Boolean getSend_email() { return send_email; }
    public void setSend_email(Boolean send_email) { this.send_email = send_email; }
}

package com.speak2hr.dto;

public class SlotBookingRequest {
    private String slot_id;
    private String candidate_id;
    private String candidate_name;
    private String candidate_email;
    private String hr_name;
    private String hr_email;
    private String date;
    private String time;
    private Integer duration;

    public SlotBookingRequest() {}

    public String getSlot_id() { return slot_id; }
    public void setSlot_id(String slot_id) { this.slot_id = slot_id; }

    public String getCandidate_id() { return candidate_id; }
    public void setCandidate_id(String candidate_id) { this.candidate_id = candidate_id; }

    public String getCandidate_name() { return candidate_name; }
    public void setCandidate_name(String candidate_name) { this.candidate_name = candidate_name; }

    public String getCandidate_email() { return candidate_email; }
    public void setCandidate_email(String candidate_email) { this.candidate_email = candidate_email; }

    public String getHr_name() { return hr_name; }
    public void setHr_name(String hr_name) { this.hr_name = hr_name; }

    public String getHr_email() { return hr_email; }
    public void setHr_email(String hr_email) { this.hr_email = hr_email; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }

    public Integer getDuration() { return duration; }
    public void setDuration(Integer duration) { this.duration = duration; }
}

package com.speak2hr.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.dto.InterviewQuestionRequest;
import com.speak2hr.dto.InterviewQuestionsResponse;
import com.speak2hr.dto.ReportRequest;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class InterviewService {

    private static final Logger logger = LoggerFactory.getLogger(InterviewService.class);

    private final QuestionBankManager questionBankManager;
    private final GeminiService geminiService;
    private final ObjectMapper objectMapper;

    // In-memory store for active session evaluations
    private final Map<String, List<Map<String, Object>>> sessionEvaluations = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> sessionMetadata = new ConcurrentHashMap<>();

    public InterviewService(QuestionBankManager questionBankManager, GeminiService geminiService) {
        this.questionBankManager = questionBankManager;
        this.geminiService = geminiService;
        this.objectMapper = new ObjectMapper();
    }

    public InterviewQuestionsResponse generateQuestions(InterviewQuestionRequest request) {
        String sessionId = "sess_" + UUID.randomUUID().toString().substring(0, 8);
        String targetRole = request.getRole() != null ? request.getRole() : "Software Engineer";

        List<Map<String, Object>> questions = questionBankManager.getQuestionsForRole(
                targetRole,
                request.getCandidate_skills(),
                request.getNum_questions()
        );

        Map<String, Object> meta = new HashMap<>();
        meta.put("session_id", sessionId);
        meta.put("candidate_name", request.getCandidate_name());
        meta.put("target_role", targetRole);
        meta.put("created_at", new Date().toString());
        sessionMetadata.put(sessionId, meta);

        InterviewQuestionsResponse response = new InterviewQuestionsResponse();
        response.setSession_id(sessionId);
        response.setQuestions(questions);
        response.setTotal_questions(questions.size());
        response.setTarget_role(targetRole);

        return response;
    }

    public Map<String, Object> evaluateResponse(
            String sessionId,
            String questionId,
            String question,
            String level,
            String levelName,
            String category,
            String difficulty,
            Double weight,
            String expectedKeywordsJson,
            MultipartFile videoFile,
            MultipartFile audioFile
    ) {
        boolean hasAudio = audioFile != null && !audioFile.isEmpty();
        boolean hasVideo = videoFile != null && !videoFile.isEmpty();

        Map<String, Object> evalResult;

        if (!hasAudio && !hasVideo) {
            evalResult = new HashMap<>();
            evalResult.put("overall_score", 0.0);
            evalResult.put("technical_score", 0.0);
            evalResult.put("communication_score", 0.0);
            evalResult.put("clarity", 0.0);
            evalResult.put("completeness", 0.0);
            evalResult.put("feedback", "No candidate audio or video response was submitted for this question.");
            evalResult.put("strengths", List.of());
            evalResult.put("improvements", List.of("Please provide a spoken or recorded response to receive evaluation."));
            evalResult.put("is_fallback", false);
            evalResult.put("evaluation_status", "NO_ANSWER");
        } else {
            String prompt = "Evaluate candidate interview answer for question: '" + question + "'. " +
                    "Expected keywords: " + expectedKeywordsJson + ". " +
                    "Return JSON with fields: overall_score (number 0-100), technical_score (number 0-100), " +
                    "communication_score (number 0-100), clarity (number 0-100), completeness (number 0-100), " +
                    "feedback (string), strengths (list of strings), improvements (list of strings).";

            try {
                String aiResponse = geminiService.generateContent(prompt);
                String jsonText = geminiService.extractJsonFromResponse(aiResponse);
                evalResult = objectMapper.readValue(jsonText, Map.class);

                // Validate and clamp all scores within [0.0, 100.0]
                for (String scoreKey : List.of("overall_score", "technical_score", "communication_score", "clarity", "completeness")) {
                    Object val = evalResult.get(scoreKey);
                    double score = 0.0;
                    if (val instanceof Number) {
                        score = Math.max(0.0, Math.min(100.0, ((Number) val).doubleValue()));
                    }
                    evalResult.put(scoreKey, Math.round(score * 10.0) / 10.0);
                }
                evalResult.put("is_fallback", false);
                evalResult.put("evaluation_status", "COMPLETED");
            } catch (Exception e) {
                logger.warn("Automated AI evaluation failed for question {}. Recording fallback.", questionId, e);
                evalResult = new HashMap<>();
                evalResult.put("overall_score", 0.0);
                evalResult.put("technical_score", 0.0);
                evalResult.put("communication_score", 0.0);
                evalResult.put("clarity", 0.0);
                evalResult.put("completeness", 0.0);
                evalResult.put("feedback", "AI evaluation service was temporarily unavailable. Score could not be determined automatically.");
                evalResult.put("strengths", List.of());
                evalResult.put("improvements", List.of("Automated scoring incomplete. Manual HR review required."));
                evalResult.put("is_fallback", true);
                evalResult.put("evaluation_status", "FALLBACK");
            }
        }

        evalResult.put("session_id", sessionId);
        evalResult.put("question_id", questionId);
        evalResult.put("question", question);

        // Deduplicate repeated question submissions for the same session
        List<Map<String, Object>> evals = sessionEvaluations.computeIfAbsent(sessionId, k -> Collections.synchronizedList(new ArrayList<>()));
        synchronized (evals) {
            evals.removeIf(e -> Objects.equals(e.get("question_id"), questionId));
            evals.add(evalResult);
        }

        return evalResult;
    }

    public Map<String, Object> getSessionSummary(String sessionId) {
        List<Map<String, Object>> evals = sessionEvaluations.getOrDefault(sessionId, List.of());
        Map<String, Object> meta = sessionMetadata.getOrDefault(sessionId, Map.of());

        double totalScore = 0.0;
        double totalTech = 0.0;
        double totalComm = 0.0;
        int validCount = 0;
        boolean hasFallback = false;

        for (Map<String, Object> ev : evals) {
            Boolean isFallback = (Boolean) ev.get("is_fallback");
            if (Boolean.TRUE.equals(isFallback)) {
                hasFallback = true;
            }
            Object s = ev.get("overall_score");
            if (s instanceof Number) {
                totalScore += ((Number) s).doubleValue();
            }
            Object t = ev.get("technical_score");
            if (t instanceof Number) {
                totalTech += ((Number) t).doubleValue();
            }
            Object c = ev.get("communication_score");
            if (c instanceof Number) {
                totalComm += ((Number) c).doubleValue();
            }
            validCount++;
        }
        double avgScore = validCount == 0 ? 0.0 : Math.round((totalScore / validCount) * 10.0) / 10.0;
        double avgTech = validCount == 0 ? 0.0 : Math.round((totalTech / validCount) * 10.0) / 10.0;
        double avgComm = validCount == 0 ? 0.0 : Math.round((totalComm / validCount) * 10.0) / 10.0;

        String status = evals.isEmpty() ? "INCOMPLETE" : (hasFallback ? "PARTIAL_FALLBACK" : "COMPLETED");

        Map<String, Object> summary = new HashMap<>();
        summary.put("session_id", sessionId);
        summary.put("candidate_name", meta.getOrDefault("candidate_name", "Candidate"));
        summary.put("target_role", meta.getOrDefault("target_role", "Software Engineer"));
        summary.put("overall_score", avgScore);
        summary.put("technical_score", avgTech);
        summary.put("communication_score", avgComm);
        summary.put("total_questions_evaluated", evals.size());
        summary.put("evaluations", evals);
        summary.put("is_fallback", hasFallback);
        summary.put("status", status);

        return summary;
    }

    public Map<String, Object> generateReport(ReportRequest request) {
        String filename = "report_" + request.getSession_id() + ".pdf";
        File dir = new File("reports");
        if (!dir.exists()) dir.mkdirs();

        Map<String, Object> summary = getSessionSummary(request.getSession_id());
        double overallScore = 0.0;
        if (summary.get("overall_score") instanceof Number) {
            overallScore = ((Number) summary.get("overall_score")).doubleValue();
        }
        String status = String.valueOf(summary.getOrDefault("status", "COMPLETED"));
        String displayStatus = "PARTIAL_FALLBACK".equals(status) ? "Partial Evaluation (Fallback Detected)" :
                ("INCOMPLETE".equals(status) ? "Incomplete Assessment" :
                (overallScore >= 70.0 ? "Evaluation Completed (Pass)" : "Evaluation Completed (Needs Improvement)"));

        File pdfFile = new File(dir, filename);
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);

            try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
                contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 18);
                contentStream.beginText();
                contentStream.newLineAtOffset(50, 750);
                contentStream.showText("Speak2HR - Candidate Assessment Report");
                contentStream.endText();

                contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                contentStream.beginText();
                contentStream.newLineAtOffset(50, 710);
                contentStream.showText("Candidate Name: " + (request.getCandidate_name() != null ? request.getCandidate_name() : "Candidate"));
                contentStream.newLineAtOffset(0, -20);
                contentStream.showText("Session ID: " + request.getSession_id());
                contentStream.newLineAtOffset(0, -20);
                contentStream.showText("Status: " + displayStatus);
                contentStream.newLineAtOffset(0, -20);
                contentStream.showText("Overall Performance Score: " + overallScore + " / 100");
                contentStream.endText();
            }

            document.save(pdfFile);
        } catch (Exception e) {
            logger.error("Error creating PDF report: {}", filename, e);
        }

        return Map.of(
                "success", true,
                "message", "Report generated successfully",
                "filename", filename,
                "download_url", "/api/interview/download-report/" + filename
        );
    }

    public byte[] downloadReport(String filename) {
        File pdfFile = new File("reports", filename);
        if (pdfFile.exists()) {
            try {
                return java.nio.file.Files.readAllBytes(pdfFile.toPath());
            } catch (Exception e) {
                logger.error("Error reading PDF file: {}", filename, e);
            }
        }
        // Fallback dynamically generated PDF
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
                contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 16);
                contentStream.beginText();
                contentStream.newLineAtOffset(50, 750);
                contentStream.showText("Speak2HR - Assessment Report: " + filename);
                contentStream.endText();
            }
            document.save(baos);
            return baos.toByteArray();
        } catch (Exception e) {
            return new byte[0];
        }
    }
}

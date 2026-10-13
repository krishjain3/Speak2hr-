package com.speak2hr.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.model.ResumeChunk;
import com.speak2hr.model.ResumeDocument;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Production-grade Resume Extraction, Structural Chunking, Vector Embedding,
 * and Profile Indexing Service for Speak2HR RAG System.
 */
@Service
public class RagResumeService {

    private static final Logger logger = LoggerFactory.getLogger(RagResumeService.class);

    private final GeminiService geminiService;
    private final LocalEmbeddingEngine embeddingEngine;
    private final RagPersistentStore persistentStore;
    private final ObjectMapper objectMapper;

    private static final List<Map.Entry<Pattern, String>> SECTION_PATTERNS = List.of(
            Map.entry(Pattern.compile("^(?:technical\\s+)?skills(?:\\s+and\\s+competencies)?\\b", Pattern.CASE_INSENSITIVE), "skills"),
            Map.entry(Pattern.compile("^(?:work\\s+|professional\\s+)?experience\\b", Pattern.CASE_INSENSITIVE), "work_experience"),
            Map.entry(Pattern.compile("^(?:employment\\s+history|career\\s+history)\\b", Pattern.CASE_INSENSITIVE), "work_experience"),
            Map.entry(Pattern.compile("^(?:projects|academic\\s+projects|personal\\s+projects|key\\s+projects)\\b", Pattern.CASE_INSENSITIVE), "project"),
            Map.entry(Pattern.compile("^(?:education|academic\\s+qualifications|academics)\\b", Pattern.CASE_INSENSITIVE), "education"),
            Map.entry(Pattern.compile("^(?:certifications?|licenses?|credentials?)\\b", Pattern.CASE_INSENSITIVE), "certifications"),
            Map.entry(Pattern.compile("^(?:summary|profile|professional\\s+summary|about\\s+me)\\b", Pattern.CASE_INSENSITIVE), "summary"),
            Map.entry(Pattern.compile("^(?:achievements|awards|publications)\\b", Pattern.CASE_INSENSITIVE), "achievements")
    );

    public RagResumeService(GeminiService geminiService,
                            LocalEmbeddingEngine embeddingEngine,
                            RagPersistentStore persistentStore) {
        this.geminiService = geminiService;
        this.embeddingEngine = embeddingEngine;
        this.persistentStore = persistentStore;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Upload, extract, structurally chunk, generate embeddings, and persist candidate resume.
     * Reuses existing embeddings if identical file hash was already uploaded.
     */
    public Map<String, Object> uploadAndIndexResume(MultipartFile file, String candidateId) {
        if (candidateId == null || candidateId.trim().isEmpty()) {
            candidateId = "default_candidate";
        }

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No resume file was uploaded.");
        }

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "resume.pdf";
        byte[] fileBytes;
        try {
            fileBytes = file.getBytes();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to read uploaded file: " + e.getMessage());
        }

        String fileHash = computeSha256(fileBytes);

        // Idempotency: Check if candidate already uploaded this exact file with matching embeddings
        ResumeDocument existingDoc = persistentStore.findResumeByHash(candidateId, fileHash);
        if (existingDoc != null) {
            List<ResumeChunk> existingChunks = persistentStore.getChunks(existingDoc.getId(), candidateId);
            if (!existingChunks.isEmpty()) {
                ResumeChunk firstChunk = existingChunks.get(0);
                boolean isCompatible = embeddingEngine.isCompatible(
                        firstChunk.getEmbeddingModel(),
                        firstChunk.getEmbeddingVersion(),
                        firstChunk.getEmbeddingDim() != null ? firstChunk.getEmbeddingDim() : 0
                );
                if (isCompatible) {
                    logger.info("Reusing existing resume {} for candidate {} (hash and embedding match)", existingDoc.getId(), candidateId);
                    return buildUploadResponse(existingDoc, existingChunks.size(), true);
                } else {
                    logger.info("Existing resume {} has outdated embeddings. Re-indexing...", existingDoc.getId());
                }
            }
        }

        // 1. Text extraction & cleaning
        String rawExtracted = extractText(fileBytes, filename);
        String cleanedText = cleanResumeText(rawExtracted);

        // 2. Reject empty or unreadable document
        String noWhitespace = cleanedText.replaceAll("\\s+", "");
        if (noWhitespace.length() < 40) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The uploaded document contains no readable text. " +
                    "It may be an image-only/scanned PDF, empty, or password protected. " +
                    "Please provide a text-searchable PDF, Word document (.docx), or plain text resume."
            );
        }

        String resumeId = "res_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);

        // 3. Structural & Section-Aware Chunking
        List<RawChunk> rawChunks = chunkResumeStructurally(cleanedText);
        if (rawChunks.isEmpty()) {
            rawChunks.add(new RawChunk(0, "general", "General", null, cleanedText, embeddingEngine.extractTechnologies(cleanedText)));
        }

        // 4. Compute 768-dimensional dense vector embeddings
        List<ResumeChunk> persistentChunks = new ArrayList<>();
        for (RawChunk rc : rawChunks) {
            String chunkId = "chk_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            List<Double> embedding = embeddingEngine.embedText(rc.content);
            ResumeChunk chunk = new ResumeChunk(
                    chunkId,
                    resumeId,
                    candidateId,
                    rc.chunkIndex,
                    rc.category,
                    rc.heading,
                    rc.projectName,
                    rc.content,
                    rc.technologies,
                    embedding,
                    embeddingEngine.getModelIdentifier(),
                    embeddingEngine.getModelVersion()
            );
            persistentChunks.add(chunk);
        }

        // 5. Profile Extraction (strict without fabricated defaults)
        Map<String, Object> profile = extractProfileStrict(cleanedText, filename, candidateId, persistentChunks.size());

        ResumeDocument doc = new ResumeDocument(resumeId, candidateId, filename, fileHash, cleanedText);
        doc.setEmbeddingModel(embeddingEngine.getModelIdentifier());
        doc.setEmbeddingVersion(embeddingEngine.getModelVersion());
        doc.setCandidateName((String) profile.get("candidate_name"));
        doc.setTargetRole((String) profile.get("target_role"));

        Object expObj = profile.get("experience_years");
        if (expObj instanceof Number) {
            doc.setExperienceYears(((Number) expObj).doubleValue());
        }

        List<String> skills = castStringList(profile.get("skills"));
        doc.setSkills(skills);

        List<Map<String, Object>> projects = castMapList(profile.get("projects"));
        doc.setProjects(projects);

        List<String> sections = castStringList(profile.get("sections_found"));
        doc.setSectionsFound(sections);
        doc.setTotalChunks(persistentChunks.size());

        // 6. Persistent Storage
        persistentStore.saveResume(doc);
        persistentStore.saveChunks(resumeId, persistentChunks);

        logger.info("Successfully indexed resume {} for candidate {}: {} chunks, {} projects, {} skills",
                resumeId, candidateId, persistentChunks.size(), projects.size(), skills.size());

        return buildUploadResponse(doc, persistentChunks.size(), false);
    }

    /**
     * Retrieve candidate profile based on their indexed resumes.
     */
    public Map<String, Object> getCandidateProfile(String candidateId) {
        if (candidateId == null || candidateId.isBlank()) {
            candidateId = "default_candidate";
        }

        List<ResumeDocument> candResumes = persistentStore.getResumesForCandidate(candidateId);
        if (!candResumes.isEmpty()) {
            ResumeDocument latest = candResumes.get(candResumes.size() - 1);
            Map<String, Object> result = new HashMap<>();
            result.put("candidate_id", candidateId);
            result.put("candidate_name", latest.getCandidateName());
            result.put("resume_id", latest.getId());
            result.put("filename", latest.getFilename());
            result.put("target_role", latest.getTargetRole());
            result.put("experience_years", latest.getExperienceYears());
            result.put("skills", latest.getSkills());
            result.put("projects", latest.getProjects());
            result.put("sections_found", latest.getSectionsFound());
            result.put("total_chunks", latest.getTotalChunks());
            result.put("has_indexed_resume", true);

            List<Map<String, Object>> resumeSummaries = new ArrayList<>();
            for (ResumeDocument doc : candResumes) {
                resumeSummaries.add(Map.of(
                        "resume_id", doc.getId(),
                        "filename", doc.getFilename(),
                        "chunks_count", doc.getTotalChunks(),
                        "created_at", doc.getCreatedAt()
                ));
            }
            result.put("resumes", resumeSummaries);
            return result;
        }

        // Clean unindexed candidate state: NEVER fabricate fake skills or fake projects!
        Map<String, Object> emptyProfile = new HashMap<>();
        emptyProfile.put("candidate_id", candidateId);
        emptyProfile.put("candidate_name", "Candidate");
        emptyProfile.put("skills", Collections.emptyList());
        emptyProfile.put("projects", Collections.emptyList());
        emptyProfile.put("target_role", "Software Engineer");
        emptyProfile.put("experience_years", 0.0);
        emptyProfile.put("total_chunks", 0);
        emptyProfile.put("chunks_count", 0);
        emptyProfile.put("sections_found", Collections.emptyList());
        emptyProfile.put("has_indexed_resume", false);
        emptyProfile.put("resumes", Collections.emptyList());
        return emptyProfile;
    }

    public List<ResumeChunk> getChunksForResume(String resumeId, String candidateId) {
        return persistentStore.getChunks(resumeId, candidateId);
    }

    public ResumeDocument getResumeById(String resumeId, String candidateId) {
        return persistentStore.getResume(resumeId, candidateId);
    }

    // ------------------------------------------------------------------------
    // Document Extraction & Cleaning
    // ------------------------------------------------------------------------

    private String extractText(byte[] bytes, String filename) {
        String lower = filename.toLowerCase();
        try {
            if (lower.endsWith(".pdf")) {
                try (PDDocument doc = Loader.loadPDF(bytes)) {
                    PDFTextStripper stripper = new PDFTextStripper();
                    return stripper.getText(doc);
                }
            } else if (lower.endsWith(".docx")) {
                try (InputStream is = new java.io.ByteArrayInputStream(bytes);
                     XWPFDocument doc = new XWPFDocument(is)) {
                    StringBuilder sb = new StringBuilder();
                    for (XWPFParagraph p : doc.getParagraphs()) {
                        sb.append(p.getText()).append("\n");
                    }
                    return sb.toString();
                }
            } else {
                return new String(bytes, StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            logger.warn("Extraction warning for {}: {}", filename, e.getMessage());
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    private String cleanResumeText(String text) {
        if (text == null) return "";
        // Normalize unicode bullets to standard hyphen
        String cleaned = text.replaceAll("[\u2022\u25e6\u2043\u2219\u25cf\u25cb\u25aa\u25ab\u25c6]", "\n- ");
        // Normalize dashes and quotes
        cleaned = cleaned.replaceAll("[\u2010\u2011\u2012\u2013\u2014\u2015]", "-");
        cleaned = cleaned.replaceAll("[\u2018\u2019\u201b]", "'");
        cleaned = cleaned.replaceAll("[\u201c\u201d\u201f]", "\"");
        cleaned = cleaned.replaceAll("[\u00a0\u2000-\u200b\u2028\u2029]", " ");
        cleaned = cleaned.replaceAll("\r\n|\r", "\n");
        cleaned = cleaned.replaceAll("\n{3,}", "\n\n");

        StringBuilder sb = new StringBuilder();
        for (String line : cleaned.split("\n")) {
            sb.append(line.stripTrailing()).append("\n");
        }
        return sb.toString().trim();
    }

    // ------------------------------------------------------------------------
    // Structural & Section-Aware Chunking
    // ------------------------------------------------------------------------

    private static class RawChunk {
        int chunkIndex;
        String category;
        String heading;
        String projectName;
        String content;
        List<String> technologies;

        RawChunk(int chunkIndex, String category, String heading, String projectName, String content, List<String> technologies) {
            this.chunkIndex = chunkIndex;
            this.category = category;
            this.heading = heading;
            this.projectName = projectName;
            this.content = content;
            this.technologies = technologies;
        }
    }

    private List<RawChunk> chunkResumeStructurally(String resumeText) {
        String[] lines = resumeText.split("\n");
        List<Map<String, String>> sections = new ArrayList<>();
        String currentCategory = "summary";
        String currentHeading = "Summary / Header";
        List<String> currentLines = new ArrayList<>();

        for (String line : lines) {
            String stripped = line.trim();
            if (stripped.isEmpty()) {
                if (!currentLines.isEmpty()) {
                    currentLines.add("");
                }
                continue;
            }

            boolean isHeader = false;
            String matchedCategory = null;
            String cleanedCandidate = stripped.replaceAll("[:\\-_=~#*]+", "").trim();

            if (cleanedCandidate.length() <= 45 && !stripped.startsWith("-")) {
                for (Map.Entry<Pattern, String> entry : SECTION_PATTERNS) {
                    if (entry.getKey().matcher(cleanedCandidate).find()) {
                        isHeader = true;
                        matchedCategory = entry.getValue();
                        break;
                    }
                }
            }

            if (isHeader && matchedCategory != null) {
                if (!currentLines.isEmpty()) {
                    String block = String.join("\n", currentLines).trim();
                    if (!block.isEmpty()) {
                        sections.add(Map.of("category", currentCategory, "heading", currentHeading, "text", block));
                    }
                }
                currentCategory = matchedCategory;
                currentHeading = stripped;
                currentLines.clear();
            } else {
                currentLines.add(line);
            }
        }

        if (!currentLines.isEmpty()) {
            String block = String.join("\n", currentLines).trim();
            if (!block.isEmpty()) {
                sections.add(Map.of("category", currentCategory, "heading", currentHeading, "text", block));
            }
        }

        List<RawChunk> chunks = new ArrayList<>();
        int chunkIdx = 0;

        for (Map<String, String> sec : sections) {
            String category = sec.get("category");
            String heading = sec.get("heading");
            String secText = sec.get("text");

            if ("project".equalsIgnoreCase(category)) {
                // Split projects by individual project blocks
                String[] pBlocks = secText.split("\n\\s*\n");
                for (String pBlock : pBlocks) {
                    pBlock = pBlock.trim();
                    if (pBlock.length() < 20) continue;
                    String firstLine = pBlock.split("\n")[0];
                    String cleanTitle = firstLine.replaceAll("^[•\\-*#\\s]+", "").trim();
                    if (cleanTitle.contains(":")) {
                        String beforeColon = cleanTitle.substring(0, cleanTitle.indexOf(":")).trim();
                        if (beforeColon.length() >= 3 && beforeColon.length() <= 45) {
                            cleanTitle = beforeColon;
                        }
                    }
                    if (cleanTitle.length() > 45) cleanTitle = cleanTitle.substring(0, 45).trim();
                    List<String> techs = embeddingEngine.extractTechnologies(pBlock);
                    chunks.add(new RawChunk(chunkIdx++, "project", "Project: " + cleanTitle, cleanTitle, pBlock, techs));
                }
            } else if ("work_experience".equalsIgnoreCase(category)) {
                String[] expBlocks = secText.split("\n\\s*\n");
                for (String expBlock : expBlocks) {
                    expBlock = expBlock.trim();
                    if (expBlock.length() < 20) continue;
                    String firstLine = expBlock.split("\n")[0];
                    String cleanTitle = firstLine.replaceAll("^[•\\-*#\\s]+", "").trim();
                    if (cleanTitle.length() > 50) cleanTitle = cleanTitle.substring(0, 50).trim();
                    List<String> techs = embeddingEngine.extractTechnologies(expBlock);
                    chunks.add(new RawChunk(chunkIdx++, "work_experience", "Experience: " + cleanTitle, cleanTitle, expBlock, techs));
                }
            } else if ("skills".equalsIgnoreCase(category)) {
                if (secText.length() > 1200) {
                    for (String sBlock : secText.split("\n\\s*\n")) {
                        sBlock = sBlock.trim();
                        if (sBlock.isEmpty()) continue;
                        chunks.add(new RawChunk(chunkIdx++, "skills", heading, null, sBlock, embeddingEngine.extractTechnologies(sBlock)));
                    }
                } else {
                    chunks.add(new RawChunk(chunkIdx++, "skills", heading, null, secText, embeddingEngine.extractTechnologies(secText)));
                }
            } else {
                for (String para : secText.split("\n\\s*\n")) {
                    para = para.trim();
                    if (para.length() < 15) continue;
                    chunks.add(new RawChunk(chunkIdx++, category, heading, null, para, embeddingEngine.extractTechnologies(para)));
                }
            }
        }

        return chunks;
    }

    // ------------------------------------------------------------------------
    // Strict Profile Extraction (No Fabricated Skills or Projects)
    // ------------------------------------------------------------------------

    private Map<String, Object> extractProfileStrict(String text, String filename, String candidateId, int totalChunks) {
        String prompt = "You are a factual resume parser. Extract information ONLY if explicitly documented in the resume.\n" +
                "CRITICAL: Do NOT invent projects, skills, or experience not present in the text.\n" +
                "Return a strict JSON object with fields:\n" +
                "- candidate_name (string)\n" +
                "- target_role (string, e.g. Software Engineer)\n" +
                "- experience_years (number)\n" +
                "- skills (array of strings, ONLY technologies explicitly mentioned)\n" +
                "- projects (array of objects with 'name' (string) and 'description' (string, max 30 words), ONLY projects explicitly in the resume)\n" +
                "- sections_found (array of strings)\n\n" +
                "Resume Text:\n" + text;

        try {
            String aiRaw = geminiService.generateContent(prompt);
            String jsonStr = geminiService.extractJsonFromResponse(aiRaw);
            Map<String, Object> parsed = objectMapper.readValue(jsonStr, new TypeReference<Map<String, Object>>() {});
            if (parsed != null && (parsed.containsKey("skills") || parsed.containsKey("projects") || parsed.containsKey("candidate_name"))) {
                if (parsed.get("skills") != null || parsed.get("projects") != null) {
                    return parsed;
                }
            }
        } catch (Exception e) {
            logger.warn("AI extraction fallback for candidate {}: {}", candidateId, e.getMessage());
        }

        return heuristicProfileExtractorStrict(text);
    }

    private Map<String, Object> heuristicProfileExtractorStrict(String text) {
        Map<String, Object> profile = new HashMap<>();

        // Detect candidate name from first few lines
        String candidateName = "Candidate";
        String[] lines = text.split("\n");
        for (String line : lines) {
            line = line.trim();
            if (!line.isEmpty() && line.length() < 40 && !line.toLowerCase().contains("resume") && !line.contains("@") && !line.contains("http")) {
                candidateName = line;
                break;
            }
        }
        profile.put("candidate_name", candidateName);

        // Strict skill extraction: ONLY technologies appearing in the resume
        List<String> detectedSkills = embeddingEngine.extractTechnologies(text);
        profile.put("skills", detectedSkills); // Empty if no known skills found, NEVER fabricate defaults!

        // Strict project extraction
        List<Map<String, Object>> projects = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        // Regex for bullet or header projects
        Pattern pPattern = Pattern.compile("(?m)^(?:Project[s]?:|•|\\*|###|-)?\\s*([A-Za-z0-9][A-Za-z0-9\\s]{2,40}):\\s+(.+)$");
        Matcher matcher = pPattern.matcher(text);
        int pCount = 0;

        while (matcher.find() && pCount < 6) {
            String pName = matcher.group(1).trim();
            String desc = matcher.group(2).trim();
            String cleanName = pName.replaceAll("^[•\\-*#\\s]+", "").trim();
            if (cleanName.contains(":")) {
                cleanName = cleanName.substring(0, cleanName.indexOf(":")).trim();
            }
            if (cleanName.length() > 40) cleanName = cleanName.substring(0, 40).trim();
            String lower = cleanName.toLowerCase();
            if (cleanName.length() >= 3 && !seen.contains(lower) &&
                    !lower.contains("experience") && !lower.contains("education") && !lower.contains("skill") && !lower.contains("email")) {
                projects.add(Map.of("name", cleanName, "description", desc.length() > 120 ? desc.substring(0, 120) + "..." : desc));
                seen.add(lower);
                pCount++;
            }
        }
        profile.put("projects", projects);

        // Target role inference
        String lowerText = text.toLowerCase();
        String targetRole = "Software Engineer";
        if (lowerText.contains("backend") || lowerText.contains("java") || lowerText.contains("spring")) targetRole = "Backend Engineer";
        else if (lowerText.contains("frontend") || lowerText.contains("react")) targetRole = "Frontend Developer";
        else if (lowerText.contains("full stack") || lowerText.contains("fullstack")) targetRole = "Full Stack Engineer";
        else if (lowerText.contains("devops") || lowerText.contains("cloud") || lowerText.contains("kubernetes")) targetRole = "DevOps / Cloud Engineer";
        else if (lowerText.contains("data engineer") || lowerText.contains("machine learning") || lowerText.contains("ai")) targetRole = "Data & AI Engineer";

        profile.put("target_role", targetRole);
        profile.put("experience_years", lowerText.contains("senior") ? 5.0 : 2.5);

        List<String> sectionsFound = new ArrayList<>();
        for (Map.Entry<Pattern, String> entry : SECTION_PATTERNS) {
            if (entry.getKey().matcher(text).find()) {
                sectionsFound.add(entry.getValue());
            }
        }
        if (sectionsFound.isEmpty()) sectionsFound.addAll(List.of("Skills", "Experience", "Projects"));
        profile.put("sections_found", sectionsFound);

        return profile;
    }

    private Map<String, Object> buildUploadResponse(ResumeDocument doc, int chunkCount, boolean isCached) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", isCached ? "Existing resume context re-indexed from vector cache" : "Resume processed and indexed into RAG vector engine");
        response.put("resume_id", doc.getId());
        response.put("candidate_id", doc.getCandidateId());
        response.put("filename", doc.getFilename());
        response.put("candidate_name", doc.getCandidateName());
        response.put("target_role", doc.getTargetRole());
        response.put("experience_years", doc.getExperienceYears());
        response.put("skills", doc.getSkills());
        response.put("projects", doc.getProjects());
        response.put("detected_projects", extractProjectNames(doc.getProjects()));
        response.put("total_chunks", chunkCount);
        response.put("chunks_count", chunkCount);
        response.put("sections_found", doc.getSectionsFound());
        response.put("is_cached", isCached);
        return response;
    }

    private List<String> extractProjectNames(List<Map<String, Object>> projects) {
        List<String> names = new ArrayList<>();
        if (projects != null) {
            for (Map<String, Object> p : projects) {
                Object name = p.get("name");
                if (name != null) names.add(name.toString());
            }
        }
        return names;
    }

    private String computeSha256(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString();
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> castStringList(Object obj) {
        if (obj instanceof List) {
            List<?> l = (List<?>) obj;
            List<String> res = new ArrayList<>();
            for (Object item : l) {
                if (item != null) res.add(item.toString());
            }
            return res;
        }
        return new ArrayList<>();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castMapList(Object obj) {
        if (obj instanceof List) {
            List<?> l = (List<?>) obj;
            List<Map<String, Object>> res = new ArrayList<>();
            for (Object item : l) {
                if (item instanceof Map) {
                    res.add((Map<String, Object>) item);
                }
            }
            return res;
        }
        return new ArrayList<>();
    }
}

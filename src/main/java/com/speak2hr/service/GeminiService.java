package com.speak2hr.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GeminiService {

    private static final Logger logger = LoggerFactory.getLogger(GeminiService.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final List<String> apiKeys = new ArrayList<>();

    @Value("${gemini.model:gemini-2.0-flash}")
    private String modelName;

    // Optional mock generator for testing without incurring API charges
    private volatile Function<String, String> mockContentGenerator = null;

    public GeminiService(
            @Value("${gemini.api.key:}") String primaryKey,
            @Value("${gemini.api.key.1:}") String key1,
            @Value("${gemini.api.key.2:}") String key2,
            @Value("${gemini.api.key.3:}") String key3,
            @Value("${gemini.api.key.4:}") String key4,
            @Value("${gemini.api.key.5:}") String key5
    ) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();

        if (primaryKey != null && !primaryKey.isBlank()) apiKeys.add(primaryKey);
        if (key1 != null && !key1.isBlank() && !apiKeys.contains(key1)) apiKeys.add(key1);
        if (key2 != null && !key2.isBlank() && !apiKeys.contains(key2)) apiKeys.add(key2);
        if (key3 != null && !key3.isBlank() && !apiKeys.contains(key3)) apiKeys.add(key3);
        if (key4 != null && !key4.isBlank() && !apiKeys.contains(key4)) apiKeys.add(key4);
        if (key5 != null && !key5.isBlank() && !apiKeys.contains(key5)) apiKeys.add(key5);

        String envKey = System.getenv("GEMINI_API_KEY");
        if (envKey != null && !envKey.isBlank() && !apiKeys.contains(envKey)) {
            apiKeys.add(envKey);
        }

        // Try reading .env file if still empty
        if (apiKeys.isEmpty()) {
            loadKeyFromEnvFile(".env");
            loadKeyFromEnvFile("ML/.env");
        }
    }

    private void loadKeyFromEnvFile(String path) {
        try {
            java.io.File file = new java.io.File(path);
            if (file.exists()) {
                for (String line : java.nio.file.Files.readAllLines(file.toPath())) {
                    line = line.trim();
                    if (line.startsWith("GEMINI_API_KEY=") || line.startsWith("GEMINI_API_KEY_1=")) {
                        String val = line.substring(line.indexOf('=') + 1).trim();
                        if (val.startsWith("\"") && val.endsWith("\"") && val.length() >= 2) {
                            val = val.substring(1, val.length() - 1);
                        }
                        if (!val.isBlank() && !apiKeys.contains(val)) {
                            apiKeys.add(val);
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    public List<String> getApiKeys() {
        return Collections.unmodifiableList(apiKeys);
    }

    public synchronized void addApiKey(String key) {
        if (key != null && !key.isBlank() && !apiKeys.contains(key)) {
            apiKeys.add(key);
        }
    }

    public void setMockContentGenerator(Function<String, String> generator) {
        this.mockContentGenerator = generator;
    }

    public void clearMockContentGenerator() {
        this.mockContentGenerator = null;
    }

    public String generateContent(String prompt) {
        if (mockContentGenerator != null) {
            String mockResult = mockContentGenerator.apply(prompt);
            if (mockResult != null) {
                return mockResult;
            }
        }

        if (apiKeys.isEmpty()) {
            logger.error("No Gemini API keys configured. Generation failed.");
            throw new GeminiApiException(
                    "No Gemini API key configured. Please set GEMINI_API_KEY in environment or application.properties.",
                    401
            );
        }

        String lastError = "Unknown error";
        int lastStatusCode = 502;

        for (int i = 0; i < apiKeys.size(); i++) {
            String apiKey = apiKeys.get(i);
            try {
                String url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey;

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                Map<String, Object> part = Map.of("text", prompt);
                Map<String, Object> content = Map.of("parts", List.of(part));
                Map<String, Object> requestBody = Map.of("contents", List.of(content));

                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    JsonNode root = objectMapper.readTree(response.getBody());
                    JsonNode candidates = root.path("candidates");
                    if (candidates.isArray() && candidates.size() > 0) {
                        JsonNode textNode = candidates.get(0).path("content").path("parts").get(0).path("text");
                        if (!textNode.isMissingNode()) {
                            return textNode.asText();
                        }
                    }
                }
                lastError = "Response returned empty candidates from Gemini API";
            } catch (HttpStatusCodeException e) {
                lastStatusCode = e.getStatusCode().value();
                lastError = "HTTP " + lastStatusCode + ": " + e.getResponseBodyAsString();
                logger.warn("Gemini API key #{} failed with status {}: {}", i + 1, lastStatusCode, e.getMessage());
            } catch (Exception e) {
                lastError = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                logger.warn("Gemini API key #{} failed: {}. Retrying with next key...", i + 1, lastError);
            }
        }

        logger.error("All Gemini API keys failed. Error: {}", lastError);
        throw new GeminiApiException("Gemini API request failed: " + lastError, lastStatusCode);
    }

    public String extractJsonFromResponse(String text) {
        if (text == null) return "{}";
        text = text.trim();
        if (text.startsWith("```json")) {
            text = text.substring(7);
        } else if (text.startsWith("```")) {
            text = text.substring(3);
        }
        if (text.endsWith("```")) {
            text = text.substring(0, text.length() - 3);
        }
        text = text.trim();

        Matcher matcher = Pattern.compile("(\\{.*\\}|\\[.*\\])", Pattern.DOTALL).matcher(text);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return text;
    }
}

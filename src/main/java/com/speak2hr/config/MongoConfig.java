package com.speak2hr.config;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

@Configuration
public class MongoConfig {

    private static final Logger logger = LoggerFactory.getLogger(MongoConfig.class);

    @Value("${spring.data.mongodb.uri:mongodb://localhost:27017/speak2hr}")
    private String mongoUri;

    @Bean
    @Primary
    public MongoClient mongoClient() {
        try {
            logger.info("Initializing MongoClient with URI: {}", mongoUri);
            return MongoClients.create(mongoUri);
        } catch (Exception e) {
            logger.warn("MongoClient initialization warning: {}", e.getMessage());
            return MongoClients.create("mongodb://localhost:27017/speak2hr");
        }
    }

    @Bean
    @Primary
    public MongoTemplate mongoTemplate(MongoClient mongoClient) {
        try {
            SimpleMongoClientDatabaseFactory factory = new SimpleMongoClientDatabaseFactory(mongoClient, "speak2hr");
            return new MongoTemplate(factory);
        } catch (Exception e) {
            logger.warn("MongoTemplate fallback initialization: {}", e.getMessage());
            return null;
        }
    }
}

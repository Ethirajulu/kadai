# ELK Stack Integration for Security Monitoring

This document provides configuration examples for integrating the security monitoring system with the ELK stack (Elasticsearch, Logstash, Kibana).

## Environment Variables

Add the following environment variables to your application:

```bash
# Elasticsearch Configuration
SECURITY_MONITORING_ELASTICSEARCH_ENABLED=true
SECURITY_MONITORING_ELASTICSEARCH_NODE=http://localhost:9200
SECURITY_MONITORING_ELASTICSEARCH_AUTH_USERNAME=elastic
SECURITY_MONITORING_ELASTICSEARCH_AUTH_PASSWORD=your_password
# OR use API key authentication
SECURITY_MONITORING_ELASTICSEARCH_API_KEY=your_api_key

# Index Configuration
SECURITY_MONITORING_ELASTICSEARCH_INDICES_SECURITY=kadai-security-logs
SECURITY_MONITORING_ELASTICSEARCH_INDICES_ALERTS=kadai-security-alerts
SECURITY_MONITORING_ELASTICSEARCH_INDICES_METRICS=kadai-security-metrics

# Performance Tuning
SECURITY_MONITORING_ELASTICSEARCH_BATCH_SIZE=100
SECURITY_MONITORING_ELASTICSEARCH_FLUSH_INTERVAL=30
SECURITY_MONITORING_ELASTICSEARCH_MAX_RETRIES=3
SECURITY_MONITORING_ELASTICSEARCH_REQUEST_TIMEOUT=30000

# Log Retention
SECURITY_RETENTION_ENABLED=true
SECURITY_RETENTION_POLICIES_AUDIT_RETENTION_DAYS=90
SECURITY_RETENTION_POLICIES_AUDIT_ARCHIVE_AFTER_DAYS=30
SECURITY_RETENTION_POLICIES_ELASTICSEARCH_RETENTION_DAYS=180
SECURITY_RETENTION_POLICIES_ELASTICSEARCH_ILM_POLICY_ENABLED=true

# Winston Logging
LOG_LEVEL=info
SECURITY_MONITORING_LOG_DIRECTORY=logs/security

# Aggregation Backends
SECURITY_MONITORING_AGGREGATION_ENABLED=true
SECURITY_MONITORING_AGGREGATION_BACKENDS=FILE,WEBHOOK,CUSTOM
SECURITY_MONITORING_AGGREGATION_WEBHOOK_URL=http://your-webhook-endpoint/logs
SECURITY_MONITORING_AGGREGATION_CUSTOM_ENDPOINT=http://your-log-aggregator/api

# Email Alerting
SECURITY_MONITORING_ALERTING_ENABLED=true
SECURITY_MONITORING_ALERTING_CHANNELS=EMAIL,WEBHOOK
SECURITY_MONITORING_ALERTING_EMAIL_SMTP_HOST=smtp.gmail.com
SECURITY_MONITORING_ALERTING_EMAIL_SMTP_PORT=587
SECURITY_MONITORING_ALERTING_EMAIL_USERNAME=your-email@gmail.com
SECURITY_MONITORING_ALERTING_EMAIL_PASSWORD=your-app-password
SECURITY_MONITORING_ALERTING_EMAIL_FROM_ADDRESS=security@kadai.com
SECURITY_MONITORING_ALERTING_EMAIL_RECIPIENTS=admin@kadai.com,security@kadai.com
```

## Docker Compose Configuration

### Complete ELK Stack with Kadai Security

```yaml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: kadai-elasticsearch
    environment:
      - node.name=kadai-es-node
      - cluster.name=kadai-security-cluster
      - discovery.type=single-node
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
      - xpack.security.enabled=true
      - ELASTIC_PASSWORD=kadai_security_2024
      - xpack.security.http.ssl.enabled=false
      - xpack.security.transport.ssl.enabled=false
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
      - ./elk-config/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml:ro
    ports:
      - "9200:9200"
      - "9300:9300"
    networks:
      - kadai-security-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200/_cluster/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    container_name: kadai-logstash
    volumes:
      - ./elk-config/logstash.conf:/usr/share/logstash/pipeline/logstash.conf:ro
      - ./elk-config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
    ports:
      - "5044:5044"
      - "5000:5000/tcp"
      - "5000:5000/udp"
      - "9600:9600"
    environment:
      - "LS_JAVA_OPTS=-Xmx512m -Xms512m"
    networks:
      - kadai-security-network
    depends_on:
      elasticsearch:
        condition: service_healthy

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: kadai-kibana
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_USERNAME=elastic
      - ELASTICSEARCH_PASSWORD=kadai_security_2024
      - SERVER_NAME=kadai-kibana
      - SERVER_HOST=0.0.0.0
    volumes:
      - ./elk-config/kibana.yml:/usr/share/kibana/config/kibana.yml:ro
    networks:
      - kadai-security-network
    depends_on:
      elasticsearch:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    container_name: kadai-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - kadai-security-network
    command: redis-server --appendonly yes --requirepass kadai_redis_2024

volumes:
  elasticsearch_data:
    driver: local
  redis_data:
    driver: local

networks:
  kadai-security-network:
    driver: bridge
```

## Elasticsearch Configuration

### elasticsearch.yml
```yaml
cluster.name: kadai-security-cluster
node.name: kadai-es-node

# Network
network.host: 0.0.0.0
http.port: 9200

# Discovery
discovery.type: single-node

# Security
xpack.security.enabled: true
xpack.security.http.ssl.enabled: false
xpack.security.transport.ssl.enabled: false

# Performance
indices.memory.index_buffer_size: 20%
indices.memory.min_index_buffer_size: 96mb

# Index Lifecycle Management
xpack.ilm.enabled: true
```

## Logstash Configuration

### logstash.conf
```ruby
input {
  # HTTP input for webhook logs
  http {
    port => 5000
    codec => json
  }
  
  # File input for log files
  file {
    path => "/var/log/kadai/security/*.log"
    start_position => "beginning"
    codec => json
  }
  
  # Beats input (if using Filebeat)
  beats {
    port => 5044
  }
}

filter {
  # Parse timestamp
  date {
    match => [ "timestamp", "ISO8601" ]
    target => "@timestamp"
  }
  
  # Add geolocation for source IPs
  if [sourceIp] {
    geoip {
      source => "sourceIp"
      target => "geoip"
    }
  }
  
  # Enrich security events
  if [eventType] {
    mutate {
      add_field => { "security_category" => "kadai_security" }
    }
    
    # Tag critical events
    if [severity] == "CRITICAL" {
      mutate {
        add_tag => [ "critical_security_event" ]
      }
    }
    
    # Tag authentication events
    if [eventType] in ["LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT"] {
      mutate {
        add_tag => [ "authentication" ]
      }
    }
    
    # Tag potential threats
    if [eventType] in ["BRUTE_FORCE_ATTEMPT", "SUSPICIOUS_ACTIVITY", "MALICIOUS_INPUT_DETECTED"] {
      mutate {
        add_tag => [ "threat_detection" ]
      }
    }
  }
  
  # Parse user agent
  if [userAgent] {
    useragent {
      source => "userAgent"
      target => "user_agent_parsed"
    }
  }
  
  # Remove sensitive fields (if any)
  mutate {
    remove_field => [ "password", "token", "sensitive_data" ]
  }
}

output {
  # Send to Elasticsearch
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    user => "elastic"
    password => "kadai_security_2024"
    
    # Dynamic index based on event type
    index => "kadai-security-logs-%{+YYYY.MM.dd}"
    
    # Use event ID as document ID to prevent duplicates
    document_id => "%{id}"
    
    # Template for index settings
    template_name => "kadai-security-template"
    template_pattern => "kadai-security-*"
    template => "/usr/share/logstash/templates/kadai-security-template.json"
  }
  
  # Debug output (remove in production)
  stdout {
    codec => rubydebug
  }
}
```

### logstash.yml
```yaml
node.name: kadai-logstash
path.data: /usr/share/logstash/data
pipeline.workers: 2
pipeline.batch.size: 125
pipeline.batch.delay: 50
http.host: "0.0.0.0"
xpack.monitoring.enabled: false
```

## Kibana Configuration

### kibana.yml
```yaml
server.name: kadai-kibana
server.host: 0.0.0.0
server.port: 5601

elasticsearch.hosts: ["http://elasticsearch:9200"]
elasticsearch.username: "elastic"
elasticsearch.password: "kadai_security_2024"

# Security
server.ssl.enabled: false
xpack.security.enabled: true
xpack.encryptedSavedObjects.encryptionKey: "kadai_kibana_encryption_key_32_chars"

# Logging
logging.level: info
logging.appenders:
  file:
    type: file
    fileName: /usr/share/kibana/logs/kibana.log
    layout:
      type: json

# Index patterns
kibana.defaultAppId: "discover"
```

## Index Templates

### Security Logs Template (save as elk-config/security-logs-template.json)
```json
{
  "index_patterns": ["kadai-security-logs-*"],
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1,
    "index.lifecycle.name": "kadai-security-policy",
    "index.lifecycle.rollover_alias": "kadai-security-logs"
  },
  "mappings": {
    "properties": {
      "@timestamp": { "type": "date" },
      "id": { "type": "keyword" },
      "timestamp": { "type": "date" },
      "eventType": { "type": "keyword" },
      "severity": { "type": "keyword" },
      "category": { "type": "keyword" },
      "message": { 
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 256 }
        }
      },
      "sourceIp": { "type": "ip" },
      "userId": { "type": "keyword" },
      "username": { "type": "keyword" },
      "userRole": { "type": "keyword" },
      "country": { "type": "keyword" },
      "region": { "type": "keyword" },
      "city": { "type": "keyword" },
      "requestMethod": { "type": "keyword" },
      "requestPath": { 
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 256 }
        }
      },
      "userAgent": { 
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 256 }
        }
      },
      "geoip": {
        "properties": {
          "location": { "type": "geo_point" },
          "country_name": { "type": "keyword" },
          "city_name": { "type": "keyword" },
          "continent_code": { "type": "keyword" }
        }
      }
    }
  }
}
```

## Index Lifecycle Management (ILM) Policy

```json
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "5gb",
            "max_age": "1d"
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "set_priority": {
            "priority": 50
          },
          "allocate": {
            "number_of_replicas": 0
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "set_priority": {
            "priority": 0
          }
        }
      },
      "delete": {
        "min_age": "90d"
      }
    }
  }
}
```

## Kibana Dashboards

### Security Overview Dashboard

Create these visualizations in Kibana:

1. **Security Events Timeline**
   - Type: Line chart
   - X-axis: @timestamp (Date histogram)
   - Y-axis: Count
   - Split series: severity

2. **Top Event Types**
   - Type: Pie chart
   - Buckets: eventType (Terms aggregation)

3. **Geographic Distribution**
   - Type: Map
   - Geohash: geoip.location
   - Metrics: Count

4. **Failed Login Attempts**
   - Type: Data table
   - Filters: eventType: "LOGIN_FAILURE"
   - Columns: sourceIp, username, timestamp

5. **Security Alerts Over Time**
   - Type: Area chart
   - Filter: severity: "HIGH" OR severity: "CRITICAL"

### Sample Kibana Queries

```json
// Failed login attempts from suspicious IPs
{
  "query": {
    "bool": {
      "must": [
        { "term": { "eventType": "LOGIN_FAILURE" } },
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "suspicious_ips": {
      "terms": {
        "field": "sourceIp",
        "size": 10,
        "min_doc_count": 5
      }
    }
  }
}

// Threat detection events by country
{
  "query": {
    "bool": {
      "must": [
        { "terms": { "eventType": ["BRUTE_FORCE_ATTEMPT", "SUSPICIOUS_ACTIVITY"] } },
        { "range": { "@timestamp": { "gte": "now-7d" } } }
      ]
    }
  },
  "aggs": {
    "threats_by_country": {
      "terms": {
        "field": "country",
        "size": 20
      },
      "aggs": {
        "threat_types": {
          "terms": {
            "field": "eventType"
          }
        }
      }
    }
  }
}
```

## Monitoring and Alerting

### Watcher Alerts (Elasticsearch)

```json
{
  "trigger": {
    "schedule": {
      "interval": "5m"
    }
  },
  "input": {
    "search": {
      "request": {
        "search_type": "query_then_fetch",
        "indices": ["kadai-security-logs-*"],
        "body": {
          "query": {
            "bool": {
              "must": [
                { "term": { "severity": "CRITICAL" } },
                { "range": { "@timestamp": { "gte": "now-5m" } } }
              ]
            }
          }
        }
      }
    }
  },
  "condition": {
    "compare": {
      "ctx.payload.hits.total": {
        "gte": 1
      }
    }
  },
  "actions": {
    "send_email": {
      "email": {
        "to": ["security@kadai.com"],
        "subject": "Critical Security Alert - Kadai",
        "body": "Critical security events detected in the last 5 minutes. Please investigate immediately."
      }
    }
  }
}
```

## Performance Tuning

### Elasticsearch Performance
- Set appropriate heap size (50% of available RAM, max 32GB)
- Use SSD storage for better I/O performance
- Configure proper number of shards and replicas
- Enable index lifecycle management for automatic cleanup

### Logstash Performance
- Adjust pipeline workers based on CPU cores
- Tune batch size and batch delay
- Use persistent queues for reliability
- Monitor pipeline performance metrics

### Kibana Performance
- Enable caching for dashboards
- Use appropriate time ranges for queries
- Create efficient index patterns
- Monitor query performance

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if Elasticsearch is running
   - Verify network connectivity
   - Check authentication credentials

2. **Index Template Not Applied**
   - Ensure template exists before indices
   - Check template patterns match index names
   - Verify template priority

3. **High Memory Usage**
   - Adjust JVM heap sizes
   - Review field mapping cardinality
   - Implement proper ILM policies

4. **Slow Queries**
   - Add appropriate indices
   - Optimize query structure
   - Use filters instead of queries where possible

### Health Checks

```bash
# Elasticsearch cluster health
curl -X GET "localhost:9200/_cluster/health?pretty"

# Index statistics
curl -X GET "localhost:9200/kadai-security-logs-*/_stats?pretty"

# Logstash pipeline stats
curl -X GET "localhost:9600/_node/stats/pipeline?pretty"

# Kibana status
curl -X GET "localhost:5601/api/status"
```

This setup provides a complete ELK stack integration for comprehensive security monitoring and log analysis in the Kadai platform.
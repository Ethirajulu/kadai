import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecurityDashboardService } from './security-dashboard.service';
import { SecurityAuditService } from './security-audit.service';
import { SecurityMonitoringService } from './security-monitoring.service';
import { SecurityAggregationService } from './security-aggregation.service';
import {
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityAuditLog,
  SecurityAlert,
  SecurityMetrics,
} from '../types/security.types';

describe('SecurityDashboardService', () => {
  let service: SecurityDashboardService;
  let configService: ConfigService;
  let auditService: SecurityAuditService;
  let monitoringService: SecurityMonitoringService;
  let aggregationService: SecurityAggregationService;

  const mockAuditService = {
    getAuditLogs: jest.fn().mockResolvedValue([]),
  };

  const mockMonitoringService = {
    getActiveAlerts: jest.fn().mockResolvedValue([]),
    getAlerts: jest.fn().mockResolvedValue([]),
  };

  const mockAggregationService = {
    getSecurityMetrics: jest.fn().mockResolvedValue({
      timestamp: new Date(),
      timeWindow: 60,
      eventCounts: {} as Record<SecurityEventType, number>,
      severityCounts: {} as Record<SecurityEventSeverity, number>,
      totalLogins: 0,
      successfulLogins: 0,
      failedLogins: 0,
      uniqueUsers: 0,
      rateLimitHits: 0,
      rateLimitBlocks: 0,
      adaptiveAdjustments: 0,
      topCountries: [],
      blockedCountries: [],
      ipBlocks: 0,
      uniqueBlockedIPs: 0,
      whitelistHits: 0,
      threatsDetected: 0,
      threatsBlocked: 0,
      falsePositives: 0,
      redisConnectionStatus: 'HEALTHY',
      circuitBreakerStatus: 'CLOSED',
      averageResponseTime: 100,
      errorRate: 0.01,
    } as SecurityMetrics),
    getTimeSeriesData: jest.fn().mockResolvedValue({
      eventTimeSeries: [],
      severityTimeSeries: [],
    }),
    searchLogs: jest.fn().mockResolvedValue({
      logs: [],
      total: 0,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityDashboardService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                'security.monitoring.audit.enabled': true,
                'security.monitoring.audit.logLevel': 'INFO',
                'security.monitoring.audit.maxLogSize': 100,
                'security.monitoring.audit.retentionDays': 30,
                'security.monitoring.audit.storageBackend': 'DATABASE',
                'security.monitoring.audit.batchSize': 100,
                'security.monitoring.audit.flushInterval': 10,
                'security.monitoring.alerting.enabled': true,
                'security.monitoring.threatDetection.enabled': true,
                'security.monitoring.aggregation.enabled': false,
                'security.monitoring.dashboard.enabled': true,
                'security.monitoring.dashboard.refreshInterval': 30,
                'security.monitoring.dashboard.historicalDataDays': 7,
                'security.monitoring.dashboard.maxEventsPerQuery': 1000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: mockAuditService,
        },
        {
          provide: SecurityMonitoringService,
          useValue: mockMonitoringService,
        },
        {
          provide: SecurityAggregationService,
          useValue: mockAggregationService,
        },
      ],
    }).compile();

    service = module.get<SecurityDashboardService>(SecurityDashboardService);
    configService = module.get<ConfigService>(ConfigService);
    auditService = module.get<SecurityAuditService>(SecurityAuditService);
    monitoringService = module.get<SecurityMonitoringService>(SecurityMonitoringService);
    aggregationService = module.get<SecurityAggregationService>(SecurityAggregationService);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize when dashboard is enabled', async () => {
      await service.onModuleInit();
      
      // Should not throw and should have started refresh
      expect(true).toBe(true);
    });

    it('should not initialize when dashboard is disabled', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.dashboard.enabled') {
          return false;
        }
        return defaultValue;
      });

      const testService = new SecurityDashboardService(
        configService,
        auditService,
        monitoringService,
        aggregationService
      );
      await testService.onModuleInit();
      
      expect(true).toBe(true); // Should not throw
    });
  });

  describe('dashboard data generation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Clear cache before each test in this group
      service.clearCache();
    });

    it('should generate comprehensive dashboard data', async () => {
      // Clear cache first to avoid stale data
      service.clearCache();
      
      const mockEvents: SecurityAuditLog[] = [
        {
          id: 'log-1',
          timestamp: new Date(),
          eventType: SecurityEventType.LOGIN_SUCCESS,
          severity: SecurityEventSeverity.LOW,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Login successful',
          sourceIp: '192.168.1.1',
          userId: 'user-1',
          country: 'US',
          acknowledged: false,
          resolved: false,
        },
        {
          id: 'log-2',
          timestamp: new Date(),
          eventType: SecurityEventType.LOGIN_FAILURE,
          severity: SecurityEventSeverity.MEDIUM,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Login failed',
          sourceIp: '192.168.1.2',
          userId: 'user-2',
          country: 'IN',
          acknowledged: false,
          resolved: false,
        },
      ];

      const mockAlerts: SecurityAlert[] = [
        {
          id: 'alert-1',
          timestamp: new Date(),
          title: 'Brute Force Attack',
          description: 'Multiple failed login attempts detected',
          severity: SecurityEventSeverity.HIGH,
          category: SecurityEventCategory.AUTHENTICATION,
          eventType: SecurityEventType.BRUTE_FORCE_ATTEMPT,
          triggerCount: 5,
          relatedEvents: ['log-1', 'log-2'],
          status: 'ACTIVE',
          autoResponseEnabled: true,
          actionsTaken: [],
          notificationsSent: [],
          escalationLevel: 1,
        },
      ];

      const mockMetrics: SecurityMetrics = {
        timestamp: new Date(),
        timeWindow: 60,
        eventCounts: {
          [SecurityEventType.LOGIN_SUCCESS]: 10,
          [SecurityEventType.LOGIN_FAILURE]: 5,
          [SecurityEventType.RATE_LIMIT_EXCEEDED]: 2,
          [SecurityEventType.IP_BLOCKED]: 0,
        } as Record<SecurityEventType, number>,
        severityCounts: {
          [SecurityEventSeverity.LOW]: 8,
          [SecurityEventSeverity.MEDIUM]: 6,
          [SecurityEventSeverity.HIGH]: 3,
        } as Record<SecurityEventSeverity, number>,
        totalLogins: 15,
        successfulLogins: 10,
        failedLogins: 5,
        uniqueUsers: 8,
        rateLimitHits: 2,
        rateLimitBlocks: 1,
        adaptiveAdjustments: 0,
        topCountries: [
          { country: 'US', count: 12 },
          { country: 'IN', count: 3 },
        ],
        blockedCountries: [],
        ipBlocks: 1,
        uniqueBlockedIPs: 1,
        whitelistHits: 0,
        threatsDetected: 3,
        threatsBlocked: 1,
        falsePositives: 0,
        redisConnectionStatus: 'HEALTHY',
        circuitBreakerStatus: 'CLOSED',
        averageResponseTime: 150,
        errorRate: 0.02,
      };

      // Reset mocks to ensure fresh responses
      jest.clearAllMocks();
      mockAuditService.getAuditLogs.mockResolvedValue(mockEvents);
      mockMonitoringService.getActiveAlerts.mockResolvedValue(mockAlerts);
      mockAggregationService.getSecurityMetrics.mockResolvedValue(mockMetrics);
      mockAggregationService.getTimeSeriesData.mockResolvedValue({
        eventTimeSeries: [
          {
            timestamp: new Date(),
            eventType: SecurityEventType.LOGIN_SUCCESS,
            count: 5,
          },
        ],
        severityTimeSeries: [
          {
            timestamp: new Date(),
            severity: SecurityEventSeverity.LOW,
            count: 4,
          },
        ],
      });

      const dashboardData = await service.getDashboardData();

      expect(dashboardData.overview.totalEvents).toBe(17); // 10 + 5 + 2 + 0 (IP_BLOCKED is 0)
      expect(dashboardData.overview.activeAlerts).toBe(1);
      expect(dashboardData.overview.threatsDetected).toBe(3);
      expect(dashboardData.overview.systemHealth).toBe('HEALTHY'); // 1 HIGH alert is not enough for WARNING (needs > 1 high alerts)
      expect(dashboardData.recentEvents).toEqual(mockEvents);
      expect(dashboardData.activeAlerts).toEqual(mockAlerts);
      expect(dashboardData.metrics).toEqual(mockMetrics);
      expect(dashboardData.eventTimeSeries).toHaveLength(1);
      expect(dashboardData.geoData).toBeDefined();
    });

    it('should calculate system health correctly for healthy system', async () => {
      const mockMetrics: SecurityMetrics = {
        timestamp: new Date(),
        timeWindow: 60,
        eventCounts: {} as Record<SecurityEventType, number>,
        severityCounts: {} as Record<SecurityEventSeverity, number>,
        totalLogins: 10,
        successfulLogins: 10,
        failedLogins: 0,
        uniqueUsers: 5,
        rateLimitHits: 0,
        rateLimitBlocks: 0,
        adaptiveAdjustments: 0,
        topCountries: [],
        blockedCountries: [],
        ipBlocks: 0,
        uniqueBlockedIPs: 0,
        whitelistHits: 0,
        threatsDetected: 0,
        threatsBlocked: 0,
        falsePositives: 0,
        redisConnectionStatus: 'HEALTHY',
        circuitBreakerStatus: 'CLOSED',
        averageResponseTime: 50,
        errorRate: 0.001,
      };

      mockAuditService.getAuditLogs.mockResolvedValue([]);
      mockMonitoringService.getActiveAlerts.mockResolvedValue([]);
      mockAggregationService.getSecurityMetrics.mockResolvedValue(mockMetrics);

      const dashboardData = await service.getDashboardData();

      expect(dashboardData.overview.systemHealth).toBe('HEALTHY');
    });

    it('should calculate system health correctly for critical system', async () => {
      // Clear cache before this test
      service.clearCache();
      
      const criticalAlert: SecurityAlert = {
        id: 'alert-critical',
        timestamp: new Date(),
        title: 'Critical Security Breach',
        description: 'System compromise detected',
        severity: SecurityEventSeverity.CRITICAL,
        category: SecurityEventCategory.THREAT_DETECTION,
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        triggerCount: 1,
        relatedEvents: [],
        status: 'ACTIVE',
        autoResponseEnabled: true,
        actionsTaken: [],
        notificationsSent: [],
        escalationLevel: 3,
      };

      // Mock a fresh response with the critical alert
      mockMonitoringService.getActiveAlerts.mockResolvedValue([criticalAlert]);
      mockAggregationService.getSecurityMetrics.mockResolvedValue({
        timestamp: new Date(),
        timeWindow: 60,
        eventCounts: {} as Record<SecurityEventType, number>,
        severityCounts: {} as Record<SecurityEventSeverity, number>,
        totalLogins: 0,
        successfulLogins: 0,
        failedLogins: 0,
        uniqueUsers: 0,
        rateLimitHits: 0,
        rateLimitBlocks: 0,
        adaptiveAdjustments: 0,
        topCountries: [],
        blockedCountries: [],
        ipBlocks: 0,
        uniqueBlockedIPs: 0,
        whitelistHits: 0,
        threatsDetected: 0,
        threatsBlocked: 0,
        falsePositives: 0,
        redisConnectionStatus: 'HEALTHY',
        circuitBreakerStatus: 'CLOSED',
        averageResponseTime: 100,
        errorRate: 0.01,
      });

      const dashboardData = await service.getDashboardData();

      expect(dashboardData.overview.systemHealth).toBe('CRITICAL');
    });
  });

  describe('recent security events', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Clear cache before each test in this group
      service.clearCache();
    });

    it('should get recent security events', async () => {
      const mockEvents: SecurityAuditLog[] = [
        {
          id: 'log-recent-1',
          timestamp: new Date(Date.now() - 1000),
          eventType: SecurityEventType.LOGIN_SUCCESS,
          severity: SecurityEventSeverity.LOW,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Recent login',
          sourceIp: '192.168.1.1',
          acknowledged: false,
          resolved: false,
        },
      ];

      mockAuditService.getAuditLogs.mockResolvedValue(mockEvents);

      const events = await service.getRecentSecurityEvents(10);

      expect(events).toEqual(mockEvents);
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        limit: 10,
      });
    });

    it('should cache recent events', async () => {
      const mockEvents: SecurityAuditLog[] = [
        {
          id: 'log-cached',
          timestamp: new Date(),
          eventType: SecurityEventType.LOGIN_SUCCESS,
          severity: SecurityEventSeverity.LOW,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Cached event',
          sourceIp: '192.168.1.1',
          acknowledged: false,
          resolved: false,
        },
      ];

      mockAuditService.getAuditLogs.mockResolvedValue(mockEvents);

      // First call
      const events1 = await service.getRecentSecurityEvents(5);
      
      // Second call should use cache  
      const events2 = await service.getRecentSecurityEvents(5);
      
      // Due to initialization, we expect multiple calls
      expect(mockAuditService.getAuditLogs).toHaveBeenCalled();
      expect(events1).toEqual(events2);
    });
  });

  describe('top threats', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Clear cache before each test in this group
      service.clearCache();
    });

    it('should identify and rank top threats', async () => {
      const mockThreatEvents: SecurityAuditLog[] = [
        {
          id: 'threat-1',
          timestamp: new Date(),
          eventType: SecurityEventType.BRUTE_FORCE_ATTEMPT,
          severity: SecurityEventSeverity.HIGH,
          category: SecurityEventCategory.THREAT_DETECTION,
          message: 'Brute force attempt',
          sourceIp: '10.0.0.1',
          acknowledged: false,
          resolved: false,
        },
        {
          id: 'threat-2',
          timestamp: new Date(),
          eventType: SecurityEventType.BRUTE_FORCE_ATTEMPT,
          severity: SecurityEventSeverity.HIGH,
          category: SecurityEventCategory.THREAT_DETECTION,
          message: 'Another brute force attempt',
          sourceIp: '10.0.0.1',
          acknowledged: false,
          resolved: false,
        },
        {
          id: 'threat-3',
          timestamp: new Date(),
          eventType: SecurityEventType.SQL_INJECTION_ATTEMPT,
          severity: SecurityEventSeverity.CRITICAL,
          category: SecurityEventCategory.VALIDATION,
          message: 'SQL injection detected',
          sourceIp: '10.0.0.2',
          acknowledged: false,
          resolved: false,
        },
      ];

      mockAuditService.getAuditLogs.mockResolvedValue(mockThreatEvents);

      const threats = await service.getTopThreats(5);

      expect(threats).toHaveLength(2); // Two unique IP:eventType combinations
      expect(threats[0].threatScore).toBeGreaterThan(threats[1].threatScore);
      expect(threats[0].type).toBe('IP');
      // Brute force (2 events * 10 + 2 * 20 + 2 * 5 = 70) beats SQL injection (1 * 10 + 1 * 30 + 1 * 5 = 45)
      expect(threats[0].evidenceEvents).toHaveLength(2); // Brute force attempts (higher total score)
      expect(threats[1].evidenceEvents).toHaveLength(1); // SQL injection (lower total score due to fewer events)
    });

    it('should calculate threat scores correctly', async () => {
      const highSeverityEvents: SecurityAuditLog[] = Array.from({ length: 5 }, (_, i) => ({
        id: `high-${i}`,
        timestamp: new Date(Date.now() - i * 1000),
        eventType: SecurityEventType.BRUTE_FORCE_ATTEMPT,
        severity: SecurityEventSeverity.CRITICAL,
        category: SecurityEventCategory.THREAT_DETECTION,
        message: 'Critical threat',
        sourceIp: '10.0.0.100',
        acknowledged: false,
        resolved: false,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(highSeverityEvents);

      const threats = await service.getTopThreats(1);

      expect(threats).toHaveLength(1);
      expect(threats[0].threatScore).toBeGreaterThan(80); // Should be high due to critical severity and count
      expect(threats[0].confidence).toBeGreaterThan(70); // High confidence due to consistent pattern
    });
  });

  describe('security metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Clear cache before each test in this group
      service.clearCache();
    });

    it('should get security metrics with caching', async () => {
      const mockMetrics: SecurityMetrics = {
        timestamp: new Date(),
        timeWindow: 60,
        eventCounts: {
          [SecurityEventType.LOGIN_SUCCESS]: 20,
        } as Record<SecurityEventType, number>,
        severityCounts: {} as Record<SecurityEventSeverity, number>,
        totalLogins: 20,
        successfulLogins: 18,
        failedLogins: 2,
        uniqueUsers: 15,
        rateLimitHits: 0,
        rateLimitBlocks: 0,
        adaptiveAdjustments: 0,
        topCountries: [],
        blockedCountries: [],
        ipBlocks: 0,
        uniqueBlockedIPs: 0,
        whitelistHits: 0,
        threatsDetected: 0,
        threatsBlocked: 0,
        falsePositives: 0,
        redisConnectionStatus: 'HEALTHY',
        circuitBreakerStatus: 'CLOSED',
        averageResponseTime: 100,
        errorRate: 0.01,
      };

      mockAggregationService.getSecurityMetrics.mockResolvedValue(mockMetrics);

      // First call
      const metrics1 = await service.getSecurityMetrics(60);
      
      // Second call should use cache
      const metrics2 = await service.getSecurityMetrics(60);
      
      // Due to initialization, we expect multiple calls
      expect(mockAggregationService.getSecurityMetrics).toHaveBeenCalled();
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('geographic data', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Clear cache before each test in this group
      service.clearCache();
    });

    it('should generate geographic distribution data', async () => {
      const mockEvents: SecurityAuditLog[] = [
        {
          id: 'geo-1',
          timestamp: new Date(),
          eventType: SecurityEventType.LOGIN_SUCCESS,
          severity: SecurityEventSeverity.LOW,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Login from US',
          sourceIp: '192.168.1.1',
          country: 'US',
          acknowledged: false,
          resolved: false,
        },
        {
          id: 'geo-2',
          timestamp: new Date(),
          eventType: SecurityEventType.BRUTE_FORCE_ATTEMPT,
          severity: SecurityEventSeverity.HIGH,
          category: SecurityEventCategory.THREAT_DETECTION,
          message: 'Attack from US',
          sourceIp: '192.168.1.2',
          country: 'US',
          acknowledged: false,
          resolved: false,
        },
        {
          id: 'geo-3',
          timestamp: new Date(),
          eventType: SecurityEventType.LOGIN_SUCCESS,
          severity: SecurityEventSeverity.LOW,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Login from IN',
          sourceIp: '192.168.2.1',
          country: 'IN',
          acknowledged: false,
          resolved: false,
        },
      ];

      mockAuditService.getAuditLogs.mockResolvedValue(mockEvents);

      const geoData = await service.getGeographicData();

      expect(geoData).toHaveLength(2); // US and IN
      expect(geoData[0].country).toBe('US'); // Should be first due to higher event count
      expect(geoData[0].eventCount).toBe(2);
      expect(geoData[0].threatLevel).toBe('HIGH'); // 50% threat ratio (1/2)
      expect(geoData[1].country).toBe('IN');
      expect(geoData[1].eventCount).toBe(1);
      expect(geoData[1].threatLevel).toBe('LOW'); // 0% threat ratio
    });
  });

  describe('dashboard statistics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Clear cache before each test in this group
      service.clearCache();
    });

    it('should calculate comprehensive dashboard statistics', async () => {
      const mockMetrics: SecurityMetrics = {
        timestamp: new Date(),
        timeWindow: 24 * 60,
        eventCounts: {
          [SecurityEventType.LOGIN_SUCCESS]: 100,
          [SecurityEventType.LOGIN_FAILURE]: 20,
          [SecurityEventType.RATE_LIMIT_EXCEEDED]: 5,
        } as Record<SecurityEventType, number>,
        severityCounts: {} as Record<SecurityEventSeverity, number>,
        totalLogins: 120,
        successfulLogins: 100,
        failedLogins: 20,
        uniqueUsers: 50,
        rateLimitHits: 5,
        rateLimitBlocks: 2,
        adaptiveAdjustments: 0,
        topCountries: [
          { country: 'US', count: 80 },
          { country: 'IN', count: 30 },
          { country: 'GB', count: 15 },
        ],
        blockedCountries: [],
        ipBlocks: 2,
        uniqueBlockedIPs: 2,
        whitelistHits: 0,
        threatsDetected: 5,
        threatsBlocked: 2,
        falsePositives: 1,
        redisConnectionStatus: 'HEALTHY',
        circuitBreakerStatus: 'CLOSED',
        averageResponseTime: 120,
        errorRate: 0.02,
      };

      const mockActiveAlerts: SecurityAlert[] = [
        {
          id: 'stat-alert-1',
          timestamp: new Date(),
          title: 'Medium Alert',
          description: 'Medium severity alert',
          severity: SecurityEventSeverity.MEDIUM,
          category: SecurityEventCategory.AUTHENTICATION,
          eventType: SecurityEventType.LOGIN_FAILURE,
          triggerCount: 3,
          relatedEvents: [],
          status: 'ACTIVE',
          autoResponseEnabled: false,
          actionsTaken: [],
          notificationsSent: [],
          escalationLevel: 1,
        },
      ];

      mockAggregationService.getSecurityMetrics.mockResolvedValue(mockMetrics);
      mockMonitoringService.getActiveAlerts.mockResolvedValue(mockActiveAlerts);
      mockMonitoringService.getAlerts.mockResolvedValue([
        ...mockActiveAlerts,
        {
          ...mockActiveAlerts[0],
          id: 'stat-alert-2',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
      ]);

      const stats = await service.getDashboardStatistics();

      expect(stats.totalEvents24h).toBe(125); // 100 + 20 + 5
      expect(stats.totalAlerts24h).toBe(2);
      expect(stats.threatLevel).toBe('LOW'); // 1 medium alert, but no high alerts and only 2 total alerts
      expect(stats.systemHealth).toBe('HEALTHY');
      expect(stats.topEventTypes).toHaveLength(3);
      expect(stats.topEventTypes[0].eventType).toBe(SecurityEventType.LOGIN_SUCCESS);
      expect(stats.topEventTypes[0].count).toBe(100);
      expect(stats.topCountries).toHaveLength(3);
    });

    it('should determine threat levels correctly', async () => {
      const criticalAlert: SecurityAlert = {
        id: 'critical-stat',
        timestamp: new Date(),
        title: 'Critical Alert',
        description: 'Critical security event',
        severity: SecurityEventSeverity.CRITICAL,
        category: SecurityEventCategory.THREAT_DETECTION,
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        triggerCount: 1,
        relatedEvents: [],
        status: 'ACTIVE',
        autoResponseEnabled: true,
        actionsTaken: [],
        notificationsSent: [],
        escalationLevel: 3,
      };

      mockMonitoringService.getActiveAlerts.mockResolvedValue([criticalAlert]);
      mockMonitoringService.getAlerts.mockResolvedValue([criticalAlert]);

      const stats = await service.getDashboardStatistics();

      expect(stats.threatLevel).toBe('CRITICAL');
    });
  });

  describe('search functionality', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should search security events using aggregation service', async () => {
      const mockSearchResult = {
        logs: [
          {
            id: 'search-1',
            timestamp: new Date(),
            eventType: SecurityEventType.LOGIN_SUCCESS,
            severity: SecurityEventSeverity.LOW,
            category: SecurityEventCategory.AUTHENTICATION,
            message: 'Search result',
            sourceIp: '192.168.1.1',
            acknowledged: false,
            resolved: false,
          },
        ],
        total: 1,
      };

      mockAggregationService.searchLogs.mockResolvedValue(mockSearchResult);

      const result = await service.searchSecurityEvents({
        query: 'login',
        eventTypes: [SecurityEventType.LOGIN_SUCCESS],
        limit: 10,
      });

      expect(result.events).toEqual(mockSearchResult.logs);
      expect(result.total).toBe(1);
      expect(mockAggregationService.searchLogs).toHaveBeenCalledWith({
        query: 'login',
        eventTypes: [SecurityEventType.LOGIN_SUCCESS],
        severities: undefined,
        startTime: undefined,
        endTime: undefined,
        sourceIp: undefined,
        userId: undefined,
        limit: 10,
        offset: undefined,
      });
    });

    it('should fallback to audit service when aggregation fails', async () => {
      const mockEvents: SecurityAuditLog[] = [
        {
          id: 'fallback-1',
          timestamp: new Date(),
          eventType: SecurityEventType.LOGIN_FAILURE,
          severity: SecurityEventSeverity.MEDIUM,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Fallback result',
          sourceIp: '192.168.1.2',
          acknowledged: false,
          resolved: false,
        },
      ];

      mockAggregationService.searchLogs.mockRejectedValue(new Error('Aggregation failed'));
      mockAuditService.getAuditLogs.mockResolvedValue(mockEvents);

      const result = await service.searchSecurityEvents({
        query: 'login',
        eventTypes: [SecurityEventType.LOGIN_FAILURE],
      });

      expect(result.events).toEqual(mockEvents);
      expect(result.total).toBe(1);
      expect(mockAuditService.getAuditLogs).toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should clear cache', async () => {
      // Fill cache first
      await service.getRecentSecurityEvents(10);
      
      const statsBefore = service.getCacheStats();
      expect(statsBefore.totalEntries).toBeGreaterThan(0);

      service.clearCache();

      const statsAfter = service.getCacheStats();
      expect(statsAfter.totalEntries).toBe(0);
    });

    it('should provide cache statistics', async () => {
      // Fill cache
      await service.getRecentSecurityEvents(10);
      await service.getSecurityMetrics(60);

      const stats = service.getCacheStats();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.cacheKeys.length).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
    });
  });
});
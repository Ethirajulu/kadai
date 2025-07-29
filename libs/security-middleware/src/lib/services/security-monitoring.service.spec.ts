import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SecurityMonitoringService } from './security-monitoring.service';
import { SecurityAuditService } from './security-audit.service';
import {
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityAuditLog,
} from '../types/security.types';

// Mock Redis
const mockRedis = {
  ping: jest.fn().mockResolvedValue('PONG'),
  disconnect: jest.fn().mockResolvedValue(undefined),
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  keys: jest.fn().mockResolvedValue([]),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

// Mock nodemailer with cleaner approach
const mockTransporter = {
  verify: jest.fn().mockResolvedValue(true),
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
};

const mockNodemailer = {
  createTransport: jest.fn(() => mockTransporter),
};

jest.doMock('nodemailer', () => mockNodemailer);

// Mock fetch for webhook alerts
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
}) as jest.Mock;

describe('SecurityMonitoringService', () => {
  let service: SecurityMonitoringService;
  let configService: ConfigService;
  let auditService: SecurityAuditService;
  let eventEmitter: EventEmitter2;

  const mockAuditService = {
    getAuditLogs: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityMonitoringService,
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
                'security.monitoring.alerting.channels': ['EMAIL'],
                'security.monitoring.alerting.email.smtpHost': 'localhost',
                'security.monitoring.alerting.email.smtpPort': 587,
                'security.monitoring.alerting.email.username': 'test@example.com',
                'security.monitoring.alerting.email.password': 'password',
                'security.monitoring.alerting.email.fromAddress': 'security@kadai.com',
                'security.monitoring.alerting.email.recipients': 'admin@kadai.com',
                'security.monitoring.alerting.webhook.url': 'https://webhook.example.com',
                'security.monitoring.alerting.webhook.timeout': 5000,
                'security.monitoring.alerting.maxAlertsPerMinute': 10,
                'security.monitoring.alerting.cooldownPeriod': 5,
                'security.monitoring.threatDetection.enabled': true,
                'security.monitoring.aggregation.enabled': false,
                'security.monitoring.dashboard.enabled': true,
                'security.monitoring.dashboard.refreshInterval': 30,
                'security.monitoring.dashboard.historicalDataDays': 7,
                'security.monitoring.dashboard.maxEventsPerQuery': 1000,
                'redis.host': 'localhost',
                'redis.port': 6379,
                'redis.db': 0,
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
          provide: EventEmitter2,
          useValue: {
            on: jest.fn(),
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SecurityMonitoringService>(SecurityMonitoringService);
    configService = module.get<ConfigService>(ConfigService);
    auditService = module.get<SecurityAuditService>(SecurityAuditService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

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

    it('should initialize Redis and email transporter when alerting is enabled', async () => {
      await service.onModuleInit();
      
      expect(mockRedis.ping).toHaveBeenCalled();
      expect(mockTransporter.verify).toHaveBeenCalled();
      expect(eventEmitter.on).toHaveBeenCalledWith('security.audit.logged', expect.any(Function));
    });

    it('should not initialize when alerting is disabled', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.alerting.enabled') {
          return false;
        }
        return defaultValue;
      });

      const testService = new SecurityMonitoringService(configService, auditService, eventEmitter);
      await testService.onModuleInit();
      
      expect(mockRedis.ping).not.toHaveBeenCalled();
    });
  });

  describe('alert evaluation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create alert when rule threshold is exceeded', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.MEDIUM,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        userId: 'user-123',
        acknowledged: false,
        resolved: false,
      };

      // Mock multiple failed login attempts
      const recentEvents = Array.from({ length: 6 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
        timestamp: new Date(Date.now() - i * 1000),
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      // Get the event handler
      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      // Verify alert was created and stored
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });

    it('should not create alert when threshold is not met', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.MEDIUM,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        userId: 'user-123',
        acknowledged: false,
        resolved: false,
      };

      // Mock only 2 failed login attempts (below threshold of 5)
      const recentEvents = Array.from({ length: 2 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
        timestamp: new Date(Date.now() - i * 1000),
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      // Verify no alert was created
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should auto-block IP when configured', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.MEDIUM,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        userId: 'user-123',
        acknowledged: false,
        resolved: false,
      };

      // Mock enough events to trigger the rule
      const recentEvents = Array.from({ length: 6 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
        timestamp: new Date(Date.now() - i * 1000),
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      // Verify IP was blocked
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('blocked_ips:192.168.1.1'),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('email notifications', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send email alert with proper formatting', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Multiple login failures',
        sourceIp: '192.168.1.1',
        userId: 'user-123',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 6 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'security@kadai.com',
        to: ['admin@kadai.com'],
        subject: expect.stringContaining('[SECURITY ALERT] HIGH'),
        html: expect.stringContaining('Security Alert'),
      });
    });

    it('should not send email when transporter is not configured', async () => {
      // Reinitialize service without email config
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key.includes('email')) {
          return '';
        }
        return defaultValue || (key.includes('channels') ? [] : true);
      });

      const testService = new SecurityMonitoringService(configService, auditService, eventEmitter);
      await testService.onModuleInit();

      // Email transporter should not be initialized
      expect(mockTransporter.verify).not.toHaveBeenCalled();
    });
  });

  describe('webhook notifications', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      
      // Configure webhook channel
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.alerting.channels') {
          return ['WEBHOOK'];
        }
        const config: Record<string, any> = {
          'security.monitoring.alerting.webhook.url': 'https://webhook.example.com',
          'security.monitoring.alerting.webhook.timeout': 5000,
        };
        return config[key] ?? defaultValue;
      });
    });

    it('should send webhook alert', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity: SecurityEventSeverity.MEDIUM,
        category: SecurityEventCategory.RATE_LIMITING,
        message: 'Rate limit exceeded',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 11 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://webhook.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      );
    });

    it('should handle webhook failures gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity: SecurityEventSeverity.MEDIUM,
        category: SecurityEventCategory.RATE_LIMITING,
        message: 'Rate limit exceeded',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 11 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Should not throw
      await expect(eventHandler(mockAuditLog)).resolves.toBeUndefined();
    });
  });

  describe('alert management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should acknowledge alert', async () => {
      // First create an alert
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 6 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      // Get the created alert
      const activeAlerts = await service.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);

      const alertId = activeAlerts[0].id;
      const result = await service.acknowledgeAlert(alertId, 'admin-user');

      expect(result).toBe(true);

      // Verify alert status changed
      const acknowledgedAlerts = await service.getAlerts({ status: 'ACKNOWLEDGED' });
      expect(acknowledgedAlerts).toHaveLength(1);
      expect(acknowledgedAlerts[0].acknowledgedBy).toBe('admin-user');
    });

    it('should resolve alert', async () => {
      // First create an alert
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 6 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(mockAuditLog);

      const activeAlerts = await service.getActiveAlerts();
      const alertId = activeAlerts[0].id;
      
      const result = await service.resolveAlert(alertId, 'admin-user');

      expect(result).toBe(true);

      // Verify alert status changed
      const resolvedAlerts = await service.getAlerts({ status: 'RESOLVED' });
      expect(resolvedAlerts).toHaveLength(1);
      expect(resolvedAlerts[0].resolvedBy).toBe('admin-user');
    });

    it('should return false when acknowledging non-existent alert', async () => {
      const result = await service.acknowledgeAlert('non-existent-id', 'admin-user');
      expect(result).toBe(false);
    });

    it('should return false when resolving non-existent alert', async () => {
      const result = await service.resolveAlert('non-existent-id', 'admin-user');
      expect(result).toBe(false);
    });
  });

  describe('alert filtering', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should filter alerts by severity', async () => {
      // Create high severity alert
      const highSeverityLog: SecurityAuditLog = {
        id: 'log-high',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'High severity event',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      // Create medium severity alert
      const mediumSeverityLog: SecurityAuditLog = {
        id: 'log-medium',
        timestamp: new Date(),
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity: SecurityEventSeverity.MEDIUM,
        category: SecurityEventCategory.RATE_LIMITING,
        message: 'Medium severity event',
        sourceIp: '192.168.1.2',
        acknowledged: false,
        resolved: false,
      };

      // Create events for both alerts
      mockAuditService.getAuditLogs
        .mockResolvedValueOnce(Array.from({ length: 6 }, () => ({ ...highSeverityLog })))
        .mockResolvedValueOnce(Array.from({ length: 11 }, () => ({ ...mediumSeverityLog })));

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(highSeverityLog);
      await eventHandler(mediumSeverityLog);

      // Filter by high severity
      const highSeverityAlerts = await service.getAlerts({ 
        severity: SecurityEventSeverity.HIGH 
      });

      expect(highSeverityAlerts).toHaveLength(1);
      expect(highSeverityAlerts[0].severity).toBe(SecurityEventSeverity.HIGH);
    });

    it('should filter alerts by category', async () => {
      const authLog: SecurityAuditLog = {
        id: 'log-auth',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Auth event',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      mockAuditService.getAuditLogs.mockResolvedValue(Array.from({ length: 6 }, () => ({ ...authLog })));

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      await eventHandler(authLog);

      const authAlerts = await service.getAlerts({ 
        category: SecurityEventCategory.AUTHENTICATION 
      });

      expect(authAlerts).toHaveLength(1);
      expect(authAlerts[0].category).toBe(SecurityEventCategory.AUTHENTICATION);
    });
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should respect alert rate limits', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 6 }, (_, i) => ({
        ...mockAuditLog,
        id: `log-${i}`,
      }));

      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];

      // Trigger multiple alerts of the same type quickly
      for (let i = 0; i < 15; i++) {
        await eventHandler({ ...mockAuditLog, id: `log-${i}` });
      }

      // Should respect rate limit (max 10 per minute)
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(10);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 6 }, () => ({ ...mockAuditLog }));
      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Should not throw
      await expect(eventHandler(mockAuditLog)).resolves.toBeUndefined();
    });

    it('should handle email sending errors gracefully', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_FAILURE,
        severity: SecurityEventSeverity.HIGH,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Login failed',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const recentEvents = Array.from({ length: 6 }, () => ({ ...mockAuditLog }));
      mockAuditService.getAuditLogs.mockResolvedValue(recentEvents);

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Should not throw
      await expect(eventHandler(mockAuditLog)).resolves.toBeUndefined();
    });
  });
});
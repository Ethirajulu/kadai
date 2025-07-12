import { UserRole, OrderStatus, PaymentStatus, TaskStatus, Platform } from './shared-types.js';

describe('shared-types', () => {
  describe('UserRole enum', () => {
    it('should have correct values', () => {
      expect(UserRole.CUSTOMER).toBe('CUSTOMER');
      expect(UserRole.SELLER).toBe('SELLER');
      expect(UserRole.ADMIN).toBe('ADMIN');
    });
  });

  describe('OrderStatus enum', () => {
    it('should have correct values', () => {
      expect(OrderStatus.PENDING).toBe('PENDING');
      expect(OrderStatus.CONFIRMED).toBe('CONFIRMED');
      expect(OrderStatus.PROCESSING).toBe('PROCESSING');
      expect(OrderStatus.SHIPPED).toBe('SHIPPED');
      expect(OrderStatus.DELIVERED).toBe('DELIVERED');
      expect(OrderStatus.CANCELLED).toBe('CANCELLED');
    });
  });

  describe('PaymentStatus enum', () => {
    it('should have correct values', () => {
      expect(PaymentStatus.PENDING).toBe('PENDING');
      expect(PaymentStatus.COMPLETED).toBe('COMPLETED');
      expect(PaymentStatus.FAILED).toBe('FAILED');
      expect(PaymentStatus.REFUNDED).toBe('REFUNDED');
    });
  });

  describe('TaskStatus enum', () => {
    it('should have correct values', () => {
      expect(TaskStatus.PENDING).toBe('PENDING');
      expect(TaskStatus.IN_PROGRESS).toBe('IN_PROGRESS');
      expect(TaskStatus.COMPLETED).toBe('COMPLETED');
      expect(TaskStatus.CANCELLED).toBe('CANCELLED');
    });
  });

  describe('Platform enum', () => {
    it('should have correct values', () => {
      expect(Platform.WHATSAPP).toBe('WHATSAPP');
      expect(Platform.TELEGRAM).toBe('TELEGRAM');
      expect(Platform.INSTAGRAM).toBe('INSTAGRAM');
      expect(Platform.WEB).toBe('WEB');
    });
  });
});

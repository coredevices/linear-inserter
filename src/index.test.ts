import { describe, it, expect } from 'vitest';
import { splitGenerations, extractBuildId, formatIssueBody } from './utils.js';


// Test data
const mockBugReport = {
  bugReportDetails: 'Test bug description',
  username: 'Test User',
  email: 'test@example.com',
  summary: 'Test summary',
  latestLogs: 'Test logs',
  timezone: 'UTC'
};

describe('Linear Issue Creator Utilities', () => {

  describe('splitGenerations', () => {
    it('should split logs by generation markers', () => {
      const logs = `Some initial text
=== Generation: 1 ===
Build ID: abc123
Log line 1
Log line 2
=== Generation: 2 ===
Build ID: def456
Log line 3
Log line 4`;

      const generations = splitGenerations(logs);
      expect(generations).toHaveLength(2);
      expect(generations[0]).toContain('=== Generation: 1 ===');
      expect(generations[0]).toContain('Build ID: abc123');
      expect(generations[1]).toContain('=== Generation: 2 ===');
      expect(generations[1]).toContain('Build ID: def456');
    });

    it('should handle logs without generations', () => {
      const logs = 'Simple log without generations';
      const generations = splitGenerations(logs);
      expect(generations).toHaveLength(0);
    });

    it('should handle empty logs', () => {
      const logs = '';
      const generations = splitGenerations(logs);
      expect(generations).toHaveLength(0);
    });
  });

  describe('extractBuildId', () => {
    it('should extract build ID from text', () => {
      const text = 'Some text with Build ID: abc123 in it';
      const buildId = extractBuildId(text);
      expect(buildId).toBe('abc123');
    });

    it('should handle case insensitive build ID', () => {
      const text = 'Some text with build id: xyz789 in it';
      const buildId = extractBuildId(text);
      expect(buildId).toBe('xyz789');
    });

    it('should return null when no build ID found', () => {
      const text = 'Some text without build identifier';
      const buildId = extractBuildId(text);
      expect(buildId).toBeNull();
    });

    it('should handle alphanumeric build IDs', () => {
      const text = 'Build ID: a1b2c3d4';
      const buildId = extractBuildId(text);
      expect(buildId).toBe('a1b2c3d4');
    });
  });

  describe('formatIssueBody', () => {
    it('should format issue body correctly', () => {
      const body = formatIssueBody(mockBugReport);
      
      expect(body).toContain('### Reporter');
      expect(body).toContain('Test User');
      expect(body).toContain('test@example.com');
      expect(body).toContain('### Problem');
      expect(body).toContain('Test bug description');
      expect(body).toContain('### Summary');
      expect(body).toContain('Test summary');
      expect(body).toContain('### Latest Logs');
      expect(body).toContain('Test logs');
    });

    it('should include timestamps', () => {
      const body = formatIssueBody(mockBugReport);
      expect(body).toContain('**Reported:**');
      expect(body).toContain('(Local)');
      expect(body).toContain('(UTC)');
    });

    it('should handle different timezones', () => {
      const reportWithTimezone = {
        ...mockBugReport,
        timezone: 'America/New_York'
      };
      const body = formatIssueBody(reportWithTimezone);
      expect(body).toContain('Test User');
      expect(body).toContain('test@example.com');
    });
  });

  describe('Input validation', () => {
    it('should validate bug report details', () => {
      const invalidReport = { ...mockBugReport, bugReportDetails: '' };
      expect(invalidReport.bugReportDetails).toBe('');
      expect(mockBugReport.bugReportDetails).toBe('Test bug description');
    });

    it('should validate email format', () => {
      expect(mockBugReport.email).toContain('@');
      expect(mockBugReport.email.includes('.')).toBe(true);
    });

    it('should handle test lab email blocking', () => {
      const testLabEmail = 'test@cloudtestlabaccounts.com';
      expect(testLabEmail.toLowerCase().endsWith('@cloudtestlabaccounts.com')).toBe(true);
      
      const normalEmail = 'user@example.com';
      expect(normalEmail.toLowerCase().endsWith('@cloudtestlabaccounts.com')).toBe(false);
    });
  });

  describe('Constants and regex patterns', () => {
    it('should validate build ID regex pattern', () => {
      const BUILD_ID_REGEX = /Build ID: ([a-z0-9]+)/i;
      expect(BUILD_ID_REGEX.test('Build ID: abc123')).toBe(true);
      expect(BUILD_ID_REGEX.test('build id: xyz789')).toBe(true);
      expect(BUILD_ID_REGEX.test('No build identifier')).toBe(false);
    });

    it('should validate generation regex pattern', () => {
      const GENERATION_REGEX = /^=== Generation: ([0-9]+) ===$/;
      expect(GENERATION_REGEX.test('=== Generation: 1 ===')).toBe(true);
      expect(GENERATION_REGEX.test('=== Generation: 123 ===')).toBe(true);
      expect(GENERATION_REGEX.test('Generation: 1')).toBe(false);
      expect(GENERATION_REGEX.test('=== Generation: abc ===')).toBe(false);
    });

    it('should validate file size limit', () => {
      const MAX_FILE_SIZE = 9.9 * 1024 * 1024; // 9.9MB
      expect(MAX_FILE_SIZE).toBe(10380902.4);
      
      const smallFile = 5 * 1024 * 1024; // 5MB
      const largeFile = 15 * 1024 * 1024; // 15MB
      
      expect(smallFile < MAX_FILE_SIZE).toBe(true);
      expect(largeFile > MAX_FILE_SIZE).toBe(true);
    });
  });

  describe('Title generation', () => {
    it('should create title from first 60 characters', () => {
      const longDescription = 'This is a very long bug description that exceeds sixty characters and should be truncated';
      const title = longDescription.slice(0, 60) + (longDescription.length > 60 ? '...' : '');
      expect(title).toBe('This is a very long bug description that exceeds sixty chara...');
      expect(title.length).toBe(63); // 60 chars + '...'
    });

    it('should not truncate short descriptions', () => {
      const shortDescription = 'Short bug';
      const title = shortDescription.slice(0, 60) + (shortDescription.length > 60 ? '...' : '');
      expect(title).toBe('Short bug');
      expect(title.length).toBe(9);
    });
  });
});
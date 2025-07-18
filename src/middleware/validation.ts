import { Request, Response, NextFunction } from 'express';

// Banned keywords and patterns for security
const BANNED_KEYWORDS = [
  // System exploitation attempts
  'admin',
  'root',
  'sudo',
  'privilege',
  'escalation',
  'backdoor',
  'shell',
  'execute',
  'system',
  'command',
  'inject',
  'overflow',
  'buffer',
  'memory leak',

  // API/Service exploitation
  'api key',
  'bearer token',
  'authentication bypass',
  'jwt',
  'session',
  'cookie manipulation',
  'rate limit bypass',
  'dos',
  'ddos',

  // Data extraction attempts
  'database',
  'sql',
  'nosql',
  'query injection',
  'dump',
  'export',
  'extract',
  'download',
  'user data',
  'personal info',
  'private',

  // Service discovery
  'port scan',
  'nmap',
  'reconnaissance',
  'endpoint',
  'route',
  'path traversal',
  'directory listing',
  'file read',

  // Prompt injection/LLM exploitation
  'ignore previous',
  'ignore above',
  'system prompt',
  'roleplay',
  'pretend',
  'act as',
  'you are now',
  'bypass safety',
  'ignore rules',
  'ignore instructions',

  // General malicious patterns
  'spam',
  'scam',
  'phishing',
  'malware',
  'virus',
  'trojan',
  'ransomware',
];

// Suspicious patterns that might indicate malicious intent
const SUSPICIOUS_PATTERNS = [
  // Credential patterns
  /password\s*[=:]\s*\w+/i,
  /token\s*[=:]\s*\w+/i,
  /key\s*[=:]\s*\w+/i,
  /secret\s*[=:]\s*\w+/i,
  /api\s*key\s*[=:]\s*\w+/i,
  /bearer\s*token\s*[=:]\s*\w+/i,

  // System command patterns
  /system\s*\(/i,
  /exec\s*\(/i,
  /eval\s*\(/i,
  /shell\s*\(/i,

  // Prompt injection patterns
  /ignore\s+previous/i,
  /ignore\s+above/i,
  /system\s+prompt/i,
  /roleplay\s+as/i,
  /pretend\s+to\s+be/i,
  /act\s+as\s+if/i,
  /you\s+are\s+now/i,
  /bypass\s+safety/i,
  /ignore\s+rules/i,
  /ignore\s+instructions/i,

  // SQL injection patterns
  /union\s+select/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /insert\s+into/i,
  /update\s+set/i,

  // Path traversal patterns
  /\.\.\/\.\./i,
  /\.\.\\\.\./i,
  /\.\.%2f\.\./i,

  // Exploitation patterns
  /exploit\s+\w+/i,
  /hack\s+\w+/i,
  /bypass\s+\w+/i,
  /inject\s+\w+/i,
  /overflow\s+\w+/i,
];

export function validateChatMessage(req: Request, res: Response, next: NextFunction): void {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required and must be a string' });
    return;
  }

  // Check message length
  if (message.length > 2000) {
    res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    return;
  }

  // Check for banned keywords
  const lowerMessage = message.toLowerCase();
  const foundBannedKeywords = BANNED_KEYWORDS.filter((keyword) => lowerMessage.includes(keyword));

  if (foundBannedKeywords.length > 0) {
    res.status(400).json({
      error: 'Message contains inappropriate content',
      details: 'Your message appears to contain potentially harmful keywords',
    });
    return;
  }

  // Check for suspicious patterns
  const suspiciousPatterns = SUSPICIOUS_PATTERNS.filter((pattern) => pattern.test(message));

  if (suspiciousPatterns.length > 0) {
    res.status(400).json({
      error: 'Message contains suspicious patterns',
      details: 'Your message appears to contain potentially harmful patterns',
    });
    return;
  }

  // Rate limiting check (basic)
  const clientIP = req.ip ?? req.connection.remoteAddress;
  const now = Date.now();

  // Simple in-memory rate limiting (consider Redis for production)
  req.app.locals['rateLimit'] ??= new Map();

  const clientRequests = req.app.locals['rateLimit'].get(clientIP) ?? [];
  const recentRequests = clientRequests.filter((time: number) => now - time < 60000); // 1 minute window

  if (recentRequests.length >= 10) {
    // Max 10 requests per minute
    res.status(429).json({
      error: 'Rate limit exceeded. Please wait before sending another message.',
    });
    return;
  }

  recentRequests.push(now);
  req.app.locals['rateLimit'].set(clientIP, recentRequests);

  next();
}

export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim();
}

/**
 * Security configuration for input validation and sanitization
 */

export const SECURITY_CONFIG = {
  /** Maximum allowed message length */
  MAX_MESSAGE_LENGTH: 2000,

  /** Banned keywords that indicate potentially harmful content */
  BANNED_KEYWORDS: [
    'admin',
    'root',
    'sudo',
    'shell',
    'execute',
    'system',
    'command',
    'inject',
    'api key',
    'bearer token',
    'jwt',
    'session',
    'database',
    'sql',
    'dump',
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
    'spam',
    'scam',
    'phishing',
    'malware',
    'virus',
    'trojan',
    'ransomware',
  ] as const,

  /** Suspicious patterns that might indicate malicious intent */
  SUSPICIOUS_PATTERNS: [
    /password\s*[=:]\s*\w+/i,
    /token\s*[=:]\s*\w+/i,
    /key\s*[=:]\s*\w+/i,
    /system\s*\(/i,
    /exec\s*\(/i,
    /eval\s*\(/i,
    /shell\s*\(/i,
    /ignore\s+previous/i,
    /ignore\s+above/i,
    /system\s+prompt/i,
    /union\s+select/i,
    /drop\s+table/i,
    /\.\.\/\.\./i,
    /\.\.\\\.\./i,
    /exploit\s+\w+/i,
    /hack\s+\w+/i,
    /bypass\s+\w+/i,
    /inject\s+\w+/i,
  ] as const,

  /** Characters and protocols to remove during sanitization */
  SANITIZATION: {
    REMOVE_CHARS: /[<>]/g,
    REMOVE_PROTOCOLS: /javascript:|data:/gi,
  },
} as const;

import { SECURITY_CONFIG } from '@/config/security';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';

import type { Request, Response, NextFunction } from 'express';

/**
 * Validates basic input requirements (type, length)
 */
function validateInput(message: unknown): string | null {
  if (!message || typeof message !== 'string')
    return MESSAGES.validation.messageEmpty;
  if (message.length > SECURITY_CONFIG.MAX_MESSAGE_LENGTH)
    return MESSAGES.validation.messageTooLong;
  return null;
}

/**
 * Sanitizes message by removing dangerous characters and protocols
 */
function sanitizeMessage(message: string): string {
  return message
    .replace(SECURITY_CONFIG.SANITIZATION.REMOVE_CHARS, '')
    .replace(SECURITY_CONFIG.SANITIZATION.REMOVE_PROTOCOLS, '')
    .trim();
}

/**
 * Checks for banned keywords and suspicious patterns
 */
function checkSecurity(message: string, ip: string): string | null {
  const lowerMessage = message.toLowerCase();
  const foundBannedKeywords = SECURITY_CONFIG.BANNED_KEYWORDS.filter(
    (keyword) => lowerMessage.includes(keyword),
  );
  if (foundBannedKeywords.length > 0) {
    logger.warn('Banned keywords detected', {
      keywords: foundBannedKeywords,
      ip,
    });
    return 'Message contains inappropriate content';
  }

  const suspiciousPatterns = SECURITY_CONFIG.SUSPICIOUS_PATTERNS.filter(
    (pattern) => pattern.test(message),
  );
  if (suspiciousPatterns.length > 0) {
    logger.warn('Suspicious patterns detected', {
      patterns: suspiciousPatterns.map((p) => p.source),
      ip,
    });
    return 'Message contains suspicious patterns';
  }

  return null;
}

/**
 * Validates and sanitizes chat messages. Checks input type/length, sanitizes content,
 * and validates against security rules (banned keywords, suspicious patterns).
 */
export function validateChatMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const { message } = req.body;

    const validationError = validateInput(message);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const sanitizedMessage = sanitizeMessage(message as string);
    const securityError = checkSecurity(sanitizedMessage, req.ip ?? 'unknown');
    if (securityError) {
      res.status(400).json({ error: securityError });
      return;
    }

    req.body.message = sanitizedMessage;
    next();
  } catch (error) {
    logger.error('Validation error', { error, ip: req.ip });
    res.status(500).json({ error: MESSAGES.error.internalServer });
  }
}

/**
 * Sanitizes input by removing potentially dangerous characters and protocols
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(SECURITY_CONFIG.SANITIZATION.REMOVE_CHARS, '')
    .replace(SECURITY_CONFIG.SANITIZATION.REMOVE_PROTOCOLS, '')
    .trim();
}

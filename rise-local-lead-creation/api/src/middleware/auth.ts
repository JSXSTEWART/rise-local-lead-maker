import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  apiKeyName?: string;
}

interface AuthOptions {
  required?: boolean;
  allowedKeys?: string[];
}

// API keys stored in environment variable as comma-separated "name:key" pairs
// Example: API_KEYS="admin:abc123,readonly:xyz789"
function getApiKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const apiKeysEnv = process.env.API_KEYS || process.env.RISE_API_KEY;

  if (!apiKeysEnv) {
    return keys;
  }

  // Support both single key and multiple keys
  if (apiKeysEnv.includes(':')) {
    // Multiple keys format: "name1:key1,name2:key2"
    apiKeysEnv.split(',').forEach(pair => {
      const [name, key] = pair.trim().split(':');
      if (name && key) {
        keys.set(key, name);
      }
    });
  } else {
    // Single key format
    keys.set(apiKeysEnv, 'default');
  }

  return keys;
}

// Constant-time comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function apiKeyAuth(options: AuthOptions = {}) {
  const { required = false } = options;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKeys = getApiKeys();

    // If no API keys configured, authentication is disabled
    if (apiKeys.size === 0) {
      if (required) {
        console.warn('[AUTH] API key authentication is required but no keys are configured');
      }
      return next();
    }

    // Extract API key from header or query
    const authHeader = req.headers.authorization;
    let providedKey: string | undefined;

    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        providedKey = authHeader.slice(7);
      } else if (authHeader.startsWith('ApiKey ')) {
        providedKey = authHeader.slice(7);
      } else {
        providedKey = authHeader;
      }
    } else if (req.query.api_key) {
      providedKey = req.query.api_key as string;
    } else if (req.headers['x-api-key']) {
      providedKey = req.headers['x-api-key'] as string;
    }

    if (!providedKey) {
      if (required) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'API key required. Provide via Authorization header or x-api-key header.',
            code: 'AUTH_REQUIRED',
          },
        });
      }
      return next();
    }

    // Check if key is valid
    let keyName: string | undefined;
    for (const [key, name] of apiKeys) {
      if (secureCompare(providedKey, key)) {
        keyName = name;
        break;
      }
    }

    if (!keyName) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid API key.',
          code: 'INVALID_API_KEY',
        },
      });
    }

    // Attach key info to request
    req.apiKey = providedKey;
    req.apiKeyName = keyName;

    console.log(`[AUTH] Request authenticated with key: ${keyName}`);
    next();
  };
}

// Pre-configured auth middlewares
export const optionalAuth = apiKeyAuth({ required: false });
export const requireAuth = apiKeyAuth({ required: true });

// Helper to check if authentication is configured
export function isAuthConfigured(): boolean {
  return getApiKeys().size > 0;
}

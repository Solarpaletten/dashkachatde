# 🔐 Security Checklist - DashkaBot

**Priority:** CRITICAL  
**Status:** Action Required Immediately

---

## 🚨 CRITICAL: OpenAI API Key Exposed

### Problem

The `.env` file containing the OpenAI API key was shared in code review. This is a **critical security breach**.

### Immediate Actions Required

#### 1. Rotate the API Key (DO THIS NOW)

```bash
# 1. Go to https://platform.openai.com/api-keys
# 2. Find the compromised key: sk-proj-oaYvlg8l1g7JrtQiMK...
# 3. Click "Revoke" to disable it
# 4. Generate a new API key
# 5. Update backend/.env with new key
```

#### 2. Check Git History

```bash
# Check if .env was ever committed
cd DashkaVoiceFranceTranslate
git log --all --full-history -- "backend/.env"
```

**If `.env` appears in git history:**

```bash
# Remove .env from entire git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push to remote (WARNING: This rewrites history)
git push origin --force --all
git push origin --force --tags
```

#### 3. Verify .gitignore

```bash
# Check if .env is in .gitignore
cat .gitignore | grep ".env"

# If not present, add it:
echo ".env" >> .gitignore
echo "*.env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore

# Commit the change
git add .gitignore
git commit -m "Add .env to .gitignore"
git push
```

#### 4. Audit OpenAI Usage

```bash
# Check usage on platform.openai.com/usage
# Look for:
# - Unexpected API calls
# - Requests from unknown IPs
# - High token usage
```

### Long-term Prevention

```bash
# Use git-secrets to prevent future commits of secrets
npm install -g git-secrets
git secrets --install
git secrets --register-aws
```

---

## 🔒 Current Security Issues

### 1. No Authentication

**Issue:** API and WebSocket are completely open - anyone can connect and use services.

**Risk:**
- Unlimited API usage
- Abuse of OpenAI credits
- DDoS attacks
- Data harvesting

**Solution:**

**Option A: API Key Authentication**

```javascript
// middleware/auth.js
function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or missing API key'
    });
  }
  
  next();
}

// Apply to routes
app.use('/translate', apiKeyAuth);
app.use('/voice-translate', apiKeyAuth);
```

**Option B: JWT Tokens**

```javascript
// middleware/jwt.js
const jwt = require('jsonwebtoken');

function jwtAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 2. CORS Misconfiguration

**Issue:** CORS is set to `*` (allows all origins).

**Risk:**
- Any website can call your API
- CSRF attacks
- Data leakage

**Current code:**
```javascript
cors({ origin: '*' })
```

**Fix:**

```javascript
// config/cors.js
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};

// .env
CORS_ORIGIN=https://dashkabot.swapoil.de,https://yourdomain.com
```

### 3. No WebSocket Authentication

**Issue:** Anyone can connect to WebSocket and receive/send messages.

**Risk:**
- Unauthorized access to real-time translations
- Message injection
- Privacy breaches

**Fix:**

```javascript
// websocket/index.js
const { verify } = require('jsonwebtoken');

wss.on('connection', (ws, request) => {
  // Extract token from query string
  const params = new URLSearchParams(request.url.split('?')[1]);
  const token = params.get('token');
  
  if (!token) {
    ws.close(1008, 'No authentication token');
    return;
  }
  
  try {
    const user = verify(token, process.env.JWT_SECRET);
    ws.user = user;
    // Continue with connection...
  } catch (error) {
    ws.close(1008, 'Invalid token');
    return;
  }
});
```

### 4. Rate Limiting Insufficient

**Current limits:**
- Development: 1000 requests/15min (too high)
- Production: 100 requests/15min (still vulnerable)

**Issue:** Single IP can still overwhelm server or waste OpenAI credits.

**Fix:**

```javascript
// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');

// For production, use Redis store
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

const strictLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Stricter limit
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip for authenticated users with premium tier
  skip: (req) => req.user?.tier === 'premium'
});
```

### 5. No Input Sanitization

**Issue:** User input is not sanitized before processing.

**Risk:**
- XSS attacks (if rendered in browser)
- Injection attacks
- Malformed data causing crashes

**Fix:**

```javascript
// middleware/sanitize.js
const validator = require('validator');
const xss = require('xss');

function sanitizeInput(req, res, next) {
  if (req.body.text) {
    // Remove HTML/JS
    req.body.text = xss(req.body.text);
    
    // Trim whitespace
    req.body.text = validator.trim(req.body.text);
    
    // Limit length
    if (req.body.text.length > 5000) {
      return res.status(400).json({
        error: 'Text too long (max 5000 characters)'
      });
    }
  }
  
  next();
}

// Apply to routes
app.use('/translate', sanitizeInput);
```

### 6. File Upload Vulnerabilities

**Issue:** Audio uploads only check MIME type, which can be spoofed.

**Risk:**
- Malicious files uploaded
- Storage abuse
- Code execution

**Fix:**

```javascript
// config/multer.js
const fileType = require('file-type');

const upload = multer({
  storage: multer.diskStorage({
    destination: 'temp/',
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: async (req, file, cb) => {
    // Check MIME type
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only audio files allowed'));
    }
    
    cb(null, true);
  }
});

// Add file validation middleware
async function validateAudioFile(req, res, next) {
  if (!req.file) return next();
  
  try {
    // Check actual file type (not just extension)
    const type = await fileType.fromFile(req.file.path);
    
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'];
    
    if (!type || !allowedTypes.includes(type.mime)) {
      fs.unlinkSync(req.file.path); // Delete suspicious file
      return res.status(400).json({ error: 'Invalid audio file type' });
    }
    
    next();
  } catch (error) {
    fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'File validation failed' });
  }
}
```

### 7. Sensitive Data in Logs

**Issue:** Logs may contain sensitive information (API keys, user data).

**Risk:**
- Data leakage through log files
- Compliance violations (GDPR, etc.)

**Fix:**

```javascript
// utils/logger.js
const winston = require('winston');

// Custom format to redact sensitive data
const redactFormat = winston.format((info) => {
  // Redact API keys
  if (info.message) {
    info.message = info.message.replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-***REDACTED***');
  }
  
  // Redact email addresses
  if (info.email) {
    info.email = info.email.replace(/(.{2}).*(@.*)/, '$1***$2');
  }
  
  return info;
});

const logger = winston.createLogger({
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // ...
  ]
});
```

### 8. No HTTPS Enforcement

**Issue:** Production may serve over HTTP, exposing data in transit.

**Risk:**
- Man-in-the-middle attacks
- Data interception
- API key theft

**Fix:**

```javascript
// middleware/forceHttps.js
function forceHttps(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

app.use(forceHttps);
```

### 9. Missing Security Headers

**Issue:** No security headers like CSP, HSTS, etc.

**Fix:**

```javascript
// Already using helmet, but ensure proper config:
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
}));
```

### 10. Environment Variables Not Validated

**Issue:** Missing or invalid env vars can cause silent failures.

**Fix:**

```javascript
// config/validate.js
function validateEnv() {
  const required = ['OPENAI_API_KEY', 'PORT'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  // Validate API key format
  if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
    console.error('Invalid OPENAI_API_KEY format');
    process.exit(1);
  }
  
  console.log('Environment variables validated successfully');
}

// Call on startup
validateEnv();
```

---

## Priority Action Plan

### Immediate (Today)

- [ ] **Rotate OpenAI API key**
- [ ] **Check git history for .env**
- [ ] **Verify .gitignore includes .env**
- [ ] **Audit OpenAI usage dashboard**

### High Priority (This Week)

- [ ] **Add API key authentication**
- [ ] **Fix CORS configuration**
- [ ] **Add WebSocket authentication**
- [ ] **Implement stricter rate limiting**
- [ ] **Add input sanitization**

### Medium Priority (Next 2 Weeks)

- [ ] **Improve file upload validation**
- [ ] **Add sensitive data redaction in logs**
- [ ] **Enforce HTTPS in production**
- [ ] **Configure security headers properly**
- [ ] **Add environment variable validation**

### Long-term (Next Month)

- [ ] **Implement Redis for rate limiting**
- [ ] **Add monitoring and alerting (Sentry)**
- [ ] **Set up WAF (Web Application Firewall)**
- [ ] **Regular security audits**
- [ ] **Penetration testing**

---

## Security Best Practices

### 1. Secret Management

**Never:**
- Commit secrets to git
- Share API keys in Slack/Email
- Log API keys
- Store secrets in code

**Always:**
- Use environment variables
- Rotate keys regularly (every 90 days)
- Use separate keys for dev/staging/prod
- Monitor key usage

### 2. Dependencies

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies regularly
npm outdated
npm update
```

### 3. Monitoring

**Set up alerts for:**
- High API usage
- Failed authentication attempts
- Unusual traffic patterns
- Error rate spikes
- Memory/CPU anomalies

### 4. Backups

```bash
# Backup critical data
# - Translation cache
# - User data (if any)
# - Configuration files

# Schedule daily backups
0 2 * * * /backup-script.sh
```

### 5. Incident Response Plan

**If breach detected:**
1. Immediately rotate all secrets
2. Block suspicious IPs
3. Review logs for extent of breach
4. Notify users if data compromised
5. Document incident
6. Implement preventive measures

---

## Compliance Considerations

### GDPR (if serving EU users)

- [ ] Privacy policy
- [ ] Data processing agreement
- [ ] User consent for data collection
- [ ] Right to deletion
- [ ] Data export functionality
- [ ] Encryption at rest and in transit

### CCPA (if serving California users)

- [ ] Do Not Sell My Info link
- [ ] Data disclosure requirements
- [ ] Opt-out mechanisms

---

## Security Tools

### Recommended Installations

```bash
# Static code analysis
npm install --save-dev eslint eslint-plugin-security

# Dependency vulnerability scanning
npm install --save-dev snyk

# Git secrets prevention
npm install -g git-secrets

# API security testing
npm install --save-dev newman
```

### Continuous Security

**.github/workflows/security.yml:**
```yaml
name: Security Scan

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm audit
      - run: npm run lint:security
```

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [OpenAI API Security](https://platform.openai.com/docs/guides/safety-best-practices)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## Contact

For security issues, contact:
- Email: security@your-domain.com
- Responsible disclosure: 90 days

**Do NOT publicly disclose security vulnerabilities before contacting us.**

---

**Last Updated:** October 3, 2025  
**Next Review:** November 3, 2025
# iOS Compliance Scanner API
**For Lumen Dashboard - Built by Unc Lumen 💎**

Real-time iOS App Store compliance scanning with live Apple Guidelines integration.

## Features

✅ **IPA File Upload** - Drag & drop .ipa files for instant scanning  
✅ **URL Import** - Scan IPA files from URLs  
✅ **Live Apple Guidelines** - Real-time scraping of Apple's review guidelines  
✅ **Complete Compliance Check** - Scans against 30+ rejection patterns  
✅ **Privacy Manifest Validation** - PrivacyInfo.xcprivacy completeness check  
✅ **Binary Inspection** - Deep IPA binary analysis  

## Quick Start

### 1. Install Dependencies
```bash
cd ios-compliance-api
npm install
```

### 2. Install Greenlight CLI
```bash
# Homebrew (recommended)
brew install revylai/tap/greenlight

# Or build from source
cd .. && make build
# Binary at: build/greenlight
```

### 3. Start Server
```bash
npm start
# API runs on http://localhost:3456
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Get Apple Guidelines (Live)
```bash
GET /api/guidelines
```
Fetches latest App Store Review Guidelines from Apple's website.

### Search Guidelines
```bash
GET /api/guidelines/search?q=privacy
```
Search Apple's guidelines for specific topics.

### Scan IPA (File Upload)
```bash
POST /api/scan/upload
Content-Type: multipart/form-data

Body:
- ipa: [IPA file]
```

**Response:**
```json
{
  "scanId": "1707701234567",
  "timestamp": "2026-02-11T21:00:00.000Z",
  "fileName": "MyApp.ipa",
  "fileSize": 45678901,
  "results": {
    "status": "GREENLIT|BLOCKED",
    "critical": 0,
    "warnings": 2,
    "info": 5,
    "findings": [...]
  },
  "guidelines": {
    "lastUpdated": "2026-02-11T21:00:00.000Z",
    "sections": [...]
  }
}
```

### Scan IPA (From URL)
```bash
POST /api/scan/url
Content-Type: application/json

{
  "url": "https://example.com/app.ipa"
}
```

### Full Preflight Scan
```bash
POST /api/scan/preflight
Content-Type: application/json

{
  "projectPath": "/path/to/xcode/project"
}
```
Optional: Include IPA file as multipart/form-data

### Code Scan Only
```bash
POST /api/scan/code
Content-Type: application/json

{
  "projectPath": "/path/to/xcode/project"
}
```

### Privacy Manifest Scan
```bash
POST /api/scan/privacy
Content-Type: application/json

{
  "projectPath": "/path/to/xcode/project"
}
```

## Severity Levels

| Level | Label | Action |
|-------|-------|--------|
| **CRITICAL** | Will be rejected | Must fix before submission |
| **WARN** | High rejection risk | Should fix |
| **INFO** | Best practice | Consider fixing |

**GREENLIT = Zero critical findings**

## Example: Scan IPA from URL

```javascript
const response = await fetch('http://localhost:3456/api/scan/url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/build.ipa'
  })
});

const result = await response.json();
console.log(`Status: ${result.results.status}`);
console.log(`Critical: ${result.results.critical}`);
console.log(`Warnings: ${result.results.warnings}`);
```

## Example: Upload IPA File

```javascript
const formData = new FormData();
formData.append('ipa', ipaFile); // File object from input

const response = await fetch('http://localhost:3456/api/scan/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

## Integration with Lumen Dashboard

### Frontend Component (React)

```jsx
import { useState } from 'react';

function IOSComplianceScanner() {
  const [scanResults, setScanResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const scanIPA = async (file) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('ipa', file);

    const response = await fetch('http://localhost:3456/api/scan/upload', {
      method: 'POST',
      body: formData
    });

    const results = await response.json();
    setScanResults(results);
    setLoading(false);
  };

  return (
    <div className="compliance-scanner">
      <h2>iOS App Store Compliance Scanner</h2>
      
      <input
        type="file"
        accept=".ipa"
        onChange={(e) => scanIPA(e.target.files[0])}
        disabled={loading}
      />

      {loading && <p>Scanning...</p>}

      {scanResults && (
        <div className="results">
          <h3>Scan Results</h3>
          <p>Status: <strong>{scanResults.results.status}</strong></p>
          <p>Critical Issues: {scanResults.results.critical}</p>
          <p>Warnings: {scanResults.results.warnings}</p>
          
          <div className="findings">
            {scanResults.results.findings?.map((finding, i) => (
              <div key={i} className={`finding ${finding.severity}`}>
                <strong>{finding.severity}</strong>: {finding.message}
                <p>{finding.fix}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## What Gets Scanned

### Metadata Checks
- App name, version, bundle ID format
- App icon presence and dimensions
- Privacy policy URL
- Purpose strings quality

### Code Pattern Checks (30+ Rules)
- Private API usage (§2.5.1) ❌ CRITICAL
- Hardcoded secrets/API keys (§1.6) ❌ CRITICAL
- External payment for digital goods (§3.1.1) ❌ CRITICAL
- Dynamic code execution (§2.5.2) ❌ CRITICAL
- Cryptocurrency mining (§3.1.5) ❌ CRITICAL
- Missing Sign in with Apple (§4.8) ⚠️ WARN
- Missing Restore Purchases (§3.1.1) ⚠️ WARN
- Missing ATT for tracking SDKs (§5.1.2) ⚠️ WARN
- Account deletion option (§5.1.1) ⚠️ WARN
- Placeholder content (§2.1) ℹ️ INFO
- Platform references (§2.3) ℹ️ INFO
- Hardcoded IPv4 addresses (§2.5) ℹ️ INFO
- Insecure HTTP URLs (§1.6) ℹ️ INFO

### Privacy Manifest Checks
- PrivacyInfo.xcprivacy presence
- Required Reason APIs declared
- Tracking SDKs vs ATT implementation
- Cross-reference with actual code usage

### Binary Inspection
- Info.plist completeness
- Launch storyboard
- App icons (all required sizes)
- App size
- Framework privacy manifests

## Environment Variables

```bash
PORT=3456                    # API server port
MAX_FILE_SIZE=524288000      # Max IPA size (500MB default)
UPLOAD_DIR=./uploads         # Temporary upload directory
```

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3456
CMD ["npm", "start"]
```

## Monitoring & Logs

Server logs include:
- API requests (method, path, status)
- Scan duration
- File sizes
- Errors and stack traces

## Security Notes

⚠️ **Important:**
- This API accepts arbitrary IPA files - deploy behind authentication
- IPA files are deleted after scanning (temp storage only)
- URL downloads are limited to 500MB
- No IPA files are stored long-term
- Consider rate limiting in production

## Troubleshooting

**"greenlight: command not found"**
```bash
brew install revylai/tap/greenlight
# Or add to PATH if built from source
```

**"Failed to fetch Apple guidelines"**
- Apple's website structure may have changed
- Fallback to cached guidelines (todo: implement caching)
- Guidelines search via greenlight CLI still works

**"Scan failed: ENOENT"**
- Ensure greenlight binary is in PATH
- Check project path exists and is readable

## Next Steps

- [ ] Add caching for Apple Guidelines
- [ ] Implement scan history database
- [ ] Add user authentication
- [ ] Rate limiting per IP
- [ ] WebSocket support for real-time scan progress
- [ ] Email/Slack notifications when scan completes
- [ ] Trend analysis (track rejection patterns over time)

---

**Built for Lumen Dashboard**  
*Know before you submit* 🚀

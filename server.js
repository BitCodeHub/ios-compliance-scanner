const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const cheerio = require('cheerio');
const { generateCompliancePDF } = require('./pdf-generator');
const { analyzeWithAI, generateFixSuggestions } = require('./ai-analyzer');

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Multer configuration for IPA file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueId}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.ipa')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ipa files are allowed'));
    }
  }
});

// Helper: Run greenlight CLI
function runGreenlight(args) {
  return new Promise((resolve, reject) => {
    // Use GREENLIGHT_PATH env var or default to 'greenlight' in PATH
    const greenlightBin = process.env.GREENLIGHT_PATH || 'greenlight';
    const command = `${greenlightBin} ${args}`;
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject({ error: error.message, stderr });
      } else {
        // Greenlight may exit with code 1 if issues found, but still outputs results
        resolve({ stdout, stderr, exitCode: error?.code || 0 });
      }
    });
  });
}

// Helper: Download IPA from URL
async function downloadIPA(url, outputPath) {
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    maxContentLength: 500 * 1024 * 1024, // 500MB max
    headers: {
      'User-Agent': 'Lumen-iOS-Compliance-Scanner/1.0'
    }
  });

  const writer = require('fs').createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Helper: Fetch latest Apple Guidelines
async function fetchAppleGuidelines() {
  try {
    const response = await axios.get('https://developer.apple.com/app-store/review/guidelines/');
    const $ = cheerio.load(response.data);
    
    const guidelines = [];
    $('article section').each((i, section) => {
      const title = $(section).find('h2').first().text().trim();
      const content = $(section).find('p').first().text().trim();
      if (title && content) {
        guidelines.push({ section: i + 1, title, content });
      }
    });

    return {
      lastUpdated: new Date().toISOString(),
      url: 'https://developer.apple.com/app-store/review/guidelines/',
      sections: guidelines
    };
  } catch (error) {
    console.error('Failed to fetch Apple guidelines:', error.message);
    return {
      lastUpdated: new Date().toISOString(),
      url: 'https://developer.apple.com/app-store/review/guidelines/',
      sections: [],
      error: 'Failed to fetch live guidelines'
    };
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'iOS Compliance Scanner API', version: '1.0.0' });
});

// Get Apple Guidelines (live)
app.get('/api/guidelines', async (req, res) => {
  try {
    const guidelines = await fetchAppleGuidelines();
    res.json(guidelines);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch guidelines', details: error.message });
  }
});

// Search Apple Guidelines
app.get('/api/guidelines/search', async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const result = await runGreenlight(`guidelines search "${q}"`);
    res.json({
      query: q,
      results: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search guidelines', details: error.message });
  }
});

// Scan IPA from uploaded file
app.post('/api/scan/upload', upload.single('ipa'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No IPA file uploaded' });
  }

  const ipaPath = req.file.path;
  const scanId = path.basename(ipaPath, '.ipa');

  try {
    // Run greenlight ipa scan
    const result = await runGreenlight(`ipa "${ipaPath}" --format json`);
    
    // Parse JSON output if available
    let scanResults;
    try {
      scanResults = JSON.parse(result.stdout);
    } catch {
      scanResults = {
        rawOutput: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    // Cleanup: Delete uploaded file after scan
    await fs.unlink(ipaPath).catch(() => {});

    res.json({
      scanId,
      timestamp: new Date().toISOString(),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      results: scanResults,
      guidelines: await fetchAppleGuidelines()
    });

  } catch (error) {
    // Cleanup on error
    await fs.unlink(ipaPath).catch(() => {});
    res.status(500).json({ error: 'Scan failed', details: error.message });
  }
});

// Scan IPA from URL
app.post('/api/scan/url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!url.endsWith('.ipa')) {
    return res.status(400).json({ error: 'URL must point to an .ipa file' });
  }

  const uploadDir = path.join(__dirname, 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  
  const scanId = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ipaPath = path.join(uploadDir, `${scanId}.ipa`);

  try {
    // Download IPA from URL
    await downloadIPA(url, ipaPath);

    // Get file stats
    const stats = await fs.stat(ipaPath);

    // Run greenlight ipa scan
    const result = await runGreenlight(`ipa "${ipaPath}" --format json`);
    
    // Parse JSON output if available
    let scanResults;
    try {
      scanResults = JSON.parse(result.stdout);
    } catch {
      scanResults = {
        rawOutput: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    // Cleanup: Delete downloaded file after scan
    await fs.unlink(ipaPath).catch(() => {});

    res.json({
      scanId,
      timestamp: new Date().toISOString(),
      sourceUrl: url,
      fileSize: stats.size,
      results: scanResults,
      guidelines: await fetchAppleGuidelines()
    });

  } catch (error) {
    // Cleanup on error
    await fs.unlink(ipaPath).catch(() => {});
    res.status(500).json({ error: 'Scan failed', details: error.message });
  }
});

// Full preflight scan (requires project directory)
app.post('/api/scan/preflight', upload.single('ipa'), async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'Project path is required' });
  }

  try {
    // Build greenlight command
    let command = `preflight "${projectPath}" --format json`;
    if (req.file) {
      command += ` --ipa "${req.file.path}"`;
    }

    const result = await runGreenlight(command);
    
    // Parse JSON output
    let scanResults;
    try {
      scanResults = JSON.parse(result.stdout);
    } catch {
      scanResults = {
        rawOutput: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    // Cleanup uploaded IPA if provided
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.json({
      scanId: Date.now(),
      timestamp: new Date().toISOString(),
      projectPath,
      results: scanResults,
      guidelines: await fetchAppleGuidelines()
    });

  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: 'Preflight scan failed', details: error.message });
  }
});

// Code scan only
app.post('/api/scan/code', async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'Project path is required' });
  }

  try {
    const result = await runGreenlight(`codescan "${projectPath}" --format json`);
    
    let scanResults;
    try {
      scanResults = JSON.parse(result.stdout);
    } catch {
      scanResults = {
        rawOutput: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    res.json({
      scanId: Date.now(),
      timestamp: new Date().toISOString(),
      projectPath,
      scanType: 'code',
      results: scanResults
    });

  } catch (error) {
    res.status(500).json({ error: 'Code scan failed', details: error.message });
  }
});

// Privacy manifest scan
app.post('/api/scan/privacy', async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'Project path is required' });
  }

  try {
    const result = await runGreenlight(`privacy "${projectPath}" --format json`);
    
    let scanResults;
    try {
      scanResults = JSON.parse(result.stdout);
    } catch {
      scanResults = {
        rawOutput: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    res.json({
      scanId: Date.now(),
      timestamp: new Date().toISOString(),
      projectPath,
      scanType: 'privacy',
      results: scanResults
    });

  } catch (error) {
    res.status(500).json({ error: 'Privacy scan failed', details: error.message });
  }
});

// ============================================
// AI-POWERED ENHANCED SCAN WITH PDF REPORT
// ============================================

app.post('/api/scan/enhanced', upload.single('ipa'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No IPA file uploaded' });
  }

  const scanId = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const reportsDir = path.join(__dirname, 'reports');
  await require('fs').promises.mkdir(reportsDir, { recursive: true });

  try {
    let scanResults;

    // 1. Try to run greenlight scan (if available)
    try {
      console.log('🔍 Attempting greenlight scan...');
      const result = await runGreenlight(`ipa "${req.file.path}" --format json`);
      scanResults = JSON.parse(result.stdout);
      console.log('✅ Greenlight scan completed');
    } catch (greenlightError) {
      console.warn('⚠️ Greenlight not available:', greenlightError.message);
      // Fallback to basic scan
      scanResults = {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        findings: [
          {
            severity: 'INFO',
            title: 'Basic Scan Only',
            description: 'Full greenlight scan unavailable. This is a basic compliance check. Key reminders: ensure Sign in with Apple is implemented for apps with login, include privacy manifest for required reason APIs, test on real devices, and provide clear app descriptions.',
            guideline: '§2.1, §4.8, §5.1.2'
          }
        ],
        summary: { 
          status: 'WARNING', 
          critical: 0, 
          warnings: 1, 
          info: 0,
          message: 'Greenlight CLI not available - basic scan only'
        }
      };
    }

    // 2. AI-powered analysis (if API key available)
    console.log('🤖 Running AI analysis...');
    const aiAnalysis = await analyzeWithAI(scanResults);
    scanResults.aiAnalysis = aiAnalysis;

    // 3. Generate AI fix suggestions for each finding (if API key available)
    if (scanResults.findings && scanResults.findings.length > 0 && !aiAnalysis.error) {
      console.log('💡 Generating AI fix suggestions...');
      scanResults.findings = await generateFixSuggestions(scanResults.findings);
    }

    // 4. Generate professional PDF report
    console.log('📄 Generating PDF report...');
    const pdfPath = path.join(reportsDir, `compliance-report-${scanId}.pdf`);
    await generateCompliancePDF(scanResults, pdfPath);

    // 5. Cleanup uploaded IPA
    await fs.unlink(req.file.path).catch(() => {});

    // 6. Build download URL (handle both localhost and production)
    const baseUrl = req.get('host').includes('localhost') 
      ? `http://localhost:${PORT}`
      : `https://${req.get('host')}`;

    res.json({
      scanId,
      timestamp: new Date().toISOString(),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      results: scanResults,
      pdfReport: `/api/reports/${scanId}`,
      downloadUrl: `${baseUrl}/api/reports/${scanId}/download`
    });

  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error('Enhanced scan failed:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Enhanced scan failed', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Download PDF report
app.get('/api/reports/:scanId/download', async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, 'reports', `compliance-report-${req.params.scanId}.pdf`);
    const stats = await fs.stat(pdfPath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ios-compliance-report-${req.params.scanId}.pdf"`);
    res.setHeader('Content-Length', stats.size);
    
    const stream = require('fs').createReadStream(pdfPath);
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: 'Report not found' });
  }
});

// View PDF report in browser
app.get('/api/reports/:scanId', async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, 'reports', `compliance-report-${req.params.scanId}.pdf`);
    const stats = await fs.stat(pdfPath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ios-compliance-report-${req.params.scanId}.pdf"`);
    res.setHeader('Content-Length', stats.size);
    
    const stream = require('fs').createReadStream(pdfPath);
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: 'Report not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 iOS Compliance Scanner API running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 Guidelines: http://localhost:${PORT}/api/guidelines`);
  console.log(`🤖 AI-Enhanced Scan: POST /api/scan/enhanced`);
  console.log(`📄 PDF Reports: GET /api/reports/:scanId/download`);
});

module.exports = app;

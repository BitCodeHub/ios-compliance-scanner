const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Guidelines caching
let guidelinesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Multer configuration
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
    // Try built version first, fall back to system greenlight
    const greenlightPath = path.join(__dirname, '../build/greenlight');
    const command = `${greenlightPath} ${args} 2>&1 || greenlight ${args}`;
    
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject({ error: error.message, stderr });
      } else {
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
    maxContentLength: 500 * 1024 * 1024,
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

// Helper: Fetch Apple Guidelines (with scraping)
async function fetchAppleGuidelines() {
  try {
    const response = await axios.get('https://developer.apple.com/app-store/review/guidelines/', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
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
      sections: guidelines.length > 0 ? guidelines : fallbackGuidelines()
    };
  } catch (error) {
    console.error('Failed to fetch Apple guidelines:', error.message);
    return {
      lastUpdated: new Date().toISOString(),
      url: 'https://developer.apple.com/app-store/review/guidelines/',
      sections: fallbackGuidelines(),
      error: 'Failed to fetch live guidelines, using fallback'
    };
  }
}

// Fallback guidelines (in case scraping fails)
function fallbackGuidelines() {
  return [
    {
      section: 1,
      title: 'Safety',
      content: 'Apps must be safe for users. Any content that is offensive, insensitive, upsetting, or is intended to disgust users will be rejected.'
    },
    {
      section: 2,
      title: 'Performance',
      content: 'Apps should include features, content, and UI that elevate them beyond a repackaged website. Apps should use APIs and frameworks for their intended purposes and indicate that integration in their app description.'
    },
    {
      section: 3,
      title: 'Business',
      content: 'There are many ways to monetize your app on the App Store. If your business model isn't obvious, make sure to explain in its metadata and App Review notes.'
    },
    {
      section: 4,
      title: 'Design',
      content: 'Apple customers place a high value on products that are simple, refined, innovative, and easy to use. Keep these principles in mind as you work on your app's design.'
    },
    {
      section: 5,
      title: 'Legal',
      content: 'Apps must comply with all legal requirements in any location where you make them available. It is your responsibility to understand and make sure your app conforms with all local laws.'
    }
  ];
}

// Helper: Get cached guidelines
async function getCachedGuidelines() {
  const now = Date.now();
  
  // Return cache if fresh
  if (guidelinesCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    return {
      ...guidelinesCache,
      cached: true,
      cacheAge: Math.floor((now - cacheTimestamp) / 1000 / 60) + ' minutes ago'
    };
  }

  // Fetch fresh guidelines
  try {
    guidelinesCache = await fetchAppleGuidelines();
    cacheTimestamp = now;
    return guidelinesCache;
  } catch (error) {
    // Return stale cache if fetch fails
    if (guidelinesCache) {
      return {
        ...guidelinesCache,
        cached: true,
        stale: true,
        error: 'Failed to fetch fresh guidelines, serving stale cache'
      };
    }
    throw error;
  }
}

// Routes

// Health check with guideline cache status
app.get('/health', (req, res) => {
  const guidelineAge = cacheTimestamp ? Date.now() - cacheTimestamp : null;
  const isStale = guidelineAge && guidelineAge > CACHE_DURATION;

  res.json({
    status: 'ok',
    service: 'iOS Compliance Scanner API',
    version: '1.0.0',
    guidelines: {
      cached: !!guidelinesCache,
      age: guidelineAge ? Math.floor(guidelineAge / 1000 / 60) + ' minutes' : 'not cached',
      stale: isStale,
      lastUpdated: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null,
      sections: guidelinesCache?.sections?.length || 0
    }
  });
});

// Get Apple Guidelines (with caching)
app.get('/api/guidelines', async (req, res) => {
  try {
    const guidelines = await getCachedGuidelines();
    res.json(guidelines);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch guidelines', details: error.message });
  }
});

// Force refresh guidelines
app.post('/api/guidelines/refresh', async (req, res) => {
  try {
    guidelinesCache = await fetchAppleGuidelines();
    cacheTimestamp = Date.now();
    res.json({ message: 'Guidelines refreshed', ...guidelinesCache });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh guidelines', details: error.message });
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
    const result = await runGreenlight(`ipa "${ipaPath}" --format json`);
    
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

    await fs.unlink(ipaPath).catch(() => {});

    res.json({
      scanId,
      timestamp: new Date().toISOString(),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      results: scanResults,
      guidelines: await getCachedGuidelines()
    });

  } catch (error) {
    await fs.unlink(ipaPath).catch(() => {});
    res.status(500).json({ error: 'Scan failed', details: error.message });
  }
});

// Scan IPA from URL
app.post('/api/scan/url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.endsWith('.ipa')) {
    return res.status(400).json({ error: 'Valid .ipa URL is required' });
  }

  const uploadDir = path.join(__dirname, 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  
  const scanId = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ipaPath = path.join(uploadDir, `${scanId}.ipa`);

  try {
    await downloadIPA(url, ipaPath);
    const stats = await fs.stat(ipaPath);
    const result = await runGreenlight(`ipa "${ipaPath}" --format json`);
    
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

    await fs.unlink(ipaPath).catch(() => {});

    res.json({
      scanId,
      timestamp: new Date().toISOString(),
      sourceUrl: url,
      fileSize: stats.size,
      results: scanResults,
      guidelines: await getCachedGuidelines()
    });

  } catch (error) {
    await fs.unlink(ipaPath).catch(() => {});
    res.status(500).json({ error: 'Scan failed', details: error.message });
  }
});

// Full preflight scan
app.post('/api/scan/preflight', upload.single('ipa'), async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'Project path is required' });
  }

  try {
    let command = `preflight "${projectPath}" --format json`;
    if (req.file) {
      command += ` --ipa "${req.file.path}"`;
    }

    const result = await runGreenlight(command);
    
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

    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.json({
      scanId: Date.now(),
      timestamp: new Date().toISOString(),
      projectPath,
      results: scanResults,
      guidelines: await getCachedGuidelines()
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

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 iOS Compliance Scanner API running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 Guidelines: http://localhost:${PORT}/api/guidelines`);
  
  // Pre-populate guidelines cache on startup
  console.log('📥 Pre-fetching Apple Guidelines...');
  try {
    await getCachedGuidelines();
    console.log('✅ Apple Guidelines cached');
  } catch (error) {
    console.error('⚠️  Failed to cache guidelines on startup:', error.message);
  }
});

module.exports = app;

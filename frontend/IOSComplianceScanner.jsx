import React, { useState } from 'react';
import './IOSComplianceScanner.css';

const IOSComplianceScanner = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [ipaUrl, setIpaUrl] = useState('');
  const [ipaFile, setIpaFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [guidelines, setGuidelines] = useState(null);
  const [error, setError] = useState(null);

  const API_BASE = 'http://localhost:3456';

  // Fetch Apple Guidelines
  const fetchGuidelines = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/guidelines`);
      const data = await response.json();
      setGuidelines(data);
    } catch (err) {
      console.error('Failed to fetch guidelines:', err);
    }
  };

  // Handle File Upload Scan
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.ipa')) {
      setError('Please select a valid .ipa file');
      return;
    }

    setIpaFile(file);
    setError(null);
    setLoading(true);
    setScanResults(null);

    const formData = new FormData();
    formData.append('ipa', file);

    try {
      const response = await fetch(`${API_BASE}/api/scan/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Scan failed: ${response.statusText}`);
      }

      const data = await response.json();
      setScanResults(data);
      setGuidelines(data.guidelines);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle URL Scan
  const handleUrlScan = async () => {
    if (!ipaUrl) {
      setError('Please enter a URL');
      return;
    }

    if (!ipaUrl.endsWith('.ipa')) {
      setError('URL must point to an .ipa file');
      return;
    }

    setError(null);
    setLoading(true);
    setScanResults(null);

    try {
      const response = await fetch(`${API_BASE}/api/scan/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ipaUrl })
      });

      if (!response.ok) {
        throw new Error(`Scan failed: ${response.statusText}`);
      }

      const data = await response.json();
      setScanResults(data);
      setGuidelines(data.guidelines);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get severity badge color
  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return '#dc2626';
      case 'warn': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  // Render findings
  const renderFindings = () => {
    if (!scanResults?.results?.findings) {
      return <p className="no-findings">No findings available</p>;
    }

    const { findings } = scanResults.results;
    if (findings.length === 0) {
      return (
        <div className="greenlit">
          <h3>✅ GREENLIT</h3>
          <p>No compliance issues found! Your app is ready for submission.</p>
        </div>
      );
    }

    return findings.map((finding, index) => (
      <div key={index} className="finding-card">
        <div className="finding-header">
          <span
            className="severity-badge"
            style={{ backgroundColor: getSeverityColor(finding.severity) }}
          >
            {finding.severity}
          </span>
          <span className="guideline-ref">{finding.guideline}</span>
        </div>
        
        <h4>{finding.title || finding.message}</h4>
        <p className="finding-description">{finding.description || finding.message}</p>
        
        {finding.location && (
          <div className="finding-location">
            <strong>Location:</strong> <code>{finding.location}</code>
          </div>
        )}

        {finding.fix && (
          <div className="finding-fix">
            <strong>How to Fix:</strong>
            <p>{finding.fix}</p>
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="ios-compliance-scanner">
      <div className="scanner-header">
        <h1>iOS App Store Compliance Scanner</h1>
        <p>Scan your iOS app against Apple's Review Guidelines before submission</p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📁 Upload IPA
        </button>
        <button
          className={`tab ${activeTab === 'url' ? 'active' : ''}`}
          onClick={() => setActiveTab('url')}
        >
          🔗 Scan from URL
        </button>
        <button
          className={`tab ${activeTab === 'guidelines' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('guidelines');
            if (!guidelines) fetchGuidelines();
          }}
        >
          📖 Apple Guidelines
        </button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="tab-content">
          <div className="upload-area">
            <label htmlFor="ipa-upload" className="upload-label">
              {ipaFile ? (
                <>
                  <span className="file-icon">📦</span>
                  <span className="file-name">{ipaFile.name}</span>
                  <span className="file-size">
                    ({(ipaFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </>
              ) : (
                <>
                  <span className="upload-icon">☁️</span>
                  <p>Drop your .ipa file here or click to browse</p>
                  <p className="upload-hint">Maximum file size: 500 MB</p>
                </>
              )}
            </label>
            <input
              id="ipa-upload"
              type="file"
              accept=".ipa"
              onChange={handleFileUpload}
              disabled={loading}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      )}

      {/* URL Tab */}
      {activeTab === 'url' && (
        <div className="tab-content">
          <div className="url-input-area">
            <input
              type="url"
              placeholder="https://example.com/app.ipa"
              value={ipaUrl}
              onChange={(e) => setIpaUrl(e.target.value)}
              disabled={loading}
              className="url-input"
            />
            <button
              onClick={handleUrlScan}
              disabled={loading || !ipaUrl}
              className="scan-button"
            >
              {loading ? 'Scanning...' : 'Scan IPA'}
            </button>
          </div>
        </div>
      )}

      {/* Guidelines Tab */}
      {activeTab === 'guidelines' && (
        <div className="tab-content">
          <div className="guidelines-section">
            <h2>Apple App Store Review Guidelines</h2>
            {guidelines ? (
              <>
                <p className="guidelines-meta">
                  Last updated: {new Date(guidelines.lastUpdated).toLocaleString()}
                </p>
                <a
                  href={guidelines.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="guidelines-link"
                >
                  View official guidelines →
                </a>
                
                <div className="guidelines-list">
                  {guidelines.sections?.map((section, i) => (
                    <div key={i} className="guideline-item">
                      <h3>{section.section}. {section.title}</h3>
                      <p>{section.content}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Loading guidelines...</p>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Scanning your app...</p>
          <p className="loading-hint">This usually takes 5-10 seconds</p>
        </div>
      )}

      {/* Scan Results */}
      {scanResults && !loading && (
        <div className="scan-results">
          <div className="results-header">
            <h2>Scan Results</h2>
            <div className="results-meta">
              <span>
                Scanned: {new Date(scanResults.timestamp).toLocaleString()}
              </span>
              {scanResults.fileName && (
                <span>File: {scanResults.fileName}</span>
              )}
            </div>
          </div>

          {/* Summary Stats */}
          {scanResults.results && (
            <div className="results-summary">
              <div className="stat-card critical">
                <span className="stat-number">
                  {scanResults.results.critical || 0}
                </span>
                <span className="stat-label">Critical</span>
              </div>
              <div className="stat-card warning">
                <span className="stat-number">
                  {scanResults.results.warnings || 0}
                </span>
                <span className="stat-label">Warnings</span>
              </div>
              <div className="stat-card info">
                <span className="stat-number">
                  {scanResults.results.info || 0}
                </span>
                <span className="stat-label">Info</span>
              </div>
              <div className="stat-card status">
                <span className="stat-label">Status</span>
                <span className={`status-badge ${scanResults.results.status?.toLowerCase()}`}>
                  {scanResults.results.status || 'UNKNOWN'}
                </span>
              </div>
            </div>
          )}

          {/* Findings */}
          <div className="findings-section">
            <h3>Findings</h3>
            {renderFindings()}
          </div>

          {/* Raw Output (for debugging) */}
          {scanResults.results?.rawOutput && (
            <details className="raw-output">
              <summary>View Raw Output</summary>
              <pre>{scanResults.results.rawOutput}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default IOSComplianceScanner;

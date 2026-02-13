const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

// Load API key from environment or auth-profiles.json
async function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  try {
    const authPath = path.join(process.env.HOME, '.clawdbot/agents/main/agent/auth-profiles.json');
    const authData = await fs.readFile(authPath, 'utf-8');
    const profiles = JSON.parse(authData);
    return profiles.profiles?.['anthropic:default']?.token;
  } catch (error) {
    console.error('Failed to load Anthropic API key:', error.message);
    return null;
  }
}

/**
 * AI-powered analysis of scan results using Claude
 */
async function analyzeWithAI(scanResults) {
  try {
    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      return {
        error: 'No Anthropic API key found',
        riskLevel: 'Unable to assess (no AI available)',
        recommendations: []
      };
    }

    const client = new Anthropic({ apiKey });

    const prompt = `You are an expert iOS App Store reviewer and compliance analyst. Analyze the following app compliance scan results and provide:

1. Overall risk assessment (Low/Medium/High/Critical)
2. Top 3 actionable recommendations to fix issues
3. Estimated rejection probability (0-100%)
4. Prioritization of fixes (what to fix first)

Scan Results:
${JSON.stringify(scanResults, null, 2)}

Provide your analysis in JSON format:
{
  "riskLevel": "Low|Medium|High|Critical",
  "rejectionProbability": 0-100,
  "summary": "Brief 2-3 sentence summary",
  "recommendations": [
    {
      "priority": 1-3,
      "title": "Fix title",
      "description": "Detailed fix description",
      "impact": "High|Medium|Low",
      "effort": "Hours|Days|Weeks"
    }
  ],
  "criticalBlockers": ["List of must-fix items before submission"],
  "timeline": "Estimated time to make app submission-ready"
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return {
        ...analysis,
        model: 'claude-sonnet-4',
        analyzedAt: new Date().toISOString()
      };
    }

    return {
      error: 'Failed to parse AI response',
      riskLevel: 'Unable to assess',
      recommendations: []
    };

  } catch (error) {
    console.error('AI analysis failed:', error.message);
    return {
      error: error.message,
      riskLevel: 'Unable to assess (AI error)',
      recommendations: []
    };
  }
}

/**
 * Generate AI-powered fix suggestions for individual findings
 */
async function generateFixSuggestions(findings) {
  try {
    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      return findings; // Return unchanged if no AI available
    }

    const client = new Anthropic({ apiKey });

    // Process in batches to avoid rate limits
    const enhanced = [];
    
    for (const finding of findings) {
      const prompt = `As an iOS developer expert, provide a specific, actionable fix for this App Store compliance issue:

Issue: ${finding.title}
Description: ${finding.description}
Guideline: ${finding.guideline || 'Not specified'}

Provide a single-paragraph fix suggestion (2-3 sentences) that is:
- Specific and actionable
- Technically accurate
- Easy to implement

Fix suggestion:`;

      try {
        const message = await client.messages.create({
          model: 'claude-sonnet-4',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });

        enhanced.push({
          ...finding,
          fixSuggestion: message.content[0].text.trim()
        });
      } catch (error) {
        // If AI fails, keep original finding
        enhanced.push(finding);
      }
    }

    return enhanced;

  } catch (error) {
    console.error('Fix suggestion generation failed:', error.message);
    return findings; // Return unchanged
  }
}

module.exports = {
  analyzeWithAI,
  generateFixSuggestions
};

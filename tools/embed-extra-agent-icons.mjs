import { readFileSync, writeFileSync } from 'node:fs';
import { AGENT_LOGOS } from '../src/agentlogos.js';
const icons = { 'copilot-cli': 'githubcopilot', junie: 'junie-color', goose: 'goose', antigravity: 'antigravity-color', n8n: 'n8n-color', perplexity: 'perplexity-color', 'kilo-code': 'kilocode', amp: 'amp-color', hermes: 'hermesagent' };
const logos = { ...AGENT_LOGOS };
for (const [id, icon] of Object.entries(icons)) {
  const svg = readFileSync('node_modules/@lobehub/icons-static-svg/icons/' + icon + '.svg');
  writeFileSync('assets/agents/' + id + '.svg', svg);
  logos[id] = 'data:image/svg+xml;base64,' + svg.toString('base64');
}
writeFileSync('src/agentlogos.js', '// Offline product icons. Provenance: assets/agents/README.md and sources.json.\nexport const AGENT_LOGOS = ' + JSON.stringify(logos, null, 2) + ';\n');

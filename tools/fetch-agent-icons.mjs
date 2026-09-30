// Build-time only: discover product icons from the official product pages.
import { writeFileSync, readFileSync } from 'node:fs';
import { AGENT_LOGOS } from '../src/agentlogos.js';
const pages = { pi: 'https://pi.dev/', 'command-code': 'https://commandcode.ai/',
  'gemini-cli': 'https://geminicli.com/', 'copilot-cli': 'https://github.com/features/copilot',
  kiro: 'https://kiro.dev/', junie: 'https://junie.jetbrains.com/',
  windsurf: 'https://windsurf.com/', 'devin-desktop': 'https://devin.ai/',
  opencode: 'https://opencode.ai/', cline: 'https://cline.bot/', 'roo-code': 'https://roocode.com/',
  qwenwork: 'https://qwenwork.ai/', continue: 'https://www.continue.dev/', goose: 'https://block.github.io/goose/',
  auggie: 'https://www.augmentcode.com/', qodo: 'https://www.qodo.ai/', zed: 'https://zed.dev/',
  antigravity: 'https://antigravity.google/', openclaw: 'https://openclaw.ai/', nanoclaw: 'https://nanoclaw.dev/',
  'cherry-studio': 'https://www.cherry-ai.com/', dify: 'https://dify.ai/', coze: 'https://www.coze.com/',
  n8n: 'https://n8n.io/', flowise: 'https://flowiseai.com/', manus: 'https://manus.im/',
  genspark: 'https://www.genspark.ai/', perplexity: 'https://www.perplexity.ai/',
  droid: 'https://docs.factory.ai/', iflow: 'https://docs.iflow.cn/', comate: 'https://comate.baidu.com/',
  codearts: 'https://www.huaweicloud.com/product/codeartssnap.html',
  lingma: 'https://lingma.aliyun.com/', workbuddy: 'https://www.codebuddy.cn/work/',
  'kimi-claw': 'https://www.kimi.com/bot', 'minimax-agent': 'https://agent.minimax.io/',
  'minimax-code': 'https://agent.minimax.io/tools', 'minimax-design': 'https://hub.minimaxi.com/',
};
const logos = { ...AGENT_LOGOS };
logos['claude-code'] = 'data:image/x-icon;base64,' + readFileSync('assets/agents/claude-code.ico').toString('base64');
logos.zcode = 'data:image/png;base64,' + readFileSync('assets/agents/zcode.png').toString('base64');
const sources = JSON.parse(readFileSync('assets/agents/sources.json', 'utf8'));
for (let offset = 0; offset < Object.keys(pages).length; offset += 4) {
  await Promise.all(Object.entries(pages).slice(offset, offset + 4).map(async ([id, page]) => {
    if (logos[id]) return;
    try {
      const response = await fetch(page, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('page ' + response.status);
      const html = await response.text();
      const tags = html.match(/<link\b[^>]*>/gi) || [];
      const candidates = tags.filter(tag => /rel\s*=\s*["'][^"']*(?:shortcut icon|apple-touch-icon|\bicon\b)/i.test(tag));
      let saved = false;
      for (const tag of candidates.slice(0, 6)) {
        const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!href) continue;
        const url = new URL(href.replaceAll('&amp;', '&'), response.url).href;
        const icon = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!icon.ok) continue;
        const mime = icon.headers.get('content-type')?.split(';')[0];
        if (!mime?.startsWith('image/')) continue;
        const bytes = Buffer.from(await icon.arrayBuffer());
        if (bytes.length > 400000) continue;
        // Never embed an SVG that can load remote resources or execute code.
        if (mime === 'image/svg+xml' && /<script|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|\/\/)|\bon\w+\s*=/i.test(bytes.toString())) continue;
        logos[id] = 'data:' + mime + ';base64,' + bytes.toString('base64');
        const ext = mime === 'image/svg+xml' ? 'svg' : mime.includes('png') ? 'png' : 'ico';
        writeFileSync('assets/agents/' + id + '.' + ext, bytes);
        sources.push({ id, page, icon: url });
        saved = true;
        break;
      }
      console.log(id + ': ' + (saved ? 'icon saved' : 'no verified icon; neutral placeholder'));
    } catch (error) { console.log(id + ': ' + error.message); }
  }));
}
writeFileSync('src/agentlogos.js', '// Offline product icons. Provenance: assets/agents/README.md and sources.json.\nexport const AGENT_LOGOS = ' + JSON.stringify(logos, null, 2) + ';\n');
writeFileSync('assets/agents/sources.json', JSON.stringify(sources, null, 2) + '\n');

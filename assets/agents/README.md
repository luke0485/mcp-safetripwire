# Agent product icons

2026-09-30 expansion: `sources.json` records icons discovered on official product pages. Claude Code uses the installed product's `~/.claude/claude-crab.ico`; ZCode uses `resources/icon.png` from the installed official desktop application. Product icons for GitHub Copilot, Junie, Goose, Antigravity, n8n, Perplexity, Kilo Code, Amp and Hermes are supplied by `@lobehub/icons-static-svg` 1.95.1 (https://github.com/lobehub/lobe-icons, MIT). Product marks retain their owners' trademark rights. A neutral initial badge is used where a verified product icon has not been obtained; it is not presented as an official logo.

- `codex.png` and `codex.svg`: Codex-specific `codex-app-ga-logo` and `codex_new` assets from the installed official OpenAI Codex Windows app, version 26.928.1915.0. These are not the ChatGPT knot logo.
- `cursor.svg`: `CUBE_2D_LIGHT.svg` from the official kit at https://cursor.com/brand.
- `claude.ico`: https://claude.ai/favicon.ico, representing the supported Claude Desktop host.

Icons identify the connected products. Their trademarks and artwork remain owned by their respective vendors; the project's MIT license does not relicense them or imply endorsement.

`src/agentlogos.js` embeds these files as data URLs so the page works offline and in a single-file SEA build.

Additional preloaded Agent product icons (installation is not required for displaying a known Agent identity):

- TRAE: official China product site's favicon, https://lf-cdn.trae.com.cn/obj/trae-com-cn/trae_website_prod_cn/favicon.png
- Qoder: official product favicon, https://qoder.com/favIcon.svg
- CodeBuddy: official product logo, https://download.codebuddy.cn/web/website/a156fee78f35e874d407848198e5f96a4cf383ef/assets/logo.svg
- Qwen Code: official Agent documentation favicon, https://qwenlm.github.io/qwen-code-docs/favicon.png
- Kimi Code: favicon referenced by the official Kimi Code product page, https://www.kimi.com/favicon-light.ico

The icon registry does not imply that an Agent is installed or that every version's configuration can be automatically enrolled. The topology shows only discovered configurations/channels. Unknown identities retain their name instead of borrowing another vendor's icon.

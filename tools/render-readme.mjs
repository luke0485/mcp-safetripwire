import { createRequire } from 'node:module';
import { renderPage } from '../src/page.js';
const require = createRequire('C:/Users/ProArt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium} = require('playwright');
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu']});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN',colorScheme:'light'});
 const advanced={baseline:{},baselineMode:'off',blockedTools:[],blockedDestinations:[],checkNewFields:false};
 const status={protection:'observe',platform:'Windows · DEMO',dataDir:'DEMO · 模拟数据',pinned:[],hosts:[],tools:{total:2,unprotected:0,alerts24h:3,topology:[{host:'codex',name:'demo-files',protected:true},{host:'codex',name:'demo-notes',protected:true}],pending:[],peers:[],activity:Array.from({length:288},(_,i)=>({at:new Date(Date.UTC(2026,9,4,0,i*5)).toISOString(),info:i%40<28?Math.round(3+2*Math.sin(i*.35)):0,warn:i===210?3:0,critical:0}))}};
 await page.route('**/*',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({contentType:path==='/'?'text/html':'application/json',body:path==='/'?renderPage({startedAt:'DEMO · 模拟数据'}):JSON.stringify(path==='/api/status'?status:advanced)});});
 await page.goto('http://127.0.0.1:19999/');
 await page.waitForSelector('.advanced-card');
 await page.evaluate(()=>document.getElementById('startup')?.remove());
 if (!(await page.locator('h1').innerText()).includes('MCP SafeTripwire')) throw Error('Wrong brand');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.addStyleTag({content:'*{animation:none!important;transition:none!important} main{opacity:1!important;transform:none!important}'});
 await page.screenshot({path:'assets/readme/dashboard.png',animations:'disabled'});
 await page.locator('.advanced-card').scrollIntoViewIfNeeded();
 await page.locator('.advanced-details').evaluate(el=>el.open=true);
 await page.screenshot({path:'assets/readme/protection.png',animations:'disabled'});
 console.log('Updated both README screenshots from current page source.');
} finally {await browser.close();}

// The console page. Kept in its own module so the server stays about HTTP and
// this file stays about what a person sees.
//
// Two things matter here:
//   - every user-visible string comes from the I18N table below (zh + en), so
//     the product is not Chinese-only;
//   - the token never appears in this page's JavaScript. The server hands out
//     an HttpOnly cookie on the first load, and same-origin requests carry it
//     automatically, so there is nothing here for a hostile page to steal.

import { AGENT_LOGOS } from './agentlogos.js';
import { AUDIT_TEXT, auditText } from './audittext.js';
import { BRAND_LOGO } from './brand.js';
import { AGENT_CATALOG } from './hosts.js';

const STYLES = `
 :root{color-scheme:light dark;--accent:#111827;--accent-fg:#ffffff}
 *{box-sizing:border-box}
 body{margin:0;font:500 14.5px/1.65 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;background:#e8ebef;color:#0f1720}
 @media (prefers-color-scheme:dark){:root{--accent:#e6ebf2;--accent-fg:#12161c}body{background:#0d1117;color:#e6ebf2}header,nav{background:#161c24;border-color:#2a3340}.card{background:#1a2029!important;border-color:#2a3340!important}
  th{color:#8b97a7!important}td,th{border-color:#242e3a!important}}
 header{padding:18px 24px 10px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;background:#fff;border-bottom:1.5px solid #cdd5de}
 h1{font-size:19px;margin:0 0 4px}
 .lede{color:#63707f;margin:0}
 .langbtn{border:1.5px solid #a7b1bd;background:transparent;color:inherit;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;white-space:nowrap;flex:0 0 auto;min-width:66px;line-height:1.4}
 nav{display:flex;gap:4px;padding:0 24px;background:#fff;border-bottom:1.5px solid #cdd5de}
 nav button{background:none;border:0;border-bottom:2px solid transparent;color:#63707f;padding:10px 14px;cursor:pointer;font:inherit}
 nav button.on{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
 main{padding:20px 28px;max-width:1280px;width:100%;min-width:0;margin:0 auto}
 .card{background:#fff;border:1.5px solid #cdd5de;border-radius:10px;padding:16px 18px;margin-bottom:14px}
 .switch{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 .switch button{border:1px solid #cfd6df;background:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;font:inherit}
 .switch button.on{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);font-weight:600}
 table{border-collapse:collapse;width:100%}
 th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e3e8ee;vertical-align:middle}
 td{font-weight:500;font-size:13px}
 td.right,th.right{text-align:right;white-space:nowrap}
 th{color:#4b5563;font-weight:700;font-size:12.5px;letter-spacing:.2px}
 .tag{display:inline-block;padding:3px 11px;border-radius:999px;font-size:12.5px;line-height:1.45;border:1.5px solid #a7b1bd;color:#3d4653;font-weight:600;vertical-align:middle;white-space:nowrap}
 .btn-sm{border:1.5px solid #a7b1bd;background:#fff;border-radius:999px;padding:3px 14px;font:inherit;font-size:12px;line-height:1.5;cursor:pointer;vertical-align:middle;white-space:nowrap}
 .btn-sm:hover{border-color:var(--accent);color:var(--accent)}
 td .tag,td .btn-sm{white-space:nowrap}
 .tag.severe{color:#c02626;border-color:#e6b3b3;background:#fdf0f0}
 .tag.notice{color:#9a6a00;border-color:#e8d5a0;background:#fdf8ec}
 .tag.calm{color:var(--accent);border-color:#d3d8df;background:#f3f5f8}
 .muted{color:#5b6675}
 .lede{color:#5b6675;font-weight:500}
 .stats{display:flex;gap:12px;flex-wrap:wrap}
 .stat{flex:1 1 130px;border:1px solid #e2e6ec;border-radius:10px;padding:10px 14px}
 .stat b{display:block;font-size:22px;line-height:1.25;font-weight:600}
 .stat span{font-size:12px;color:#7a8798}
 .stat b.num-warn{color:#9a6a00}
 .stat b.num-bad{color:#c02626}
 .loading{display:flex;align-items:center;gap:10px;padding:22px;color:#7a8798}
 .stamp{font-size:11px;color:#9aa6b6;margin:2px 0 0}
 .down{border-color:#e6b3b3;background:#fdf0f0}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}
 .big{color:#0f1720}
 .row input{border:1.5px solid #a7b1bd;border-radius:6px;padding:6px 10px;font:inherit;font-weight:500;min-width:190px;background:#fff}
 .row input:focus{outline:none;border-color:var(--accent)}
 .trend{display:flex;align-items:flex-end;gap:5px;height:60px;border-bottom:1.5px solid #cdd5de;padding-bottom:2px;overflow-x:auto}
 .trend i{flex:0 0 auto;width:10px;background:#c3cbd5;border-radius:2px 2px 0 0}
 .trend i.has-warn{background:#d5a94e}
 .trend i.has-crit{background:#c0564f}
 .tag.notice{color:#8a5a00;border-color:#e0c184;background:#fdf7ea}
 .hot{color:#c02626}
 .warm{color:#9a6a00}
 .chart-content{width:100%;min-width:0}
 button,select,input,summary{transition:background-color .16s ease,border-color .16s ease,color .16s ease,transform .12s ease}
 button:active{transform:scale(.97)}
 button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #8b8b8b;outline-offset:3px}
 .agent-picker[open]{animation:panel-in .18s ease-out}
 .agent-picker[open]::backdrop{animation:veil-in .18s ease-out}
 .picker-close{width:44px;height:44px;padding:0;display:grid;place-items:center;font-size:28px;line-height:1;border-radius:10px}
 #main>.card{animation:panel-in .18s ease-out}
 summary{cursor:pointer}summary:hover{color:#444444}
 @keyframes panel-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
 @keyframes veil-in{from{opacity:0}to{opacity:1}}
 @media(prefers-reduced-motion:reduce){button,select,input,summary{transition:none}.agent-picker[open],.agent-picker[open]::backdrop,#main>.card{animation:none}button:active{transform:none}}
 .agent-heading{display:flex;align-items:center;gap:10px;line-height:1.5;margin-bottom:8px}
 .chart-plot{position:relative;height:180px;margin:10px 0 0 28px}
 .wave{width:100%;height:100%;display:block;overflow:visible}
 .chart-y{position:absolute;right:calc(100% + 10px);font-size:12px;line-height:1.4;color:#5b6675;transform:translateY(-50%);white-space:nowrap}
 .chart-x{display:flex;justify-content:space-between;gap:12px;margin:8px 0 0 28px;font-size:12px;line-height:1.5;color:#5b6675;font-weight:600}
 .wave-area{fill:rgba(17,24,39,.10)}
 .wave-line{fill:none;stroke-width:1.5;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
 .chart-plot{height:180px}
 .chart-cursor{position:absolute;top:0;bottom:0;width:1px;background:#a6adb8;pointer-events:none;display:none}
 .chart-dot{position:absolute;width:7px;height:7px;border-radius:50%;border:1px solid #fff;transform:translate(-50%,-50%);pointer-events:none;display:none}
 .chart-tooltip{position:absolute;z-index:2;max-width:240px;padding:10px 12px;border:1px solid #dfe4ea;border-radius:6px;background:#fff;color:#334155;box-shadow:0 4px 16px #0002;pointer-events:none;font-size:12px;line-height:1.8;display:none}
 .chart-tooltip span{display:block;white-space:nowrap}
 .chart-key{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle}
 .agent-label{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:0;vertical-align:middle;line-height:1.5}
 .agent-logo{width:22px;height:22px;object-fit:contain;flex:0 0 auto;border-radius:4px}
 .agent-fallback{display:inline-flex;align-items:center;justify-content:center;background:#edf0f3;color:#53606c;font-size:12px}
 .axis-line{stroke:#9aa6b6;stroke-width:1.2;vector-effect:non-scaling-stroke}
 .axis-grid{stroke:#dfe4ea;stroke-width:1;vector-effect:non-scaling-stroke}
 .axis-label{font-size:11px;fill:#5b6675;font-weight:600}
 .legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:12.5px}
 .legend b{font-size:14px}
 .channels{display:grid;gap:12px;margin-top:14px}
 .add-orb{position:relative;width:48px;height:48px;border:1px solid #bfc7d1;border-radius:50%;background:transparent;box-shadow:none;cursor:pointer}
 .add-orb:before,.add-orb:after{content:'';position:absolute;left:50%;top:50%;width:18px;height:2px;border-radius:2px;background:#68717d;transform:translate(-50%,-50%)}
 .add-orb:after{transform:translate(-50%,-50%) rotate(90deg)}
 .add-orb:hover{border-color:#68717d}
 .agent-picker{width:min(520px,calc(100% - 32px));max-height:85vh;overflow:auto;border:1px solid #cbd2dc;border-radius:12px;padding:22px;background:#fff;color:#0f1720}
 .agent-picker::backdrop{background:#0004}
 .picker-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
 .picker-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
 .picker-fields label{display:grid;gap:5px}
 .picker-fields select{width:100%;min-width:0;font:inherit;padding:7px;border:1px solid #bcc5d1;border-radius:6px;background:transparent;color:inherit}
 .detect-path{overflow-wrap:anywhere;font-size:12px;margin:8px 0;color:#63707f}
 @media(prefers-color-scheme:dark){.agent-picker{background:#18212c;color:#e6ebf2}}
 .add-orb:focus-visible{outline:2px solid #68717d;outline-offset:4px}
 .startup{position:fixed;inset:0;z-index:100;background:#fff;display:grid;place-items:center;pointer-events:none;overflow:hidden;animation:tw-startup .7s ease-out forwards}
 .startup img{position:relative;z-index:1;width:90px;height:90px;object-fit:contain;animation:tw-tap .7s ease-out both}
 .startup:before,.startup:after{content:'';position:absolute;left:50%;top:50%;width:80vmax;height:80vmax;border-radius:50%;background:radial-gradient(circle,transparent 38%,#d9efff70 48%,#b9dfff55 54%,transparent 65%);animation:tw-ripple .7s ease-out both}
 .startup:after{animation-delay:.08s}
 @keyframes tw-startup{0%,65%{opacity:1}100%{opacity:0;visibility:hidden}}
 @keyframes tw-tap{0%{transform:scale(1)}18%{transform:scale(.88)}40%,100%{transform:scale(1)}}
 @keyframes tw-ripple{0%,15%{transform:translate(-50%,-50%) scale(.04);opacity:0}30%{opacity:1}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}
 @media(prefers-reduced-motion:reduce){.startup{display:none}}
 .channel-group{border:1px solid #dfe4ea;border-radius:9px;padding:12px;min-width:0}
 .channel-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;font-weight:600}
 .channel-group.empty{border-style:dashed;color:#63707f;display:flex;align-items:center;justify-content:center;min-height:76px;text-align:center}
 .flow{display:grid;grid-template-columns:minmax(72px,1fr) minmax(24px,.45fr) minmax(80px,1fr) minmax(24px,.45fr) minmax(90px,1.4fr) auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f4;min-width:0}
 .flow:last-child{border-bottom:0}
 .flow .node{display:flex;align-items:center;justify-content:center;min-height:40px;line-height:1.5;border:1.5px solid #b8c1cc;border-radius:8px;padding:7px 11px;font-size:12.5px;font-weight:600;background:#fff;text-align:center;min-width:0;overflow-wrap:anywhere}
 .flow .node.mid{font-weight:600}
 .flow .node.mid.on{border-color:#111827;background:#eef1f5;color:#111827}
 .flow .node.mid.off{color:#c02626;border-color:#e6b3b3;background:#fdf0f0}
 .flow .arrow{height:22px;position:relative;overflow:hidden;color:#64748b}
 .flow .arrow i{position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 7px currentColor;animation:tw-flow 2.4s linear infinite}
 .flow .arrow i:nth-child(2){animation-delay:-.8s}
 .flow .arrow i:nth-child(3){animation-delay:-1.6s}
 .flow .arrow{color:#8b929c}
 .flow-flags{display:flex;gap:6px;flex-wrap:wrap}
 @keyframes tw-flow{0%{left:0;opacity:0}12%{opacity:1}88%{opacity:1}100%{left:calc(100% - 6px);opacity:0}}
 .audit-table{table-layout:fixed}
 .audit-table th,.audit-table td{vertical-align:top;overflow-wrap:anywhere;white-space:normal}
 .audit-table .audit-time{width:82px}
 .audit-table .audit-level{width:82px}
 .audit-table .audit-event{width:26%}
 .audit-table td code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;line-height:1.65}
 .audit-card{min-width:0;overflow:hidden}
 @media(max-width:760px){main{padding:16px}header{padding:16px}nav{padding:0 10px;overflow-x:auto}nav button{white-space:nowrap;padding:10px}.flow{grid-template-columns:minmax(64px,1fr) minmax(20px,.3fr) minmax(72px,1fr) minmax(20px,.3fr) minmax(80px,1.2fr);gap:6px}.flow-flags{grid-column:1/-1}.flow .node{padding:6px;font-size:12px}}
 @media(max-width:560px){main{padding:12px}.card{padding:14px 12px}.chart-plot{height:160px;margin-left:36px}.chart-x{margin-left:36px;font-size:11px}.audit-table,.audit-table tbody{display:block}.audit-table thead{display:none}.audit-table tr{display:grid;grid-template-columns:82px 1fr;padding:10px 0;border-bottom:1px solid #e3e8ee}.audit-table td{border:0;padding:4px 6px}.audit-table td:nth-child(n+3){grid-column:1/-1}.audit-table td:nth-child(3){font-weight:600}.row input{min-width:0;width:100%}}
 @media(max-width:420px){.flow{grid-template-columns:minmax(48px,1fr) 16px minmax(58px,1fr) 16px minmax(58px,1.2fr)}.flow .node{padding:6px 4px}}
 @media(prefers-reduced-motion:reduce){.flow .arrow i{animation:none;left:50%;opacity:.6}}
 @media(prefers-color-scheme:dark){.big{color:#e6ebf2}.channel-group{border-color:#354151}.flow{border-color:#354151}.flow .node{background:#202a36;color:#e6ebf2}.flow .node.mid.on{background:#16332e;color:#92dfce;border-color:#478b7d}.chart-x,.chart-y{color:#a9b6c6}.wave-line{stroke:#d9e3ef}.wave-area{fill:rgba(217,227,239,.10)}}
 .spinner{width:20px;height:20px;border:3px solid #e2e6ec;border-top-color:var(--accent);border-radius:50%;animation:tw-spin .8s linear infinite;display:inline-block}
 .spinner.sm{width:13px;height:13px;border-width:2px}
 @keyframes tw-spin{to{transform:rotate(360deg)}}
 .busy{display:inline-flex;align-items:center;gap:6px}
 code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;word-break:break-all}
 .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
 .btns button{border:1.5px solid #a7b1bd;background:#fff;border-radius:8px;padding:7px 13px;cursor:pointer;font:inherit;white-space:nowrap}
 .btns button:hover{border-color:var(--accent);color:var(--accent)}
 .big{font-size:15px;font-weight:600}
 /* Shared desktop component sizing; keep visible medium-weight borders. */
 body{font-size:14px;line-height:1.6;font-weight:400;background:#edf0f4}
 h1{font-size:20px;font-weight:600}
 .big,.picker-top strong{font-size:16px;font-weight:600}
 main{padding:24px}
 .card{padding:20px;margin-bottom:16px;border-width:1.5px;border-color:#c6cfda}
 .stats{gap:16px}.stat{padding:12px 16px;border-width:1.5px}
 .stat span,.muted,.chart-x,.chart-y{font-weight:400}
 .btn-sm,.btns button,.switch button,.langbtn{min-height:36px;padding:6px 14px;font-size:14px;line-height:1.4;border-width:1.5px;border-radius:8px}
 .picker-close{width:44px;height:44px;min-height:44px;padding:0;font-size:28px}
 .picker-fields select,.row input{min-height:36px;padding:6px 10px;font-size:14px;border-width:1.5px;border-radius:8px}
 nav button{min-height:40px}.btns,.row{gap:8px;margin-top:16px}
 .channel-group{padding:16px;border-width:1.5px}.channel-heading{margin-bottom:8px}
 td{font-size:14px}th,.tag,.detect-path,.mode-summary{font-size:12px}
 .mode-summary{margin-top:12px;line-height:1.5}
 .axis-grid{stroke:#e0e6ed}.axis-grid-vertical{stroke:#e9edf2}
 @media(prefers-color-scheme:dark){body{background:#0d1117}.btn-sm,.btns button,.switch button,.langbtn,.row input{background:#1a2029;color:#e6ebf2}.switch button.on{background:var(--accent);color:var(--accent-fg)}.axis-grid{stroke:#34404d}.axis-grid-vertical{stroke:#263340}}
 @media(max-width:760px){main{padding:16px}.card{padding:16px}}
 @media(max-width:560px){main{padding:12px}.card{padding:14px 12px}.picker-fields{grid-template-columns:1fr}}

 /* Pixel-inspired tonal surfaces and rounded controls. */
 :root{--accent:#252525;--accent-fg:#fff;--surface:#fff;--tonal:#e9e9e9;--outline:#b7b7b7;--text:#252525;--hint:#626262}
 body{background:#f1f1f1;color:var(--text)}header,nav{background:#fafafa;border-color:#d6d6d6}
 main{padding:24px;max-width:1280px}.card{border-radius:24px;border-color:#c9c9c9;padding:24px;margin-bottom:18px}
 .stat,.channel-group{border-radius:18px}.flow .node{border-radius:14px}
 button,.btn-sm,.btns button,.switch button,.langbtn{font-family:inherit;font-size:14px;font-weight:500;line-height:1.4;min-height:40px;padding:9px 20px;border:1.5px solid var(--outline);border-radius:999px;background:var(--surface);color:var(--text);cursor:pointer;letter-spacing:.1px;box-shadow:none}
 .btns,.switch{gap:12px}.btns button:hover,.btn-sm:hover,.langbtn:hover{background:var(--tonal);color:var(--accent);border-color:#999999}
 button:active{transform:scale(.97);background:var(--tonal)}button:disabled{opacity:.5;cursor:default;transform:none}
 .switch button.on,.btns button.primary{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
 .btns button.tonal{background:var(--tonal);border-color:var(--tonal);color:var(--accent)}
 nav{padding:8px 24px;gap:8px}nav button{border:0;border-radius:999px;min-height:40px;padding:9px 18px;background:transparent;color:var(--hint)}nav button.on{background:var(--tonal);border:0;color:var(--accent)}
 .agent-picker{border:1.5px solid #bdbdbd;border-radius:28px;padding:24px;background:var(--surface)}
 .picker-close{width:32px;height:32px;min-height:32px;min-width:32px;padding:0;border:0;border-radius:50%;font-size:20px;background:var(--tonal);color:var(--hint)}.picker-close:hover{background:#dedede}
 .picker-close svg{width:16px;height:16px;display:block}
 select,input:not([type=checkbox]),textarea,.picker-fields select,.row input{font:inherit;color:inherit;border:1.5px solid var(--outline);border-radius:16px;background:var(--surface);min-height:44px;padding:11px 14px;max-width:100%}
 textarea{display:block;width:100%;resize:none;line-height:1.65;height:112px;min-height:112px;max-height:112px;overflow-y:auto;scrollbar-gutter:stable}textarea:focus-visible{outline:2px solid #8b8b8b;outline-offset:3px}
 #main>.advanced-card{animation:none}
 .advanced-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.advanced-head p{margin:6px 0 0;max-width:680px}
 .baseline-status{padding:12px 16px;background:#f3f3f3;border-radius:16px;margin:18px 0;color:var(--hint);line-height:1.6}
 .advanced-details{margin-top:18px;border-top:1.5px solid #d8d8d8;padding-top:16px}.advanced-details summary{font-weight:500;padding:6px 0;color:var(--accent)}
 .advanced-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px}.advanced-field{display:grid;grid-template-rows:24px 112px auto;gap:8px;align-content:start;min-width:0}.advanced-field small{color:var(--hint);line-height:1.5}
 .advanced-options{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:20px}.advanced-options label{display:flex;align-items:center;gap:10px;line-height:1.6}.advanced-options input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent);flex:0 0 auto}
 .advanced-feedback{color:var(--accent);min-height:24px;margin-top:12px;line-height:1.6}.advanced-feedback.error{color:#a63232}
 .add-orb{padding:0;border-radius:50%;background:transparent;box-shadow:none}
 @media(prefers-color-scheme:dark){:root{--accent:#ededed;--accent-fg:#202020;--surface:#222222;--tonal:#353535;--outline:#737373;--text:#ededed;--hint:#b6b6b6}body{background:#161616}header,nav{background:#1c1c1c}.card{background:var(--surface)!important;border-color:#555555!important}.baseline-status{background:#2b2b2b}.advanced-details{border-color:#4f4f4f}.picker-close:hover{background:#414141}.btn-sm,.btns button,.switch button,.langbtn,.row input{color:var(--text);background:var(--surface)}.switch button.on{background:var(--accent);color:var(--accent-fg)}}
 @media(max-width:760px){main{padding:16px}.card{padding:20px}nav{padding:8px 12px}.advanced-fields{grid-template-columns:1fr}}
 @media(max-width:560px){main{padding:12px}.card{padding:18px 16px}.agent-picker{padding:20px}.advanced-head{flex-direction:column;gap:8px}.btns button{white-space:normal}.advanced-options{align-items:stretch;flex-direction:column}.advanced-options label{flex-wrap:wrap}nav button{padding:9px 14px}}
`;

const I18N = {
  zh: {
    lede: '',
    sumAgents: ' 个 Agent',
    sumChannels: ' 个通道',
    sumProtected: ' 个受保护',
    modeObserve: '观察模式',
    on: '启用', off: '未启用',
    sumTakeover: '接管', sumLock: '完整性锁定', sumStatic: '静态检测',
    sumDeception: '诱捕', sumPosture: '策略',
    chartTitle: '近 24 小时活动',
    axisFrom: '24h', axisMid: '12h', axisNow: '现在',
    chartTotal: '事件总数', chartCrit: '其中严重', chartWarn: '其中告警',
    chartHint: '纵轴为事件数量，横轴为最近 24 小时；曲线越高峰值越高。',
    covTitle: '检测能力（实时计数）',
    covStatic: '静态元数据发现', covArgs: '调用参数载荷命中', covDecoy: '诱饵触发',
    covCanary: '金丝雀外泄', covPeer: '陌生对端', covNewTool: '新通道发现',
    covChanged: '通道指纹变更', covBlocked: '执行拦截（次）',
    mechTitle: '技术实现', mechTakeover: '通道接管', mechStatic: '元数据静态检测',
    mechLock: '完整性锁定（条）', mechDeception: '诱捕', mechPosture: '当前策略',
    mechState: '状态目录', mechListen: '本地监听',
    colService: '服务', colUpstream: '上游地址', relayAddr: '本地中转前缀：',
    addRemote: '添加远程服务', phName: '名称（字母/数字）', add: '添加',
    addRemoteHint: '仅用于支持 HTTP MCP 的 Agent。添加后保存的是 Tripwire 中转配置；请把生成的中转地址填入 Agent 的 MCP 设置，并保持 Tripwire 运行。仅添加服务不会自动保护 Agent；本机命令型 MCP 请使用通道接入。云端 Agent 通常无法访问本机地址。',
    addRemoteEmpty: '名称和地址都不能为空。', addRemoteOk: '已添加，本地中转地址：',
    modeProtect: '阻断模式',
    trendTitle: '近 24 小时活动',
    trendHint: '每小时一柱，越高事件越多；黄色含告警，红色含严重事件。空柱表示该小时无记录。',
    topoTitle: '防护位置（每个通道一条链路）',
    topoHint: '按 Agent 分组，每个通道单独展示。绿色表示已接入，黄色表示待接入；粒子展示连接方向。',
    topoSlot: '预留 Agent / 通道位置 · 新发现的通道将自动展示',
    topoEmpty: '目前没有任何通道经过 Tripwire —— 也就是说还没有东西被保护。',
    tabStatus: '保护状态', tabTools: '通道清单', tabActivity: '审计日志', tabRemote: '远程服务',
    protection: '保护模式',
    protectionHint: '先纳入 MCP 通道，重启对应 Agent 使新配置生效，再核对并批准工具清单。观察模式只检查和记录；切到阻断模式后，未批准的工具清单、被改动的工具和命中拦截规则的请求会被拒绝。只有经过 Tripwire 的 MCP 调用受这些规则保护。',
    observe: '观察模式', protect: '阻断模式',
    system: '系统', pinned: '完整性锁定', noPinned: '尚未锁定 —— 锁定后工具面变更即触发告警',
    dataLocation: '数据目录',
    statsChannels: '通道总数', statsProtected: '已接入', statsUnprotected: '未接入', statsAlerts: '24h 告警',
    peers: '通道对端进程', noPeers: '尚未记录到任何连接', unnamed: '未知程序',
    colImage: '程序', colPid: 'PID', colAllowed: '判定', colLastSeen: '最后出现', allowed: '已放行', denied: '已拒绝',
    pendingTitle: '待审核通道', pendingHint: '这些通道已被观测到工具面，但尚未批准。主动保护模式下，未批准的通道调用会被拒绝。',
    colTools: '工具数', colSeen: '首次观测', approve: '批准', approveDone: '已批准',
    confirmApprove: '批准通道 "{0}"？\n\n批准后，该通道当前观测到的工具面即被信任；之后若有改动会重新告警。', openProgram: '打开程序文件夹', openRecords: '打开记录文件夹',
    toolsState: '受保护工具', protectedSuffix: '个已接入',
    protectAll: '全部纳管', protectAllDone: '已纳管 ', revertAll: '全部取消纳管', revertAllDone: '已取消纳管：',
    confirmRevertAll: '要取消全部纳管并还原宿主配置吗？（从最近备份恢复）',
    confirmProtectAll: '要保护所有已发现的工具吗？ 程序会先自动备份配置文件，随时可恢复。',
    noHosts: '没有找到已配置的 Agent。',
    colTool: '工具', colConn: '通道类型', colState: '状态', localProgram: '本机进程', remoteService: '远程服务',
    protected: '已纳管', unprotected: '未纳管', enableProtection: '纳入防护',
    noTools: '这里还没有可保护的工具。', restoreMine: '恢复到改动之前',
    noActivity: '还没有记录。', backendDown: '后台已断开（程序可能已退出）。', retry: '重新连接', openFolderFailed: '打不开该文件夹：',
    stampLabel: '本次启动 ', colTime: '时间', colLevel: '级别', colWhat: '发生了什么', colDetail: '详情',
    severe: '严重', notice: '注意', info: '信息',
    noRemote: '未配置远程服务。',
    remoteNote: '',
    proxyAddr: '中转地址：', loading: '正在加载…', loadFailed: '加载失败：',
    confirmWrap: '要给 "{0}" 开启保护吗？\n\n程序会先自动备份你的设置，随时可以恢复。',
    wrappedOk: '已开启保护。重启该 AI 工具后生效。', wrapFail: '没能完成：', unknown: '未知原因',
    confirmRestore: '要恢复到最近一次的设置备份吗？\n\n备份之后的改动会丢失。',
    restoredOk: '已恢复。',
    events: {
      'tripwire-start': '开始保护一个本地工具', 'bridge-listening': '开始监视一个本机通道',
      activity: '记录到一次代码执行', 'tools-list': '读取了工具清单', 'tools-call': '调用了一个工具',
      'static-finding': '发现可疑的工具描述', 'tool-risk': '识别出高风险能力',
      'manifest-unpinned': '这个工具还没有被锁定', 'RUG-PULL-SUSPECTED': '工具被偷偷改动了',
      'enforced-block': '已阻止一次可疑行为', 'enforced-strip': '已隐藏一个可疑工具',
      'sensitive-request': '读取了敏感内容', 'server-notification': '工具发来通知', 'server-exit': '工具已退出',
      'bridge-parse-error': '本机通道上有一段内容无法识别', 'console-wrap': '已为工具开启保护',
      'console-restore': '已恢复到之前的配置', 'http-proxy-listening': '开始为远程服务器做中转',
      'upstream-error': '远程服务器连接出错', unreadable: '有一段记录读不出来',
      'protection-changed': '保护模式已更改',
    },
  },
  en: {
    lede: '',
    sumAgents: ' agent(s)',
    sumChannels: ' channel(s)',
    sumProtected: ' protected',
    modeObserve: 'observe',
    on: 'on', off: 'off',
    sumTakeover: 'takeover', sumLock: 'locked', sumStatic: 'static scan',
    sumDeception: 'deception', sumPosture: 'policy',
    chartTitle: 'Activity, last 24 hours',
    axisFrom: '24h', axisMid: '12h', axisNow: 'now',
    chartTotal: 'events', chartCrit: 'severe', chartWarn: 'warnings',
    chartHint: 'Vertical axis is the number of events, horizontal is the last 24 hours.',
    covTitle: 'Detection coverage (live counts)',
    covStatic: 'Static metadata findings', covArgs: 'Call-argument payload hits', covDecoy: 'Decoy triggers',
    covCanary: 'Canary exfiltration', covPeer: 'Unexpected peers', covNewTool: 'New channels found',
    covChanged: 'Channel fingerprint changes', covBlocked: 'Enforcement actions',
    mechTitle: 'Technical implementation', mechTakeover: 'Channel takeover', mechStatic: 'Metadata static scan',
    mechLock: 'Integrity locks', mechDeception: 'Deception', mechPosture: 'Current policy',
    mechState: 'State directory', mechListen: 'Local listener',
    colService: 'Service', colUpstream: 'Upstream', relayAddr: 'Local relay prefix: ',
    addRemote: 'Add a remote service', phName: 'name (letters/digits)', add: 'Add',
    addRemoteHint: 'For Agents supporting HTTP MCP. Adding saves a Tripwire relay route. Paste the relay URL into the Agent MCP settings and keep Tripwire running. Adding alone does not protect the Agent. Use channel enrollment for local command-based MCP. Cloud Agents usually cannot reach a local URL.',
    addRemoteEmpty: 'Both fields are required.', addRemoteOk: 'Added. Local relay address: ',
    modeProtect: 'block',
    trendTitle: 'Last 24 hours',
    trendHint: 'One bar per hour; taller means more events. Yellow includes warnings, red includes severe ones. Empty means no records that hour.',
    topoTitle: 'Where it acts (one chain per channel)',
    topoHint: 'Grouped by Agent, with one row per channel. Green means connected; amber means pending. Particles show connection direction.',
    topoSlot: 'Space for another Agent / channel · discovered channels appear automatically',
    topoEmpty: 'No channel passes through Tripwire yet -- nothing is protected.',
    tabStatus: 'Protection', tabTools: 'Channels', tabActivity: 'Audit log', tabRemote: 'Remote services',
    protection: 'Protection mode',
    protectionHint: 'Enroll the MCP channel, restart its Agent to load the new configuration, then review and approve the tool list. Observe checks and records calls. Block rejects unapproved lists, changed tools and requests matching blocking rules. These rules cover MCP calls routed through SafeTripwire.',
    observe: 'Observe', protect: 'Block',
    system: 'System', pinned: 'Locked tools', noPinned: 'None yet. Lock a tool once and any later change will be surfaced.',
    dataLocation: 'Data location',
    statsChannels: 'Channels', statsProtected: 'Enrolled', statsUnprotected: 'Not enrolled', statsAlerts: 'Alerts (24h)',
    peers: 'Channel peers', noPeers: 'No connections recorded yet', unnamed: 'unknown process',
    colImage: 'Process', colPid: 'PID', colAllowed: 'Verdict', colLastSeen: 'Last seen', allowed: 'Allowed', denied: 'Denied',
    pendingTitle: 'Channels awaiting review', pendingHint: 'These channels have had their tool surface observed but not approved. In Active protection their calls are denied.',
    colTools: 'Tools', colSeen: 'First seen', approve: 'Approve', approveDone: 'Approved',
    confirmApprove: 'Approve channel "{0}"?\n\nThe surface observed now becomes trusted; any later change raises a new alert.', openProgram: 'Open program folder', openRecords: 'Open records folder',
    toolsState: 'Protected tools', protectedSuffix: 'protected',
    protectAll: 'Enroll all', protectAllDone: 'Enrolled ', revertAll: 'Un-enroll all', revertAllDone: 'Un-enrolled: ',
    confirmProtectAll: 'Protect every discovered tool? Config files are backed up first.',
    noHosts: 'No configured agents were found.',
    colTool: 'Tool', colConn: 'Connection', colState: 'Status', localProgram: 'Local program', remoteService: 'Remote service',
    protected: 'Managed', unprotected: 'Unmanaged', enableProtection: 'Enroll',
    noTools: 'No protectable tools here yet.', restoreMine: 'Restore previous configuration',
    noActivity: 'No activity recorded yet.', backendDown: 'The background process is gone (the app may have exited).', retry: 'Reconnect', openFolderFailed: 'Could not open that folder: ',
    stampLabel: 'started ', colTime: 'Time', colLevel: 'Level', colWhat: 'What happened', colDetail: 'Detail',
    severe: 'Severe', notice: 'Notice', info: 'Info',
    noRemote: 'No remote services configured.',
    remoteNote: '',
    proxyAddr: 'Local relay: ', loading: 'Loading…', loadFailed: 'Could not load: ',
    confirmWrap: 'Protect "{0}"?\n\nYour settings are backed up automatically and can be restored at any time.',
    wrappedOk: 'Protection enabled. Restart that AI tool to take effect.', wrapFail: 'Could not complete: ', unknown: 'unknown reason',
    confirmRestore: 'Restore the most recent settings backup?\n\nChanges made after that backup will be lost.',
    restoredOk: 'Restored.',
    events: {
      'tripwire-start': 'Started protecting a local tool', 'bridge-listening': 'Started watching a local channel',
      activity: 'Recorded a code execution', 'tools-list': 'Read the tool list', 'tools-call': 'Called a tool',
      'static-finding': 'Found a suspicious tool description', 'tool-risk': 'Identified a high-risk capability',
      'manifest-unpinned': 'This tool is not locked yet', 'RUG-PULL-SUSPECTED': 'A tool was silently changed',
      'enforced-block': 'Blocked a suspicious action', 'enforced-strip': 'Hid a suspicious tool',
      'sensitive-request': 'Read sensitive content', 'server-notification': 'The tool sent a notification',
      'server-exit': 'The tool exited', 'bridge-parse-error': 'Unreadable data on a local channel',
      'console-wrap': 'Protection enabled for a tool', 'console-restore': 'Restored an earlier configuration',
      'http-proxy-listening': 'Started relaying for a remote server', 'upstream-error': 'Remote server connection failed',
      unreadable: 'One record could not be read', 'protection-changed': 'Protection mode changed',
    },
  },
};

function escapeForHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderPage({ startedAt = '' } = {}) {
  const stamp = escapeForHtml(startedAt);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MCP SafeTripwire</title><link rel="icon" href="${BRAND_LOGO}">
<style>${STYLES}</style></head>
<body>
<div class="startup" id="startup" aria-hidden="true"><img src="${BRAND_LOGO}" alt=""></div>
<header>
  <div><h1 style="display:flex;align-items:center;gap:12px">MCP SafeTripwire<img src="${BRAND_LOGO}" alt="" width="30" height="30"></h1><p class="lede" id="lede"></p><p class="stamp">__STARTED__</p></div>
  <button class="langbtn" id="langbtn"></button>
</header>
<nav id="nav"></nav>
<main id="main"></main>
<dialog id="agent-picker" class="agent-picker" aria-label="Agent"></dialog>
<script>
const I18N = ${JSON.stringify(I18N)};
const AGENT_LOGOS = ${JSON.stringify(AGENT_LOGOS)};
const AGENT_CATALOG = ${JSON.stringify(AGENT_CATALOG)};
const AUDIT_TEXT = ${JSON.stringify(AUDIT_TEXT)};
const auditText = ${auditText.toString()};
let LANG = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
try { const s = localStorage.getItem('tw-lang'); if (s === 'zh' || s === 'en') LANG = s; } catch (e) {}
const T = () => I18N[LANG];
const t = (k) => T()[k];
const labelFor = (ev) => (T().events[ev] || ev);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let backendDown = false;
// Every call is bounded: without this a slow or wedged backend leaves the
// spinner up forever, which reads as "the app is frozen".
const api = (p, o = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 8000);
  return fetch(p, { ...o, signal: ctrl.signal, headers: { 'content-type': 'application/json', ...(o.headers || {}) } })
    .then(function (r) {
      // Marking the backend dead on an HTTP error (or a bad body) was wrong:
      // only transport-level failures mean the process is gone.
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { httpStatus: r.status });
      return r.json();
    })
    .then(function (j) { clearTimeout(timer); backendDown = false; return j; })
    .catch(function (err) {
      clearTimeout(timer);
      const gone = err.name === 'AbortError' || err instanceof TypeError;
      backendDown = gone;
      if (gone) backendDown = true;
      throw err;
    });
};

const TABS = ['status', 'tools', 'activity', 'remote'];
const TAB_LABEL = { status: 'tabStatus', tools: 'tabTools', activity: 'tabActivity', remote: 'tabRemote' };
let TAB = 'status';
const tabs = {};
let topologySignature = '';
const topologySignatureOf = (s) => JSON.stringify([s.tools && s.tools.topology, (s.hosts || []).map(h => [h.id, h.exists]), s.tools && s.tools.supply]);

// Rendered above the status cards: the dashboard numbers and the peers that
// have connected to a watched channel. Built with concatenation, not template
// literals, so this file needs no nested escaping.
function modeSummary(s) {
  return (LANG === 'zh' ? '当前模式：' : 'Current mode: ') + t(s.protection === 'protect' ? 'modeProtect' : 'modeObserve') + (s.protection === 'protect' ? (LANG === 'zh' ? ' · 对已接入的 MCP 执行阻断规则' : ' · Blocking rules apply to enrolled MCP traffic') : (LANG === 'zh' ? ' · 只检查和记录，不拦截调用' : ' · Checks and records calls without blocking'));
}
function statsHtml(s) {
  const tk = s.tools || { total: 0, unprotected: 0, alerts24h: 0 };
  const prot = tk.total - tk.unprotected;
  const chip = (key, n, label, cls) => '<div class="stat"><b data-stat="' + key + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(String(n)) + '</b><span>' + esc(label) + '</span></div>';
  return '<div class="card"><div class="stats">' +
    chip('total', tk.total, t('statsChannels')) +
    chip('protected', prot, t('statsProtected')) +
    chip('unprotected', tk.unprotected, t('statsUnprotected'), tk.unprotected > 0 ? 'num-warn' : '') +
    chip('alerts', tk.alerts24h, t('statsAlerts'), tk.alerts24h > 0 ? 'num-bad' : '') +
    '</div><div class="mode-summary muted">' + esc(modeSummary(s)) + '</div>' +
    (s.integrityErrors && s.integrityErrors.length ? '<p class="num-bad" role="alert">' + (LANG === 'zh' ? '配置校验失败，已拒绝受影响的配置。请恢复可信备份；不要直接覆盖异常文件。' : 'Configuration validation failed. Affected configuration was rejected. Restore a trusted backup; do not overwrite the rejected file.') + '</p>' : '') + '</div>';
}

function pendingHtml(s) {
  const list = s.tools && s.tools.pending ? s.tools.pending : [];
  if (!list.length) return '';
  let rows = '';
  for (const p of list) {
    rows += '<tr><td>' + esc(p.name) + '</td>' +
      '<td class="muted">' + esc(String(p.count === null || p.count === undefined ? '' : p.count)) + '</td>' +
      '<td class="muted">' + esc(String(p.seenAt || '').slice(11, 19)) + '</td>' +
      '<td><button class="btn-sm" onclick="doApprove(' + esc(JSON.stringify(p.name)) + ',' + esc(JSON.stringify(p.hash)) + ')">' + esc(t('approve')) + '</button></td></tr>';
  }
  return '<div class="card"><div class="big">' + esc(t('pendingTitle')) + '</div>' +
    '<p class="muted">' + esc(t('pendingHint')) + '</p>' +
    '<table><tr><th>' + esc(t('colTool')) + '</th><th>' + esc(t('colTools')) + '</th><th>' + esc(t('colSeen')) + '</th><th></th></tr>' +
    rows + '</table></div>';
}

window.doApprove = async (name, hash) => {
  if (!confirm(t('confirmApprove').replace('{0}', name))) return;
  const r = await api('/api/approve', { method: 'POST', body: JSON.stringify({ name, hash, confirm: true }) });
  alert(r.ok ? t('approveDone') : (t('wrapFail') + (r.error || t('unknown'))));
  if (r.ok) render();
};

function agentLabel(host) {
  const aliases = { 'codex-cli': 'codex', 'trae-cn': 'trae', 'qoder-cli': 'qoder', 'codebuddy-code': 'codebuddy', 'codebuddy-cli': 'codebuddy', qwen: 'qwen-code', 'qwen-cli': 'qwen-code', kimi: 'kimi-code', 'kimi-cli': 'kimi-code' };
  const raw = String(host || '').toLowerCase().split('@')[0];
  const key = aliases[raw] || raw;
  const labels = Object.fromEntries(AGENT_CATALOG.map(agent => [agent.id, agent.label]));
  const agent = AGENT_CATALOG.find(agent => agent.id === key);
  const image = AGENT_LOGOS[agent?.icon || key];
  return '<span class="agent-label">' + (image ? '<img class="agent-logo" src="' + image + '" alt="" aria-hidden="true">' : '<span class="agent-logo agent-fallback" aria-hidden="true">' + esc((labels[key] || host || '?').slice(0,1)) + '</span>') + '<span>' + esc(labels[key] || host) + '</span></span>';
}
function topologyHtml(s) {
  topologySignature = topologySignatureOf(s);
  const rows = (s.tools && s.tools.topology) || [];
  const head = '<div class="card" id="topology"><div class="big">' + esc(t('topoTitle')) + '</div>';
  const groups = new Map();
  for (const r of rows) {
    const agentId = r.host.split('@')[0];
    if (!groups.has(agentId)) groups.set(agentId, []);
    groups.get(agentId).push(r);
  }
  // Installation without an MCP is shown in the picker/list, not as an empty
  // protection chain. Keep exactly one empty slot for adding a channel.
  let body = '<div class="channels">';
  const arrow = '<span class="arrow" aria-hidden="true"><i></i><i></i><i></i></span>';
  for (const [host, channels] of [...groups].sort(([a],[b]) => { const rank=id=>AGENT_CATALOG.findIndex(agent=>agent.id===id); return rank(a)>=0 && rank(b)>=0 ? rank(a)-rank(b) : a.localeCompare(b,'en',{sensitivity:'base'}); })) {
    const vendor = AGENT_CATALOG.find(agent => agent.id === host)?.vendor;
    body += '<section class="channel-group"><div class="channel-heading"><span class="agent-heading">' + agentLabel(host) + (vendor ? '<span class="muted" style="font-weight:400">' + esc(vendor) + '</span>' : '') + '</span><span class="muted">' + channels.length + esc(t('sumChannels')) + '</span></div>';
    if (!channels.length) body += '<p class="muted">' + esc(t('topoEmpty')) + '</p>';
    for (const r of channels) {
    body += '<div class="flow ' + (r.protected ? 'protected' : 'unprotected') + '">' +
      '<span class="node">' + agentLabel(r.host) + '</span>' +
      arrow +
      '<span class="node mid ' + (r.protected ? 'on' : 'off') + '">SafeTripwire</span>' +
      arrow +
      '<span class="node">' + esc(r.name) + '</span>' +
      '<span class="flow-flags"><span class="tag ' + (r.protected ? 'calm' : 'notice') + '">' +
      esc(r.protected ? t('protected') : t('unprotected')) + '</span>' +
      (s.tools && s.tools.supply && s.tools.supply[r.host + '::' + r.name]
        ? '<span class="tag notice">' + esc(s.tools.supply[r.host + '::' + r.name][0].rule) + '</span>'
        : '') +
      '</span></div>';
    }
    body += '</section>';
  }
  body += '<div class="channel-group empty"><button class="add-orb" aria-label="' + esc(LANG === 'zh' ? '添加通道' : 'Add channel') + '" onclick="openChannelPicker()"></button></div>';
  body += '</div>';
  const allOn = rows.length > 0 && rows.every(function (r) { return r.protected; });
  const actionBtn = allOn
    ? '<button onclick="doRevertAll()">' + esc(t('revertAll')) + '</button>'
    : '<button onclick="doProtectAll()">' + esc(t('protectAll')) + '</button>';
  return head + body + '<div class="btns">' + actionBtn + '</div></div>';
}

// What is actually in force right now: the mechanisms, not marketing.

// Live counters, not a static feature list: what the engine has caught.
function coverageHtml(s) {
  // replaced below by chartHtml
  return '';
  const d = (s.tools && s.tools.detections) || {};
  const row = function (k, v, bad) {
    return '<tr><th>' + esc(k) + '</th><td class="right">' + (bad && v > 0 ? '<b class="hot">' + v + '</b>' : String(v)) + '</td></tr>';
  };
  return '<div class="card"><div class="big">' + esc(t('covTitle')) + '</div><table>' +
    row(t('covStatic'), d.staticFindings || 0) +
    row(t('covArgs'), d.argumentHits || 0, true) +
    row(t('covDecoy'), d.decoyTriggers || 0, true) +
    row(t('covCanary'), d.canaryTrips || 0, true) +
    row(t('covPeer'), d.unexpectedPeers || 0, true) +
    row(t('covNewTool'), d.newTools || 0) +
    row(t('covChanged'), d.toolChanges || 0) +
    row(t('covBlocked'), d.blocked || 0, true) +
    '</table></div>';
}

// A wave over the last 24 hours: the shape of your own Agent<->MCP activity,
// readable without knowing what any single counter means.
let chartHours = [];
const chartSeries = () => [
  { key: 'total', label: t('chartTotal'), color: '#444444', value: b => b.critical + b.warn + b.info },
  { key: 'warn', label: t('chartWarn'), color: '#26a88e', value: b => b.warn },
  { key: 'critical', label: t('chartCrit'), color: '#b96868', value: b => b.critical },
];
let chartSelected = 0;
function chartHide(plot) {
  for (const e of plot.querySelectorAll('.chart-cursor,.chart-dot,.chart-tooltip')) e.style.display = 'none';
}
function chartShow(plot, index) {
  if (!chartHours.length) return;
  chartSelected = Math.min(chartHours.length - 1, Math.max(0, index));
  const bucket = chartHours[chartSelected];
  const max = Number(plot.dataset.max);
  const x = chartHours.length === 1 ? 50 : chartSelected / (chartHours.length - 1) * 100;
  const cursor = plot.querySelector('.chart-cursor');
  cursor.style.left = x + '%'; cursor.style.display = 'block';
  let rows = '';
  for (const series of chartSeries()) {
    const dot = plot.querySelector('[data-dot="' + series.key + '"]');
    dot.style.left = x + '%'; dot.style.top = (96 - series.value(bucket) / max * 88) + '%'; dot.style.display = 'block';
    rows += '<span><i class="chart-key" style="background:' + series.color + '"></i>' + esc(series.label) + ': <b>' + series.value(bucket) + '</b></span>';
  }
  const tooltip = plot.querySelector('.chart-tooltip');
  const time = new Date(bucket.ts || Date.now() - (chartHours.length - 1 - chartSelected) * 3600000);
  tooltip.innerHTML = '<span class="muted">' + esc(time.toLocaleString()) + '</span>' + rows;
  tooltip.style.display = 'block';
  const width = plot.getBoundingClientRect().width;
  const desired = x / 100 * width + 12;
  const left = Math.max(0, Math.min(desired, width - tooltip.offsetWidth));
  tooltip.style.left = left + 'px'; tooltip.style.top = '10px';
}
function chartHover(event, plot) {
  const rect = plot.getBoundingClientRect();
  chartShow(plot, Math.round((event.clientX - rect.left) / rect.width * (chartHours.length - 1)));
}
function chartKey(event, plot) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); chartShow(plot, chartSelected + (event.key === 'ArrowLeft' ? -1 : 1));
  } else if (event.key === 'Escape') chartHide(plot);
}
function chartHtml(s) {
  chartHours = (s.tools && (s.tools.activity || s.tools.hourly)) || [];
  if (!chartHours.length) return '';
  const series = chartSeries();
  const max = Math.max(1, ...chartHours.map(series[0].value));
  const yOf = v => 96 - v / max * 88;
  const ticks = [...new Set([0, Math.round(max / 4), Math.round(max / 2), Math.round(max * 3 / 4), max])];
  const horizontal = Array.from({length:9}, (_, i) => '<line class="axis-grid" x1="0" y1="' + yOf(max * i / 8) + '" x2="960" y2="' + yOf(max * i / 8) + '"></line>').join('');
  const vertical = Array.from({length:13}, (_, i) => '<line class="axis-grid axis-grid-vertical" x1="' + i*80 + '" y1="8" x2="' + i*80 + '" y2="96"></line>').join('');
  const grid = horizontal + vertical;
  const labels = ticks.map(v => '<span class="chart-y" style="top:' + yOf(v) + '%">' + v + '</span>').join('');
  const lines = series.map(item => {
    const points = chartHours.map((bucket, i) => ({ x: chartHours.length === 1 ? 480 : i / (chartHours.length - 1) * 960, y: yOf(item.value(bucket)) }));
    let path = 'M' + points[0].x + ',' + points[0].y;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], bend = (b.x - a.x) * .25;
      path += ' C' + (a.x + bend) + ',' + a.y + ' ' + (b.x - bend) + ',' + b.y + ' ' + b.x + ',' + b.y;
    }
    return '<path class="wave-line" style="stroke:' + item.color + '" d="' + path + '"></path>';
  }).join('');
  const dots = series.map(item => '<i class="chart-dot" data-dot="' + item.key + '" style="background:' + item.color + '"></i>').join('');
  const legend = series.map(item => '<span><i class="chart-key" style="background:' + item.color + '"></i>' + esc(item.label) + ' <b>' + chartHours.reduce((sum,b) => sum + item.value(b),0) + '</b></span>').join('');
  return '<div class="card chart-card"><div class="big">' + esc(t('chartTitle')) + '</div><div class="chart-content">' +
    '<div class="chart-plot" data-max="' + max + '" tabindex="0" role="group" aria-label="' + esc(t('chartTitle')) + '" onpointermove="chartHover(event,this)" onpointerleave="chartHide(this)" onfocus="chartShow(this,chartHours.length-1)" onblur="chartHide(this)" onkeydown="chartKey(event,this)">' + labels +
    '<svg class="wave" viewBox="0 0 960 100" preserveAspectRatio="none" aria-hidden="true">' + grid + lines + '</svg>' +
    '<div class="chart-cursor"></div>' + dots + '<div class="chart-tooltip"></div></div>' +
    '<div class="chart-x"><span>' + esc(t('axisFrom')) + '</span><span>' + esc(t('axisMid')) + '</span><span>' + esc(t('axisNow')) + '</span></div>' +
    '<div class="legend">' + legend + '</div><div class="muted" style="font-size:12px;margin-top:6px">' + (LANG === 'zh' ? '每 5 分钟统计一次；无事件的时段保持为零。' : 'Events per 5 minutes; quiet intervals stay at zero.') + (s.tools.historyPartial ? (LANG === 'zh' ? ' 当前仅显示最近可读取记录，非完整日统计。' : ' Only the recent readable log is included; daily totals are incomplete.') : '') + '</div></div></div>';
}

function peersHtml(s) {
  const peers = (s.tools && s.tools.peers) || [];
  const head = '<div class="card"><div class="big">' + esc(t('peers')) + '</div>';
  if (!peers.length) return head + '<p class="muted">' + esc(t('noPeers')) + '</p></div>';
  let rows = '';
  for (const p of peers) {
    rows += '<tr><td>' + esc(p.image || t('unnamed')) + '</td>' +
      '<td class="muted">' + esc(String(p.pid == null ? '' : p.pid)) + '</td>' +
      '<td><span class="tag ' + (p.allowed ? 'calm' : 'severe') + '">' + esc(p.allowed ? t('allowed') : t('denied')) + '</span></td>' +
      '<td class="muted">' + esc(String(p.lastTs || '').slice(11, 19)) + '</td></tr>';
  }
  return head + '<table><tr><th>' + esc(t('colImage')) + '</th><th>' + esc(t('colPid')) + '</th><th>' + esc(t('colAllowed')) + '</th><th>' + esc(t('colLastSeen')) + '</th></tr>' + rows + '</table></div>';
}


let advancedSnapshot = null;
function advancedHtml(a) {
 advancedSnapshot = a;
 const zh = LANG === 'zh', count = Object.keys(a.baseline).length;
 const mode = zh ? {off:'暂不开启',warn:'异常时提醒',block:'异常时拦截'} : {off:'Off',warn:'Notify on changes',block:'Block changes'};
 return '<section class="card advanced-card"><div class="advanced-head"><div><div class="big">'+(zh?'进阶防护':'Advanced protection')+'</div><p class="muted">'+(zh?'先正常使用，再把可信行为记下来。以后发现变化时，由你选择提醒或拦截。':'Use your tools normally, then save their trusted behaviour. Choose whether later changes trigger a notice or a block.')+'</p></div></div>'+
 '<div class="baseline-status">'+(count ? (zh?'已记住 '+count+' 个工具的可信行为':'Trusted behaviour saved for '+count+' tools') : (zh?'还没有可信行为样本，先接入并批准通道，再正常使用。':'No trusted sample yet. Enroll and approve a channel, then use it normally.'))+' · '+esc(mode[a.baselineMode])+'</div>'+
 '<div class="switch" role="group" aria-label="'+(zh?'异常处理':'Response to changes')+'"><button class="'+(a.baselineMode==='warn'?'on':'')+'" onclick="setBaselineResponse(&quot;warn&quot;)">'+(zh?'异常时提醒':'Notify on changes')+'</button><button class="'+(a.baselineMode==='block'?'on':'')+'" onclick="setBaselineResponse(&quot;block&quot;)">'+(zh?'异常时拦截':'Block changes')+'</button></div>'+
 '<div class="btns"><button class="tonal" onclick="saveAdvancedUi(true)">'+(zh?'记住当前正常行为':'Save trusted behaviour')+'</button></div><p class="muted">'+(zh?'每个工具至少需要20次正常调用。只有开启阻断模式，才会拦截经过本程序的 MCP 请求。':'Each tool needs at least 20 allowed calls. Blocking requires Block mode and applies to MCP requests routed through SafeTripwire.')+'</p>'+
 '<details class="advanced-details"><summary>'+(zh?'自定义黑名单和详细设置':'Custom blocklists and detailed settings')+'</summary><div class="advanced-fields">'+
 '<label class="advanced-field"><span>'+(zh?'不允许使用的工具':'Tools to block')+'</span><textarea id="deny-tools" placeholder="'+(zh?'每行填写一个工具名':'One tool name per line')+'">'+esc(a.blockedTools.join('\\n'))+'</textarea><small>'+(zh?'不知道工具名可以留空，不影响已有防护。':'Leave empty if unsure. Existing protection still applies.')+'</small></label>'+
 '<label class="advanced-field"><span>'+(zh?'不允许访问的域名':'Domains to block')+'</span><textarea id="deny-domains" placeholder="example.com">'+esc(a.blockedDestinations.join('\\n'))+'</textarea><small>'+(zh?'每行一个域名，自动包含子域名。':'One domain per line; subdomains are included.')+'</small></label></div>'+
 '<div class="advanced-options"><label>'+(zh?'行为变化处理':'Response to changes')+'<select id="baseline-mode">'+['off','warn','block'].map(v=>'<option value="'+v+'" '+(a.baselineMode===v?'selected':'')+'>'+esc(mode[v])+'</option>').join('')+'</select></label><label><input id="baseline-fields" type="checkbox" '+(a.checkNewFields?'checked':'')+'>'+(zh?'同时检查新增参数（可选）':'Also check new argument fields (optional)')+'</label></div>'+
 '<div class="btns"><button class="primary" onclick="saveAdvancedUi(false)">'+(zh?'保存自定义规则':'Save custom rules')+'</button></div></details><div id="advanced-feedback" class="advanced-feedback" role="status">'+(a.integrityError?esc(zh?'规则文件校验失败，请恢复可信备份。':'Rule integrity check failed. Restore a trusted backup.'):'')+'</div></section>';
}
function advancedFeedback(message, failed) {
 const node=document.getElementById('advanced-feedback');if(node){node.textContent=message;node.className='advanced-feedback'+(failed?' error':'');}
}
function refreshAdvancedCard(saved, keepDraft) {
 const card=document.querySelector('.advanced-card');if(!card)return;
 const opened=card.querySelector('details').open, position=window.scrollY;
 const ids=['deny-tools','deny-domains'];const drafts=ids.map(id=>({id,value:document.getElementById(id).value,scroll:document.getElementById(id).scrollTop}));
 const fields=document.getElementById('baseline-fields').checked;
 card.outerHTML=advancedHtml(saved);
 document.querySelector('.advanced-details').open=opened;
 for(const draft of drafts){const input=document.getElementById(draft.id);if(keepDraft)input.value=draft.value;input.scrollTop=draft.scroll;}
 if(keepDraft)document.getElementById('baseline-fields').checked=fields;
 if(typeof window.scrollTo==='function')window.scrollTo(0,position);
}
window.setBaselineResponse = async function(mode) {
 try {
  advancedSnapshot=await api('/api/advanced',{method:'POST',body:JSON.stringify({baselineMode:mode})});
  refreshAdvancedCard(advancedSnapshot, true); advancedFeedback(LANG==='zh'?'已保存。实际拦截还需开启阻断模式。':'Saved. Actual blocking also requires Block mode.',false);
 } catch(e){advancedFeedback(e.message,true);}
};
window.saveAdvancedUi = async function(freeze) {
 if (freeze && !confirm(LANG === 'zh' ? '请确认最近的工具调用正常。将保存至少20次正常调用的已批准工具，作为之后检查的参考。' : 'Confirm recent tool calls were legitimate. Save approved tools with at least 20 allowed calls as the reference for future checks.')) return;
 const lines = id => document.getElementById(id).value.split(/\\r?\\n/).map(v=>v.trim()).filter(Boolean);
 try {
  const body=freeze?{freeze:true,confirm:true}:{blockedTools:lines('deny-tools'),blockedDestinations:lines('deny-domains'),baselineMode:document.getElementById('baseline-mode').value,checkNewFields:document.getElementById('baseline-fields').checked};
  advancedSnapshot=await api('/api/advanced', {method:'POST',body:JSON.stringify(body)});
  refreshAdvancedCard(advancedSnapshot, freeze);advancedFeedback(LANG==='zh'?'已保存':'Saved',false);
 } catch(e){advancedFeedback(e.message,true);}
};

tabs.status = async () => {
  const s = await api('/api/status');
  updateLede(s);
  const advanced = await api('/api/advanced');
  const on = s.protection === 'protect';
  return statsHtml(s) + chartHtml(s) + topologyHtml(s) + pendingHtml(s) + peersHtml(s) + advancedHtml(advanced) + \`<div class="card">
   <div class="big">\${esc(t('protection'))}</div>
   <p class="muted">\${esc(t('protectionHint'))}</p>
   <div class="switch">
     <button class="\${on ? '' : 'on'}" onclick="setProtection('observe')">\${esc(t('observe'))}</button>
     <button class="\${on ? 'on' : ''}" onclick="setProtection('protect')">\${esc(t('protect'))}</button>
   </div></div>
  <div class="card"><table>
   <tr><th>\${esc(t('system'))}</th><td>\${esc(s.platform)}</td></tr>
   <tr><th>\${esc(t('pinned'))}</th><td>\${s.pinned.length ? s.pinned.map((p) => esc(p.name)).join(', ') : '<span class="muted">' + esc(t('noPinned')) + '</span>'}</td></tr>
   <tr><th>\${esc(t('dataLocation'))}</th><td><code>\${esc(s.dataDir)}</code></td></tr>
   <tr><th>\${esc(t('toolsState'))}</th><td>\${s.tools ? (s.tools.total - s.tools.unprotected) + ' / ' + s.tools.total + ' ' + esc(t('protectedSuffix')) : ''}</td></tr>
  </table>
  <div class="btns">
    <button onclick="doProtectAll()">\${esc(t('protectAll'))}</button>
    <button onclick="openFolder('source')">\${esc(t('openProgram'))}</button>
    <button onclick="openFolder('logs')">\${esc(t('openRecords'))}</button>
  </div></div>\`;
};

tabs.tools = async () => {
  const s = await api('/api/status');
  const found = s.hosts.filter((h) => h.exists || h.installed);
  if (!found.length) return '<div class="card">' + esc(t('noHosts')) + '</div>';
  return found.map((h) => \`<div class="card">
   <div class="big agent-heading">\${agentLabel(h.id)} <span class="muted">\${esc(h.vendor || '')}</span></div>
   <div class="muted" style="margin-bottom:8px">\${esc(h.path)}\${h.scope === 'project' ? ' · ' + esc(h.project || '') : ''}</div>
   \${h.servers.length ? \`<table><tr><th>\${esc(t('colTool'))}</th><th>\${esc(t('colConn'))}</th><th>\${esc(t('colState'))}</th><th></th></tr>
     \${h.servers.map((sv) => \`<tr><td>\${esc(sv.name)}</td>
       <td>\${sv.kind === 'http' ? esc(t('remoteService')) : esc(t('localProgram'))}</td>
       <td>\${sv.wrapped ? '<span class="tag calm">' + esc(t('protected')) + '</span>' : '<span class="tag">' + esc(t('unprotected')) + '</span>'}</td>
       <td>\${sv.wrapped ? '' : \`<button class="btn-sm" onclick="doWrap(\${esc(JSON.stringify(h.id))},\${esc(JSON.stringify(sv.name))})">\${esc(t('enableProtection'))}</button>\`}</td></tr>\`).join('')}
     </table>\` : '<p class="muted">' + esc(t('noTools')) + '</p>'}
   <div class="btns"><button onclick="doRestore(\${esc(JSON.stringify(h.id))})">\${esc(t('restoreMine'))}</button></div>
 </div>\`).join('');
};

tabs.activity = async () => {
  const a = await api('/api/events?limit=150');
  if (!a.events.length) {
    return \`<div class="card">\${esc(t('noActivity'))}<div class="btns"><button onclick="openFolder('logs')">\${esc(t('openRecords'))}</button></div></div>\`;
  }
  return \`<div class="card audit-card"><table class="audit-table"><colgroup><col class="audit-time"><col class="audit-level"><col class="audit-event"><col></colgroup><thead>
   <tr><th>\${esc(t('colTime'))}</th><th>\${esc(t('colLevel'))}</th><th>\${esc(t('colWhat'))}</th><th>\${esc(t('colDetail'))}</th></tr>
   </thead><tbody>
   \${a.events.map((e) => {
     const { ts, level, event, label, chain, ...rest } = e;
     const cls = level === 'critical' ? 'severe' : level === 'warn' ? 'notice' : 'calm';
     const lv = level === 'critical' ? t('severe') : level === 'warn' ? t('notice') : t('info');
     const plain = auditText(e, LANG);
     return \`<tr><td class="muted">\${esc((ts || '').slice(11, 19))}</td>
       <td><span class="tag \${cls}">\${esc(lv)}</span></td>
       <td>\${esc(plain.label)} (\${esc(plain.note)})\${e.gist ? '<br><code>' + esc(e.gist) + '</code>' : ''}</td>
       <td class="muted"><code>\${esc(JSON.stringify(rest).slice(0, 140))}</code></td></tr>\`;
   }).join('')}
   </tbody></table></div>\`;
};

tabs.remote = async () => {
  const s = await api('/api/status');
  const routes = s.routes || [];
  let rows = '';
  if (routes.length) {
    for (const r of routes) {
      rows += '<tr><td>' + esc(r.name) + '</td><td><code>' + esc(r.upstream) + '</code></td>' +
        '<td><span class="tag calm">' + esc(t('protected')) + '</span></td></tr>';
    }
  } else {
    rows = '<tr><td class="muted" colspan="3">' + esc(t('noRemote')) + '</td></tr>';
  }
  return '<div class="card"><div class="big">' + esc(t('tabRemote')) + '</div>' +
    '<table><tr><th>' + esc(t('colService')) + '</th><th>' + esc(t('colUpstream')) + '</th><th>' + esc(t('colState')) + '</th></tr>' + rows + '</table>' +
    '<div class="big" style="margin-top:16px">' + esc(t('addRemote')) + '</div>' +
    '<div class="row"><input id="rname" placeholder="' + esc(t('phName')) + '">' +
    '<input id="rurl" placeholder="https://host/mcp">' +
    '<button class="btn-sm" onclick="doAddRemote()">' + esc(t('add')) + '</button></div>' +
    '<p class="muted">' + esc(t('addRemoteHint')) + '</p>' +
    '<p class="muted">' + esc(t('relayAddr')) + ' <code>http://' + esc(s.listen.host) + ':' + s.listen.port + '/&lt;name&gt;/&hellip;</code></p></div>';
};

window.setProtection = async (p) => { await api('/api/protection', { method: 'POST', body: JSON.stringify({ protection: p }) }); render(); };
let agentDetectVersion = 0;
window.closeAgentPicker = () => { agentDetectVersion++; document.getElementById('agent-picker').close(); };
window.openRemoteSetup = () => { window.closeAgentPicker(); TAB = 'remote'; paintChrome(); render(); };
window.openChannelPicker = () => {
  const zh = LANG === 'zh';
  const picker = document.getElementById('agent-picker');
  const vendors = [...new Set(AGENT_CATALOG.filter(agent=>agent.id!=='custom').map(agent => agent.vendor))].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})).concat(AGENT_CATALOG.find(agent=>agent.id==='custom').vendor);
  picker.innerHTML = '<div class="picker-top"><strong>' + (zh ? '添加通道' : 'Add channel') + '</strong><button class="btn-sm picker-close" onclick="closeAgentPicker()" aria-label="' + (zh ? '关闭' : 'Close') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
    '<div class="picker-fields"><label for="agent-vendor">' + (zh ? '厂商' : 'Vendor') + '<select id="agent-vendor" onchange="updateAgentOptions()">' + vendors.map(vendor => '<option value="' + esc(vendor) + '">' + esc(vendor) + '</option>').join('') + '</select></label>' +
    '<label for="agent-product">Agent<select id="agent-product" onchange="detectSelectedAgent()"></select></label></div><div id="agent-preview" class="agent-heading"></div><div id="agent-detection"></div>' +
    '<details style="margin-top:16px"><summary>' + (zh ? '配置在其他位置？' : 'Configuration stored elsewhere?') + '</summary><label for="agent-config-path">' + (zh ? 'MCP 配置文件' : 'MCP configuration file') + '</label><input id="agent-config-path" placeholder="JSON / JSONC / TOML"><button class="btn-sm" onclick="registerAgentConfigPath()">' + (zh ? '识别此文件' : 'Detect this file') + '</button></details>';
  picker.showModal();
  window.updateAgentOptions();
};
window.updateAgentOptions = () => {
  const vendorField = document.getElementById('agent-vendor');
  const vendor = vendorField.value || AGENT_CATALOG[0].vendor;
  const products = AGENT_CATALOG.filter(agent => agent.vendor === vendor);
  const select = document.getElementById('agent-product');
  select.innerHTML = products.map(agent => '<option value="' + esc(agent.id) + '">' + esc(agent.label) + '</option>').join('');
  select.value = products[0].id;
  window.detectSelectedAgent();
};
window.registerAgentConfigPath = async () => {
  try {
  const agentId = document.getElementById('agent-product').value;
  const path = document.getElementById('agent-config-path').value.trim();
  const result = await api('/api/register-agent-config', { method: 'POST', body: JSON.stringify({ agentId, path }) });
  if (!result.ok) { alert(result.error || t('loadFailed')); return; }
  window.detectSelectedAgent();
  render();
  } catch (error) { alert(error.message); }
};
window.detectSelectedAgent = async () => {
  const version = ++agentDetectVersion;
  const id = document.getElementById('agent-product').value;
  const agent = AGENT_CATALOG.find(agent => agent.id === id);
  document.getElementById('agent-preview').innerHTML = agentLabel(id) + '<span class="muted">' + esc(agent?.vendor || '') + '</span>';
  const result = document.getElementById('agent-detection');
  result.innerHTML = spinnerHtml(LANG === 'zh' ? '正在识别…' : 'Detecting…');
  try {
    const detected = await api('/api/detect-agent?id=' + encodeURIComponent(id));
    if (version !== agentDetectVersion) return;
    const zh = LANG === 'zh';
    const heading = detected.supported === false ? (zh ? '暂不支持自动读取此产品的 MCP 配置' : 'Automatic MCP configuration detection is not supported for this product yet') : !detected.exists ? (detected.installed ? (zh ? '已发现安装，还没有 MCP 配置' : 'Installation detected; no MCP configuration yet') : (zh ? '未发现安装或 MCP 配置' : 'No installation or MCP configuration detected')) : !detected.valid ? (zh ? '配置格式有误' : 'Invalid configuration') : !detected.servers.length ? (zh ? '已发现配置，还没有配置 MCP' : 'Configuration detected; no MCP configured') : (zh ? '识别到 ' + detected.servers.length + ' 个 MCP' : detected.servers.length + ' MCP channels found');
    result.innerHTML = '<strong>' + esc(heading) + '</strong><div class="detect-path">' + esc(detected.path) + '</div>' +
      (detected.servers?.length ? '<table><tbody>' + detected.servers.map(server => '<tr><td>' + esc(server.name) + (server.scope === 'project' ? '<div class="muted detect-path">' + esc(server.path) + '</div>' : '') + '</td><td>' + esc(server.kind === 'http' ? t('remoteService') : server.kind === 'stdio' ? t('localProgram') : t('unknown')) + '</td><td>' +
        (server.wrapped ? '<span class="tag calm">' + esc(t('protected')) + '</span>' : ['http', 'stdio'].includes(server.kind) ? '<button class="btn-sm" onclick="doWrap(' + esc(JSON.stringify(server.hostId || id)) + ',' + esc(JSON.stringify(server.name)) + ')">' + esc(t('enableProtection')) + '</button>' : '') + '</td></tr>').join('') + '</tbody></table>' : '') +
      (detected.supported === false ? '<p class="muted">' + (zh ? '如果它支持自定义 MCP：本机配置可在下方指定文件；远程服务可添加 HTTP 中转地址，再填回 Agent。接入完成前，这个产品不会受到保护。没有 MCP 设置的产品暂时无法接入。' : 'If this product supports custom MCP, select its local configuration file below, or add an HTTP relay and paste the relay URL into the Agent. Protection only applies after traffic is routed through SafeTripwire. Products without MCP settings cannot be connected yet.') + '</p><button class="btn-sm" onclick="openRemoteSetup()">' + (zh ? '设置 HTTP MCP 中转' : 'Set up HTTP MCP relay') + '</button>' : '');
  } catch (error) {
    if (version === agentDetectVersion) result.textContent = t('loadFailed') + error.message;
  }
};
window.doAddRemote = async () => {
  const nameEl = document.getElementById('rname');
  const urlEl = document.getElementById('rurl');
  const name = nameEl ? nameEl.value.trim() : '';
  const upstream = urlEl ? urlEl.value.trim() : '';
  if (!name || !upstream) { alert(t('addRemoteEmpty')); return; }
  const r = await api('/api/add-remote', { method: 'POST', body: JSON.stringify({ name, upstream }) });
  alert(r.ok ? (t('addRemoteOk') + r.localUrl) : (t('wrapFail') + (r.error || t('unknown'))));
  if (r.ok) render();
};

window.doRevertAll = async () => {
  if (!confirm(t('confirmRevertAll'))) return;
  const r = await api('/api/revert-all', { method: 'POST', body: JSON.stringify({ confirm: true }) });
  alert(r.ok ? (t('revertAllDone') + (r.reverted || []).join(', ')) : (t('wrapFail') + (r.error || t('unknown'))));
  if (r.ok) render();
};

window.doProtectAll = async () => {
  if (!confirm(t('confirmProtectAll'))) return;
  const r = await api('/api/protect-all', { method: 'POST', body: JSON.stringify({ confirm: true }) });
  alert(r.ok ? (t('protectAllDone') + r.applied) : (t('wrapFail') + (r.error || t('unknown'))));
  if (r.ok) render();
};
window.openFolder = async (which) => {
  try {
    const r = await api('/api/open-folder', { method: 'POST', body: JSON.stringify({ which }) });
    if (!r || r.ok !== true) alert(t('openFolderFailed') + ' ' + ((r && r.path) || ''));
  } catch (e) {
    alert(t('openFolderFailed') + ' ' + e.message);
  }
};
window.doWrap = async (host, server) => {
  if (!confirm(t('confirmWrap').replace('{0}', server))) return;
  const r = await api('/api/wrap', { method: 'POST', body: JSON.stringify({ host, server, confirm: true }) });
  alert(r.ok ? t('wrappedOk') : t('wrapFail') + (r.error || t('unknown')));
  if (r.ok) {
    const picker = document.getElementById('agent-picker');
    if (picker.open) window.detectSelectedAgent();
    render();
  }
};
window.doRestore = async (host) => {
  if (!confirm(t('confirmRestore'))) return;
  const r = await api('/api/restore-backup', { method: 'POST', body: JSON.stringify({ host, confirm: true }) });
  alert(r.ok ? t('restoredOk') : t('wrapFail') + (r.error || t('unknown')));
  if (r.ok) render();
};

// The line under the title reports the CURRENT configuration rather than
// describing the product, so it always says something true and specific.
// Reports the technical configuration in force, not a count of things.
function summaryText(s) {
  if (!s) return '';
  const m = s.mechanism || {};
  const ch = m.channels || { stdio: 0, http: 0 };
  const sep = ' · ';
  return t('sumTakeover') + ' stdio ' + ch.stdio + ' / http ' + ch.http + sep +
    t('sumLock') + ' ' + (m.pinned || 0) + sep +
    t('sumStatic') + ' ' + t('on') + sep +
    t('sumDeception') + ' ' + (m.deception ? t('on') : t('off')) + sep +
    t('sumPosture') + ' ' + (m.posture === 'protect' ? t('modeProtect') : t('modeObserve'));
}

let lastStatus = null;
function updateLede() {
  // Removed on request: the one-line configuration summary was noise.
  const el = document.getElementById('lede');
  if (el) el.style.display = 'none';
}

function paintChrome() {
  document.documentElement.lang = LANG;
  updateLede();
  $('#langbtn').textContent = LANG === 'zh' ? 'EN' : '中文';
  $('#nav').innerHTML = TABS.map((k) =>
    \`<button data-tab="\${k}" class="\${k === TAB ? 'on' : ''}">\${esc(t(TAB_LABEL[k]))}</button>\`).join('');
  document.querySelectorAll('nav button').forEach((b) => {
    b.onclick = () => { TAB = b.dataset.tab; paintChrome(); render(); };
  });
}

function spinnerHtml(label) {
  return '<div class="loading"><span class="spinner"></span>' + esc(label || t('loading')) + '</div>';
}

let renderGeneration = 0;
async function render() {
  const generation = ++renderGeneration;
  $('#main').innerHTML = spinnerHtml();
  let html;
  try { html = await tabs[TAB](); }
  catch (e) {
    if (generation !== renderGeneration) return;
    if (backendDown) {
      $('#main').innerHTML = '<div class="card down"><b>' + esc(t('backendDown')) + '</b>' +
        '<div class="btns"><button onclick="render()">' + esc(t('retry')) + '</button></div></div>';
      return;
    }
    html = '<div class="card">' + esc(t('loadFailed')) + esc(e.message) + '</div>';
  }
  if (generation === renderGeneration) $('#main').innerHTML = html;
}

$('#langbtn').onclick = () => {
  LANG = LANG === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('tw-lang', LANG); } catch (e) {}
  paintChrome(); render();
};

let lastTouch = Date.now();
['click', 'keydown', 'input', 'change'].forEach(function (ev) {
  document.addEventListener(ev, function () { lastTouch = Date.now(); }, true);
});

// Auto-refresh used to replace the DOM every 5 seconds, including while the user
// was clicking: buttons moved out from under the pointer and the panel felt
// frozen. Now it waits for a quiet moment first.
// Updating the numbers in place instead of replacing the DOM: a full re-render
// flashed the spinner and reset the view every few seconds.
async function refreshNumbers() {
  try {
    const s = await api('/api/status');
    const tk = s.tools || { total: 0, unprotected: 0, alerts24h: 0 };
    const put = function (key, value) {
      const el = document.querySelector('[data-stat="' + key + '"]');
      if (el) el.textContent = String(value);
    };
    put('total', tk.total);
    put('protected', tk.total - tk.unprotected);
    put('unprotected', tk.unprotected);
    updateLede(s);
    put('alerts', tk.alerts24h);
    const mode = document.querySelector('.mode-summary');
    if (mode) mode.textContent = modeSummary(s);
    const topology = document.getElementById('topology');
    if (topology && topologySignature !== topologySignatureOf(s)) topology.outerHTML = topologyHtml(s);
    const on = s.protection === 'protect';
    const ob = document.querySelector('[data-mode="observe"]');
    const pr = document.querySelector('[data-mode="protect"]');
    if (ob && pr) { ob.className = on ? '' : 'on'; pr.className = on ? 'on' : ''; }
  } catch (e) {
    /* keep the numbers we already have; the next tick will retry */
  }
}

function autoRefresh() {
  if (Date.now() - lastTouch < 8000) return;
  if (TAB === 'status') { refreshNumbers(); return; }
  if (TAB === 'activity') render();
}

paintChrome();
render();
setTimeout(() => { const startup = document.getElementById('startup'); if (startup) startup.remove(); }, 800);
setInterval(autoRefresh, 10000);
</script></body></html>`.split('__STARTED__').join(stamp);
}

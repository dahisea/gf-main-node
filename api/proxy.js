export default async function handler(request) {
  try {
    const response = await handleRequest(request);
    return new Response(response.body, {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function replaceHtmlLinks(content) {
  const languages = ['zh-CN', 'zh-TW', 'ja', 'en'];
  languages.forEach(lang => {
    const regex = new RegExp(
      `href="/${lang}/(scripts|users)/(\\d+)-[^/]+/?(code|versions|feedback|stats|discussions)?/?(\\d+)?/?(comments|subscribe)?/?(\\d+)?/?\\b"`,'g');
    content = content.replace(regex, (match, p1, p2, p3, p4, p5, p6) => {
      let newUrl = `href="/${lang}/${p1}/${p2}`;
      if (p3) newUrl += `/${p3}`; 
      if (p4) newUrl += `/${p4}`;
      if (p5) newUrl += `/${p5}`; 
      if (p6) newUrl += `/${p6}`;
      newUrl += '"'; 
      return newUrl;
    });
  });return content;
}
async function fetchWithRetry(request, retries = 5) {
  let attempt = 0;
  while (attempt <= retries) {
    try {const response = await fetch(request);
      if (response.status === 503 || response.status === 403 || response.status === 429) {  throw new Error(`Retryable status code: ${response.status}`);
      }
      return response;
    } catch (error) {attempt++;
      if (attempt > retries) {  return new Response(`請求錯誤 after ${retries} attempts: ${error.message}`, { status: 500 });
      }
      const adjustedAttempt = Math.floor(attempt / 2);
      const delay = Math.min(Math.pow(1.2, adjustedAttempt) * 100, 300);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}async function handleRequest(request) {
  const nodeHeader = request.headers.get('node');
  if (nodeHeader !== 'dahi') {
    return new Response(null, { status: 444 });
  }
  const url = new URL(request.url);
  const country = request.cf.country;

  if (url.pathname === '/') url.pathname = '/en';
  if (url.pathname.startsWith('/zh-hans')) url.pathname = url.pathname.replace('/zh-hans', '/zh-CN');
  if (url.pathname.startsWith('/zh-hant')) url.pathname = url.pathname.replace('/zh-hant', '/zh-TW');
  const targetUrl = new URL('https://greasyfork.org' + url.pathname + url.search);
  const shouldKeep = url.pathname.includes('/users') || url.pathname.includes('/import') || url.pathname.includes('/script_versions') || url.pathname.includes('/discussions') || url.pathname.includes('/reports');
  const modifiedHeaders = new Headers(request.headers);
  if (!shouldKeep) {modifiedHeaders.delete('Cookie');}
  const headersToRemove = ['Referer', 'x-requested-with', 'x-real-ip', 'x-forwarded-proto', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'node'];
  headersToRemove.forEach(header => modifiedHeaders.delete(header));
  
  modifiedHeaders.set('Origin', 'https://greasyfork.org');

  const shouldFollowRedirect = request.method !== 'POST' &&
    /^\/(zh-CN|zh-TW|zh-hans|zh-hant|ja|en)\/(scripts|users)\//.test(url.pathname) &&
    !url.pathname.endsWith('.json') &&
    !url.pathname.endsWith('.js');

  const newRequest = new Request(targetUrl, {
    method: request.method,
    headers: modifiedHeaders,
    body: request.body,
    redirect: shouldFollowRedirect ? 'follow' : 'manual',
  });
  try {
    const response = await fetchWithRetry(newRequest);
    if (!shouldFollowRedirect && response.status >= 300 && response.status < 400) {const location = response.headers.get('Location');
      if (location) {  const newLocation = await replaceDomainsInLocation(location);
        const renewHeaders = new Headers(response.headers);
        renewHeaders.set('Location', newLocation);
        return new Response(null, { status: response.status, statusText: response.statusText, headers: renewHeaders });}}
    if (response.status == 404) {return Response.redirect('https://gfork.dahi.icu/404', 302)}
    let responseBody = await response.text();
    const modifiedBody = await modifyResponseBody(responseBody, country, request);

    const finalHeaders = shouldKeep ? new Headers(response.headers) : new Headers();
    finalHeaders.delete('Link');
    finalHeaders.set('Content-Type', 'text/html; charset=utf-8');

    return new Response(modifiedBody, { status: response.status, statusText: response.statusText, headers: finalHeaders });
  } catch (error) {
    console.error(`Error handling request: ${error.message}`);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
async function replaceDomainsInLocation(location) {
  const domainMappings = [{ from: 'update.greasyfork.org', to: 'yxd.dahi.edu.eu.org' }, { from: 'api.greasyfork.org', to: 'cdn-1-mod-agf.zh-cn.eu.org' }, { from: 'greasyfork.org', to: 'gfork.dahi.icu' }];
  let newLocation = location;
  for (const mapping of domainMappings) {
    if (newLocation.includes(mapping.from)) {newLocation = newLocation.replace(mapping.from, mapping.to);
      break;}}return newLocation;
}
async function replaceSensitiveWords(content, sensitiveWords = []) {
  sensitiveWords.forEach(word => {
    const re = '#'.repeat(word.length);
    const regex = new RegExp(word, 'gi');
    content = content.replace(regex, re);
  });return content;}
async function removeUnwantedElements(content) {
  const raws = [
    /<img\s+[^>]*src="\/vite\/assets\/blacklogo96-[^"]+\.png"[^>]*>/gi,
    /<link\s+rel="search"[^>]*>/gi,
    /<link\s+rel="alternate"[^>]*>/gi,
    /<link\s+rel="canonical"\s+href="[^"]+"[^>]*>/gi,
    /<meta\s*name\s*=\s*["'][^"']*clckd["'][^>]*>/i,
    /<meta\s*name\s*=\s*["'][^"']*lhverifycode["'][^>]*>/i,
    /<meta\s*name\s*=\s*["'][^"']*robots["'][^>]*>/i,
    /<link\s+rel="stylesheet"\s+href="\/vite\/assets\/application-[^"]+\.css"\s+media="screen"\s*\/>/i,
    /<link\s+rel="icon"\s+href="\/vite\/assets\/blacklogo16-[^"]+\.png"\s*\/?>/i,
    /<script\s+src="\/vite\/assets\/application-[^"]+\.js"\s+crossorigin="anonymous"\s+type="module"\s*><\/script>/i,
    /<!-- Global site tag \(gtag.js\) - Google Analytics -->[\s\S]*?<script\s*async\s*src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"><\/script>[\s\S]*?<script>[\s\S]*?<\/script>/i,
    /<script\s*async\s*src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=[^"]+"[\s\S]*?<\/script>/i,
    /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css\?[^"]*Open\+Sans[^"]*display=swap"[^>]*>/i,
    /<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css\?[^"]*Open\+Sans[^"]*display=swap"><\/noscript>/i,
    /<form\b[^>]*\bclass\s*=\s*["'][^"']*external-login-form[^"']*["'][^>]*>[\s\S]*?<\/form>/gi,
    /<main\b[^>]*\bid\s*=\s*["'][^"']*installation-instructions-modal-content[^"']*["'][^>]*>[\s\S]*?<\/main>/gi,
    /<script\s*async\s*src="https:\/\/media\.ethicalads\.io\/media\/client\/ethicalads\.min\.js"[^>]*><\/script>/gi,
    /<form\b[^>]*\bclass\s*=\s*["'][^"']*language-selector[^"']*["'][^>]*>[\s\S]*?<\/form>/gi,
    /<div\s+class="modal__container"\s+role="dialog"\s+aria-modal="true">[\s\S]*?<\/div>/gi,
    /<li\b[^>]*>\s*<a\s+href="\/[^\/]+\/(discussions|users|moderator_actions)"[^>]*>[\s\S]*?<\/a>\s*<\/li>/gi,
    /<div[^>]*id="script-show-ea-image"[^>]*><\/div>/gi,
    /<div[^>]*src="[^"]*endowmentoverhangutmost\.com[^"]*"[^>]*><\/div>/gi,
    /<div\b[^>]*\bclass\s*=\s*["'][^"']*ad-content[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    /<div\b[^>]*\bid\s*=\s*["'][^"']*script-show-info-ad[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    /<div\s+class="modal__overlay"[^>]*>[\s\S]*?<\/div>/gi,
    /<div\s+id="installation-instructions-modal-[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<div\s+[^>]*class="[^"]*\bad\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<script>\s*\/\*\s*submit is handled by js if enabled\s*\*\/\s*document\.querySelectorAll\("\.language-selector-submit"\)\.forEach\(\(lss\)\s*=>\s*{\s*lss\.style\.display\s*=\s*"none"\s*}\)\s*<\/script>/gi
  ];
  return raws.reduce((content, rawd) => content.replace(rawd, ''), content);
}
async function modifyResponseBody(content, country, request) {
  const url = new URL(request.url);
  const chkeywords = ['/notifications', '/import', '/script_versions', '/discussions'];
  const decoded = atob('WyLphbciLCLoipIiLCLniLEiLCLmhJsiLCLlk4AiLCLohb4iLCLpqLAiLCLmgrwiLCLnva7ngbAiLCLnlqsiLCLmnYAiLCLmrroiLCLlsLwiLCLlsYEiLCLpt4QiLCLpuKEiLCLnp5HlrbjkuIoiLCLnp5HlrabkuIoiLCLmnLrlnLoiLCLmqZ/loLQiLCLmmYLku6MiLCLml7bku6MiLCLmlrDkuJbnlYwiLCLmnIDmlrDlnLDlnYAiLCLnpoHlnLAiLCLku5jotLkiLCLku5josrsiLCLmr5IiLCLlubPlj7AiLCLlubPoh7oiLCLkuK3lhbEiLCLlhbHpnZIiLCLlrqPlgrMiLCLlrqPkvKAiLCLoiIYiLCLovL8iLCLmganmg4UiLCLmnJ3pspwiLCLmnJ3prq4iLCLkuK3lpK4iLCLkuK3oj68iLCLkuK3ljY4iLCLlhbHlkowiLCLkurrmsJEiLCLmlK/pgqMiLCLnurMiLCLntI0iLCLlv4PngbUiLCLnmociLCLluJ0iLCLnv7vniYYiLCLnv7vlopkiLCLnv5Lov5HlubMiLCLkuaDov5HlubMiLCLlhpsiLCLou40iLCLmraYiLCLkuLvluK0iLCLnuL3ntbEiLCLmgLvnu58iLCLkuLvnvqkiLCLkuLvkuYkiLCLmgJ3mg7MiLCLlj7Dmub4iLCLlj7DngaMiLCLoh7rngaMiLCLnpL7mnIMiLCLnpL7kvJoiLCLmsJHkuLsiLCLmlL8iLCLoopYiLCLpoJgiLCLpooYiLCLlv6AiLCLnjK4iLCLnjbsiLCLkv5ciLCLmlrDnloYiLCLopb/ol48iLCLlnaYiLCLpnakiLCLovrEiLCLpoqAiLCLlhZoiLCLpu6giLCLpoZsiLCLlqIEiLCLmmrTlipsiLCLlha3lm5siLCLlhavkuZ3lha3lm5siLCLmjqjnv7siLCLms5Xova4iLCLms5XovKoiLCLlvovluIgiLCLlvovluKsiLCLlpKnlrokiLCLohZAiLCLmoq/lrZAiLCLojYnmprQiLCLlkKvnvp7ojYkiLCLmnIDmlrDlnLDlnYAiLCLmsLjkuYXpj4jmjqUiLCLmnIDmlrDpj4jmjqUiLCLmnIDmlrDntrLlnYAiLCLnmbzkvYjpoIEiLCLlm57lrrYiLCLmsLjkuYXlnLDlnYAiLCLku5josrsiLCLku5jotLkiLCLmlLbosrsiLCLmlLbotLkiLCLlj5HluIPpobUiLCLmnIDmlrDnvZHlnYAiLCLmnIDmlrDpk77mjqUiLCLmsLjkuYXpk77mjqUiLCLmtbfop5IiLCLlpKnmtq8iLCLkuqwiLCLljZfmtbciLCLpppnmuK8iLCLmvrMiLCLnlLgiLCLkuK3lm70iLCLkuK3lnIsiLCLlnIvnlKIiLCLlm73kuqciLCIiLCLmlrDmtaoiLCLpurvosYYiLCIxMTQ1MTQiLCIxMDI0IiwiODk2NCIsIjk2MTEwIiwiY2hpbmEiLCJnb3YiLCJob25nIiwidGFpd2FuIiwidGFuayIsInYycmF5IiwiY2xhc2giLCJzb2NrcyIsInRyb2phbiIsInZsZXNzIiwidm1lc3MiLCJ2cG4iLCJmeHhrIiwiZnh4eCIsImZ1Y2siLCJDTk0iLCJDQ1AiLCJDQ1RWIiwiQ1BDIiwiR0NEIiwiRVNVIiwiU0ZaIiwiWEpQIiwiTVpEIl0=');
  const fixedString = decodeURIComponent(escape(decoded)); 
  const sensitiveWords = JSON.parse(fixedString);
  const shouldSkipReplacement = chkeywords.some(keyword => url.pathname.includes(keyword));
  if (country === 'KP') {
    content = content.replace(/<\/head>/i, `<link href="https://cdn.jsdmirror.com/gh/dahisea/Re-GFork-web@main/css/mortis.css" rel="stylesheet"></head>`);
  }
  if (shouldSkipReplacement) {
    content = content.replace(/<\/head>/i, `<script src="https://cdn.jsdmirror.com/gh/emn178/js-sha1@master/build/sha1.min.js" crossorigin="anonymous"></script><script src="https://cdn.jsdmirror.com/npm/@hotwired/turbo@latest/dist/turbo.es2017-esm.min.js" crossorigin="anonymous" type="module"></script></head>`);}  
  if (!shouldSkipReplacement) {
    content = content.replace(/<meta\s*name\s*=\s*["'][^"']*csrf-param["'][^>]*>/i, '');
    content = content.replace(/<meta\s*name\s*=\s*["'][^"']*csrf-token["'][^>]*>/i, '');}  
  content = await removeUnwantedElements(content);
  content = await replaceHtmlLinks(content);
  content = await replaceSensitiveWords(content, sensitiveWords);
  const res = [
{raw: /<\/head>/i, re: `<meta name="keywords" content="油叉, 油猴脚本, 用户脚本, JavaScript" /><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3758644447684310" crossorigin="anonymous"></script><link rel="icon" href="https://s21.ax1x.com/2025/02/21/pEQznoQ.png"><script src="https://cdn.jsdmirror.com/gh/dahisea/Re-GFork-web@main/js/main.js" crossorigin="anonymous" type="module"></script><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KZFGTVN7');</script><link rel="stylesheet" href="https://cdn.jsdmirror.com/gh/dahisea/Re-GFork-web@main/css/main.css" media="screen" /><link rel="stylesheet" href="https://cdn.jsdmirror.com/gh/dahisea/Re-GFork-web@main/css/mater.css" /><script src="https://cdn.jsdmirror.com/gh/dahisea/w_file@main/assets/js/general-foot.js" crossorigin="anonymous"></script><link href="https://cdn.jsdmirror.com/gh/dahisea/Re-GFork-web@main/css/ads.css" rel="stylesheet"></head>`},
{raw: /<title>([\s\S]*?)<\/title>/i, re: `<title>GFork - 加速访问与脚本下载 - $1 | GreasyFork镜像站</title>`},
{raw: /<\/body>/i, re: `<footer><section class="text-content"><br><form class="language-selector" action="/" method="GET"><select class="language-selector-locale" id="locale-select" name="locale" aria-label="选择网站语言"><option value="" disabled selected>选择语言</option><option data-language-url="/zh-hans" value="zh-CN">简体字</option><option data-language-url="/zh-hant" value="zh-TW">繁體字</option><option data-language-url="/ja" value="ja">日本語</option><option data-language-url="/en" value="en">ＥＮＧ</option></select></form><br><p>ICP : 萌ICP備20213149号｜ICP SYSTEM:<a href="https://icp.gov.moe/?keyword=20213149" target="_blank">https://icp.gov.moe</a></p><p>ICP : 团ICP備25252525号｜ICP SYSTEM:<a href="https://icp.yuncheng.fun/id.php?keyword=25252525" target="_blank">https://icp.yuncheng.fun</a></p><p>備案番号：萌公网備 11010502030189 号</p><br><a href="/page/tos">用戶協議</a><p>序幕展開<span id="htmer_time"></span></p><div id="api-data">少女祈祷中...</div><br><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4095096984" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br></section></footer><br><ins class="adsbygoogle" style="display:block" data-ad-format="autorelaxed" data-ad-client="ca-pub-3758644447684310" data-ad-slot="3934604756"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br></body>`},
{raw: /<meta\s+name="description"\s+value="([^"]*)"\s*\/?>/i, re: `<meta name="description" content="GFORK专为用户解决访问慢、脚本下载难的问题（Mirrored官方の站） - $1">`},
{raw: /<li\b[^>]*\bclass\s*=\s*["'][^"']*ad-entry[^"']*["'][^>]*>[\s\S]*?<\/li>/gi, re: `<ins class="adsbygoogle" style="display:block" data-ad-format="fluid" data-ad-layout-key="-gy+2i+5x-ek+82" data-ad-client="ca-pub-3758644447684310" data-ad-slot="1394739154"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4095096984" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`},
{raw: /<div\b[^>]*\bid\s*=\s*["'][^"']*site-name-text[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, re: `<div id="site-name-text"><a href="/"><h1>Greasy Fork</h1></a></div>`},
{raw: /<section\s+id=["']home-step-[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, re: `<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4095096984" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br>`},
{raw: /href="https?:\/\/update\.greasyfork\.org([^"]*)"/g, re: (match, p1) => `href="https://yxd.dahi.edu.eu.org${p1}"`},
{raw: /https?:\/\/greasyfork\.org([^"]*)/gi, re: (match, p1) => `https://gfork.dahi.icu${p1}`},
{raw: /<a\s+href="http[^"]+"\s+rel="nofollow">/gi, re: `<a href="/404">`},
{raw: /<a\s+class="install-link"[^>]*href="([^"]+)"[^>]*>/gi, re: (match, href) => `<ins class="adsbygoogle" style="display:block" data-ad-format="fluid" data-ad-layout-key="-gy+2i+5x-ek+82" data-ad-client="ca-pub-3758644447684310" data-ad-slot="1394739154"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4095096984" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><a class="install-link" href="/redirect/to#${href}">`},
{raw: /<h2\b[^>]*\bclass\s*=\s*["'][^"']*super-title[^"']*["'][^>]*>[\s\S]*?<\/h2>/i, re: `<h1 class="super-title">GFork 加速访问镜像，轻松下载脚本 专为用户优化，解决访问慢、脚本下载难题</h1>`},
{raw: /(<div\s+id="script-language-filter"\s+class="list-option-group"[^>]*>[\s\S]*?<\/div>)/gi, re: `$1<ins class="adsbygoogle" style="display:inline-block;width:180px;height:600px" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4497590737"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br><br><ins class="adsbygoogle" style="display:inline-block;width:180px;height:600px" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4497590737"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4095096984" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><br><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3758644447684310" data-ad-slot="4095096984" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`},
{raw: /<body>/i, re: `<body><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KZFGTVN7" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`},
{raw: /<a\s+class="script-link"\s+href="([^"]*)">/gi, re: '<a class="script-link" href="$1" target="_blank">'},
{raw: /<span\s+class="sign-in-link">\s*<a\s+rel="nofollow"\s+href="[^"]*">/gi, re: '<span class="sign-in-link"><a rel="nofollow" href="/zh-hans/users/sign_in?return_to=/zh-hans/users/1442595" target="_blank">'},
{raw: /<li[^>]*data-script-id="(481396|39828)"[^>]*>[\s\S]*?<\/li>/gi,re: ''},
{raw: /<li[^>]*data-script-id="[^"]*"[^>]*>/gi, re: '<li>'},
{raw: /href="\/zh-CN\//g, re: 'href="/zh-hans/'},
{raw: /href="\/zh-TW\//g, re: 'href="/zh-hant/'},
{raw: /action="\/zh-CN\//g, re: 'action="/zh-hans/'},
{raw: /action="\/zh-TW\//g, re: 'action="/zh-hant/'},
{raw: /src="\/zh-CN\//g, re: 'src="/zh-hans/'},
{raw: /src="\/zh-TW\//g, re: 'src="/zh-hant/'},
{raw: /<a\s+[^>]*href="\/zh-hans\/users\/sign_up"[^>]*>[\s\S]*?<\/a>/gi, re: `<h1>登录功能仅在部分页面有效</h1>`},
{raw: /<html\s*[^>]*>/gi, re: '<html>'},
{raw: /(\s*\r?\n\s*)+/g, re: ''}
];
  res.forEach(({ raw, re }) => {
    content = content.replace(raw, re);
  });return content;}
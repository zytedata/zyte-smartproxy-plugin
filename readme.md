# Zyte SmartProxy Plugin
[![made-with-javascript](https://img.shields.io/badge/Made%20with-JavaScript-1f425f.svg)](https://www.javascript.com)
[![npm](https://img.shields.io/npm/v/zyte-smartproxy-puppeteer)](https://www.npmjs.com/package/zyte-smartproxy-plugin)

A plugin for [playwright-extra](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra) 
and [puppeteer-extra](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra) 
to provide [Smart Proxy Manager](https://www.zyte.com/smart-proxy-manager/) specific functionalities.

## QuickStart for playwright-extra
1. **Install Zyte SmartProxy Plugin**

```
npm install playwright playwright-extra zyte-smartproxy-plugin puppeteer-extra-plugin-stealth @cliqz/adblocker-playwright
```

2. **Create a file `sample.js` with following content and replace `<SPM_APIKEY>` with your SPM Apikey**

``` javascript
// playwright-extra is a drop-in replacement for playwright,
// it augments the installed playwright with plugin functionality
const { chromium } = require('playwright-extra')

// add zyte-smartproxy-plugin
const SmartProxyPlugin = require('zyte-smartproxy-plugin');
chromium.use(SmartProxyPlugin({spm_apikey: '<SPM_APIKEY>'}));

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

// create adblocker to block all ads (saves bandwidth)
const { PlaywrightBlocker } = require('@cliqz/adblocker-playwright');
const fetch = require('cross-fetch');

// playwright usage as normal
(async () => {
  const adBlocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ignoreHTTPSErrors: true});
  adBlocker.enableBlockingInPage(page);

  await page.goto('https://toscrape.com', {timeout: 180000});

  await page.screenshot({path: 'screenshot.png'})
  await browser.close();
})();
```

Make sure that you're able to make `https` requests using Smart Proxy Manager by following this guide [Fetching HTTPS pages with Zyte Smart Proxy Manager](https://docs.zyte.com/smart-proxy-manager/next-steps/fetching-https-pages-with-smart-proxy.html)

3. **Run `sample.js` using Node**

``` bash
node sample.js
```

## QuickStart for puppeteer-extra

1. **Install Zyte SmartProxy Plugin**

```
npm install puppeteer puppeteer-extra zyte-smartproxy-plugin puppeteer-extra-plugin-stealth puppeteer-extra-plugin-adblocker
```

2. **Create a file `sample.js` with following content and replace `<SPM_APIKEY>` with your SPM Apikey**

``` javascript
// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add zyte-smartproxy-plugin
const SmartProxyPlugin = require('zyte-smartproxy-plugin');
puppeteer.use(SmartProxyPlugin({spm_apikey: '<SPM_APIKEY>'}));

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// add adblocker plugin to block all ads (saves bandwidth)
const AdBlockerPlugin = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(AdBlockerPlugin({blockTrackers: true}));

// puppeteer usage as normal
(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage({ignoreHTTPSErrors: true});

  await page.goto('https://toscrape.com', {timeout: 180000});

  await page.screenshot({path: 'screenshot.png'})
  await browser.close();
})();
```

Make sure that you're able to make `https` requests using Smart Proxy Manager by following this guide [Fetching HTTPS pages with Zyte Smart Proxy Manager](https://docs.zyte.com/smart-proxy-manager/next-steps/fetching-https-pages-with-smart-proxy.html)

3. **Run `sample.js` using Node**

``` bash
node sample.js
```

## Zyte SmartProxy Plugin arguments

| Argument | Default Value | Description |
|----------|---------------|-------------|
| `spm_apikey` | `undefined` | Zyte Smart Proxy Manager API key that can be found on your zyte.com account. |
| `spm_host` | `http://proxy.zyte.com:8011` | Zyte Smart Proxy Manager proxy host. |
| `static_bypass` | `true` | When `true` Zyte SmartProxy Plugin will skip proxy use (saves proxy bandwidth) for static assets defined by `static_bypass_regex` or pass `false` to use proxy. |
| `static_bypass_regex` | `/.*?\.(?:txt\|json\|css\|less\|gif\|ico\|jpe?g\|svg\|png\|webp\|mkv\|mp4\|mpe?g\|webm\|eot\|ttf\|woff2?)$/` | Regex to use filtering URLs for `static_bypass`. |
| `headers` | `{'X-Crawlera-No-Bancheck': '1', 'X-Crawlera-Profile': 'pass', 'X-Crawlera-Cookies': 'disable'}` | List of headers to be appended to requests |

### Notes
Some websites may not work with AdBlocker or `static_bypass` enabled (default). Try to disable them if you encounter any issues.

When using the `headless: true` mode, values generated for some browser-specific headers are a bit different, which may be detected by websites. Try using ['X-Crawlera-Profile': 'desktop'](https://docs.zyte.com/smart-proxy-manager.html#x-crawlera-profile) in that case:
``` javascript
puppeteer.use(SmartProxyPlugin({spm_apikey: '<SPM_APIKEY>', headers: {'X-Crawlera-No-Bancheck': '1', 'X-Crawlera-Profile': 'desktop', 'X-Crawlera-Cookies': 'disable'}}));
```
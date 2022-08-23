const { PuppeteerExtraPlugin } = require('puppeteer-extra-plugin');
const fetch = require('cross-fetch');
const { version } = require('./package.json');

const defaultSPMHost = 'http://proxy.zyte.com:8011';
const defaultStaticBypassRegex = /.*?\.(?:txt|json|css|less|gif|ico|jpe?g|svg|png|webp|mkv|mp4|mpe?g|webm|eot|ttf|woff2?)$/;
const defaultHeaders = {
  'X-Crawlera-No-Bancheck': '1',
  'X-Crawlera-Profile': 'pass',
  'X-Crawlera-Cookies': 'disable'
};


class Plugin extends PuppeteerExtraPlugin {
  constructor(opts = {}) {
    super(opts)
  }

  get name() {
    return 'zyte-smartproxy-plugin';
  }

  async onPluginRegistered(args = {}) {
    this.framework = args.framework === 'playwright' ? 'playwright' : 'puppeteer';
    this.apikey = this.opts.spm_apikey;
    this.spmHost = this.opts.spm_host || defaultSPMHost;
    this.staticBypass = this.opts.static_bypass !== false;
    this.staticBypassRegex = this.opts.static_bypass_regex || defaultStaticBypassRegex;
    this.headers =  this.opts.headers || defaultHeaders;
    this.xCrawleraClient = `zyte-smartproxy-${this.framework}-extra/${version}`;
  }

  async beforeLaunch (options) {
    if (this.framework === 'playwright') {
      options.proxy = {
        server: this.spmHost,
        username: this.apikey,
        password: ''
      };
    } else {
      options.args.push(`--proxy-server=${this.spmHost}`);
    }

    // without this argument Chromium requests from embedded iframes are not intercepted in CDP session
    // https://bugs.chromium.org/p/chromium/issues/detail?id=924937#c10
    options.args.push(`--disable-site-isolation-trials`);
  }

  async onPageCreated(page) {
    if (this.framework === 'playwright') {
      const browserType = page.browser().browserType().name();
      if (browserType === 'chromium') { 
        await this._enableCDPInterception(page); 
      } else { 
        await this._enableRouteInterception(page); 
      }
    } else { 
      await this._enableCDPInterception(page);
    }
  }

  async _enableCDPInterception(page) {
    let cdpSession;
    if (this.framework === 'playwright') {
      cdpSession = await page.context().newCDPSession(page);
    } else {
      cdpSession = await page.target().createCDPSession();
    }

    await cdpSession.send('Fetch.enable', {
      patterns: [{requestStage: 'Request'}, {requestStage: 'Response'}],
      handleAuthRequests: true
    });

    cdpSession.on('Fetch.requestPaused', async (event) => {
      if (this._isResponse(event)) {
        this._verifyResponseSessionId(event.responseHeaders);
        await this._continueResponse(cdpSession, event, page);
      } else {
        if (this.staticBypass && this._isStaticContent(event)) {
          try {
            await this._bypassRequest(cdpSession, event, page);
          } catch(err) {
            await this._continueRequest(cdpSession, event, page);
          }
        } else {
          await this._continueRequest(cdpSession, event, page);
        }
      }
    });

    cdpSession.on('Fetch.authRequired', async (event) => {
      await this._respondToAuthChallenge(cdpSession, event, page);
    });
  }

  _isResponse(event) {
    return event.responseStatusCode || event.responseErrorReason;
  }

  _verifyResponseSessionId(responseHeaders) {
    if (responseHeaders) {
      for (const header of responseHeaders) {
        if (header.name === 'X-Crawlera-Error' && header.value === 'bad_session_id') {
          this.spmSessionId = undefined;
        }
      }
    }
  }

  async _continueResponse(cdpSession, event, page) {
    if (!page.isClosed()) {
      await cdpSession.send('Fetch.continueRequest', {requestId: event.requestId});
    }
  }

  _isStaticContent(event) {
    return event.request.method === 'GET' && this.staticBypassRegex.test(event.request.url)
  }

  async _bypassRequest(cdpSession, event, page) {
    const headers = event.request.headers;
    const response = await fetch(event.request.url, {headers})

    if (response.status == 200) {
      const response_body = (await response.buffer()).toString('base64');
      const response_headers = []
      for (const pair of response.headers.entries()) {
        if (pair[1] !== undefined) {
          response_headers.push({name: pair[0], value: pair[1] + ''});
        }
      }
        
      if (!page.isClosed()) {
        await cdpSession.send('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: response.status,
          responseHeaders: response_headers,
          body: response_body,
        });
      }
    } else {
      throw 'Proxy bypass failed';
    }
  }

  async _continueRequest(cdpSession, event, page) {
    function headersArray(headers) {
      const result = [];
      for (const name in headers) {
        if (headers[name] !== undefined) {
          result.push({name, value: headers[name] + ''});
        }
      }
    
      return result;
    };

    const headers = event.request.headers;
    if (this.spmSessionId === undefined) {
      this.spmSessionId = await this._createSPMSession();
    }

    headers['X-Crawlera-Session'] = this.spmSessionId;
    headers['X-Crawlera-Client'] = this.xCrawleraClient;
    const newHeaders = {...headers, ...this.headers}

    if (!page.isClosed()) {
      await cdpSession.send('Fetch.continueRequest', {
        requestId: event.requestId,
        headers: headersArray(newHeaders)
      });
    }
  }

  async _createSPMSession() {
    let sessionId = '';

    const url = this.spmHost + '/sessions';
    const auth = 'Basic ' + Buffer.from(this.apikey + ":").toString('base64');
    const headers = {
      'Authorization': auth,
      'X-Crawlera-Client': this.xCrawleraClient
    };

    const response = await fetch(url, {method: 'POST', headers: headers});

    if (response.ok) {
      sessionId = await response.text();
    }
    else {
      throw new Error(`Error creating SPM session. Response: ${response.status} ${response.statusText} ${await response.text()}`);
    }

    return sessionId;
  }


  async _respondToAuthChallenge(cdpSession, event, page) {
    const parameters = {requestId: event.requestId}

    if (this._isSPMAuthChallenge(event)) {
      parameters.authChallengeResponse = {
        response: 'ProvideCredentials',
        username: this.apikey,
        password: ''
      };
    } else {
      parameters.authChallengeResponse = {response: 'Default'};
    }
    
    if (!page.isClosed()) {
      await cdpSession.send('Fetch.continueWithAuth', parameters);
    }
  }

  _isSPMAuthChallenge(event) {
    return event.authChallenge.source === 'Proxy' && event.authChallenge.origin === this.spmHost
  }

  async _enableRouteInterception(page) {
    await page.route(_url => true, async (route, request) => {
      this.debug(`on_route - ${request.url()}`)
      if (this.staticBypass && this._routeIsStaticContent(request)) {
        try {
          await this._routeBypassRequest(route, request);
        } catch(err) {
          await this._routeContinueRequest(route, request);
        } 
      } else {
        await this._routeContinueRequest(route, request);
      }
    });

    page.on('response', async (response) => {
      this._routeVerifyResponseSessionId(response)
    });
  }

  _routeIsStaticContent(request) {
    return request.method() === 'GET' && this.staticBypassRegex.test(request.url());
  }

  async _routeBypassRequest(route, request) {
    const headers = {};
    for (const h of await request.headersArray()) {
      headers[h.name] = h.value;
    }

    const response = await fetch(request.url(), {headers});

    if (response.status == 200) {
      const headers = {};
      for (var pair of response.headers.entries()) {
        headers[pair[0]] = pair[1];
      }

      const response_body = await response.buffer();
        
      route.fulfill({
        status: response.status,
        contentType: response.headers.get('content-type'),
        headers: headers,
        body: response_body,
      });
    } else {
      throw 'Proxy bypass failed';
    }
  }

  async _routeContinueRequest(route, request) {
    const headers = {};
    for (const h of await request.headersArray()) {
      headers[h.name] = h.value
    }

    if (this.spmSessionId === undefined) {
      this.spmSessionId = await this._createSPMSession();
    }

    headers['X-Crawlera-Session'] = this.spmSessionId;
    headers['X-Crawlera-Client'] = this.xCrawleraClient;

    const newHeaders = {...headers, ...this.headers}

    route.continue({headers: newHeaders});
  }

  _routeVerifyResponseSessionId(response) {
    const headers = response.headers();
    if (headers['x-crawlera-error'] === 'bad_session_id') {
      this.spmSessionId = undefined;
    }
  }
}

module.exports = function(pluginConfig) {
  return new Plugin(pluginConfig);
}

(function () {
  'use strict';

  // --- Stable Scope Identification ---
  // ALWAYS use the folder path as the unique ID for the activity scope.
  // This ensures that ALL tabs (SLS frame, tool's new tab, SLS native button)
  // use the exact same localStorage keys for config and sync data.
  var getStablePath = function () {
    try {
      var p = window.location.pathname;
      var folder = p.substring(0, p.lastIndexOf('/')) || p;
      return folder;
    } catch (e) {
      return 'default_scope';
    }
  };

  var APP_SCOPE = getStablePath();
  var CONFIG_KEY = 'xapi_config::' + APP_SCOPE;

  var XAPIUtils = {
    parameters: null,

    getParameters: function () {
      if (this.parameters) return this.parameters;

      try {
        var urlParams = new URLSearchParams(window.location.search);
        var endpoint = urlParams.get('endpoint');
        var auth = urlParams.get('auth');
        var agentRaw = urlParams.get('agent');
        var stateId = urlParams.get('stateId');
        var activityId = urlParams.get('activityId');

        // Check if we have core parameters in URL
        if (endpoint && auth && endpoint !== 'null' && auth !== 'null') {
          var config = {
            endpoint: endpoint,
            auth: auth,
            agentRaw: agentRaw,
            stateId: stateId,
            activityId: activityId,
            t: Date.now()
          };
          // Persist to localStorage for SLS native "New Tab" support
          try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            console.log('[xAPI] Configuration persisted for scope:', APP_SCOPE);
          } catch (e) { }
        } else {
          // Fallback to localStorage if URL params are missing
          try {
            var cached = localStorage.getItem(CONFIG_KEY);
            if (cached) {
              var config = JSON.parse(cached);
              endpoint = endpoint || config.endpoint;
              auth = auth || config.auth;
              agentRaw = agentRaw || config.agentRaw;
              stateId = stateId || config.stateId;
              activityId = activityId || config.activityId;
              console.log('[xAPI] Configuration recovered for scope:', APP_SCOPE);
            }
          } catch (e) { }
        }

        // --- Resilience: Synthesize missing activityId or agent if absolutely necessary ---
        // If we still lack activityId but have endpoint, use the folder path as a fallback IRI
        if (!activityId && endpoint) {
          activityId = 'http://sls.native.fallback/' + APP_SCOPE.replace(/^\//, '');
          console.warn('[xAPI] Missing activityId. Using fallback:', activityId);
        }

        // Configure ADL.XAPIWrapper if we have valid endpoint and auth
        if (endpoint && auth && endpoint !== 'null' && auth !== 'null' && typeof window.ADL !== 'undefined' && window.ADL.XAPIWrapper) {
          var ep = endpoint;
          if (ep.charAt(ep.length - 1) !== '/') {
            ep += '/';
          }
          window.ADL.XAPIWrapper.changeConfig({
            endpoint: ep,
            auth: 'Basic ' + auth
          });
        }

        // Parse agent
        var agent = null;
        if (agentRaw && agentRaw !== 'null') {
          try {
            agent = JSON.parse(agentRaw);
          } catch (e) {
            console.warn('[xAPI] Invalid agent JSON:', e);
          }
        } else if (endpoint) {
          // Mock agent if missing but endpoint present (last resort for native new tab)
          agent = { "mbox": "mailto:student@sls.native.fallback", "name": "SLS Student (New Tab)" };
          console.warn('[xAPI] Missing agent. Using anonymous fallback.');
        }

        var params = { agent: agent, stateId: stateId || 'default_state', activityId: activityId, endpoint: endpoint, auth: auth };

        // Only cache if we actually found something useful
        if (endpoint && auth) {
          this.parameters = params;
        }
        return params;
      } catch (e) {
        console.warn('[xAPI] getParameters failed:', e);
        return null;
      }
    }
  };

  window.XAPIUtils = XAPIUtils;

  window.storeState = function (stateValue) {
    try {
      if (!window.ADL || !window.ADL.XAPIWrapper) {
        console.warn('[xAPI] ADL.XAPIWrapper not available');
        return;
      }
      var params = XAPIUtils.getParameters();

      // Detailed Guard Notification
      if (!params) {
        console.warn('[xAPI] storeState: No parameters available. Tracking locally only.');
        return;
      }

      var missing = [];
      if (!params.endpoint) missing.push('endpoint');
      if (!params.auth) missing.push('auth');
      if (!params.activityId) missing.push('activityId');
      if (!params.agent) missing.push('agent');

      if (missing.length > 0) {
        console.warn('[xAPI] storeState: Cannot send to SLS server. Missing: ' + missing.join(', '));
        return;
      }

      window.ADL.XAPIWrapper.sendState(params.activityId, params.agent, params.stateId, null, stateValue);
      console.log('[xAPI] Submitted to SLS:', stateValue);
    } catch (err) {
      console.error('[xAPI] storeState error (handled):', err);
    }
  };

  window.getState = function () {
    try {
      if (!window.ADL || !window.ADL.XAPIWrapper) return null;
      var params = XAPIUtils.getParameters();
      if (!params || !params.activityId || !params.agent || !params.endpoint) return null;

      var result = window.ADL.XAPIWrapper.getState(params.activityId, params.agent, params.stateId);
      console.log('[xAPI] Retrieved state:', result);
      return result;
    } catch (err) {
      console.error('[xAPI] getState error (handled):', err);
      return null;
    }
  };

  window.updateStore = function () {
    try {
      var sInput = document.getElementById("score-input");
      var fInput = document.getElementById("feedback-input");
      if (sInput || fInput) {
        window.storeState({
          score: sInput ? sInput.value : 0,
          feedback: fInput ? fInput.value : ""
        });
      }
    } catch (e) { }
  };

  // Initial parse on load
  XAPIUtils.getParameters();
})();

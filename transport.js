(function () {
  'use strict';
  const KEY = 'omt-delivery-v1';
  function randomToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  }
  function jsonp(endpoint, params, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const callback = '__omt_' + randomToken().slice(0, 20);
      const script = document.createElement('script');
      const url = new URL(endpoint);
      Object.entries({ ...params, callback }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
      let timer;
      const cleanup = () => { clearTimeout(timer); script.remove(); delete window[callback]; };
      window[callback] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('network')); };
      timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeout);
      script.src = url.href; document.head.append(script);
    });
  }
  class Delivery {
    constructor(config, getState, onStatus) {
      this.key = config.storageKey || KEY;
      this.config = config; this.getState = getState; this.onStatus = onStatus; this.busy = false;
      try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; } catch { this.data = {}; }
      this.data.token ||= randomToken(); this.data.rev ||= 0; this.data.cursor ||= 0;
      this.save();
    }
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* Keep in-memory queue. */ } }
    enabled() { return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(this.config.endpoint); }
    async ready() {
      if (!this.enabled()) return false;
      const answer = await jsonp(this.config.endpoint, { action: 'health', study: this.config.studyId });
      return answer.ready === true;
    }
    packet() {
      if (this.data.pending) return this.data.pending;
      const state = this.getState(); if (!state) return null;
      if (this.data.sessionId !== state.id) {
        this.data.sessionId = state.id; this.data.token = randomToken(); this.data.rev = 0; this.data.cursor = 0;
      }
      const events = state.events.filter(e => e.seq > this.data.cursor).slice(0, 100);
      const packet = { study: this.config.studyId, receipt: this.data.token, revision: ++this.data.rev,
        session: MineGame.snapshot(state), events };
      this.data.pending = packet; this.save(); return packet;
    }
    async flush() {
      if (this.busy || !this.enabled() || !this.getState()) return;
      this.busy = true; this.onStatus('sending');
      const packet = this.packet();
      try {
        // A simple POST avoids a CORS preflight. Its opaque response is NOT treated as success.
        // Success is confirmed separately by a read-only receipt endpoint.
        await fetch(this.config.endpoint, { method: 'POST', mode: 'no-cors', credentials: 'omit',
          body: new URLSearchParams({ payload: JSON.stringify(packet) }) });
        let acknowledged = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const answer = await jsonp(this.config.endpoint, { action: 'ack', receipt: packet.receipt });
          if (Number(answer.revision) >= packet.revision) { acknowledged = true; break; }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        if (!acknowledged) throw new Error('receipt not confirmed');
        this.data.cursor = Math.max(this.data.cursor, ...packet.events.map(e => e.seq));
        this.data.pending = null; this.save();
        const state = this.getState();
        this.onStatus(state.events.length > this.data.cursor ? 'pending' : 'saved');
      } catch { this.onStatus('pending'); }
      finally { this.busy = false; }
      const state = this.getState();
      if (!this.data.pending && state && state.events.length > this.data.cursor) setTimeout(() => this.flush(), 100);
    }
    beacon() {
      if (!this.enabled() || !this.getState() || this.busy) return;
      const packet = this.packet();
      if (navigator.sendBeacon) navigator.sendBeacon(this.config.endpoint, new URLSearchParams({ payload: JSON.stringify(packet) }));
      // Leave the packet queued until a receipt is confirmed on the next visit.
    }
  }
  window.MineDelivery = Delivery;
})();

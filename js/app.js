(function (root) {
  'use strict';
  const shellRelease = (() => { try { return new URL(document.currentScript.src).searchParams.get('v'); } catch (_) { return null; } })();
  const App = {
    initialRoute(search = root.location?.search || '') {
      try {
        const params = new URLSearchParams(search);
        return { mode: params.get('mode'), questionId: params.get('question') };
      } catch (_) { return {}; }
    },
    newerRelease(release) {
      const current=shellRelease?.match(/^(\d{8})-(\d+)$/),offered=release?.match(/^(\d{8})-(\d+)$/);
      return Boolean(current&&offered&&Number.isSafeInteger(Number(offered[2]))&&
        (offered[1]>current[1]||(offered[1]===current[1]&&Number(offered[2])>Number(current[2]))));
    },
    storageClients(worker, allowOtherRelease=false, timeoutMs=5000) {
      return new Promise((resolve,reject) => {
        if (!worker || worker.state==='redundant') { reject(new Error('storage-client-worker')); return; }
        const channel=new MessageChannel();
        const finish=(error,value) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); error?reject(error):resolve(value); };
        const timer=setTimeout(()=>finish(new Error('storage-client-timeout')),timeoutMs);
        channel.port1.onmessage=event => {
          const value=event.data;
          if (worker.state==='redundant' || value?.protocol!==1 || typeof value.release!=='string' || (!allowOtherRelease&&value.release!==shellRelease) || typeof value.requester!=='string' ||
              !Array.isArray(value.clients) || !value.clients.every(id=>typeof id==='string'&&id.length>0) ||
              new Set(value.clients).size!==value.clients.length || !value.clients.includes(value.requester)) {
            finish(new Error('storage-client-proof')); return;
          }
          finish(null,value);
        };
        try { worker.postMessage({type:'BOKI_STORAGE_CLIENTS'},[channel.port2]); }
        catch (error) { finish(error); }
      });
    },
    async waitForStorageClients(notice) {
      const manager=root.navigator?.serviceWorker;
      if (!manager?.getRegistration || !manager.register) throw new Error('storage-client-unavailable');
      const pause=()=>new Promise(resolve=>setTimeout(resolve,250));
      const open=()=>!this.storageOwnership.closed;
      const waitState=async (worker,states) => {
        for(let attempt=0;attempt<120&&open();attempt++) {
          if(states.includes(worker?.state))return;
          if(!worker||worker.state==='redundant')break;
          await pause();
        }
        throw new Error('storage-worker-state');
      };
      const now=()=>root.performance?.now?.()??Date.now();
      const checkedProof=async (registration,worker,timeoutMs=5000) => {
        const wasActive=registration.active===worker,controller=manager.controller;
        const proof=await this.storageClients(worker,false,timeoutMs);
        if(!open()||worker.state==='redundant')throw new Error('storage-client-closed');
        const isActive=wasActive&&registration.active===worker&&manager.controller===controller;
        const isCurrent=isActive&&controller===worker;
        const own=proof.activation;
        // Firefox without the own-worker API uses the normal activated path.
        // Missing/malformed proof never means unsupported. WebKit can retain an
        // activating page wrapper after activation: only the same active worker
        // itself may attest completion, after enumerating all origin clients.
        const ownActivated=own?.state==='activated'&&own.active===true;
        const activated=(worker.state==='activated'&&isActive&&(controller===null||controller===worker)&&(own===null||ownActivated))||
          (worker.state==='activating'&&isCurrent&&ownActivated);
        return {worker,proof,activated};
      };
      const waitActivated=async (registration,worker) => {
        const deadline=now()+30000;
        for(let attempt=0;attempt<120&&open();attempt++) {
          const remaining=deadline-now();if(remaining<=0)break;
          const result=await checkedProof(registration,worker,Math.min(5000,remaining));
          if(result.activated)return result;
          const rest=deadline-now();if(rest<=0)break;
          await new Promise(resolve=>setTimeout(resolve,Math.min(250,rest)));
        }
        throw new Error('storage-worker-state');
      };
      this.storageClientStatus='checking';
      const rejected=new Set();
      const matchingWorker=async registration => {
        for(const worker of [registration?.active,registration?.waiting,registration?.installing]) {
          if(!worker||rejected.has(worker))continue;
          try {
            await waitState(worker,['installed','activating','activated']);
            return await checkedProof(registration,worker);
          } catch (_) { rejected.add(worker); }
        }
        return null;
      };
      let registration=await manager.getRegistration(),match=await matchingWorker(registration);
      if(!match) {
        registration=await manager.register('./service-worker.js',{updateViaCache:'none'});
        if(!registration.installing)await registration.update();
        match=await matchingWorker(registration);
        if(!match)throw new Error('storage-worker-release');
      }
      while(open()) {
        const {worker,proof,activated}=match;
        if(proof.clients.length!==1) {
          this.storageClientStatus='waiting';
          notice('以前の画面が残っています。このサイトのほかのタブを閉じてください。保存データを引き継いで開始します。');
          await pause();match=await checkedProof(registration,worker);continue;
        }
        if(!activated) {
          // Only this not-yet-started document remains. Activate the new shell
          // before loading saves, then recheck clients after activation/claim.
          if(worker.state==='installed')worker.postMessage({type:'SKIP_WAITING'});
          await waitActivated(registration,worker);
          // Never reuse a client list captured before activation/claim.
          match=await checkedProof(registration,worker);continue;
        }
        this.storageClientStatus='ready';return;
      }
      throw new Error('storage-client-closed');
    },
    init() {
      if (this.ready) return this.ready;
      const ownership = this.storageOwnership = { active:false, closed:false };
      const warning = document.getElementById('storage-warning');
      const originalWarning = warning?.textContent;
      const notice = text => { if (warning) { warning.textContent=text; warning.hidden=false; } };
      let finish, release;
      this.ready = new Promise(resolve => { finish=resolve; });
      const lifetime = new Promise(resolve => { release=resolve; });
      // Hold one origin-wide writer for the document lifetime, including startup
      // recovery. A second tab must not mistake a live journal for a crashed one.
      root.addEventListener('pagehide', () => {
        ownership.active=false; ownership.closed=true;
        this.controller?.stopExamTimer?.(); release(); finish(false);
      });
      root.addEventListener('pageshow', event => { if (event.persisted) root.location.reload(); });
      const unavailable = () => {
        ownership.active=false;
        notice('保存データを安全に確認できません。このサイトのほかのタブを閉じ、オンラインで開き直してください。対応するブラウザとHTTPSの学習ページが必要です。');
        finish(false);
      };
      if (!root.navigator?.locks?.request) { unavailable(); return this.ready; }
      notice('別のタブで学習中の場合は、そのタブを閉じてください。保存データを引き継いで開始します。');
      try {
        this.storageLock = root.navigator.locks.request('boki-rpg-saved-learning', {mode:'exclusive'}, async () => {
          if (ownership.closed) return;
          await this.waitForStorageClients(notice);
          if (ownership.closed) return;
          this.storageMigrationSnapshot=root.AppController.captureStorageNamespace();
          if(this.storageMigrationSnapshot.kind==='legacy')await this.waitForStorageClients(notice);
          if (ownership.closed) return;
          ownership.active=true;
          if (warning) { warning.textContent=originalWarning; warning.hidden=true; }
          try { this.start(); finish(true); await lifetime; }
          finally { ownership.active=false; }
        }).catch(unavailable);
      } catch (_) { unavailable(); }
      return this.ready;
    },
    start() {
      const requested=(()=>{try{return new URLSearchParams(root.location?.search||'').get('year');}catch(_){return null;}})();
      const curriculum = root.CurriculumRegistry?.active(requested==='FY2027'?'FY2027':'FY2026')||root.CurriculumRegistry?.active('FY2026');
      if (!curriculum) throw new Error('Approved curriculum unavailable');
      this.controller = new root.AppController(document, curriculum.questions, curriculum.examPool, curriculum.year); this.controller.init(this.initialRoute());
      this.setupInstallPrompt();
      if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(registration => {
        let updateAccepted = false;
        const offerUpdate = worker => {
          if (!worker || !navigator.serviceWorker.controller) return;
          this.storageClients(worker,true).then(proof => {
            if(!this.newerRelease(proof.release))return;
            this.showToast('新しいバージョンが利用可能です。', '更新', () => {
              if(worker.state!=='installed')return;
              updateAccepted = true; worker.postMessage({ type:'SKIP_WAITING' });
            });
          }).catch(()=>{});
        };
        offerUpdate(registration.waiting); registration.addEventListener('updatefound', () => {
          const worker=registration.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(worker); });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAccepted) root.location.reload(); });
      }).catch(() => {
        if (!this.storageOwnership.closed) this.showToast('オフライン利用の準備ができませんでした。オンラインで学習を続け、後でページを開き直してください。');
      });
    },
    setupInstallPrompt() {
      const button = document.getElementById('install-app'); let promptEvent = null;
      const standalone = () => root.matchMedia?.('(display-mode: standalone)').matches || root.navigator?.standalone === true;
      if (button) button.hidden = true;
      root.addEventListener('beforeinstallprompt', event => { event.preventDefault(); if (standalone()) return; promptEvent = event; if (button) button.hidden = false; });
      button?.addEventListener('click', async () => { if (!promptEvent) return; await promptEvent.prompt(); promptEvent = null; button.hidden = true; });
      root.addEventListener('appinstalled', () => { promptEvent = null; if (button) button.hidden = true; this.showToast('アプリをインストールしました。'); });
    },
    showToast(message, actionLabel, action) {
      const toast = document.getElementById('app-toast'), button = document.getElementById('app-toast-action'); document.getElementById('app-toast-message').textContent = message;
      button.hidden = !actionLabel; button.textContent = actionLabel || ''; button.onclick = action || null; toast.hidden = false;
    },
    calculateExpression(expression) { return root.SafeCalculator.evaluate(expression); }
  };
  root.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
}(window));

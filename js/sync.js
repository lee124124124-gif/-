// 여러 PC/브라우저 간 실시간 동기화. Firebase Realtime Database에 "작업 코드"(workspace code)
// 단위로 전체 데이터를 저장/구독한다. 로그인 없이 코드만 아는 기기끼리 공유하는 방식이라
// 완전한 보안은 아니지만(코드를 아는 사람은 누구나 접근 가능), 수업 시간표 정도의 민감하지
// 않은 데이터에는 충분하다고 보고 이렇게 구현했다.
const SyncUI = (() => {
  const WORKSPACE_KEY = 'classSwapApp.workspaceCode';
  const firebaseConfig = {
    apiKey: "AIzaSyACVRIhkAWhGdsfzt3yVoqTdv1berWVlHA",
    authDomain: "class-change.firebaseapp.com",
    databaseURL: "https://class-change-default-rtdb.firebaseio.com",
    projectId: "class-change",
    storageBucket: "class-change.firebasestorage.app",
    messagingSenderId: "920854840948",
    appId: "1:920854840948:web:530725b082cd49c6e0f321"
  };

  let db = null;
  let code = null;
  let ref = null;
  let applyingRemote = false; // 방금 서버에서 받은 데이터를 다시 서버로 밀어올리는 것을 막는 가드
  let pushTimer = null;

  function genCode() {
    // 헷갈리는 문자(0/O, 1/I)는 빼고, 사람이 손으로 옮겨 적기 쉬운 8자리 코드를 만든다.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s.slice(0, 4) + '-' + s.slice(4);
  }

  function ensureFirebase() {
    if (db) return db;
    const app = (firebase.apps && firebase.apps.length) ? firebase.apps[0] : firebase.initializeApp(firebaseConfig);
    db = firebase.database(app);
    return db;
  }

  function updateButton() {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    btn.textContent = code ? `🔗 동기화됨 (${code})` : '🔌 동기화';
  }

  function rerenderIfIdle() {
    if (ModalUI.isOpen()) return; // 사용자가 뭔가 입력 중일 수 있으니 모달이 열려있으면 화면을 건드리지 않는다
    TimetableUI.renderBase();
    TimetableUI.renderDaily();
    const logsPanel = document.getElementById('panel-logs');
    if (logsPanel && logsPanel.classList.contains('active')) SwapLog.renderList();
  }

  function detach() {
    if (ref) ref.off();
    ref = null;
    code = null;
    updateButton();
  }

  function attach(newCode, onFirstValue) {
    detach();
    code = newCode;
    localStorage.setItem(WORKSPACE_KEY, code);
    ensureFirebase();
    ref = db.ref('workspaces/' + encodeURIComponent(code));
    let first = true;
    ref.on('value', snap => {
      const remote = snap.val();
      if (first) {
        first = false;
        if (onFirstValue) onFirstValue(remote);
      }
      if (!remote) return;
      applyingRemote = true;
      Store.applyRemoteState(remote);
      rerenderIfIdle();
      applyingRemote = false;
    }, err => {
      console.error('동기화 연결 오류', err);
    });
    updateButton();
  }

  function pushNow() {
    if (!ref || applyingRemote) return;
    ref.set(Store.get());
  }

  function schedulePush() {
    if (!ref || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 400);
  }

  function createNew() {
    const newCode = genCode();
    attach(newCode);
    pushNow();
    return newCode;
  }

  function connectExisting(existingCode) {
    attach(existingCode.trim(), (remote) => {
      if (!remote) {
        alert('그 코드로 저장된 데이터를 찾을 수 없습니다. 코드를 다시 확인해주세요.');
        detach();
        localStorage.removeItem(WORKSPACE_KEY);
      }
    });
  }

  function disconnect() {
    if (!confirm('동기화를 끊을까요?\n\n이 기기에 있는 데이터는 그대로 남지만, 앞으로는 다른 기기와 자동으로 공유되지 않습니다.')) return;
    localStorage.removeItem(WORKSPACE_KEY);
    detach();
  }

  function openModal() {
    const html = code ? `
      <div class="modal-header"><h3>🔗 여러 기기 동기화</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="sheet-current">현재 작업 코드: <strong>${code}</strong></p>
        <p class="sheet-hint">이 코드를 다른 기기의 "🔌 동기화"에서 입력하면, 그 기기도 지금부터 이 기기와 실시간으로 같은
        시간표·교체 기록을 함께 봅니다. 코드는 비밀번호처럼 잘 보관하세요(코드를 아는 사람은 누구나 접근할 수 있습니다).</p>
        <button class="btn btn-danger btn-block" id="btn-sync-disconnect">동기화 끊기</button>
      </div>
    ` : `
      <div class="modal-header"><h3>🔗 여러 기기 동기화</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="sheet-hint">동기화를 켜면 이 기기의 데이터가 온라인에 올라가고, 같은 코드를 입력한 다른 기기와
        실시간으로 자동 공유됩니다.</p>
        <button class="btn btn-primary btn-block" id="btn-sync-new">새 작업 코드 만들고 이 기기 데이터로 시작</button>
        <label style="margin-top:14px;display:block;">다른 기기에서 만든 코드 입력
          <input type="text" id="f-sync-code" placeholder="예: AB3D-4KXZ">
        </label>
        <button class="btn btn-block" id="btn-sync-join" style="margin-top:6px;">그 코드로 연결</button>
        <p class="sheet-hint">⚠ 기존 코드로 연결하면 이 기기에 있던 데이터는 그 코드에 저장된 내용으로 대체됩니다.</p>
      </div>
    `;
    ModalUI.open(html);
    if (code) {
      document.getElementById('btn-sync-disconnect').addEventListener('click', () => { disconnect(); ModalUI.close(); });
    } else {
      document.getElementById('btn-sync-new').addEventListener('click', () => {
        const c = createNew();
        ModalUI.close();
        alert(`새 작업 코드: ${c}\n\n다른 PC에서 이 코드를 입력하면 지금 이 기기의 시간표·교체 기록을 그대로 이어서 볼 수 있습니다. 코드를 꼭 메모해두세요.`);
      });
      document.getElementById('btn-sync-join').addEventListener('click', () => {
        const c = document.getElementById('f-sync-code').value.trim();
        if (!c) return;
        if (!confirm('연결하면 이 기기에 있던 기존 데이터는 그 코드에 저장된 데이터로 완전히 대체됩니다. 계속할까요?')) return;
        connectExisting(c);
        ModalUI.close();
      });
    }
  }

  function init() {
    Store.onChange(() => { if (!applyingRemote) schedulePush(); });
    const saved = localStorage.getItem(WORKSPACE_KEY);
    if (saved) attach(saved);
  }

  return { init, openModal };
})();

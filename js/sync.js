// 여러 PC/브라우저 간 실시간 동기화. Firebase Realtime Database에 "작업 코드"(workspace code)
// 단위로 전체 데이터를 저장/구독한다.
//
// 기본 동작: 아무 설정 없이 사이트에 접속하기만 하면 공용 작업공간(DEFAULT_WORKSPACE)에 자동으로
// 연결되어, 접속하는 모든 기기가 같은 시간표를 실시간으로 함께 본다. 코드 입력·버튼 클릭이 필요 없다.
// 대신 이 사이트 주소를 아는 사람은 누구나 같은 데이터를 보고 수정할 수 있다(사용자가 이 방식을
// 명시적으로 선택함 — 로그인 없이 "어느 PC에서 열어도 그대로"를 만들려면 이 방법뿐이다).
const SyncUI = (() => {
  const WORKSPACE_KEY = 'classSwapApp.workspaceCode';
  const DISABLED_KEY = 'classSwapApp.syncDisabled';
  const BACKUP_KEY = 'classSwapApp.localBackup';
  // 코드 입력 없이 모든 기기가 자동으로 만나는 공용 작업공간 경로
  const DEFAULT_WORKSPACE = 'ljh-class-swap-main';
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
    if (!code) btn.textContent = '🔌 동기화 꺼짐';
    else if (code === DEFAULT_WORKSPACE) btn.textContent = '🔗 자동 동기화 중';
    else btn.textContent = `🔗 동기화됨 (${code})`;
  }

  // 원격 데이터를 이 기기에 처음 덮어쓰기 직전에, 이 기기에 있던 내용을 한 번 백업해 둔다.
  // 자동 연결 방식에서는 사용자가 모르는 사이 로컬 데이터가 공용 데이터로 대체될 수 있으므로
  // 최소한의 안전장치를 둔다.
  function backupLocalOnce() {
    if (localStorage.getItem(BACKUP_KEY)) return;
    try {
      const cur = Store.exportState();
      if (JSON.parse(cur).classes.length) localStorage.setItem(BACKUP_KEY, cur);
    } catch (e) { /* 백업 실패가 동기화를 막지는 않도록 무시 */ }
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
        // 공용 작업공간이 아직 비어 있고 이 기기에는 시간표가 있다면, 이 기기 내용으로 채운다.
        // (빈 기기가 먼저 접속해 빈 데이터를 올려서 다른 기기 내용을 지우는 일을 막기 위해,
        //  데이터가 있는 기기만 시드로 올린다.)
        if (!remote && Store.getClasses().length > 0) { pushNow(); return; }
      }
      if (!remote) return;
      backupLocalOnce();
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
    if (!confirm('동기화를 끊을까요?\n\n이 기기에 있는 데이터는 그대로 남지만, 앞으로는 다른 기기와 자동으로 공유되지 않습니다.\n(이 기기에서만 꺼지며, 다시 켤 수 있습니다.)')) return;
    localStorage.removeItem(WORKSPACE_KEY);
    localStorage.setItem(DISABLED_KEY, '1');
    detach();
  }

  function reconnectDefault() {
    localStorage.removeItem(DISABLED_KEY);
    attach(DEFAULT_WORKSPACE);
  }

  function openModal() {
    const html = code ? `
      <div class="modal-header"><h3>🔗 여러 기기 동기화</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        ${code === DEFAULT_WORKSPACE ? `
          <p class="sheet-current"><strong>자동 동기화가 켜져 있습니다.</strong></p>
          <p class="sheet-hint">이 사이트에 접속하는 모든 기기가 코드 입력 없이 자동으로 같은 시간표·교체 기록을
          함께 봅니다. 어느 PC에서 수정하든 다른 PC 화면에도 바로 반영됩니다.<br><br>
          ⚠ 이 사이트 주소를 아는 사람은 누구나 같은 내용을 보고 수정할 수 있으니, 주소 공유에 주의하세요.</p>
        ` : `
          <p class="sheet-current">현재 작업 코드: <strong>${code}</strong></p>
          <p class="sheet-hint">이 코드를 입력한 기기끼리만 실시간으로 같은 내용을 함께 봅니다.</p>
        `}
        <button class="btn btn-danger btn-block" id="btn-sync-disconnect">이 기기에서 동기화 끄기</button>
      </div>
    ` : `
      <div class="modal-header"><h3>🔗 여러 기기 동기화</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="sheet-hint">현재 이 기기는 동기화가 꺼져 있어 데이터가 이 기기에만 저장됩니다.</p>
        <button class="btn btn-primary btn-block" id="btn-sync-default">자동 동기화 다시 켜기</button>
        <p class="sheet-hint" style="margin-top:14px;">또는 특정 기기끼리만 공유하는 별도 코드를 쓸 수도 있습니다.</p>
        <button class="btn btn-block" id="btn-sync-new">새 작업 코드 만들고 이 기기 데이터로 시작</button>
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
      document.getElementById('btn-sync-default').addEventListener('click', () => { reconnectDefault(); ModalUI.close(); });
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
    if (localStorage.getItem(DISABLED_KEY)) { updateButton(); return; } // 사용자가 이 기기에서 끈 경우
    // 저장된 코드가 없으면 공용 작업공간에 자동으로 연결한다 → 어느 PC에서 열어도 같은 화면.
    attach(localStorage.getItem(WORKSPACE_KEY) || DEFAULT_WORKSPACE);
  }

  return { init, openModal };
})();

const AppUI = (() => {
  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
    if (tab === 'logs') SwapLog.renderList();
    if (tab === 'base') TimetableUI.renderBase();
    if (tab === 'daily') TimetableUI.renderDaily();
  }

  function openSettingsModal() {
    const state = Store.get();
    const html = `
      <div class="modal-header"><h3>시간표 설정</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <label>교시 수<input type="number" id="f-period-count" min="1" max="12" value="${state.settings.periodCount}"></label>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" id="btn-save-settings">저장</button></div>
    `;
    ModalUI.open(html);
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      const n = Number(document.getElementById('f-period-count').value) || 7;
      Store.setPeriodCount(Math.min(12, Math.max(1, n)));
      ModalUI.close();
      TimetableUI.renderBase();
      TimetableUI.renderDaily();
    });
  }

  function init() {
    ModalUI.init();
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-new-log').addEventListener('click', () => {
      const log = SwapLog.createBlank();
      SwapLog.openDetail(log.id);
    });
    document.getElementById('btn-export').addEventListener('click', () => {
      const json = Store.exportState();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `수업교체앱_백업_${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('f-import-file').click();
    });
    document.getElementById('f-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!confirm('백업 파일을 불러오면 이 기기에 저장된 현재 데이터가 모두 파일 내용으로 덮어써집니다. 계속할까요?')) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importState(reader.result);
          TimetableUI.renderBase();
          TimetableUI.renderDaily();
          SwapLog.renderList();
          alert('백업 파일을 불러왔습니다.');
        } catch (err) {
          alert(err.message || '파일을 불러오지 못했습니다.');
        }
      };
      reader.readAsText(file);
    });
    document.getElementById('btn-reset-semester').addEventListener('click', () => {
      if (!confirm('학기말 초기화를 진행할까요?\n\n모든 학급의 기본 시간표(과목·담당 선생님)와 "수업 교체" 기록이 모두 삭제되어 빈 시간표로 돌아갑니다(학급 자체는 남아있습니다).\n이미 작성된 수업 교체일지 문서는 삭제되지 않습니다.')) return;
      Store.resetSemester();
      TimetableUI.renderBase();
      TimetableUI.renderDaily();
      alert('시간표가 초기화되었습니다.');
    });
    TimetableUI.renderBase();
  }

  return { switchTab, init };
})();

document.addEventListener('DOMContentLoaded', AppUI.init);

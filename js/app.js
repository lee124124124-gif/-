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
    document.getElementById('btn-reset-semester').addEventListener('click', () => {
      if (!confirm('학기말 초기화를 진행할까요?\n\n모든 학급의 "수업 교체" 기록이 삭제되고 기본 시간표(과목·담당 선생님)는 그대로 유지됩니다.\n이미 작성된 수업 교체일지 문서는 삭제되지 않습니다.')) return;
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

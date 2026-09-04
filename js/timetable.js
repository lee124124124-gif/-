const TimetableUI = (() => {
  let viewDate = todayStr();

  function getViewDate() {
    return viewDate;
  }

  // ---- 기본 시간표 (요일별 반복, 날짜와 무관) ----

  function renderBase() {
    renderClassBar('class-bar-base', renderBase);

    const classId = Store.getActiveClassId();
    const container = document.getElementById('base-timetable-container');
    if (!classId) {
      container.innerHTML = '<p class="empty-hint">먼저 학급을 추가해주세요. 위의 "+ 학급 추가" 버튼을 눌러주세요.</p>';
      return;
    }

    const state = Store.get();
    const periodCount = state.settings.periodCount;

    let html = '<table class="timetable"><thead><tr><th class="th-period">교시</th>';
    DAY_NAMES.forEach(d => { html += `<th>${d}</th>`; });
    html += '</tr></thead><tbody>';

    for (let p = 1; p <= periodCount; p++) {
      html += `<tr><td class="th-period">${p}</td>`;
      for (let d = 0; d < DAY_NAMES.length; d++) {
        html += renderBaseCell(classId, d, p);
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.cell').forEach(el => {
      el.addEventListener('click', () => {
        const day = Number(el.dataset.day);
        const period = Number(el.dataset.period);
        SwapUI.onBaseCellClick(classId, day, period);
      });
    });
  }

  function renderBaseCell(classId, dayIdx, period) {
    const base = Store.getBaseCell(classId, dayIdx, period);
    if (!base) {
      return `<td class="cell cell-empty" data-day="${dayIdx}" data-period="${period}">
        <span class="cell-add">+ 과목 추가</span>
      </td>`;
    }
    return `<td class="cell cell-filled" data-day="${dayIdx}" data-period="${period}">
      <div class="cell-subject">${escapeHtml(base.subject)}</div>
      <div class="cell-teacher">${escapeHtml(base.teacher)}</div>
    </td>`;
  }

  // ---- 수업 확인 (보기 날짜에 해당하는 요일의 수업만) ----

  function renderDaily() {
    renderClassBar('class-bar-daily', renderDaily);
    renderDateBar();

    const classId = Store.getActiveClassId();
    const container = document.getElementById('daily-list-container');
    if (!classId) {
      container.innerHTML = '<p class="empty-hint">먼저 "기본 시간표" 탭에서 학급을 추가해주세요.</p>';
      return;
    }

    const dayIdx = dateToWeekdayIndex(viewDate);
    if (dayIdx < 0) {
      container.innerHTML = '<p class="empty-hint">주말은 시간표가 없습니다. 평일 날짜를 선택해주세요.</p>';
      return;
    }

    const state = Store.get();
    const periodCount = state.settings.periodCount;

    let html = '<div class="daily-list">';
    for (let p = 1; p <= periodCount; p++) {
      html += renderDailyRow(classId, dayIdx, p, viewDate);
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.daily-row.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const period = Number(el.dataset.period);
        SwapUI.onDailyCellClick(classId, dayIdx, period, viewDate);
      });
    });
  }

  function renderDailyRow(classId, dayIdx, period, date) {
    const base = Store.getBaseCell(classId, dayIdx, period);
    const swap = Store.getSwap(classId, dayIdx, period, date);
    const periodLabel = `<div class="daily-period">${period}교시</div>`;

    if (!base && !swap) {
      return `<div class="daily-row">${periodLabel}<div class="daily-content daily-empty">— (과목 없음)</div></div>`;
    }

    if (swap && swap.type === 'makeup') {
      const displacedLine = base
        ? `<div class="daily-before">${escapeHtml(base.subject)} · ${escapeHtml(base.teacher)}</div>`
        : '';
      return `<div class="daily-row daily-makeup clickable" data-period="${period}">
        ${periodLabel}
        <div class="daily-content">
          ${displacedLine}
          <div class="daily-badge">📘 ${DAY_NAMES[swap.sourceDay]}요일 ${swap.sourcePeriod}교시(${escapeHtml(formatShortDate(swap.sourceDate))}) 결강 보강</div>
          <div class="daily-subject">${escapeHtml(swap.subject)} · ${escapeHtml(swap.teacher)} (보강)</div>
        </div>
      </div>`;
    }

    if (swap) {
      const typeIcon = swap.type === 'exchange' ? '🔀' : '🔁';
      const makeupNote = (swap.type === 'substitute' && swap.makeup && swap.makeup.date)
        ? `<div class="daily-makeup-note">📘 보강 ${escapeHtml(formatShortDate(swap.makeup.date))}</div>` : '';
      const chain = Store.getSwapChain(classId, dayIdx, period, date);
      const chainCount = swap.type === 'substitute' ? chain.length : 1;
      const chainNote = chainCount > 1 ? `<div class="daily-chain-note">이 날짜에 ${chainCount}번 교체됨</div>` : '';
      const before = base || (chain.length > 1 ? chain[chain.length - 2] : null);
      const beforeText = before ? escapeHtml(before.subject) + ' · ' + escapeHtml(before.teacher) : '(빈 교시)';
      return `<div class="daily-row daily-swapped clickable" data-period="${period}">
        ${periodLabel}
        <div class="daily-content">
          <div class="daily-before">${beforeText}</div>
          <div class="daily-badge">${typeIcon} ${escapeHtml(formatShortDate(swap.date))} 교체</div>
          <div class="daily-after">${escapeHtml(swap.subject)} · ${escapeHtml(swap.teacher)}</div>
          ${makeupNote}
          ${chainNote}
        </div>
      </div>`;
    }

    return `<div class="daily-row clickable" data-period="${period}">
      ${periodLabel}
      <div class="daily-content">
        <div class="daily-subject">${escapeHtml(base.subject)}</div>
        <div class="daily-teacher">${escapeHtml(base.teacher)}</div>
      </div>
    </div>`;
  }

  function renderDateBar() {
    const bar = document.getElementById('date-bar');
    const dow = dateToDayOfWeek(viewDate);
    bar.innerHTML = `
      <label class="date-bar-label">보기 날짜
        <input type="date" id="view-date-input" value="${viewDate}">
      </label>
      <span class="date-bar-dow">${dow ? '(' + dow + ')' : ''}</span>
      <button class="btn btn-sm" id="btn-today">오늘</button>
    `;
    document.getElementById('view-date-input').addEventListener('change', (e) => {
      viewDate = e.target.value || todayStr();
      renderDaily();
    });
    document.getElementById('btn-today').addEventListener('click', () => {
      viewDate = todayStr();
      renderDaily();
    });
  }

  // ---- 학급 선택(두 탭에서 공용) ----

  function renderClassBar(containerId, onChange) {
    const bar = document.getElementById(containerId);
    const classes = Store.getClasses();
    const activeId = Store.getActiveClassId();

    const chips = classes.map(c => `
      <button class="class-chip ${c.id === activeId ? 'active' : ''}" data-id="${c.id}">${escapeHtml(c.name)}</button>
    `).join('');

    bar.innerHTML = `
      ${chips}
      <button class="btn btn-sm" data-act="add-class">+ 학급 추가</button>
      ${classes.length ? '<button class="btn btn-sm" data-act="manage-classes">학급 관리</button>' : ''}
    `;

    bar.querySelectorAll('.class-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        Store.setActiveClassId(chip.dataset.id);
        onChange();
      });
    });
    bar.querySelector('[data-act="add-class"]').addEventListener('click', () => openAddClassModal(onChange));
    const manageBtn = bar.querySelector('[data-act="manage-classes"]');
    if (manageBtn) manageBtn.addEventListener('click', () => openManageClassesModal(onChange));
  }

  function openAddClassModal(onChange) {
    const html = `
      <div class="modal-header"><h3>학급 추가</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <label>학년/반<input type="text" id="f-class-name" placeholder="예: 1학년 2반"></label>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" id="btn-save-class">추가</button></div>
    `;
    ModalUI.open(html);
    document.getElementById('btn-save-class').addEventListener('click', () => {
      const name = document.getElementById('f-class-name').value.trim();
      if (!name) { alert('학년/반을 입력해주세요.'); return; }
      const cls = Store.addClass(name);
      Store.setActiveClassId(cls.id);
      ModalUI.close();
      onChange();
    });
  }

  function openManageClassesModal(onChange) {
    const classes = Store.getClasses();
    const rowsHtml = classes.map(c => `
      <div class="class-manage-row" data-id="${c.id}">
        <input type="text" class="class-manage-name" value="${escapeHtml(c.name)}">
        <button class="btn btn-xs btn-danger" data-remove-class="${c.id}">삭제</button>
      </div>
    `).join('');

    const html = `
      <div class="modal-header"><h3>학급 관리</h3><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">${rowsHtml || '<p class="empty-hint">학급이 없습니다.</p>'}</div>
      <div class="modal-footer"><button class="btn btn-primary" id="btn-save-classes">저장</button></div>
    `;
    ModalUI.open(html, 'modal-wide');

    document.querySelectorAll('[data-remove-class]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('이 학급과 학급의 시간표를 삭제할까요?')) return;
        Store.removeClass(btn.dataset.removeClass);
        openManageClassesModal(onChange);
        onChange();
      });
    });

    document.getElementById('btn-save-classes').addEventListener('click', () => {
      document.querySelectorAll('.class-manage-row').forEach(row => {
        const name = row.querySelector('.class-manage-name').value.trim();
        if (name) Store.renameClass(row.dataset.id, name);
      });
      ModalUI.close();
      onChange();
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { renderBase, renderDaily, escapeHtml, getViewDate };
})();

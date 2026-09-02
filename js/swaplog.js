const SwapLog = (() => {
  const MAX_ROWS = 5;

  function findGroupableLog(headerDefaults) {
    return Store.get().logs.find(l =>
      l.periodStart === headerDefaults.date &&
      l.periodEnd === headerDefaults.date &&
      l.absentTeacher === headerDefaults.absentTeacher &&
      l.reason === headerDefaults.reason &&
      l.rows.length < MAX_ROWS
    ) || null;
  }

  function attachSwapRow(rowData, headerDefaults) {
    // 같은 날짜·같은 결강교사·같은 사유로 이미 작성 중인 일지가 있으면 새 행으로 이어붙이고,
    // 없으면(예: 같은 슬롯을 다시 교체하는 경우) 새 일지를 만든다.
    let log = findGroupableLog(headerDefaults);
    if (!log) {
      log = {
        id: uid(),
        reason: headerDefaults.reason,
        periodStart: headerDefaults.date,
        periodEnd: headerDefaults.date,
        absentTeacher: headerDefaults.absentTeacher,
        note: '',
        rows: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      Store.addLog(log);
    }
    const row = { id: uid(), ...rowData };
    Store.updateLog(log.id, l => { l.rows.push(row); });
    return { logId: log.id, rowId: row.id };
  }

  function updateRow(logId, rowId, patch) {
    Store.updateLog(logId, l => {
      const row = l.rows.find(r => r.id === rowId);
      if (row) Object.assign(row, patch);
    });
  }

  function removeRow(logId, rowId) {
    const log = Store.getLog(logId);
    if (!log) return;
    Store.updateLog(logId, l => { l.rows = l.rows.filter(r => r.id !== rowId); });
  }

  function createBlank() {
    const log = {
      id: uid(),
      reason: SWAP_REASONS[0],
      periodStart: todayStr(),
      periodEnd: todayStr(),
      absentTeacher: '',
      note: '',
      rows: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    Store.addLog(log);
    return log;
  }

  function reasonOptions(selected) {
    return SWAP_REASONS.map(r =>
      `<option value="${r}" ${r === selected ? 'selected' : ''}>${r}</option>`
    ).join('');
  }

  function renderList() {
    const container = document.getElementById('log-list-container');
    const logs = Store.get().logs;
    if (logs.length === 0) {
      container.innerHTML = '<p class="empty-hint">아직 작성된 수업 교체 일지가 없습니다. 시간표에서 수업을 교체하면 자동으로 만들어집니다.</p>';
      return;
    }
    const esc = TimetableUI.escapeHtml;
    container.innerHTML = logs.map(log => `
      <div class="log-card" data-id="${log.id}">
        <div class="log-card-head">
          <span class="log-badge">${esc(log.reason)}</span>
          <span class="log-period">${esc(log.periodStart)}${log.periodStart !== log.periodEnd ? ' ~ ' + esc(log.periodEnd) : ''}</span>
        </div>
        <div class="log-card-body">
          <span>결강교사: <b>${esc(log.absentTeacher) || '-'}</b></span>
          <span>${log.rows.length} / ${MAX_ROWS} 행</span>
        </div>
        <div class="log-card-actions">
          <button class="btn btn-sm" data-action="edit">편집 / 인쇄</button>
          <button class="btn btn-sm btn-danger" data-action="delete">삭제</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.log-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('[data-action="edit"]').addEventListener('click', () => openDetail(id));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm('이 수업 교체 일지를 삭제할까요?')) {
          Store.removeLog(id);
          renderList();
        }
      });
    });
  }

  function openDetail(logId) {
    const log = Store.getLog(logId);
    if (!log) return;
    const esc = TimetableUI.escapeHtml;

    const rowsHtml = log.rows.map((r, i) => `
      <div class="log-row-edit" data-row-id="${r.id}">
        <div class="log-row-edit-title">행 ${i + 1}
          <button class="btn btn-xs btn-danger" data-remove-row="${r.id}">행 삭제</button>
        </div>
        <div class="form-grid">
          <label>일자<input type="date" data-field="date" value="${r.date || ''}"></label>
          <label>학년/반<input type="text" data-field="grade" value="${esc(r.grade)}"></label>
          <label>교시<input type="number" min="1" data-field="period" value="${r.period}"></label>
          <label>결강과목<input type="text" data-field="cancelledSubject" value="${esc(r.cancelledSubject)}"></label>
          <label>대체과목<input type="text" data-field="substituteSubject" value="${esc(r.substituteSubject)}"></label>
          <label>대체교사<input type="text" data-field="substituteTeacher" value="${esc(r.substituteTeacher)}"></label>
        </div>
        <div class="form-grid form-grid-makeup">
          <label>보강일자<input type="date" data-field="makeup.date" value="${r.makeup ? r.makeup.date : ''}"></label>
          <label>보강 학년/반<input type="text" data-field="makeup.grade" value="${esc(r.makeup ? r.makeup.grade : '')}"></label>
          <label>보강 교시<input type="number" min="1" data-field="makeup.period" value="${r.makeup ? r.makeup.period : ''}"></label>
          <label>비고<input type="text" data-field="makeup.note" value="${esc(r.makeup ? r.makeup.note : '')}"></label>
        </div>
      </div>
    `).join('');

    const html = `
      <div class="modal-header">
        <h3>수업 교체 일지 편집</h3>
        <button class="btn-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <label>사유
            <select id="log-reason">${reasonOptions(log.reason)}</select>
          </label>
          <label>결강교사<input type="text" id="log-absent-teacher" value="${esc(log.absentTeacher)}"></label>
          <label>기간 시작<input type="date" id="log-period-start" value="${log.periodStart || ''}"></label>
          <label>기간 종료<input type="date" id="log-period-end" value="${log.periodEnd || ''}"></label>
        </div>
        <hr>
        <div id="log-rows">${rowsHtml || '<p class="empty-hint">행이 없습니다.</p>'}</div>
        <button class="btn btn-sm" id="btn-add-row" ${log.rows.length >= MAX_ROWS ? 'disabled' : ''}>+ 행 추가 (최대 ${MAX_ROWS})</button>
        <label class="block-label">비고<textarea id="log-note" rows="2">${esc(log.note)}</textarea></label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save-log">저장</button>
        <button class="btn" id="btn-print-log">🖨 인쇄 (PDF 양식)</button>
      </div>
    `;
    ModalUI.open(html, 'modal-wide');

    document.getElementById('btn-add-row').addEventListener('click', () => {
      Store.updateLog(log.id, l => {
        l.rows.push({
          id: uid(), date: todayStr(), grade: '', period: 1,
          cancelledSubject: '', substituteSubject: '', substituteTeacher: '', makeup: null
        });
      });
      openDetail(log.id);
    });

    document.querySelectorAll('[data-remove-row]').forEach(btn => {
      btn.addEventListener('click', () => {
        Store.updateLog(log.id, l => {
          l.rows = l.rows.filter(r => r.id !== btn.dataset.removeRow);
        });
        openDetail(log.id);
      });
    });

    document.getElementById('btn-save-log').addEventListener('click', () => {
      const reason = document.getElementById('log-reason').value;
      const absentTeacher = document.getElementById('log-absent-teacher').value.trim();
      const periodStart = document.getElementById('log-period-start').value;
      const periodEnd = document.getElementById('log-period-end').value;
      const note = document.getElementById('log-note').value;

      const rowEls = document.querySelectorAll('.log-row-edit');
      const rows = Array.from(rowEls).map(rowEl => {
        const rowId = rowEl.dataset.rowId;
        const get = f => rowEl.querySelector(`[data-field="${f}"]`).value;
        const hasMakeup = get('makeup.date') || get('makeup.grade') || get('makeup.period') || get('makeup.note');
        return {
          id: rowId,
          date: get('date'),
          grade: get('grade'),
          period: Number(get('period')) || 1,
          cancelledSubject: get('cancelledSubject'),
          substituteSubject: get('substituteSubject'),
          substituteTeacher: get('substituteTeacher'),
          makeup: hasMakeup ? {
            date: get('makeup.date'), grade: get('makeup.grade'),
            period: get('makeup.period'), note: get('makeup.note')
          } : null
        };
      });

      Store.updateLog(log.id, l => {
        l.reason = reason; l.absentTeacher = absentTeacher;
        l.periodStart = periodStart; l.periodEnd = periodEnd;
        l.note = note; l.rows = rows;
      });
      ModalUI.close();
      renderList();
    });

    document.getElementById('btn-print-log').addEventListener('click', () => {
      printLog(log.id);
    });
  }

  const PRINT_CSS = `
    * { box-sizing: border-box; }
    body { margin: 24px; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
    .pdf-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
    .pdf-table td { border: 1px solid #000; padding: 8px 5px; text-align: center; vertical-align: middle; word-break: break-all; }
    .pdf-title { font-size: 22px; font-weight: 700; text-align: center; letter-spacing: 6px; }
    .pdf-approval-label { background: #eee; font-weight: 600; }
    .pdf-signature { height: 40px; }
    .pdf-cell-label { background: #eee; font-weight: 600; }
    .pdf-head-row td { background: #ddd; font-weight: 600; }
    .pdf-note-cell { text-align: left; height: 70px; vertical-align: top; }
    .pdf-footer { text-align: left; font-size: 11px; padding: 10px 5px; }
    .print-toolbar { margin-bottom: 16px; }
    .print-toolbar button {
      padding: 8px 16px; font-size: 14px; border: 1px solid #2b6ef2; background: #2b6ef2;
      color: #fff; border-radius: 6px; cursor: pointer;
    }
    @media print { .print-toolbar { display: none; } }
  `;

  function printLog(logId) {
    const log = Store.getLog(logId);
    if (!log) return;
    const win = window.open('', '_blank');
    if (!win) {
      alert('팝업이 차단되어 인쇄 화면을 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.');
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html lang="ko"><head><meta charset="UTF-8"><title>수업 교체 일지 인쇄</title>
      <style>${PRINT_CSS}</style></head>
      <body>
        <div class="print-toolbar"><button onclick="window.print()">🖨 인쇄하기</button></div>
        ${renderPrintHtml(log)}
      </body></html>
    `);
    win.document.close();
    win.focus();
  }

  function renderPrintHtml(log) {
    const esc = TimetableUI.escapeHtml;
    const rows = [];
    for (let i = 0; i < MAX_ROWS; i++) {
      rows.push(log.rows[i] || null);
    }
    const periodText = log.periodStart === log.periodEnd
      ? (log.periodStart || '')
      : `${log.periodStart || ''} ~ ${log.periodEnd || ''}`;

    const rowsHtml = rows.map(r => {
      if (!r) {
        return `<tr>
          <td></td><td></td><td></td><td></td><td></td><td>(인)</td>
          <td></td><td></td><td></td><td></td>
        </tr>`;
      }
      const dow = dateToDayOfWeek(r.date);
      const m = r.makeup;
      const mDow = m ? dateToDayOfWeek(m.date) : '';
      return `<tr>
        <td>${esc(r.date)}${dow ? `(${dow})` : ''}</td>
        <td>${esc(r.grade)}</td>
        <td>${esc(r.period)}</td>
        <td>${esc(r.cancelledSubject)}</td>
        <td>${esc(r.substituteSubject)}</td>
        <td>${esc(r.substituteTeacher)} (인)</td>
        <td>${m ? esc(m.date) + (mDow ? `(${mDow})` : '') : ''}</td>
        <td>${m ? esc(m.grade) : ''}</td>
        <td>${m ? esc(m.period) : ''}</td>
        <td>${m ? esc(m.note) : ''}</td>
      </tr>`;
    }).join('');

    return `
      <table class="pdf-table">
        <colgroup>
          <col style="width:11%"><col style="width:8%"><col style="width:6%">
          <col style="width:9%"><col style="width:9%"><col style="width:10%">
          <col style="width:11%"><col style="width:18%"><col style="width:5%"><col style="width:13%">
        </colgroup>
        <tr>
          <td class="pdf-title" rowspan="2" colspan="6">수업 교체 일지</td>
          <td class="pdf-approval-label" rowspan="2">결재</td>
          <td class="pdf-approval-label">수업계</td>
          <td class="pdf-approval-label" colspan="2">교무부장</td>
        </tr>
        <tr>
          <td class="pdf-signature"></td>
          <td class="pdf-signature" colspan="2"></td>
        </tr>
        <tr>
          <td class="pdf-cell-label">사유</td>
          <td colspan="2">${esc(log.reason)}</td>
          <td class="pdf-cell-label">기간</td>
          <td colspan="2">${esc(periodText)}</td>
          <td class="pdf-cell-label">결강교사</td>
          <td colspan="3">${esc(log.absentTeacher)} (인)</td>
        </tr>
        <tr class="pdf-head-row">
          <td rowspan="2">일자(요일)</td>
          <td rowspan="2">학년/반</td>
          <td rowspan="2">교시</td>
          <td rowspan="2">결강과목</td>
          <td rowspan="2">대체과목</td>
          <td rowspan="2">대체교사</td>
          <td colspan="4">보강일자</td>
        </tr>
        <tr class="pdf-head-row">
          <td>일자(요일)</td><td>학년/반</td><td>교시</td><td>비고</td>
        </tr>
        ${rowsHtml}
        <tr>
          <td class="pdf-cell-label" colspan="1">비고</td>
          <td colspan="9" class="pdf-note-cell">${esc(log.note)}</td>
        </tr>
        <tr>
          <td colspan="10" class="pdf-footer">
            * 사유: ${SWAP_REASONS.join(', ')}
          </td>
        </tr>
      </table>
    `;
  }

  return { attachSwapRow, updateRow, removeRow, createBlank, reasonOptions, renderList, openDetail, printLog };
})();

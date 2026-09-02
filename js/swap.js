const SwapUI = (() => {
  function className(classId) {
    const cls = Store.getClasses().find(c => c.id === classId);
    return cls ? cls.name : '';
  }

  function onBaseCellClick(classId, day, period) {
    const base = Store.getBaseCell(classId, day, period);
    if (!base) {
      openAddSubjectModal(classId, day, period);
    } else {
      openBaseActionSheet(classId, day, period);
    }
  }

  function onDailyCellClick(classId, day, period, date) {
    const swap = Store.getSwap(classId, day, period, date);
    if (swap) {
      openSwappedActionSheet(classId, day, period, date, swap);
      return;
    }
    const base = Store.getBaseCell(classId, day, period);
    if (!base) return;
    openDailySwapActionSheet(classId, day, period, date);
  }

  function removeMakeupMarker(classId, sourceSwapId, sourceDay, sourcePeriod, sourceDate, makeup) {
    if (!makeup || !makeup.date || !makeup.period) return;
    const mDay = dateToWeekdayIndex(makeup.date);
    if (mDay < 0) return;
    const marker = Store.getSwap(classId, mDay, Number(makeup.period), makeup.date);
    if (marker && marker.type === 'makeup' && marker.sourceSwapId === sourceSwapId) {
      Store.removeSwap(classId, mDay, Number(makeup.period), makeup.date);
    }
  }

  function upsertMakeupMarker(classId, sourceSwapId, sourceDay, sourcePeriod, sourceDate, makeup, effective) {
    if (!makeup || !makeup.date || !makeup.period) return;
    const mDay = dateToWeekdayIndex(makeup.date);
    if (mDay < 0) return;
    const mPeriod = Number(makeup.period);
    const occupant = Store.getSwap(classId, mDay, mPeriod, makeup.date);
    const isOwnMarker = occupant && occupant.type === 'makeup' && occupant.sourceSwapId === sourceSwapId;
    if (occupant && !isOwnMarker) return;
    const record = {
      id: isOwnMarker ? occupant.id : uid(), type: 'makeup', date: makeup.date,
      subject: effective.subject, teacher: effective.teacher,
      sourceDay, sourcePeriod, sourceDate, sourceSwapId, note: makeup.note || ''
    };
    if (isOwnMarker) {
      Store.replaceLastSwap(classId, mDay, mPeriod, makeup.date, record);
    } else {
      Store.pushSwap(classId, mDay, mPeriod, makeup.date, record);
    }
  }

  function clearMakeupLinkFromSource(classId, markerSwap) {
    const updated = Store.updateSwapInChain(
      classId, markerSwap.sourceDay, markerSwap.sourcePeriod, markerSwap.sourceDate, markerSwap.sourceSwapId,
      (s) => { s.makeup = null; }
    );
    if (updated && updated.logId && updated.rowId) {
      SwapLog.updateRow(updated.logId, updated.rowId, { makeup: null });
    }
  }

  function openAddSubjectModal(classId, day, period) {
    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 - 과목 추가</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <label>과목<input type="text" id="f-subject" placeholder="예: 수학"></label>
        <label>담당 선생님<input type="text" id="f-teacher" placeholder="예: 김철수"></label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save">저장</button>
      </div>
    `;
    ModalUI.open(html);
    document.getElementById('btn-save').addEventListener('click', () => {
      const subject = document.getElementById('f-subject').value.trim();
      const teacher = document.getElementById('f-teacher').value.trim();
      if (!subject || !teacher) { alert('과목과 담당 선생님을 입력해주세요.'); return; }
      Store.setBaseCell(classId, day, period, { subject, teacher });
      ModalUI.close();
      TimetableUI.renderBase();
    });
  }

  function openEditBaseModal(classId, day, period) {
    const base = Store.getBaseCell(classId, day, period);
    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 - 기본정보 수정</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <label>과목<input type="text" id="f-subject" value="${TimetableUI.escapeHtml(base.subject)}"></label>
        <label>담당 선생님<input type="text" id="f-teacher" value="${TimetableUI.escapeHtml(base.teacher)}"></label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save">저장</button>
      </div>
    `;
    ModalUI.open(html);
    document.getElementById('btn-save').addEventListener('click', () => {
      const subject = document.getElementById('f-subject').value.trim();
      const teacher = document.getElementById('f-teacher').value.trim();
      if (!subject || !teacher) { alert('과목과 담당 선생님을 입력해주세요.'); return; }
      Store.setBaseCell(classId, day, period, { subject, teacher });
      ModalUI.close();
      TimetableUI.renderBase();
    });
  }

  function openBaseActionSheet(classId, day, period) {
    const base = Store.getBaseCell(classId, day, period);
    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body sheet-body">
        <p class="sheet-current">${TimetableUI.escapeHtml(base.subject)} · ${TimetableUI.escapeHtml(base.teacher)}</p>
        <button class="btn btn-block" data-act="edit">✏ 기본정보 수정</button>
        <button class="btn btn-block btn-danger" data-act="delete">🗑 삭제</button>
      </div>
    `;
    ModalUI.open(html);
    document.querySelector('[data-act="edit"]').addEventListener('click', () => openEditBaseModal(classId, day, period));
    document.querySelector('[data-act="delete"]').addEventListener('click', () => deleteCell(classId, day, period));
  }

  function openDailySwapActionSheet(classId, day, period, date) {
    const base = Store.getBaseCell(classId, day, period);
    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 (${formatShortDate(date)})</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body sheet-body">
        <p class="sheet-current">${TimetableUI.escapeHtml(base.subject)} · ${TimetableUI.escapeHtml(base.teacher)}</p>
        <button class="btn btn-block btn-primary" data-act="swap">🔁 수업 교체 (결강 대체)</button>
        <button class="btn btn-block" data-act="exchange">🔀 같은 날 다른 교시와 교체</button>
      </div>
    `;
    ModalUI.open(html);
    document.querySelector('[data-act="swap"]').addEventListener('click', () => openSwapModal(classId, day, period, date, false));
    document.querySelector('[data-act="exchange"]').addEventListener('click', () => openExchangeModal(classId, day, period, date));
  }

  function openSwappedActionSheet(classId, day, period, date, swap) {
    if (swap.type === 'makeup') {
      const html = `
        <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 (보강)</h3>
          <button class="btn-close" data-close>✕</button></div>
        <div class="modal-body sheet-body">
          <p class="sheet-current">📘 ${TimetableUI.escapeHtml(swap.subject)} · ${TimetableUI.escapeHtml(swap.teacher)}</p>
          <p class="sheet-hint">${DAY_NAMES[swap.sourceDay]}요일 ${swap.sourcePeriod}교시(${formatShortDate(swap.sourceDate)}) 결강 수업의 보강입니다.${swap.note ? ' ' + TimetableUI.escapeHtml(swap.note) : ''}</p>
          <button class="btn btn-block btn-primary" data-act="swap">🔁 이 보강 수업도 교체 (결강 대체)</button>
          <button class="btn btn-block" data-act="exchange">🔀 같은 날 다른 교시와 교체</button>
          <button class="btn btn-block btn-danger" data-act="revert">↩ 보강 표시 취소</button>
        </div>
      `;
      ModalUI.open(html);
      document.querySelector('[data-act="swap"]').addEventListener('click', () => openSwapModal(classId, day, period, date, false));
      document.querySelector('[data-act="exchange"]').addEventListener('click', () => openExchangeModal(classId, day, period, date));
      document.querySelector('[data-act="revert"]').addEventListener('click', () => revertSwap(classId, day, period, date));
      return;
    }

    const base = Store.getBaseCell(classId, day, period);
    const isExchange = swap.type === 'exchange';
    const chain = Store.getSwapChain(classId, day, period, date);

    if (isExchange) {
      const beforeLatest = base || (chain.length > 1 ? chain[chain.length - 2] : null);
      const beforeLatestText = beforeLatest
        ? `${TimetableUI.escapeHtml(beforeLatest.subject)} · ${TimetableUI.escapeHtml(beforeLatest.teacher)}`
        : '(빈 교시)';
      const html = `
        <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 (${formatShortDate(date)} 교체됨)</h3>
          <button class="btn-close" data-close>✕</button></div>
        <div class="modal-body sheet-body">
          <p class="sheet-current">
            <s>${beforeLatestText}</s><br>
            → ${TimetableUI.escapeHtml(swap.subject)} · ${TimetableUI.escapeHtml(swap.teacher)}
          </p>
          <p class="sheet-hint">${DAY_NAMES[swap.partnerDay]}요일 ${swap.partnerPeriod}교시와 서로 교체되었습니다. (교체일지 작성 불필요)</p>
          <button class="btn btn-block btn-primary" data-act="swap">🔁 이 수업도 교체 (결강 대체)</button>
          <button class="btn btn-block" data-act="exchange">🔀 같은 날 다른 교시와 또 교체</button>
          <button class="btn btn-block btn-danger" data-act="revert">↩ 마지막 교체 취소</button>
        </div>
      `;
      ModalUI.open(html);
      document.querySelector('[data-act="swap"]').addEventListener('click', () => openSwapModal(classId, day, period, date, false));
      document.querySelector('[data-act="exchange"]').addEventListener('click', () => openExchangeModal(classId, day, period, date));
      document.querySelector('[data-act="revert"]').addEventListener('click', () => revertSwap(classId, day, period, date));
      return;
    }

    const trueBaseText = base
      ? `${TimetableUI.escapeHtml(base.subject)} · ${TimetableUI.escapeHtml(base.teacher)}`
      : '(빈 교시)';
    const trail = [`<s>${trueBaseText}</s>`]
      .concat(chain.map((s, i) => {
        const text = `${TimetableUI.escapeHtml(s.subject)} · ${TimetableUI.escapeHtml(s.teacher)}`;
        return i === chain.length - 1 ? `<b>${text}</b>` : `<s>${text}</s>`;
      }))
      .join(' → ');
    const chainHint = chain.length > 1
      ? `<p class="sheet-hint">이 날짜에 ${chain.length}번 교체되었습니다.</p>`
      : '';

    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 (${formatShortDate(date)} 교체됨)</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body sheet-body">
        <p class="sheet-current">${trail} (${TimetableUI.escapeHtml(swap.reason)})</p>
        ${chainHint}
        <button class="btn btn-block btn-primary" data-act="again">🔁 또 교체하기</button>
        <button class="btn btn-block" data-act="edit-swap">✏ 교체 내용 수정</button>
        <button class="btn btn-block btn-danger" data-act="revert">↩ 마지막 교체 취소</button>
      </div>
    `;
    ModalUI.open(html);
    document.querySelector('[data-act="again"]').addEventListener('click', () => openSwapModal(classId, day, period, date, false));
    document.querySelector('[data-act="edit-swap"]').addEventListener('click', () => openSwapModal(classId, day, period, date, true));
    document.querySelector('[data-act="revert"]').addEventListener('click', () => revertSwap(classId, day, period, date));
  }

  function deleteCell(classId, day, period) {
    const swapsByDate = Store.getSwapsForCell(classId, day, period);
    const hasSwaps = Object.values(swapsByDate).some(chain => chain.length > 0);
    const msg = hasSwaps
      ? '이 칸을 삭제할까요? 연결된 모든 날짜의 교체 기록(및 교체일지 행)도 함께 삭제됩니다.'
      : '이 칸을 삭제할까요?';
    if (!confirm(msg)) return;
    Object.entries(swapsByDate).forEach(([date, chain]) => {
      chain.forEach(swap => {
        if (swap.type === 'substitute') {
          SwapLog.removeRow(swap.logId, swap.rowId);
          if (swap.makeup) removeMakeupMarker(classId, swap.id, day, period, date, swap.makeup);
        } else if (swap.type === 'exchange') {
          const partnerLatest = Store.getSwap(classId, swap.partnerDay, swap.partnerPeriod, date);
          if (partnerLatest && partnerLatest.id === swap.id) {
            Store.popSwap(classId, swap.partnerDay, swap.partnerPeriod, date);
          }
        } else if (swap.type === 'makeup') {
          clearMakeupLinkFromSource(classId, swap);
        }
      });
    });
    Store.removeBaseCell(classId, day, period);
    ModalUI.close();
    TimetableUI.renderBase();
  }

  function revertSwap(classId, day, period, date) {
    const swap = Store.getSwap(classId, day, period, date);
    if (!swap) return;
    if (swap.type === 'makeup') {
      if (!confirm('보강 표시를 취소할까요? 연결된 결강 수업의 교체 기록은 유지됩니다.')) return;
      clearMakeupLinkFromSource(classId, swap);
      Store.removeSwap(classId, day, period, date);
      ModalUI.close();
      TimetableUI.renderDaily();
      return;
    }
    const chain = Store.getSwapChain(classId, day, period, date);
    const multiStep = chain.length > 1;
    const confirmMsg = swap.type === 'substitute'
      ? (multiStep
        ? '마지막 교체만 취소하고 그 이전 상태로 되돌릴까요? 교체일지의 해당 행도 함께 삭제됩니다.'
        : '교체를 취소하고 원래 수업으로 되돌릴까요? 교체일지의 해당 행도 함께 삭제됩니다.')
      : (multiStep
        ? '마지막 교체만 취소하고 그 이전 상태로 되돌릴까요?'
        : '교체를 취소하고 원래 수업으로 되돌릴까요?');
    if (!confirm(confirmMsg)) return;
    if (swap.type === 'substitute') {
      SwapLog.removeRow(swap.logId, swap.rowId);
      if (swap.makeup) removeMakeupMarker(classId, swap.id, day, period, date, swap.makeup);
      Store.popSwap(classId, day, period, date);
    } else {
      Store.popSwap(classId, swap.partnerDay, swap.partnerPeriod, date);
      Store.popSwap(classId, day, period, date);
    }
    ModalUI.close();
    TimetableUI.renderDaily();
  }

  const MANUAL_VALUE = '__manual__';

  function subjectOptionsForDay(classId, dayIdx) {
    const periodCount = Store.get().settings.periodCount;
    const opts = [];
    for (let p = 1; p <= periodCount; p++) {
      const b = Store.getBaseCell(classId, dayIdx, p);
      if (b) opts.push({ period: p, subject: b.subject, teacher: b.teacher });
    }
    return opts;
  }

  function findDayForSubject(classId, subject, teacher) {
    if (!subject) return -1;
    for (let d = 0; d < DAY_NAMES.length; d++) {
      if (subjectOptionsForDay(classId, d).some(o => o.subject === subject && o.teacher === teacher)) return d;
    }
    return -1;
  }

  function refreshSubjectSelect(classId, dayIdx, presetSubject, presetTeacher, fallbackPeriod) {
    const opts = subjectOptionsForDay(classId, dayIdx);
    const select = document.getElementById('f-subject-select');
    const optionsHtml = opts.map(o =>
      `<option value="${o.period}||${TimetableUI.escapeHtml(o.subject)}||${TimetableUI.escapeHtml(o.teacher)}">${o.period}교시 · ${TimetableUI.escapeHtml(o.subject)} · ${TimetableUI.escapeHtml(o.teacher)}</option>`
    ).join('');
    select.innerHTML = optionsHtml + `<option value="${MANUAL_VALUE}">✏ 직접 입력</option>`;

    const match = presetSubject ? opts.find(o => o.subject === presetSubject && o.teacher === presetTeacher) : null;
    if (match) {
      select.value = `${match.period}||${match.subject}||${match.teacher}`;
      toggleManualFields(false);
    } else if (presetSubject) {
      select.value = MANUAL_VALUE;
      toggleManualFields(true, presetSubject, presetTeacher);
    } else {
      select.value = opts.length ? select.options[0].value : MANUAL_VALUE;
      toggleManualFields(select.value === MANUAL_VALUE);
    }
    syncMakeupPeriodDisplay(fallbackPeriod);
  }

  function toggleManualFields(show, subject, teacher) {
    const wrap = document.getElementById('manual-fields');
    wrap.style.display = show ? '' : 'none';
    if (subject !== undefined) document.getElementById('f-subject-manual').value = subject || '';
    if (teacher !== undefined) document.getElementById('f-teacher-manual').value = teacher || '';
  }

  function syncMakeupPeriodDisplay(fallbackPeriod) {
    const display = document.getElementById('f-makeup-period-display');
    if (!display) return;
    const val = document.getElementById('f-subject-select').value;
    if (val === MANUAL_VALUE) {
      display.value = `${fallbackPeriod}교시 (현재 교시, 직접 입력이라 대체 과목 교시 없음)`;
    } else {
      display.value = `${val.split('||')[0]}교시`;
    }
  }

  function selectedSubstitutePeriod(fallbackPeriod) {
    const val = document.getElementById('f-subject-select').value;
    return val === MANUAL_VALUE ? fallbackPeriod : Number(val.split('||')[0]);
  }

  function openSwapModal(classId, day, period, date, isEdit) {
    const base = Store.getBaseCell(classId, day, period);
    const chain = Store.getSwapChain(classId, day, period, date);
    const latestSwap = chain.length ? chain[chain.length - 1] : null;
    const existing = isEdit ? latestSwap : null;
    const previousEffective = isEdit
      ? (chain.length > 1 ? chain[chain.length - 2] : base)
      : (latestSwap || base);
    const existingMakeup = existing && existing.makeup;
    const initialSourceDay = existing
      ? (() => { const found = findDayForSubject(classId, existing.subject, existing.teacher); return found >= 0 ? found : day; })()
      : day;

    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${formatShortDate(date)}(${DAY_NAMES[day]}) ${period}교시 - ${isEdit ? '교체 내용 수정' : '수업 교체'}</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="sheet-current">기존: ${TimetableUI.escapeHtml(previousEffective.subject)} · ${TimetableUI.escapeHtml(previousEffective.teacher)}</p>
        <div class="form-grid">
          <label>사유<select id="f-reason">${SwapLog.reasonOptions(existing ? existing.reason : SWAP_REASONS[0])}</select></label>
          <label>학년/반<input type="text" id="f-grade" value="${TimetableUI.escapeHtml(existing ? existing.grade : className(classId))}"></label>
          <label>대체할 과목 - 요일
            <select id="f-source-day">${DAY_NAMES.map((d, i) => `<option value="${i}" ${i === initialSourceDay ? 'selected' : ''}>${d}요일</option>`).join('')}</select>
          </label>
        </div>
        <label>대체할 과목<select id="f-subject-select"></select></label>
        <div id="manual-fields" class="form-grid" style="display:none">
          <label>대체 과목(직접 입력)<input type="text" id="f-subject-manual"></label>
          <label>대체 교사(직접 입력)<input type="text" id="f-teacher-manual"></label>
        </div>
        <p class="sheet-hint">보강 수업(항상 함께 기록됩니다)</p>
        <div id="makeup-fields" class="form-grid form-grid-makeup">
          <label>보강 일자<input type="date" id="f-makeup-date" value="${existingMakeup ? existingMakeup.date : ''}"></label>
          <label>보강 학년/반<input type="text" id="f-makeup-grade" value="${TimetableUI.escapeHtml(existingMakeup ? existingMakeup.grade : className(classId))}"></label>
          <label>보강 교시<input type="text" id="f-makeup-period-display" disabled></label>
          <label>비고<input type="text" id="f-makeup-note" value="${existingMakeup ? TimetableUI.escapeHtml(existingMakeup.note) : ''}"></label>
        </div>
        <p class="sheet-hint">보강 과목·교시는 위에서 고른 대체 과목과 동일하게 자동으로 채워집니다. 보강 일자만 정해주세요.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save">저장</button>
      </div>
    `;
    ModalUI.open(html, 'modal-wide');

    refreshSubjectSelect(classId, initialSourceDay, existing ? existing.subject : '', existing ? existing.teacher : '', period);
    document.getElementById('f-source-day').addEventListener('change', (e) => {
      refreshSubjectSelect(classId, Number(e.target.value), '', '', period);
    });
    document.getElementById('f-subject-select').addEventListener('change', (e) => {
      toggleManualFields(e.target.value === MANUAL_VALUE);
      syncMakeupPeriodDisplay(period);
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      const swapDate = date;
      const reason = document.getElementById('f-reason').value;
      const grade = document.getElementById('f-grade').value.trim();
      const selectVal = document.getElementById('f-subject-select').value;
      let subject, teacher;
      if (selectVal === MANUAL_VALUE) {
        subject = document.getElementById('f-subject-manual').value.trim();
        teacher = document.getElementById('f-teacher-manual').value.trim();
      } else {
        [, subject, teacher] = selectVal.split('||');
      }
      if (!subject || !teacher) { alert('대체 과목, 대체 교사를 입력해주세요.'); return; }

      const makeupDate = document.getElementById('f-makeup-date').value;
      if (!makeupDate) { alert('보강 일자를 입력해주세요.'); return; }
      const makeup = {
        date: makeupDate,
        grade: document.getElementById('f-makeup-grade').value.trim(),
        period: selectedSubstitutePeriod(period),
        note: document.getElementById('f-makeup-note').value.trim()
      };

      let record;
      if (isEdit) {
        SwapLog.updateRow(existing.logId, existing.rowId, {
          date: swapDate, grade, period,
          cancelledSubject: previousEffective.subject,
          substituteSubject: subject,
          substituteTeacher: teacher,
          makeup
        });
        if (existing.makeup) removeMakeupMarker(classId, existing.id, day, period, swapDate, existing.makeup);
        record = { ...existing, reason, subject, teacher, grade, makeup };
        Store.replaceLastSwap(classId, day, period, swapDate, record);
      } else {
        const result = SwapLog.attachSwapRow(
          {
            date: swapDate, grade, period,
            cancelledSubject: previousEffective.subject,
            substituteSubject: subject,
            substituteTeacher: teacher,
            makeup
          },
          { reason, date: swapDate, absentTeacher: previousEffective.teacher }
        );
        record = { id: uid(), type: 'substitute', date: swapDate, reason, subject, teacher, grade, makeup, logId: result.logId, rowId: result.rowId };
        Store.pushSwap(classId, day, period, swapDate, record);
      }

      if (record.makeup) upsertMakeupMarker(classId, record.id, day, period, swapDate, record.makeup, { subject, teacher });
      ModalUI.close();
      TimetableUI.renderDaily();
      showLogToast(record.logId);
    });
  }

  function openExchangeModal(classId, day, period, date) {
    const base = Store.getBaseCell(classId, day, period);
    const currentSwap = Store.getSwap(classId, day, period, date);
    const effective = currentSwap || base;
    const periodCount = Store.get().settings.periodCount;
    const candidates = [];
    for (let p = 1; p <= periodCount; p++) {
      if (p === period) continue;
      const b = Store.getBaseCell(classId, day, p);
      if (b) candidates.push({ period: p, base: b });
    }
    if (!candidates.length) {
      alert('같은 요일에 과목이 등록된 다른 교시가 없습니다. 먼저 다른 교시에 과목을 추가해주세요.');
      return;
    }

    const optionsHtml = candidates.map(c =>
      `<option value="${c.period}">${c.period}교시 · ${TimetableUI.escapeHtml(c.base.subject)} · ${TimetableUI.escapeHtml(c.base.teacher)}</option>`
    ).join('');

    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${formatShortDate(date)}(${DAY_NAMES[day]}) ${period}교시 - 같은 날 교체</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="sheet-current">기존: ${TimetableUI.escapeHtml(effective.subject)} · ${TimetableUI.escapeHtml(effective.teacher)}</p>
        <label>바꿀 교시 (같은 ${DAY_NAMES[day]}요일)
          <select id="f-target-period">${optionsHtml}</select>
        </label>
        <p class="sheet-hint">같은 날 두 교시끼리 맞바꾸는 경우로, 별도의 수업 교체일지는 작성되지 않습니다.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save">교체</button>
      </div>
    `;
    ModalUI.open(html);

    document.getElementById('btn-save').addEventListener('click', () => {
      const swapDate = date;
      const targetPeriod = Number(document.getElementById('f-target-period').value);
      if (Store.getSwap(classId, day, targetPeriod, swapDate)) {
        alert('이미 해당 날짜에 교체 기록이 있는 교시입니다. 먼저 기존 교체를 취소해주세요.');
        return;
      }
      const targetBase = Store.getBaseCell(classId, day, targetPeriod);
      const swapId = uid();
      Store.pushSwap(classId, day, period, swapDate, {
        id: swapId, type: 'exchange', date: swapDate,
        subject: targetBase.subject, teacher: targetBase.teacher,
        partnerDay: day, partnerPeriod: targetPeriod
      });
      Store.pushSwap(classId, day, targetPeriod, swapDate, {
        id: swapId, type: 'exchange', date: swapDate,
        subject: effective.subject, teacher: effective.teacher,
        partnerDay: day, partnerPeriod: period
      });
      ModalUI.close();
      TimetableUI.renderDaily();
    });
  }

  function showLogToast(logId) {
    if (!logId) return;
    const toast = document.getElementById('toast');
    toast.innerHTML = `수업 교체일지에 반영되었습니다. <button id="toast-view" class="btn btn-xs">일지 보기</button>`;
    toast.classList.add('active');
    document.getElementById('toast-view').addEventListener('click', () => {
      toast.classList.remove('active');
      AppUI.switchTab('logs');
      SwapLog.openDetail(logId);
    });
    setTimeout(() => toast.classList.remove('active'), 5000);
  }

  return { onBaseCellClick, onDailyCellClick, openSwapModal };
})();

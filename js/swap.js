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
      if (subject !== base.subject) {
        syncBaseRenameToLogs(classId, day, period, subject);
      }
      ModalUI.close();
      TimetableUI.renderBase();
    });
  }

  // 기본 시간표의 과목 이름이 바뀌면, 그 자리에서 바로 만들어진(체인의 첫 교체) 결강 대체 기록의
  // 교체일지 행("결강과목")도 새 이름으로 함께 갱신한다. (결강교사 헤더는 여러 행이 공유할 수 있어
  // 이 칸 하나만 바뀌었다고 문서 전체를 바꾸면 다른 행과 어긋날 수 있으므로 건드리지 않는다.)
  function syncBaseRenameToLogs(classId, day, period, newSubject) {
    const swapsByDate = Store.getSwapsForCell(classId, day, period);
    Object.values(swapsByDate).forEach(chain => {
      const first = chain[0];
      if (!first || first.type !== 'substitute' || !first.logId || !first.rowId) return;
      SwapLog.updateRow(first.logId, first.rowId, { cancelledSubject: newSubject });
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
        <button class="btn btn-block" data-act="exchange">🔀 다른 교시와 교체</button>
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
          <button class="btn btn-block" data-act="exchange">🔀 다른 교시와 교체</button>
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
      // 두 번 이상 바뀐 자리라면 기본 시간표 과목이 아니라 "직전 교체 결과"에 취소선을 그어야 한다.
      const beforeLatest = chain.length > 1 ? chain[chain.length - 2] : base;
      const beforeLatestText = beforeLatest
        ? `${TimetableUI.escapeHtml(beforeLatest.subject)} · ${TimetableUI.escapeHtml(beforeLatest.teacher)}`
        : '(빈 교시)';
      const partnerDate = swap.partnerDate || date;
      const partnerDateText = partnerDate !== date ? `${formatShortDate(partnerDate)} ` : '';
      const html = `
        <div class="modal-header"><h3>${className(classId)} · ${DAY_NAMES[day]}요일 ${period}교시 (${formatShortDate(date)} 교체됨)</h3>
          <button class="btn-close" data-close>✕</button></div>
        <div class="modal-body sheet-body">
          <p class="sheet-current">
            <s>${beforeLatestText}</s><br>
            → ${TimetableUI.escapeHtml(swap.subject)} · ${TimetableUI.escapeHtml(swap.teacher)}
          </p>
          <p class="sheet-hint">${partnerDateText}${DAY_NAMES[swap.partnerDay]}요일 ${swap.partnerPeriod}교시와 서로 교체되었습니다. (교체일지 작성 불필요)</p>
          <button class="btn btn-block btn-primary" data-act="swap">🔁 이 수업도 교체 (결강 대체)</button>
          <button class="btn btn-block" data-act="exchange">🔀 다른 교시와 또 교체</button>
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
        <button class="btn btn-block" data-act="exchange">🔀 다른 교시와 교체</button>
        <button class="btn btn-block" data-act="edit-swap">✏ 교체 내용 수정</button>
        <button class="btn btn-block btn-danger" data-act="revert">↩ 마지막 교체 취소</button>
      </div>
    `;
    ModalUI.open(html);
    document.querySelector('[data-act="again"]').addEventListener('click', () => openSwapModal(classId, day, period, date, false));
    document.querySelector('[data-act="exchange"]').addEventListener('click', () => openExchangeModal(classId, day, period, date));
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
          const partnerDate = swap.partnerDate || date;
          const partnerLatest = Store.getSwap(classId, swap.partnerDay, swap.partnerPeriod, partnerDate);
          if (partnerLatest && partnerLatest.id === swap.id) {
            Store.popSwap(classId, swap.partnerDay, swap.partnerPeriod, partnerDate);
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
      const partnerDate = swap.partnerDate || date;
      // 상대 교시가 그 뒤에 또 교체됐을 수 있으므로 같은 id의 항목만 정확히 지운다.
      Store.removeSwapById(classId, swap.partnerDay, swap.partnerPeriod, partnerDate, swap.id);
      Store.removeSwapById(classId, day, period, date, swap.id);
    }
    ModalUI.close();
    TimetableUI.renderDaily();
  }

  const MANUAL_VALUE = '__manual__';

  // date가 주어지면 그 날짜에 실제로 표시되는 내용(이미 교체/보강된 경우 그 결과)을 우선 사용하고,
  // 없으면 기본 시간표 값을 사용한다. 대체할 과목 후보가 "이미 지나간 원래 과목"이 아니라 "그날 실제로
  // 진행되는 과목"이 되도록 하기 위함이다. excludeDay/excludePeriod가 주어지면 그 교시 자신은 후보에서
  // 빼서, 지금 교체하려는 자리를 자기 자신으로 "대체"하는 자기참조를 막는다.
  function subjectOptionsForDay(classId, dayIdx, date, excludeDay, excludePeriod) {
    const periodCount = Store.get().settings.periodCount;
    const opts = [];
    for (let p = 1; p <= periodCount; p++) {
      if (dayIdx === excludeDay && p === excludePeriod) continue;
      const base = Store.getBaseCell(classId, dayIdx, p);
      const swap = date ? Store.getSwap(classId, dayIdx, p, date) : null;
      const effective = swap || base;
      if (effective) opts.push({ period: p, subject: effective.subject, teacher: effective.teacher });
    }
    return opts;
  }

  function findDayForSubject(classId, subject, teacher, viewDate, excludeDay, excludePeriod, preferredDate) {
    if (!subject) return -1;
    for (let d = 0; d < DAY_NAMES.length; d++) {
      // 요일마다 그 요일에 해당하는 실제 날짜로 조회해야 그 날 교체된 내용까지 찾을 수 있다.
      const dayDate = (preferredDate && dateToWeekdayIndex(preferredDate) === d)
        ? preferredDate
        : nearestDateForWeekday(viewDate, d);
      if (subjectOptionsForDay(classId, d, dayDate, excludeDay, excludePeriod).some(o => o.subject === subject && o.teacher === teacher)) return d;
    }
    return -1;
  }

  // 대체할 과목 목록을 "어느 날짜" 기준으로 보여줄지 정한다.
  // 보강 일자를 정했고 그 요일이 고른 요일과 같으면 그 날짜를 쓴다 — 실제로 그 수업을 빌려오는 날이
  // 보강 일자이므로, 그 날 이미 교체된 과목이 후보에 그대로 나와야 한다.
  // 아직 안 정했으면 고른 요일에 해당하는 같은 주 날짜를 쓴다.
  // (예전에는 지금 보고 있는 날짜로만 조회해서, 다른 요일의 교체 내용이 전혀 반영되지 않았다.
  //  교체 기록은 (요일·교시·날짜)로 저장되므로 요일이 다른 날짜로 조회하면 항상 빈 값이 나온다.)
  function resolveSourceDate(sourceDay, viewDate) {
    const mk = document.getElementById('f-makeup-date');
    const mkVal = mk ? mk.value : '';
    if (mkVal && dateToWeekdayIndex(mkVal) === sourceDay) return mkVal;
    return nearestDateForWeekday(viewDate, sourceDay);
  }

  function refreshSubjectSelect(classId, dayIdx, presetSubject, presetTeacher, fallbackPeriod, date, excludeDay, excludePeriod) {
    const opts = subjectOptionsForDay(classId, dayIdx, date, excludeDay, excludePeriod);
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
      ? (() => {
        const found = findDayForSubject(classId, existing.subject, existing.teacher, date, day, period,
          existingMakeup ? existingMakeup.date : '');
        return found >= 0 ? found : day;
      })()
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
        <p class="sheet-hint">아래 <b>보강 일자</b>를 정하면, 그 날짜에 실제로 진행되는 과목(그날 이미 교체된 과목 포함)으로 이 목록이 다시 채워집니다.</p>
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
        <p class="sheet-hint">보강 교시는 위에서 고른 대체 과목이 있는 교시로 자동으로 채워지고, 보강 날짜에는 원래 결강됐던 과목("${TimetableUI.escapeHtml(previousEffective.subject)} · ${TimetableUI.escapeHtml(previousEffective.teacher)}")이 그대로 보강 표시됩니다. 보강 일자만 정해주세요.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save">저장</button>
      </div>
    `;
    ModalUI.open(html, 'modal-wide');

    refreshSubjectSelect(classId, initialSourceDay, existing ? existing.subject : '', existing ? existing.teacher : '',
      period, resolveSourceDate(initialSourceDay, date), day, period);

    document.getElementById('f-source-day').addEventListener('change', (e) => {
      const sourceDay = Number(e.target.value);
      // 보강 일자를 이미 정해뒀는데 요일이 어긋나면, 그 요일에 맞는 날짜로 따라가게 한다.
      const mk = document.getElementById('f-makeup-date');
      if (mk.value && dateToWeekdayIndex(mk.value) !== sourceDay) {
        mk.value = nearestDateForWeekday(mk.value, sourceDay);
      }
      refreshSubjectSelect(classId, sourceDay, '', '', period, resolveSourceDate(sourceDay, date), day, period);
    });

    // 보강 일자를 정하면 그 날짜에 실제로 있는 과목(그날 이미 교체된 과목 포함)이 후보로 채워진다.
    document.getElementById('f-makeup-date').addEventListener('change', (e) => {
      const mkDay = dateToWeekdayIndex(e.target.value);
      if (mkDay < 0) return; // 주말 등 요일을 특정할 수 없으면 목록은 그대로 둔다
      const daySel = document.getElementById('f-source-day');
      // 요일이 그대로면 고르던 과목을 유지하고, 요일이 바뀌면 그 날 후보 중 첫 번째로 새로 고른다.
      // (요일이 바뀌었는데 이전 선택을 남기면 그 과목이 새 요일에 없어 조용히 "직접 입력"으로
      //  넘어가 버려, 목록에 없는 과목이 저장되는 사고가 난다.)
      const sameDay = Number(daySel.value) === mkDay;
      const prev = document.getElementById('f-subject-select').value;
      const keep = (sameDay && prev && prev !== MANUAL_VALUE) ? prev.split('||') : null;
      daySel.value = String(mkDay);
      refreshSubjectSelect(classId, mkDay, keep ? keep[1] : '', keep ? keep[2] : '',
        period, resolveSourceDate(mkDay, date), day, period);
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
        let logId = existing.logId;
        if (existing.reason !== reason) {
          const moved = SwapLog.relocateRowForReason(existing.logId, existing.rowId, {
            reason, date: swapDate, absentTeacher: previousEffective.teacher
          });
          logId = moved.logId;
        }
        if (existing.makeup) removeMakeupMarker(classId, existing.id, day, period, swapDate, existing.makeup);
        record = { ...existing, reason, subject, teacher, grade, makeup, logId };
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

      // 보강은 대체 과목이 있는 교시를 "빌려서" 진행되지만, 보강에서 실제로 가르치는 내용은 그 교시에
      // 대신 들어온 대체 과목이 아니라 원래 결강됐던 과목(previousEffective)이다.
      if (record.makeup) upsertMakeupMarker(classId, record.id, day, period, swapDate, record.makeup, previousEffective);
      ModalUI.close();
      TimetableUI.renderDaily();
      showLogToast(record.logId);
    });
  }

  function exchangeCandidates(classId, targetDay, targetDate, excludeDay, excludePeriod) {
    const periodCount = Store.get().settings.periodCount;
    const opts = [];
    for (let p = 1; p <= periodCount; p++) {
      if (targetDay === excludeDay && p === excludePeriod) continue;
      const b = Store.getBaseCell(classId, targetDay, p);
      const s = Store.getSwap(classId, targetDay, p, targetDate);
      const eff = s || b;
      if (eff) opts.push({ period: p, base: eff });
    }
    return opts;
  }

  function exchangeOptionsHtml(candidates) {
    if (!candidates.length) return `<option value="">교체할 과목이 없습니다</option>`;
    return candidates.map(c =>
      `<option value="${c.period}">${c.period}교시 · ${TimetableUI.escapeHtml(c.base.subject)} · ${TimetableUI.escapeHtml(c.base.teacher)}</option>`
    ).join('');
  }

  function openExchangeModal(classId, day, period, date) {
    const base = Store.getBaseCell(classId, day, period);
    const currentSwap = Store.getSwap(classId, day, period, date);
    const effective = currentSwap || base;

    const initialCandidates = exchangeCandidates(classId, day, date, day, period);

    const html = `
      <div class="modal-header"><h3>${className(classId)} · ${formatShortDate(date)}(${DAY_NAMES[day]}) ${period}교시 - 다른 교시와 교체</h3>
        <button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="sheet-current">기존: ${TimetableUI.escapeHtml(effective.subject)} · ${TimetableUI.escapeHtml(effective.teacher)}</p>
        <!-- 대부분은 같은 날 교체이므로 요일·날짜는 접어두고, 다른 날짜와 바꿀 때만 펼친다.
             (숨겨져 있어도 값은 지금 보고 있는 날짜로 채워져 있어 저장 로직은 그대로 동작한다) -->
        <div id="cross-day-fields" hidden>
          <div class="form-grid">
            <label>바꿀 요일
              <select id="f-target-day">${DAY_NAMES.map((d, i) => `<option value="${i}" ${i === day ? 'selected' : ''}>${d}요일</option>`).join('')}</select>
            </label>
            <label>바꿀 날짜<input type="date" id="f-target-date" value="${date}"></label>
          </div>
        </div>
        <label>바꿀 교시
          <select id="f-target-period">${exchangeOptionsHtml(initialCandidates)}</select>
        </label>
        <button type="button" class="btn-link" id="btn-toggle-cross-day">📅 다른 날짜의 교시와 바꾸기</button>
        <p class="sheet-hint">같은 날 ${formatShortDate(date)}(${DAY_NAMES[day]}) 안에서 두 교시를 서로 맞바꿉니다. 맞바꾸기는 결강이 아니므로 수업 교체일지는 작성되지 않습니다.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="btn-save">교체</button>
      </div>
    `;
    ModalUI.open(html);

    function refreshTargetPeriod() {
      const targetDay = Number(document.getElementById('f-target-day').value);
      const targetDate = document.getElementById('f-target-date').value;
      const cands = exchangeCandidates(classId, targetDay, targetDate, day, period);
      document.getElementById('f-target-period').innerHTML = exchangeOptionsHtml(cands);
    }

    document.getElementById('btn-toggle-cross-day').addEventListener('click', (e) => {
      document.getElementById('cross-day-fields').hidden = false;
      e.target.remove(); // 한 번 펼치면 링크는 감춘다
    });

    document.getElementById('f-target-day').addEventListener('change', (e) => {
      const targetDay = Number(e.target.value);
      const currentTargetDate = document.getElementById('f-target-date').value || date;
      document.getElementById('f-target-date').value = nearestDateForWeekday(currentTargetDate, targetDay);
      refreshTargetPeriod();
    });
    document.getElementById('f-target-date').addEventListener('change', refreshTargetPeriod);

    document.getElementById('btn-save').addEventListener('click', () => {
      const swapDate = date;
      const targetDay = Number(document.getElementById('f-target-day').value);
      const targetDate = document.getElementById('f-target-date').value;
      const targetPeriodVal = document.getElementById('f-target-period').value;
      if (!targetDate) { alert('바꿀 날짜를 입력해주세요.'); return; }
      if (!targetPeriodVal) { alert('바꿀 교시를 선택해주세요. (그 요일·날짜에 교체할 과목이 없다면 다른 요일/날짜를 골라주세요.)'); return; }
      const targetPeriod = Number(targetPeriodVal);

      if (targetDay === day && targetDate === swapDate && targetPeriod === period) {
        alert('지금 교체하려는 교시 자신은 대상으로 고를 수 없습니다.');
        return;
      }
      // 이미 교체(다른 날짜와의 맞바꿈 포함)된 교시도 대상으로 고를 수 있다. 이때 맞바꾸는 내용은
      // 원래(기본) 과목이 아니라 그 날짜에 지금 실제로 그 자리에 있는 과목이어야 한다 —
      // 목록에 보여준 내용과 실제로 바뀌는 내용이 같아야 하기 때문이다.
      const targetSwap = Store.getSwap(classId, targetDay, targetPeriod, targetDate);
      const targetEffective = targetSwap || Store.getBaseCell(classId, targetDay, targetPeriod);
      if (!targetEffective) { alert('그 교시에는 과목이 없습니다.'); return; }

      // 지금 이 교시와 이미 맞바꾼 상대를 또 대상으로 고르면 사실상 되돌리기라 혼란스럽다.
      if (currentSwap && currentSwap.type === 'exchange'
          && currentSwap.partnerDay === targetDay
          && currentSwap.partnerPeriod === targetPeriod
          && (currentSwap.partnerDate || date) === targetDate) {
        alert('이미 이 교시와 맞바꾼 상대입니다. 되돌리시려면 "교체 취소"를 사용해주세요.');
        return;
      }

      const swapId = uid();
      Store.pushSwap(classId, day, period, swapDate, {
        id: swapId, type: 'exchange', date: swapDate,
        subject: targetEffective.subject, teacher: targetEffective.teacher,
        partnerDay: targetDay, partnerPeriod: targetPeriod, partnerDate: targetDate
      });
      Store.pushSwap(classId, targetDay, targetPeriod, targetDate, {
        id: swapId, type: 'exchange', date: targetDate,
        subject: effective.subject, teacher: effective.teacher,
        partnerDay: day, partnerPeriod: period, partnerDate: swapDate
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

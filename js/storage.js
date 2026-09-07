const Store = (() => {
  let state = load();
  migrateLegacyTimetable();
  migrateEmbeddedSwaps();
  migrateSwapChains();
  const changeListeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch (e) {
      console.error('저장된 데이터를 불러오지 못했습니다.', e);
      return defaultState();
    }
  }

  // Firebase Realtime Database는 "빈 배열/빈 객체"를 아예 저장하지 않고 키째로 지운다.
  // 그래서 행이 0개인 교체일지를 저장했다가 다시 받아오면 log.rows 가 undefined 로 돌아오고,
  // rows.length 를 읽는 곳(일지 목록 렌더링, 일지 합치기 판단)에서 앱이 통째로 멈춘다.
  // 또 배열 중간이 비면 {"0":..,"2":..} 같은 객체로 바뀌어 돌아오기도 한다.
  // 어디서 데이터가 들어오든(로컬 저장소·다른 기기) 이 함수를 거쳐 형태를 바로잡는다.
  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).sort((a, b) => a - b).map(k => v[k]);
    return [];
  }

  function toObject(v) {
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  }

  function normalizeState(raw) {
    const s = { ...defaultState(), ...(raw && typeof raw === 'object' ? raw : {}) };
    s.settings = { ...defaultState().settings, ...toObject(s.settings) };
    s.classes = toArray(s.classes);
    s.timetables = toObject(s.timetables);
    s.swaps = toObject(s.swaps);
    s.logs = toArray(s.logs).map(log => ({ ...log, rows: toArray(log && log.rows) }));
    Object.keys(s.timetables).forEach(classId => {
      s.timetables[classId] = toObject(s.timetables[classId]);
    });
    Object.keys(s.swaps).forEach(classId => {
      const cellMap = toObject(s.swaps[classId]);
      s.swaps[classId] = cellMap;
      Object.keys(cellMap).forEach(cell => {
        const dateMap = toObject(cellMap[cell]);
        cellMap[cell] = dateMap;
        Object.keys(dateMap).forEach(date => { dateMap[date] = toArray(dateMap[date]); });
      });
    });
    return s;
  }

  function migrateLegacyTimetable() {
    if (!state.timetable || state.classes.length > 0) {
      if (state.timetable) delete state.timetable;
      return;
    }
    const byGrade = {};
    Object.entries(state.timetable).forEach(([key, cell]) => {
      const name = (cell.grade || '').trim() || '기본 학급';
      if (!byGrade[name]) byGrade[name] = {};
      byGrade[name][key] = cell;
    });
    Object.entries(byGrade).forEach(([name, cells]) => {
      const id = uid();
      state.classes.push({ id, name });
      state.timetables[id] = cells;
    });
    state.activeClassId = state.classes[0] ? state.classes[0].id : null;
    delete state.timetable;
    save();
  }

  function migrateEmbeddedSwaps() {
    let changed = false;
    state.classes.forEach(cls => {
      const table = state.timetables[cls.id];
      if (!table) return;
      if (!state.swaps[cls.id]) state.swaps[cls.id] = {};
      Object.entries(table).forEach(([key, cell]) => {
        if (cell && cell.swap) {
          const s = cell.swap;
          if (!state.swaps[cls.id][key]) state.swaps[cls.id][key] = {};
          state.swaps[cls.id][key][s.date] = {
            id: s.id || uid(),
            type: 'substitute',
            date: s.date,
            reason: s.reason,
            subject: s.subject,
            teacher: s.teacher,
            grade: s.grade,
            makeup: s.makeup,
            logId: s.logId,
            rowId: s.rowId
          };
          delete cell.swap;
          changed = true;
        }
      });
    });
    if (changed) save();
  }

  function migrateSwapChains() {
    let changed = false;
    Object.keys(state.swaps).forEach(classId => {
      const cellMap = state.swaps[classId];
      Object.keys(cellMap).forEach(key => {
        const dateMap = cellMap[key];
        Object.keys(dateMap).forEach(date => {
          if (!Array.isArray(dateMap[date])) {
            dateMap[date] = [dateMap[date]];
            changed = true;
          }
        });
      });
    });
    if (changed) save();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    changeListeners.forEach(fn => fn(state));
  }

  // 다른 기기에서 온 동기화 데이터를 그대로 반영한다(로컬 변경이 아니므로 changeListeners를
  // 호출하지 않는다 — 그러지 않으면 받은 데이터를 다시 서버로 밀어올리는 무한 루프가 생긴다).
  function applyRemoteState(remoteState) {
    state = normalizeState(remoteState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // state가 바뀔 때마다(save() 호출 시) 알림을 받는다. 동기화 모듈이 이걸로 변경 사항을
  // 감지해 서버에 반영한다.
  function onChange(fn) {
    changeListeners.push(fn);
  }

  function get() {
    return state;
  }

  function getClasses() {
    return state.classes;
  }

  function getActiveClassId() {
    return state.activeClassId;
  }

  function setActiveClassId(id) {
    state.activeClassId = id;
    save();
  }

  function addClass(name) {
    const cls = { id: uid(), name };
    state.classes.push(cls);
    state.timetables[cls.id] = {};
    state.swaps[cls.id] = {};
    if (!state.activeClassId) state.activeClassId = cls.id;
    save();
    return cls;
  }

  function renameClass(id, name) {
    const cls = state.classes.find(c => c.id === id);
    if (cls) { cls.name = name; save(); }
  }

  function removeClass(id) {
    state.classes = state.classes.filter(c => c.id !== id);
    delete state.timetables[id];
    delete state.swaps[id];
    if (state.activeClassId === id) {
      state.activeClassId = state.classes[0] ? state.classes[0].id : null;
    }
    save();
  }

  function getBaseCell(classId, dayIdx, period) {
    const table = state.timetables[classId];
    return (table && table[cellKey(dayIdx, period)]) || null;
  }

  function setBaseCell(classId, dayIdx, period, data) {
    if (!state.timetables[classId]) state.timetables[classId] = {};
    state.timetables[classId][cellKey(dayIdx, period)] = data;
    save();
  }

  function removeBaseCell(classId, dayIdx, period) {
    const key = cellKey(dayIdx, period);
    if (state.timetables[classId]) delete state.timetables[classId][key];
    if (state.swaps[classId]) delete state.swaps[classId][key];
    save();
  }

  function getSwapChain(classId, dayIdx, period, date) {
    const cellSwaps = state.swaps[classId] && state.swaps[classId][cellKey(dayIdx, period)];
    const chain = cellSwaps && cellSwaps[date];
    return Array.isArray(chain) ? chain : [];
  }

  function getSwap(classId, dayIdx, period, date) {
    const chain = getSwapChain(classId, dayIdx, period, date);
    return chain.length ? chain[chain.length - 1] : null;
  }

  function getSwapsForCell(classId, dayIdx, period) {
    return (state.swaps[classId] && state.swaps[classId][cellKey(dayIdx, period)]) || {};
  }

  function pushSwap(classId, dayIdx, period, date, record) {
    if (!state.swaps[classId]) state.swaps[classId] = {};
    const key = cellKey(dayIdx, period);
    if (!state.swaps[classId][key]) state.swaps[classId][key] = {};
    const chain = Array.isArray(state.swaps[classId][key][date]) ? state.swaps[classId][key][date] : [];
    chain.push(record);
    state.swaps[classId][key][date] = chain;
    save();
  }

  function replaceLastSwap(classId, dayIdx, period, date, record) {
    const chain = getSwapChain(classId, dayIdx, period, date);
    if (!chain.length) return;
    chain[chain.length - 1] = record;
    save();
  }

  function popSwap(classId, dayIdx, period, date) {
    const key = cellKey(dayIdx, period);
    const chain = state.swaps[classId] && state.swaps[classId][key] && state.swaps[classId][key][date];
    if (!Array.isArray(chain) || !chain.length) return null;
    const popped = chain.pop();
    if (chain.length === 0) delete state.swaps[classId][key][date];
    save();
    return popped;
  }

  // 체인에서 특정 id의 항목만 골라 지운다. 맞바꾸기를 되돌릴 때 상대 교시가 그 뒤에 또 교체돼
  // 마지막 항목이 다른 것으로 바뀌어 있을 수 있으므로, 무조건 마지막을 빼면 엉뚱한 교체가 지워진다.
  function removeSwapById(classId, dayIdx, period, date, swapId) {
    const key = cellKey(dayIdx, period);
    const chain = state.swaps[classId] && state.swaps[classId][key] && state.swaps[classId][key][date];
    if (!Array.isArray(chain)) return null;
    const idx = chain.findIndex(s => s.id === swapId);
    if (idx < 0) return null;
    const [removed] = chain.splice(idx, 1);
    if (chain.length === 0) delete state.swaps[classId][key][date];
    save();
    return removed;
  }

  function updateSwapInChain(classId, dayIdx, period, date, swapId, patchFn) {
    const chain = getSwapChain(classId, dayIdx, period, date);
    const entry = chain.find(s => s.id === swapId);
    if (!entry) return null;
    patchFn(entry);
    save();
    return entry;
  }

  function removeSwap(classId, dayIdx, period, date) {
    const key = cellKey(dayIdx, period);
    if (state.swaps[classId] && state.swaps[classId][key]) {
      delete state.swaps[classId][key][date];
    }
    save();
  }

  function resetSemester() {
    state.classes.forEach(cls => {
      state.swaps[cls.id] = {};
      state.timetables[cls.id] = {};
    });
    save();
  }

  function setPeriodCount(n) {
    state.settings.periodCount = n;
    save();
  }

  // 이 브라우저(기기)의 데이터를 JSON 문자열로 내보낸다. 다른 PC/브라우저로 파일을 옮겨
  // importState로 불러오면 그 기기에서도 동일한 데이터를 이어서 쓸 수 있다.
  function exportState() {
    return JSON.stringify(state, null, 2);
  }

  // 내보낸 JSON을 불러와 현재 데이터를 완전히 대체한다. 형식이 올바르지 않으면 아무것도
  // 바꾸지 않고 에러를 던진다(호출부에서 사용자에게 안내).
  function importState(jsonStr) {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('올바른 JSON 파일이 아닙니다.');
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.classes)) {
      throw new Error('이 앱에서 내보낸 파일이 아닌 것 같습니다.');
    }
    state = normalizeState(parsed);
    save();
  }

  function addLog(log) {
    state.logs.unshift(log);
    save();
    return log;
  }

  function getLog(id) {
    return state.logs.find(l => l.id === id) || null;
  }

  function updateLog(id, updater) {
    const log = getLog(id);
    if (!log) return null;
    updater(log);
    log.updatedAt = Date.now();
    save();
    return log;
  }

  function removeLog(id) {
    state.logs = state.logs.filter(l => l.id !== id);
    save();
  }

  return {
    get, save, onChange, applyRemoteState,
    getClasses, getActiveClassId, setActiveClassId, addClass, renameClass, removeClass,
    getBaseCell, setBaseCell, removeBaseCell,
    getSwap, getSwapChain, getSwapsForCell, pushSwap, replaceLastSwap, popSwap, removeSwap, removeSwapById, updateSwapInChain, resetSemester,
    setPeriodCount,
    exportState, importState,
    addLog, getLog, updateLog, removeLog
  };
})();

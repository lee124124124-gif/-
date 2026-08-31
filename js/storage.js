const Store = (() => {
  let state = load();
  migrateLegacyTimetable();
  migrateEmbeddedSwaps();
  migrateSwapChains();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch (e) {
      console.error('저장된 데이터를 불러오지 못했습니다.', e);
      return defaultState();
    }
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
    state.classes.forEach(cls => { state.swaps[cls.id] = {}; });
    save();
  }

  function setPeriodCount(n) {
    state.settings.periodCount = n;
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
    get, save,
    getClasses, getActiveClassId, setActiveClassId, addClass, renameClass, removeClass,
    getBaseCell, setBaseCell, removeBaseCell,
    getSwap, getSwapChain, getSwapsForCell, pushSwap, replaceLastSwap, popSwap, removeSwap, updateSwapInChain, resetSemester,
    setPeriodCount,
    addLog, getLog, updateLog, removeLog
  };
})();

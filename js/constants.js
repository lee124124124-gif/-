// PDF 양식(2026. 수업교체일지.pdf) 하단에 명시된 사유 목록 — 절대 임의 추가/변경 금지
const SWAP_REASONS = [
  '출장', '연가', '조퇴', '외출', '공가', '지각',
  '특휴', '병가', '병조퇴', '병외출', '기상악화',
  '선박 일정에 따른 교육과정 운영 조정'
];

const DAY_NAMES = ['월', '화', '수', '목', '금'];

const STORAGE_KEY = 'classSwapApp.v1';

function defaultState() {
  return {
    settings: { periodCount: 7 },
    classes: [],
    activeClassId: null,
    timetables: {},
    swaps: {},
    logs: []
  };
}

function cellKey(dayIdx, period) {
  return `${dayIdx}-${period}`;
}

function dateToDayOfWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

function dateToWeekdayIndex(dateStr) {
  if (!dateStr) return -1;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return -1;
  const idx = d.getDay() - 1; // Mon=0 .. Fri=4
  return (idx >= 0 && idx <= 4) ? idx : -1;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

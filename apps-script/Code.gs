/**
 * One More Turn — Google Apps Script collector.
 * Bind this script to YOUR PRIVATE Google Sheet. Run setup() once as the owner.
 * Deploy as Web app: Execute as Me; access Anyone.
 * No endpoint returns participant rows or spreadsheet identifiers.
 */
const STUDY_ID = 'one-more-turn-v1';
const HEADERS = {
  Sessions: ['session_id','Версия','Начало UTC','Последняя запись UTC','Конец UTC','Статус','Причина завершения','Активное время, сек','Монеты в рюкзаке','Всего добыто','Удары','Переходы','Удары при лучшей альтернативе','Разница дохода, монеты','Причина игрока','revision','last_event_seq'],
  Mines: ['mine_key','session_id','Участок','Название','Удары','Уровень оборудования','Вложено монет','Добыто монет','Вход, активные сек','Выход, активные сек','Время на участке, сек','Лучшая альтернатива с, сек','Дополнительные удары','Разница дохода, монеты','Покинут'],
  Events: ['event_key','session_id','Номер','Действие','Время UTC','Активное время, сек','Участок','Монеты в рюкзаке','Доход после действия','Добыто за удар','Была лучшая альтернатива','Цена улучшения','Уровень','С какого участка','Причина']
};
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open Apps Script from Extensions in your Google Sheet.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  Object.keys(HEADERS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
      sheet.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold').setBackground('#1d5147').setFontColor('#ffffff').setWrap(true);
      sheet.setFrozenRows(1); sheet.setRowHeight(1, 46);
      sheet.setColumnWidths(1, HEADERS[name].length, 155);
      sheet.setColumnWidth(1, 300);
      sheet.getRange(1, 1, 1, HEADERS[name].length).createFilter();
    } else if (sheet.getRange(1, 1).getValue() !== HEADERS[name][0]) {
      throw new Error('Sheet ' + name + ' already contains other data. Use a new empty spreadsheet.');
    }
  });
  console.log('Ready. Keep this spreadsheet private. Deploy as a Web app.');
}
function json_(data, callback) {
  const value = JSON.stringify(data).replace(/</g, '\\u003c');
  if (callback && /^__omt_[a-z0-9]{20}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + value + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(value).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'health') {
    let ready = false;
    try {
      const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (id && p.study === STUDY_ID) {
        const ss = SpreadsheetApp.openById(id);
        ready = Object.keys(HEADERS).every(name => !!ss.getSheetByName(name));
      }
    } catch (_) {}
    return json_({ ready: ready }, p.callback);
  }
  if (p.action === 'ack' && /^[a-f0-9]{64}$/.test(p.receipt || '')) {
    const receipt = CacheService.getScriptCache().get('ack_' + p.receipt);
    return json_({ revision: receipt ? Number(receipt) : 0 }, p.callback);
  }
  return json_({ service: 'one-more-turn', accepts: 'POST' }, p.callback);
}
function number_(n, max) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max; }
function integer_(n, max) { return number_(n, max) && Number.isInteger(n); }
function validate_(p) {
  if (!p || p.study !== STUDY_ID || !/^[a-f0-9]{64}$/.test(p.receipt || '') || !integer_(p.revision, 100000) || p.revision < 1) throw new Error('envelope');
  const s = p.session;
  if (!s || !/^[a-f0-9-]{36}$/.test(s.id || '') || s.version !== '1.0.0') throw new Error('session');
  if (!['playing','finished'].includes(s.status) || !['','voluntary','time_limit'].includes(s.finishReason)) throw new Error('status');
  if (!number_(s.activeMs, 900000) || !integer_(s.hits, 5000) || !integer_(s.switches, 500) ||
      !integer_(s.wallet, 100000) || !integer_(s.earned, 100000) || !integer_(s.extraHits, 5000) ||
      !integer_(s.missedCoins, 100000) || !number_(s.startedAt, 5000000000000)) throw new Error('metrics');
  if (s.endedAt !== null && !number_(s.endedAt, 5000000000000)) throw new Error('end');
  if (!Array.isArray(s.mines) || s.mines.length < 1 || s.mines.length > 500 || !Array.isArray(p.events) || p.events.length > 100) throw new Error('size');
  const names = ['Медная лощина','Тихий грот','Янтарный разлом','Северная жила','Зелёный склон','Лунная пещера'];
  s.mines.forEach((m, i) => {
    if (m.index !== i + 1 || !names.includes(m.name) || !integer_(m.hits, 5000) || !integer_(m.level, 3) ||
        !integer_(m.invested, 114) || !integer_(m.earned, 100000) || !number_(m.enteredMs, 900000) ||
        (m.leftMs !== null && !number_(m.leftMs, 900000)) || (m.betterAtMs !== null && !number_(m.betterAtMs, 900000)) ||
        !integer_(m.extraHits, 5000) || !integer_(m.missedCoins, 100000)) throw new Error('mine');
  });
  const types = ['start','resume','page_reopened','dig','upgrade','switch','finish','reason','hidden','visible'];
  const reasons = ['voluntary','time_limit','enough','bored','time','other'];
  p.events.forEach((event, i) => {
    if (!integer_(event.seq, 10000) || event.seq < 1 || !types.includes(event.type) || !number_(event.at, 5000000000000) ||
        !number_(event.activeMs, 900000) || !integer_(event.mine, 500) || !integer_(event.wallet, 100000) ||
        !integer_(event.income, 9) || (i && event.seq !== p.events[i-1].seq + 1)) throw new Error('event');
    if (event.reason !== undefined && !reasons.includes(event.reason)) throw new Error('reason');
    ['value','cost','level','from'].forEach(key => { if (event[key] !== undefined && !integer_(event[key], 10000)) throw new Error('detail'); });
    if (event.alternativeBetter !== undefined && typeof event.alternativeBetter !== 'boolean') throw new Error('alternative');
  });
  return p;
}
function rows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}
function upsert_(sheet, rows) {
  const existing = rows_(sheet), indices = {};
  existing.forEach((row, i) => { indices[row[0]] = i; });
  const additions = [];
  rows.forEach(row => {
    const index = indices[row[0]];
    if (index === undefined) { additions.push(row); }
    else if (JSON.stringify(existing[index]) !== JSON.stringify(row)) sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);
  });
  if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, additions[0].length).setValues(additions);
}
function appendEvents_(sheet, rows) {
  if (!rows.length) return;
  const count = Math.max(0, sheet.getLastRow() - 1);
  const keys = new Set(count ? sheet.getRange(2, 1, count, 1).getValues().map(row => row[0]) : []);
  const fresh = rows.filter(row => !keys.has(row[0]));
  if (fresh.length) sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, fresh[0].length).setValues(fresh);
}
function eventRow_(s, e) {
  return [s.id + ':' + e.seq, s.id, e.seq, e.type, new Date(e.at).toISOString(), e.activeMs / 1000,
    e.mine, e.wallet, e.income, e.value === undefined ? '' : e.value,
    e.alternativeBetter === undefined ? '' : e.alternativeBetter, e.cost === undefined ? '' : e.cost,
    e.level === undefined ? '' : e.level, e.from === undefined ? '' : e.from, e.reason || ''];
}
function ingest_(p, ss) {
  const s = p.session, sessions = ss.getSheetByName('Sessions'), mines = ss.getSheetByName('Mines'), events = ss.getSheetByName('Events');
  if (!sessions || !mines || !events) throw new Error('Run setup first');
  const prior = rows_(sessions).find(row => row[0] === s.id);
  const previousRevision = prior ? Number(prior[15]) : 0, previousSeq = prior ? Number(prior[16]) : 0;
  if (previousRevision >= p.revision) return previousRevision;
  const fresh = p.events.filter(e => e.seq > previousSeq);
  if (fresh.length && fresh[0].seq !== previousSeq + 1) throw new Error('event gap');
  // Upserts are retry-safe even if a previous invocation stopped between sheet writes.
  appendEvents_(events, fresh.map(e => eventRow_(s, e)));
  upsert_(mines, s.mines.map(m => [s.id + ':' + m.index, s.id, m.index, m.name, m.hits, m.level, m.invested, m.earned,
    m.enteredMs / 1000, m.leftMs === null ? '' : m.leftMs / 1000,
    ((m.leftMs === null ? s.activeMs : m.leftMs) - m.enteredMs) / 1000,
    m.betterAtMs === null ? '' : m.betterAtMs / 1000, m.extraHits, m.missedCoins, m.leftMs !== null]));
  const reasonEvent = p.events.filter(e => e.type === 'reason').pop();
  const reason = reasonEvent ? reasonEvent.reason : (prior ? prior[14] : '');
  const lastSeq = fresh.length ? fresh[fresh.length - 1].seq : previousSeq;
  upsert_(sessions, [[s.id, s.version, new Date(s.startedAt).toISOString(), new Date().toISOString(),
    s.endedAt === null ? '' : new Date(s.endedAt).toISOString(), s.status, s.finishReason,
    s.activeMs / 1000, s.wallet, s.earned, s.hits, s.switches, s.extraHits, s.missedCoins, reason, p.revision, lastSeq]]);
  SpreadsheetApp.flush();
  return p.revision;
}
function doPost(e) {
  let lock;
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (typeof raw !== 'string' || raw.length > 180000) throw new Error('payload');
    const p = validate_(JSON.parse(raw));
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('setup');
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    const revision = ingest_(p, SpreadsheetApp.openById(id));
    CacheService.getScriptCache().put('ack_' + p.receipt, String(revision), 21600);
    return json_({ accepted: true });
  } catch (error) {
    console.warn('Collector rejected request: ' + String(error.message).slice(0, 120));
    return json_({ accepted: false });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

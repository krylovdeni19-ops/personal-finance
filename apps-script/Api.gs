function fail(code, message) {
  const error = new Error(message);
  error.apiCode = code;
  throw error;
}
function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return json({ok:false, error:{code:'UNAUTHORIZED',message:'Передайте токен в теле POST.'}}); }
function doPost(e) {
  try {
    let req;
    try { req = JSON.parse(e.postData.contents); } catch (_) { fail('BAD_REQUEST','Ожидается JSON.'); }
    if (!req || typeof req !== 'object' || typeof req.action !== 'string') fail('BAD_REQUEST','Укажите метод API.');
    if (!req.token || req.token !== rows('Настройки').find(row => row[0] === 'token')?.[1]) fail('UNAUTHORIZED','Проверьте токен.');
    const data = req.data || {};
    const operations = {
      'connection.check': () => ({url:book().getUrl(),schema:1}),
      'sync.pull': () => ({transactions:listTransactions(data), directory:getDirectory(),rules:getRules(),loans:listLoans(),dashboard:dashboard(data),budget:budget(data.budget || data),schedule:schedule(),transactionIds:rows('Транзакции').map(row=>row[0]).filter(Boolean),linkedPayments:rows('Привязки').map(row=>row[2]).filter(Boolean)}),
      'backup.get': () => ({transactions:listTransactions({}),directory:getDirectory(),rules:getRules(),loans:listLoans(),schedule:schedule(),plans:planRows(),prepayments:rows('Досрочные погашения'),links:rows('Привязки')}),
      'transactions.list': () => listTransactions(data),
      'transactions.updateCategory': () => updateCategory(data),
      'import.preview': () => prepareImport(data, false),
      'import.commit': () => prepareImport(data, true),
      'directory.list': getDirectory,
      'directory.save': () => saveDirectory(data),
      'directory.delete': () => deleteDirectory(data),
      'rules.list': getRules,
      'rules.save': () => saveRule(data),
      'dashboard.get': () => dashboard(data),
      'budget.get': () => budget(data),
      'budget.savePlan': () => savePlan(data),
      'loans.list': listLoans,
      'loans.save': () => saveLoan(data),
      'loans.schedule': () => schedule(data.id),
      'loans.previewPrepayment': () => previewPrepayment(data),
      'loans.recordPrepayment': () => recordPrepayment(data),
      'loans.linkTransaction': () => linkOperation(data)
    };
    if (!Object.prototype.hasOwnProperty.call(operations, req.action)) fail('UNKNOWN_METHOD','Неизвестный метод.');
    const mutations = /\.(commit|save|delete|updateCategory|savePlan|recordPrepayment|linkTransaction)$/;
    if (!mutations.test(req.action)) return json({ok:true,data:operations[req.action]()});
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail('BUSY','Таблица занята. Повторите запрос.');
    try {
      const result = applyChange(req, operations[req.action]);
      SpreadsheetApp.flush();
      return json({ok:true,data:result});
    } finally { lock.releaseLock(); }
  } catch (error) {
    return json({ok:false,error:{code:error.apiCode || 'SERVER_ERROR',message:error.apiCode ? error.message : 'Не удалось обработать запрос. Проверьте журнал Apps Script.'}});
  }
}
let mutationId = null;
function applyChange(req, run) {
  const m = req.change;
  if (!m) return run();
  if (!m.id || !m.key || !Number.isFinite(m.at)) fail('BAD_REQUEST','Некорректные данные синхронизации.');
  const all = rows('Синхронизация');
  const index = all.findIndex(row => row[0] === m.key);
  const previous = all[index];
  if (previous && previous[2] === m.id) return {replayed:true};
  if (previous && (previous[1] > m.at || (previous[1] === m.at && String(previous[2]) > m.id))) return {conflict:true,applied:false};
  mutationId = hash(String(m.id));
  let result;
  try { result = run(); } finally { mutationId = null; }
  writeRow('Синхронизация', index, [safeText(m.key),m.at,safeText(m.id)]);
  return {...result, conflict:Boolean(previous && previous[1] > (m.base || 0)), applied:true};
}
function safeText(value) {
  const text = String(value ?? '').trim();
  return /^[=+@'-]/.test(text) ? "'" + text : text;
}
function shortText(value, limit) { return String(value ?? '').trim().slice(0,limit); }
function iso(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Europe/Moscow', 'yyyy-MM-dd');
  return String(value || '').slice(0,10);
}
function dateValue(value) {
  const d = iso(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) fail('INVALID_DATE','Укажите дату в формате ГГГГ-ММ-ДД.');
  const v = Utilities.parseDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
  if (iso(v) !== d) fail('INVALID_DATE','Некорректная дата.');
  return v;
}
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function hash(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(byte => ((byte + 256) % 256).toString(16).padStart(2,'0')).join('');
}

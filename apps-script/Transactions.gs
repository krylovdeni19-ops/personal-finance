function transaction(row) {
  return {id:row[0],date:iso(row[1]),description:row[2],amount:row[3],category:row[4],subcategory:row[5],type:row[6]};
}
function listTransactions(data) {
  return rows('Транзакции').filter(row => row[0]).map(transaction)
    .filter(row => (!data.from || row.date >= data.from) && (!data.to || row.date <= data.to))
    .sort((a,b) => b.date.localeCompare(a.date));
}
function transactionId(date, amount, description, type, bank, bankId) {
  const signed=type==='Списание' ? -amount : amount;
  return hash(bankId ? JSON.stringify([bank || '',bankId]) : JSON.stringify([date,signed,String(description).trim().toLowerCase().replace(/\s+/g,' ')]));
}
function prepareImport(data, commit) {
  if (!Array.isArray(data.transactions) || data.transactions.length > 2000) fail('INVALID_IMPORT','Передайте до 2000 операций.');
  const directory = getDirectory();
  const stored = new Map(rows('Транзакции').map(row => [row[0],row]));
  const existing = new Set(stored.keys());
  const retryCandidates = new Map();
  const fresh = [];
  let duplicates = 0;
  for (const input of data.transactions) {
    const when = dateValue(input.date);
    const description = shortText(input.description,1000);
    const amount = money(input.amount);
    const type = input.type;
    if (!description || !Number.isFinite(amount) || amount <= 0 || !['Списание','Пополнение'].includes(type)) fail('INVALID_TRANSACTION','Проверьте описание, сумму и направление операции.');
    const bankId = shortText(input.bankId,200);
    const id = transactionId(iso(when),amount,description,type,input.bank,bankId);
    if (existing.has(id)) {
      duplicates++;
      if (stored.has(id)) retryCandidates.set(id,stored.get(id));
      continue;
    }
    existing.add(id);
    const item = directory.find(x => x.id === input.directoryId && x.active);
    fresh.push([id,when,safeText(description),amount,item?.category || '',item?.subcategory || '',type]);
  }
  const matches = findMatches([...fresh,...retryCandidates.values()]);
  if (commit) {
    const rules = Array.isArray(data.rules) ? data.rules.map(rule => validateRule(rule,directory)) : [];
    append('Транзакции',fresh);
    append('Привязки',matches);
    rules.forEach(persistRule);
  }
  return {
    added:fresh.length,duplicates,
    uncategorized:fresh.filter(row => !row[4]).length,
    matched:matches.length
  };
}
function updateCategory(data) {
  const all = rows('Транзакции');
  const index = all.findIndex(row => row[0] === data.id);
  if (index < 0) fail('NOT_FOUND','Операция не найдена.');
  const item = getDirectory().find(row => row.id === data.directoryId && row.active);
  if (data.directoryId && !item) fail('INVALID_CATEGORY','Подкатегория недоступна.');
  const rule = data.rule ? validateRule({...data.rule,directoryId:data.directoryId},getDirectory()) : null;
  sheet('Транзакции').getRange(index + 2,5,1,2).setValues([[item?.category || '',item?.subcategory || '']]);
  const updated = [...all[index]];
  updated[4] = item?.category || '';
  updated[5] = item?.subcategory || '';
  const oldKind=getDirectory().find(row=>row.category===all[index][4]&&row.subcategory===all[index][5])?.kind;
  if (oldKind !== item?.kind) removeLinks(data.id);
  if (item?.kind === 'payment' || item?.kind === 'early') append('Привязки',findMatches([updated]));
  if (rule) persistRule(rule);
  return {id:data.id};
}

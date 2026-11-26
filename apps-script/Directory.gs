const KINDS = ['regular','own','savings','loan-in','payment','early','interest','fee'];
function getDirectory() {
  return rows('Справочник').filter(row => row[0]).map(row => ({
    id:row[0],category:row[1],subcategory:row[2],keywords:row[3],kind:row[4],active:row[5] !== false
  }));
}
function saveDirectory(data) {
  const all = rows('Справочник');
  const index = all.findIndex(row => row[0] === (data.id || mutationId));
  const before = all[index];
  const category = shortText(data.category,100);
  const subcategory = shortText(data.subcategory,100);
  if (!category || !subcategory || !KINDS.includes(data.kind) || /[=+@'\-]/.test(category[0]) || /[=+@'\-]/.test(subcategory[0])) fail('INVALID_CATEGORY','Укажите допустимые категорию и подкатегорию.');
  if (all.some((row,i) => i !== index && row[1] === category && row[2] === subcategory)) fail('DUPLICATE_CATEGORY','Такая подкатегория уже существует.');
  const id = before?.[0] || mutationId || Utilities.getUuid();
  writeRow('Справочник',index,[id,category,subcategory,safeText(shortText(data.keywords,500)),data.kind,true]);
  if (before && (before[1] !== category || before[2] !== subcategory)) {
    const allTx = rows('Транзакции');
    if (allTx.length) sheet('Транзакции').getRange(2,5,allTx.length,2).setValues(allTx.map(row => row[4] === before[1] && row[5] === before[2] ? [category,subcategory] : [row[4],row[5]]));
    const tab = sheet('Бюджет');
    const plan = planRows();
    if (plan.length) tab.getRange(13,3,plan.length,2).setValues(plan.map(row => row[2] === before[1] && row[3] === before[2] ? [category,subcategory] : [row[2],row[3]]));
  }
  return {id};
}
function deleteDirectory(data) {
  const index = rows('Справочник').findIndex(row => row[0] === data.id);
  if (index < 0) fail('NOT_FOUND','Подкатегория не найдена.');
  sheet('Справочник').getRange(index + 2,6).setValue(false);
  return {id:data.id};
}
function getRules() {
  return rows('Правила').filter(row => row[0]).map(row => ({
    id:row[0],pattern:row[1],directoryId:row[2],priority:row[3],active:row[4] !== false,updated:row[5]
  }));
}
function validateRule(data,directory) {
  const pattern = shortText(data.pattern,150).toLowerCase();
  if (!pattern || !directory.some(row => row.id === data.directoryId && row.active)) fail('INVALID_RULE','Укажите шаблон и активную подкатегорию.');
  return {...data,pattern};
}
function persistRule(data) {
  const all = rows('Правила');
  const index = all.findIndex(row => data.id ? row[0] === data.id : row[1] === data.pattern);
  const id = all[index]?.[0] || Utilities.getUuid();
  writeRow('Правила',index,[id,safeText(data.pattern),data.directoryId,Number(data.priority) || 0,data.active !== false,new Date().toISOString()]);
  return {id};
}
function saveRule(data) { return persistRule(validateRule(data,getDirectory())); }

const SCHEMA = {
  'Транзакции': ['ID','Дата','Описание','Сумма','Категория','Подкатегория','Тип'],
  'Справочник': ['ID','Категория','Подкатегория','Ключевые слова','Вид учёта','Активна'],
  'Правила': ['ID','Шаблон','ID подкатегории','Приоритет','Активно','Обновлено'],
  'Кредиты': ['ID','Название','Кредитор','Вид','Дата выдачи','Сумма','Годовая ставка %','Срок','Тип платежа','День платежа','Платёж','Статус','Ключевые слова','Лимит','Текущий долг','Льготный период','Минимальный платёж'],
  'График платежей': ['ID','ID кредита','Номер','Дата','Плановый платёж','Основной долг','Проценты','Досрочно','Остаток','Фактически','Статус','Тип строки','Режим погашения'],
  'Досрочные погашения': ['ID','ID кредита','Дата','Сумма','Вид','Режим','ID транзакции'],
  'Привязки': ['ID транзакции','ID кредита','ID платежа','Основной долг','Проценты','Способ'],
  'Настройки': ['Ключ','Значение'],
  'Синхронизация': ['Ключ записи','Время правки','ID изменения'],
  'Учёт': ['ID','Дата','Категория','Подкатегория','Вид учёта','Доход','Расход','Тело кредита','Платежи по кредитам'],
  'Без привязки': ['ID','Дата','Описание','Сумма','Категория','Подкатегория','Тип']
};

const INITIAL = [
  ['Доходы','Зарплата','зарплата|заработная плата'], ['Доходы','Прочие доходы','кэшбэк|вознаграждение'],
  ['Еда','Продукты','пятёрочка|пятерочка|магнит|перекрёсток|вкусвилл|супермаркет'],
  ['Еда','Кафе','кафе|кофе|ресторан|бургер'],
  ['Жильё','Коммунальные услуги','жкх|электроэнергия'], ['Жильё','Аренда','аренда'],
  ['Здоровье','Аптеки','аптека'], ['Здоровье','Медицина','клиника'],
  ['Кредит','Платёж по кредиту','платёж по кредиту|платеж по кредиту','payment'],
  ['Кредит','Досрочное погашение','досрочное погашение','early'],
  ['Кредит','Проценты','проценты по кредиту','interest'],
  ['Кредит','Комиссии и страховка','страховка кредита|комиссия по кредиту','fee'],
  ['Кредит','Выдача кредита','выдача кредита|зачисление кредита','loan-in'],
  ['Машина','Топливо','азс|лукойл'], ['Машина','Обслуживание','автосервис'],
  ['Накопления','Округления','округление|копилка','savings'],
  ['Накопления','Взносы','на накопления','savings'],
  ['Питомец','Зоотовары','зоомагазин'], ['Питомец','Ветеринар','ветклиника'],
  ['Покупки','Маркетплейсы','ozon|wildberries|маркетплейс'],
  ['Развлечения','Кино и события','кино|театр'], ['Связь и подписки','Связь','мтс|билайн|мегафон'],
  ['Связь и подписки','Подписки','подписка'], ['Сигареты','Табак','табак|сигареты'],
  ['Транспорт','Общественный транспорт','метро|автобус'], ['Транспорт','Такси','такси'],
  ['Прочее','Прочие операции',''], ['Переводы','Между своими счетами','между своими счетами|на свой счет|на свой счёт','own'],
  ['Переводы людям','Перевод по имени','']
];

function setupFinance() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Откройте скрипт из Google Таблицы.');
  PropertiesService.getScriptProperties().setProperty('BOOK_ID', book.getId());
  book.setSpreadsheetTimeZone('Europe/Moscow');
  book.setSpreadsheetLocale('en_US');
  Object.entries(SCHEMA).forEach(([name, headers]) => setupSheet(book, name, headers));
  if (!rows('Настройки').length) {
    append('Настройки', [['token', Utilities.getUuid() + Utilities.getUuid()], ['schema', '1'], ['timezone', 'Europe/Moscow']]);
  }
  if (!rows('Справочник').length) {
    append('Справочник', INITIAL.map(([category, subcategory, keywords, kind], i) =>
      ['default-' + (i + 1), category, subcategory, keywords, kind || 'regular', true]));
  }
  const tx = sheet('Транзакции');
  rebuildSchedule();
  tx.setFrozenRows(1);
  tx.setColumnWidth(3, 350);
  tx.getRange('B2:B').setNumberFormat('dd.mm.yyyy');
  tx.getRange('D2:D').setNumberFormat('#,##0.00 "₽"');
  tx.getRange('G2:G').setDataValidation(listValidation(['Списание','Пополнение']));
  refreshValidation();
  sheet('Кредиты').getRange('E2:E').setNumberFormat('dd.mm.yyyy');
  sheet('Кредиты').getRange('D2:D').setDataValidation(listValidation(['Кредит','Кредитная карта']));
  sheet('Кредиты').getRange('I2:I').setDataValidation(listValidation(['Аннуитетный','Дифференцированный']));
  sheet('Кредиты').getRange('L2:L').setDataValidation(listValidation(['Активный','Закрыт']));
  sheet('График платежей').getRange('D2:D').setNumberFormat('dd.mm.yyyy');
  sheet('Досрочные погашения').getRange('C2:C').setNumberFormat('dd.mm.yyyy');
  setupReports(book);
  ['Настройки','Синхронизация','Учёт'].forEach(name => sheet(name).hideSheet());
}

function setupSheet(book, name, headers) {
  const tab = book.getSheetByName(name) || book.insertSheet(name);
  if (tab.getMaxColumns() < headers.length) tab.insertColumnsAfter(tab.getMaxColumns(), headers.length - tab.getMaxColumns());
  if (!tab.getLastRow()) tab.getRange(1, 1, 1, headers.length).setValues([headers]);
  tab.getRange(1, 1, tab.getMaxRows(), headers.length).setFontFamily('Calibri').setFontColor('#15403d');
  if (!tab.getBandings().length) {
    tab.getRange(1, 1, tab.getMaxRows(), headers.length).applyRowBanding()
      .setHeaderRowColor('#123e3a').setFirstRowColor('#fffaf0').setSecondRowColor('#f6eedc');
  }
  tab.getRange(1, 1, 1, headers.length).setBackground('#123e3a').setFontColor('#ffffff')
    .setFontWeight('bold').setBorder(null,null,true,null,null,null,'#b68c48',SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  tab.setFrozenRows(1);
  if (!tab.getFilter() && ['Транзакции','Справочник','Кредиты','График платежей'].includes(name)) {
    tab.getRange(1, 1, tab.getMaxRows(), headers.length).createFilter();
  }
  return tab;
}

function listValidation(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function refreshValidation() {
  const tx = sheet('Транзакции');
  const source = sheet('Справочник');
  const rule = column => SpreadsheetApp.newDataValidation().requireValueInRange(source.getRange(column + '2:' + column), true).setAllowInvalid(true).build();
  tx.getRange('E2:E').setDataValidation(rule('B'));
  tx.getRange('F2:F').setDataValidation(rule('C'));
}

let activeEditBook = null;
function book() {
  if (activeEditBook) return activeEditBook;
  const id = PropertiesService.getScriptProperties().getProperty('BOOK_ID');
  if (!id) fail('SETUP_REQUIRED', 'Запустите setupFinance из редактора Apps Script.');
  return SpreadsheetApp.openById(id);
}
function sheet(name) { return book().getSheetByName(name); }
function rows(name) {
  const tab = sheet(name);
  return tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, SCHEMA[name].length).getValues() : [];
}
function ensureRows(tab, end) {
  if (tab.getMaxRows() < end) tab.insertRowsAfter(tab.getMaxRows(), end - tab.getMaxRows());
}
function append(name, data) {
  if (!data.length) return;
  const tab = sheet(name);
  const start = tab.getLastRow() + 1;
  ensureRows(tab, start + data.length - 1);
  if (name === "Транзакции") {
    ensureRows(sheet("Учёт"),start+data.length-1);
    ensureRows(sheet("Без привязки"),start+data.length-1);
  }
  tab.getRange(start,1,data.length,data[0].length).setValues(data);
}
function writeRow(name, index, values) {
  if (index < 0) return append(name, [values]);
  sheet(name).getRange(index + 2,1,1,values.length).setValues([values]);
}

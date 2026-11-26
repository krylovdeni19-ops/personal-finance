import {alfaPdfRows} from './alfa.mjs';

const dateNames = /^(дата( операции| транзакции| платежа| обработки)?|transaction date|date)$/i;
const descriptionNames = /^(описание( операции)?|операция|детали операции|наименование|назначение платежа|description|merchant)$/i;
const amountNames = /^(сумма( операции| транзакции| в валюте сч[её]та)?|amount)$/i;
const debitNames = /^(расход|списание|дебет|debit)(,? (₽|руб\.?|rub))?$/i;
const creditNames = /^(приход|пополнение|кредит|credit)(,? (₽|руб\.?|rub))?$/i;
const typeNames = /^(тип|тип операции|направление|type)$/i;
const idNames = /^(id транзакции|id операции|идентификатор операции|transaction id|идентификатор транзакции)$/i;
const normalize = value => String(value ?? '').trim().replace(/\s+/g,' ');

export function parseDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0,10);
  if (typeof value==='number' && value>=20000 && value<=100000) return new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000).toISOString().slice(0,10);
  const s=normalize(value);
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  const local=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:$| )/);
  const converted=iso ? iso[0].slice(0,10) : local ? local[3]+'-'+local[2].padStart(2,'0')+'-'+local[1].padStart(2,'0') : '';
  return converted && Number.isFinite(Date.parse(converted)) && new Date(converted).toISOString().slice(0,10)===converted ? converted : '';
}
function parseAmount(value) {
  const raw=normalize(value).replace(/(?:₽|RUB|руб\.?)/gi,'').replace(/\s/g,'').replace(/−/g,'-');
  if (!raw || /^[-—–]$/.test(raw)) return 0;
  let decimal=raw.replace(/^\((.*)\)$/,'-$1');
  if (decimal.includes(',') && decimal.includes('.')) decimal=decimal.lastIndexOf(',')>decimal.lastIndexOf('.')?decimal.replace(/\./g,'').replace(',','.'):decimal.replace(/,/g,'');
  else decimal=decimal.replace(',','.');
  return /^[-+]?\d+(?:\.\d{1,2})?$/.test(decimal) ? Math.round(Number(decimal)*100)/100 : NaN;
}
export function parseTable(rows) {
  const header=rows.findIndex(row=>row.some(x=>dateNames.test(normalize(x))) && row.some(x=>descriptionNames.test(normalize(x))) && row.some(x=>amountNames.test(normalize(x))||debitNames.test(normalize(x))||creditNames.test(normalize(x))));
  if (header<0) throw new Error('Не найдены колонки даты, описания и суммы либо прихода и расхода.');
  const names=rows[header].map(normalize);
  const col=pattern=>names.findIndex(x=>pattern.test(x));
  const indices={date:col(dateNames),description:col(descriptionNames),amount:col(amountNames),debit:col(debitNames),credit:col(creditNames),type:col(typeNames),id:col(idNames),purpose:col(/^назначение платежа$/i),currency:col(/^валюта(?: сч[её]та)?$/i)};
  const bank=indices.debit>=0 && indices.credit>=0 && names.some(x=>/^операция$/i.test(x)) ? 'alfa' : 'statement';
  const transactions=[];
  const rejected=[];
  for (let i=header+1;i<rows.length;i++) {
    const row=rows[i];
    if (!row || !row.some(x=>normalize(x))) continue;
    if (row.some(x=>dateNames.test(normalize(x))) || row.some(x=>/^(итого|итог|всего)(\s|:|$)/i.test(normalize(x)))) continue;
    const date=parseDate(row[indices.date]);
    const purpose=indices.purpose===indices.description?'':normalize(row[indices.purpose]);
    const description=[normalize(row[indices.description]),purpose].filter(Boolean).join(' · ');
    const debit=parseAmount(row[indices.debit]);
    const credit=parseAmount(row[indices.credit]);
    const explicit=normalize(row[indices.type]);
    const currency=normalize(row[indices.currency]);
    let signed=indices.debit>=0 || indices.credit>=0 ? Math.abs(credit)-Math.abs(debit) : parseAmount(row[indices.amount]);
    if (/списание|расход|debit/i.test(explicit)) signed=-Math.abs(signed);
    if (/пополнение|приход|credit/i.test(explicit)) signed=Math.abs(signed);
    if (!date || !description || !signed || (debit && credit) || (currency && !/^(rub|rur|₽|руб\.?|643)$/i.test(currency))) { rejected.push(i+1); continue; }
    transactions.push({date,description,amount:Math.abs(signed),type:signed<0?'Списание':'Пополнение',bank,bankId:normalize(row[indices.id])});
  }
  if (!transactions.length) throw new Error('В файле нет строк с корректной датой и ненулевой суммой в рублях.');
  return {transactions,rejected};
}
export async function parseFile(file) {
  const ext=file.name.split('.').at(-1)?.toLowerCase();
  if (file.size>25*1024*1024) throw new Error('Максимальный размер файла — 25 МБ.');
  const bytes=await file.arrayBuffer();
  if (ext==='pdf') {
    const {GlobalWorkerOptions,getDocument}=await import('../../vendor/pdf.min.mjs');
    GlobalWorkerOptions.workerSrc=new URL('../../vendor/pdf.worker.min.mjs',import.meta.url).href;
    const job=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true});
    try {
      const pdf=await job.promise;
      if (pdf.numPages>200) throw new Error('PDF содержит больше 200 страниц.');
      const pages=[];
      for (let i=1;i<=pdf.numPages;i++) {
        const page=await pdf.getPage(i);
        pages.push((await page.getTextContent()).items);
        page.cleanup();
      }
      return parseTable(alfaPdfRows(pages));
    } finally { await job.destroy(); }
  }
  if (ext==='xlsx') {
    const wb=globalThis.XLSX.read(bytes);
    for (const name of wb.SheetNames) {
      const rows=globalThis.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});
      if (rows.some(row=>row.some(x=>dateNames.test(normalize(x))))) return parseTable(rows);
    }
    throw new Error('Лист с операциями не найден.');
  }
  if (ext==='csv') {
    let raw;
    try { raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
    catch { raw=new TextDecoder('windows-1251').decode(bytes); }
    const parsed=globalThis.Papa.parse(raw,{skipEmptyLines:'greedy'});
    if (parsed.errors.some(error=>error.type==='Quotes')) throw new Error('Проверьте кавычки и разделители CSV.');
    // Preambles can prevent delimiter detection. Keep the first candidate with a valid header.
    for (const rows of [parsed.data,...[';',',','\t'].map(delimiter=>globalThis.Papa.parse(raw,{delimiter,skipEmptyLines:'greedy'}).data)]) {
      if (rows.some(row=>row.some(x=>dateNames.test(normalize(x))) && row.length>2)) return parseTable(rows);
    }
    throw new Error('Проверьте заголовки и разделители CSV.');
  }
  throw new Error('Выберите CSV, XLSX или текстовый PDF Альфа-Банка.');
}

// Text-layer tables in Alfa account statements have fixed column anchors across pages.
export function alfaPdfRows(pages) {
  const labels = ['дата операции','операция','расход','приход','назначение платежа'];
  let columns;
  let active;
  const rows = [];
  for (const items of pages) {
    const text = items.filter(item => item.str?.trim()).map(item => ({
      x:item.transform[4], y:item.transform[5], text:item.str.trim()
    }));
    const header = labels.map(label => text.find(item => item.text.toLowerCase() === label));
    if (header.every(Boolean)) columns = header.map(item => item.x);
    if (!columns) continue;
    const table = text.filter(item => header[0] ? item.y < header[0].y - 2 : true);
    const lines = [];
    for (const item of table.sort((a,b) => b.y-a.y || a.x-b.x)) {
      if (!lines.length || Math.abs(lines.at(-1).y-item.y)>1) lines.push({y:item.y,items:[]});
      lines.at(-1).items.push(item);
    }
    for (const {items:line} of lines) {
      const field = (from,to=Infinity) => line.filter(item=>item.x>=from-3&&item.x<to-3).map(item=>item.text).join(' ');
      const [dateX,descriptionX,debitX,creditX,purposeX]=columns;
      const date=field(dateX,descriptionX);
      const ordinal=line.filter(item=>item.x<dateX-3).map(item=>item.text).join(' ');
      const operation=field(descriptionX,debitX);
      const purpose=field(purposeX);
      if (/^\d+$/.test(ordinal) && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        active={date,operation,purpose,debit:field(debitX,creditX),credit:field(creditX,purposeX)};
        rows.push(active);
      } else if (active && !ordinal && !date && (operation || purpose) && !field(debitX,purposeX)) {
        active.operation += ' '+operation;
        active.purpose += ' '+purpose;
      } else if (ordinal || date) active=null;
    }
  }
  if (!rows.length) throw new Error('В PDF не найдена таблица операций Альфа-Банка или ОТП Банка. Для сканов и других форматов используйте CSV или XLSX.');
  return [
    ['Дата операции','Операция','Расход','Приход','Назначение платежа'],
    ...rows.map(row=>[row.date,row.operation.trim(),row.debit,row.credit,row.purpose.replace(/\b\d{10,}\b/g,'').replace(/\s+/g,' ').trim()])
  ];
}

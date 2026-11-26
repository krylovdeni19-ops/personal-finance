const labels = ['дата операции','операция','расход','приход','назначение платежа'];
const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
const amountPattern = /^[+−-]?\d[\d\s]*[.,]\d{2}$/;
const sameColumn = (a,b) => Math.abs(a-b)<2;
const near = (value,target) => Math.abs(value-target)<2;

function stackedHeader(page) {
  const cells = labels.map(label=>page.find(item=>item.text.toLowerCase()===label));
  if (!cells.every(Boolean) || !cells.every(cell=>sameColumn(cell.x,cells[0].x))) return null;
  const step=cells[0].y-cells[1].y;
  if (step<8 || step>20 || !cells.every((cell,i)=>near(cells[0].y-cell.y,i*step))) return null;
  return {x:cells[0].x, bottom:cells[4].y, step};
}

function direction(date, amount, purpose, step) {
  if (date.page===amount.page) {
    const offset=date.y-amount.y;
    if (near(offset,2*step)) return 'debit';
    if (near(offset,3*step)) return 'credit';
  }
  // Across a page break, the next visible field after the amount is the purpose.
  if (purpose?.page===amount.page) {
    const offset=amount.y-purpose.y;
    if (near(offset,2*step)) return 'debit';
    if (near(offset,step)) return 'credit';
  }
  return '';
}

export function otpPdfRows(pages) {
  let header;
  const cells=[];
  pages.forEach((items,page)=>{
    const text=items.filter(item=>item.str?.trim()).map(item=>({
      page,x:item.transform[4],y:item.transform[5],text:item.str.trim()
    }));
    const found=stackedHeader(text);
    if (found) header=found;
    if (!header) return;
    cells.push(...text.filter(item=>sameColumn(item.x,header.x) && (!found || item.y<found.bottom-2))
      .sort((a,b)=>b.y-a.y));
  });
  if (!header) return null;
  const starts=cells.flatMap((cell,i)=>{
    const previous=cells[i-1];
    return datePattern.test(cell.text) && /^\d+$/.test(previous?.text || '') ? [i-1] : [];
  });
  if (!starts.length) throw new Error('Заголовок выписки ОТП Банка найден, но таблица операций пуста.');
  return [
    ['Дата операции','Операция','Расход','Приход','Назначение платежа'],
    ...starts.map((start,i)=>{
      const [,date,operation,amount,purpose]=cells.slice(start,starts[i+1]);
      const kind=amount && amountPattern.test(amount.text) ? direction(date,amount,purpose,header.step) : '';
      const cleanPurpose=(purpose?.text || '').replace(/\b[A-Za-z0-9]{16,}\b/g,'').replace(/\b\d{10,}\b/g,'').replace(/\s+/g,' ').trim();
      return [date.text,operation?.text || '',kind==='debit'?amount.text:'',kind==='credit'?amount.text:'',kind?cleanPurpose:''];
    })
  ];
}

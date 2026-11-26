import {readFile} from 'node:fs/promises';
import {parseFile} from '../site/js/parsers/statements.mjs';

const path=process.argv[2];
const expected=process.argv[3] ? Number(process.argv[3]) : null;
const file=new File([await readFile(path)],'statement.pdf');
const {transactions,rejected}=await parseFile(file);
const counts=Object.fromEntries(['Списание','Пополнение'].map(type=>[type,transactions.filter(row=>row.type===type).length]));
console.log({bank:transactions[0]?.bank,transactions:transactions.length,rejected:rejected.length,...counts});
if (rejected.length || !transactions.length || (expected!==null && transactions.length!==expected)) process.exitCode=1;

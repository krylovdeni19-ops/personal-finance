import {readFile} from 'node:fs/promises';
import {getDocument,GlobalWorkerOptions} from '../site/vendor/pdf.min.mjs';
import {alfaPdfRows} from '../site/js/parsers/alfa.mjs';
import {parseTable} from '../site/js/parsers/statements.mjs';

GlobalWorkerOptions.workerSrc=new URL('../site/vendor/pdf.worker.min.mjs',import.meta.url).href;
const pdf=await getDocument({data:new Uint8Array(await readFile(process.argv[2])),isEvalSupported:false,useSystemFonts:false}).promise;
try {
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items);
  const {transactions,rejected}=parseTable(alfaPdfRows(pages));
  console.log({pages:pdf.numPages,transactions:transactions.length,rejected:rejected.length});
  if (rejected.length || !transactions.length) process.exitCode=1;
} finally { await pdf.destroy(); }

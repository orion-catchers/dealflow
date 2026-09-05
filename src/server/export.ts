import type { Actor,DataState } from '../contracts/application';
import { AppError } from './errors';
import { PDFDocument,StandardFonts,rgb } from 'pdf-lib';
import ExcelJS from 'exceljs';
export async function exportFile(actor:Actor,d:DataState,params:URLSearchParams,mode:string) {
  const invoiceId=params.get('invoice'),format=params.get('format')??'xlsx';
  let rows:(string|number)[][],title:string;
  if(invoiceId){
    const i=d.invoices.find(i=>i.id===invoiceId);
    const ownsInvoice=!!i&&(
      actor.role==='ADMIN'||actor.role==='SALES_MANAGER'||actor.role==='FINANCE_OPS'||
      (actor.role==='CUSTOMER'&&i.customerId===actor.customerId)||
      (actor.role==='SALES_REP'&&d.orders.some(o=>o.id===i.orderId&&o.customerId===i.customerId&&d.quotes.some(q=>q.id===o.quoteId&&q.repId===actor.id)))
    );
    if(!i||!ownsInvoice)throw new AppError(404,'NOT_FOUND','Invoice unavailable');
    title=`Invoice ${i.id}`;rows=[['Description','Quantity','Net','Tax','Total'],...i.lines.map(l=>[l.description,l.quantity,l.net,l.tax,l.total]),['Total','','','',i.total],['Paid','','','',i.paid],['Credit','','','',i.credited],['Outstanding','','','',i.outstanding]];
  }
  else {if(actor.role==='CUSTOMER')throw new AppError(403,'FORBIDDEN','Staff access required');title='Sales report';const from=params.get('from')??'',to=params.get('to')??'9999',rep=params.get('rep'),stage=params.get('stage');rows=[['Quote','Customer','Stage','Revision','Interval','Net','Tax','Total','Profit'],...d.quotes.filter(q=>(actor.role!=='SALES_REP'||q.repId===actor.id)&&q.at.slice(0,10)>=from&&q.at.slice(0,10)<=to&&(!rep||q.repId===rep)&&(!stage||q.stage===stage)).flatMap(q=>q.totals.map(t=>[q.id,d.customers.find(c=>c.id===q.customerId)?.name??'',q.stage,q.revision,t.interval,t.net,t.tax,t.total,t.profit]))];}
  const label=mode==='DEV FIXTURE'?'DEVELOPMENT FIXTURE DATA':'LIVE';
  let bytes:Uint8Array,mime:string;
  if(format==='pdf'){const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);let page=pdf.addPage([842,595]),y=555;const write=(text:string,size=10)=>{if(y<35){page=pdf.addPage([842,595]);y=555;}page.drawText(text.replace(/[^\x20-\x7E]/g,' ').slice(0,145),{x:30,y,size,font,color:rgb(.12,.2,.25)});y-=22;};write(`DealFlow360 | ${title}`,20);write(label);for(const row of rows)write(row.join('   |   '));bytes=await pdf.save();mime='application/pdf';}
  else {const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Report');sheet.addRow([title,label]);for(const row of rows)sheet.addRow(row);sheet.columns.forEach(c=>{c.width=22;});sheet.getRow(2).font={bold:true};bytes=new Uint8Array(await book.xlsx.writeBuffer());mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';}
  return new Response(bytes as BodyInit,{headers:{'Content-Type':mime,'Content-Disposition':`attachment; filename="${mode==='DEV FIXTURE'?'fixture-':''}${invoiceId??'sales-report'}.${format==='pdf'?'pdf':'xlsx'}"`,'Cache-Control':'no-store'}});
}

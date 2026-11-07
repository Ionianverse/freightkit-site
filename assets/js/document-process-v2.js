/* Local-only CSV workflows for FreightKit. Source files are read in the browser and never uploaded. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeCsv=value=>{let s=String(value??'');const numeric=typeof value==='number'&&Number.isFinite(value);if(!numeric&&/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 function download(name,rows){const blob=new Blob(['\ufeff',rows.map(row=>row.map(safeCsv).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
 function parseCsv(text){
  text=String(text||'').replace(/^\uFEFF/,'');const rows=[],sourceRows=[];let row=[],cell='',quoted=false,closed=false,line=1,recordStart=1;
  const finishRecord=()=>{row.push(cell.trim());if(row.some(v=>v!=='')){rows.push(row);sourceRows.push(recordStart);}row=[];cell='';closed=false;recordStart=line+1;};
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){
    if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n'){cell+='\r\n';i++;}else cell+=c;line++;}
    else cell+=c;
    continue;
   }
   if(closed&&c!==','&&c!=='\r'&&c!=='\n'&&c!==' '&&c!=='\t')throw Error('Unexpected character after a quoted field near source line '+line+'.');
   if(c==='"'){if(cell.length)throw Error('A quote appears inside an unquoted field near source line '+line+'.');quoted=true;closed=false;}
   else if(c===','){row.push(cell.trim());cell='';closed=false;}
   else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;finishRecord();line++;recordStart=line;}
   else{cell+=c;if(c!==' '&&c!=='\t')closed=false;}
  }
  if(quoted)throw Error('A quoted field is not closed.');
  if(cell!==''||row.length){row.push(cell.trim());if(row.some(v=>v!=='')){rows.push(row);sourceRows.push(recordStart);}}
  if(rows.length<2)throw Error('The CSV needs a header row and at least one data row.');
  const headers=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim());if(headers.some(x=>!x))throw Error('Every CSV column needs a header.');
  const normalized=headers.map(x=>x.toLowerCase());if(new Set(normalized).size!==normalized.length)throw Error('The CSV has duplicate column names. Rename the duplicate headers and upload it again.');
  const bad=rows.slice(1).findIndex(r=>r.length!==headers.length);if(bad>=0)throw Error('Source line '+sourceRows[bad+1]+' has '+rows[bad+1].length+' columns; expected '+headers.length+'.');
  return {headers,rows:rows.slice(1),sourceRows:sourceRows.slice(1)};
 } async function readCsv(file){if(!file)throw Error('Choose a CSV file first.');if(file.size>10*1024*1024)throw Error('Please use a CSV smaller than 10 MB.');return parseCsv(await file.text());}
 function normalize(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
 function mapUI(host,headers,fields){const available=headers.map((h,i)=>({h,i,key:normalize(h)}));host.innerHTML=fields.map(f=>{const aliases=f.aliases.map(normalize);let best=available.find(x=>aliases.includes(x.key));if(!best)best=available.find(x=>aliases.some(a=>a.length>3&&(x.key.includes(a)||a.includes(x.key))));return '<div class="field"><label for="map-'+host.id+'-'+f.key+'">'+esc(f.label)+(f.required?' <span aria-hidden="true">*</span>':' <span class="muted-small">(optional)</span>')+'</label><select id="map-'+host.id+'-'+f.key+'" data-map="'+f.key+'"><option value="">Choose a column</option>'+headers.map((h,i)=>'<option value="'+i+'" '+(best?.i===i?'selected':'')+'>'+esc(h)+'</option>').join('')+'</select></div>';}).join('');}
 function selectedMap(host,fields){const out={};for(const f of fields){const el=host.querySelector('[data-map="'+f.key+'"]');out[f.key]=el&&el.value!==''?Number(el.value):null;if(f.required&&out[f.key]===null)throw Error('Choose a column for “'+f.label+'”.');}return out;}
 function fieldValue(row,map,key){const index=map[key];return index===null||index===undefined?'':String(row[index]??'').trim();}
 function numberValue(value,label,rowNo){if(value==='')throw Error('Source line '+rowNo+': '+label+' is blank.');let text=value.trim(),negative=false;if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1);}text=text.replace(/^[A-Z]{3}\s*/i,'').replace(/[,$₹€£\s]/g,'');const n=Number(text);if(!Number.isFinite(n))throw Error('Source line '+rowNo+': '+label+' must be a number.');return negative?-n:n;}
 function dateValue(value,label,rowNo){if(!value)return null;const v=value.trim();let d;if(/^\d{4}-\d{2}-\d{2}$/.test(v)){const [y,m,day]=v.split('-').map(Number);d=new Date(Date.UTC(y,m-1,day));if(d.getUTCFullYear()!==y||d.getUTCMonth()!==m-1||d.getUTCDate()!==day)throw Error('Row '+rowNo+': '+label+' is not a valid date. Use YYYY-MM-DD.');}else{d=new Date(v);if(Number.isNaN(d.getTime()))throw Error('Row '+rowNo+': '+label+' is not a readable date. Use YYYY-MM-DD.');}return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());}
 function dateText(ms){return ms===null?'':new Date(ms).toISOString().slice(0,10);}
 function showError(out,message){if(!out)return;out.innerHTML='<div class="error-box" role="alert"><strong>Check the file or column mapping:</strong><p>'+esc(message)+'</p></div>';out.hidden=false;}
 function summaryCards(items){return '<div class="workflow-kpis">'+items.map(i=>'<div class="card"><span class="muted-small">'+esc(i[0])+'</span><strong>'+esc(i[1])+'</strong></div>').join('')+'</div>';}
 function bindFileMapping(inputId,hostId,fields){const input=$(inputId),host=$(hostId);if(!input||!host)return;input.addEventListener('change',async()=>{const form=input.form;if(form)form.dataset.demoMode='false';host.innerHTML='';if(!input.files?.[0])return;try{const data=await readCsv(input.files[0]);mapUI(host,data.headers,fields);host.dataset.ready='true';}catch(e){host.dataset.ready='false';showError($(input.dataset.errorTarget),e.message||'Could not read the CSV.');}});}
 const invoiceFields=[{key:'shipment',label:'Shipment / quote reference',required:true,aliases:['shipment_id','shipment','shipment_ref','quote_reference','reference','load_id','job_number']},{key:'charge',label:'Charge line / code',required:true,aliases:['charge_code','charge','line_item','cost_code','description','charge_description']},{key:'amount',label:'Extended line amount',required:true,aliases:['amount','charge_amount','quoted_amount','invoiced_amount','line_total','line_amount','extended_amount'] }];
 function initInvoiceAudit(){
  const form=$('invoice-audit-form');if(!form)return;
  const qInput=$('quote-file'),iInput=$('invoice-file'),qMap=$('quote-mapping'),iMap=$('invoice-mapping'),out=$('invoice-audit-result');
  bindFileMapping('quote-file','quote-mapping',invoiceFields);bindFileMapping('invoice-file','invoice-mapping',invoiceFields);
  const formatMoney=(value,currency)=>`${currency?currency+' ':''}${value.toFixed(2)}`;
  const demoQuote={name:'freightkit-quote-example.csv',text:'shipment_id,charge_code,amount\r\nFK-26001,Base freight,1250\r\nFK-26001,Fuel surcharge,180\r\nFK-26002,Origin handling,95\r\nFK-26003,Documentation,45\r\n'};
  const demoInvoice={name:'freightkit-invoice-example.csv',text:'shipment_id,charge_code,amount\r\nFK-26001,Base freight,1285\r\nFK-26001,Fuel surcharge,180\r\nFK-26002,Origin handling,120\r\nFK-26003,Documentation,40\r\nFK-26004,Destination delivery,310\r\n'};
  $('try-audit-example')?.addEventListener('click',()=>{
   try{
    mapUI(qMap,parseCsv(demoQuote.text).headers,invoiceFields);mapUI(iMap,parseCsv(demoInvoice.text).headers,invoiceFields);
    form.dataset.demoMode='true';$('charge-aliases').value='';$('audit-currency').value='USD';$('variance-tolerance').value='1';
    form.requestSubmit();
   }catch(err){showError(out,err.message||'Could not load the sample comparison.');}
  });
  form.addEventListener('submit',async e=>{
   e.preventDefault();out.hidden=false;
   try{
    const isDemo=form.dataset.demoMode==='true';const [q,inv]=isDemo?[parseCsv(demoQuote.text),parseCsv(demoInvoice.text)]:await Promise.all([readCsv(qInput.files?.[0]),readCsv(iInput.files?.[0])]);
    const qm=selectedMap(qMap,invoiceFields),im=selectedMap(iMap,invoiceFields);
    const tolerance=Number($('variance-tolerance').value);
    if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Variance tolerance must be zero or greater.');
    const currency=$('audit-currency').value;
    const aliasMap=new Map();
    String($('charge-aliases')?.value||'').split(/\r?\n/).forEach((line,index)=>{
     if(!line.trim())return;const pair=line.split('=');if(pair.length!==2)throw Error('Charge-name pair on line '+(index+1)+' must use “quote name = invoice name”.');
     const quoteName=normalize(pair[0]),invoiceName=normalize(pair[1]);if(!quoteName||!invoiceName)throw Error('Charge-name pair on line '+(index+1)+' needs both names.');
     const priorA=aliasMap.get(quoteName),priorB=aliasMap.get(invoiceName);if((priorA&&priorA!==quoteName)||(priorB&&priorB!==quoteName))throw Error('A charge name is assigned to conflicting pairs. Check the optional charge-name mapping.');
     aliasMap.set(quoteName,quoteName);aliasMap.set(invoiceName,quoteName);
    });
    const canonicalCharge=value=>aliasMap.get(normalize(value))||normalize(value);
    const group=(parsed,map,label)=>{
     const result=new Map();parsed.rows.forEach((row,i)=>{
      const rowNo=parsed.sourceRows[i]||i+2;if(!row.some(x=>x.trim()))return;const shipment=fieldValue(row,map,'shipment'),charge=fieldValue(row,map,'charge');
      if(!shipment||!charge)throw Error(label+' source line '+rowNo+': shipment reference and charge line cannot be blank.');
      const amount=numberValue(fieldValue(row,map,'amount'),'extended line amount',rowNo),key=normalize(shipment)+'|'+canonicalCharge(charge);
      const item=result.get(key)||{shipment,chargeNames:new Set(),amount:0,sourceRows:[]};item.chargeNames.add(charge);item.amount+=amount;item.sourceRows.push(rowNo);result.set(key,item);
     });return result;
    };
    const quotes=group(q,qm,'Quote'),invoices=group(inv,im,'Invoice');if(!quotes.size&&!invoices.size)throw Error('No usable line items were found.');
    const keys=new Set([...quotes.keys(),...invoices.keys()]),rows=[];let matchedQuote=0,matchedInvoice=0,net=0,above=0,below=0,invoiceOnly=0,missingInvoice=0,within=0,repeated=0;
    for(const key of keys){
     const x=quotes.get(key),y=invoices.get(key);let variance='',percent='',status,reason,next;
     if(x&&y){
      matchedQuote+=x.amount;matchedInvoice+=y.amount;variance=y.amount-x.amount;net+=variance;
      percent=x.amount===0?'':variance/Math.abs(x.amount);
      if(Math.abs(variance)<=tolerance){status='Within tolerance';within++;reason='Difference is within your selected tolerance.';next='No amount exception; retain the source records.';}
      else if(variance>0){status='Invoice higher';above+=variance;reason='Billed amount is above the quote by more than your tolerance.';next='Check the agreed rate, shipment weight or quantity, fuel basis, and any added service.';}
      else{status='Invoice lower';below+=Math.abs(variance);reason='Billed amount is below the quote by more than your tolerance.';next='Check for a credit, changed scope, omitted line, or later invoice.';}
     }else if(y){status='No quote match';invoiceOnly+=y.amount;reason='No matching shipment and charge were found in the quote.';next='Confirm the charge was authorized and supported by shipment evidence.';}
     else{status='No invoice line';missingInvoice++;reason='This quoted charge is absent from the invoice.';next='Check whether it was waived, billed separately, or omitted from the invoice export.';}
     const isRepeated=(x?.sourceRows.length||0)>1||(y?.sourceRows.length||0)>1;if(isRepeated)repeated++;
     if(isRepeated)next+=' Repeated source rows were grouped; inspect every listed row before deciding.';
     rows.push({shipment:(x||y).shipment,quoteCharges:x?[...x.chargeNames].join(', '):'',invoiceCharges:y?[...y.chargeNames].join(', '):'',quoted:x?x.amount:'',invoiced:y?y.amount:'',variance,percent,status,reason,next,quoteRows:x?x.sourceRows.join(', '):'—',invoiceRows:y?y.sourceRows.join(', '):'—',isRepeated});
    }
    const rank={'Invoice higher':0,'No quote match':1,'Invoice lower':2,'No invoice line':3,'Within tolerance':4};
    rows.sort((a,b)=>rank[a.status]-rank[b.status]||Math.abs(Number(b.variance)||Number(b.invoiced)||0)-Math.abs(Number(a.variance)||Number(a.invoiced)||0));
    const reviewNeeded=rows.filter(r=>r.status!=='Within tolerance').length;
    out.innerHTML=summaryCards([['Lines reviewed',rows.length],['Review needed',reviewNeeded],['Billed above quote',formatMoney(above,currency)],['Invoice-only charges',formatMoney(invoiceOnly,currency)],['Quote lines not billed',missingInvoice],['Within tolerance',within]])+
     '<details class="card"><summary>Matched-line totals</summary><p>Quoted: <strong>'+esc(formatMoney(matchedQuote,currency))+'</strong> · Invoiced: <strong>'+esc(formatMoney(matchedInvoice,currency))+'</strong> · Net variance: <strong>'+esc(formatMoney(net,currency))+'</strong> · Below quote: '+esc(formatMoney(below,currency))+'</p></details>'+
     (repeated?'<p class="note"><strong>Repeated rows:</strong> '+repeated+' charge group(s) contain multiple source lines. The report shows all contributing row numbers and sums those lines; inspect them before treating a group as a duplicate.</p>':'')+
     (isDemo?'<p class="note"><strong>Sample results:</strong> These are example shipments for learning the report. Your files were not used. Choose your quote and invoice CSV above to run your own comparison.</p>':'')+
     '<p class="muted-small">Evidence files: quote <strong>'+esc(isDemo?demoQuote.name:qInput.files[0].name)+'</strong>; invoice <strong>'+esc(isDemo?demoInvoice.name:iInput.files[0].name)+'</strong>. Row references are source line numbers; the header is line 1.</p>'+
     '<div class="table-scroll"><table class="data-table"><thead><tr><th>Shipment</th><th>Quote charge</th><th>Invoice charge</th><th>Quoted</th><th>Billed</th><th>Variance</th><th>Variance %</th><th>Finding</th><th>Quote row(s)</th><th>Invoice row(s)</th><th>Why flagged / next check</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.shipment)+'</td><td>'+esc(r.quoteCharges||'—')+'</td><td>'+esc(r.invoiceCharges||'—')+'</td><td>'+esc(r.quoted===''?'—':formatMoney(r.quoted,currency))+'</td><td>'+esc(r.invoiced===''?'—':formatMoney(r.invoiced,currency))+'</td><td>'+esc(r.variance===''?'—':formatMoney(r.variance,currency))+'</td><td>'+esc(r.percent===''?'—':(r.percent*100).toFixed(1)+'%')+'</td><td><span class="status-pill '+(r.status==='Invoice higher'?'status-risk':r.status==='Within tolerance'?'status-ok':'status-review')+'">'+esc(r.status)+'</span>'+(r.isRepeated?'<br><small>Multiple source rows summed</small>':'')+'</td><td>'+esc(r.quoteRows)+'</td><td>'+esc(r.invoiceRows)+'</td><td><strong>'+esc(r.reason)+'</strong><details class="finding-next"><summary>What to check next</summary><p>'+esc(r.next)+'</p></details></td></tr>').join('')+'</tbody></table></div>'+
     '<p class="muted-small">This is a screening report, not proof of an incorrect charge. It compares extended line amounts in one currency; it does not interpret contracts, tax, dimensional reweighs, or service-event evidence.</p><button class="btn secondary" type="button" id="export-invoice-audit">Download findings CSV</button>';
    $('export-invoice-audit').addEventListener('click',()=>download('freightkit-invoice-audit-findings.csv',[['Shipment','Quote charge','Invoice charge','Quoted amount','Billed amount','Variance','Variance %','Finding','Why flagged','Suggested next check','Quote source rows','Invoice source rows'],...rows.map(r=>[r.shipment,r.quoteCharges,r.invoiceCharges,r.quoted,r.invoiced,r.variance,r.percent,r.status,r.reason,r.next,r.quoteRows,r.invoiceRows])]));
    out.hidden=false;out.scrollIntoView({behavior:'smooth',block:'start'});
   }catch(err){showError(out,err.message||'Could not compare these files.');}
  });
  $('download-audit-samples')?.addEventListener('click',()=>download('freightkit-quote-sample.csv',[['shipment_id','charge_code','amount'],['FK-26001','Base freight',1250],['FK-26001','Fuel surcharge',180],['FK-26002','Origin handling',95],['FK-26003','Documentation',45]]));
  $('download-invoice-sample')?.addEventListener('click',()=>download('freightkit-invoice-sample.csv',[['shipment_id','charge_code','amount'],['FK-26001','Base freight',1285],['FK-26001','Fuel surcharge',180],['FK-26002','Origin handling',120],['FK-26003','Documentation',40],['FK-26004','Destination delivery',310]]));
 } document.addEventListener('DOMContentLoaded',()=>{initInvoiceAudit();});
})();

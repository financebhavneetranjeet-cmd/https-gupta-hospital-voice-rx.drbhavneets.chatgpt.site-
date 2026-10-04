const $=id=>document.getElementById(id);
const ids=['patientName','age','sex','uhid','visitDate','chief','allergy','exam','past','medrec','invest','diagnosis','rx','advice','doctorName','doctorReg'];
let recognition=null;
let listening=false;
let latestTranscript='';
let activeSection='chief';
let lastFinal='';
let lastFinalAt=0;
const recentFinals=[];
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
$('visitDate').value=today();

function updateOverlay(){
  $('oName').textContent=$('patientName').value||'';
  $('oAgeSex').textContent=[ $('age').value, $('sex').value ].filter(Boolean).join(' / ');
  $('oUhid').textContent=$('uhid').value||'';
  $('oDate').textContent=$('visitDate').value||'';
  $('docText').innerHTML=[ $('doctorName').value, $('doctorReg').value ].filter(Boolean).map(x=>escapeHtml(x)).join('<br>');
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
ids.forEach(id=>$(id).addEventListener('input',updateOverlay));

const replacements=[
  [/\bback\s+ache\b/gi,'backache'],
  [/\blow\s+back\s+ache\b/gi,'low backache'],
  [/\bneck\s+ache\b/gi,'neck pain'],
  [/\bhead\s+ache\b/gi,'headache'],
  [/\bsp\s*o\s*2\b/gi,'SpO2'],
  [/\bo\s*2\s+saturation\b/gi,'SpO2'],
  [/\bblood\s+pressure\b/gi,'BP'],
  [/\bb\s*p\b/gi,'BP'],
  [/\bmilligrams?\b/gi,'mg'],
  [/\bmillilit(?:er|re)s?\b/gi,'mL'],
  [/\bdegrees?\s+celsius\b/gi,'°C'],
  [/\bonce\s+daily\b/gi,'OD'],
  [/\btwice\s+daily\b/gi,'BD'],
  [/\bthree\s+times\s+(?:a|per)\s+day\b/gi,'TDS'],
  [/\bat\s+night\b/gi,'HS'],
  [/\bno\s+known\s+drug\s+allerg(?:y|ies)\b/gi,'No known drug allergies'],
  [/\bno\s+drug\s+allerg(?:y|ies)\b/gi,'No known drug allergies'],
  [/\bno\s+significant\s+past\s+history\b/gi,'No significant past history'],
  [/\bgeneral\s+examination\s+(?:is\s+)?normal\b/gi,'General examination normal'],
  [/\blumbar\s+radiculo\s*pathy\b/gi,'lumbar radiculopathy'],
  [/\bcervical\s+radiculo\s*pathy\b/gi,'cervical radiculopathy'],
  [/\bparaesthesia\b/gi,'paresthesia']
];
function formatDictation(text, finish=false){
  let out=String(text||'').replace(/\r\n?/g,'\n');
  out=out.replace(/\b(?:new|next)\s+(?:line|paragraph)\b/gi,'\n')
    .replace(/\bcomma\b/gi,',')
    .replace(/\b(?:full\s+stop|period|dot(?:\s+dot)*)\b/gi,'.')
    .replace(/\bsemicolon\b/gi,';').replace(/\bcolon\b/gi,':');
  out=out.replace(/\b(?:blood\s+pressure|b\s*p)\s*(?:is\s*)?[:]?\s*(\d{2,3})\s*(?:by|over|\/)\s*(\d{2,3})\b/gi,'BP: $1/$2');
  out=out.replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n')
    .replace(/ +([,.;:])/g,'$1').replace(/([,;:])(?=[A-Za-z])/g,'$1 ')
    .replace(/\.(?=[A-Za-z])/g,'. ').replace(/\.{2,}/g,'.').trim();
  return out.split('\n').map(line=>{
    line=line.trim();
    if(line && /^[a-z]/.test(line)) line=line[0].toUpperCase()+line.slice(1);
    if(finish && line && !/[.!?:;,]$/.test(line)) line+='.';
    return line;
  }).join('\n');
}
function cleanMedicalText(text){
  let out=formatDictation(text);
  for(const [re,to] of replacements) out=out.replace(re,to);
  return out;
}
const clinicalIds=['chief','allergy','exam','past','medrec','invest','diagnosis','rx','advice'];
let formatUndo=null;
$('formatBtn').onclick=()=>{
  formatUndo=Object.fromEntries(clinicalIds.map(id=>[id,$(id).value]));
  for(const id of clinicalIds) $(id).value=formatDictation($(id).value,true);
  updateOverlay();
  $('undoFormatBtn').disabled=false;
  $('micStatus').textContent='Formatting complete. Review medical terms and doses before printing.';
};
$('undoFormatBtn').onclick=()=>{
  if(!formatUndo)return;
  for(const id of clinicalIds) $(id).value=formatUndo[id];
  formatUndo=null; $('undoFormatBtn').disabled=true;updateOverlay();
};

function normaliseForDuplicate(text){return cleanMedicalText(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function isDuplicateFinal(text){
  const key=normaliseForDuplicate(text);
  if(!key) return true;
  const now=Date.now();
  while(recentFinals.length && now-recentFinals[0].at>12000) recentFinals.shift();
  if(recentFinals.some(x=>x.key===key)) return true;
  if(lastFinal && now-lastFinalAt<7000){
    const prev=normaliseForDuplicate(lastFinal);
    if(prev && (key===prev || (key.length>18 && prev.length>18 && (key.includes(prev)||prev.includes(key))))) return true;
  }
  recentFinals.push({key,at:now});
  lastFinal=text;
  lastFinalAt=now;
  return false;
}

const routes=[
 {id:'chief',keys:['chief complaint','chief complaints','complaint','complaints']},
 {id:'allergy',keys:['history of drug allergy','drug allergy','allergy']},
 {id:'exam',keys:['general examination','examination','bp','blood pressure','pulse','spo2','temperature','weight']},
 {id:'past',keys:['past history','previous history']},
 {id:'medrec',keys:['medicine reconciliation','current medicines','current medication','current medications','old medicines']},
 {id:'invest',keys:['investigation required','investigations required','investigation','investigations','test required','tests required']},
 {id:'diagnosis',keys:['provisional diagnosis','diagnosis']},
 {id:'rx',keys:['prescription','rx','treatment']},
 {id:'advice',keys:['advice and follow up','advice and follow-up','advice','follow up','follow-up','review after']}
];
function detectSection(text){
  const low=String(text||'').toLowerCase().replace(/^[\s,.;:–—-]+/,'');
  for(const r of routes){
    for(const k of r.keys){
      const escaped=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp('^'+escaped+'(?:\\b|\\s*[:–—-])','i').test(low)) return r;
    }
  }
  return null;
}
function stripKeyword(text,route){
  let out=String(text||'').trim();
  for(const k of route.keys){
    const escaped=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp('^\\s*'+escaped+'\\s*[:–—-]?\\s*','i');
    if(re.test(out)){out=out.replace(re,'').trim();break;}
  }
  return out;
}
function appendTo(id,text){
  const cleaned=cleanMedicalText(text);
  if(!cleaned)return;
  const el=$(id);
  const existing=el.value.trim();
  const existingLines=existing.split(/\n+/).map(normaliseForDuplicate).filter(Boolean);
  if(existingLines.includes(normaliseForDuplicate(cleaned))) return;
  el.value=(existing?existing+'\n':'')+cleaned;
  el.dispatchEvent(new Event('input'));
}
function autoRoute(text){
  const cleaned=cleanMedicalText(text);
  if(!cleaned)return;
  if($('target').value!=='auto'){
    activeSection=$('target').value;
    appendTo(activeSection,cleaned);
    return;
  }
  const r=detectSection(cleaned);
  if(r){
    activeSection=r.id;
    const body=stripKeyword(cleaned,r);
    if(body) appendTo(r.id,body);
    $('micStatus').textContent='Listening — '+($('target').querySelector('option[value="'+r.id+'"]')?.textContent||r.id);
    return;
  }
  appendTo(activeSection||'chief',cleaned);
}

function setupSpeech(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('micStatus').textContent='Speech recognition is not supported in this browser. Use Android Chrome or desktop Chrome.'; $('micBtn').disabled=true; return;}
 recognition=new SR();
 recognition.continuous=true;
 recognition.interimResults=true;
 recognition.maxAlternatives=3;
 recognition.onstart=()=>{listening=true;$('micBtn').textContent='⏹ Stop Dictation';$('micStatus').textContent='Listening…';};
 recognition.onend=()=>{listening=false;$('micBtn').textContent='🎙 Start Dictation';if($('micStatus').textContent.startsWith('Listening'))$('micStatus').textContent='Stopped';};
 recognition.onerror=e=>{
   if(e.error==='aborted') return;
   $('micStatus').textContent=e.error==='not-allowed'?'Microphone access denied. Allow microphone access in Chrome site settings, then try again.':'Dictation error: '+e.error+'. You can continue typing or try dictation again.';
 };
 recognition.onresult=e=>{
   let interim='';
   for(let i=e.resultIndex;i<e.results.length;i++){
     const result=e.results[i];
     const best=Array.from(result).map(a=>a.transcript.trim()).filter(Boolean)[0]||'';
     if(result.isFinal){
       const final=cleanMedicalText(best);
       if(final && !isDuplicateFinal(final)){
         latestTranscript=(latestTranscript?(latestTranscript+'\n'):'')+final;
         $('liveTranscript').value=latestTranscript;
         autoRoute(final);
       }
     }else if(best){
       interim=cleanMedicalText(best);
     }
   }
   if(interim) $('micStatus').textContent='Hearing: '+interim;
   else if(listening && !$('micStatus').textContent.startsWith('Listening —')) $('micStatus').textContent='Listening…';
 };
}
setupSpeech();
$('micBtn').onclick=()=>{
  if(!recognition)return;
  if(listening){
    try{recognition.abort()}catch{try{recognition.stop()}catch{}}
    listening=false;
    $('micBtn').textContent='🎙 Start Dictation';
    $('micStatus').textContent='Stopped';
    return;
  }
  recognition.lang=$('lang').value;
  latestTranscript=$('liveTranscript').value.trim();
  try{recognition.start()}catch(e){$('micStatus').textContent='Unable to start dictation: '+e.message;}
};

$('target').addEventListener('change',()=>{if($('target').value!=='auto') activeSection=$('target').value;});
$('insertTranscript').onclick=()=>{
  const t=$('liveTranscript').value.trim();
  if(!t)return;
  const target=$('target').value;
  if(target==='auto'){
    for(const line of t.split(/\n+/).filter(Boolean)) autoRoute(line);
  }else{
    activeSection=target;
    appendTo(target,t);
  }
};
$('clearTranscript').onclick=()=>{latestTranscript='';$('liveTranscript').value='';recentFinals.length=0;lastFinal='';lastFinalAt=0;};

function fileToDataUrl(file,cb){if(!file)return; const reader=new FileReader();reader.onload=()=>cb(reader.result);reader.readAsDataURL(file)}
function loadImages(){const s=localStorage.getItem('gupta_sig'),st=localStorage.getItem('gupta_stamp'); if(s){$('signatureImg').src=s;$('signatureImg').style.display='inline-block'}else $('signatureImg').style.display='none'; if(st){$('stampImg').src=st;$('stampImg').style.display='inline-block'}else $('stampImg').style.display='none'}
$('signatureUpload').onchange=e=>fileToDataUrl(e.target.files[0],d=>{localStorage.setItem('gupta_sig',d);loadImages()});
$('stampUpload').onchange=e=>fileToDataUrl(e.target.files[0],d=>{localStorage.setItem('gupta_stamp',d);loadImages()});
$('clearSig').onclick=()=>{localStorage.removeItem('gupta_sig');localStorage.removeItem('gupta_stamp');loadImages()};
$('preprinted').onchange=e=>document.body.classList.toggle('preprinted',e.target.checked);
loadImages();

function currentRecord(){const r={id:Date.now(),savedAt:new Date().toISOString()};ids.forEach(id=>r[id]=$(id).value);return r}
function getVisits(){try{return JSON.parse(localStorage.getItem('gupta_visits')||'[]')}catch{return []}}
function renderVisits(){const q=$('searchVisits').value.toLowerCase().trim(); const rows=getVisits().filter(v=>!q||[v.patientName,v.uhid,v.visitDate].join(' ').toLowerCase().includes(q)).slice(0,50);$('visitList').innerHTML=''; rows.forEach(v=>{const d=document.createElement('div');d.className='visit-card';d.innerHTML='<b>'+escapeHtml(v.patientName||'Unnamed patient')+'</b>'+escapeHtml(v.visitDate||'')+' · '+escapeHtml(v.uhid||'');d.onclick=()=>loadRecord(v);$('visitList').appendChild(d)});}
function loadRecord(v){formatUndo=null;$('undoFormatBtn').disabled=true;ids.forEach(id=>{if(v[id]!=null)$(id).value=v[id]});updateOverlay();window.scrollTo({top:0,behavior:'smooth'})}
$('saveBtn').onclick=()=>{const v=currentRecord();const all=getVisits();all.unshift(v);localStorage.setItem('gupta_visits',JSON.stringify(all.slice(0,500)));renderVisits();alert('Visit saved on this device.');};
$('searchVisits').oninput=renderVisits;renderVisits();
$('newBtn').onclick=()=>{formatUndo=null;$('undoFormatBtn').disabled=true;['patientName','age','sex','uhid','chief','allergy','exam','past','medrec','invest','diagnosis','rx','advice'].forEach(id=>$(id).value='');$('visitDate').value=today();$('liveTranscript').value='';latestTranscript='';activeSection='chief';recentFinals.length=0;lastFinal='';lastFinalAt=0;updateOverlay();};
$('printBtn').onclick=()=>{updateOverlay();const clipped=[...document.querySelectorAll('.field')].filter(e=>e.scrollHeight>e.clientHeight+2);if(clipped.length){alert('Please shorten text before printing in: '+clipped.map(e=>e.getAttribute('aria-label')).join(', ')+'. The letterhead has limited space.');clipped[0].focus();return;}window.print();};
updateOverlay();
if('serviceWorker'in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{$('micStatus').textContent='Offline setup failed. Refresh while connected to the internet.';})}

let deferredInstallPrompt=null;
const installBtn=$('installBtn');
const installGuide=$('installGuide');
const installText=$('installText');
const nativeInstallBtn=$('nativeInstallBtn');
const closeInstallGuide=$('closeInstallGuide');
const isStandalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);

function showInstallButton(){ if(!isStandalone) installBtn.classList.remove('hidden'); }
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  showInstallButton();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  installBtn.classList.add('hidden');
  installGuide.classList.add('hidden');
});
if(!isStandalone) showInstallButton();

installBtn?.addEventListener('click',async()=>{
  if(deferredInstallPrompt){
    installText.textContent='Install Gupta Rx on this device for quick access from your home screen.';
    nativeInstallBtn.classList.remove('hidden');
  } else if(isIOS){
    installText.textContent='On iPhone/iPad: tap the Share button in Safari, choose “Add to Home Screen”, then tap “Add”.';
    nativeInstallBtn.classList.add('hidden');
  } else {
    installText.textContent='Open this site in Chrome, then use the browser menu and choose “Install app” or “Add to Home screen”. If that option is missing, keep the page open briefly and reload. Chrome controls when installation becomes available; make sure this app is not already installed.';
    nativeInstallBtn.classList.add('hidden');
  }
  installGuide.classList.remove('hidden');
});
nativeInstallBtn?.addEventListener('click',async()=>{
  if(!deferredInstallPrompt)return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt=null;
  nativeInstallBtn.classList.add('hidden');
  installGuide.classList.add('hidden');
});
closeInstallGuide?.addEventListener('click',()=>installGuide.classList.add('hidden'));
installGuide?.addEventListener('click',e=>{if(e.target===installGuide) installGuide.classList.add('hidden')});
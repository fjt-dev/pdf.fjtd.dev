// SPDX-License-Identifier: AGPL-3.0-or-later
import {t,initLanguage,getLanguage} from './i18n.mjs';
const $=id=>document.getElementById(id);
const worker=new Worker('./worker.mjs',{type:'module'});let rpcId=0;const pending=new Map();
function rpc(action,args={}){return new Promise((resolve,reject)=>{const id=++rpcId;pending.set(id,{resolve,reject});worker.postMessage({id,action,args})})}
worker.onmessage=({data})=>{const task=pending.get(data.id);if(task){pending.delete(data.id);data.error?task.reject(Error(t(data.error))):task.resolve(data.result)}};
worker.onerror=()=>{for(const task of pending.values())task.reject(Error(t('PDFエンジンを読み込めません。ページを再読み込みしてください。')));pending.clear();message(t('PDFエンジンを読み込めません。再読み込みしてください。'),true)};
let sourceBytes=0;let pages=[],selected=new Set(),history=[],redo=[],busy=false,tab='organize',task='organize',activeId=null,tool='select',viewerData=null,viewerToken=0,gesture=null,textDraft=null;
const labels={rotate:'回転',crop:'切り抜き',text:'文字追加',replace:'文字の置換',comment:'コメント',highlight:'ハイライト',underline:'下線',strike:'取消線',rectangle:'四角',ellipse:'丸',ink:'手書き',redact:'墨消し'};
const hints={select:'ページの内容を確認できます。編集ツールを選んでください。',replace:'文字をクリックして直接編集。Enterで確定、Shift＋Enterで改行、Escで取消。',text:'文字を入力して、ページ上の追加位置をクリックしてください。',comment:'コメントを入力して、ページ上の位置をクリックしてください。',highlight:'強調したい範囲をドラッグしてください。',underline:'下線を引く範囲をドラッグしてください。',strike:'取り消し線を引く範囲をドラッグしてください。',rectangle:'四角で囲む範囲をドラッグしてください。',ellipse:'丸で囲む範囲をドラッグしてください。',ink:'ページ上をドラッグして手書きできます。',crop:'表示したい範囲をドラッグしてください。切り抜きでは範囲外の情報は削除されません。',redact:'削除する範囲をドラッグしてください。保存PDFから文字・画像・図形を除去します。'};
function message(text,error=false){$('status').textContent=t(text);$('status').classList.toggle('error',error)}
const state=()=>({pages:structuredClone(pages),selected:[...selected],activeId});
function snapshot(){history.push(state());if(history.length>25)history.shift();redo=[]}
function restore(s){finishInline(false,false);pages=s.pages;selected=new Set(s.selected);activeId=s.activeId;textDraft=null;render()}
function undo(){if(busy||!history.length)return;redo.push(state());restore(history.pop());message(t('ひとつ前の状態に戻しました。'))}
function controls(){const n=selected.size;for(const id of ['all','none','clear','save','selectRange','convert'])$(id).disabled=busy||!pages.length;for(const id of ['rotate','duplicate','remove','extract'])$(id).disabled=busy||!n;$('remainder').disabled=busy||!n||n===pages.length;for(const id of ['undo','editUndo'])$(id).disabled=busy||!history.length;for(const id of ['open','sample','files','language'])$(id).disabled=busy;$('selection').textContent=t("{0} ページ選択",n);$('count').textContent=t("{0} ページ",pages.length);$('hint').textContent=pages.length?t('ドラッグで並べ替え。「編集」で文字・注釈を変更。'):t('PDFや画像を追加して始めましょう。');$('empty').hidden=!!pages.length;const index=pages.findIndex(p=>p.id===activeId);$('prevPage').disabled=busy||index<=0;$('nextPage').disabled=busy||index<0||index>=pages.length-1;$('editRotate').disabled=busy||index<0;$('editPage').disabled=busy||!pages.length;$('applyText').disabled=busy||!textDraft;document.querySelectorAll('[data-tool]').forEach(b=>b.disabled=busy||!pages.length)}
function change(fn){if(busy)return;snapshot();fn();render();message(t('変更しました。PDFを保存すると編集内容が反映されます。'))}
function applyOp(op){const page=pages.find(p=>p.id===activeId);if(!page||busy)return;change(()=>{page.ops.push(op);page.revision++;if(op.kind==='rotate')page.rotation=op.angle});textDraft=null;controls()}
function select(id,value){if(busy)return;value?selected.add(id):selected.delete(id);const card=document.querySelector(`[data-id="${id}"]`);if(card){card.classList.toggle('selected',value);card.querySelector('input').checked=value}controls()}
function move(id,step){const i=pages.findIndex(p=>p.id===id),j=i+step;if(i<0||j<0||j>=pages.length)return;change(()=>{const [p]=pages.splice(i,1);pages.splice(j,0,p)})}
const thumbCache=new Map();let thumbWorking=false,thumbQueue=[];
function thumbKey(p){return `${p.id}:${p.revision}`}
function cacheThumb(key,url){thumbCache.set(key,url);while(thumbCache.size>50){const oldest=thumbCache.keys().next().value;URL.revokeObjectURL(thumbCache.get(oldest));thumbCache.delete(oldest)}}
async function pumpThumbs(){if(thumbWorking||busy||tab!=='organize')return;thumbWorking=true;try{while(thumbQueue.length&&!busy&&tab==='organize'){const {p,holder}=thumbQueue.shift();if(!holder.isConnected)continue;try{const key=thumbKey(p);let url=thumbCache.get(key);if(!url){const result=await rpc('render',{page:p,scale:.35,details:false});url=URL.createObjectURL(new Blob([result.png],{type:'image/png'}));cacheThumb(key,url)}if(holder.isConnected){const img=document.createElement('img');img.src=url;img.alt=t('ページのサムネイル');img.style.cssText='max-width:95%;max-height:95%;box-shadow:0 2px 7px #0002';holder.replaceChildren(img)}}catch{if(holder.isConnected)holder.textContent=t('プレビューを表示できません')}}}finally{thumbWorking=false}}
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const p=pages.find(p=>p.id===entry.target.dataset.page);if(p)thumbQueue.push({p:structuredClone(p),holder:entry.target});observer.unobserve(entry.target)}pumpThumbs()},{rootMargin:'120px'});
let dragId=null;
function renderGrid(){observer.disconnect();thumbQueue=[];$('grid').replaceChildren();pages.forEach((p,i)=>{const card=document.createElement('article');card.className='card'+(selected.has(p.id)?' selected':'');card.dataset.id=p.id;card.draggable=!busy;const head=document.createElement('label');head.className='card-header';const label=document.createElement('span');label.textContent=`${String(i+1).padStart(2,'0')} / ${p.rotation}°`;const cb=document.createElement('input');cb.type='checkbox';cb.checked=selected.has(p.id);cb.disabled=busy;cb.setAttribute('aria-label',t("ページ {0} を選択",i+1));cb.onchange=()=>select(p.id,cb.checked);head.append(label,cb);
const preview=document.createElement('div');preview.className='page-preview';preview.dataset.page=p.id;preview.textContent=t('読み込み中…');preview.tabIndex=0;preview.setAttribute('role','button');preview.setAttribute('aria-label',t("ページ {0} の選択切替",i+1));preview.onclick=()=>select(p.id,!selected.has(p.id));preview.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();preview.click()}};const name=document.createElement('div');name.className='page-name';name.textContent=t("{0} · {1}ページ",p.name,p.index+1);name.title=name.textContent;
const actions=document.createElement('div');actions.className='page-buttons';for(const [text,title,fn,disabled]of [['←',t('前へ移動'),()=>move(p.id,-1),i===0],['↻',t('90度回転'),()=>change(()=>{p.rotation=(p.rotation+90)%360;p.ops.push({kind:'rotate',angle:p.rotation});p.revision++}),false],['→',t('後ろへ移動'),()=>move(p.id,1),i===pages.length-1]]){const b=document.createElement('button');b.textContent=text;b.setAttribute('aria-label',t("ページ {0} を{1}",i+1,title));b.onclick=fn;b.disabled=busy||disabled;actions.append(b)}const edit=document.createElement('button');edit.className='edit-page';edit.textContent=t('編集する ↗');edit.disabled=busy;edit.setAttribute('aria-label',t("ページ {0} を編集",i+1));edit.onclick=()=>{activeId=p.id;switchTab('editor')};
card.ondragstart=e=>{if(busy){e.preventDefault();return}dragId=p.id;e.dataTransfer.setData('text/plain',p.id)};card.ondragover=e=>{if(dragId&&!busy){e.preventDefault();card.classList.add('drag-target')}};card.ondragleave=()=>card.classList.remove('drag-target');card.ondrop=e=>{e.preventDefault();e.stopPropagation();card.classList.remove('drag-target');if(!dragId||busy||dragId===p.id)return;const id=dragId;dragId=null;change(()=>{const from=pages.findIndex(q=>q.id===id),to=pages.findIndex(q=>q.id===p.id);const [item]=pages.splice(from,1);pages.splice(to,0,item)})};card.ondragend=()=>{dragId=null;document.querySelectorAll('.drag-target').forEach(c=>c.classList.remove('drag-target'))};card.append(head,preview,name,actions,edit);$('grid').append(card);observer.observe(preview)})}
function render(){if(!pages.some(p=>p.id===activeId))activeId=pages[0]?.id||null;renderGrid();$('editPage').replaceChildren(...pages.map((p,i)=>{const o=document.createElement('option');o.value=p.id;o.textContent=`${i+1} / ${pages.length} · ${p.name}`;o.selected=p.id===activeId;return o}));controls();if(tab==='editor')renderEditor()}
function updateTaskUI(){
 document.querySelectorAll('[data-task]').forEach(b=>{const active=b.dataset.task===task;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 $('contextTools').hidden=tab!=='editor';$('organizeOptions').hidden=tab!=='organize';document.querySelector('.workspace').classList.toggle('single-pane',tab!=='organize');
 const titles={editor:t('PDFを編集'),comments:t('コメント・マークアップ'),redact:t('PDFを墨消し')};$('editorTitle').textContent=titles[task]||t('PDFを編集');$('contextTitle').textContent=task==='comments'?t('コメントを追加'):task==='redact'?t('墨消しツール'):t('編集ツール');
 const groups={editor:['select','replace','text','crop'],comments:['select','comment','highlight','underline','strike','rectangle','ellipse','ink'],redact:['select','redact']};
 document.querySelectorAll('[data-tool]').forEach(b=>b.hidden=!(groups[task]||[]).includes(b.dataset.tool));
 document.querySelectorAll('.settings-row label').forEach((label,i)=>label.hidden=task==='redact'||(i===1||i===2)&&!['text','replace','comment'].includes(tool)||i===3&&!['ink','rectangle','ellipse'].includes(tool));
}
function switchTab(next){finishInline(true,false);task=next;tab=next;textDraft=null;gesture=null;$('overlay').replaceChildren();for(const t of ['organize','editor','convert','security'])$(t+'Pane').hidden=t!==tab;if(tab==='editor'){setTool('replace');renderEditor()}else if(tab==='organize')renderGrid();updateTaskUI();controls()}
function chooseTask(next){const editorTask=['editor','comments','redact'].includes(next);switchTab(editorTask?'editor':next);task=next;if(editorTask)setTool(next==='comments'?'comment':next==='redact'?'redact':'replace');updateTaskUI()}
let oldPreviewURL=null;
async function renderEditor(){finishInline(true,false);const model=pages.find(p=>p.id===activeId);const token=++viewerToken;textDraft=null;viewerData=null;$('viewer').hidden=true;$('editorEmpty').hidden=!!model;$('viewerScroll').hidden=!model;if(!model){controls();return}message(t('ページを表示しています…'));try{const result=await rpc('render',{page:structuredClone(model),scale:1.5,details:true});if(token!==viewerToken||tab!=='editor')return;viewerData=result;if(oldPreviewURL)URL.revokeObjectURL(oldPreviewURL);oldPreviewURL=URL.createObjectURL(new Blob([result.png],{type:'image/png'}));$('pageImage').src=oldPreviewURL;$('viewer').hidden=false;setZoom();$('overlay').setAttribute('viewBox',`0 0 ${result.width} ${result.height}`);$('overlay').replaceChildren();renderTargets();renderEditList(model);message(t('ページを表示しました。'));controls()}catch(e){if(token===viewerToken)message(e.message,true)}}
function setZoom(){if(!viewerData)return;const factor=$('zoom').value;const width=factor==='fit'?Math.max(100,Math.min($('viewerScroll').clientWidth-48,viewerData.width*1.5)):viewerData.width*Number(factor);$('viewer').style.width=width+'px';$('viewer').style.height=width*viewerData.height/viewerData.width+'px';if(inlineSession)inlineStyle(inlineSession)}
function setTool(value){const hadInline=!!inlineSession;finishInline(true,false);tool=value;textDraft=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('toolHint').textContent=t(hints[tool]);$('textSettings').hidden=!['text','comment'].includes(tool);$('textLabel').textContent=tool==='replace'?t('置き換える文字（空欄で削除）'):tool==='comment'?t('コメント'):t('追加する文字');$('replaceNote').hidden=tool!=='replace';$('viewer').style.cursor=tool==='ink'?'crosshair':['text','comment'].includes(tool)?'text':tool==='select'?'default':'crosshair';if(tool==='highlight')$('editColor').value='#f1ce4b';else if(tool==='redact')$('editColor').value='#000000';renderTargets();updateTaskUI();controls();if(hadInline)renderEditor()}
let inlineSession=null;
function lineFont(line){
  const name=(line.fontName||'').toLowerCase();
  const family=/times|serif|明朝|mincho/.test(name)?'Times-Roman':/courier|mono/.test(name)?'Courier':'Helvetica';
  return /bold|black/.test(name)?(family==='Times-Roman'?'Times-Bold':family+'-Bold'):family;
}
function inlineStyle(session){
  const scale=$('viewer').clientWidth/session.width;
  const size=session.size*scale;
  const input=session.input;
  input.style.fontSize=size+'px';
  input.style.lineHeight=size*1.35+'px';
  input.style.fontFamily=/Times/.test(session.font)?'Georgia,"Noto Serif JP",serif':/Courier/.test(session.font)?'"Courier New",monospace':'Arial,"Hiragino Kaku Gothic ProN",sans-serif';
  input.style.fontWeight=/Bold/.test(session.font)?'700':'400';
  input.style.color=session.color;
  input.style.left=session.line.x/session.width*100+'%';
  input.style.top=(session.line.y-session.size*.9)/session.height*100+'%';
  const available=(session.width-session.line.x)*scale;
  input.style.width=Math.max(30,available)+'px';
  input.style.height=Math.max(session.line.rect[3]-session.line.rect[1],session.size*1.35*(input.value.split('\n').length))*scale+3+'px';
  const toolbar=session.toolbar;
  const left=Math.min(Math.max(4,session.line.x*scale),Math.max(4,$('viewer').clientWidth-toolbar.offsetWidth-4));
  toolbar.style.left=left+'px';
  const top=(session.line.y-session.size*.9)*scale;
  toolbar.style.top=(top>toolbar.offsetHeight+10?top-toolbar.offsetHeight-8:top+parseFloat(input.style.height)+8)+'px';
}
function finishInline(commit=true,refresh=true){
  const session=inlineSession;
  if(!session)return;
  inlineSession=null;
  const model=pages.find(p=>p.id===session.pageId);
  const changed=session.input.value!==session.line.text||session.size!==session.initialSize||session.color!==session.initialColor||session.font!==session.initialFont;
  if(commit&&model&&changed){
    snapshot();
    model.ops.push({kind:'replace',rect:[...session.line.rect],x:session.line.x,y:session.line.y,text:session.input.value,size:session.size,color:session.color,font:session.font});
    model.revision++;
  }
  session.input.remove();session.toolbar.remove();
  if(session.cleanURL)URL.revokeObjectURL(session.cleanURL);
  if(oldPreviewURL)$('pageImage').src=oldPreviewURL;
  $('textTargets').classList.remove('inline-active');
  if(commit&&changed){message(t('文字を変更しました。PDF保存に反映されます。'));if(refresh)render();else controls()}
  else{renderTargets();controls();if(!commit)message(t('文字の変更を取り消しました。'))}
}
async function startInline(line,event){
  if(busy||!viewerData)return;
  if(inlineSession){
    const expectedId=activeId;
    finishInline(true,false);
    await renderEditor();
    if(!viewerData||tab!=='editor'||activeId!==expectedId)return;
    line=viewerData.lines.find(candidate=>Math.abs(candidate.y-line.y)<1&&Math.abs(candidate.x-line.x)<1)||line;
  }
  const model=pages.find(p=>p.id===activeId);
  if(!model)return;
  const input=document.createElement('textarea');
  input.className='inline-text-editor';input.setAttribute('data-inline-ui','');
  input.setAttribute('aria-label',t('PDFの文字を直接編集'));input.setAttribute('wrap','off');
  input.spellcheck=false;input.value=line.text;
  const toolbar=document.createElement('div');toolbar.className='inline-text-toolbar';toolbar.setAttribute('data-inline-ui','');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label',t('文字の書式と編集の確定'));
  const font=document.createElement('select');font.setAttribute('aria-label',t('編集中のフォント'));
  for(const [value,label]of [['Helvetica',t('ゴシック')],['Helvetica-Bold',t('ゴシック 太字')],['Times-Roman',t('明朝')],['Times-Bold',t('明朝 太字')],['Courier',t('等幅')],['Courier-Bold',t('等幅 太字')]]){const option=document.createElement('option');option.value=value;option.textContent=label;font.append(option)}
  const size=document.createElement('input');size.type='number';size.min=6;size.max=144;size.step=.5;size.setAttribute('aria-label',t('編集中の文字サイズ'));
  const color=document.createElement('input');color.type='color';color.setAttribute('aria-label',t('編集中の文字色'));
  const done=document.createElement('button');done.type='button';done.textContent=t('完了');done.className='inline-done';done.setAttribute('aria-label',t('文字編集を確定'));
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('取消');cancel.setAttribute('aria-label',t('文字編集を取消'));
  toolbar.append(font,size,color,done,cancel);
  const session={pageId:model.id,line:structuredClone(line),input,toolbar,width:viewerData.width,height:viewerData.height,size:Math.max(6,Math.min(144,line.size)),color:line.color||'#000000',font:lineFont(line),composing:false,cleanURL:null};
  session.initialSize=session.size;session.initialColor=session.color;session.initialFont=session.font;
  inlineSession=session;size.value=session.size;groupSet();
  function groupSet(){font.value=session.font;color.value=session.color}
  $('textTargets').classList.add('inline-active');$('viewer').append(input,toolbar);inlineStyle(session);
  input.oninput=()=>inlineStyle(session);
  input.addEventListener('compositionstart',()=>session.composing=true);
  input.addEventListener('compositionend',()=>session.composing=false);
  input.onkeydown=e=>{
    e.stopPropagation();
    if(e.isComposing||session.composing||e.keyCode===229)return;
    if(e.key==='Escape'){e.preventDefault();finishInline(false)}
    else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finishInline(true)}
  };
  font.onchange=()=>{session.font=font.value;inlineStyle(session);input.focus()};
  size.oninput=()=>{const value=Number(size.value);if(Number.isFinite(value)&&value>=6&&value<=144){session.size=value;inlineStyle(session)}};
  color.oninput=()=>{session.color=color.value;inlineStyle(session)};
  done.onclick=()=>finishInline(true);cancel.onclick=()=>finishInline(false);
  input.focus({preventScroll:true});
  let caret=0;
  if(event){const box=input.getBoundingClientRect();const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');ctx.font=`${/Bold/.test(session.font)?'bold ':''}${parseFloat(input.style.fontSize)}px ${input.style.fontFamily}`;const target=Math.max(0,event.clientX-box.left);let prev=0;for(let i=1;i<=line.text.length;i++){const next=ctx.measureText(line.text.slice(0,i)).width;if(target<(prev+next)/2){caret=i-1;break}caret=i;prev=next}}
  input.setSelectionRange(caret,caret);
  // Render the page without the old glyphs; typing itself stays entirely in the native input.
  try{
    const preview=structuredClone(model);preview.ops.push({kind:'replace',rect:[...line.rect],x:line.x,y:line.y,text:'',size:session.size,color:session.color,font:session.font});
    const result=await rpc('render',{page:preview,scale:1.5,details:false});
    if(inlineSession!==session)return;
    session.cleanURL=URL.createObjectURL(new Blob([result.png],{type:'image/png'}));
    $('pageImage').src=session.cleanURL;
    input.style.background='transparent';
  }catch(e){if(inlineSession===session){finishInline(false);message(e.message,true)}}
}
function renderTargets(){
  $('textTargets').replaceChildren();
  if(tool!=='replace'||!viewerData||busy||inlineSession)return;
  for(const line of viewerData.lines){
    if(line.wmode||Math.abs(line.direction[0]-1)>.05||Math.abs(line.direction[1])>.05)continue;
    const b=document.createElement('button');b.className='text-target';b.setAttribute('aria-label',t("「{0}」を編集",line.text));b.title=t('クリックして直接編集');
    const r=line.rect;b.style.cssText=`left:${r[0]/viewerData.width*100}%;top:${r[1]/viewerData.height*100}%;width:${(r[2]-r[0])/viewerData.width*100}%;height:${(r[3]-r[1])/viewerData.height*100}%`;
    b.onclick=e=>{e.stopPropagation();startInline(line,e)};$('textTargets').append(b);
  }
}
document.addEventListener('pointerdown',e=>{
  if(!inlineSession||e.target.closest('[data-inline-ui]')||e.target.closest('.text-target'))return;
  finishInline(true);
},true);
document.addEventListener('focusin',e=>{
  if(!inlineSession||e.target.closest('[data-inline-ui]')||e.target.closest('.text-target'))return;
  finishInline(true);
});
function renderEditList(model){$('editList').replaceChildren();const ownComments=model.ops.filter(op=>op.kind==='comment').map(op=>op.text);for(const annotation of viewerData.annotations){if(annotation.type==='Text'&&!ownComments.includes(annotation.text)){const div=document.createElement('div');div.className='edit-entry';const span=document.createElement('span');span.textContent=t('コメント：')+annotation.text;div.append(span);$('editList').append(div)}}model.ops.forEach((op,i)=>{const div=document.createElement('div');div.className='edit-entry';const span=document.createElement('span');span.textContent=t(labels[op.kind])+(op.text?'：'+op.text:'');const b=document.createElement('button');b.textContent=t('取り消す');b.disabled=busy;b.onclick=()=>{if(op.kind==='rotate'||op.kind==='crop'){message(t('回転・切り抜きは「元に戻す」で取り消してください。'));return}change(()=>{model.ops.splice(i,1);model.revision++})};div.append(span,b);$('editList').append(div)});if(!model.ops.length&&!viewerData.annotations.length)$('editList').textContent=t('まだ変更はありません。')}
function point(e){const r=$('viewer').getBoundingClientRect();return [Math.max(0,Math.min(viewerData.width,(e.clientX-r.left)/r.width*viewerData.width)),Math.max(0,Math.min(viewerData.height,(e.clientY-r.top)/r.height*viewerData.height))]}
function drawGesture(){const svg=$('overlay');svg.replaceChildren();if(!gesture)return;let el;if(tool==='ink'){el=document.createElementNS('http://www.w3.org/2000/svg','polyline');el.setAttribute('points',gesture.points.map(p=>p.join(',')).join(' '));el.setAttribute('fill','none');el.setAttribute('stroke',$('editColor').value);el.setAttribute('stroke-width',$('lineWidth').value)}else{const r=rectOf(gesture.start,gesture.end);el=document.createElementNS('http://www.w3.org/2000/svg','rect');el.setAttribute('x',r[0]);el.setAttribute('y',r[1]);el.setAttribute('width',r[2]-r[0]);el.setAttribute('height',r[3]-r[1]);el.setAttribute('fill',tool==='redact'?'#0008':'#6aa28633');el.setAttribute('stroke',tool==='redact'?'#712c22':'#285243');el.setAttribute('stroke-width',1);el.setAttribute('stroke-dasharray','4 3')}svg.append(el)}
const rectOf=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
$('viewer').onpointerdown=e=>{if(busy||!viewerData||tool==='select'||tool==='replace'||e.button!==0)return;e.preventDefault();const p=point(e);if(tool==='text'||tool==='comment'){textDraft={kind:tool,x:p[0],y:p[1]};controls();if($('editText').value.trim())commitText();else{$('editText').focus();message(t('文字を入力して「ページに反映」を押してください。'))}return}gesture={start:p,end:p,points:[p],pointer:e.pointerId};$('viewer').setPointerCapture(e.pointerId);drawGesture()};
$('viewer').onpointermove=e=>{if(!gesture||gesture.pointer!==e.pointerId)return;gesture.end=point(e);if(tool==='ink')gesture.points.push(gesture.end);drawGesture()};
$('viewer').onpointerup=e=>{if(!gesture||gesture.pointer!==e.pointerId)return;const g=gesture;gesture=null;$('overlay').replaceChildren();if(tool==='ink'){if(g.points.length>1)applyOp({kind:'ink',points:g.points,color:$('editColor').value,width:Number($('lineWidth').value)||2});return}const rect=rectOf(g.start,g.end);if(rect[2]-rect[0]<3||rect[3]-rect[1]<3){message(t('もう少し大きな範囲を選んでください。'));return}applyOp({kind:tool,rect,color:$('editColor').value,width:Number($('lineWidth').value)||2});if(tool==='redact')message(t('範囲を墨消ししました。保存PDFから対象データを除去します。元ファイルは変わりません。'));if(tool==='crop')message(t('表示範囲を切り抜きました。範囲外の情報は残ります。'))};$('viewer').onpointercancel=()=>{gesture=null;$('overlay').replaceChildren()};
function commitText(){if(!textDraft||busy)return;const text=$('editText').value;if(textDraft.kind!=='replace'&&!text.trim()){message(t('文字を入力してください。'),true);return}const size=Number($('fontSize').value);if(!Number.isFinite(size)||size<6||size>144){message(t('文字サイズは6〜144を指定してください。'),true);return}const op={...textDraft,text,size,color:$('editColor').value,font:$('editFont').value};applyOp(op)}
function askPassword(name){return new Promise(resolve=>{$('lockedName').textContent=name;$('inputPassword').value='';$('passwordDialog').showModal();$('inputPassword').focus();const finish=value=>{$('passwordDialog').close();$('passwordForm').onsubmit=null;$('cancelPassword').onclick=null;$('passwordDialog').oncancel=null;resolve(value)};$('passwordForm').onsubmit=e=>{e.preventDefault();finish($('inputPassword').value)};$('cancelPassword').onclick=()=>finish(null);$('passwordDialog').oncancel=e=>{e.preventDefault();finish(null)}})}
async function addFiles(files){if(busy||!files.length)return;busy=true;controls();let errors=[],incoming=[];for(const file of files){try{message(t("{0} を読み込み中…",file.name));if(file.size>100*1024*1024)throw Error(t('100MBを超えるファイルは未対応です。小さく分割してください。'));if(sourceBytes+file.size>100*1024*1024)throw Error(t('作業中のファイル合計が100MBを超えます。作業を保存してクリアしてください。'));let data=new Uint8Array(await file.arrayBuffer());if(/\.(png|jpe?g)$/i.test(file.name)||/^image\/(png|jpeg)$/.test(file.type)){const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>25000000)throw Error(t('画像は2,500万画素以内に縮小してください。'));data=await rpc('images',{images:[data]});}else if(!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf')throw Error(t('PDF・PNG・JPEGを選んでください。'));const source=crypto.randomUUID();let result=await rpc('open',{id:source,data});while(result.locked){const password=await askPassword(file.name);if(password===null)break;result=await rpc('open',{id:source,data,password});if(result.locked)message(t('パスワードが違います。再入力してください。'),true)}if(result.locked){errors.push(t("{0}：スキップしました。",file.name));continue}if(pages.length+incoming.length+result.pages.length>1000){await rpc('release',{id:source});throw Error(t('作業台は1,000ページまでです。文書を分けて処理してください。'));}sourceBytes+=file.size;for(const p of result.pages)incoming.push({id:crypto.randomUUID(),source,index:p.index,rotation:p.rotation,ops:[],revision:0,name:file.name})}catch(e){errors.push(`${file.name}：${e.message}`)}}if(incoming.length){snapshot();pages.push(...incoming)}busy=false;render();message([incoming.length?t("{0} ページを追加しました。",incoming.length):'',...errors].join(' '),!!errors.length);$('files').value='';pumpThumbs()}
function parseRange(value,total){if(!value.trim())throw Error(t('ページ番号を入力してください。'));const result=new Set();for(const part of value.replace(/[–—−]/g,'-').split(',')){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error(t('「1-3, 5」の形式で入力してください。'));const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b>total||b<a)throw Error(t("1〜{0} のページ番号を指定してください。",total));for(let i=a;i<=b;i++)result.add(i-1)}return [...result]}
function baseName(){return $('filename').value.trim().replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'pdf-edited'}
function download(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function outputPassword(){if(!$('encryptOutput').checked)return '';const pw=$('outputPassword').value;if(!pw)throw Error(t('「パスワード」タブでパスワードを設定してください。'));if(pw!==$('confirmPassword').value)throw Error(t('確認用パスワードが一致しません。'));return pw}
async function save(mode){if(busy)return;finishInline(true,false);const list=mode==='all'?pages:pages.filter(p=>mode==='selected'?selected.has(p.id):!selected.has(p.id));if(!list.length)return;let password;try{password=outputPassword()}catch(e){message(e.message,true);switchTab('security');return}busy=true;controls();message(t('PDFを作成しています…'));try{const bytes=await rpc('save',{pages:list,password});download(bytes,baseName()+(mode==='selected'?'-selected':mode==='remainder'?'-remaining':'')+'.pdf','application/pdf');message(t("{0} ページのPDFを保存しました。{1}",list.length,password?t('パスワードを設定しました。'):''))}catch(e){message(e.message,true)}finally{busy=false;controls();pumpThumbs()}}
async function convert(){if(busy)return;finishInline(true,false);const list=$('convertScope').value==='all'?pages:pages.filter(p=>selected.has(p.id));if(!list.length){message(t('変換するページを選択してください。'),true);return}const format=$('convertFormat').value;if(['txt','html-text'].includes(format)&&list.length>1000){message(t('一度に変換できるのは1,000ページまでです。'),true);return}if(['png','jpg','html'].includes(format)&&list.length>100){message(t('画像形式への変換は100ページ以内で実行してください。'),true);return}busy=true;controls();try{message(t('変換しています…'));if(format==='png'||format==='jpg'){const zip=new window.JSZip();let size=0;for(let i=0;i<list.length;i++){message(t("{0} / {1} ページを変換中…",i+1,list.length));const r=await rpc('convert',{pages:[list[i]],format,language:getLanguage(),scale:Number($('exportScale').value)});const f=r.files[0];size+=f.bytes.length;if(size>80*1024*1024)throw Error(t('変換画像が80MBを超えました。解像度を下げるかページを分けてください。'));if(list.length===1)download(f.bytes,baseName()+'.'+f.extension,'image/'+(format==='jpg'?'jpeg':'png'));else zip.file(`page-${String(i+1).padStart(3,'0')}.${f.extension}`,f.bytes)}if(list.length>1)download(await zip.generateAsync({type:'uint8array',compression:'STORE'}),baseName()+'-'+format+'.zip','application/zip')}else{if(format==='html'&&list.length>30)throw Error(t('見た目を保持するHTMLは30ページ以内で実行してください。'));const r=await rpc('convert',{pages:list,format,language:getLanguage(),scale:Number($('exportScale').value)});download(r.text,baseName()+'.'+r.extension,r.mime)}message(t('変換したファイルを保存しました。'))}catch(e){message(e.message,true)}finally{busy=false;controls();pumpThumbs()}}
$('open').onclick=e=>{e.stopPropagation();$('files').click()};$('drop').onclick=e=>{if(!busy&&e.target.id!=='files')$('files').click()};$('drop').onkeydown=e=>{if(e.target===$('drop')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!busy)$('files').click()}};$('files').onchange=e=>addFiles([...e.target.files]);for(const event of ['dragenter','dragover'])$('drop').addEventListener(event,e=>{e.preventDefault();if(!busy)$('drop').classList.add('dragover')});$('drop').ondragleave=()=>$('drop').classList.remove('dragover');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('dragover');if(!busy)addFiles([...e.dataTransfer.files])};window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('all').onclick=()=>{selected=new Set(pages.map(p=>p.id));render()};$('none').onclick=()=>{selected.clear();render()};$('rotate').onclick=()=>change(()=>pages.forEach(p=>{if(selected.has(p.id)){p.rotation=(p.rotation+90)%360;p.ops.push({kind:'rotate',angle:p.rotation});p.revision++}}));$('duplicate').onclick=()=>change(()=>{pages=pages.flatMap(p=>selected.has(p.id)?[p,{...structuredClone(p),id:crypto.randomUUID()}]:[p])});$('remove').onclick=()=>change(()=>{pages=pages.filter(p=>!selected.has(p.id));selected.clear()});$('undo').onclick=undo;$('editUndo').onclick=undo;$('clear').onclick=async()=>{if(busy)return;busy=true;controls();try{await rpc('clear');sourceBytes=0;pages=[];selected.clear();history=[];redo=[];for(const url of thumbCache.values())URL.revokeObjectURL(url);thumbCache.clear();$('outputPassword').value='';$('confirmPassword').value='';$('encryptOutput').checked=false;message(t('作業内容をクリアしました。'))}finally{busy=false;render()}};
$('selectRange').onclick=()=>{try{selected=new Set(parseRange($('range').value,pages.length).map(i=>pages[i].id));render();message(t("{0} ページを選択しました。",selected.size))}catch(e){message(e.message,true)}};$('range').onkeydown=e=>{if(e.key==='Enter'&&!$('selectRange').disabled)$('selectRange').click()};$('save').onclick=()=>save('all');$('extract').onclick=()=>save('selected');$('remainder').onclick=()=>save('remainder');$('convert').onclick=convert;
document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>chooseTask(b.dataset.task));document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{chooseTask('organize');message(b.dataset.action==='combine'?t('追加したファイルはページ順に結合されます。PDFを保存するとひとつのファイルになります。'):t('PNG・JPEGを追加してPDFを作成できます。'));$('files').click()});document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('editPage').onchange=()=>{activeId=$('editPage').value;renderEditor();controls()};for(const [id,step]of [['prevPage',-1],['nextPage',1]])$(id).onclick=()=>{const i=pages.findIndex(p=>p.id===activeId);activeId=pages[i+step]?.id||activeId;$('editPage').value=activeId;renderEditor();controls()};$('editRotate').onclick=()=>{const p=pages.find(p=>p.id===activeId);if(p)applyOp({kind:'rotate',angle:(p.rotation+90)%360})};$('zoom').onchange=setZoom;$('applyText').onclick=commitText;window.addEventListener('resize',setZoom);window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();if(e.shiftKey&&!busy&&redo.length){history.push(state());restore(redo.pop());message(t('やり直しました。'))}else undo()}});
$('sample').onclick=async()=>{if(busy)return;busy=true;controls();try{const {PDFDocument,StandardFonts,rgb}=window.PDFLib;const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);for(let i=1;i<=4;i++){const p=doc.addPage([420,594]);p.drawRectangle({x:0,y:0,width:420,height:594,color:rgb(.98,.96,.97)});p.drawText('pdf.fjtd.dev / SAMPLE',{x:36,y:545,size:12,font,color:rgb(.59,.33,.44)});p.drawText(String(i).padStart(2,'0'),{x:36,y:400,size:95,font,color:rgb(.59,.33,.44)});p.drawText(['Cover','Notes','Plans','Appendix'][i-1],{x:36,y:340,size:28,font});p.drawText('Edit this text. Add your own notes.',{x:36,y:285,size:12,font});p.drawText('A sample document for your PDF workspace.',{x:36,y:48,size:10,font})}const bytes=await doc.save();busy=false;await addFiles([new File([bytes],'pdf-sample.pdf',{type:'application/pdf'})])}catch(e){busy=false;controls();message(e.message,true)}};
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_pdf_workspace',description:'Read page order, rotation, edits and selection in the PDF workspace.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({pages:pages.map((p,i)=>({position:i+1,rotation:p.rotation,editCount:p.ops.length,selected:selected.has(p.id)})),busy})})).catch(()=>{})}catch{}}
const iconPaths={
 edit:'M4 20h4L20 8l-4-4L4 16v4M14 6l4 4',pages:'M4 3h10v14H4zM10 17v4h10V7h-6',merge:'M4 3h5v7H4zM15 3h5v7h-5zM6.5 10v4h11v-4M12 14v7m-3-3 3 3 3-3',plus:'M12 4v16M4 12h16',comment:'M4 4h16v12H9l-5 4V4',export:'M14 3h7v7M21 3l-9 9M10 4H4v16h16v-6',lock:'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3M12 14v3',redact:'M4 4h16M12 4v5M4 13h16v7H4zM5 19l6-6m0 6 6-6',select:'M5 3v17l5-5 4 6 3-2-4-6h7L5 3',text:'M4 5h16M12 5v14M8 19h8',highlight:'M4 16l9-12 6 4-9 12H4v-4M3 22h18',underline:'M6 3v8a6 6 0 0 0 12 0V3M4 22h16',strike:'M17 5c-8-5-13 2-8 5m-6 2h18m-6 2c6 6-5 9-10 4',rectangle:'M4 5h16v14H4z',ellipse:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',ink:'M3 19c2-12 9-18 9-12 0 5-7 14-9 12 0-4 13-10 11-3-2 7 4-4 7 0',crop:'M6 3v15h15M3 6h15v15',save:'M5 3h13l3 3v15H3V3h2M7 3v6h10V3M7 21v-8h10v8',undo:'M4 10h10a7 7 0 0 1 0 14M4 10l5-5M4 10l5 5',rotate:'M20 8a9 9 0 1 0 1 7M20 3v5h-5',copy:'M8 8h13v13H8zM16 8V3H3v13h5',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',check:'M4 12l5 5L20 6',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',arrowLeft:'M20 12H4m6-6-6 6 6 6',arrowRight:'M4 12h16m-6-6 6 6-6 6'};
function decorateButtons(){
 const ids={open:'plus',sample:'pages',save:'save',undo:'undo',editUndo:'undo',clear:'trash',all:'check',none:'select',rotate:'rotate',editRotate:'rotate',duplicate:'copy',remove:'trash',extract:'download',remainder:'download',convert:'export',applyText:'check',selectRange:'check',prevPage:'arrowLeft',nextPage:'arrowRight'};
 const names={editor:'edit',organize:'pages',convert:'export',security:'lock',comments:'comment',redact:'redact',combine:'merge',create:'plus',replace:'edit',comment:'comment'};
 const buttons=new Set([...Object.keys(ids).map(id=>$(id)),...document.querySelectorAll('[data-task],[data-tool],[data-action]')]);
 for(const b of buttons){if(!b)continue;const name=ids[b.id]||names[b.dataset.task||b.dataset.action||b.dataset.tool]||b.dataset.tool;const path=iconPaths[name];if(!path)continue;b.querySelector(':scope > span[aria-hidden]')?.remove();b.textContent=b.textContent.replace(/^[↶↻←→]\s*|\s*[↓↗]$/g,'');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','button-icon');svg.setAttribute('aria-hidden','true');const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',path);svg.append(shape);b.prepend(svg)}
}
decorateButtons();
initLanguage();
window.addEventListener('languagechange',()=>{finishInline(true,false);setTool(tool);render();updateTaskUI();message('')});
setTool('select');updateTaskUI();render();

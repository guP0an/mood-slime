(() => {
  'use strict';
  const M=MoodModel,$=id=>document.getElementById(id),boot=window.__moodBoot||{state:M.empty(),readOnly:true,warning:'请从心晴桌面应用打开，浏览器预览不会保存数据。'};
  let state,readOnly=!!boot.readOnly,selectedMood='calm',selectedDay=M.dayKey(),view=new Date(),mini=false,pending=0,queue=Promise.resolve(),skinSource=boot.skinSource;
  try{state=M.validate(boot.state);}catch(e){state=M.empty();readOnly=true;boot.warning=e.message;}
  let cursorDay=null,selectedMinute=0,selectedEventId=null,dayAxis=null;
  const callbacks=new Map();let requestId=0;
  window.nativeReply=(id,value)=>{const callback=callbacks.get(id);if(callback){callbacks.delete(id);clearTimeout(callback.timer);callback.resolve(value);}};
  function native(action,data={}){
    return new Promise((resolve,reject)=>{const id=++requestId;let timer=null;
      if(action==='save')timer=setTimeout(()=>notice('仍在等待本机保存结果，请稍候。'),8000);
      else if(!['importSkin','export','contextMenu','notifyError'].includes(action))timer=setTimeout(()=>{callbacks.delete(id);reject(Error('本机操作未响应，请重试。'));},30000);
      callbacks.set(id,{resolve,timer});
      const bridge=window.webkit?.messageHandlers?.mood;
      if(bridge)bridge.postMessage({action,id,...data});else{clearTimeout(timer);callbacks.delete(id);reject(Error('请从桌面应用打开。'));}
    });
  }
  function notice(message,error=false){$('save-state').textContent=message;$('save-state').style.color=error?'#A05E46':'';if(mini){$('pet-reaction').textContent=message;if(error)native('notifyError',{message}).catch(()=>{});}}
  function transact(change,success){
    if(readOnly){notice('存档处于保护模式，请先检查存档位置。',true);return Promise.resolve(false);}
    pending++;renderDisabled();
    const task=queue.then(async()=>{const next=M.validate(change(state));const result=await native('save',{data:next});if(!result.ok)throw Error(result.error||'保存失败，原记录已保留。');state=next;render();if(success)notice(success);return true;}).catch(e=>{notice(e.message,true);return false;}).finally(()=>{pending--;renderDisabled();});
    queue=task;return task;
  }
  function renderDisabled(){for(const id of ['record','choose-skin','reset-skin'])$(id).disabled=readOnly||pending>0;}
  function renderMood(){for(const button of $('mood-options').children)button.setAttribute('aria-pressed',String(button.dataset.mood===selectedMood));pet.setMood(selectedMood);}
  for(const m of M.moods){const b=document.createElement('button');b.type='button';b.className='mood-option';b.dataset.mood=m.id;b.style.setProperty('--mood',m.color);b.setAttribute('aria-pressed','false');const dot=document.createElement('span');dot.className='mood-dot';dot.setAttribute('aria-hidden','true');b.append(dot,document.createTextNode(m.name));b.addEventListener('click',()=>{selectedMood=m.id;renderMood();notice('已选'+m.name+'，点击「记下此刻」保存。');});$('mood-options').append(b);

  }
  const pet=new MoodPet($('pet'),message=>$('pet-reaction').textContent=message);
  function orb(events,day){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 30 27');
    const axis=M.dayTimeline(state,day),total=axis.knownMinutes;
    const counts=total>0?axis.totals.map(t=>({m:M.moodById[t.mood],weight:t.minutes/total})):events.length?[{m:M.moodById[events.at(-1).mood],weight:1}]:[];
    const clip=document.createElementNS(svg.namespaceURI,'clipPath'),id='orb-'+day;clip.id=id;
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M3 15C1 7 7 2 15 2s13 5 12 13c-1 9-6 10-12 10S5 24 3 15Z');clip.append(path);svg.append(clip);let x=0;
    for(const {m,weight}of counts){const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x',x);rect.setAttribute('y','0');const w=weight*30;rect.setAttribute('width',w+.25);rect.setAttribute('height','27');rect.setAttribute('fill',m.color);rect.setAttribute('clip-path','url(#'+id+')');svg.append(rect);x+=w;}
    for(const x of [11,19]){const eye=document.createElementNS(svg.namespaceURI,'circle');eye.setAttribute('cx',x);eye.setAttribute('cy','14');eye.setAttribute('r','1.05');eye.setAttribute('fill','#3D4B3D99');svg.append(eye);}return svg;
  }
  function renderCalendar(){const year=view.getFullYear(),month=view.getMonth(),today=M.dayKey();$('month-label').textContent=`${year} 年 ${month+1} 月`;$('calendar').replaceChildren();
    for(const day of M.monthGrid(year,month)){if(!day){$('calendar').append(document.createElement('span'));continue;}const records=M.entries(state,day),b=document.createElement('button');b.type='button';b.className='day'+(day===today?' is-today':'')+(day>today?' future':'');b.dataset.day=day;b.setAttribute('aria-pressed',String(day===selectedDay));b.setAttribute('aria-label',`${day}，${records.length}次心情记录`);const n=document.createElement('span');n.className='day-number';n.textContent=Number(day.slice(-2));const icon=document.createElement('span');icon.className=records.length?'day-orb':'day-empty';icon.setAttribute('aria-hidden','true');if(records.length)icon.append(orb(records,day));b.append(n,icon);b.addEventListener('click',()=>{selectedDay=day;renderCalendar();renderDay();});$('calendar').append(b);}
  }
  function renderMoment(){
    if(!dayAxis)return;
    const result=M.momentAt(dayAxis,selectedMinute,selectedEventId);
    const labels={unknown:'\u672a\u8bb0\u5f55',future:'\u8fd8\u6ca1\u5230\u8fd9\u4e00\u523b',shift:'\u67e5\u770b\u539f\u59cb\u8bb0\u5f55'};
    $('cursor-clock').textContent=M.clockLabel(selectedMinute);
    $('time-cursor').value=String(selectedMinute);
    const mood=result.event?M.moodById[result.event.mood]:null;
    $('moment-mood').textContent=mood?mood.name:labels[result.kind];
    $('moment').style.setProperty('--moment-ink',mood?.ink||'#8C7F73');
    const segment=result.segment;
    $('moment-range').textContent=segment?M.clockLabel(segment.start,true)+' \u2014 '+M.clockLabel(segment.end,true):result.event?M.clockLabel(M.wallMinute(result.event),true):M.clockLabel(selectedMinute);
    $('moment-note').textContent=result.event?.note||(result.kind==='shift'?'\u5f53\u5929\u949f\u9762\u65f6\u95f4\u53d1\u751f\u53d8\u5316\uff0c\u539f\u59cb\u65f6\u95f4\u4e0e\u7559\u8a00\u4fdd\u7559\u5728\u8bb0\u5f55\u660e\u7ec6\u3002':result.kind==='unknown'?'\u8fd9\u4e00\u6bb5\u8fd8\u6ca1\u6709\u8bbe\u7f6e\u5fc3\u60c5\u3002':result.kind==='future'?'\u4eca\u5929\u7684\u989c\u8272\uff0c\u4f1a\u6162\u6162\u5ef6\u4f38\u5230\u8fd9\u91cc\u3002':'\u8fd9\u4e00\u6bb5\u6ca1\u6709\u7559\u8a00\uff0c\u4e5f\u5f88\u597d\u3002');
    $('time-cursor').setAttribute('aria-valuetext',M.clockLabel(selectedMinute)+'\uff0c'+$('moment-mood').textContent);
  }
  function renderDay(){
    const entries=M.entries(state,selectedDay),today=M.dayKey();dayAxis=M.dayTimeline(state,selectedDay);
    if(cursorDay!==selectedDay){cursorDay=selectedDay;selectedEventId=null;selectedMinute=Math.min(1439,Math.floor(selectedDay===today?dayAxis.cutoff:dayAxis.points.at(-1)?.minute||0));}
    $('day-label').textContent=selectedDay===today?'\u4eca\u5929\u7684\u5fc3\u60c5\u65f6\u95f4\u8f74':Number(selectedDay.slice(5,7))+' \u6708 '+Number(selectedDay.slice(8))+' \u65e5\u7684\u5fc3\u60c5\u65f6\u95f4\u8f74';
    $('entry-count').textContent=entries.length?entries.length+' \u6b21\u53d8\u66f4':'';
    $('detail-count').textContent=entries.length?'('+entries.length+')':'';
    $('record-details').hidden=!entries.length;$('empty-day').hidden=entries.length>0;$('timeline').replaceChildren();
    const recap=state.summaries[selectedDay];$('recap').textContent=recap?.text||'';$('recap').hidden=!recap;
    $('time-segments').replaceChildren();$('time-points').replaceChildren();$('time-totals').replaceChildren();
    for(const segment of dayAxis.segments){
      const div=document.createElement('span');div.className='time-segment';div.dataset.mood=segment.mood;div.dataset.start=segment.start;div.dataset.end=segment.end;
      div.style.left=segment.start/1440*100+'%';div.style.width=(segment.end-segment.start)/1440*100+'%';div.style.background=M.moodById[segment.mood].color;$('time-segments').append(div);
    }
    for(const point of dayAxis.points){
      const button=document.createElement('button');button.type='button';button.className='time-point';button.style.left=point.minute/1440*100+'%';button.style.setProperty('--mood',M.moodById[point.event.mood].color);
      button.title=M.clockLabel(point.minute,true)+' '+M.moodById[point.event.mood].name;button.setAttribute('aria-label',button.title+(point.event.note?'\uff0c'+point.event.note:''));
      button.addEventListener('click',()=>{selectedMinute=Math.floor(point.minute);selectedEventId=point.event.id;renderMoment();});$('time-points').append(button);
    }
    for(const total of dayAxis.totals){
      const span=document.createElement('span'),dot=document.createElement('i');dot.style.setProperty('--mood',M.moodById[total.mood].color);
      span.append(dot,document.createTextNode(M.moodById[total.mood].name+' '+M.durationLabel(total.minutes)));$('time-totals').append(span);
    }
    $('time-rule').textContent=dayAxis.timeShift?'\u5f53\u5929\u5b58\u5728\u65f6\u533a\u6216\u590f\u4ee4\u65f6\u53d8\u5316\uff0c\u4ec5\u5c55\u793a\u8bb0\u5f55\u70b9\uff1b\u8bf7\u67e5\u770b\u539f\u59cb\u660e\u7ec6\u3002':'\u4ece\u8bbe\u7f6e\u8d77\u6301\u7eed\u5230\u4e0b\u6b21\u4fee\u6539\uff1b\u9996\u6b21\u8bb0\u5f55\u524d\u7559\u767d\u3002'+(selectedDay===today?'\u4eca\u5929\u53ea\u8ba1\u7b97\u5230\u5f53\u524d\u65f6\u523b\u3002':'');
    for(const e of entries){
      const li=document.createElement('li'),time=document.createElement('time'),dot=document.createElement('span'),content=document.createElement('div'),name=document.createElement('span');
      time.textContent=M.clockLabel(M.wallMinute(e),true);time.dateTime=new Date(e.at).toISOString();dot.className='event-dot';dot.style.background=M.moodById[e.mood].color;name.className='event-mood';name.textContent=M.moodById[e.mood].name;content.append(name);
      if(e.note){const p=document.createElement('p');p.textContent=e.note;content.append(p);}li.append(time,dot,content);$('timeline').append(li);
    }
    renderMoment();
  }
  $('time-cursor').addEventListener('input',()=>{selectedEventId=null;selectedMinute=Number($('time-cursor').value);renderMoment();});
  function render(){const now=new Date();$('date-label').textContent=now.toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).replaceAll('/','.');$('weekday-label').textContent=now.toLocaleDateString('zh-CN',{weekday:'long'});const last=state.events.at(-1);$('current-label').textContent=last&&last.day===M.dayKey(now)?'最近记录 · '+M.moodById[last.mood].name:'今天还没有记录';$('skin-label').textContent=state.skin?state.skin.name+(state.skin.durations.length>1?' · 动态皮肤':' · 图片皮肤'):'原生小糯团';$('reset-skin').hidden=!state.skin;renderMood();renderCalendar();renderDay();}
  async function saveMood(mood,note){const at=new Date(),id=crypto.randomUUID();const ok=await transact(s=>M.closeDays(M.record(s,mood,note,at,id),at),'已保存在这台电脑 · '+at.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));if(ok){cursorDay=null;selectedMood=mood;selectedDay=M.dayKey(at);view=new Date(at.getFullYear(),at.getMonth(),1);if($('note').value===note)$('note').value='';render();}return ok;}
  $('record').addEventListener('click',()=>saveMood(selectedMood,$('note').value));
  $('squish').addEventListener('click',()=>pet.squish());$('stroke').addEventListener('click',()=>pet.stroke());
  for(const [id,delta]of [['prev-month',-1],['next-month',1]])$(id).addEventListener('click',()=>{const year=view.getFullYear();if(year+delta<1970||year+delta>9998)return;view=new Date(year,view.getMonth()+delta,1);renderCalendar();});
  $('today').addEventListener('click',()=>{view=new Date();selectedDay=M.dayKey();renderCalendar();renderDay();});
  async function desktop(enabled){try{pet.release();$('pet').blur();const result=await native('desktop',{enabled});if(!result.ok)throw Error(result.error);mini=enabled;document.documentElement.classList.toggle('desktop-mode',enabled);document.body.classList.toggle('mini',enabled);$('mini-ui').hidden=!enabled;if(enabled)$('mini-pet-slot').append($('pet-host'));else document.querySelector('.companion-top').after($('pet-host'));window.scrollTo(0,0);pet.resize();}catch(e){notice(e.message,true);}}
  $('desktop').addEventListener('click',()=>desktop(true));
  $('pet').addEventListener('contextmenu',e=>{if(!mini)return;e.preventDefault();pet.release();native('contextMenu',{x:e.clientX,y:e.clientY}).catch(error=>notice(error.message,true));});
  $('pet').addEventListener('keydown',e=>{if(mini&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){e.preventDefault();const r=$('pet').getBoundingClientRect();native('contextMenu',{x:r.width/2,y:r.height/2}).catch(error=>notice(error.message,true));}});
  async function menuAction(command){
    if(command.startsWith('mood:')){const mood=command.slice(5);return !!M.moodById[mood]&&await saveMood(mood,'');}
    if(command==='stroke'){pet.stroke();return true;}
    if(command==='squish'){pet.squish();return true;}
    if(command==='calendar'){await desktop(false);return !mini;}
    if(command==='skin'){await desktop(false);if(mini)return false;$('import-skin').click();return true;}
    if(command==='resetSkin'){$('reset-skin').click();await queue;return !state.skin;}
    if(command==='export'){await desktop(false);if(mini)return false;$('export').click();return true;}
    if(command==='storage'){await native('storage');return true;}
    return false;
  }
  $('import-skin').addEventListener('click',()=>{$('skin-info').showModal();});
  async function applyImportedSkin(result){if(!result.ok)throw Error(result.error);await pet.setSkin(result.skin,result.source);const previous=state.skin,oldSource=skinSource;const ok=await transact(s=>({...s,skin:result.skin}),'新模样已保存。');if(ok)skinSource=result.source;else await pet.setSkin(previous,oldSource);return ok;}
  $('choose-skin').addEventListener('click',async()=>{if(pending)return;$('skin-info').close();try{const result=await native('importSkin');if(!result.cancelled)await applyImportedSkin(result);}catch(e){notice(e.message,true);}});
  $('reset-skin').addEventListener('click',async()=>{if(await transact(s=>({...s,skin:null}),'小糯团回来了。')){skinSource=null;await pet.setSkin(null);}});
  $('export').addEventListener('click',async()=>{try{await queue;const result=await native('export');if(result.ok)notice('记录已导出。');else if(!result.cancelled)throw Error(result.error);}catch(e){notice(e.message,true);}});
  $('storage').addEventListener('click',()=>native('storage').catch(e=>notice(e.message,true)));
  document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();$('today').click();});
  let day=M.dayKey(),lastMinute=Math.floor(Date.now()/60000);
  function rollover(){const now=new Date(),today=M.dayKey(now),changed=today!==day;if(changed){if(selectedDay===day){selectedDay=today;view=now;}day=today;render();}const minute=Math.floor(now.getTime()/60000);if(minute!==lastMinute){lastMinute=minute;if(selectedDay===today){renderCalendar();renderDay();}}if(!readOnly&&!pending&&state.events.some(e=>e.day<today&&!state.summaries[e.day]))return transact(s=>M.closeDays(s,now),'每日回顾已整理。');return Promise.resolve(true);}
  setInterval(rollover,10000);window.addEventListener('focus',rollover);document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollover();});
  if(boot.warning){$('warning').textContent=boot.warning;$('warning').hidden=false;}
  if(state.events.length)selectedMood=state.events.at(-1).mood;
  render();renderDisabled();
  const ready=(async()=>{if(state.skin){try{await pet.setSkin(state.skin,skinSource);}catch(e){$('warning').hidden=false;$('warning').textContent='皮肤文件无法读取，暂时显示小糯团。心情记录仍保留，可重新导入皮肤。';}}await rollover();return true;})();
  window.moodApp={ready,menuAction,snapshot:()=>structuredClone(state),saveMood,rollover,desktop,get pet(){return pet;},get pending(){return pending;},get mini(){return mini;},whenIdle:()=>queue};
  if(boot.testing)window.moodApp.applyImportedSkin=applyImportedSkin;
})();

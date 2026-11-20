(() => {
  'use strict';
  const M=MoodModel,$=id=>document.getElementById(id),boot=window.__moodBoot||{state:M.empty(),readOnly:true,warning:'请从心晴桌面应用打开，浏览器预览不会保存数据。'};
  let state,readOnly=!!boot.readOnly,selectedMood='calm',selectedDay=M.dayKey(),view=new Date(),mini=false,pending=0,queue=Promise.resolve();
  try{state=M.validate(boot.state);}catch(e){state=M.empty();readOnly=true;boot.warning=e.message;}
  let cursorDay=null,selectedMinute=0,selectedEventId=null,dayAxis=null;
  const callbacks=new Map();let requestId=0;
  window.nativeReply=(id,value)=>{const callback=callbacks.get(id);if(callback){callbacks.delete(id);clearTimeout(callback.timer);callback.resolve(value);}};
  function native(action,data={}){
    return new Promise((resolve,reject)=>{const id=++requestId;let timer=null;
      if(action==='save')timer=setTimeout(()=>notice('仍在等待本机保存结果，请稍候。'),8000);
      else if(!['export','contextMenu','notifyError'].includes(action))timer=setTimeout(()=>{callbacks.delete(id);reject(Error('本机操作未响应，请重试。'));},30000);
      callbacks.set(id,{resolve,timer});
      const bridge=window.webkit?.messageHandlers?.mood;
      if(bridge)bridge.postMessage({action,id,...data});else{clearTimeout(timer);callbacks.delete(id);reject(Error('请从桌面应用打开。'));}
    });
  }
  function notice(message,error=false){$('save-state').textContent=message;$('save-state').style.color=error?'#A05E46':'';if($('skin-info').open){const status=$('appearance-picker').open?'appearance-status':'skin-status';$(status).textContent=message;$(status).style.color=error?'#A05E46':'';}if(mini){$('pet-reaction').textContent=message;if(error)native('notifyError',{message}).catch(()=>{});}}
  function transact(change,success){
    if(readOnly){notice('存档处于保护模式，请先检查存档位置。',true);return Promise.resolve(false);}
    pending++;renderDisabled();
    const task=queue.then(async()=>{const next=M.validate(change(state));const result=await native('save',{data:next});if(!result.ok)throw Error(result.error||'保存失败，原记录已保留。');state=next;render();if(success)notice(success);return true;}).catch(e=>{notice(e.message,true);return false;}).finally(()=>{pending--;renderDisabled();});
    queue=task;return task;
  }
  function renderDisabled(){
    $('record').disabled=readOnly||pending>0;
    $('reset-skin').disabled=readOnly||pending>0;
    for(const button of $('appearance-options').children)button.disabled=readOnly||pending>0;
  }
  function renderMood(){
    for(const button of $('mood-options').children)button.setAttribute('aria-pressed',String(button.dataset.mood===selectedMood));
    renderSkin();
  }
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
  function render(){const now=new Date();$('date-label').textContent=now.toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).replaceAll('/','.');$('weekday-label').textContent=now.toLocaleDateString('zh-CN',{weekday:'long'});const last=state.events.at(-1);$('current-label').textContent=last&&last.day===M.dayKey(now)?'最近记录 · '+M.moodById[last.mood].name:'今天还没有记录';$('reset-skin').hidden=!sharedSkin();renderSkinRows();renderMood();renderCalendar();renderDay();}
  async function saveMood(mood,note){const at=new Date(),id=crypto.randomUUID();const ok=await transact(s=>M.closeDays(M.record(s,mood,note,at,id),at),'已保存在这台电脑 · '+at.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));if(ok){cursorDay=null;selectedMood=mood;selectedDay=M.dayKey(at);view=new Date(at.getFullYear(),at.getMonth(),1);if($('note').value===note)$('note').value='';render();}return ok;}
  $('record').addEventListener('click',()=>saveMood(selectedMood,$('note').value));
  $('squish').addEventListener('click',()=>pet.squish());$('stroke').addEventListener('click',()=>pet.stroke());
  for(const [id,delta]of [['prev-month',-1],['next-month',1]])$(id).addEventListener('click',()=>{const year=view.getFullYear();if(year+delta<1970||year+delta>9998)return;view=new Date(year,view.getMonth()+delta,1);renderCalendar();});
  $('today').addEventListener('click',()=>{view=new Date();selectedDay=M.dayKey();renderCalendar();renderDay();});
  async function desktop(enabled){try{pet.release();$('pet').blur();const result=await native('desktop',{enabled});if(!result.ok)throw Error(result.error);mini=enabled;document.documentElement.classList.toggle('desktop-mode',enabled);document.body.classList.toggle('mini',enabled);$('mini-ui').hidden=!enabled;if(enabled)$('mini-pet-slot').append($('pet-host'));else document.querySelector('.companion-top').after($('pet-host'));window.scrollTo(0,0);pet.resize();}catch(e){notice(e.message,true);}}
  $('desktop').addEventListener('click',()=>desktop(true));
  const closePrompt=$('close-prompt');let closeBusy=false;
  function requestClose(){
    if(mini)return false;
    if(closePrompt.open)return true;
    $('appearance-picker').close();$('skin-info').close();pet.release();
    try{pet.draw();$('close-pet').src=$('pet').toDataURL('image/png');}catch(e){$('close-pet').removeAttribute('src');}
    $('close-error').hidden=true;closePrompt.showModal();return true;
  }
  function closeFailure(message){$('close-error').textContent=message;$('close-error').hidden=false;}
  function setCloseBusy(value){closeBusy=value;for(const id of ['close-quit','close-desktop','close-cancel'])$(id).disabled=value;}
  $('close-cancel').addEventListener('click',()=>closePrompt.close());
  closePrompt.addEventListener('cancel',e=>{if(closeBusy)e.preventDefault();});
  closePrompt.addEventListener('close',()=>native('closePromptDismissed').catch(()=>{}));
  $('close-desktop').addEventListener('click',async()=>{
    if(closeBusy)return;setCloseBusy(true);
    try{await ready;await desktop(true);if(mini)closePrompt.close();else closeFailure('暂时无法放到桌面，请稍后再试。');}
    catch(e){closeFailure(e.message);}finally{setCloseBusy(false);}
  });
  $('close-quit').addEventListener('click',async()=>{
    if(closeBusy)return;setCloseBusy(true);
    try{await queue;const result=await native('confirmQuit');if(!result.ok)throw Error('暂时无法关闭，请稍后再试。');}
    catch(e){closeFailure(e.message);}finally{setCloseBusy(false);}
  });
  $('pet').addEventListener('contextmenu',e=>{if(!mini)return;e.preventDefault();pet.release();native('contextMenu',{x:e.clientX,y:e.clientY}).catch(error=>notice(error.message,true));});
  $('pet').addEventListener('keydown',e=>{if(mini&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){e.preventDefault();const r=$('pet').getBoundingClientRect();native('contextMenu',{x:r.width/2,y:r.height/2}).catch(error=>notice(error.message,true));}});
  async function menuAction(command){
    if(command.startsWith('mood:')){const mood=command.slice(5);return !!M.moodById[mood]&&await saveMood(mood,'');}
    if(command==='stroke'){pet.stroke();return true;}
    if(command==='squish'){pet.squish();return true;}
    if(command==='calendar'){await desktop(false);return !mini;}
    if(command==='skin'){await desktop(false);if(mini)return false;$('import-skin').click();return true;}
    if(command==='resetSkin'){$('reset-skin').click();await queue;return !sharedSkin();}
    if(command==='export'){await desktop(false);if(mini)return false;$('export').click();return true;}
    if(command==='storage'){await native('storage');return true;}
    return false;
  }
  const skinDialog=$('skin-info'),picker=$('appearance-picker'),skinRows=new Map();
  const characterNames={slime:'原生小糯团',orange:'不开心的橘子'};
  const defaultCharacter=mood=>mood==='sad'?'orange':'slime';
  const sharedSkin=()=>state.sharedAppearance==='default'?null:state.skin;
  let pickerMood=null,skinKey,skinRender=Promise.resolve(),skinRequest=0;

  function appearanceFor(mood){
    const choice=state.moodAppearances?.[mood];
    if(choice==='slime'||choice==='orange')return {character:choice};
    return {
      character:defaultCharacter(mood),
      override:choice?null:state.moodSkins?.[mood],
      shared:sharedSkin()
    };
  }

  function renderSkin(){
    const mood=selectedMood,{character,override,shared}=appearanceFor(mood);
    const defaultName=characterNames[character]+(character==='orange'?' · 3D 模型':'');
    const key=JSON.stringify([mood,character,override?.id,shared?.id]);
    if(key===skinKey)return;
    skinKey=key;
    const request=++skinRequest;
    const primary=override||shared;
    const label=$('skin-label');
    pet.setMood(mood,character);
    // Invalidate any image decode from the previous selection before requesting another atlas.
    if(!primary||pet.skin?.id!==primary.id)pet.setSkin(null);
    label.textContent=primary?'正在加载形象…':defaultName;
    skinRender=(async()=>{
      let failed=false;
      for(const [scope,skin] of [[mood,override],[null,shared]]){
        if(!skin)continue;
        try{
          if(pet.skin?.id!==skin.id){
            const result=await native('skinSource',{...(scope?{mood:scope}:{}),skinID:skin.id});
            if(request!==skinRequest)return;
            if(!result.ok)throw Error('无法读取形象文件。');
            await pet.setSkin(skin,result.source);
            if(request!==skinRequest)return;
          }
          label.textContent=skin.name+(skin.durations.length>1?' · 动态皮肤':' · 图片皮肤');
          if(failed)label.textContent+=' · 当前心情的形象无法读取';
          return;
        }catch(e){
          if(request!==skinRequest)return;
          failed=true;
        }
      }
      label.textContent=failed?defaultName+' · 自定义形象无法读取':defaultName;
    })();
  }

  function chooseAppearance(mood,choice){
    return transact(s=>{
      const next={...s};
      if(mood){
        const choices={...s.moodAppearances};
        if(choice==='image')delete choices[mood];
        else choices[mood]=choice;
        next.moodAppearances=choices;
      }else if(choice==='image')delete next.sharedAppearance;
      else next.sharedAppearance='default';
      return next;
    },'形象已保存。');
  }
  async function applyImportedSkin(result,scope=null){
    if(!result.ok)throw Error(result.error||'图片导入失败。');
    const ok=await transact(s=>scope?{...s,moodSkins:{...s.moodSkins,[scope]:result.skin}}:{...s,skin:result.skin});
    if(ok)await skinRender;
    return ok;
  }

  function currentChoice(mood){
    if(!mood)return sharedSkin()?'image':'default';
    const {character,override,shared}=appearanceFor(mood);
    return override?'image':shared?'default':character;
  }
  function openAppearancePicker(mood){
    pickerMood=mood;
    $('appearance-title').textContent=(mood?M.moodById[mood].name:'通用')+' · 选择形象';
    $('appearance-status').textContent='';
    const options=$('appearance-options');
    options.replaceChildren();
    const choices=mood?[
      ['slime',characterNames.slime,'3D 模型'],
      ...(mood==='sad'?[['orange',characterNames.orange,'3D 模型']]:[]),
      ...(sharedSkin()?[['default','跟随通用形象',sharedSkin().name]]:[])
    ]:[['default','按心情使用默认形象','']];
    const image=mood?state.moodSkins?.[mood]:state.skin;
    if(image)choices.push(['image',image.name||'已保存图片',image.durations.length>1?'已保存动图':'已保存图片']);
    for(const [choice,name,detail] of choices){
      const button=document.createElement('button'),text=document.createElement('span'),title=document.createElement('strong');
      const marker=document.createElement('span');
      button.type='button';
      button.dataset.choice=choice;
      title.textContent=name;
      text.append(title);
      if(detail){const subtitle=document.createElement('small');subtitle.textContent=detail;text.append(subtitle);}
      marker.className='choice-mark';
      marker.setAttribute('aria-hidden','true');
      marker.textContent='✓';
      button.append(text,marker);
      button.addEventListener('click',async()=>{
        if(choice===currentChoice(mood)||pending||readOnly)return;
        await chooseAppearance(mood,choice);
        if(picker.open&&pickerMood===mood)button.focus();
      });
      options.append(button);
    }
    renderPickerSelection();
    renderDisabled();
    picker.showModal();
    options.querySelector('[aria-pressed="true"]:enabled')?.focus();
  }
  function renderPickerSelection(){
    const selected=currentChoice(pickerMood);
    for(const button of $('appearance-options').children)button.setAttribute('aria-pressed',String(button.dataset.choice===selected));
  }
  function addSkinRow(mood){
    const scope=mood?.id||null,name=mood?.name||'通用形象';
    const row=document.createElement(mood?'li':'div'),detail=document.createElement('div');
    const title=document.createElement('strong'),status=document.createElement('small');
    const choose=document.createElement('button');
    row.className='skin-row';
    if(mood){
      row.dataset.mood=scope;
      row.style.setProperty('--mood',mood.color);
      const dot=document.createElement('span');
      dot.className='mood-dot';
      dot.setAttribute('aria-hidden','true');
      title.append(dot);
    }
    title.append(name);
    detail.append(title,status);
    choose.type='button';
    choose.textContent='选择形象';
    choose.setAttribute('aria-label',name+'：选择形象');
    choose.setAttribute('aria-haspopup','dialog');
    choose.addEventListener('click',()=>openAppearancePicker(scope));
    row.append(detail,choose);
    $(mood?'mood-skins':'shared-skin').append(row);
    skinRows.set(scope,status);
  }
  function renderSkinRows(){
    for(const [scope,status] of skinRows){
      const choice=currentChoice(scope);
      if(choice==='image')status.textContent=(scope?state.moodSkins[scope]:state.skin).name||'已保存图片';
      else if(choice==='default')status.textContent=scope?'跟随通用形象':'按心情使用默认形象';
      else status.textContent=characterNames[choice]+(choice==='orange'?' · 3D 模型':'');
      status.title=status.textContent;
    }
    if(picker.open)renderPickerSelection();
  }
  addSkinRow(null);
  M.moods.forEach(addSkinRow);
  $('import-skin').addEventListener('click',()=>{
    if(skinDialog.open)return;
    $('skin-status').textContent='';
    skinDialog.showModal();
  });
  $('reset-skin').addEventListener('click',()=>chooseAppearance(null,'default'));
  $('export').addEventListener('click',async()=>{try{await queue;const result=await native('export');if(result.ok)notice('记录已导出。');else if(!result.cancelled)throw Error(result.error);}catch(e){notice(e.message,true);}});
  $('storage').addEventListener('click',()=>native('storage').catch(e=>notice(e.message,true)));
  document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();$('today').click();});
  let day=M.dayKey(),lastMinute=Math.floor(Date.now()/60000);
  function rollover(){const now=new Date(),today=M.dayKey(now),changed=today!==day;if(changed){if(selectedDay===day){selectedDay=today;view=now;}day=today;render();}const minute=Math.floor(now.getTime()/60000);if(minute!==lastMinute){lastMinute=minute;if(selectedDay===today){renderCalendar();renderDay();}}if(!readOnly&&!pending&&state.events.some(e=>e.day<today&&!state.summaries[e.day]))return transact(s=>M.closeDays(s,now),'每日回顾已整理。');return Promise.resolve(true);}
  setInterval(rollover,10000);window.addEventListener('focus',rollover);document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollover();});
  if(boot.warning){$('warning').textContent=boot.warning;$('warning').hidden=false;}
  if(state.events.length)selectedMood=state.events.at(-1).mood;
  render();renderDisabled();
  const ready=(async()=>{await skinRender;await rollover();return true;})();
  window.moodApp={ready,menuAction,requestClose,snapshot:()=>structuredClone(state),saveMood,rollover,desktop,get pet(){return pet;},get pending(){return pending;},get mini(){return mini;},whenIdle:()=>queue};
  if(boot.testing)window.moodApp.applyImportedSkin=applyImportedSkin;
})();

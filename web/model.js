(function (root) {
  'use strict';
  const moods = [
    {id:'calm', name:'平静', color:'#9CBBA8', ink:'#466653'},
    {id:'happy', name:'开心', color:'#EFC46D', ink:'#876324'},
    {id:'sad', name:'难过', color:'#94AFCA', ink:'#486782'},
    {id:'anxious', name:'焦虑', color:'#B8A6CB', ink:'#735F89'},
    {id:'angry', name:'烦躁', color:'#DA9787', ink:'#935448'},
    {id:'tired', name:'疲惫', color:'#B7B1A4', ink:'#6D685C'},
    {id:'resigned', name:'无奈', color:'#C5B18C', ink:'#7B6846'},
    {id:'speechless', name:'无语', color:'#9CBABF', ink:'#4B7078'},
    {id:'overwhelmed', name:'要死了', color:'#AAA6B5', ink:'#615D6C'}
  ];
  const moodById = Object.fromEntries(moods.map(m=>[m.id,m]));
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function validDay(day) {
    if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const d=new Date(`${day}T12:00:00`);
    return Number.isFinite(d.getTime())&&dayKey(d)===day;
  }
  const empty = () => ({version:1,events:[],summaries:{},skin:null});
  function validate(value) {
    if(!value||value.version!==1||!Array.isArray(value.events)||value.events.length>50000||
       !value.summaries||Array.isArray(value.summaries)||typeof value.summaries!=='object') throw Error('存档格式不受支持，原文件已保留。');
    const seen=new Set();
    for(const e of value.events) {
      if(!e||typeof e.id!=='string'||e.id.length>100||seen.has(e.id)||!moodById[e.mood]||
         !Number.isSafeInteger(e.at)||e.at<0||!validDay(e.day)||typeof e.note!=='string'||e.note.length>280||
         !Number.isFinite(e.offset)||Math.abs(e.offset)>840) throw Error('心情记录无法读取，原文件已保留。');
      seen.add(e.id);
    }
    for(const [day,s] of Object.entries(value.summaries)) {
      if(!validDay(day)||!s||s.day!==day||!Number.isSafeInteger(s.generatedAt)||typeof s.text!=='string'||s.text.length>1000||
         !Array.isArray(s.counts)||s.counts.some(c=>!c||!moodById[c.mood]||!Number.isSafeInteger(c.count)||c.count<1)) throw Error('每日回顾无法读取，原文件已保留。');
    }
    if(value.skin!==null) {
      const s=value.skin;
      if(!s||typeof s.id!=='string'||!/^[A-Fa-f0-9-]{36}$/.test(s.id)||typeof s.name!=='string'||s.name.length>100||
         !Number.isSafeInteger(s.size)||s.size<1||s.size>512||!Number.isSafeInteger(s.columns)||s.columns<1||s.columns>8||
         !Array.isArray(s.durations)||s.durations.length<1||s.durations.length>60||s.durations.some(d=>!Number.isFinite(d)||d<.02||d>10)) throw Error('皮肤信息无法读取，原文件已保留。');
    }
    return JSON.parse(JSON.stringify(value));
  }
  function record(store,mood,note='',now=new Date(),id) {
    if(!moodById[mood]) throw Error('请选择有效的心情。');
    if(typeof note!=='string'||note.length>280) throw Error('留言最多 280 个字符。');
    if(!Number.isFinite(now.getTime())) throw Error('系统时间无效，暂时无法记录。');
    if(store.events.length>=50000) throw Error('已达到 50,000 条记录上限，请先导出备份。');
    const next=validate(store),day=dayKey(now);
    const event={id:id||globalThis.crypto.randomUUID(),mood,note:note.trim(),at:now.getTime(),day,offset:now.getTimezoneOffset()};
    if(next.events.some(e=>e.id===event.id)) throw Error('重复记录，请重试。');
    next.events.push(event);
    // A changed time zone or clock can reopen a day: never retain an obsolete recap.
    delete next.summaries[day];
    return next;
  }
  const entries = (store,day) => store.events.filter(e=>e.day===day).sort((a,b)=>a.at-b.at);
  function summarize(store,day,generatedAt=Date.now()) {
    const events=entries(store,day);
    if(!events.length) return null;
    const counts=moods.map(m=>({mood:m.id,count:events.filter(e=>e.mood===m.id).length})).filter(c=>c.count);
    const sequence=events.filter((e,i)=>!i||e.mood!==events[i-1].mood).map(e=>moodById[e.mood].name);
    const path=sequence.length<=6?sequence.join(' → '):`${sequence.slice(0,3).join(' → ')}……最后是${sequence.at(-1)}`;
    return {day,generatedAt,counts,text:`这一天，你留下了 ${events.length} 次心情：${path}。${events.some(e=>e.note)?'也留了几句话，可以点开慢慢看。':'每一次感受，都在这里。'}`};
  }
  function closeDays(store,now=new Date()) {
    const next=validate(store),today=dayKey(now);
    for(const day of new Set(next.events.map(e=>e.day))) {
      if(day<today&&!next.summaries[day]) next.summaries[day]=summarize(next,day,now.getTime());
    }
    return next;
  }
  function monthGrid(year,month) {
    const first=new Date(year,month,1,12),start=(first.getDay()+6)%7,count=new Date(year,month+1,0,12).getDate();
    return Array.from({length:Math.ceil((start+count)/7)*7},(_,i)=>i>=start&&i<start+count?dayKey(new Date(year,month,i-start+1,12)):null);
  }
  function wallTime(event) {
    // Preserve the displayed local time of the original entry when travelling.
    return new Date(event.at-event.offset*60000).toISOString().slice(11,16);
  }
  function wallMinute(event) {
    const d=new Date(event.at-event.offset*60000);
    return d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60+d.getUTCMilliseconds()/60000;
  }
  function clockLabel(minute,seconds=false) {
    const total=Math.max(0,Math.min(86400,Math.floor(minute*60+.00001)));
    const h=String(Math.floor(total/3600)).padStart(2,'0'),m=String(Math.floor(total%3600/60)).padStart(2,'0');
    return h+':'+m+(seconds?':'+String(total%60).padStart(2,'0'):'');
  }
  function durationLabel(minutes) {
    const seconds=Math.max(0,Math.round(minutes*60));
    if(seconds<60)return seconds+'\u79d2';
    const m=Math.floor(seconds/60),h=Math.floor(m/60);
    return (h?h+'\u5c0f\u65f6':'')+(m%60?m%60+'\u5206\u949f':h?'':'0\u5206\u949f');
  }
  function dayTimeline(store,day,now=new Date()) {
    if(!validDay(day)||!Number.isFinite(now.getTime()))throw Error('\u65e0\u6cd5\u5c55\u793a\u8fd9\u4e2a\u65e5\u671f\u3002');
    const today=dayKey(now),events=entries(store,day);
    const cutoff=day<today?1440:day>today?0:now.getHours()*60+now.getMinutes()+now.getSeconds()/60+now.getMilliseconds()/60000;
    const points=events.map(event=>({event,minute:wallMinute(event)}));
    const offsets=new Set(events.map(e=>e.offset));
    if(day===today&&events.length)offsets.add(now.getTimezoneOffset());
    const timeShift=offsets.size>1||points.some((p,i)=>i>0&&p.minute<points[i-1].minute);
    const segments=[];
    if(!timeShift)for(let i=0;i<points.length;i++){
      const point=points[i],start=point.minute,end=Math.min(cutoff,points[i+1]?.minute??cutoff);
      if(start<cutoff&&end>start)segments.push({start,end,mood:point.event.mood,event:point.event});
    }
    const totals=moods.map(m=>({mood:m.id,minutes:segments.filter(s=>s.mood===m.id).reduce((sum,s)=>sum+s.end-s.start,0)})).filter(x=>x.minutes>0);
    return {day,cutoff,points,segments,totals,timeShift,knownMinutes:totals.reduce((sum,t)=>sum+t.minutes,0)};
  }
  function momentAt(timeline,minute,eventId=null) {
    if(eventId){const point=timeline.points.find(p=>p.event.id===eventId);if(point)return {kind:'record',event:point.event,segment:timeline.segments.find(s=>s.event.id===eventId)||null};}
    if(timeline.timeShift)return {kind:'shift',event:null,segment:null};
    minute=Math.max(0,Math.min(1439,Math.floor(minute)));
    if(minute>Math.floor(timeline.cutoff))return {kind:'future',event:null,segment:null};
    const until=Math.min(minute+1,timeline.cutoff);
    const segment=timeline.segments.filter(s=>s.start<until&&s.end>minute).at(-1)||null;
    const point=timeline.points.filter(p=>Math.floor(p.minute)===minute&&p.minute<=timeline.cutoff).at(-1);
    return point?{kind:'record',event:point.event,segment:timeline.segments.find(s=>s.event.id===point.event.id)||null}:segment?{kind:'record',event:segment.event,segment}:{kind:'unknown',event:null,segment:null};
  }
  const api={moods,moodById,dayKey,empty,validate,record,entries,summarize,closeDays,monthGrid,wallTime,wallMinute,clockLabel,durationLabel,dayTimeline,momentAt};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;else root.MoodModel=api;
})(typeof window==='undefined'?globalThis:window);

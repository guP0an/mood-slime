const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const M=require('../web/model.js');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS:',name);}
const time=s=>new Date(s);
test('empty data never invents a mood or a daily recap',()=>{
  assert.deepEqual(M.closeDays(M.empty(),time('2026-11-04T12:00:00+08:00')),M.empty());
  assert.equal(M.summarize(M.empty(),'2026-11-03'),null);
});
test('records keep timestamps, local days, offsets and literal user text',()=>{
  const at=time('2026-11-04T11:03:00+08:00');
  const s=M.record(M.empty(),'sad',' <script>合成测试</script> ',at,'a');
  assert.equal(s.events[0].at,at.getTime());assert.equal(s.events[0].day,M.dayKey(at));
  assert.equal(s.events[0].note,'<script>合成测试</script>');
  assert.equal(M.wallTime(s.events[0]),at.toTimeString().slice(0,5));
  assert.equal(M.empty().events.length,0);
});
test('midnight closes each past recorded day exactly once',()=>{
  const first=new Date(2026,10,2,23,59),second=new Date(2026,10,3,0,0);
  let s=M.record(M.empty(),'calm','',first,'a');s=M.record(s,'happy','',second,'b');
  s=M.closeDays(s,new Date(2026,10,3,0,0));assert.deepEqual(Object.keys(s.summaries),['2026-11-02']);
  const again=M.closeDays(s,new Date(2026,10,3,23,59));assert.deepEqual(again,s);
  const wake=M.closeDays(s,new Date(2026,10,8));assert.equal(Object.keys(wake.summaries).length,2);assert(!wake.summaries['2026-11-04']);
});
test('adding an entry to a reopened day invalidates its old recap',()=>{
  let s=M.record(M.empty(),'calm','',new Date(2026,10,2,14),'a');s=M.closeDays(s,new Date(2026,10,3));
  s=M.record(s,'angry','',new Date(2026,10,2,15),'b');assert(!s.summaries['2026-11-02']);
  s=M.closeDays(s,new Date(2026,10,3));assert.equal(s.summaries['2026-11-02'].counts.reduce((n,c)=>n+c.count,0),2);
});
test('recaps count observations without pretending to know duration',()=>{
  let s=M.record(M.empty(),'happy','',new Date(2026,10,2,9),'a');s=M.record(s,'calm','',new Date(2026,10,2,22),'b');
  const result=M.summarize(s,'2026-11-02');assert.match(result.text,/2 次/);assert.match(result.text,/开心 → 平静/);assert(!result.text.includes('小时'));assert.equal(result.counts.length,2);
});
test('malformed data, duplicate IDs and unsupported skin manifests are rejected',()=>{
  const s=M.record(M.empty(),'calm','',new Date(),'x');
  for(const bad of [null,{...s,version:2},{...s,events:[s.events[0],s.events[0]]},{...s,events:[{...s.events[0],day:'2026-02-30'}]},{...s,events:[{...s.events[0],mood:'oops'}]},{...s,skin:{id:'../../other'}}])assert.throws(()=>M.validate(bad));
  assert.throws(()=>M.record(s,'calm','a'.repeat(281),new Date(),'new'));assert.throws(()=>M.record(s,'fake','',new Date(),'new'));assert.throws(()=>M.record(s,'happy','',new Date(),'x'));
});
test('month grids cover leap years, Monday starts, Sunday starts and year rollover',()=>{
  for(let y=2023;y<=2028;y++)for(let m=0;m<12;m++){
    const grid=M.monthGrid(y,m),days=grid.filter(Boolean);assert.equal(days.length,new Date(y,m+1,0).getDate());assert.equal(grid.length%7,0);assert.equal(new Set(days).size,days.length);assert.equal(grid.findIndex(Boolean),(new Date(y,m,1).getDay()+6)%7);
  }
  assert.equal(M.monthGrid(2024,1).filter(Boolean).length,29);
});
test('travel preserves the originally recorded wall-clock time',()=>{
  const e={at:Date.parse('2026-11-03T02:12:00Z'),offset:-480};assert.equal(M.wallTime(e),'10:12');
  e.offset=300;assert.equal(M.wallTime(e),'21:12');
});
test('daylight-saving and midnight behavior in multiple real time zones',()=>{
  const modulePath=path.resolve(__dirname,'../web/model.js');
  const script=`const a=require('node:assert/strict'),m=require(process.argv[1]);for(const [y,mo,d] of [[2026,2,8],[2026,10,1],[2026,11,31]]){let s=m.record(m.empty(),'calm','',new Date(y,mo,d,23,59),'x');const next=new Date(y,mo,d+1,0,0);s=m.closeDays(s,next);a.equal(Object.keys(s.summaries).length,1);a.equal(m.wallTime(s.events[0]),'23:59');}`;
  for(const tz of ['Asia/Singapore','America/New_York','Europe/Berlin','Pacific/Auckland']){
    const result=spawnSync(process.execPath,['-e',script,modulePath],{encoding:'utf8',env:{PATH:process.env.PATH,TZ:tz}});assert.equal(result.status,0,`${tz}: ${result.stderr}`);
  }
});

test('time spans use minutes rather than change counts, leaving the first gap empty',()=>{
  let s=M.empty();const d=new Date(2026,10,3,12);
  s=M.record(s,'happy','morning',new Date(2026,10,3,9),'a');
  s=M.record(s,'sad','later',new Date(2026,10,3,11,30),'b');
  const axis=M.dayTimeline(s,'2026-11-03',d);
  assert.deepEqual(axis.totals,[{mood:'happy',minutes:150},{mood:'sad',minutes:30}]);
  assert.equal(axis.knownMinutes,180);assert.equal(axis.cutoff,720);
  assert.equal(M.momentAt(axis,8*60).kind,'unknown');assert.equal(M.momentAt(axis,10*60).event.mood,'happy');
  assert.equal(M.momentAt(axis,11*60+30).event.mood,'sad');assert.equal(M.momentAt(axis,13*60).kind,'future');
});
test('past days end at midnight and future days never acquire duration',()=>{
  let s=M.record(M.empty(),'calm','',new Date(2026,10,2,23,45),'a');
  assert.equal(M.dayTimeline(s,'2026-11-02',new Date(2026,10,3)).knownMinutes,15);
  assert.equal(M.dayTimeline(s,'2026-11-04',new Date(2026,10,3)).knownMinutes,0);
});
test('same-minute changes keep seconds, zero-length ties prefer the newest insertion',()=>{
  let s=M.empty();
  s=M.record(s,'sad','first',new Date(2026,10,3,10,2,10),'z-first');
  s=M.record(s,'happy','second',new Date(2026,10,3,10,2,30),'a-second');
  s=M.record(s,'calm','same instant, latest',new Date(2026,10,3,10,2,30),'b-third');
  const a=M.dayTimeline(s,'2026-11-03',new Date(2026,10,3,10,3));
  assert.equal(a.points.length,3);assert.equal(a.segments.length,2);
  assert(Math.abs(a.segments[0].end-a.segments[0].start-20/60)<1e-9);
  assert.equal(a.segments[1].mood,'calm');assert.equal(M.momentAt(a,602).event.id,'b-third');
  assert.equal(M.momentAt(a,602,'a-second').event.note,'second');
  assert.equal(M.clockLabel(a.points[0].minute,true),'10:02:10');
});
test('time zone changes avoid misleading overlapping durations',()=>{
  const s=M.empty();s.events=[
    {id:'a',mood:'calm',note:'',at:Date.parse('2026-11-01T05:30:00Z'),day:'2026-11-01',offset:240},
    {id:'b',mood:'happy',note:'',at:Date.parse('2026-11-01T06:15:00Z'),day:'2026-11-01',offset:300}
  ];
  const a=M.dayTimeline(s,'2026-11-01',new Date(2026,10,5));
  assert(a.timeShift);assert.equal(a.segments.length,0);assert.equal(a.points.length,2);assert.equal(M.momentAt(a,90).kind,'shift');
});
test('duration and clock labels preserve minute and subminute precision',()=>{
  assert.equal(M.clockLabel(1440),'24:00');assert.equal(M.clockLabel(602.5,true),'10:02:30');
  assert.equal(M.durationLabel(125),'2\u5c0f\u65f65\u5206\u949f');assert.equal(M.durationLabel(.5),'30\u79d2');
});
test('resigned and speechless round-trip with all ten moods, recaps and time spans',()=>{
  assert.equal(M.moods.length,10);assert.equal(M.moodById.resigned.name,'无奈');assert.equal(M.moodById.speechless.name,'无语');
  let s=M.empty();
  M.moods.forEach((m,i)=>{s=M.record(s,m.id,'synthetic '+m.id,new Date(2026,10,3,8+i),'mood-'+i);});
  s=M.closeDays(s,new Date(2026,10,4));
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(s))),s);
  assert.equal(s.summaries['2026-11-03'].counts.length,10);
  const axis=M.dayTimeline(s,'2026-11-03',new Date(2026,10,4));
  assert.equal(axis.totals.length,10);assert.equal(M.momentAt(axis,14*60+30).event.mood,'resigned');
  assert.equal(M.momentAt(axis,15*60+30).event.mood,'speechless');
  assert.equal(M.moodById.overwhelmed.name,'要死了');assert.equal(M.momentAt(axis,16*60+30).event.mood,'overwhelmed');
  assert.equal(M.moodById.sleepy.name,'好困');assert.equal(M.momentAt(axis,17*60+30).event.mood,'sleepy');
});
console.log(`${checks} model checks passed`);

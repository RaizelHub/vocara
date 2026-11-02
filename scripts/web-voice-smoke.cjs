// Test the exported app against synthetic backend responses; never contacts Groq/Supabase.
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.VOCARA_PLAYWRIGHT_MODULE || 'playwright');
async function main() {
 const recovery=process.env.VOCARA_TEST_RECOVERY==='1';
 const layout=process.env.VOCARA_TEST_LAYOUT==='1';
 const root=path.resolve(process.env.VOCARA_WEB_EXPORT || 'dist/stage-c-web');
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
  if(!path.extname(file))file+='.html';
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  const origin=`http://127.0.0.1:${server.address().port}`, backend='https://vocara-stage-a.invalid';
  const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',qid='33333333-3333-4333-8333-333333333333',aid='44444444-4444-4444-8444-444444444444';
  const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{full_name:'Fixture'},app_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const jwt=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url'),'c3ludGhldGlj'].join('.');
  const auth={access_token:jwt,refresh_token:'synthetic',expires_at:4102444800,expires_in:3600,token_type:'bearer',user};
  const session={id:sid,role:'Support Specialist',interview_type:'standard',difficulty:'intermediate',interviewer_style:'balanced',total_questions:1,status:'in_progress',evaluation_version:'fixture',evaluation_model:'fixture'};
  const scores={relevance:72,structure:72,clarity:72,grammar:72,vocabulary:72,confidence:72};
  let answer=null,uploads=0,transcriptions=0,evaluations=0,finalizations=0;
  browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const context=await browser.newContext({permissions:['microphone']});
  await context.addInitScript(auth=>sessionStorage.setItem('sb-vocara-stage-a-auth-token',JSON.stringify(auth)),auth);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin)return route.continue();
   if(url.origin!==backend)return route.abort();
   let body=null;
   const p=url.pathname;
   if(request.method()==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
   if(p==='/auth/v1/user')body=user;
   else if(p==='/auth/v1/token')body=auth;
   else if(p==='/rest/v1/profiles')body={id:uid,full_name:'Fixture',target_role:'Support Specialist',onboarding_completed:true};
   else if(p.endsWith('/get_user_practice_metrics'))body={readinessScore:72,previousReadinessScore:68,sessionsCompleted:1,practiceSeconds:300,skills:scores,practiceCompletedAt:[],recentSessions:[{id:sid,role:'Senior customer support and operations specialist',interviewType:'standard',score:72,durationSeconds:300,completedAt:'2026-11-01T10:00:00Z'}]};
   else if(p.endsWith('/get_interview_result'))body={
    session:{id:sid,role:'Senior customer support and operations specialist',interviewType:'standard',difficulty:'intermediate',interviewerStyle:'balanced',score:72,durationSeconds:300,completedAt:'2026-11-01T10:00:00Z'},
    feedback:{performanceLabel:'Developing',summary:'You explained the situation clearly. '+ 'Keep the result specific and explain your contribution. '.repeat(8),scores,strengths:[],focusAreas:[],recommendedPractice:null,strongestAnswerId:aid,focusAnswerId:null,evaluationVersion:'fixture'},
    answers:[{id:aid,questionNumber:1,question:'Describe a time you resolved a complex customer problem while coordinating with several teams.',questionType:'behavioral',transcript:'I listened carefully and coordinated the follow-up. '.repeat(12),durationSeconds:90,wordCount:100,speakingPace:120,score:72,scores,summary:'Clear explanation',strengths:[],improvements:[],betterApproach:'Explain the outcome.',improvedAnswer:'I clarified the issue and confirmed the resolution.',fillerWords:[],feedbackStatus:'completed'}],previousScore:68,readinessBefore:68,readinessAfter:72,previousConfidence:68,previousStructure:68};
   else if(p.endsWith('/get_interview_recovery'))body={session,questions:[{question:{id:qid,session_id:sid,question_number:1,question_text:'Describe a synthetic work example',question_type:'behavioral'},answer,feedback:null}],finalization:null};
   else if(p==='/rest/v1/interview_answers'){
    if(request.method()==='POST')answer={id:aid,user_id:uid,session_id:sid,question_id:qid,transcription_status:'pending',audio_path:null,audio_generation:0,transcription_retryable:true};
    body=answer;
   } else if(p.includes('/storage/v1/object/interview-audio/')){
    uploads++;const bytes=request.postDataBuffer();assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);assert.ok(p.endsWith('.wav'));body={};
   } else if(p.endsWith('/attach_answer_audio')){
    const input=request.postDataJSON();answer={...answer,audio_path:input.p_audio_path,audio_generation:1,duration_seconds:input.p_duration_seconds};body=answer;
   } else if(p.endsWith('/transcribe-answer')){
    transcriptions++;
    if(recovery && transcriptions===1){
     answer={...answer,transcription_status:'failed'};
     return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify({code:'service_unavailable',message:'Synthetic temporary failure',retryable:true})});
    }
    answer={...answer,transcript:'A synthetic answer about helping a customer.',transcription_status:'completed'};
    body={answerId:aid,transcript:answer.transcript,durationSeconds:2,wordCount:8,speakingPace:120};
   } else if(p.endsWith('/evaluate-answer')){
    evaluations++;body={answerId:aid,overallScore:72,scores,summary:'Synthetic feedback',strengths:[],improvements:[],betterApproach:'Explain the result.',improvedAnswer:'A clear synthetic example.',fillerWords:[],feedbackStatus:'completed'};
   } else if(p.endsWith('/finalize-interview')){
    finalizations++;session.status='completed';body={sessionId:sid,feedback:{overallScore:72,performanceLabel:'Developing',summary:'Synthetic summary',scores,strengths:[],focusAreas:[],recommendedPractice:{type:'standard',reason:'Practice'},strongestAnswerId:aid,focusAnswerId:aid}};
   }
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*'},body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(layout){
   const noOverflow=async(label)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow');
   for(const width of [320,390,768,1024,1366,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(`${origin}/home`);
    const history=page.getByRole('button',{name:/Senior customer support and operations specialist, score/});
    await history.waitFor();await noOverflow('History '+width);
    await history.focus();await page.keyboard.press('Enter');
    const review=page.getByRole('button',{name:'Open full review',exact:true});
    await review.waitFor();await noOverflow('History detail '+width);
    await review.focus();await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:'You handled that well.'}).waitFor();
    const comparison=await page.getByText('+4 from your last interview',{exact:true}).boundingBox();
    assert.ok(comparison && comparison.x>=0 && comparison.x+comparison.width<=width,'Score comparison clipped at '+width);
    const question=page.getByRole('button',{name:/Question 1\./});
    await question.focus();
    assert.equal(await question.evaluate(element=>getComputedStyle(element).outlineStyle),'solid');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    assert.equal(await question.getAttribute('aria-expanded'),'true');
    await noOverflow('Expanded result '+width);
    const box=await question.boundingBox();assert.ok(box.width<=900,'Result reading width is bounded');
    await page.getByLabel('Share interview result',{exact:true}).first().click();
    await page.getByText('Share preview',{exact:true}).waitFor();await noOverflow('Share modal '+width);
    await page.keyboard.press('Escape');
    await page.getByText('Share preview',{exact:true}).waitFor({state:'hidden'});
    if(width===320 || width===1440)await page.screenshot({path:`dist/stage-d-result-${width}.png`});
    await page.goto(`${origin}/progress`);
    await page.getByRole('heading',{name:'Your Progress'}).waitFor();await noOverflow('Progress '+width);
    console.log('PASS history keyboard navigation, result accordion/focus, modal Escape, progress and overflow at '+width);
   }
   assert.deepEqual(errors,[]);return;
  }
  await page.goto(`${origin}/interview/session?id=${sid}`);
  await page.getByLabel('Start answering',{exact:true}).click().catch(async error=>{console.error('Fixture page:',await page.locator('body').innerText(),errors);throw error;});
  await page.getByLabel('Finish answer',{exact:true}).waitFor();
  await page.waitForTimeout(1800);
  await page.getByLabel('Finish answer',{exact:true}).click();
  await page.getByText('Answer recorded',{exact:true}).first().waitFor();
  await page.getByLabel('Play recording',{exact:true}).click();
  await page.getByLabel('Use this answer',{exact:true}).click();
  if(recovery){
   await page.getByLabel('Retry transcription',{exact:true}).waitFor();
   await page.reload();
   await page.getByLabel('Retry transcription',{exact:true}).waitFor();
   assert.equal(uploads,1);assert.equal(transcriptions,1);assert.equal(evaluations,0);
   await page.getByLabel('Retry transcription',{exact:true}).click();
  }
  await page.getByLabel('Finish interview',{exact:true}).waitFor();
  assert.equal(uploads,1);assert.equal(transcriptions,recovery?2:1);assert.equal(evaluations,1);
  await page.getByLabel('Finish interview',{exact:true}).click();
  await page.waitForURL('**/interview/results?*');
  assert.equal(finalizations,1);assert.deepEqual(errors,[]);
  console.log('PASS exported interview UI: capture, WAV upload, mocked transcription/evaluation and completion navigation; one request per operation.');
  if(recovery)console.log('PASS refresh restores saved audio after transcription failure; explicit retry, no repeat upload or automatic AI request.');
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

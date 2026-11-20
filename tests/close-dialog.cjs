const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:1040,height:810}});
    await page.route('**/*', route => /^(file:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
    await page.addInitScript(() => {
      window.closeTest = {actions:[],failDesktop:false};
      window.webkit = {messageHandlers:{mood:{postMessage(message) {
        window.closeTest.actions.push(message.action);
        queueMicrotask(() => window.nativeReply(message.id,
          message.action === 'desktop' && window.closeTest.failDesktop ? {ok:false,error:'测试：桌面切换失败'} : {ok:true}));
      }}}};
    });
    await page.goto(pathToFileURL(path.join(__dirname,'../web/index.html')).href);
    await page.evaluate(() => window.moodApp.ready);
    const dialog = page.locator('#close-prompt');
    await page.evaluate(() => window.moodApp.requestClose());
    await page.locator('#close-pet').evaluate(img => img.decode());
    assert.equal(await page.evaluate(() => document.activeElement.id),'close-desktop');
    assert(await page.locator('#close-pet').evaluate(img => {
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      return ctx.getImageData(0,0,canvas.width,canvas.height).data.some((value,i) => i%4===3 && value>0);
    }), 'pet image must contain rendered pixels');
    await dialog.screenshot({path:path.join(__dirname,'../outputs/close-dialog/preview.png')});
    await page.keyboard.press('Escape');
    assert.equal(await dialog.evaluate(el => el.open),false);
    assert.equal(await page.evaluate(() => window.moodApp.mini),false);
    await page.evaluate(() => window.moodApp.requestClose());
    await page.locator('#close-cancel').click();
    assert.equal(await dialog.evaluate(el => el.open),false);
    await page.evaluate(() => {window.moodApp.requestClose();window.closeTest.failDesktop=true;});
    await page.locator('#close-desktop').click();
    await page.locator('#close-error').waitFor({state:'visible'});
    assert.equal(await dialog.evaluate(el => el.open),true,'failed switch keeps the dialog available');
    assert.equal(await page.locator('#close-desktop').isEnabled(),true);
    await page.evaluate(() => {window.closeTest.failDesktop=false;});
    await page.locator('#close-desktop').click();
    await page.waitForFunction(() => window.moodApp.mini && !document.getElementById('close-prompt').open);
    await page.evaluate(() => window.moodApp.desktop(false));
    await page.setViewportSize({width:390,height:720});
    await page.evaluate(() => window.moodApp.requestClose());
    const bounds=await dialog.boundingBox();
    assert(bounds.x>=0 && bounds.x+bounds.width<=390 && bounds.y>=0 && bounds.y+bounds.height<=720);
    assert(await dialog.evaluate(el => el.scrollWidth<=el.clientWidth),'dialog text must not overflow');
    await dialog.screenshot({path:path.join(__dirname,'../outputs/close-dialog/preview-narrow.png')});
    await page.locator('#close-quit').click();
    await page.waitForFunction(() => window.closeTest.actions.includes('confirmQuit'));
    console.log('PASS: close dialog rendering, keyboard cancel, cancel button, switch failure/retry, desktop transition, narrow layout, quit bridge');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

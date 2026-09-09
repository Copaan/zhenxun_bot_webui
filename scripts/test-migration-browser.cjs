const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const babel = require('@babel/core')
const compiler = require('vue-template-compiler')

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
  const root = path.resolve(__dirname, '..')
  const sfc = compiler.parseComponent(await fs.readFile(path.join(root, 'src/views/about/MigrationPanel.vue'), 'utf8'))
  const code = babel.transformSync(sfc.script.content, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code
  const style = sfc.styles.map(item => item.content.replace(/::v-deep /g, '')).join('\n')
  const utility = babel.transformSync(await fs.readFile(path.join(root, 'src/utils/migration.js'), 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code
  const markup = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/element.css"><style>body{margin:0;background:#f4f6f8;font-family:'Microsoft YaHei',sans-serif}#app{max-width:1180px;margin:auto;padding:24px;background:white;box-sizing:border-box}@media(max-width:600px){#app{padding:16px}}${style}</style><div id="app"></div><script src="/vue.js"></script><script src="/element.js"></script><script src="/sha256.js"></script><script>
  const serviceModule = {exports:{}};
  (function(module,exports,require){${utility}})(serviceModule,serviceModule.exports,name=>name==='js-sha256'?{sha256:window.sha256}:{});
  const request = async (path,options={}) => { const response=await fetch('/migration'+path,{method:options.method||'get',body:options.data?JSON.stringify(options.data):undefined});const data=await response.json();if(!response.ok)throw {response:{status:response.status,data}};return data; };
  const componentModule={exports:{}};
  (function(module,exports,require){${code}})(componentModule,componentModule.exports,name=>name==='@/utils/migration'?{...serviceModule.exports,migrationRequest:request}:{setDirtyState(){},clearDirtyState(){}});
  const component=componentModule.exports.default;component.template=${JSON.stringify(sfc.template.content)};new Vue({el:'#app',components:{MigrationPanel:component},template:'<main id="app"><MigrationPanel /></main>'});
  </script></html>`
  const sourceFiles = {
    '/vue.js': 'node_modules/vue/dist/vue.js',
    '/element.js': 'node_modules/element-ui/lib/index.js',
    '/element.css': 'node_modules/element-ui/lib/theme-chalk/index.css',
    '/fonts/element-icons.woff': 'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff',
    '/sha256.js': 'node_modules/js-sha256/src/sha256.js',
  }
  let failInspect = true, calls = 0, maintenance = false
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      const json = (value, status=200) => { response.writeHead(status, {'Content-Type':'application/json'}); response.end(JSON.stringify(value)) }
      if (url.pathname === '/migration/capabilities') return json({restore:false,upload:!maintenance,discovery:!maintenance,maintenance})
      if (url.pathname === '/migration/discover') return json({items:[{path:'migration/inbox/old.zx',size:12345}]})
      if (url.pathname === '/migration/tasks') return json(maintenance ? {items:[{id:'c'.repeat(32),action:'export',stage:'snapshotting'}],total:1} : {items:[],total:0})
      if (url.pathname === '/migration/inspect') {
        calls++
        if (failInspect) { failInspect=false; return json({detail:'migration_archive_changed'},409) }
        return json({package_id:'a'.repeat(32),sha256:'b'.repeat(64),source:{python:'3.10.16',system:'Windows'},total:1,items:[{path:'data/example.txt',category:'data',size:123}],replacement_blockers:[]})
      }
      if (sourceFiles[url.pathname]) { response.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.woff')?'font/woff':'text/javascript');response.end(await fs.readFile(path.join(root,sourceFiles[url.pathname])));return }
      response.setHeader('Content-Type','text/html; charset=utf-8');response.end(markup)
    } catch (error) { response.statusCode=500;response.end('fixture_failure') }
  })
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  let browser
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || undefined})
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      failInspect=true
      maintenance=false
      const page=await browser.newPage({viewport})
      const errors=[];page.on('pageerror',error=>errors.push(error.message))
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await page.getByRole('button',{name:'导出实例（尚未开放）'}).waitFor()
      assert.equal(await page.getByRole('button',{name:'导出实例（尚未开放）'}).isDisabled(),true)
      await page.getByPlaceholder('选择本机已发现的迁移包').click()
      await page.getByText('migration/inbox/old.zx (12.1 KiB)',{exact:true}).click()
      await page.locator('input[type=password]').fill('draft-secret')
      await page.getByRole('button',{name:/核验迁移包/}).click()
      await page.getByText('migration_archive_changed',{exact:true}).waitFor()
      assert.equal(await page.locator('input[type=password]').inputValue(),'draft-secret')
      await page.getByRole('button',{name:/核验迁移包/}).click()
      await page.getByRole('heading',{name:'迁移包核验结果'}).waitFor()
      maintenance=true
      await page.getByRole('button',{name:'刷新状态'}).click()
      await page.getByText('实例维护中，迁移尚未完成。',{exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:'选择迁移包'}).isDisabled(),true)
      assert.equal(await page.getByRole('button',{name:/核验迁移包/}).isDisabled(),true)
      assert.equal(await page.locator('input[type=password]').inputValue(),'draft-secret')
      await page.getByText('c'.repeat(32),{exact:true}).waitFor()
      const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)
      if (process.env.MIGRATION_SCREENSHOTS) {
        await fs.mkdir(process.env.MIGRATION_SCREENSHOTS,{recursive:true})
        await page.screenshot({path:path.join(process.env.MIGRATION_SCREENSHOTS,`migration-${viewport.width}.png`),fullPage:true})
      }
      if (!fits) console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right})).slice(0,20)))
      assert.equal(fits,true,`horizontal overflow at ${viewport.width}`)
      assert.deepEqual(errors,[])
      await page.close()
    }
    assert.equal(calls,4)
    console.log('Migration component: desktop/mobile, 409 and maintenance preserve drafts, live task state, gated restore and no overflow passed')
  } finally {
    await browser?.close()
    await new Promise(resolve=>server.close(resolve))
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})

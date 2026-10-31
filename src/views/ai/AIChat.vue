<template>
  <main class="zx-page ai-chat-page" v-loading="loading">
    <header class="zx-page-header">
      <div><h1>AI 聊天</h1><p>配置内置 AI 聊天的人设、按群规则与 Agent 权限，在控制台试聊，查看运行记录、会话与调用统计。</p></div>
      <div class="zx-page-actions">
        <el-tag v-if="personaDirty" type="warning" size="small">人设未保存</el-tag>
        <el-button size="small" icon="el-icon-setting" @click="configModule = 'ai_chat'">聊天设置</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="reload">重新加载</el-button>
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />

    <el-tabs v-model="tab" class="chat-tabs">
      <el-tab-pane label="快速开始" name="start">
        <section class="zx-panel">
          <div class="zx-section-heading"><div><h2>配置清单</h2><p>按顺序完成以下步骤即可让真寻在群里聊天。</p></div></div>
          <ol class="start-steps">
            <li v-for="(step, index) in steps" :key="step.key" :class="{ done: step.done }">
              <span class="step-mark"><i v-if="step.done" class="el-icon-check"></i><template v-else>{{ index + 1 }}</template></span>
              <div class="step-body"><strong>{{ step.title }}</strong><p>{{ step.description }}</p></div>
              <el-button size="small" :type="step.done ? 'default' : 'primary'" :loading="busy === step.key" @click="step.run">{{ step.label }}</el-button>
            </li>
          </ol>
        </section>
      </el-tab-pane>

      <el-tab-pane label="人设" name="persona">
        <div class="persona-layout">
          <aside class="zx-panel persona-list">
            <el-button type="primary" size="small" icon="el-icon-plus" class="full" @click="selectPersona(null)">新建人设</el-button>
            <button v-for="item in personas" :key="item.id" type="button" class="persona-item" :class="{ active: draft.id === item.id }" @click="selectPersona(item)">
              <span>{{ item.name }}</span>
              <span class="persona-tags"><el-tag v-if="item.is_default" size="mini" type="success">默认</el-tag><el-tag v-if="!item.enabled" size="mini" type="info">停用</el-tag><el-tag v-if="item.group_ids.length" size="mini">{{ item.group_ids.length }} 个群</el-tag><el-tag v-if="item.user_ids.length" size="mini">{{ item.user_ids.length }} 个私聊用户</el-tag></span>
            </button>
            <p v-if="!personas.length" class="muted">还没有人设，未设置时使用内置默认人设。</p>
          </aside>
          <section class="zx-panel persona-editor">
            <div class="zx-section-heading"><div><h2>{{ draft.id ? `编辑「${original.name}」` : "新建人设" }}</h2><p>保存后从下一条消息开始生效。</p></div></div>
            <el-form label-position="top">
              <div class="form-row">
                <el-form-item label="人设名称"><el-input v-model="draft.name" maxlength="64" /></el-form-item>
                <el-form-item label="启用"><el-switch v-model="draft.enabled" /></el-form-item>
              </div>
              <el-form-item label="身份与背景设定"><el-input v-model="draft.prompt" type="textarea" :rows="8" maxlength="20000" show-word-limit placeholder="描述角色身份、背景、性格、知识边界和相处方式" /></el-form-item>
              <el-form-item label="表达风格"><el-input v-model="draft.style" type="textarea" :rows="2" maxlength="2000" placeholder="例如：简短、自然、避免客服口吻" /></el-form-item>
              <el-form-item label="语气样例"><el-input v-model="draft.toneText" type="textarea" :rows="3" placeholder="每行一条，最多 12 条" /></el-form-item>
              <el-form-item label="示例对话"><el-input v-model="draft.dialogueText" type="textarea" :rows="5" placeholder="每段一组示例对话，段落之间留一个空行，最多 12 段" /></el-form-item>
              <div class="form-row">
                <el-form-item label="模型"><el-select v-model="draft.model" clearable filterable allow-create placeholder="使用默认对话模型" class="full"><el-option v-for="name in chatModels" :key="name" :label="name" :value="name" /></el-select></el-form-item>
              </div>
              <el-form-item label="可用工具"><el-checkbox v-model="draft.limitTools">只提供选中的工具</el-checkbox><el-select v-if="draft.limitTools" v-model="draft.tools" multiple placeholder="不提供工具" class="full"><el-option v-for="item in tools" :key="item.name" :label="item.label" :value="item.name" /></el-select><small v-else class="muted tools-hint">提供全部工具；联网搜索、角色识别、Agent 等仍受各自的全局开关控制。</small></el-form-item>
              <el-form-item label="技能"><el-checkbox v-model="draft.limitSkills">只使用选中的技能</el-checkbox><el-select v-if="draft.limitSkills" v-model="draft.skills" multiple placeholder="不使用技能" class="full"><el-option v-for="item in skillList" :key="item.name" :label="item.name" :value="item.name"><span>{{ item.name }}</span><small class="muted"> {{ item.description }}</small></el-option></el-select><small v-else class="muted tools-hint">使用全部已启用的技能（在“技能”页管理）。</small></el-form-item>
              <el-form-item label="子代理"><el-select v-model="draft.subagents" multiple :multiple-limit="10" placeholder="不使用子代理" class="full"><el-option v-for="item in personas.filter((p) => p.id !== draft.id)" :key="item.id" :label="item.name" :value="item.id" /></el-select><small class="muted tools-hint">选中的人设作为子代理（用它自己的模型与工具），AI 可以把任务交给它并取回结果；子代理不能再转交。</small></el-form-item>
              <el-form-item label="绑定群（不绑定时作为默认人设的候选）"><el-select v-model="draft.group_ids" multiple filterable allow-create default-first-option placeholder="输入或选择群号" class="full"><el-option v-for="group in groups" :key="group.group_id" :label="`${group.group_name || group.group_id}（${group.group_id}）`" :value="group.group_id" /></el-select></el-form-item>
              <el-form-item label="绑定私聊用户（私聊时优先于默认人设）"><el-select v-model="draft.user_ids" multiple filterable allow-create default-first-option placeholder="输入用户 ID 后回车" class="full" /></el-form-item>
              <el-form-item label="出错提示（对话出错时发送，留空使用默认提示）"><el-input v-model="draft.error_message" maxlength="500" placeholder="留空使用默认提示" /></el-form-item>
            </el-form>
            <div class="editor-actions">
              <el-button v-if="draft.id" type="danger" plain size="small" @click="deletePersona">删除</el-button>
              <el-button v-if="draft.id && !original.is_default" size="small" @click="setDefault">设为默认</el-button>
              <el-button v-if="draft.id" size="small" icon="el-icon-chat-dot-round" @click="openConsole(draft.id)">在控制台试聊</el-button>
              <span class="spacer"></span>
              <el-button size="small" :disabled="!personaDirty" @click="selectPersona(draft.id ? original : null, true)">撤销修改</el-button>
              <el-button type="primary" size="small" :loading="busy === 'persona'" :disabled="!personaDirty || !draft.name.trim() || !draft.prompt.trim()" @click="savePersona">保存</el-button>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="按群设置" name="groups">
        <section class="zx-panel">
          <div class="zx-section-heading"><div><h2>按群覆盖</h2><p>为单个群指定人设、模型、插话概率等，留空的项使用全局设置；关闭开关后该群不触发 AI 聊天。</p></div><el-input v-model="groupSearch" size="small" clearable placeholder="搜索群号或群名" class="search" /></div>
          <el-table :data="filteredGroups" size="small" empty-text="暂无群">
            <el-table-column label="开启" width="70"><template #default="{ row }"><el-switch v-model="row.enabled" /></template></el-table-column>
            <el-table-column label="群" min-width="150"><template #default="{ row }"><div>{{ row.group_name || "未命名" }}</div><small class="muted">{{ row.group_id }}</small></template></el-table-column>
            <el-table-column label="人设" min-width="130"><template #default="{ row }"><el-select v-model="row.persona_id" size="mini" clearable placeholder="默认"><el-option v-for="item in personas" :key="item.id" :label="item.enabled ? item.name : `${item.name}（停用）`" :value="item.id" /></el-select></template></el-table-column>
            <el-table-column label="模型" min-width="170"><template #default="{ row }"><el-select v-model="row.model" size="mini" clearable filterable allow-create placeholder="跟随人设"><el-option v-for="name in chatModels" :key="name" :label="name" :value="name" /></el-select></template></el-table-column>
            <el-table-column label="主动回复概率" width="120"><template #default="{ row }"><el-input v-model="row.probabilityText" size="mini" placeholder="全局" /></template></el-table-column>
            <el-table-column label="语音回复" width="120"><template #default="{ row }"><el-select v-model="row.voice_reply" size="mini" clearable placeholder="全局"><el-option v-for="(label, value) in voiceNames" :key="value" :label="label" :value="value" /></el-select></template></el-table-column>
            <el-table-column label="执行器" width="140"><template #default="{ row }"><el-select v-model="row.agent_runner" size="mini" clearable placeholder="全局"><el-option v-for="(label, value) in runnerNames" :key="value" :label="label" :value="value" /></el-select></template></el-table-column>
            <el-table-column label="知识库" min-width="220"><template #default="{ row }"><el-checkbox v-model="row.overrideKb" class="override">覆盖</el-checkbox><el-select v-if="row.overrideKb" v-model="row.kbs" size="mini" multiple placeholder="不使用知识库" class="words"><el-option v-for="kb in knowledgeBases" :key="kb.id" :label="kb.name" :value="kb.id" /></el-select><span v-else class="muted">全局</span></template></el-table-column>
            <el-table-column label="唤醒词" min-width="240"><template #default="{ row }"><el-checkbox v-model="row.overrideWords" class="override">覆盖</el-checkbox><el-select v-if="row.overrideWords" v-model="row.words" size="mini" multiple filterable allow-create default-first-option placeholder="不使用唤醒词" class="words" /><span v-else class="muted">全局</span></template></el-table-column>
            <el-table-column label="" width="90"><template #default="{ row }"><el-button size="mini" type="primary" plain :loading="busy === `group-${row.group_id}`" @click="saveGroup(row)">保存</el-button></template></el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="主动对话" name="proactive" lazy>
        <section class="zx-panel"><AIProactive /></section>
      </el-tab-pane>

      <el-tab-pane label="表情库" name="social" lazy>
        <section class="zx-panel"><AISocial /></section>
      </el-tab-pane>

      <el-tab-pane label="技能" name="skills" lazy>
        <section class="zx-panel"><AISkills /></section>
      </el-tab-pane>

      <el-tab-pane label="知识库" name="knowledge" lazy>
        <section class="zx-panel"><AIKnowledge :providers="providers" /></section>
      </el-tab-pane>

      <el-tab-pane label="角色识别" name="characters" lazy>
        <section class="zx-panel"><AICharacters /></section>
      </el-tab-pane>

      <el-tab-pane label="控制台" name="console" lazy>
        <section class="zx-panel">
          <AgentConsole :personas="personas" :agent-enabled="agent.enabled" :initial-persona="consolePersona" @done="onConsoleDone" />
        </section>
      </el-tab-pane>

      <el-tab-pane name="agent" lazy>
        <span slot="label">Agent</span>
        <section class="zx-panel">
          <div class="zx-section-heading"><div><h2>Agent 权限</h2><p>开启后超级用户的对话可以使用 HTTP 请求、沙箱、MCP 与向用户提问等工具，调用直接执行并记入下方运行记录；普通用户不会获得这些工具。</p><p class="muted">循环次数、并行调用与工具结果长度在「AI 配置 → 运行设置 → Agent」中。<el-button type="text" size="mini" @click="$router.push({ path: '/ai', query: { section: 'settings', tab: 'agent' } })">打开</el-button></p></div><el-button type="primary" size="small" :loading="busy === 'agent'" :disabled="!agentDirty" @click="saveAgent">保存</el-button></div>
          <el-form label-position="top" class="agent-form">
            <el-form-item label="开启 Agent"><el-switch v-model="agentDraft.enabled" /></el-form-item>
          </el-form>
          <el-alert v-if="!agent.sandbox.ready" type="info" :closable="false" show-icon :title="`沙箱不可用（${agent.sandbox.reason}），沙箱工具不会提供给 Agent。`" />
        </section>
        <AIMcp @changed="loadAgent(true)" />
        <section class="zx-panel">
          <div class="zx-section-heading"><div><h2>沙箱</h2><p>Agent 在独立的 Docker 容器中执行代码：每个会话一个容器，不挂载宿主目录，不继承宿主环境变量。</p></div><div class="heading-actions"><el-button size="small" icon="el-icon-refresh" :loading="busy === 'sandbox-load'" @click="loadSandbox()">检测</el-button><el-button type="primary" size="small" :loading="busy === 'sandbox'" :disabled="!sandboxDirty" @click="saveSandbox">保存</el-button></div></div>
          <div class="sandbox-status">
            <span><small class="muted">Docker</small><el-tag size="mini" :type="sandbox.docker.ok ? 'success' : 'danger'">{{ sandbox.docker.ok ? `已连接 ${sandbox.docker.version}` : "不可用" }}</el-tag></span>
            <span><small class="muted">镜像 {{ sandbox.image.name }}</small><el-tag size="mini" :type="sandbox.image.installed ? 'success' : 'warning'">{{ sandbox.image.installed ? `已安装 ${formatBytes(sandbox.image.size)}` : "未安装" }}</el-tag></span>
            <span><small class="muted">状态</small><el-tag size="mini" :type="sandbox.ready ? 'success' : 'info'">{{ sandbox.ready ? "可用" : sandbox.reason || "检测中" }}</el-tag></span>
          </div>
          <el-alert v-if="!sandbox.docker.ok && sandbox.docker.error" type="warning" :closable="false" show-icon :title="sandbox.docker.error" description="请在运行 Bot 的机器上安装并启动 Docker（Windows / macOS 可使用 Docker Desktop），然后点击“检测”。" />
          <div class="sandbox-install">
            <el-button size="small" :disabled="!sandbox.docker.ok || pulling" :loading="pulling" @click="pullImage">{{ sandbox.image.installed ? "重新拉取镜像" : "安装镜像" }}</el-button>
            <el-button size="small" :disabled="!sandbox.image.installed" :loading="busy === 'sandbox-test'" @click="testSandbox">测试运行</el-button>
            <template v-if="pulling"><el-progress :percentage="pullPercent" :stroke-width="10" class="pull-progress" /><small class="muted">{{ sandbox.pull.message }} {{ formatBytes(sandbox.pull.current) }} / {{ formatBytes(sandbox.pull.total) }}</small></template>
            <small v-else-if="sandbox.pull.status === 'done'" class="muted">镜像已安装，用时 {{ sandbox.pull.duration }} 秒</small>
            <small v-else-if="sandbox.pull.status === 'error'" class="error-text">安装失败：{{ sandbox.pull.message }}</small>
          </div>
          <pre v-if="sandboxTest" class="sandbox-output" :class="{ failed: !sandboxTest.ok }">{{ sandboxTest.ok ? "测试通过" : "测试失败" }}（{{ sandboxTest.duration }} 秒）
{{ sandboxTest.output }}</pre>
          <el-form label-position="top" class="agent-form">
            <div class="form-row">
              <el-form-item label="启用沙箱"><el-switch v-model="sandboxDraft.enable_sandbox" /></el-form-item>
              <el-form-item label="允许联网"><el-switch v-model="sandboxDraft.network" /></el-form-item>
            </div>
            <el-form-item label="镜像"><el-input v-model="sandboxDraft.docker_image" size="small" placeholder="python:3.12-slim" class="image-input" /><p class="muted">需要包含 python3；执行 javascript 需要带 node 的镜像。更换后需重新安装。</p></el-form-item>
            <div class="form-row">
              <el-form-item label="CPU（核）"><el-input-number v-model="sandboxDraft.cpus" :min="0.1" :max="64" :step="0.5" :precision="1" size="small" /></el-form-item>
              <el-form-item label="内存（MB）"><el-input-number v-model="sandboxDraft.memory_mb" :min="64" :max="65536" :step="128" size="small" /></el-form-item>
              <el-form-item label="单次执行超时（秒）"><el-input-number v-model="sandboxDraft.exec_timeout" :min="5" :max="3600" size="small" /></el-form-item>
              <el-form-item label="闲置清理（秒，0 不清理）"><el-input-number v-model="sandboxDraft.cleanup_timeout" :min="0" :max="604800" :step="300" size="small" /></el-form-item>
            </div>
          </el-form>
          <p class="muted">资源与网络设置对新建的沙箱生效；清理运行中的沙箱可让新设置立即生效。</p>
          <el-table :data="sandbox.sessions" size="small" empty-text="没有运行中的沙箱">
            <el-table-column prop="key" label="会话" min-width="220" />
            <el-table-column prop="image" label="镜像" min-width="140" />
            <el-table-column label="最近使用" min-width="150"><template #default="{ row }">{{ formatTime(row.last_active * 1000) }}</template></el-table-column>
            <el-table-column label="" width="90"><template #default="{ row }"><el-button size="mini" type="danger" plain :loading="busy === `clean-${row.key}`" @click="cleanSandbox(row.key)">清理</el-button></template></el-table-column>
          </el-table>
          <div v-if="sandbox.sessions.length > 1" class="add-rule"><el-button size="small" type="danger" plain :loading="busy === 'clean-all'" @click="cleanSandbox()">全部清理</el-button></div>
        </section>
        <section class="zx-panel">
          <div class="zx-section-heading"><div><h2>运行记录</h2><p>开启 Agent 后记录超级用户的对话和所有主动发言（插话、任务）的输入、输出、用量与工具调用，保留 30 天；展开一行查看工具参数与结果。</p></div><div class="heading-actions"><el-select v-model="runQuery.source" size="small" clearable placeholder="全部来源" class="run-filter" @change="loadAgent()"><el-option label="QQ" value="qq" /><el-option label="控制台" value="webui" /><el-option v-for="(label, value) in proactiveSources" :key="value" :label="label" :value="value" /></el-select><el-select v-model="runQuery.status" size="small" clearable placeholder="全部状态" class="run-filter" @change="loadAgent()"><el-option v-for="(label, value) in statusNames" :key="value" :label="label" :value="value" /></el-select><el-button size="small" icon="el-icon-refresh" @click="loadAgent()">刷新</el-button></div></div>
          <el-table :data="agent.runs" size="small" row-key="run_id" empty-text="暂无运行记录" @expand-change="loadRun">
            <el-table-column type="expand"><template #default="{ row }"><div class="call-detail">
              <strong>输入</strong><pre>{{ row.input }}</pre><strong>输出</strong><pre>{{ row.error || row.output || "无" }}</pre>
              <strong>工具调用</strong>
              <p v-if="!runCalls[row.run_id]" class="muted">加载中…</p>
              <p v-else-if="!runCalls[row.run_id].length" class="muted">本次没有调用工具。</p>
              <div v-for="call in runCalls[row.run_id] || []" :key="call.id" class="run-call">
                <div><strong>{{ call.tool }}</strong> <el-tag size="mini" :type="decisionTypes[call.decision]">{{ decisionNames[call.decision] || call.decision }}</el-tag><small v-if="call.approver" class="muted"> {{ call.approver }}</small><template v-if="call.decision === 'auto' || call.decision === 'approved'"> <el-tag size="mini" :type="call.is_error ? 'danger' : 'success'">{{ call.is_error ? "失败" : "成功" }}</el-tag><small class="muted"> {{ call.duration }}ms</small></template></div>
                <pre>{{ call.arguments }}</pre><pre v-if="call.result">{{ call.result }}</pre>
              </div>
            </div></template></el-table-column>
            <el-table-column label="时间" min-width="150"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
            <el-table-column label="来源" min-width="150"><template #default="{ row }"><div>{{ row.source === "webui" ? "控制台" : row.group_id ? `群 ${row.group_id}` : "私聊" }}<el-tag v-if="proactiveSources[row.source]" size="mini" class="source-tag">{{ proactiveSources[row.source] }}</el-tag></div><small class="muted">{{ row.user_id }}{{ row.persona ? ` · ${row.persona}` : "" }}</small></template></el-table-column>
            <el-table-column label="输入" min-width="200"><template #default="{ row }"><span class="ellipsis">{{ row.input }}</span></template></el-table-column>
            <el-table-column prop="model" label="模型" min-width="150" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="mini" :type="statusTypes[row.status]">{{ statusNames[row.status] || row.status }}</el-tag></template></el-table-column>
            <el-table-column label="用量" width="150"><template #default="{ row }">{{ row.tools }} 次工具<small class="muted"> · {{ row.tokens }} tokens · {{ (row.duration / 1000).toFixed(1) }}s</small></template></el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="会话" name="sessions" lazy>
        <section class="zx-panel usage">
          <div class="zx-section-heading"><div><h2>今日用量</h2><p>{{ usage.day }} 共 {{ usage.total }} tokens，{{ usage.users }} 位用户</p></div><el-button size="small" icon="el-icon-refresh" @click="loadSessions">刷新</el-button></div>
          <div class="usage-top"><span v-for="item in usage.top.slice(0, 10)" :key="item.user_id"><strong>{{ item.user_id }}</strong>{{ item.tokens }}</span></div>
        </section>
        <section class="zx-panel">
          <div class="zx-section-heading"><div><h2>会话</h2><p>每个群共用一段短期记忆，私聊按用户区分；可查看、导出或重置。</p></div><el-input v-model="sessionQuery.keyword" size="small" clearable placeholder="群号或用户 id" class="search" @change="sessionQuery.page = 1; loadSessions()" /></div>
          <el-table v-loading="sessionLoading" :data="sessions.items" size="small" empty-text="暂无会话">
            <el-table-column label="场景" min-width="120"><template #default="{ row }">{{ row.group_id ? `群 ${row.group_id}` : "私聊" }}</template></el-table-column>
            <el-table-column label="用户" min-width="120"><template #default="{ row }">{{ row.user_id || (row.group_id ? "全群" : "") }}</template></el-table-column>
            <el-table-column prop="messages" label="消息数" width="80" />
            <el-table-column label="最后消息" min-width="160"><template #default="{ row }">{{ formatTime(row.last_at) }}</template></el-table-column>
            <el-table-column label="" width="240"><template #default="{ row }"><el-button size="mini" @click="viewSession(row)">查看</el-button><el-button size="mini" @click="exportSession(row)">导出</el-button><el-button size="mini" type="danger" plain @click="resetSession(row)">重置</el-button></template></el-table-column>
          </el-table>
          <el-pagination layout="total, prev, pager, next" :total="sessions.total" :page-size="sessionQuery.page_size" :current-page.sync="sessionQuery.page" @current-change="loadSessions" />
        </section>
      </el-tab-pane>

      <el-tab-pane label="统计" name="stats" lazy>
        <section class="zx-panel"><AIStats /></section>
      </el-tab-pane>
    </el-tabs>

    <el-dialog :title="detail ? `会话 ${detail.session_id}` : ''" :visible.sync="detailVisible" width="min(760px, 94vw)" append-to-body>
      <div v-if="detail" class="chat-log">
        <div v-for="(item, index) in detail.messages" :key="index" class="chat-line" :class="item.role"><small>{{ roleName(item) }} · {{ formatTime(item.created_at) }}</small><p>{{ item.text }}</p></div>
      </div>
    </el-dialog>

    <UpdateDialog v-if="configModule" :module="configModule" tab="config" @close="configModule = ''" />
  </main>
</template>

<script>
import UpdateDialog from "@/components/plugin/UpdateDialog.vue"
import AgentConsole from "./AgentConsole.vue"
import AIStats from "./AIStats.vue"
import AIProactive from "./AIProactive.vue"
import AISocial from "./AISocial.vue"
import AISkills from "./AISkills.vue"
import AIKnowledge from "./AIKnowledge.vue"
import AICharacters from "./AICharacters.vue"
import AIMcp from "./AIMcp.vue"
import { apiErrorDetail } from "@/utils/api-error"
import { modelProfile } from "@/utils/ai-models"
import { setDirtyState, clearDirtyState } from "@/utils/dirty-state"

const BUILTIN = "ai_chat"
const TABS = ["start", "persona", "groups", "proactive", "social", "knowledge", "characters", "console", "agent", "sessions", "stats"]
const QUIET = { suppressErrorToast: true }
const lines = (text) => text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
const blocks = (text) => text.split(/(?:\r?\n){2,}/).map((item) => item.trim()).filter(Boolean)
const emptyDraft = () => ({ id: null, name: "", enabled: true, prompt: "", style: "", toneText: "", dialogueText: "", model: "", tools: [], limitTools: false, skills: [], limitSkills: false, subagents: [], group_ids: [], user_ids: [], error_message: "", updated_at: null })

export default {
  name: "AIChat",
  components: { UpdateDialog, AgentConsole, AIStats, AIProactive, AISocial, AISkills, AIKnowledge, AICharacters, AIMcp },
  data() {
    return {
      tab: TABS.includes(this.$route.query.tab) ? this.$route.query.tab : "start",
      loading: false, error: "", busy: "", configModule: "",
      providers: [], defaultChat: "", chatEnabled: false, switchRevision: "",
      personas: [], tools: [], skillList: [], knowledgeBases: [], groups: [], groupSearch: "",
      draft: emptyDraft(), original: emptyDraft(), tested: false,
      sessions: { total: 0, items: [] }, sessionQuery: { keyword: "", page: 1, page_size: 20 }, sessionLoading: false,
      usage: { day: "", total: 0, users: 0, top: [] }, detail: null, detailVisible: false,
      consolePersona: null,
      agent: { enabled: false, sandbox: { ready: false, reason: "" }, runs: [] },
      runQuery: { source: "", status: "" }, runCalls: {},
      sandbox: { ready: false, reason: "", docker: { ok: false, version: "", error: "" }, image: { name: "", installed: false }, pull: { status: "idle" }, sessions: [], settings: {} },
      sandboxDraft: {}, sandboxSaved: "", sandboxTest: null,
      agentDraft: { enabled: false }, agentSaved: "", agentTimer: null,
      decisionNames: { auto: "自动放行", approved: "已批准", rejected: "已拒绝", timeout: "超时" }, decisionTypes: { auto: "info", approved: "success", rejected: "danger", timeout: "warning" },
      statusNames: { ok: "完成", silent: "未发言", error: "出错", stopped: "已停止" }, statusTypes: { ok: "success", silent: "info", error: "danger", stopped: "info" },
      proactiveSources: { interject: "插话", task: "任务" },
      voiceNames: { off: "关闭", voice: "语音提问时", always: "总是" },
      runnerNames: { local: "本地 Agent", dsh: "DeepSeek Harness" },
    }
  },
  computed: {
    /**
     * 可选的对话模型，格式为 服务商/模型
     * @returns {string[]} 模型全名
     */
    chatModels() {
      return this.providers.flatMap((provider) => (provider.models || []).filter((model) => model.enabled !== false && modelProfile(model).tasks.includes("chat")).map((model) => `${provider.name}/${model.name}`))
    },
    /**
     * 快速开始清单，每步显示完成状态与跳转或一键操作
     * @returns {object[]} 步骤
     */
    steps() {
      const ready = this.providers.filter((item) => (item.api_keys || []).length)
      const persona = this.personas.find((item) => item.is_default)
      return [
        { key: "provider", title: "配置模型服务商", done: ready.length > 0, description: ready.length ? `已配置 ${ready.length} 个服务商` : "添加服务商并填写 API Key", label: "去配置", run: () => this.$router.push({ path: "/ai", query: { section: "providers" } }) },
        { key: "model", title: "设置默认对话模型", done: Boolean(this.defaultChat), description: this.defaultChat || "未设置；人设也可以单独指定模型", label: "去设置", run: () => this.$router.push({ path: "/ai", query: { section: "routing" } }) },
        { key: "switch", title: "启用 AI 聊天", done: this.chatEnabled, description: this.chatEnabled ? "已启用，可在“聊天设置”中调整唤醒词、分段与配额" : "未启用", label: this.chatEnabled ? "聊天设置" : "启用", run: this.chatEnabled ? () => { this.configModule = BUILTIN } : this.enableBuiltin },
        { key: "persona", title: "设置人设", done: this.personas.length > 0, description: persona ? `${this.personas.length} 个人设，默认「${persona.name}」` : "未设置时使用内置默认人设", label: "管理人设", run: () => { this.tab = "persona" } },
        { key: "test", title: "试聊", done: this.tested, description: "在 WebUI 里先聊几句，确认模型与人设正常", label: "开始试聊", run: () => this.openConsole(persona ? persona.id : null) },
      ]
    },
    agentDirty() { return JSON.stringify(this.agentPayload()) !== this.agentSaved },
    sandboxDirty() { return Boolean(this.sandboxSaved) && JSON.stringify(this.sandboxDraft) !== this.sandboxSaved },
    pulling() { return this.sandbox.pull.status === "running" },
    pullPercent() {
      const { current = 0, total = 0 } = this.sandbox.pull
      return total ? Math.min(100, Math.round((current / total) * 100)) : 0
    },
    personaDirty() { return JSON.stringify(this.draft) !== JSON.stringify(this.original) },
    filteredGroups() {
      const query = this.groupSearch.trim().toLowerCase()
      return query ? this.groups.filter((item) => `${item.group_id} ${item.group_name}`.toLowerCase().includes(query)) : this.groups
    },
  },
  watch: {
    personaDirty(value) { setDirtyState("ai-chat", value) },
    tab(value) {
      if (value === "sessions") this.loadSessions()
      if (value === "persona" && !this.tools.length) this.loadTools().catch(() => {})
      if (value === "persona") this.loadKnowledgeBases().catch(() => {})
      if (value === "agent") { this.loadAgent(); this.loadSandbox() }
      if (value === "console" && !this.agentSaved) this.loadAgent(true)
      clearInterval(this.agentTimer)
      if (value === "agent") this.agentTimer = setInterval(this.refreshAgent, 5000)
    },
  },
  mounted() {
    if (this.$route.query.settings === BUILTIN) this.configModule = BUILTIN
    this.reload()
  },
  beforeDestroy() { clearDirtyState("ai-chat"); clearInterval(this.agentTimer) },
  methods: {
    async request(method, url, data) {
      const response = await this[`${method}Request`](`${this.$root.prefix}/ai${url}`, data, QUIET)
      if (!response.suc) throw new Error(response.info)
      return response
    },
    fail(error, fallback) { this.$message.error(apiErrorDetail(error, fallback)) },
    async reload() {
      if (this.personaDirty && !(await this.confirm("当前人设有未保存的修改。", "放弃修改？"))) return
      this.loading = true; this.error = ""
      try {
        const [config, chatSwitch] = await Promise.all([this.request("get", "/configuration"), this.request("get", "/chat/switch")])
        this.providers = config.data.providers || []; this.defaultChat = config.data.sections?.default_models?.chat || ""
        this.applySwitch(chatSwitch.data)
        await Promise.all([this.loadPersonas(), this.loadGroups(), this.loadTools(), this.loadKnowledgeBases()])
        if (this.tab === "sessions") await this.loadSessions()
        if (this.tab === "agent") await Promise.all([this.loadAgent(), this.loadSandbox()])
        if (this.tab === "console") await this.loadAgent(true)
      } catch (error) { this.error = apiErrorDetail(error, "AI 聊天配置加载失败。") }
      finally { this.loading = false }
    },
    applySwitch(data) { this.chatEnabled = data.enabled; this.switchRevision = data.revision },
    async confirm(message, title) {
      try { await this.$confirm(message, title, { type: "warning" }); return true } catch (_) { return false }
    },
    async enableBuiltin() {
      this.busy = "switch"
      try {
        const response = await this.request("put", "/chat/switch", { expected_revision: this.switchRevision, enabled: true })
        this.applySwitch(response.data); this.$message.success(response.info)
      } catch (error) { this.fail(error, "启用失败。") }
      finally { this.busy = "" }
    },
    async loadPersonas() {
      const response = await this.request("get", "/personas")
      this.personas = response.data
      const selected = this.personas.find((item) => item.id === this.draft.id)
      if (!this.personaDirty || !selected) this.selectPersona(selected || this.personas[0] || null, true)
    },
    /**
     * 选中人设并载入编辑草稿，传空时新建
     * @param {object|null} persona 人设
     * @param {boolean} force 是否跳过未保存修改的确认
     */
    async selectPersona(persona, force = false) {
      if (!force && this.personaDirty && !(await this.confirm("当前人设有未保存的修改。", "放弃修改？"))) return
      const draft = persona ? { id: persona.id, name: persona.name, enabled: persona.enabled, prompt: persona.prompt, style: persona.style, toneText: persona.tone_examples.join("\n"), dialogueText: persona.preset_dialogues.join("\n\n"), model: persona.model || "", tools: [...(persona.tools || [])], limitTools: persona.tools != null, skills: [...(persona.skills || [])], limitSkills: persona.skills != null, subagents: [...(persona.subagents || [])], group_ids: [...persona.group_ids], user_ids: [...persona.user_ids], error_message: persona.error_message || "", updated_at: persona.updated_at } : emptyDraft()
      this.original = { ...draft, is_default: Boolean(persona?.is_default) }
      this.draft = { ...draft, is_default: this.original.is_default }
    },
    async savePersona() {
      const { id, toneText, dialogueText, tools, model, updated_at: expected } = this.draft
      const payload = { name: this.draft.name, prompt: this.draft.prompt, style: this.draft.style, enabled: this.draft.enabled, tone_examples: lines(toneText), preset_dialogues: blocks(dialogueText), tools: this.draft.limitTools ? tools : null, skills: this.draft.limitSkills ? this.draft.skills : null, subagents: this.draft.subagents, model: model || null, group_ids: this.draft.group_ids, user_ids: this.draft.user_ids, error_message: this.draft.error_message, expected_updated_at: expected }
      this.busy = "persona"
      try {
        const response = id ? await this.request("put", `/personas/${id}`, payload) : await this.request("post", "/personas", payload)
        this.$message.success(response.info)
        this.draft = { ...this.original }
        await this.loadPersonas(); await this.loadGroups()
        this.selectPersona(this.personas.find((item) => item.id === response.data.id), true)
      } catch (error) {
        if (error.response?.status === 409) { this.$message.error("人设已被其他操作修改，草稿已保留，请复制修改后重新加载。"); return }
        this.fail(error, "人设保存失败。")
      } finally { this.busy = "" }
    },
    async deletePersona() {
      if (!(await this.confirm(`删除人设「${this.original.name}」？`, "删除人设"))) return
      try {
        await this.request("delete", `/personas/${this.draft.id}`)
        this.draft = { ...this.original }; this.$message.success("人设已删除。")
        await this.loadPersonas(); await this.loadGroups()
      } catch (error) { this.fail(error, "删除失败。") }
    },
    async setDefault() {
      try {
        await this.request("post", `/personas/${this.draft.id}/default`)
        this.$message.success("已设为默认人设。")
        await this.loadPersonas()
      } catch (error) { this.fail(error, "设置失败。") }
    },
    async loadTools() {
      const [tools, skills] = await Promise.all([this.request("get", "/chat/tools"), this.request("get", "/chat/skills")])
      this.tools = tools.data; this.skillList = skills.data
    },
    async loadKnowledgeBases() { this.knowledgeBases = (await this.request("get", "/knowledge/bases")).data },
    async loadGroups() {
      const response = await this.request("get", "/chat/groups")
      this.groups = response.data.map((item) => ({ ...item, model: item.model || "", voice_reply: item.voice_reply || "", agent_runner: item.agent_runner || "", probabilityText: item.active_probability == null ? "" : String(item.active_probability), overrideWords: item.wake_words != null, words: [...(item.wake_words || [])], overrideKb: item.knowledge_bases != null, kbs: [...(item.knowledge_bases || [])] }))
    },
    async saveGroup(row) {
      const text = row.probabilityText.trim()
      const probability = text === "" ? null : Number(text)
      if (probability !== null && !(probability >= 0 && probability <= 1)) { this.$message.error("主动回复概率应在 0 到 1 之间。"); return }
      this.busy = `group-${row.group_id}`
      try {
        const response = await this.request("put", `/chat/groups/${encodeURIComponent(row.group_id)}`, { active_probability: probability, wake_words: row.overrideWords ? row.words : null, model: row.model || null, voice_reply: row.voice_reply || null, agent_runner: row.agent_runner || null, knowledge_bases: row.overrideKb ? row.kbs : null, persona_id: row.persona_id || null, enabled: row.enabled })
        this.$message.success(response.info)
        await this.loadPersonas()
      } catch (error) { this.fail(error, "群设置保存失败。") }
      finally { this.busy = "" }
    },
    /**
     * 加载 Agent 设置与运行记录（按来源与状态筛选）
     * @param {boolean} quiet 是否为定时刷新，定时刷新时不覆盖未保存的设置、不提示错误
     */
    async loadAgent(quiet = false) {
      try {
        const query = Object.fromEntries(Object.entries(this.runQuery).filter(([, value]) => value))
        const data = (await this.request("get", "/chat/agent", query)).data
        const dirty = this.agentSaved && this.agentDirty
        this.agent = data
        if (quiet && dirty) return
        this.agentDraft = { enabled: data.enabled }
        this.agentSaved = JSON.stringify(this.agentPayload())
      } catch (error) { if (!quiet) this.fail(error, "Agent 设置加载失败。") }
    },
    /**
     * 展开运行记录时加载其工具调用
     * @param {object} row 运行记录
     * @param {object[]} expanded 当前展开的行
     */
    async loadRun(row, expanded) {
      if (!expanded.includes(row) || this.runCalls[row.run_id]) return
      try { this.$set(this.runCalls, row.run_id, (await this.request("get", `/chat/agent/runs/${row.run_id}`)).data.calls) }
      catch (error) { this.fail(error, "运行记录加载失败。") }
    },
    agentPayload() { return { enabled: this.agentDraft.enabled } },
    async saveAgent() {
      this.busy = "agent"
      try {
        const response = await this.request("put", "/chat/agent", this.agentPayload())
        this.$message.success(response.info); await this.loadAgent()
      } catch (error) { this.fail(error, "Agent 设置保存失败。") }
      finally { this.busy = "" }
    },
    /**
     * 定时刷新 Agent 页的运行记录；安装镜像或有运行中的沙箱时同时刷新沙箱状态
     */
    refreshAgent() {
      this.loadAgent(true)
      if (this.pulling || this.sandbox.sessions.length) this.loadSandbox(true)
    },
    /**
     * 加载沙箱状态与设置
     * @param {boolean} quiet 是否为定时刷新，定时刷新时不覆盖未保存的设置、不提示错误
     */
    async loadSandbox(quiet = false) {
      if (!quiet) this.busy = "sandbox-load"
      try {
        const data = (await this.request("get", "/sandbox")).data
        const finished = this.pulling && data.pull.status !== "running"
        this.applySandbox(data, quiet && this.sandboxDirty)
        if (finished) this.loadAgent(true)
      } catch (error) { if (!quiet) this.fail(error, "沙箱状态加载失败。") }
      finally { if (!quiet) this.busy = "" }
    },
    /**
     * 更新沙箱状态，并按需重置设置草稿
     * @param {object} data 服务端返回的沙箱状态
     * @param {boolean} keepDraft 是否保留未保存的设置
     */
    applySandbox(data, keepDraft = false) {
      this.sandbox = data
      if (keepDraft) return
      this.sandboxDraft = { ...data.settings }
      this.sandboxSaved = JSON.stringify(this.sandboxDraft)
    },
    async saveSandbox() {
      this.busy = "sandbox"
      try {
        const response = await this.request("put", "/sandbox", this.sandboxDraft)
        this.applySandbox(response.data); this.$message.success(response.info); this.loadAgent(true)
      } catch (error) { this.fail(error, "沙箱设置保存失败。") }
      finally { this.busy = "" }
    },
    async pullImage() {
      try {
        const response = await this.request("post", "/sandbox/pull")
        this.applySandbox(response.data, this.sandboxDirty)
      } catch (error) { this.fail(error, "无法开始安装镜像。") }
    },
    async testSandbox() {
      this.busy = "sandbox-test"; this.sandboxTest = null
      try { this.sandboxTest = (await this.request("post", "/sandbox/test")).data }
      catch (error) { this.fail(error, "测试运行失败。") }
      finally { this.busy = "" }
    },
    /**
     * 删除会话的沙箱容器，不传会话时删除全部
     * @param {string} [key] 会话
     */
    async cleanSandbox(key) {
      this.busy = key ? `clean-${key}` : "clean-all"
      try {
        const query = key ? `?key=${encodeURIComponent(key)}` : ""
        const response = await this.request("delete", `/sandbox/sessions${query}`)
        this.applySandbox(response.data, this.sandboxDirty); this.$message.success(response.info)
      } catch (error) { this.fail(error, "清理失败。") }
      finally { this.busy = "" }
    },
    formatBytes(value) {
      const size = Number(value) || 0
      if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} GB`
      return size >= 1024 ** 2 ? `${(size / 1024 ** 2).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`
    },
    async loadSessions() {
      this.sessionLoading = true
      try {
        const [sessions, usage] = await Promise.all([this.request("get", "/chat/sessions", this.sessionQuery), this.request("get", "/chat/usage")])
        this.sessions = sessions.data; this.usage = usage.data
      } catch (error) { this.fail(error, "会话加载失败。") }
      finally { this.sessionLoading = false }
    },
    sessionUrl(row, raw = false) { return `/chat/sessions/messages?session_id=${encodeURIComponent(row.session_id)}${raw ? "&raw=true" : ""}` },
    async viewSession(row) {
      try { this.detail = (await this.request("get", this.sessionUrl(row))).data; this.detailVisible = true }
      catch (error) { this.fail(error, "会话加载失败。") }
    },
    async exportSession(row) {
      try {
        const data = (await this.request("get", this.sessionUrl(row, true))).data
        const link = document.createElement("a")
        link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
        link.download = `${row.session_id.replace(/:/g, "_")}.json`
        link.click(); URL.revokeObjectURL(link.href)
      } catch (error) { this.fail(error, "导出失败。") }
    },
    async resetSession(row) {
      if (!(await this.confirm("清空该会话的短期记忆？用户下次聊天将从头开始。", "重置会话"))) return
      try {
        const response = await this.request("delete", `/chat/sessions?session_id=${encodeURIComponent(row.session_id)}`)
        this.$message.success(response.info); await this.loadSessions()
      } catch (error) { this.fail(error, "重置失败。") }
    },
    /**
     * 切换到控制台并选中人设
     * @param {number|null} personaId 人设 id，空为默认人设
     */
    openConsole(personaId) { this.consolePersona = personaId; this.tab = "console" },
    onConsoleDone() { this.tested = true },
    roleName(item) { return item.is_summary ? "摘要" : { user: "用户", assistant: "真寻", tool: "工具", system: "系统" }[item.role] || item.role },
    formatTime(value) { return value ? new Date(value).toLocaleString() : "" },
  },
}
</script>

<style scoped>
.ai-chat-page > .el-alert, .chat-tabs .el-alert { margin-bottom: 14px; }
.zx-panel + .zx-panel { margin-top: 14px; }
.muted { color: var(--text-color-secondary); font-size: 12px; }
.full { width: 100%; }
.search { width: 220px; }
.start-steps { list-style: none; margin: 16px 0 0; padding: 0; }
.start-steps li { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-top: 1px solid var(--border-color); }
.step-mark { display: flex; flex: none; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--bg-color-hover); color: var(--text-color-secondary); font-weight: 600; }
.start-steps li.done .step-mark { background: var(--primary-color); color: #fff; }
.step-body { flex: 1; min-width: 0; }
.step-body p { margin: 4px 0 0; color: var(--text-color-secondary); font-size: 13px; overflow-wrap: anywhere; }
.persona-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 14px; align-items: start; }
.persona-list { display: flex; flex-direction: column; gap: 6px; }
.persona-list .full { margin-bottom: 6px; }
.persona-item { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text-color); text-align: left; cursor: pointer; }
.persona-item:hover { background: var(--bg-color-hover); }
.persona-item.active { border-color: var(--primary-color); background: var(--bg-color-hover); }
.persona-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.form-row .el-form-item:has(.el-switch) { max-width: 120px; }
.editor-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.editor-actions .el-button + .el-button { margin-left: 0; }
.spacer { flex: 1; }
.override { margin-right: 8px; }
.words { width: calc(100% - 70px); }
.usage-top { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.usage-top span { padding: 4px 10px; border-radius: 12px; background: var(--bg-color-hover); font-size: 12px; }
.usage-top strong { margin-right: 6px; }
.el-pagination { margin-top: 12px; text-align: right; }
.chat-log { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow-y: auto; }
.chat-line { max-width: 85%; padding: 8px 12px; border-radius: 10px; background: var(--bg-color-hover); }
.chat-line.user { align-self: flex-end; background: var(--primary-color); color: #fff; }
.chat-line.user small { color: rgba(255, 255, 255, 0.8); }
.chat-line.error { color: var(--el-color-danger, #f56c6c); }
.chat-line p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-line small { color: var(--text-color-secondary); font-size: 11px; }
.call-detail pre { margin: 4px 0 8px; padding: 8px 10px; border-radius: 6px; background: var(--bg-color-hover); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow-y: auto; }
.agent-form { max-width: 720px; }
.tools-hint { display: block; line-height: 1.6; }
.heading-actions { display: flex; gap: 8px; }
.heading-actions .el-button + .el-button { margin-left: 0; }
.sandbox-status { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; }
.sandbox-status span { display: flex; align-items: center; gap: 6px; }
.sandbox-install { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0; }
.sandbox-install .el-button + .el-button { margin-left: 0; }
.pull-progress { width: 200px; }
.sandbox-output { margin: 0 0 12px; padding: 8px 10px; border-radius: 6px; background: var(--bg-color-hover); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.sandbox-output.failed, .error-text { color: var(--el-color-danger, #f56c6c); }
.image-input { max-width: 420px; }
.add-rule { display: flex; gap: 8px; margin-top: 10px; }
.add-rule .el-input { max-width: 420px; }
.run-filter { width: 130px; }
.source-tag { margin-left: 4px; }
.run-call { padding: 6px 0; border-top: 1px dashed var(--border-color); }
.ellipsis { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
@media (max-width: 900px) { .persona-layout, .form-row { grid-template-columns: 1fr; } }
</style>

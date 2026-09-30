# 实机测试方案：Codex + Blender MCP

目标：在你的真实 Codex 环境里，用一个真实的 MCP 服务器（Blender MCP）走完
Tripwire 的完整链路，验证它**能拦、不误伤、可回滚**，并为下一步产品化收集真实数据。

原则：**每一步都可回滚，任何时刻都不改变 Blender 或 Codex 的既有可用性。**
先只读观察，再逐步收紧，最后演练回滚。

---

## 0. 前置条件

- Node ≥ 18（当前机器已是 v24.9.0）。
- `npx` / `uvx` 可用（取决于 Blender MCP 的启动方式）。
- Blender 及其 MCP addon 已按官方说明装好，且**能正常工作**（先手动验证一次，排除环境问题）。
- Codex 配置已知位置：`~/.codex/config.toml`（`doctor` 会确认）。

**测试前先记录基线**：把 `~/.codex/config.toml` 复制一份到工作区外保存。
`install --write` 也会自动备份，但双保险。

---

## 1. 安全规则（不可违反）

1. **始终先 `doctor` / 先 dry-run**，确认目标再写。
2. **不要在没有备份的情况下 `--write`**。`install --write` 自带备份，但请先手工再存一份。
3. **测试期间不要同时收紧两处**（不要既 `--enforce block` 又 `denyTools` 一堆），
   否则出问题无法归因。一次只动一个变量。
4. **Blender 的 addon socket 是盲区**：Tripwire 只看 MCP stdio，看不到 addon ↔ Blender 的本地 socket。
   所以本次测试**不能**声称"覆盖了 Blender MCP 的全部网络行为"。
5. 本测试**不引入任何真实恶意样本**。Tripwire 是防御工具，用真实工具的正常行为 + 内置演示 fixture 即可。

---

## 2. 分阶段步骤

### Phase 0 — 环境侦察（只读）

```bash
cd path/to/mcp-tripwire
node src/cli.js doctor
```

预期：`codex` 显示 `[found]`，servers 列出真实条目（当前是 `node_repl`）。
**若 Blender MCP 尚未出现在列表里**，说明它还没被写入 Codex 配置——
那就先在 Codex 里按官方方式加好 Blender MCP 并确认可用，再回到 Phase 1。

判定：doctor 能准确列出你真实的 MCP 服务器 = 解析层在真实配置上正确。

### Phase 1 — 离线审计（不经过 Codex，风险为零）

```bash
node src/cli.js scan --name blender -- uvx blender-mcp
```

（把 `uvx blender-mcp` 换成你实际的启动命令。）

预期输出：server 信息、工具数、sha256、每个工具的描述、以及：
- `execute_blender_code` 一类工具应被标为 `critical/code-execution`；
- 若它有网络/文件相关描述，会同时命中 `network-egress` / `filesystem-*`；
- 若描述里混入不可见字符或指令式语言，会命中静态发现。

观察点：
- [ ] 工具清单与你在 Blender MCP 里预期的一致（说明没有解析丢失）。
- [ ] `execute_blender_code` 被正确识别为 critical。
- [ ] 静态发现是**可解释的**（每条都能指到具体工具与规则）。
- [ ] 退出码：有 critical 时为 2，否则 0。

可能的问题：若 `uvx` 首次运行需要联网拉包，或 MCP server 启动时阻塞等待 Blender 在线，
`scan` 可能超时。对策：先启动 Blender + addon，或临时把 `--timeout` 思路写进下一步验证。

### Phase 2 — 固定基线（TOFU）

```bash
node src/cli.js approve --name blender -- uvx blender-mcp
```

预期：打印 pin 的哈希，写入 `~/.mcp-tripwire/state.json`。
这是之后 rug-pull 检测的基准。

### Phase 3 — 预演接入（只读）

```bash
node src/cli.js install --host codex --server blender
```

预期：打印 `before`（原始命令）与 `after`（包裹后命令），并给出可手贴的 TOML 片段。
**这一步不写任何文件。**

检查：`after` 里应保留你原来的启动命令，只是前面多了一层
`node .../cli.js wrap --name blender --`。

### Phase 4 — 应用接入，先只观察

```bash
node src/cli.js install --host codex --server blender --write
```

预期：备份路径打印出来；配置文件里**只有 blender 段的 command/args 被改**，
其它 section、嵌套 `.env`、注释结构不变（写后会自动校验，失败则自动还原）。

然后**重启 Codex**，正常使用 Blender MCP 一次（让 Codex 加载工具、调用一两个无害工具）。

观察审计：

```bash
cat ~/.mcp-tripwire/audit.jsonl
```

观察清单：
- [ ] 出现 `tripwire-start`，`enforce: "warn"`，`pinned: true`。
- [ ] 出现 `tools-list`，其 `hash` 与 Phase 2 pin 的哈希**一致**，`pin: "match"`。
- [ ] 出现 `tool-risk` 行，`execute_blender_code` 为 critical。
- [ ] 你调用某个工具时，出现对应的 `tools-call` 行（`action: "allow"`）。
- [ ] Blender MCP 功能**完全正常**（这是"不误伤"的核心判据）。

判定：Codex 无感知、Blender MCP 正常、审计完整 = 代理层在真实环境成立。

### Phase 5 — 收紧（一次一个变量）

5a. 先只 deny 高危工具（最小侵入）：

```jsonc
// ~/.mcp-tripwire/policy.json
{ "mode": "warn", "denyTools": ["execute_blender_code"] }
```

重启 Codex，让 Codex 尝试调用 `execute_blender_code`（或直接构造一次调用）。

预期：Tripwire 返回 JSON-RPC 错误，调用被拦，审计出现
`tools-call action:"block" reason:"explicitly-denied"`，且**其余工具不受影响**。

5b. 再验证 rug-pull 检测（模拟工具面被偷换）：

```bash
node src/cli.js approve --name blender --state /tmp/tw-test-state.json -- uvx blender-mcp
# 手工把该 state 里的 hash 改成一个错误值，模拟"已被固定后又变了"
node src/cli.js wrap --name blender --state /tmp/tw-test-state.json -- uvx blender-mcp
```

预期：审计出现 `RUG-PULL-SUSPECTED`（warn 姿态下仅告警）。
把 `--enforce` 改成 `block` 后，`tools/list` 应被整体拦截，宿主拿不到任何工具。

5c. 最后才试 `--enforce strip`，观察含 critical 静态发现的工具是否被从响应中摘除。

### Phase 6 — 回滚演练（必做）

```bash
# 找到备份
ls ~/.codex/config.toml.tripwire-backup-*
# 恢复
cp ~/.codex/config.toml.tripwire-backup-<ts> ~/.codex/config.toml
```

重启 Codex，确认恢复原状。
**回滚必须在你真正依赖这套工具之前演练过一次。**

---

## 3. 判定标准

**PASS**：
- Phase 0/1/2 全部符合预期；
- Phase 4 下 Blender MCP 功能无退化、审计完整、哈希匹配；
- Phase 5a 精确拦截单个工具且不误伤其它；
- Phase 5b 能检出工具面变化；
- Phase 6 回滚后完全恢复。

**PARTIAL**（记录并分析，不急着改）：
- `scan` 超时（多为 server 启动依赖 Blender 在线）；
- 风险分类误报/漏报（词法方法的固有噪声）；
- 某些工具描述被静态扫描误伤（需要调规则阈值）。

**FAIL**：Codex 无法启动被包裹的服务器、或 Blender MCP 功能退化。
→ 立即 Phase 6 回滚，把 `audit.jsonl` 与你的 `config.toml` 备份一并留档分析。

---

## 4. 本次测试**不能**得出的结论（避免自欺）

- ❌ "Tripwire 能防住所有 MCP 攻击"——它只覆盖结构层，语义注入有漏报下限。
- ❌ "Blender MCP 的全部网络行为都被监控"——addon 的本地 socket 是盲区。
- ❌ "服务器进程被关进沙箱了"——P3 之前没有，进程仍以你的权限运行。
- ❌ "在 warn 姿态下拦住了攻击"——warn 只观察不拦截；拦截能力要在 Phase 5 单独验证。

---

## 5. 测试要收集的数据（用于下一轮）

1. `audit.jsonl` 全量（真实工具的哈希、风险分布、调用序列）。
2. `scan --json` 的输出（真实工具描述，用于评估静态规则误报率）。
3. 风险分类在你真实工具集上的命中情况：哪些该报没报、哪些报了是噪声。
4. Codex 包裹后是否有任何行为差异（启动延迟、工具发现缺失）。
5. `install --write` 在你的真实 TOML 上是否一次成功（验证段级改写的稳健性）。

把这五样带回来，P1 的剩余项（工具重名检测、rug-pull 差异视图、策略包）
和静态规则阈值就能基于真实数据来定，而不是拍脑袋。

---

## 6. 后续：HTTP 传输路径的验证（本次不做）

上面的六个阶段只覆盖 **stdio**（Codex + Blender MCP 就是 stdio）。
url 型远程服务器的拦截走 `serve` 反代，代码已实现、帧层已有单测，
但**尚未实机联调**。要验证它，需要一台可连的真实或自建 HTTP MCP 服务器：

1. 用 HTTP 型服务器（或本地自建一个）在宿主里声明 `url`。
2. `mcp-tripwire install --host <host> --server <name>`（预演）→ 检查 `after` 的 url
   是否指向 `http://127.0.0.1:8788/<name>/...`。
3. `--write` 应用，然后 `mcp-tripwire serve`。
4. 观察 `audit.jsonl`：应出现 `transport: "http"` 的 `tools-list` / `tools-call`，
   且哈希固定、静态发现、策略拦截三条链路与 stdio 表现**完全一致**。
5. 旧版 SSE 服务器额外检查：审计里不应出现任何指向真实上游的直连（`endpoint` 已被改写）。

判定标准同 Phase 4/5——拦截生效且功能不退化。**在没有这台服务器之前，不要宣称 HTTP 路径可用。**



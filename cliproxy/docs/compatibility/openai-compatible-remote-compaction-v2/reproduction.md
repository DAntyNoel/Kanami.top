# 复现与验收

## 前提

- 本地入口为 `http://127.0.0.1:12702/v1`。
- 测试模型必须确定路由到 xia。若同名模型存在于多个 provider，应使用隔离配置或唯一别名，不能仅凭模型名推断路由结果。
- API 密钥只通过当前 PowerShell 进程的环境变量提供，不写入脚本、输出文件或 Git。
- 原始 SSE 输出只暂存在系统临时目录；检查脚本不会打印正文和加密内容。

```powershell
$request = 'D:\DAntyNoel\kanami.top\cliproxy\docs\compatibility\openai-compatible-remote-compaction-v2\artifacts\compaction-trigger.request.json'
$inspect = 'D:\DAntyNoel\kanami.top\cliproxy\docs\compatibility\openai-compatible-remote-compaction-v2\artifacts\inspect-compaction-sse.ps1'
$proxyOutput = Join-Path $env:TEMP 'cliproxy-compaction-proxy.sse'
$directOutput = Join-Path $env:TEMP 'cliproxy-compaction-direct.sse'
```

`CLIPROXY_API_KEY` 与 `XIA_API_KEY` 应由操作者在当前进程安全设置。不要把真实值粘进本报告中的命令。

## 修复前的代理侧复现

```powershell
Get-Content -Raw -LiteralPath $request | curl.exe -sS -N `
  -H "Authorization: Bearer $env:CLIPROXY_API_KEY" `
  -H 'Content-Type: application/json' `
  --data-binary '@-' `
  'http://127.0.0.1:12702/v1/responses' `
  -o $proxyOutput

& $inspect -Path $proxyOutput
```

典型故障摘要为 `item_type=message`、`has_encrypted_content=False`，且 `compaction_items=0`。原错误中的 output 总数可能是 1 或 3；决定性条件始终是没有恰好一个 `compaction`。

## 直连 xia 对照

```powershell
Get-Content -Raw -LiteralPath $request | curl.exe -sS -N `
  -H "Authorization: Bearer $env:XIA_API_KEY" `
  -H 'Content-Type: application/json' `
  --data-binary '@-' `
  'https://api.xiaji.site/v1/responses' `
  -o $directOutput

& $inspect -Path $directOutput
```

正确摘要应包含且只包含一个 `item_type=compaction`，并显示 `has_encrypted_content=True`。

## 补丁后的验收

重新构建并只重建 `cli-proxy-api` 服务后，重复代理侧请求。必须同时满足：

1. 上游测试或请求日志证明目标是 `/responses`，不是 `/chat/completions`。
2. 上游收到的 JSON 仍包含顶层 `input[].type="compaction_trigger"`。
3. 下游最终只有一个 `compaction` output item。
4. 该 item 的 `encrypted_content` 非空，但验证输出不打印其值。
5. 将该 `compaction` item 放入下一轮顶层 `input` 后，请求仍走 `/responses`，加密状态不被丢弃，并能得到正常下一轮输出。
6. 普通流式聊天仍走 `/chat/completions` 并能完成。
7. 非流式 `/responses/compact`、OAuth 自动压缩、`/healthz` 与配置持久性不回归。

## 清理

验证完成后删除系统临时目录中的两份原始 SSE 文件；它们可能含模型输出或加密压缩状态，不应长期保留。

```powershell
Remove-Item -LiteralPath $proxyOutput, $directOutput -ErrorAction SilentlyContinue
```

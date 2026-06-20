# 发布与更新

## 首次发布

```bash
cd ~/.pi/agent/extensions/note
git init
git add .
git commit -m "Initial commit: pi note extension v1.0.0"
git tag v1.0.0
git branch -m master main
gh repo create pi-note --public --description "pi 扩展：/note 命令，在开发过程中临时记录想法而不打断当前对话" --source=. --remote=origin --push
```

## 后续更新

```bash
cd ~/.pi/agent/git/github.com/ec50n9/pi-note
# 或 cd ~/.pi/agent/extensions/note（如果用本地副本开发）

# 修改代码后...
git add -A
git commit -m "描述本次改动"

# 打新版本 tag（按语义化版本递增）
git tag v1.0.1
git push origin main --tags
```

## 用户更新到新版本

用户执行以下命令即可升级到指定版本：

```bash
pi install git:github.com/ec50n9/pi-note@v1.0.1
```

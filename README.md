# 门户收录

Chrome 扩展：在浏览时把当前页作为书签条目写入门户源（目标仓库默认分支上的 `public/portal.json`）。

第一版只支持 Chrome 解包加载，不上架，不做 Firefox。

## 加载

需要 Node 的当前 LTS。

```bash
npm install
npm test
npm run build
```

然后打开 `chrome://extensions`，打开「开发者模式」，「加载已解压的扩展程序」，选本仓库根目录（含 `manifest.json` 的那一层）。

快捷键默认建议为 <kbd>Alt</kbd><kbd>Shift</kbd><kbd>L</kbd>，用于打开 Popup。

## 选项

在扩展选项里填写：

- GitHub **owner**
- **仓库**名
- **凭证**：针对该仓库 Contents **读写**权限的细粒度个人访问令牌（PAT）
- **默认标签**：新收录预填，中英文逗号分隔；出厂为「其他」，可改可清空

保存前扩展会 GET `public/portal.json` 测连通。连通失败不会写下配置。凭证只进入 `chrome.storage.local`，不随浏览器账号同步。

细粒度 PAT 的最小范围：只授权这一个仓库，Contents 读与写。不要用过宽的 classic PAT。

尚未填写仓库和凭证时，Popup 只有一句话和「去选项」。

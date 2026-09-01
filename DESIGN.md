---
name: 门户收录
description: 白日档案纸上的收录窗。
colors:
  paper: "#eef0f2"
  sheet: "#f6f7f9"
  ink: "#1f2328"
  ash: "#5d646d"
  ash-deep: "#646b74"
  gold: "#a87b3f"
  gold-soft: "#c99a5b"
  line: "#d8dbe0"
typography:
  sans:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Noto Sans CJK SC, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Noto Sans CJK SC, Segoe UI, system-ui, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 400
    lineHeight: 1.25
  lede:
    fontSize: "14px"
  description:
    fontSize: "13px"
  hint:
    fontSize: "12px"
  label:
    fontSize: "11px"
  gate:
    fontSize: "0.95rem"
rounded:
  none: "0px"
  hairline: "2px"
spacing:
  xs: "0.35rem"
  sm: "0.75rem"
  md: "1.25rem"
---

# Design System: 门户收录

Raindrop 的保存结构，七卷拾光的白日纸。这是门户的收录工具，不是搜索厅，也不是蓝按钮书签管家。

## Overview

**Creative North Star: "短标签在左，标题当主信息，金只作线。"**

Popup 是一张 400px 的档案纸。未配置时只留一句话和「去选项」。配好后：顶栏标明收录或改写，左列短标签，右列站点图标与标题、次行描述、退后的 URL，主按钮在右下。

**Key Characteristics:**

- 只做白日纸，不跟随系统夜间。
- 不加载 webfont；系统无衬线栈。
- 金只作线、点、环与焦点。没有填充主按钮。
- 直角默认，圆角不超过 2px。轮廓用发丝边，不用硬偏移阴影。
- 不要两字碑、七词、货架卡片、Raindrop 蓝按钮。

## Colors

| Token | Day |
| --- | --- |
| paper | `#eef0f2` |
| sheet | `#f6f7f9` |
| ink | `#1f2328` |
| ash | `#5d646d` |
| gold | `#a87b3f` |
| line | `#d8dbe0` |

金不可改。选区是金尘底。输入焦点把底边改金。主操作是墨字加一根金线；禁用时金线消失。

## Typography

系统无衬线。标题 1.12rem / 400，正文 16px，描述 13px，URL 与提示 12px，顶栏与标签 11px。标签与字段名带字距，标题不带。

## Components

- **门（未配置）**：一句说明 + 去选项。没有 PAT 教程。
- **收录窗**：顶栏发丝下是左右栅格。站点图标是 2rem sheet 方块，只从当前 Tab 展示，不写入门户源。描述是标题下的次行：有内容显示一行，空则「添加描述」，点开再编辑，不是折叠面板。URL 落在 sheet 底上，比标题弱。
- **标签**：左列已选可点掉。「添加」打开下拉，只列未选的已有标签（次数降序）；「新建」是另一步，一次确认一个名字。不是主输入框，也不做空格补全。
- **选项**：同一套底边字段。凭证是 password。保存仍在右下。

## Motion

底边与颜色 180ms `cubic-bezier(.22, 1, .36, 1)`。`prefers-reduced-motion` 时关掉过渡。

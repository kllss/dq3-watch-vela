# DQ3 字符映射

`charmap-dq3.json` 派生自 `showa-yojyo/dqutils` 的 `src/dqutils/dq3/charsmall.py`。

- dqutils 使用 MIT 许可证，版权行：`Copyright (c) 2008, 2025 プレハブ小屋`
- 许可证全文见 `LICENSE-dqutils.txt`
- 本文件只包含“字节 → 日文字符”的映射，不包含原版字库图像或 ROM 数据

用途：把 ROM 字符串表（`0xFECFB7`，958 条，`0xAC` 结尾）解码成日文名称。

# OCR JSON 数据协议（唯一规范）

本文件定义海报 OCR 输出、网页导入和未来后端接口共同使用的 **schema_version 1.0**。修改任一端的数据结构前，先更新本文件和版本号，再同步校验与示例。所有时间均为活动地点的当地时间；协议不包含时区，部署时应确保活动与查看者处在相同当地时区，或在后续版本增加时区字段。

## 完整示例

```json
{
  "schema_version": "1.0",
  "event": {
    "title": "7.in XIAMEN Vol.7.0",
    "date": "2026-10-01",
    "venue": "Efive-BOX",
    "doors_time": "13:45",
    "start_time": "14:00"
  },
  "delay_minutes": 0,
  "poster": { "width": 1080, "height": 1528 },
  "groups": [
    {
      "id": "group_001",
      "name": "FZI*TWO",
      "start_time": "14:00",
      "end_time": "14:10",
      "crop": { "x": 0.13, "y": 0.37, "width": 0.2, "height": 0.11 }
    }
  ]
}
```

## 字段与约束

| 路径                            | 类型                | 规则                                                                                                                                                                                                         |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema_version`                | string              | 必填，当前仅接受 `"1.0"`。                                                                                                                                                                                   |
| `event.title`                   | string              | 必填，非空。                                                                                                                                                                                                 |
| `event.date`                    | string              | 必填，真实日历日期，格式 `YYYY-MM-DD`。                                                                                                                                                                      |
| `event.venue`                   | string              | 可选，地点；缺失时界面显示“演出现场”。                                                                                                                                                                       |
| `event.doors_time`              | string              | 可选，`HH:mm`，24 小时制。                                                                                                                                                                                   |
| `event.start_time`              | string              | 可选，`HH:mm`；强烈建议 OCR 提供，它也是跨午夜排程的日期锚点。                                                                                                                                               |
| `delay_minutes`                 | integer             | 可选，缺失视为 0；可正可负，范围 -1440 到 1440。                                                                                                                                                             |
| `poster.width`, `poster.height` | nonnegative integer | OCR 输出必填；读取不到原图尺寸时两者都为 0。旧版手工 JSON 可省略 `poster`。若有尺寸，仅比较与上传海报的宽高比，误差超过 5% 警告但不阻止。                                                                    |
| `groups`                        | array               | 必填，至少一组。导入时按演出开始时刻稳定排序。                                                                                                                                                               |
| `groups[].id`                   | string              | 必填，非空且在活动内唯一。                                                                                                                                                                                   |
| `groups[].name`                 | string              | 必填，非空。                                                                                                                                                                                                 |
| `groups[].start_time`           | string              | 必填，`HH:mm` 或 `""`（OCR 无法确定）；始终表示**原始**时间。空时间放在时间轴末尾并提示核对。                                                                                                                |
| `groups[].end_time`             | string              | 必填，`HH:mm` 或 `""`；时长确定时必须大于 0 且不超过 12 小时。                                                                                                                                               |
| `groups[].image_base64`         | string              | 可选，缺失等同 `""`。只放纯 Base64，不放 `data:` 前缀。空值显示占位图。                                                                                                                                      |
| `groups[].image_mime`           | string              | 可选，默认 `image/jpeg`；支持 `image/jpeg`、`image/png`、`image/webp`、`image/gif`。                                                                                                                         |
| `groups[].crop`                 | object              | OCR 输出必填；旧版手工 JSON 可省略。`x`,`y`,`width`,`height` 是相对于**原始上传海报的 naturalWidth / naturalHeight** 的 0–1 坐标。四项全为 0 表示无法确定，显示占位图；有效矩形的宽高必须大于 0 且不可越界。 |

固定 OCR Prompt 的输出**只有**示例所示字段：不输出 `image_base64` / `image_mime`。网页从用户上传的同一张海报，按归一化 crop 生成临时 Blob 图片 URL，按 `group.id` 绑定到当前活动。为兼容第一阶段数据，手工 JSON 和本地已存活动仍可带 `image_base64` / `image_mime`。不认识的额外字段导入时忽略。OCR 无法确认活动名、日期或团体时间时留空；网页会拒绝缺失活动名或日期的数据，团体时间缺失则在预览提示并允许导入。网页可接受 ChatGPT 包在 ` ```json ... ``` ` 中的合法 JSON。

## 时间语义

- `start_time` / `end_time` 永远是海报上的原始排程，**不能因现场延迟而改写**。
- 实际显示和状态判断使用 `effective_time = original_time + delay_minutes`。当前演出、下一组、进度、倒计时均依此计算。
- 时间区间左闭右开：`effectiveStart <= now < effectiveEnd` 为 `LIVE`；结束时刻开始为 `FINISHED`。
- 跨午夜时，以 `event.date + event.start_time` 为锚点。比活动开始钟点早的团体时间视为次日；例如活动 23:00 开始、团体 00:05 开始表示次日 00:05。`end_time` 早于 `start_time` 表示该组跨午夜；相等则无效。省略 `event.start_time` 时以当日 00:00 为锚点，因此跨午夜活动必须提供它。
- 若单组 `end_time` 早于 `start_time`，网页按跨午夜解析，并在导入确认前提示人工核对。
- 排程空档没有 `LIVE` 团体；界面显示 `INTERMISSION`。演出前显示首组，结束后保留完整时间表。

## OCR Prompt 必须遵守的输出约定

1. 仅输出符合上述结构的 JSON 对象；`schema_version` 固定 `"1.0"`。
2. 按海报原始时间逐组提取，不叠加现场延迟。未知延迟写 0。
3. 时间统一转成两位小时和分钟（如 `09:05`）；活动日期写 `YYYY-MM-DD`。
4. `id` 从 `group_001` 按演出时间连续编号；无法识别的字段留空，不编造。
5. `delay_minutes` 固定为 0；`poster` 放真实输入图片像素尺寸，不知道时宽高都写 0。
6. 每组必须带 `crop`；无法确定时四项全写 0。OCR 不输出图片 Base64，由网页裁剪。

网页内置的固定完整 Prompt 位于 `src/constants/ocrPrompt.ts`，与本节及上面的 JSON 字段保持一致。更改 Prompt、网页或未来后端之前，先更新此协议。

## 导入与存储

网页解析时校验字段、时间、重复 ID、海报尺寸、图片类型和裁剪范围；严重 JSON/关键字段错误不会覆盖现有活动，单个 crop 无效会提示并降级为全 0。无海报仍可导入，图片回退至已有 `image_base64` 或占位图。

个人浏览器版将规范化的 `EventData` 和 `delay_minutes` 保存在当前来源（域名加端口）的 `localStorage`。9998 与 9999 端口的数据互不相通；不同浏览器或设备也不会同步。旧版存储数据缺少 `poster` 或 `crop` 时由网页标准化兼容。现场延迟只影响有效时间，不改写 OCR 原始时间。

上传的原始海报 Blob 保存在当前浏览器的 IndexedDB，按活动与团体排程、crop 的签名关联；延迟不参与签名。裁剪图仍以 `group.id` 对应的运行时 Blob URL 使用，不写回 OCR JSON 或 `localStorage`。刷新后网页读取已存原海报，按归一化坐标重新生成缩略图；切换活动、替换图片和卸载页面时会回收旧 Blob URL。导入无海报活动或恢复 Demo 时删除旧海报。此前版本未保存过的海报需重新上传一次。

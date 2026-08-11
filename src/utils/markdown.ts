/**
 * 轻量 markdown 渲染器（S45，uni 端专用，零依赖）。
 *
 * 选型说明：rich-text 接受 HTML 字符串 nodes；markdown-it 系对小程序端偏重，
 * 这里自绘「块级 + 行内」两级解析，只输出白名单标签（p/h1-h6/ul/ol/li/pre/code/
 * table/blockquote/a/strong/em/del/hr/br），原文一律 HTML 转义后再套标签，
 * 因此天然 XSS 免疫（不依赖 sanitize，raw HTML 根本不会原样进入输出）。
 *
 * 兼容 SSE 增量：未闭合的代码围栏按「持续到文末」渲染；不完整的表格
 * （缺分隔行）退化为普通段落，流式中途不会闪跳。
 */

/* ================= 行内 ================= */

/** 行内代码占位哨兵（私用区字符，用转义序列书写避免不可见字面量被工具链吃掉） */
const SENTINEL = '\uE000';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 行内元素：行内代码 → 链接 → 粗体 → 斜体 → 删除线（输入已转义） */
function renderInline(escaped: string): string {
  let out = escaped;
  // 行内代码（先处理并占位，代码内容不再参与后续强调/链接匹配）
  const codes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `${SENTINEL}${codes.length - 1}${SENTINEL}`;
  });
  // 链接：仅放行 http(s)，其余协议（javascript: 等）降级为纯文本
  out = out.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    if (!/^https?:\/\//i.test(url)) return text;
    return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // 下划线斜体要求两侧非单词字符（避免 snake_case 误伤）；不用后行断言（iOS Safari <16.4 不支持）
  out = out.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 还原行内代码（哨兵包裹的数字与正文数字不会混淆）
  out = out.replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'),
    (_m, i: string) => `<code>${codes[Number(i)]}</code>`,
  );
  return out;
}

/* ================= 块级 ================= */

const TABLE_SEPARATOR = /^\|?[\s:|-]+\|[\s:|-]*$/;

function isTableSeparator(line: string): boolean {
  return TABLE_SEPARATOR.test(line.trim()) && line.includes('-');
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

/** 主入口：markdown → rich-text 可用的 HTML 字符串 */
export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // 空行：跳过（段落边界）
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 围栏代码块（未闭合则持续到文末，适配流式增量）
    const fence = line.trim().match(/^```(\w*)\s*$/);
    if (fence) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1; // 跳过收尾围栏（未闭合时 i 已越界，+1 无害）
      const lang = fence[1] ? ` class="lang-${escapeHtml(fence[1])}"` : '';
      html.push(`<pre${lang}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]!.trim()))}</h${level}>`);
      i += 1;
      continue;
    }

    // 分割线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr/>');
      i += 1;
      continue;
    }

    // 引用块（连续 > 行合并为一段）
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${renderInline(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br/>')}</blockquote>`);
      continue;
    }

    // 表格：当前行 + 下一行是分隔行才认定（流式截断时退化为段落）
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(splitTableRow(lines[i]!));
        i += 1;
      }
      const th = header.map((c) => `<th>${renderInline(escapeHtml(c))}</th>`).join('');
      const trs = rows
        .map((row) => `<tr>${row.map((c) => `<td>${renderInline(escapeHtml(c))}</td>`).join('')}</tr>`)
        .join('');
      html.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }

    // 列表（连续同型项归组；不处理嵌套，层级缩进按平级渲染）
    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.、]\s+/.test(line);
    if (unordered || ordered) {
      const tag = unordered ? 'ul' : 'ol';
      const pattern = unordered ? /^\s*[-*+]\s+/ : /^\s*\d+[.、]\s+/;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i]!)) {
        items.push(lines[i]!.replace(pattern, ''));
        i += 1;
      }
      html.push(`<${tag}>${items.map((it) => `<li>${renderInline(escapeHtml(it))}</li>`).join('')}</${tag}>`);
      continue;
    }

    // 普通段落：连续非空行合并，行间 <br/>
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.、]\s|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]!)
    ) {
      buf.push(lines[i]!);
      i += 1;
    }
    html.push(`<p>${renderInline(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br/>')}</p>`);
  }

  return html.join('');
}

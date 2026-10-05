import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * The Markdown subset models actually write in chat: headings, paragraphs with
 * soft line breaks, bullet and numbered lists, quotes, fenced code, rules, and
 * inline bold / italic / code / links. Nothing is rendered as HTML, so model
 * output can never inject markup. `renderText` gets every plain-text run, which
 * is where the caller turns record references into chips.
 */
export function Markdown({
  content,
  renderText,
}: {
  content: string;
  renderText: (text: string, key: string) => React.ReactNode;
}) {
  return (
    <div className="space-y-2 [&>*:first-child]:mt-0">
      {parseBlocks(content).map((block, index) => (
        <MarkdownBlock key={index} block={block} renderText={renderText} id={String(index)} />
      ))}
    </div>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[]; start: number }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "hr" };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

export function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }
    const list = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null;
    if (list) {
      flush();
      const items: string[] = [];
      const start = list === NUMBERED ? Number(NUMBERED.exec(line)![1]) : 1;
      for (; i < lines.length; i++) {
        const match = list.exec(lines[i]);
        if (match) items.push(match[list === NUMBERED ? 2 : 1]);
        // An indented line continues the previous item.
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += `\n${lines[i].trim()}`;
        } else break;
      }
      i--;
      blocks.push(list === NUMBERED ? { type: "ol", items, start } : { type: "ul", items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++)
        quote.push(lines[i].replace(/^>\s?/, ""));
      i--;
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function MarkdownBlock({
  block,
  renderText,
  id,
}: {
  block: Block;
  renderText: (text: string, key: string) => React.ReactNode;
  id: string;
}) {
  const inline = (text: string, key: string) => (
    <Inline text={text} renderText={renderText} id={key} />
  );
  switch (block.type) {
    case "h":
      return (
        <p className={block.level <= 2 ? "pt-1 text-[15px] font-semibold" : "pt-1 font-semibold"}>
          {inline(block.text, id)}
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.type === "ul" ? "ul" : "ol";
      return (
        <List
          start={block.type === "ol" ? block.start : undefined}
          className={
            block.type === "ul"
              ? "list-disc space-y-1 pl-5 marker:text-muted-foreground"
              : "list-decimal space-y-1 pl-5 marker:text-muted-foreground"
          }
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-0.5">
              {inline(item, `${id}.${index}`)}
            </li>
          ))}
        </List>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 pl-3 text-muted-foreground">
          {inline(block.text, id)}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-muted p-2.5 font-mono text-xs leading-relaxed">
          {block.text}
        </pre>
      );
    case "hr":
      return <hr className="border-border" />;
    default:
      return <p>{inline(block.text, id)}</p>;
  }
}

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(\*[^*\s\n][^*\n]*?\*)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))/g;

function Inline({
  text,
  renderText,
  id,
}: {
  text: string;
  renderText: (text: string, key: string) => React.ReactNode;
  id: string;
}): React.ReactNode {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  const plain = (value: string) => {
    // Soft line breaks inside a paragraph or list item are kept.
    value.split("\n").forEach((line, index) => {
      if (index) out.push(<br key={`${id}-br-${n++}`} />);
      if (line) out.push(renderText(line, `${id}-t-${n++}`));
    });
  };
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    // `[record:…]` looks like a link label; leave it to renderText.
    if (match[5] && match[5].startsWith("[record:")) continue;
    if (index > cursor) plain(text.slice(cursor, index));
    const key = `${id}-i-${n++}`;
    if (match[1]) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2] || match[3]) {
      out.push(
        <strong key={key} className="font-semibold">
          <Inline text={(match[2] ?? match[3]).slice(2, -2)} renderText={renderText} id={key} />
        </strong>,
      );
    } else if (match[4]) {
      out.push(
        <em key={key}>
          <Inline text={match[4].slice(1, -1)} renderText={renderText} id={key} />
        </em>,
      );
    } else if (match[5]) {
      const label = match[5].slice(1, match[5].indexOf("]("));
      const url = match[6];
      out.push(
        <a
          key={key}
          href={url}
          onClick={(event) => {
            event.preventDefault();
            void openUrl(url);
          }}
          className="text-primary underline underline-offset-2"
        >
          {label}
        </a>,
      );
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) plain(text.slice(cursor));
  return <>{out}</>;
}

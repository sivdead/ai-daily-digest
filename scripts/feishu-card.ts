#!/usr/bin/env bun
/**
 * Feishu Card Wrapper for AI Daily Digest
 * 
 * 将 AI Daily Digest 的 Markdown 输出转换为飞书卡片格式
 * 并通过飞书机器人发送
 */

import { readFile } from 'node:fs/promises';

interface Article {
  rank: number;
  title: string;
  link: string;
  source: string;
  score: number;
  category: string;
  summary: string;
  reason: string;
  keywords: string;
}

interface DigestData {
  date: string;
  highlights: string;
  top3: Article[];
  totalArticles: number;
  categories: Record<string, number>;
}

function parseMarkdownDigest(content: string): DigestData {
  const lines = content.split('\n');
  const data: DigestData = {
    date: new Date().toISOString().slice(0, 10),
    highlights: '',
    top3: [],
    totalArticles: 0,
    categories: {}
  };

  let inHighlights = false;
  let inTop3 = false;
  let currentArticle: Partial<Article> = {};
  let articleSection: 'title' | 'meta' | 'summary' | 'reason' | 'keywords' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract date from title
    const dateMatch = line.match(/# .* — (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      data.date = dateMatch[1];
    }

    // Highlights section
    if (line.startsWith('## 📝 今日看点')) {
      inHighlights = true;
      continue;
    }
    if (inHighlights && line.startsWith('---')) {
      inHighlights = false;
      continue;
    }
    if (inHighlights && line.trim() && !line.startsWith('##')) {
      data.highlights += line + '\n';
    }

    // Top 3 articles
    if (line.match(/^## 🏆 今日必读/)) {
      inTop3 = true;
      continue;
    }
    if (inTop3 && line.match(/^## [^🏆]/)) {
      inTop3 = false;
      continue;
    }

    if (inTop3) {
      // Article title with rank
      const titleMatch = line.match(/^🥇?🥈?🥉? \*\*\[(.+?)\]\((.+?)\)\*\*/);
      if (titleMatch) {
        if (currentArticle.title) {
          data.top3.push(currentArticle as Article);
        }
        currentArticle = {
          rank: line.includes('🥇') ? 1 : line.includes('🥈') ? 2 : line.includes('🥉') ? 3 : 0,
          title: titleMatch[1],
          link: titleMatch[2]
        };
        articleSection = 'title';
        continue;
      }

      // Meta line: source, score, category
      const metaMatch = line.match(/📰 (.+?) · ⭐ (\d+)\/\d+ · (.+)/);
      if (metaMatch && articleSection === 'title') {
        currentArticle.source = metaMatch[1];
        currentArticle.score = parseInt(metaMatch[2]);
        currentArticle.category = metaMatch[3];
        articleSection = 'meta';
        continue;
      }

      // Summary
      if (line.startsWith('> ') && articleSection === 'meta') {
        currentArticle.summary = line.slice(2);
        articleSection = 'summary';
        continue;
      }

      // Reason
      const reasonMatch = line.match(/💡 \*\*(.+?)\*\*: (.+)/);
      if (reasonMatch) {
        currentArticle.reason = reasonMatch[2];
        articleSection = 'reason';
        continue;
      }

      // Keywords
      const keywordsMatch = line.match(/🏷️ (.+)/);
      if (keywordsMatch) {
        currentArticle.keywords = keywordsMatch[1];
        articleSection = 'keywords';
        // Save article
        if (currentArticle.title) {
          data.top3.push(currentArticle as Article);
          currentArticle = {};
        }
        continue;
      }
    }

    // Total articles
    const totalMatch = line.match(/\| (\d+) 篇 → (\d+) 篇 \|/);
    if (totalMatch) {
      data.totalArticles = parseInt(totalMatch[2]);
    }
  }

  // Don't forget last article
  if (currentArticle.title) {
    data.top3.push(currentArticle as Article);
  }

  return data;
}

function generateFeishuCard(data: DigestData, fullReportUrl?: string): object {
  const elements: any[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '**📝 今日看点**'
      }
    },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: data.highlights.trim() || '今日精选技术文章已生成，请查看详细报告。'
      }
    },
    { tag: 'hr' },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '**🏆 今日必读 Top 3**'
      }
    }
  ];

  // Add Top 3 articles
  const rankEmojis = ['🥇', '🥈', '🥉'];
  data.top3.slice(0, 3).forEach((article, index) => {
    const rankEmoji = rankEmojis[index] || `${index + 1}.`;
    
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `${rankEmoji} **[${article.title}](${article.link})**`
      }
    });
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📰 ${article.source} · ⭐ ${article.score}/30 · ${article.category}`
      }
    });
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `> ${article.summary?.slice(0, 150)}${article.summary?.length > 150 ? '...' : ''}`
      }
    });
    if (article.reason) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `💡 *${article.reason}*` 
        }
      });
    }
    if (article.keywords) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `🏷️ ${article.keywords}`
        }
      });
    }
    elements.push({ tag: 'hr' });
  });

  // Data overview
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: '**📊 数据概览**'
    }
  });
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `📄 文章总数: ${data.totalArticles} 篇`
    }
  });

  // View full report button
  if (fullReportUrl) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '查看完整报告'
          },
          type: 'primary',
          url: fullReportUrl
        }
      ]
    });
  }

  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: `📰 AI 博客每日精选 — ${data.date}`
      }
    },
    elements
  };
}

async function sendFeishuCard(card: object, webhook: string, userId?: string) {
  const payload: any = {
    msg_type: 'interactive',
    card
  };

  if (userId) {
    // Send to specific user via OpenClaw gateway
    // This would need to be handled by the caller
    console.log(`[feishu-card] Card generated for user: ${userId}`);
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send Feishu card: ${error}`);
  }

  return await response.json();
}

async function main() {
  const args = process.argv.slice(2);
  let markdownPath = '';
  let outputPath = '';
  let webhook = '';
  let userId = '';
  let fullReportUrl = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) {
      markdownPath = args[++i]!;
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i]!;
    } else if (arg === '--webhook' && args[i + 1]) {
      webhook = args[++i]!;
    } else if (arg === '--user-id' && args[i + 1]) {
      userId = args[++i]!;
    } else if (arg === '--report-url' && args[i + 1]) {
      fullReportUrl = args[++i]!;
    }
  }

  if (!markdownPath) {
    console.error('Usage: bun feishu-card.ts --input <digest.md> [--output <card.json>] [--webhook <url>] [--user-id <id>] [--report-url <url>]');
    process.exit(1);
  }

  try {
    const markdown = await readFile(markdownPath, 'utf-8');
    const data = parseMarkdownDigest(markdown);
    const card = generateFeishuCard(data, fullReportUrl);

    if (outputPath) {
      await Bun.write(outputPath, JSON.stringify(card, null, 2));
      console.log(`[feishu-card] Card saved to: ${outputPath}`);
    }

    if (webhook) {
      await sendFeishuCard(card, webhook, userId);
      console.log('[feishu-card] Card sent to Feishu');
    }

    if (!outputPath && !webhook) {
      console.log(JSON.stringify(card, null, 2));
    }
  } catch (error) {
    console.error('[feishu-card] Error:', error);
    process.exit(1);
  }
}

main();

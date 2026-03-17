export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeDisplayText(value) {
  return String(value || "")
    .replace(/（\s*tom chen\s*）/gi, "")
    .replace(/\(\s*tom chen\s*\)/gi, "")
    .replace(/\btom chen\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function truncateText(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) {
    return text;
  }
  return text.slice(0, limit) + "....";
}

export function cardTheme(index) {
  return ["ember", "velvet", "dusk", "azure"][index % 4];
}

export function formatAssistantHtml(value) {
  const escaped = escapeHtml(sanitizeDisplayText(value));
  return escaped
    .replace(/([^\n<>]{0,20}(?:说|轻声道|低声说|笑着说|柔声说|呢喃道))([：:])([“"][^”"]+[”"])/g, function (_, prefix, colon, quoted) {
      return '<span class="speech-lead">' + prefix + colon + "</span>" +
        '<span class="speech-quote">' + quoted + "</span>";
    })
    .replace(/([“"][^”"]+[”"])/g, '<span class="speech-quote">$1</span>')
    .replace(/(轻笑|低笑|浅笑|顿了顿|停了停|抬眼|抿唇|靠近|凑近|压低声音|放轻声音|呼吸|眼神|指尖|耳边|轻轻|慢慢|别急)/g, '<span class="speech-action">$1</span>')
    .replace(/(心口|心跳|发烫|脸颊|耳尖|温热|暧昧|委屈|乖|想你|抱抱|亲亲|喜欢|在意|想听)/g, '<span class="speech-focus">$1</span>')
    .replace(/(嗯|哎呀|好嘛|是吗|真的呀|别闹|乖一点|慢一点)/g, '<span class="speech-emotion">$1</span>')
    .replace(/\n/g, "<br />");
}

export function sleep(ms) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, ms);
  });
}

export function splitForStreaming(value, chunkSize, splitLevel) {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }

  const level = splitLevel || 2;

  // level 1: 不切分，返回整个文本
  if (level === 1) {
    return [text];
  }

  // level 2: 按句号等强分隔符切分（默认逻辑）
  // level 3: 先沿用 level 2，后续再补“表情单独切分”
  const size = Math.max(10, chunkSize || 60);
  const sentenceParts = [];
  let cursor = "";
  const strongDelimiters = "。！？!?；;\n";

  for (const char of text) {
    cursor += char;
    if (strongDelimiters.indexOf(char) >= 0) {
      sentenceParts.push(cursor.trim());
      cursor = "";
    }
  }

  if (cursor.trim()) {
    sentenceParts.push(cursor.trim());
  }

  const chunks = [];
  for (const sentence of sentenceParts) {
    if (!sentence) {
      continue;
    }
    if (sentence.length <= size) {
      chunks.push(sentence);
      continue;
    }

    let rest = sentence;
    while (rest.length > size) {
      let splitAt = -1;
      for (let i = Math.min(size, rest.length - 1); i >= Math.max(8, size - 8); i -= 1) {
        if ("，、,:： ".indexOf(rest[i]) >= 0) {
          splitAt = i + 1;
          break;
        }
      }

      if (splitAt === -1) {
        splitAt = size;
      }

      chunks.push(rest.slice(0, splitAt).trim());
      rest = rest.slice(splitAt).trim();
    }

    if (rest) {
      chunks.push(rest);
    }
  }

  return chunks.filter(Boolean);
}

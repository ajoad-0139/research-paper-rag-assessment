export const canonicalHeader = (h = '') => {
  if (!h) return 'unknown';
  const s = h.toString().trim().toLowerCase();
  const map = {
    approach: 'methodology',
    methods: 'methodology',
    methodology: 'methodology',
    method: 'methodology',
    introduction: 'introduction',
    background: 'background',
    'related work': 'related work',
    results: 'results',
    discussion: 'discussion',
    conclusion: 'conclusion',
    abstract: 'abstract',
    keywords: 'keywords',
  };
  return map[s] ?? s;
};

const cleanupText = (raw) => {
  if (!raw || typeof raw !== 'string') return '';

  let t = raw;

  // 1) Remove hyphenation at line breaks: "power-\nconsumption" => "powerconsumption" or better "power consumption"
  // Replace "-\n" or "-\r\n" (a split word) with empty then add a space between the broken parts
  t = t.replace(/-\s*\n\s*/g, '');

  // 2) Normalize newlines to spaces
  t = t.replace(/\r?\n/g, ' ');

  // 3) Remove common citation patterns: [1], [1,2], (Smith et al., 2020), (Smith, 2020)
  t = t.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, ''); // numeric brackets
  t = t.replace(/\([A-Z][A-Za-z'\-&.\s]+?et al\.,?\s*\d{4}\)/gi, ''); // (Smith et al., 2020)
  t = t.replace(/\([A-Z][A-Za-z'\-&.\s,]{1,60}?,\s*\d{4}\)/g, ''); // (Smith, 2020) or (Smith, Doe, 2020)
  // some residual parens with only digits/doi
  t = t.replace(/\(doi:[^)]+\)/gi, '');
  t = t.replace(/\(http[^\)]*\)/gi, '');

  // 4) Remove lines or fragments that look like figure/table captions, "Figure 1:" or "Table 2."
  // Since we've collapsed newlines, run a regex for "Figure X:" or "Table X:" occurrences
  t = t.replace(/\bFigure\s*\d+[:.]?\s*[^.]{0,200}(?=\s|$)/gi, '');
  t = t.replace(/\bTable\s*\d+[:.]?\s*[^.]{0,200}(?=\s|$)/gi, '');

  // 5) Remove "Keywords:" line or "JEL Classification" etc.
  t = t.replace(/Keywords?:[^.]{0,200}(\.|$)/gi, '');
  t = t.replace(/JEL Classification:[^.]{0,200}(\.|$)/gi, '');

  // 6) Remove emails and URLs
  t = t.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g, '');
  t = t.replace(/https?:\/\/\S+/gi, '');

  // 7) Remove common copyright / publisher footers
  t = t.replace(/(All rights reserved|©|©\s*\d{4}|Published by)[^.\n]*/gi, '');

  // 8) Remove stray multiple punctuation and repeated spaces
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\.{2,}/g, '.');

  // 9) Trim spaces around punctuation
  t = t.replace(/\s+([,;:.?!])/g, '$1');

  // 10) Remove leading or trailing non-alphanumeric garbage
  t = t.replace(/^[^A-Za-z0-9]+/, '');
  t = t.replace(/[^A-Za-z0-9]+$/, '');

  // 11) Collapse multiple spaces one last time and trim
  t = t.replace(/\s{2,}/g, ' ').trim();

  // 12) Ensure the statement ends with punctuation
  if (t && !/[.?!]$/.test(t)) t = t + '.';

  return t;
};

export const organizeSegments = (rawSegments) => {
  if (!Array.isArray(rawSegments)) {
    throw new Error('organizeSegments expects an array of segments');
  }

  const order = [];
  const bucket = new Map();

  for (const seg of rawSegments) {
    if (!seg || (!seg.header && !seg.content)) continue;

    const headerRaw = seg.header ?? 'unknown';
    const header = canonicalHeader(headerRaw);

    if (!bucket.has(header)) {
      order.push(header);
      bucket.set(header, []);
    }

    const content = (seg.content ?? '').toString().trim();
    if (content.length > 0) bucket.get(header).push(content);
  }

  const organized = order.map((hdr) => {
    const parts = bucket.get(hdr) || [];

    const combined = parts.join(' ').trim();

    const cleaned = cleanupText(combined);

    return {
      header: hdr,
      content: cleaned,
    };
  });

  return organized;
};

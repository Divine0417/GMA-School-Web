// Minimal RFC4180-ish CSV parser — handles quoted fields (including embedded
// commas/newlines and "" escaped quotes) without pulling in a dependency for
// what is, in this project, a small internal bulk-upload format.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') pushField();
    else if (char === '\r') continue;
    else if (char === '\n') pushRow();
    else field += char;
  }

  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Parses a question bank CSV with header row:
// questionText,type,marks,option1,option2,option3,option4,correctAnswer
// (options/correctAnswer only meaningful for type=mcq; leave blank for short/essay)
export function parseQuestionsCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { questions: [], errors: ['CSV must have a header row and at least one question'] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);

  const idx = {
    questionText: col('questiontext'),
    type: col('type'),
    marks: col('marks'),
    correctAnswer: col('correctanswer')
  };
  const optionIdxs = [1, 2, 3, 4, 5, 6].map((n) => col(`option${n}`)).filter((i) => i !== -1);

  if (idx.questionText === -1 || idx.type === -1 || idx.marks === -1) {
    return { questions: [], errors: ['CSV header must include questionText, type, and marks columns'] };
  }

  const questions = [];
  const errors = [];

  rows.slice(1).forEach((cells, i) => {
    const rowNum = i + 2;
    const questionText = (cells[idx.questionText] || '').trim();
    const type = (cells[idx.type] || '').trim().toLowerCase();
    const marks = Number(cells[idx.marks]);

    if (!questionText) { errors.push(`Row ${rowNum}: missing questionText`); return; }
    if (!['mcq', 'short', 'essay'].includes(type)) { errors.push(`Row ${rowNum}: type must be mcq, short, or essay`); return; }
    if (!Number.isFinite(marks) || marks <= 0) { errors.push(`Row ${rowNum}: marks must be a positive number`); return; }

    const question = { questionText, type, marks };

    if (type === 'mcq') {
      const options = optionIdxs.map((oi) => (cells[oi] || '').trim()).filter(Boolean);
      const correctAnswer = (cells[idx.correctAnswer] || '').trim();
      if (options.length < 2) { errors.push(`Row ${rowNum}: mcq needs at least 2 options`); return; }
      if (!correctAnswer || !options.includes(correctAnswer)) {
        errors.push(`Row ${rowNum}: correctAnswer must exactly match one of the options`);
        return;
      }
      question.options = options;
      question.correctAnswer = correctAnswer;
    }

    questions.push(question);
  });

  return { questions, errors };
}

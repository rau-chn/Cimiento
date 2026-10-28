export const BIBLE_BOOKS = [
  ['Génesis',50],['Éxodo',40],['Levítico',27],['Números',36],['Deuteronomio',34],
  ['Josué',24],['Jueces',21],['Rut',4],['1 Samuel',31],['2 Samuel',24],['1 Reyes',22],['2 Reyes',25],
  ['1 Crónicas',29],['2 Crónicas',36],['Esdras',10],['Nehemías',13],['Ester',10],['Job',42],['Salmos',150],
  ['Proverbios',31],['Eclesiastés',12],['Cantares',8],['Isaías',66],['Jeremías',52],['Lamentaciones',5],
  ['Ezequiel',48],['Daniel',12],['Oseas',14],['Joel',3],['Amós',9],['Abdías',1],['Jonás',4],['Miqueas',7],
  ['Nahúm',3],['Habacuc',3],['Sofonías',3],['Hageo',2],['Zacarías',14],['Malaquías',4],
  ['Mateo',28],['Marcos',16],['Lucas',24],['Juan',21],['Hechos',28],['Romanos',16],['1 Corintios',16],
  ['2 Corintios',13],['Gálatas',6],['Efesios',6],['Filipenses',4],['Colosenses',4],['1 Tesalonicenses',5],
  ['2 Tesalonicenses',3],['1 Timoteo',6],['2 Timoteo',4],['Tito',3],['Filemón',1],['Hebreos',13],['Santiago',5],
  ['1 Pedro',5],['2 Pedro',3],['1 Juan',5],['2 Juan',1],['3 Juan',1],['Judas',1],['Apocalipsis',22]
].map(([name, chapters], index) => ({ id: index + 1, name, chapters, testament: index < 39 ? 'AT' : 'NT' }));

export const TOTAL_BIBLE_CHAPTERS = BIBLE_BOOKS.reduce((sum, book) => sum + book.chapters, 0);

export function getBook(name) {
  return BIBLE_BOOKS.find(b => b.name === name) ?? null;
}

export function chapterKey(book, chapter) {
  return `${book}::${Number(chapter)}`;
}

export function chaptersForRange(startBook, endBook) {
  const start = BIBLE_BOOKS.findIndex(b => b.name === startBook);
  const end = BIBLE_BOOKS.findIndex(b => b.name === endBook);
  if (start < 0 || end < 0 || start > end) return [];
  const chapters = [];
  for (const book of BIBLE_BOOKS.slice(start, end + 1)) {
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      chapters.push({ book: book.name, chapter, key: chapterKey(book.name, chapter) });
    }
  }
  return chapters;
}

export function uniqueReadChapterKeys(readings) {
  return new Set(readings.map(r => chapterKey(r.book, r.chapter)));
}

export function bookProgress(readings) {
  const read = uniqueReadChapterKeys(readings);
  return BIBLE_BOOKS.map(book => {
    let count = 0;
    for (let ch = 1; ch <= book.chapters; ch++) if (read.has(chapterKey(book.name, ch))) count++;
    return {
      ...book,
      readChapters: count,
      state: count === 0 ? 'unread' : count === book.chapters ? 'done' : 'progress'
    };
  });
}

export function planProgress(plan, readings) {
  const target = chaptersForRange(plan.startBook, plan.endBook);
  const read = uniqueReadChapterKeys(readings);
  const completed = target.filter(ch => read.has(ch.key));
  const total = target.length;
  const completedCount = completed.length;
  return {
    completed: completedCount,
    total,
    percent: total ? Math.round((completedCount / total) * 100) : 0,
    remaining: Math.max(0, total - completedCount),
    estimatedDaysRemaining: plan.chaptersPerDay > 0 ? Math.ceil(Math.max(0, total - completedCount) / plan.chaptersPerDay) : 0
  };
}

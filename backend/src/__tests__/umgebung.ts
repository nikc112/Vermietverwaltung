import { randomBytes } from 'crypto';

// Konfiguration fuer den Testlauf.
//
// Das Geheimnis entsteht bei jedem Lauf neu, statt als Zeichenkette in dieser
// Datei zu stehen. Es war nie ein echtes Geheimnis -- aber es sah aus wie
// eines, und weder ein Werkzeug wie Gitleaks noch ein Mensch, der die Datei
// ueberfliegt, kann diesen Unterschied sehen. Was aussieht wie ein Geheimnis,
// gehoert nicht in ein Repository.
//
// base64 statt hex: 36 Zufallsbytes ergeben 48 Zeichen aus einem Alphabet von
// 64. Damit liegt die Zahl verschiedener Zeichen zuverlaessig ueber den 16, die
// pruefeGeheimnis verlangt. Hex haette nur 16 moegliche Zeichen und faende
// erfahrungsgemaess in jedem vierten Lauf nicht alle davon -- ein Test, der
// gelegentlich grundlos faellt, ist schlimmer als keiner.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= randomBytes(36).toString('base64');
process.env.JWT_EXPIRES_IN ??= '7d';
process.env.NODE_ENV = 'test';
process.env.PDF_STORAGE_PATH ??= './.test-storage/pdfs';
process.env.DOKUMENT_STORAGE_PATH ??= './.test-storage/dokumente';

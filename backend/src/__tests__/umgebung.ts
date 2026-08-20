// Konfiguration fuer den Testlauf. Das Geheimnis ist bewusst zufaellig und
// vielfaeltig genug, um die Pruefung aus utils/jwt zu bestehen -- es ist nur
// fuer Tests bestimmt und wird nirgends ausgeliefert.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'kY7pQz2mVx9RbT4wLn6HsA3jDf8gUeCiOtZ5';
process.env.JWT_EXPIRES_IN ??= '7d';
process.env.NODE_ENV = 'test';
process.env.PDF_STORAGE_PATH ??= './.test-storage/pdfs';
process.env.DOKUMENT_STORAGE_PATH ??= './.test-storage/dokumente';

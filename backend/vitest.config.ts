import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Setzt eine gueltige Konfiguration, bevor irgendein Modul importiert wird.
    // Ohne das ruft src/config.ts beim Import process.exit(1) auf und beendet
    // den gesamten Testlauf, statt nur den betroffenen Test scheitern zu lassen.
    setupFiles: ['src/__tests__/umgebung.ts'],
  },
});

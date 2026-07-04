import Papa from 'papaparse';
import type { DiagramVariable } from '../types/variables';

interface CsvRow {
  Name?: string;
  Value?: string;
}

export function importVariablesCsv(file: File): Promise<DiagramVariable[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        const variables: DiagramVariable[] = [];
        for (const row of results.data) {
          const name = row.Name?.trim();
          if (!name) continue;
          const rawValue = row.Value?.trim() ?? '';
          const numeric = Number(rawValue);
          variables.push({
            id: crypto.randomUUID(),
            name,
            value: Number.isFinite(numeric) && rawValue !== '' ? numeric : rawValue,
            valueType: Number.isFinite(numeric) && rawValue !== '' ? 'number' : 'string',
            source: 'csv',
            updatedAt: Date.now(),
            updatedBy: 'csv-import',
          });
        }
        if (variables.length === 0) reject(new Error('No valid rows found'));
        else resolve(variables);
      },
      error: reject,
    });
  });
}

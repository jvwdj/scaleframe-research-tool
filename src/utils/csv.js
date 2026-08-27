import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export function parseCSV(fileBuffer) {
  try {
    const text = fileBuffer.toString('utf-8');
    const firstLine = text.split('\n')[0];

    // Detect delimiter
    let delimiter = ',';
    if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('\t')) delimiter = '\t';

    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: delimiter,
      relax_column_count: true,
    });
    return { success: true, records };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function validateCSVStructure(records, urlColumn, variables) {
  if (!records || records.length === 0) {
    return { valid: false, error: 'CSV is empty' };
  }

  const columns = Object.keys(records[0]);

  // Check URL column exists
  if (!columns.includes(urlColumn)) {
    return {
      valid: false,
      error: `URL column "${urlColumn}" not found. Available columns: ${columns.join(', ')}`,
    };
  }

  // Check variable references are valid
  const variableRefs = new Set();
  variables.forEach(v => {
    const matches = v.description.match(/\$\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(m => {
        const colName = m.slice(2, -1); // Remove ${ and }
        variableRefs.add(colName);
      });
    }
  });

  const invalidRefs = Array.from(variableRefs).filter(ref => !columns.includes(ref));
  if (invalidRefs.length > 0) {
    return {
      valid: false,
      error: `Invalid column references in variables: ${invalidRefs.join(', ')}`,
    };
  }

  return { valid: true, columnCount: columns.length, rowCount: records.length };
}

export function enrichCSV(records, results, variables) {
  const enriched = records.map((record, idx) => {
    const rowResult = results[idx];
    const enrichedRow = { ...record };

    if (rowResult && rowResult.output_json) {
      const extracted = JSON.parse(rowResult.output_json);
      variables.forEach(v => {
        enrichedRow[v.description] = extracted[v.name] || null;
      });
    } else {
      variables.forEach(v => {
        enrichedRow[v.description] = null;
      });
    }

    return enrichedRow;
  });

  return stringify(enriched, { header: true });
}
